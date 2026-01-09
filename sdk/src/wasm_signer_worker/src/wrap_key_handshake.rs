use std::cell::RefCell;
use std::collections::HashMap;

use crate::crypto::WrapKey;
use crate::types::worker_messages::WorkerRequestType;
use wasm_bindgen::prelude::*;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::JsCast;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen_futures::JsFuture;
#[cfg(target_arch = "wasm32")]
use web_sys::{MessageEvent, MessagePort};

thread_local! {
    static WRAP_KEY_SEED_SESSIONS: RefCell<HashMap<String, WrapKey>> = RefCell::new(HashMap::new());
    static SESSION_PRF_OUTPUTS: RefCell<HashMap<String, String>> = RefCell::new(HashMap::new());
}

#[cfg(target_arch = "wasm32")]
thread_local! {
    static WRAP_KEY_SEED_WAITERS: RefCell<HashMap<String, Vec<js_sys::Function>>> = RefCell::new(HashMap::new());
    static PRF_SECOND_WAITERS: RefCell<HashMap<String, Vec<js_sys::Function>>> = RefCell::new(HashMap::new());
    static SESSION_MATERIAL_ERRORS: RefCell<HashMap<String, String>> = RefCell::new(HashMap::new());
}

#[cfg(target_arch = "wasm32")]
fn resolve_wrap_key_seed_waiters(session_id: &str, value: &JsValue) {
    WRAP_KEY_SEED_WAITERS.with(|waiters| {
        let mut waiters = waiters.borrow_mut();
        let Some(list) = waiters.remove(session_id) else {
            return;
        };
        for resolve in list {
            let _ = resolve.call1(&JsValue::UNDEFINED, value);
        }
    });
}

#[cfg(target_arch = "wasm32")]
fn resolve_prf_second_waiters(session_id: &str, value: &JsValue) {
    PRF_SECOND_WAITERS.with(|waiters| {
        let mut waiters = waiters.borrow_mut();
        let Some(list) = waiters.remove(session_id) else {
            return;
        };
        for resolve in list {
            let _ = resolve.call1(&JsValue::UNDEFINED, value);
        }
    });
}

/// Attach a MessagePort for a signing session and store WrapKeySeed material in Rust.
/// JS shim should transfer the port; all parsing/caching lives here.
#[wasm_bindgen]
pub fn attach_wrap_key_seed_port(session_id: String, port_val: JsValue) {
    #[cfg(target_arch = "wasm32")]
    {
        let Some(port) = port_val.dyn_ref::<MessagePort>() else {
            // Not a MessagePort; nothing to attach.
            return;
        };

        let sid = session_id.clone();
        let port_for_close = port.clone();
        let on_message = move |event: MessageEvent| {
            let Ok(data) = js_sys::Reflect::get(&event, &JsValue::from_str("data")) else {
                return;
            };

            // New contract: payload is result-like:
            // - success: { ok: true, wrap_key_seed, wrapKeySalt, prfSecond? }
            // - error:   { ok: false, error }
            let ok = js_sys::Reflect::get(&data, &JsValue::from_str("ok"))
                .ok()
                .and_then(|v| v.as_bool());
            if ok == Some(false) {
                let err = js_sys::Reflect::get(&data, &JsValue::from_str("error"))
                    .ok()
                    .and_then(|v| v.as_string())
                    .unwrap_or_else(|| "VRF failed to provide WrapKeySeed".to_string());

                SESSION_MATERIAL_ERRORS.with(|map| {
                    map.borrow_mut().insert(sid.clone(), err.clone());
                });

                let err_js = JsValue::from_str(&err);
                resolve_wrap_key_seed_waiters(&sid, &err_js);
                resolve_prf_second_waiters(&sid, &err_js);
                port_for_close.close();
                return;
            }

            let wrap_key_seed = js_sys::Reflect::get(&data, &JsValue::from_str("wrap_key_seed"))
                .ok()
                .and_then(|v| v.as_string());
            let wrap_key_salt = js_sys::Reflect::get(&data, &JsValue::from_str("wrapKeySalt"))
                .ok()
                .and_then(|v| v.as_string());
            let prf_second = js_sys::Reflect::get(&data, &JsValue::from_str("prfSecond"))
                .ok()
                .and_then(|v| v.as_string());

            if let (Some(seed), Some(salt)) = (wrap_key_seed, wrap_key_salt) {
                SESSION_MATERIAL_ERRORS.with(|map| {
                    map.borrow_mut().remove(&sid);
                });

                WRAP_KEY_SEED_SESSIONS.with(|map| {
                    map.borrow_mut().insert(
                        sid.clone(),
                        WrapKey {
                            wrap_key_seed: seed,
                            wrap_key_salt: salt,
                        },
                    );
                });
                resolve_wrap_key_seed_waiters(&sid, &JsValue::TRUE);

                // Store PRF.second if present (used in Device2 registration flow)
                if let Some(prf_second_b64u) = prf_second {
                    if !prf_second_b64u.is_empty() {
                        SESSION_PRF_OUTPUTS.with(|map| {
                            map.borrow_mut().insert(sid.clone(), prf_second_b64u);
                        });
                        resolve_prf_second_waiters(&sid, &JsValue::TRUE);
                    }
                }
            }
            // One-shot semantics: VRF sends one message and closes its end; close ours too.
            port_for_close.close();
        };

        let closure = Closure::<dyn FnMut(MessageEvent)>::wrap(Box::new(on_message));
        port.set_onmessage(Some(closure.as_ref().unchecked_ref()));
        port.start();
        // Keep the closure alive for the lifetime of the port
        closure.forget();
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = session_id;
        let _ = port_val;
    }
}

