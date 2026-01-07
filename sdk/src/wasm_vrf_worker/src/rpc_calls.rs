use js_sys::{Array, Reflect};
use log::{debug, warn};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;

use crate::fetch::{
    build_json_post_init, fetch_with_init, response_json, response_ok, response_status,
    response_status_text, response_text,
};

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
    /// Optional 32-byte digest bound into VRF input derivation.
    #[serde(
        rename = "intent_digest_32",
        default,
        skip_serializing_if = "Option::is_none",
        alias = "intentDigest",
        alias = "intent_digest"
    )]
    pub intent_digest_32: Option<Vec<u8>>,
    /// Optional 32-byte digest bound into VRF input derivation for relayer session policies.
    #[serde(
        rename = "session_policy_digest_32",
        default,
        skip_serializing_if = "Option::is_none",
        alias = "sessionPolicyDigest32",
        alias = "session_policy_digest_32"
    )]
    pub session_policy_digest_32: Option<Vec<u8>>,
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
            intent_digest_32: match vrf_challenge.intent_digest.as_deref() {
                Some(b64u) if !b64u.trim().is_empty() => {
                    let bytes = base64_url_decode(b64u).map_err(|e| {
                        wasm_bindgen::JsValue::from_str(&format!(
                            "Failed to decode intentDigest (base64url): {}",
                            e
                        ))
                    })?;
                    if bytes.len() != 32 {
                        return Err(wasm_bindgen::JsValue::from_str(&format!(
                            "Invalid intentDigest length: expected 32 bytes, got {}",
                            bytes.len()
                        )));
                    }
                    Some(bytes)
                }
                _ => None,
            },
            session_policy_digest_32: match vrf_challenge.session_policy_digest_32.as_deref() {
                Some(b64u) if !b64u.trim().is_empty() => {
                    let bytes = base64_url_decode(b64u).map_err(|e| {
                        wasm_bindgen::JsValue::from_str(&format!(
                            "Failed to decode sessionPolicyDigest32 (base64url): {}",
                            e
                        ))
                    })?;
                    if bytes.len() != 32 {
                        return Err(wasm_bindgen::JsValue::from_str(&format!(
                            "Invalid sessionPolicyDigest32 length: expected 32 bytes, got {}",
                            bytes.len()
                        )));
                    }
                    Some(bytes)
                }
                _ => None,
            },
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
    args_base64: &'a str,
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
    fn to_js_value(&self) -> Result<JsValue, String> {
        serde_wasm_bindgen::to_value(self)
            .map_err(|e| format!("Failed to serialize RPC body: {}", e))
    }
}

const VERIFY_FROM_VRF_WORKER_RPC_ID: &str = "verify_from_vrf_worker";
const VERIFY_RPC_RETRY_DELAY_MS: i32 = 1000;
const VERIFY_RPC_ATTEMPTS_PER_FINALITY: u32 = 10;

fn build_verify_rpc_body(
    contract_id: &str,
    args_base64: &str,
    finality: &'static str,
) -> Result<JsValue, String> {
    let body = RpcBody {
        jsonrpc: "2.0",
        id: VERIFY_FROM_VRF_WORKER_RPC_ID,
        method: "query",
        params: RpcParams {
            request_type: "call_function",
            account_id: contract_id,
            method_name: VERIFY_AUTHENTICATION_RESPONSE_METHOD,
            args_base64,
            finality,
        },
    };
    body.to_js_value()
}

fn extract_u8_array(obj: &JsValue, field: &str) -> Result<Vec<u8>, String> {
    let bytes_js = Reflect::get(obj, &JsValue::from_str(field))
        .map_err(|e| format!("Failed to read {}: {:?}", field, e))?;
    let bytes_arr = Array::from(&bytes_js);
    if bytes_arr.length() == 0 {
        return Err(format!("Missing or invalid {} array", field));
    }
    let mut out = Vec::with_capacity(bytes_arr.length() as usize);
    for v in bytes_arr.iter() {
        let byte = v
            .as_f64()
            .ok_or_else(|| format!("{} must be an array of numbers", field))?;
        out.push(byte as u8);
    }
    Ok(out)
}

fn parse_verification_rpc_response(result: &JsValue) -> Result<ContractVerificationResult, String> {
    if let Some(error_msg) = extract_error_message(result, "error") {
        return Ok(ContractVerificationResult {
            success: false,
            verified: false,
            error: Some(error_msg),
            logs: vec![],
        });
    }

    let contract_result = Reflect::get(result, &JsValue::from_str("result"))
        .map_err(|e| format!("Failed to read result from RPC response: {:?}", e))?;
    if contract_result.is_undefined() || contract_result.is_null() {
        return Err("Missing result in RPC response".to_string());
    }

    if let Some(error_msg) = extract_error_message(&contract_result, "error") {
        return Ok(ContractVerificationResult {
            success: false,
            verified: false,
            error: Some(error_msg),
            logs: vec![],
        });
    }

    let logs = extract_string_array(&contract_result, "logs");
    let result_u8 = extract_u8_array(&contract_result, "result")?;

    let result_string = String::from_utf8(result_u8)
        .map_err(|e| format!("Failed to decode result string: {}", e))?;
    let contract_response = js_sys::JSON::parse(&result_string)
        .map_err(|e| format!("Failed to parse contract response: {:?}", e))?;

    let verified = Reflect::get(&contract_response, &JsValue::from_str("verified"))
        .ok()
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let error = if verified {
        None
    } else {
        Some(
            extract_error_message(&contract_response, "error")
                .unwrap_or_else(|| "Contract verification failed".to_string()),
        )
    };

    Ok(ContractVerificationResult {
        success: true,
        verified,
        error,
        logs,
    })
}

