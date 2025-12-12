use log::{debug, warn};
use serde::{Deserialize, Serialize};
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use js_sys::{Array, Reflect};
use web_sys::{Headers, Request, RequestInit, Response};

use crate::types::VRFChallengeData;
use crate::utils::{base64_url_decode, base64_url_encode};

pub const VERIFY_AUTHENTICATION_RESPONSE_METHOD: &str = "verify_authentication_response";

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

#[derive(Serialize)]
struct ContractArgs<'a> {
    vrf_data: &'a VrfData,
    webauthn_authentication: &'a WebAuthnAuthenticationCredential,
}

impl<'a> ContractArgs<'a> {
    /// Serialize to UTF-8 JSON bytes: required format for NEAR RPC calls
    fn to_json_bytes(&self) -> Result<Vec<u8>, String> {
        let val = serde_wasm_bindgen::to_value(self)
            .map_err(|e| format!("Failed to serialize contract args: {}", e))?;
        let json = js_sys::JSON::stringify(&val)
            .map_err(|e| format!("Failed to stringify contract args: {:?}", e))?
            .as_string()
            .ok_or_else(|| "Failed to stringify contract args".to_string())?;
        Ok(json.into_bytes())
    }
}

#[derive(Serialize)]
struct RpcParams<'a> {
    request_type: &'static str,
    account_id: &'a str,
    method_name: &'static str,
    args_base64: String,
    finality: &'static str,
}

#[derive(Serialize)]
struct RpcBody<'a> {
    jsonrpc: &'static str,
    id: &'static str,
    method: &'static str,
    params: RpcParams<'a>,
}

impl<'a> RpcBody<'a> {
    fn to_js_value(&'a mut self) -> Result<JsValue, String> {
        serde_wasm_bindgen::to_value(self)
            .map_err(|e| format!("Failed to serialize RPC body: {}", e))
    }
}

/// Perform contract verification via NEAR RPC directly from WASM (VRF-owned)
pub async fn verify_authentication_response_rpc_call(
    contract_id: &str,
    rpc_url: &str,
    vrf_data: VrfData,
    webauthn_authentication_credential: WebAuthnAuthenticationCredential,
) -> Result<ContractVerificationResult, String> {

    let contract_args_bytes = ContractArgs {
        vrf_data: &vrf_data,
        webauthn_authentication: &webauthn_authentication_credential,
    }.to_json_bytes()?;

    debug!("[vrf wasm]: Making verification RPC call to: {}", rpc_url);
    let result = execute_rpc_request(
        rpc_url,
        &RpcBody {
            jsonrpc: "2.0",
            id: "verify_from_vrf_worker",
            method: "query",
            params: RpcParams {
                request_type: "call_function",
                account_id: contract_id,
                method_name: VERIFY_AUTHENTICATION_RESPONSE_METHOD,
                args_base64: base64_standard_encode(&contract_args_bytes),
                finality: "final",
            },
        }.to_js_value()?
    ).await?;

    // Top-level RPC error
    if let Some(error_msg) = extract_error_message(&result, "error") {
        return Ok(ContractVerificationResult {
            success: false,
            verified: false,
            error: Some(error_msg),
            logs: vec![],
        });
    }

    let contract_result = Reflect::get(&result, &JsValue::from_str("result"))
        .map_err(|e| format!("Failed to read result from RPC response: {:?}", e))?;
    if contract_result.is_undefined() || contract_result.is_null() {
        return Err("Missing result in RPC response".to_string());
    }

    if let Some(error_msg) = extract_error_message(&contract_result, "error") {
        warn!("[vrf wasm] Contract execution error: {}", error_msg);
        return Ok(ContractVerificationResult {
            success: false,
            verified: false,
            error: Some(error_msg),
            logs: vec![],
        });
    }

    let result_bytes_js = Reflect::get(&contract_result, &JsValue::from_str("result"))
        .map_err(|e| format!("Failed to read result.result: {:?}", e))?;
    let result_bytes_arr = Array::from(&result_bytes_js);
    if result_bytes_arr.length() == 0 {
        return Err("Missing or invalid result.result array".to_string());
    }
    let mut result_u8: Vec<u8> = Vec::with_capacity(result_bytes_arr.length() as usize);
    for v in result_bytes_arr.iter() {
        let byte = v.as_f64().ok_or_else(|| "result.result must be an array of numbers".to_string())?;
        result_u8.push(byte as u8);
    }

    let result_string = String::from_utf8(result_u8)
        .map_err(|e| format!("Failed to decode result string: {}", e))?;

    let contract_response = js_sys::JSON::parse(&result_string)
        .map_err(|e| format!("Failed to parse contract response: {:?}", e))?;

    let verified = Reflect::get(&contract_response, &JsValue::from_str("verified"))
        .ok()
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let logs = extract_string_array(&contract_result, "logs");

    let contract_error = extract_error_message(&contract_response, "error");

    debug!(
        "[vrf wasm] Contract verification result: verified={}, logs={:?}",
        verified, logs
    );

    Ok(ContractVerificationResult {
        success: true,
        verified,
        error: if verified { None } else { Some(contract_error.unwrap_or_else(|| "Contract verification failed".to_string())) },
        logs,
    })
}

/// Shared HTTP request execution logic for VRF worker
async fn execute_rpc_request(
    rpc_url: &str,
    rpc_body: &JsValue,
) -> Result<JsValue, String> {
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

    let body_str = js_sys::JSON::stringify(rpc_body)
        .map_err(|e| format!("Failed to stringify RPC body: {:?}", e))?
        .as_string()
        .ok_or_else(|| "Failed to stringify RPC body".to_string())?;
    opts.set_body(&JsValue::from_str(&body_str));

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

        let result = json_value;

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

fn extract_error_message(obj: &JsValue, field: &str) -> Option<String> {
    Reflect::get(obj, &JsValue::from_str(field))
        .ok()
        .and_then(|err| {
            if err.is_undefined() || err.is_null() {
                None
            } else if let Some(s) = err.as_string() {
                Some(s)
            } else {
                Some(format!("{:?}", err))
            }
        })
}

fn extract_string_array(obj: &JsValue, field: &str) -> Vec<String> {
    Reflect::get(obj, &JsValue::from_str(field))
        .ok()
        .and_then(|v| v.dyn_into::<js_sys::Array>().ok())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| item.as_string())
                .collect::<Vec<String>>()
        })
        .unwrap_or_default()
}
