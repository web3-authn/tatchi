// SecureConfirm response type reused from types module
use crate::types::WorkerConfirmationResponse;
use js_sys::Promise;
use serde::Serialize;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;

// JS bridge exposed from web3authn-vrf.worker.ts:
//   (globalThis as any).awaitSecureConfirmationV2 = awaitSecureConfirmationV2;
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_name = awaitSecureConfirmationV2)]
    fn await_secure_confirmation_v2(request: JsValue) -> Promise;
}

/// Helper: call awaitSecureConfirmationV2 from Rust and deserialize the response.
pub async fn vrf_await_secure_confirmation(
    request: JsValue,
) -> Result<WorkerConfirmationResponse, String> {
    let promise = await_secure_confirmation_v2(request);

    let js_val = JsFuture::from(promise)
        .await
        .map_err(|e| format!("awaitSecureConfirmationV2 rejected: {:?}", e))?;

    serde_wasm_bindgen::from_value(js_val)
        .map_err(|e| format!("Failed to deserialize confirmation response: {}", e))
}

#[derive(Serialize)]
#[allow(non_snake_case)]
pub struct Summary<'a> {
    pub nearAccountId: &'a str,
    pub deviceNumber: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contractId: Option<&'a str>,
}

#[derive(Serialize)]
#[allow(non_snake_case)]
pub struct RpcCall<'a> {
    pub contractId: &'a str,
    pub nearRpcUrl: &'a str,
    pub nearAccountId: &'a str,
}

#[derive(Serialize)]
#[allow(non_snake_case)]
pub struct Payload<'a> {
    pub nearAccountId: &'a str,
    pub deviceNumber: u32,
    pub rpcCall: RpcCall<'a>,
}

#[derive(Serialize)]
#[allow(non_snake_case)]
pub struct ExportSummary<'a> {
    pub operation: &'static str,
    pub accountId: &'a str,
    pub publicKey: &'a str,
    pub warning: &'static str,
}

#[derive(Serialize)]
#[allow(non_snake_case)]
pub struct DecryptPrivateKeyWithPrfPayload<'a> {
    pub nearAccountId: &'a str,
    pub publicKey: &'a str,
}

#[derive(Serialize)]
#[allow(non_snake_case)]
pub struct SecureConfirmRequest<'a, TSummary, TPayload> {
    pub requestId: &'a str,
    #[serde(rename = "type")]
    pub request_type: &'static str,
    pub summary: TSummary,
    pub payload: TPayload,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intentDigest: Option<&'a str>,
    #[serde(
        skip_serializing_if = "is_undefined",
        with = "serde_wasm_bindgen::preserve"
    )]
    pub confirmationConfig: JsValue,
}

fn is_undefined(v: &JsValue) -> bool {
    v.is_undefined() || v.is_null()
}
