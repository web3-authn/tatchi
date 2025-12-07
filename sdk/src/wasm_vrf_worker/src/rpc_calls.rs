use log::{debug, warn};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use web_sys::{Headers, Request, RequestInit, Response};

use crate::types::VRFChallengeData;
use crate::utils::{base64_url_decode, base64_url_encode};

/// Contract verification result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContractVerificationResult {
    pub success: bool,
    pub verified: bool,
    pub error: Option<String>,
    pub logs: Vec<String>,
}

/// VRF challenge data for contract verification
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VrfData {
    pub vrf_input_data: Vec<u8>,
    pub vrf_output: Vec<u8>,
    pub vrf_proof: Vec<u8>,
    pub public_key: Vec<u8>,
    pub user_id: String,
    pub rp_id: String,
    pub block_height: u64,
    pub block_hash: Vec<u8>,
}

impl TryFrom<&VRFChallengeData> for VrfData {
    type Error = wasm_bindgen::JsValue;

    fn try_from(vrf_challenge: &VRFChallengeData) -> Result<Self, Self::Error> {
        Ok(VrfData {
            vrf_input_data: base64_url_decode(&vrf_challenge.vrf_input).map_err(|e| {
                wasm_bindgen::JsValue::from_str(&format!("Failed to decode VRF input: {}", e))
            })?,
            vrf_output: base64_url_decode(&vrf_challenge.vrf_output).map_err(|e| {
                wasm_bindgen::JsValue::from_str(&format!("Failed to decode VRF output: {}", e))
            })?,
            vrf_proof: base64_url_decode(&vrf_challenge.vrf_proof).map_err(|e| {
                wasm_bindgen::JsValue::from_str(&format!("Failed to decode VRF proof: {}", e))
            })?,
            public_key: base64_url_decode(&vrf_challenge.vrf_public_key).map_err(|e| {
                wasm_bindgen::JsValue::from_str(&format!("Failed to decode VRF public key: {}", e))
            })?,
            user_id: vrf_challenge.user_id.clone(),
            rp_id: vrf_challenge.rp_id.clone(),
            block_height: vrf_challenge.block_height.parse::<u64>().map_err(|e| {
                wasm_bindgen::JsValue::from_str(&format!("Failed to parse block height: {}", e))
            })?,
            block_hash: base64_url_decode(&vrf_challenge.block_hash).map_err(|e| {
                wasm_bindgen::JsValue::from_str(&format!("Failed to decode block hash: {}", e))
            })?,
        })
    }
}

/// WebAuthn authentication data for contract verification (JS-serialized form)
#[wasm_bindgen]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WebAuthnAuthenticationCredential {
    #[wasm_bindgen(getter_with_clone)]
    pub id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "rawId")]
    #[serde(rename = "rawId")]
    pub raw_id: String,
    #[wasm_bindgen(skip)]
    pub response: WebAuthnAuthenticationResponse,
    #[wasm_bindgen(getter_with_clone, js_name = "authenticatorAttachment")]
    #[serde(rename = "authenticatorAttachment")]
    pub authenticator_attachment: Option<String>,
    #[wasm_bindgen(getter_with_clone, js_name = "type")]
    #[serde(rename = "type")]
    pub auth_type: String,
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WebAuthnAuthenticationResponse {
    #[wasm_bindgen(getter_with_clone, js_name = "clientDataJSON")]
    #[serde(rename = "clientDataJSON")]
    pub client_data_json: String,
    #[wasm_bindgen(getter_with_clone, js_name = "authenticatorData")]
    #[serde(rename = "authenticatorData")]
    pub authenticator_data: String,
    #[wasm_bindgen(getter_with_clone)]
    pub signature: String,
    #[wasm_bindgen(getter_with_clone, js_name = "userHandle")]
    #[serde(rename = "userHandle")]
    pub user_handle: Option<String>,
}