async fn verify_with_finality(
    contract_id: &str,
    rpc_url: &str,
    args_base64: &str,
    finality: &'static str,
) -> Result<ContractVerificationResult, String> {
    let mut last_ok: Option<ContractVerificationResult> = None;
    let mut last_err: Option<String> = None;

    for attempt in 1..=VERIFY_RPC_ATTEMPTS_PER_FINALITY {
        debug!(
            "[vrf wasm]: verify_authentication_response (finality={}, attempt {}/{})",
            finality, attempt, VERIFY_RPC_ATTEMPTS_PER_FINALITY
        );

        let rpc_body = build_verify_rpc_body(contract_id, args_base64, finality)?;

        match execute_rpc_request(rpc_url, &rpc_body).await {
            Ok(raw) => match parse_verification_rpc_response(&raw) {
                Ok(result) => {
                    if result.verified {
                        debug!(
                            "[vrf wasm] Contract verification ok (finality={}, logs={:?})",
                            finality, result.logs
                        );
                        return Ok(result);
                    }

                    debug!(
                        "[vrf wasm] Contract verification not verified (finality={}, error={:?})",
                        finality, result.error
                    );
                    last_ok = Some(result);
                }
                Err(err) => {
                    warn!(
                        "[vrf wasm] Failed to parse verification RPC response (finality={}, attempt {}/{}): {}",
                        finality, attempt, VERIFY_RPC_ATTEMPTS_PER_FINALITY, err
                    );
                    last_err = Some(err);
                }
            },
            Err(err) => {
                warn!(
                    "[vrf wasm] Verification RPC request failed (finality={}, attempt {}/{}): {}",
                    finality, attempt, VERIFY_RPC_ATTEMPTS_PER_FINALITY, err
                );
                last_err = Some(err);
            }
        }

        if attempt < VERIFY_RPC_ATTEMPTS_PER_FINALITY {
            sleep(VERIFY_RPC_RETRY_DELAY_MS).await?;
        }
    }

    if let Some(result) = last_ok {
        return Ok(result);
    }

    Err(last_err.unwrap_or_else(|| "Verification retries exhausted".to_string()))
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
    }
    .to_json_bytes()?;

    let args_base64 = base64_url_encode(&contract_args_bytes);

    // Prefer finalized state first, then fall back to optimistic to avoid false-negatives
    // right after authenticator registration (finalized head can lag behind).
    let final_result = verify_with_finality(contract_id, rpc_url, &args_base64, "final").await;
    if matches!(final_result, Ok(ref r) if r.verified) {
        return final_result;
    }

    let optimistic_result = verify_with_finality(
        contract_id,
        rpc_url,
        &args_base64,
        "optimistic"
    ).await;

    if matches!(optimistic_result, Ok(ref r) if r.verified) {
        return optimistic_result;
    }

    // Neither finality produced a verified result; return whichever provided a structured
    // contract response (optimistic preferred), otherwise surface a combined RPC error.
    match optimistic_result {
        Ok(r) => Ok(r),
        Err(opt_err) => match final_result {
            Ok(r) => Ok(r),
            Err(final_err) => Err(format!(
                "verify_authentication_response RPC failed (final: {}; optimistic: {})",
                final_err, opt_err
            )),
        },
    }
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_name = setTimeout)]
    fn set_timeout(callback: &js_sys::Function, ms: i32);
}

async fn sleep(ms: i32) -> Result<(), String> {
    let promise = js_sys::Promise::new(&mut |resolve, _| {
        set_timeout(&resolve, ms);
    });
    wasm_bindgen_futures::JsFuture::from(promise)
        .await
        .map_err(|e| format!("Sleep failed: {:?}", e))?;
    Ok(())
}

/// Shared HTTP request execution logic for VRF worker
async fn execute_rpc_request(rpc_url: &str, rpc_body: &JsValue) -> Result<JsValue, String> {
    let endpoints: Vec<String> = rpc_url
        .split(|c: char| c == ',' || c.is_whitespace())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect();

    if endpoints.is_empty() {
        return Err("NEAR RPC URL cannot be empty".to_string());
    }

    let body_str = js_sys::JSON::stringify(rpc_body)
        .map_err(|e| format!("Failed to stringify RPC body: {:?}", e))?
        .as_string()
        .ok_or_else(|| "Failed to stringify RPC body".to_string())?;
    let fetch_init = build_json_post_init(&body_str)?;

    let mut last_error: Option<String> = None;

    for (index, endpoint) in endpoints.iter().enumerate() {
        let resp = match fetch_with_init(endpoint, &fetch_init).await {
            Ok(v) => v,
            Err(e) => {
                last_error = Some(e);
                continue;
            }
        };

        let ok = match response_ok(&resp) {
            Ok(v) => v,
            Err(e) => {
                last_error = Some(e);
                continue;
            }
        };

        if !ok {
            let error_text = response_text(&resp)
                .await
                .unwrap_or_else(|_| "Failed to read error response".to_string());
            let status = response_status(&resp)
                .map(|s| s.to_string())
                .unwrap_or_else(|_| "?".to_string());
            let status_text = response_status_text(&resp).unwrap_or_default();
            last_error = Some(format!(
                "HTTP error from {}: {} {} - Response: {}",
                endpoint, status, status_text, error_text
            ));
            continue;
        }

        let result = match response_json(&resp).await {
            Ok(v) => v,
            Err(e) => {
                last_error = Some(e);
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
