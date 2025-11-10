use crate::types::wasm_to_json::ToJson;
use serde::Deserialize;
use serde_json;
use serde_wasm_bindgen;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsValue;

use super::confirm_tx_details::request_registration_credential_confirmation;
use crate::types::handlers::{TransactionContext, ConfirmationConfig};
use crate::types::VrfChallenge;

#[wasm_bindgen]
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationCredentialConfirmationRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "nearAccountId")]
    pub near_account_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "deviceNumber")]
    pub device_number: usize,
    #[wasm_bindgen(getter_with_clone, js_name = "contractId")]
    pub contract_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "nearRpcUrl")]
    pub near_rpc_url: String,
    /// Optional confirmation config to control UI behavior (modal/drawer, autoProceed/requireClick)
    #[serde(skip_serializing_if = "Option::is_none", default)]
    #[wasm_bindgen(getter_with_clone, js_name = "confirmationConfig")]
    pub confirmation_config: Option<ConfirmationConfig>,
}

#[wasm_bindgen]
#[derive(Debug, Clone)]
pub struct RegistrationCredentialConfirmationResult {
    #[wasm_bindgen(getter_with_clone, js_name = "confirmed")]
    pub confirmed: bool,
    #[wasm_bindgen(getter_with_clone, js_name = "requestId")]
    pub request_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "intentDigest")]
    pub intent_digest: String,
    #[wasm_bindgen(getter_with_clone, js_name = "credential")]
    pub credential: JsValue,
    #[wasm_bindgen(getter_with_clone, js_name = "prfOutput")]
    pub prf_output: Option<String>,
    #[wasm_bindgen(getter_with_clone, js_name = "vrfChallenge")]
    pub vrf_challenge: Option<VrfChallenge>,
    #[wasm_bindgen(getter_with_clone, js_name = "transactionContext")]
    pub transaction_context: Option<TransactionContext>,
    #[wasm_bindgen(getter_with_clone, js_name = "error")]
    pub error: Option<String>,
}

impl RegistrationCredentialConfirmationResult {
    pub fn from_confirmation(c: super::confirm_tx_details::ConfirmationResult) -> Self {
        Self {
            confirmed: c.confirmed,
            request_id: c.request_id,
            intent_digest: c.intent_digest.unwrap_or_default(),
            credential: c
                .credential
                .as_ref()
                .and_then(|v| serde_wasm_bindgen::to_value(v).ok())
                .unwrap_or(JsValue::UNDEFINED),
            prf_output: c.prf_output,
            vrf_challenge: c.vrf_challenge,
            transaction_context: c.transaction_context,
            error: c.error,
        }
    }
}

impl ToJson for RegistrationCredentialConfirmationResult {
    fn to_json(&self) -> Result<serde_json::Value, String> {
        let credential_json: serde_json::Value =
            if self.credential.is_undefined() || self.credential.is_null() {
                serde_json::Value::Null
            } else {
                serde_wasm_bindgen::from_value(self.credential.clone())
                    .unwrap_or(serde_json::Value::Null)
            };

        let json = serde_json::json!({
            "confirmed": self.confirmed,
            "requestId": self.request_id,
            "intentDigest": self.intent_digest,
            "credential": credential_json,
            "prfOutput": self.prf_output,
            "vrfChallenge": self.vrf_challenge,
            "transactionContext": self.transaction_context,
            "error": self.error,
        });

        Ok(json)
    }
}

/// Handles Link Device user confirmation by delegating to the JS main thread
/// secure confirmation flow. Presents a modal in the wallet iframe, collects
/// WebAuthn registration credential and PRF output, then returns artifacts.
pub async fn handle_request_registration_credential_confirmation(
    request: RegistrationCredentialConfirmationRequest,
) -> Result<RegistrationCredentialConfirmationResult, String> {
    let result = request_registration_credential_confirmation(
        &request.near_account_id,
        request.device_number,
        &request.contract_id,
        &request.near_rpc_url,
        request.confirmation_config.clone(),
    )
    .await?;

    Ok(RegistrationCredentialConfirmationResult::from_confirmation(
        result,
    ))
}