fn lookup_wrap_key_shards(
    session_id: &str,
    _request_type: WorkerRequestType,
) -> Result<WrapKey, JsValue> {
    let material = WRAP_KEY_SEED_SESSIONS.with(|map| map.borrow().get(session_id).cloned());
    let Some(mat) = material else {
        return Err(JsValue::from_str(&format!(
            "Missing WrapKeySeed for session {}",
            session_id
        )));
    };

    Ok(mat)
}

fn lookup_prf_second(
    session_id: &str,
    _request_type: WorkerRequestType,
) -> Result<String, JsValue> {
    let prf_second = SESSION_PRF_OUTPUTS.with(|map| map.borrow().get(session_id).cloned());
    let Some(prf) = prf_second else {
        return Err(JsValue::from_str(&format!(
            "Missing PRF.second for session {}",
            session_id
        )));
    };

    Ok(prf)
}

#[cfg(target_arch = "wasm32")]
fn timeout_promise(ms: u32) -> js_sys::Promise {
    js_sys::Promise::new(&mut |resolve, _reject| {
        let global = js_sys::global();
        let set_timeout = js_sys::Reflect::get(&global, &JsValue::from_str("setTimeout"))
            .ok()
            .and_then(|v| v.dyn_into::<js_sys::Function>().ok());
        let Some(set_timeout) = set_timeout else {
            let _ = resolve.call1(&JsValue::UNDEFINED, &JsValue::FALSE);
            return;
        };

        // If setTimeout() fails for any reason, resolve immediately so callers don't hang forever.
        let resolve_clone = resolve.clone();
        let cb = Closure::<dyn FnOnce()>::once(move || {
            let _ = resolve_clone.call1(&JsValue::UNDEFINED, &JsValue::FALSE);
        });
        if set_timeout
            .call2(&global, cb.as_ref(), &JsValue::from_f64(ms as f64))
            .is_ok()
        {
            cb.forget();
        } else {
            let _ = resolve.call1(&JsValue::UNDEFINED, &JsValue::FALSE);
        }
    })
}

#[cfg(target_arch = "wasm32")]
fn wrap_key_seed_waiter_promise(session_id: &str) -> js_sys::Promise {
    let sid = session_id.to_string();
    js_sys::Promise::new(&mut |resolve, _reject| {
        WRAP_KEY_SEED_WAITERS.with(|waiters| {
            waiters
                .borrow_mut()
                .entry(sid.clone())
                .or_default()
                .push(resolve);
        });
    })
}

#[cfg(target_arch = "wasm32")]
fn prf_second_waiter_promise(session_id: &str) -> js_sys::Promise {
    let sid = session_id.to_string();
    js_sys::Promise::new(&mut |resolve, _reject| {
        PRF_SECOND_WAITERS.with(|waiters| {
            waiters
                .borrow_mut()
                .entry(sid.clone())
                .or_default()
                .push(resolve);
        });
    })
}

