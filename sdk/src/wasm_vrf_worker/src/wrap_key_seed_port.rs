use wasm_bindgen::JsValue;
use web_sys::MessagePort;

/// WrapKeySeed/PRF.second delivery utilities for VRF → Signer secret transfer.
///
/// This module is only compiled for `wasm32` targets. It manages the `MessagePort`
/// map held in `lib.rs` and provides one-shot send semantics.

pub fn take_port(session_id: &str) -> Option<MessagePort> {
    super::WRAP_KEY_SEED_PORTS.with(|map| map.borrow_mut().remove(session_id))
}

pub fn put_port(session_id: &str, port: MessagePort) {
    super::WRAP_KEY_SEED_PORTS.with(|map| {
        let mut m = map.borrow_mut();
        if let Some(old) = m.remove(session_id) {
            old.close();
        }
        m.insert(session_id.to_string(), port);
    });
}

pub fn close_all_ports() {
    super::WRAP_KEY_SEED_PORTS.with(|map| {
        for (_sid, port) in map.borrow_mut().drain() {
            port.close();
        }
    });
}

pub fn send_wrap_key_seed_on_port(
    port: &MessagePort,
    wrap_key_seed_b64u: &str,
    wrap_key_salt_b64u: &str,
    prf_second_b64u: Option<&str>,
) {
    let obj = js_sys::Object::new();
    let _ = js_sys::Reflect::set(&obj, &JsValue::from_str("ok"), &JsValue::TRUE);
    let _ = js_sys::Reflect::set(
        &obj,
        &JsValue::from_str("wrap_key_seed"),
        &JsValue::from_str(wrap_key_seed_b64u),
    );
    let _ = js_sys::Reflect::set(
        &obj,
        &JsValue::from_str("wrapKeySalt"),
        &JsValue::from_str(wrap_key_salt_b64u),
    );
    if let Some(prf_second) = prf_second_b64u {
        let _ = js_sys::Reflect::set(
            &obj,
            &JsValue::from_str("prfSecond"),
            &JsValue::from_str(prf_second),
        );
    }
    let _ = port.post_message(&obj);
}

pub fn send_wrap_key_seed_error_on_port(port: &MessagePort, error: &str) {
    let obj = js_sys::Object::new();
    let _ = js_sys::Reflect::set(&obj, &JsValue::from_str("ok"), &JsValue::FALSE);
    let _ = js_sys::Reflect::set(
        &obj,
        &JsValue::from_str("error"),
        &JsValue::from_str(error),
    );
    let _ = port.post_message(&obj);
}

pub fn send_wrap_key_seed_to_signer(
    session_id: &str,
    wrap_key_seed_b64u: &str,
    wrap_key_salt_b64u: &str,
    prf_second_b64u: Option<&str>,
) {
    if let Some(port) = take_port(session_id) {
        send_wrap_key_seed_on_port(
            &port,
            wrap_key_seed_b64u,
            wrap_key_salt_b64u,
            prf_second_b64u,
        );
        port.close();
    }
}

pub fn send_wrap_key_seed_error_to_signer(session_id: &str, error: &str) {
    if let Some(port) = take_port(session_id) {
        send_wrap_key_seed_error_on_port(&port, error);
        port.close();
    }
}
