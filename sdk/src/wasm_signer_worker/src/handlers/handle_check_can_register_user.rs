// ******************************************************************************
// *                                                                            *
// *                     HANDLER: CHECK CAN REGISTER USER                     *
// *                                                                            *
// ******************************************************************************
use crate::rpc_calls::{check_can_register_user_rpc_call, VrfData};
use crate::types::wasm_to_json::WasmSignedTransaction;
use crate::types::{
    AuthenticatorOptions, SerializedRegistrationCredential, VrfChallenge,
    WebAuthnRegistrationCredential, WebAuthnRegistrationCredentialStruct,
};
use serde::{Deserialize, Serialize};
use serde_json;
use wasm_bindgen::prelude::*;
// Local definition for registration info returned by pre-check.
// Moved here after removing the deprecated testnet registration flow.
#[wasm_bindgen]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationInfoStruct {
    #[wasm_bindgen(getter_with_clone, js_name = "credentialId")]
    pub credential_id: Vec<u8>,
    #[wasm_bindgen(getter_with_clone, js_name = "credentialPublicKey")]
    pub credential_public_key: Vec<u8>,
    #[wasm_bindgen(getter_with_clone, js_name = "userId")]
    pub user_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "vrfPublicKey")]
    pub vrf_public_key: Option<Vec<u8>>,
}

#[wasm_bindgen]
impl RegistrationInfoStruct {
    #[wasm_bindgen(constructor)]
    pub fn new(
        credential_id: Vec<u8>,
        credential_public_key: Vec<u8>,
        user_id: String,
        vrf_public_key: Option<Vec<u8>>,
    ) -> RegistrationInfoStruct {
        RegistrationInfoStruct {
            credential_id,
            credential_public_key,
            user_id,
            vrf_public_key,
        }
    }
}

#[wasm_bindgen]
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CheckCanRegisterUserRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "vrfChallenge")]
    pub vrf_challenge: VrfChallenge,
    #[wasm_bindgen(getter_with_clone)]
    pub credential: SerializedRegistrationCredential,
    #[wasm_bindgen(getter_with_clone, js_name = "contractId")]
    pub contract_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "nearRpcUrl")]
    pub near_rpc_url: String,
    #[wasm_bindgen(getter_with_clone, js_name = "authenticatorOptions")]
    pub authenticator_options: Option<AuthenticatorOptions>,
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationCheckRequest {
    #[wasm_bindgen(getter_with_clone)]
    pub contract_id: String,
    #[wasm_bindgen(getter_with_clone)]
    pub near_rpc_url: String,
}

#[wasm_bindgen]
impl RegistrationCheckRequest {
    #[wasm_bindgen(constructor)]
    pub fn new(contract_id: String, near_rpc_url: String) -> RegistrationCheckRequest {
        RegistrationCheckRequest {
            contract_id,
            near_rpc_url,
        }
    }
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationCheckResult {
    pub verified: bool,
    #[wasm_bindgen(getter_with_clone, js_name = "registrationInfo")]
    pub registration_info: Option<RegistrationInfoStruct>,
    #[wasm_bindgen(getter_with_clone)]
    pub logs: Vec<String>,
    #[wasm_bindgen(getter_with_clone, js_name = "signedTransaction")]
    pub signed_transaction: Option<WasmSignedTransaction>,
    #[wasm_bindgen(getter_with_clone)]
    pub error: Option<String>,
}

#[wasm_bindgen]
impl RegistrationCheckResult {
    #[wasm_bindgen(constructor)]
    pub fn new(
        verified: bool,
        registration_info: Option<RegistrationInfoStruct>,
        logs: Vec<String>,
        signed_transaction: Option<WasmSignedTransaction>,
        error: Option<String>,
    ) -> RegistrationCheckResult {
        RegistrationCheckResult {
            verified,
            registration_info,
            logs,
            signed_transaction,
            error,
        }
    }
}

/// **Handles:** `WorkerRequestType::CheckCanRegisterUser`
/// This handler performs preliminary validation before full registration. It verifies the VRF challenge,
/// validates the WebAuthn registration credential, and checks contract-specific registration requirements
/// without actually committing the registration.
///
/// # Arguments
/// * `request` - Contains VRF challenge, registration credential, and contract details
///
/// # Returns
/// * `RegistrationCheckResult` - Contains verification status, registration info, and optional pre-signed transaction
pub async fn handle_check_can_register_user(
    request: CheckCanRegisterUserRequest,
) -> Result<RegistrationCheckResult, String> {
    // Use VrfChallenge directly instead of converting
    let vrf_challenge = &request.vrf_challenge;

    let credential = WebAuthnRegistrationCredentialStruct::new(
        request.credential.id,
        request.credential.raw_id,
        request.credential.credential_type,
        request.credential.authenticator_attachment,
        request.credential.response.client_data_json,
        request.credential.response.attestation_object,
        Some(request.credential.response.transports),
        request
            .credential
            .client_extension_results
            .prf
            .results
            .second,
    );

    let check_request = RegistrationCheckRequest::new(request.contract_id, request.near_rpc_url);

    // Convert structured types using From implementations
    let vrf_data = VrfData::try_from(vrf_challenge)
        .map_err(|e| format!("Failed to convert VRF challenge: {:?}", e))?;
    let webauthn_registration = WebAuthnRegistrationCredential::from(&credential);

    // Call the http module function
    let registration_result = check_can_register_user_rpc_call(
        &check_request.contract_id,
        vrf_data,
        webauthn_registration,
        &check_request.near_rpc_url,
        request.authenticator_options,
    )
    .await
    .map_err(|e| format!("Registration check failed: {}", e))?;

    // Check if the RPC call itself failed (e.g., "Server error")
    if !registration_result.success {
        let error_msg = registration_result
            .error
            .unwrap_or_else(|| "Unknown RPC error".to_string());
        return Err(format!("RPC call failed: {}", error_msg));
    }

    // Create structured response
    let signed_transaction_wasm = match registration_result.unwrap_signed_transaction() {
        Some(json_value) => {
            let signed_tx: crate::types::SignedTransaction =
                serde_json::from_value(json_value.clone())
                    .map_err(|e| format!("Failed to parse signed transaction: {}", e))?;
            Some(WasmSignedTransaction::from(&signed_tx))
        }
        None => None,
    };

    let registration_info = registration_result.registration_info.map(|info| {
        RegistrationInfoStruct::new(
            info.credential_id,
            info.credential_public_key,
            "".to_string(), // Not available from contract response
            None,           // Not available from contract response
        )
    });

    Ok(RegistrationCheckResult::new(
        registration_result.verified,
        registration_info,
        registration_result.logs,
        signed_transaction_wasm,
        registration_result.error,
    ))
}
