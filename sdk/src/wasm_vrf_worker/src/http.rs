use crate::types::http::{
    ShamirApplyServerLockHTTPRequest, ShamirApplyServerLockHTTPResponse,
    ShamirRemoveServerLockHTTPRequest, ShamirRemoveServerLockHTTPResponse,
};
use crate::fetch::{
    fetch_json_post, response_ok, response_status, response_status_text, response_text,
};
use log::debug;

/// POST Shamir 3-pass apply-server-exponent
/// Request: { kek_c_b64u }
/// Response: { kek_cs_b64u }
pub(crate) async fn post_apply_server_lock(
    endpoint_url: &str,
    kek_c_b64u: &str,
) -> Result<ShamirApplyServerLockHTTPResponse, String> {
    debug!("POST endpoint: {}", endpoint_url);

    // Use strongly typed request structure and serialize to JSON string
    let body_js = ShamirApplyServerLockHTTPRequest {
        kek_c_b64u: kek_c_b64u.to_string(),
    }
    .to_js_value();
    let body_str = js_sys::JSON::stringify(&body_js)
        .map_err(|e| format!("Failed to stringify apply-server-lock body: {:?}", e))?
        .as_string()
        .ok_or_else(|| "Failed to stringify apply-server-lock body".to_string())?;

    let resp = fetch_json_post(endpoint_url, &body_str).await?;

    if !response_ok(&resp)? {
        return Err(format!(
            "HTTP error: {} {}",
            response_status(&resp)?,
            response_status_text(&resp)?
        ));
    }

    let response_text = response_text(&resp).await?;

    ShamirApplyServerLockHTTPResponse::from_str(&response_text)
}

/// POST Shamir 3-pass remove-server-exponent
/// Request: { kek_cs_b64u }
/// Response: { kek_c_b64u }
pub(crate) async fn post_remove_server_lock(
    endpoint_url: &str,
    kek_cs_b64u: &str,
    key_id: String,
) -> Result<ShamirRemoveServerLockHTTPResponse, String> {
    debug!("Shamir3Pass remove-server-lock: {}", endpoint_url);

    // Use strongly typed request structure and serialize to JSON string
    let body_js = ShamirRemoveServerLockHTTPRequest {
        kek_cs_b64u: kek_cs_b64u.to_string(),
        key_id,
    }
    .to_js_value();
    let body_str = js_sys::JSON::stringify(&body_js)
        .map_err(|e| format!("Failed to stringify remove-server-lock body: {:?}", e))?
        .as_string()
        .ok_or_else(|| "Failed to stringify remove-server-lock body".to_string())?;

    let resp = fetch_json_post(endpoint_url, &body_str).await?;

    if !response_ok(&resp)? {
        return Err(format!(
            "HTTP error: {} {}",
            response_status(&resp)?,
            response_status_text(&resp)?
        ));
    }

    let response_text = response_text(&resp).await?;

    ShamirRemoveServerLockHTTPResponse::from_str(&response_text)
}
