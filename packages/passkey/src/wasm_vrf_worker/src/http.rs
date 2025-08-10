use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::JsFuture;
use web_sys::{Headers, Request, RequestInit, Response};
use js_sys::{Function, Promise, Reflect};
use log::debug;
use crate::types::http::{
    ShamirApplyServerLockHTTPRequest,
    ShamirApplyServerLockHTTPResponse,
    ShamirRemoveServerLockHTTPRequest,
    ShamirRemoveServerLockHTTPResponse
};

fn fetch_global(request: &Request) -> Result<JsFuture, String> {
    if let Some(window) = web_sys::window() {
        return Ok(JsFuture::from(window.fetch_with_request(request)));
    }
    // Fallback for Web Worker environments: call globalThis.fetch(request)
    let global = js_sys::global();
    let fetch_val = Reflect::get(&global, &JsValue::from_str("fetch"))
        .map_err(|_| "global.fetch not found".to_string())?;
    let fetch_fn = fetch_val.dyn_ref::<Function>()
        .ok_or_else(|| "global.fetch is not a function".to_string())?;
    let promise_val = fetch_fn
        .call1(&global, request)
        .map_err(|e| format!("fetch call failed: {:?}", e))?;
    let promise = Promise::from(promise_val);
    Ok(JsFuture::from(promise))
}

/// POST Shamir 3-pass apply-server-exponent
/// Request: { kek_c_b64u }
/// Response: { kek_cs_b64u }
pub(crate) async fn post_apply_server_lock(
    endpoint_url: &str,
    kek_c_b64u: &str,
) -> Result<ShamirApplyServerLockHTTPResponse, String> {
    debug!("POST endpoint: {}", endpoint_url);

    let headers = Headers::new().map_err(|e| format!("Failed to create headers: {:?}", e))?;
    headers
        .set("Content-Type", "application/json")
        .map_err(|e| format!("Failed to set content type: {:?}", e))?;

    let opts = RequestInit::new();
    opts.set_method("POST");
    opts.set_headers(&headers);

    // Use strongly typed request structure
    opts.set_body(
        &ShamirApplyServerLockHTTPRequest {
            kek_c_b64u: kek_c_b64u.to_string(),
        }.to_js_value()
    );

    let request = Request::new_with_str_and_init(endpoint_url, &opts)
        .map_err(|e| format!("Failed to create request: {:?}", e))?;

    let resp_value = fetch_global(&request)
        .map_err(|e| format!("{}", e))?
        .await
        .map_err(|e| format!("Fetch failed: {:?}", e))?;

    let resp: Response = resp_value
        .dyn_into()
        .map_err(|_| "Failed to cast response")?;

    if !resp.ok() {
        return Err(format!("HTTP error: {} {}", resp.status(), resp.status_text()));
    }

    let text_promise = resp
        .text()
        .map_err(|e| format!("Failed to get response text promise: {:?}", e))?;
    let text_value = JsFuture::from(text_promise)
        .await
        .map_err(|e| format!("Failed to get response text: {:?}", e))?;
    let response_text = text_value
        .as_string()
        .ok_or("Response text is not a string")?;

    ShamirApplyServerLockHTTPResponse::from_str(&response_text)
}

/// POST Shamir 3-pass remove-server-exponent
/// Request: { kek_cs_b64u }
/// Response: { kek_c_b64u }
pub(crate) async fn post_remove_server_lock(
    endpoint_url: &str,
    kek_cs_b64u: &str,
) -> Result<ShamirRemoveServerLockHTTPResponse, String> {
    debug!("Shamir3Pass remove-server-lock: {}", endpoint_url);

    let headers = Headers::new().map_err(|e| format!("Failed to create headers: {:?}", e))?;
    headers
        .set("Content-Type", "application/json")
        .map_err(|e| format!("Failed to set content type: {:?}", e))?;

    let opts = RequestInit::new();
    opts.set_method("POST");
    opts.set_headers(&headers);

    // Use strongly typed request structure
    opts.set_body(
        &ShamirRemoveServerLockHTTPRequest {
            kek_cs_b64u: kek_cs_b64u.to_string(),
        }.to_js_value()
    );

    let request = Request::new_with_str_and_init(endpoint_url, &opts)
        .map_err(|e| format!("Failed to create request: {:?}", e))?;

    let resp_value = fetch_global(&request)
        .map_err(|e| format!("{}", e))?
        .await
        .map_err(|e| format!("Fetch failed: {:?}", e))?;

    let resp: Response = resp_value
        .dyn_into()
        .map_err(|_| "Failed to cast response")?;

    if !resp.ok() {
        return Err(format!("HTTP error: {} {}", resp.status(), resp.status_text()));
    }

    let text_promise = resp
        .text()
        .map_err(|e| format!("Failed to get response text promise: {:?}", e))?;
    let text_value = JsFuture::from(text_promise)
        .await
        .map_err(|e| format!("Failed to get response text: {:?}", e))?;
    let response_text = text_value
        .as_string()
        .ok_or("Response text is not a string")?;

    ShamirRemoveServerLockHTTPResponse::from_str(&response_text)
}