/// WebAuthn registration data for contract verification (JS-serialized form)
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WebAuthnRegistrationCredential {
    pub id: String,
    #[serde(rename = "rawId")]
    pub raw_id: String,
    pub response: WebAuthnRegistrationResponse,
    #[serde(rename = "authenticatorAttachment")]
    pub authenticator_attachment: Option<String>,
    #[serde(rename = "type")]
    pub reg_type: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WebAuthnRegistrationResponse {
    #[serde(rename = "clientDataJSON")]
    pub client_data_json: String,
    #[serde(rename = "attestationObject")]
    pub attestation_object: String,
    pub transports: Option<Vec<String>>,
}

pub const VERIFY_AUTHENTICATION_RESPONSE_METHOD: &str = "verify_authentication_response";

/// Perform contract verification via NEAR RPC directly from WASM (VRF-owned)
pub async fn verify_authentication_response_rpc_call(
    contract_id: &str,
    rpc_url: &str,
    vrf_data: VrfData,
    webauthn_authentication_credential: WebAuthnAuthenticationCredential,
) -> Result<ContractVerificationResult, String> {
    let contract_args = serde_json::json!({
        "vrf_data": vrf_data,
        "webauthn_authentication": webauthn_authentication_credential
    });
    let rpc_body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": "verify_from_vrf_worker",
        "method": "query",
        "params": {
            "request_type": "call_function",
            "account_id": contract_id,
            "method_name": VERIFY_AUTHENTICATION_RESPONSE_METHOD,
            "args_base64": base64_standard_encode(contract_args.to_string().as_bytes()),
            "finality": "final"
        }
    });

    debug!("[vrf wasm]: Making verification RPC call to: {}", rpc_url);
    let result = execute_rpc_request(rpc_url, &rpc_body).await?;

    if let Some(error) = result.get("error") {
        let error_msg = error
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Unknown RPC error");
        return Ok(ContractVerificationResult {
            success: false,
            verified: false,
            error: Some(error_msg.to_string()),
            logs: vec![],
        });
    }

    let contract_result = result
        .get("result")
        .ok_or("Missing result in RPC response")?;

    if let Some(error) = contract_result.get("error") {
        let error_msg = if let Some(error_str) = error.as_str() {
            error_str.to_string()
        } else {
            serde_json::to_string(error).unwrap_or_else(|_| "Unknown contract error".to_string())
        };
        warn!("[vrf wasm] Contract execution error: {}", error_msg);
        return Ok(ContractVerificationResult {
            success: false,
            verified: false,
            error: Some(error_msg),
            logs: vec![],
        });
    }

    let result_bytes = contract_result
        .get("result")
        .and_then(|r| r.as_array())
        .ok_or("Missing or invalid result.result array")?;

    let result_u8: Vec<u8> = result_bytes
        .iter()
        .map(|v| v.as_u64().unwrap_or(0) as u8)
        .collect();

    let result_string = String::from_utf8(result_u8)
        .map_err(|e| format!("Failed to decode result string: {}", e))?;

    let contract_response: Value = serde_json::from_str(&result_string)
        .map_err(|e| format!("Failed to parse contract response: {}", e))?;

    let verified = contract_response
        .get("verified")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let logs = contract_result
        .get("logs")
        .and_then(|l| l.as_array())
        .map(|logs_array| {
            logs_array
                .iter()
                .filter_map(|log| log.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    debug!(
        "[vrf wasm] Contract verification result: verified={}, logs={:?}",
        verified, logs
    );

    Ok(ContractVerificationResult {
        success: true,
        verified,
        error: if verified {
            None
        } else {
            Some("Contract verification failed".to_string())
        },
        logs,
    })
}

/// Shared HTTP request execution logic for VRF worker
async fn execute_rpc_request(
    rpc_url: &str,
    rpc_body: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let endpoints: Vec<String> = rpc_url
        .split(|c: char| c == ',' || c.is_whitespace())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect();

    if endpoints.is_empty() {
        return Err("NEAR RPC URL cannot be empty".to_string());
    }

    let headers = Headers::new().map_err(|e| format!("Failed to create headers: {:?}", e))?;
    headers
        .set("Content-Type", "application/json")
        .map_err(|e| format!("Failed to set Content-Type header: {:?}", e))?;

    let opts = RequestInit::new();
    opts.set_method("POST");
    opts.set_headers(&headers);
    opts.set_body(&JsValue::from_str(&rpc_body.to_string()));

    let global = js_sys::global();
    let fetch_fn = js_sys::Reflect::get(&global, &JsValue::from_str("fetch"))
        .map_err(|_| "fetch function not available".to_string())?;
    let fetch_fn = fetch_fn
        .dyn_into::<js_sys::Function>()
        .map_err(|_| "fetch is not a function".to_string())?;

    let mut last_error: Option<String> = None;

    for (index, endpoint) in endpoints.iter().enumerate() {
        let request = match Request::new_with_str_and_init(endpoint, &opts) {
            Ok(req) => req,
            Err(e) => {
                last_error = Some(format!("Failed to create request: {:?}", e));
                continue;
            }
        };

        let fetch_promise = match fetch_fn.call1(&global, &request) {
            Ok(p) => match p.dyn_into::<js_sys::Promise>() {
                Ok(pr) => pr,
                Err(_) => {
                    last_error = Some("fetch did not return a Promise".to_string());
                    continue;
                }
            },
            Err(e) => {
                last_error = Some(format!("fetch call failed: {:?}", e));
                continue;
            }
        };

        let resp_value = match JsFuture::from(fetch_promise).await {
            Ok(v) => v,
            Err(e) => {
                last_error = Some(format!("Fetch request failed: {:?}", e));
                continue;
            }
        };

        let resp: Response = match resp_value.dyn_into() {
            Ok(r) => r,
            Err(e) => {
                last_error = Some(format!("Failed to cast response: {:?}", e));
                continue;
            }
        };

        if !resp.ok() {
            let error_text = match resp.text() {
                Ok(text_promise) => match JsFuture::from(text_promise).await {
                    Ok(text_value) => text_value
                        .as_string()
                        .unwrap_or_else(|| "Unable to get error text".to_string()),
                    Err(_) => "Failed to read error response".to_string(),
                },
                Err(_) => "Could not access error response".to_string(),
            };
            last_error = Some(format!(
                "HTTP error from {}: {} {} - Response: {}",
                endpoint,
                resp.status(),
                resp.status_text(),
                error_text
            ));
            continue;
        }

        let json_promise = match resp.json() {
            Ok(p) => p,
            Err(e) => {
                last_error = Some(format!("Failed to get JSON from response: {:?}", e));
                continue;
            }
        };

        let json_value = match JsFuture::from(json_promise).await {
            Ok(v) => v,
            Err(e) => {
                last_error = Some(format!("Failed to parse JSON: {:?}", e));
                continue;
            }
        };

        let result: Value = match serde_wasm_bindgen::from_value(json_value) {
            Ok(r) => r,
            Err(e) => {
                last_error = Some(format!("Failed to deserialize JSON: {:?}", e));
                continue;
            }
        };

        if index > 0 {
            warn!(
                "[vrf wasm] RPC call succeeded using fallback endpoint: {}",
                endpoint
            );
        }

        return Ok(result);
    }

    Err(last_error.unwrap_or_else(|| "RPC request failed".to_string()))
}

fn base64_standard_encode(data: &[u8]) -> String {
    base64_url_encode(data)
}
