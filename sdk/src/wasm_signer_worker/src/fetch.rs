use js_sys::{Function, Object, Promise, Reflect};
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::JsFuture;

pub fn build_json_post_init(body: &str) -> Result<JsValue, String> {
    let init = Object::new();
    Reflect::set(
        &init,
        &JsValue::from_str("method"),
        &JsValue::from_str("POST"),
    )
    .map_err(|_| "Failed to set fetch init.method".to_string())?;

    // Ensure browser cookies/session credentials are sent to the relayer when configured.
    Reflect::set(
        &init,
        &JsValue::from_str("credentials"),
        &JsValue::from_str("include"),
    )
    .map_err(|_| "Failed to set fetch init.credentials".to_string())?;

    let headers = Object::new();
    Reflect::set(
        &headers,
        &JsValue::from_str("Content-Type"),
        &JsValue::from_str("application/json"),
    )
    .map_err(|_| "Failed to set fetch init.headers".to_string())?;
    let headers_val: JsValue = headers.into();
    Reflect::set(&init, &JsValue::from_str("headers"), &headers_val)
        .map_err(|_| "Failed to set fetch init.headers".to_string())?;

    Reflect::set(&init, &JsValue::from_str("body"), &JsValue::from_str(body))
        .map_err(|_| "Failed to set fetch init.body".to_string())?;

    Ok(init.into())
}

pub async fn fetch_with_init(url: &str, init: &JsValue) -> Result<JsValue, String> {
    let global = js_sys::global();
    let fetch_val = Reflect::get(&global, &JsValue::from_str("fetch"))
        .map_err(|_| "fetch function not available".to_string())?;
    let fetch_fn: Function = fetch_val
        .dyn_into()
        .map_err(|_| "fetch is not a function".to_string())?;

    let promise_val = fetch_fn
        .call2(&global, &JsValue::from_str(url), init)
        .map_err(|e| format!("fetch call failed: {:?}", e))?;
    let promise: Promise = promise_val
        .dyn_into()
        .map_err(|_| "fetch did not return a Promise".to_string())?;

    JsFuture::from(promise)
        .await
        .map_err(|e| format!("Fetch request failed: {:?}", e))
}

pub fn response_ok(resp: &JsValue) -> Result<bool, String> {
    Reflect::get(resp, &JsValue::from_str("ok"))
        .map_err(|_| "Failed to read response.ok".to_string())?
        .as_bool()
        .ok_or_else(|| "response.ok is not a boolean".to_string())
}

pub fn response_status(resp: &JsValue) -> Result<u16, String> {
    let v = Reflect::get(resp, &JsValue::from_str("status"))
        .map_err(|_| "Failed to read response.status".to_string())?;
    let n = v
        .as_f64()
        .ok_or_else(|| "response.status is not a number".to_string())?;
    Ok(n as u16)
}

pub fn response_status_text(resp: &JsValue) -> Result<String, String> {
    Reflect::get(resp, &JsValue::from_str("statusText"))
        .map_err(|_| "Failed to read response.statusText".to_string())?
        .as_string()
        .ok_or_else(|| "response.statusText is not a string".to_string())
}

fn call_method0(obj: &JsValue, method: &str) -> Result<Promise, String> {
    let fn_val = Reflect::get(obj, &JsValue::from_str(method))
        .map_err(|_| format!("Failed to read response.{method}"))?;
    let func: Function = fn_val
        .dyn_into()
        .map_err(|_| format!("response.{method} is not a function"))?;
    let ret = func
        .call0(obj)
        .map_err(|e| format!("response.{method}() failed: {:?}", e))?;
    ret.dyn_into::<Promise>()
        .map_err(|_| format!("response.{method}() did not return a Promise"))
}

pub async fn response_text(resp: &JsValue) -> Result<String, String> {
    let promise = call_method0(resp, "text")?;
    let v = JsFuture::from(promise)
        .await
        .map_err(|e| format!("Failed to get response text: {:?}", e))?;
    v.as_string()
        .ok_or_else(|| "Response text is not a string".to_string())
}

pub async fn response_json(resp: &JsValue) -> Result<JsValue, String> {
    let promise = call_method0(resp, "json")?;
    JsFuture::from(promise)
        .await
        .map_err(|e| format!("Failed to parse JSON: {:?}", e))
}