/// Await WrapKeySeed material inside the signer worker.
///
/// This removes the need for any main-thread "seed ready" synchronization:
/// the signer worker can receive a signing request first and then block until
/// the VRF worker delivers WrapKeySeed over the attached MessagePort.
#[cfg(target_arch = "wasm32")]
async fn await_wrap_key_shards(
    session_id: &str,
    request_type: WorkerRequestType,
    timeout_ms: u32,
) -> Result<WrapKey, JsValue> {
    let error = SESSION_MATERIAL_ERRORS.with(|map| map.borrow().get(session_id).cloned());
    if let Some(err) = error {
        return Err(JsValue::from_str(&err));
    }

    if let Ok(mat) = lookup_wrap_key_shards(session_id, request_type) {
        return Ok(mat);
    }

    let seed_promise = wrap_key_seed_waiter_promise(session_id);
    let race_inputs = js_sys::Array::new();
    race_inputs.push(&seed_promise);
    race_inputs.push(&timeout_promise(timeout_ms));
    let raced = js_sys::Promise::race(&race_inputs);
    let result = JsFuture::from(raced).await?;

    // Timeout promise resolves with `false`.
    if result.as_bool() == Some(false) {
        return Err(JsValue::from_str(&format!(
            "Timed out waiting for WrapKeySeed for session {}",
            session_id
        )));
    }
    if let Some(err) = result.as_string() {
        return Err(JsValue::from_str(&err));
    }

    lookup_wrap_key_shards(session_id, request_type).map_err(|_| {
        JsValue::from_str(&format!(
            "WrapKeySeed waiter resolved but WrapKeySeed still missing for session {}",
            session_id
        ))
    })
}

#[cfg(target_arch = "wasm32")]
async fn await_prf_second(
    session_id: &str,
    request_type: WorkerRequestType,
    timeout_ms: u32,
) -> Result<String, JsValue> {
    let error = SESSION_MATERIAL_ERRORS.with(|map| map.borrow().get(session_id).cloned());
    if let Some(err) = error {
        return Err(JsValue::from_str(&err));
    }

    if let Ok(v) = lookup_prf_second(session_id, request_type) {
        return Ok(v);
    }

    let prf_promise = prf_second_waiter_promise(session_id);
    let race_inputs = js_sys::Array::new();
    race_inputs.push(&prf_promise);
    race_inputs.push(&timeout_promise(timeout_ms));
    let raced = js_sys::Promise::race(&race_inputs);
    let result = JsFuture::from(raced).await?;

    if result.as_bool() == Some(false) {
        return Err(JsValue::from_str(&format!(
            "Timed out waiting for PRF.second for session {}",
            session_id
        )));
    }
    if let Some(err) = result.as_string() {
        return Err(JsValue::from_str(&err));
    }

    lookup_prf_second(session_id, request_type).map_err(|_| {
        JsValue::from_str(&format!(
            "PRF.second waiter resolved but PRF.second still missing for session {}",
            session_id
        ))
    })
}

#[cfg(target_arch = "wasm32")]
pub(crate) async fn get_wrap_key_shards(
    session_id: &str,
    request_type: WorkerRequestType,
    timeout_ms: u32,
) -> Result<WrapKey, JsValue> {
    await_wrap_key_shards(session_id, request_type, timeout_ms).await
}

#[cfg(not(target_arch = "wasm32"))]
pub(crate) async fn get_wrap_key_shards(
    session_id: &str,
    request_type: WorkerRequestType,
    _timeout_ms: u32,
) -> Result<WrapKey, JsValue> {
    lookup_wrap_key_shards(session_id, request_type)
}

#[cfg(target_arch = "wasm32")]
pub(crate) async fn get_prf_second_b64u(
    session_id: &str,
    request_type: WorkerRequestType,
    timeout_ms: u32,
) -> Result<String, JsValue> {
    await_prf_second(session_id, request_type, timeout_ms).await
}

#[cfg(not(target_arch = "wasm32"))]
pub(crate) async fn get_prf_second_b64u(
    session_id: &str,
    request_type: WorkerRequestType,
    _timeout_ms: u32,
) -> Result<String, JsValue> {
    lookup_prf_second(session_id, request_type)
}
