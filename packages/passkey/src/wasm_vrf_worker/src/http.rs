use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::JsFuture;
use web_sys::{Headers, Request, RequestInit, Response};
use js_sys::{Function, Promise, Reflect};
use log::debug;

fn fetch_with_request_any_global(request: &Request) -> Result<JsFuture, String> {
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

/// Perform HTTP request to the relay server for SRA commutative decryption
/// Returns the `tempEncryptedData` field from the JSON response
/// Note: endpoint_url must be a fully-qualified URL, including the route path
pub(crate) async fn perform_http_request(
    endpoint_url: &str,
    double_encrypted_data: &str,
    temp_public_key: &str,
) -> Result<String, String> {
    debug!("Step 3: Sending double-encrypted data to relay server: {}", endpoint_url);

    // Create headers
    let headers = Headers::new().map_err(|e| format!("Failed to create headers: {:?}", e))?;
    headers
        .set("Content-Type", "application/json")
        .map_err(|e| format!("Failed to set content type: {:?}", e))?;

    // Create request init
    let opts = RequestInit::new();
    opts.set_method("POST");
    opts.set_headers(&headers);

    // Create request body
    let request_body = serde_json::json!({
        "doubleEncryptedData": double_encrypted_data,
        "clientPublicKey": temp_public_key
    });

    let body_str = serde_json::to_string(&request_body)
        .map_err(|e| format!("Failed to serialize request body: {}", e))?;
    opts.set_body(&JsValue::from_str(&body_str));

    // Create request
    let request = Request::new_with_str_and_init(endpoint_url, &opts)
        .map_err(|e| format!("Failed to create request: {:?}", e))?;

    // Get global fetch function (Window or WorkerGlobalScope)
    let resp_value = fetch_with_request_any_global(&request)
        .map_err(|e| format!("{}", e))?
        .await
        .map_err(|e| format!("Fetch failed: {:?}", e))?;

    // Cast response
    let resp: Response = resp_value
        .dyn_into()
        .map_err(|_| "Failed to cast response")?;

    // Check if response is ok
    if !resp.ok() {
        return Err(format!(
            "HTTP error: {} {}",
            resp.status(),
            resp.status_text()
        ));
    }

    // Get response text
    let text_promise = resp
        .text()
        .map_err(|e| format!("Failed to get response text promise: {:?}", e))?;
    let text_value = JsFuture::from(text_promise)
        .await
        .map_err(|e| format!("Failed to get response text: {:?}", e))?;
    let response_text = text_value
        .as_string()
        .ok_or("Response text is not a string")?;

    // Parse JSON response
    let response_json: serde_json::Value = serde_json::from_str(&response_text)
        .map_err(|e| format!("Failed to parse response JSON: {}", e))?;

    // Extract tempEncryptedData
    let temp_encrypted_data = response_json["tempEncryptedData"]
        .as_str()
        .ok_or("Missing tempEncryptedData in response")?;

    Ok(temp_encrypted_data.to_string())
}

/// POST Shamir 3-pass apply-server-exponent
/// Request: { kek_c_b64u }
/// Response: { kek_cs_b64u }
pub(crate) async fn post_apply_server_lock(
    endpoint_url: &str,
    kek_c_b64u: &str,
) -> Result<String, String> {
    debug!("Shamir3Pass apply-server-exponent: {}", endpoint_url);

    let headers = Headers::new().map_err(|e| format!("Failed to create headers: {:?}", e))?;
    headers
        .set("Content-Type", "application/json")
        .map_err(|e| format!("Failed to set content type: {:?}", e))?;

    let opts = RequestInit::new();
    opts.set_method("POST");
    opts.set_headers(&headers);

    let request_body = serde_json::json!({
        "kek_c_b64u": kek_c_b64u,
    });
    let body_str = serde_json::to_string(&request_body)
        .map_err(|e| format!("Failed to serialize request body: {}", e))?;
    opts.set_body(&JsValue::from_str(&body_str));

    let request = Request::new_with_str_and_init(endpoint_url, &opts)
        .map_err(|e| format!("Failed to create request: {:?}", e))?;

    let resp_value = fetch_with_request_any_global(&request)
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

    let response_json: serde_json::Value = serde_json::from_str(&response_text)
        .map_err(|e| format!("Failed to parse response JSON: {}", e))?;

    let out = response_json["kek_cs_b64u"]
        .as_str()
        .ok_or("Missing kek_cs_b64u in response")?;
    Ok(out.to_string())
}

/// POST Shamir 3-pass remove-server-exponent
/// Request: { kek_cs_b64u }
/// Response: { kek_c_b64u }
pub(crate) async fn post_remove_server_lock(
    endpoint_url: &str,
    kek_cs_b64u: &str,
) -> Result<String, String> {
    debug!("Shamir3Pass remove-server-loc: {}", endpoint_url);

    let headers = Headers::new().map_err(|e| format!("Failed to create headers: {:?}", e))?;
    headers
        .set("Content-Type", "application/json")
        .map_err(|e| format!("Failed to set content type: {:?}", e))?;

    let opts = RequestInit::new();
    opts.set_method("POST");
    opts.set_headers(&headers);

    let request_body = serde_json::json!({
        "kek_cs_b64u": kek_cs_b64u,
    });
    let body_str = serde_json::to_string(&request_body)
        .map_err(|e| format!("Failed to serialize request body: {}", e))?;
    opts.set_body(&JsValue::from_str(&body_str));

    let request = Request::new_with_str_and_init(endpoint_url, &opts)
        .map_err(|e| format!("Failed to create request: {:?}", e))?;

    let resp_value = fetch_with_request_any_global(&request)
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

    let response_json: serde_json::Value = serde_json::from_str(&response_text)
        .map_err(|e| format!("Failed to parse response JSON: {}", e))?;

    let out = response_json["kek_c_b64u"]
        .as_str()
        .ok_or("Missing kek_c_b64u in response")?;
    Ok(out.to_string())
}


