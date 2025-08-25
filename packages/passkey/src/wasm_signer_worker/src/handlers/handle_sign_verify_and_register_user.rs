// ******************************************************************************
// *                                                                            *
// *                  HANDLER: SIGN VERIFY AND REGISTER USER                  *
// *                                                                            *
// *                  DEPRECATED: ONLY USED FOR TESTNET REGISTRATION            *
// *                                                                            *
// ******************************************************************************

use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use serde_json;
use bs58;
use crate::rpc_calls::VrfData;
use crate::types::{
    WebAuthnRegistrationCredential,
    WebAuthnRegistrationCredentialStruct,
    DecryptionPayload,
    RegistrationPayload,
    VerificationPayload,
    SerializedRegistrationCredential,
};
use crate::types::wasm_to_json::WasmSignedTransaction;
use crate::types::progress::{
    ProgressMessageType,
    ProgressStep,
    send_progress_message,
    send_completion_message,
    send_error_message
};
use crate::handlers::confirm_tx_details::request_user_registration_confirmation;

#[wasm_bindgen]
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SignVerifyAndRegisterUserRequest {
    #[wasm_bindgen(getter_with_clone)]
    pub verification: VerificationPayload,
    #[wasm_bindgen(getter_with_clone)]
    pub decryption: DecryptionPayload,
    #[wasm_bindgen(getter_with_clone)]
    pub registration: RegistrationPayload,
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationResult {
    pub verified: bool,
    #[wasm_bindgen(getter_with_clone, js_name = "registrationInfo")]
    pub registration_info: Option<RegistrationInfoStruct>,
    #[wasm_bindgen(getter_with_clone)]
    pub logs: Vec<String>,
    #[wasm_bindgen(getter_with_clone, js_name = "signedTransaction")]
    pub signed_transaction: Option<WasmSignedTransaction>,
    #[wasm_bindgen(getter_with_clone, js_name = "preSignedDeleteTransaction")]
    pub pre_signed_delete_transaction: Option<WasmSignedTransaction>,
    #[wasm_bindgen(getter_with_clone)]
    pub error: Option<String>,
}

#[wasm_bindgen]
impl RegistrationResult {
    #[wasm_bindgen(constructor)]
    pub fn new(
        verified: bool,
        registration_info: Option<RegistrationInfoStruct>,
        logs: Vec<String>,
        signed_transaction: Option<WasmSignedTransaction>,
        pre_signed_delete_transaction: Option<WasmSignedTransaction>,
        error: Option<String>,
    ) -> RegistrationResult {
        RegistrationResult {
            verified,
            registration_info,
            logs,
            signed_transaction,
            pre_signed_delete_transaction,
            error,
        }
    }
}

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

/// **Handles:** `WorkerRequestType::SignVerifyAndRegisterUser`
/// This handler performs the full registration flow including contract verification, private key
/// decryption, transaction signing, and optional pre-signed transaction generation for account recovery.
/// It sends progress updates throughout the multi-step process.
///
/// # Arguments
/// * `request` - Contains all registration data including VRF challenge, credentials, and transaction details
///
/// # Returns
/// * `RegistrationResult` - Contains final verification status, signed transactions, and registration metadata
/// @deprecated Testnet only, use createAccountAndRegisterWithRelayServer instead for prod
pub async fn handle_sign_verify_and_register_user(
    request: SignVerifyAndRegisterUserRequest
) -> Result<RegistrationResult, String> {
    let mut logs = Vec::new();

    let vrf_challenge = request.verification.vrf_challenge
        .as_ref().ok_or_else(|| "Missing vrfChallenge in verification".to_string())?;

    // Step 1: Request user confirmation and collect registration credential
    send_progress_message(
        ProgressMessageType::RegistrationProgress,
        ProgressStep::UserConfirmation,
        "Requesting user confirmation for registration",
        Some("{}"),
    );

    let confirmation_result = request_user_registration_confirmation(&request).await
        .map_err(|e| format!("Registration confirmation failed: {}", e))?;

    if !confirmation_result.confirmed {
        return Err("User rejected registration".to_string());
    }

    // Extract registration credential from confirmation result
    let reg_cred_json = confirmation_result.credential
        .ok_or_else(|| "Missing registration credential from confirmation".to_string())?;

    // Parse the registration credential from JSON
    let reg_cred: SerializedRegistrationCredential = serde_json::from_value(reg_cred_json)
        .map_err(|e| format!("Failed to parse registration credential: {}", e))?;

    let credential = WebAuthnRegistrationCredentialStruct::new(
        reg_cred.id.clone(),
        reg_cred.raw_id.clone(),
        reg_cred.credential_type.clone(),
        reg_cred.authenticator_attachment.clone(),
        reg_cred.response.client_data_json.clone(),
        reg_cred.response.attestation_object.clone(),
        Some(reg_cred.response.transports.clone()),
        reg_cred.client_extension_results.prf.results.second.clone(),
    );

    // Get PRF output from confirmation result (mandatory now)
    let chacha20_prf_output = confirmation_result.prf_output
        .ok_or_else(|| "Missing PRF output from confirmation".to_string())?;

    let verification = request.verification.clone();

    let decryption = DecryptionPayload {
        encrypted_private_key_data: request.decryption.encrypted_private_key_data,
        encrypted_private_key_iv: request.decryption.encrypted_private_key_iv,
    };

    let near_account_id = &request.registration.near_account_id;
    let nonce_u64 = request.registration.nonce.parse()
        .map_err(|e| format!("Invalid nonce: {}", e))?;
    let block_hash_str = &request.registration.block_hash;
    let device_number = request.registration.device_number.unwrap_or(1);

    // Step 2: Start contract verification process
    send_progress_message(
        ProgressMessageType::RegistrationProgress,
        ProgressStep::ContractVerification,
        "Starting Web3Authn account registration...",
        Some("{\"step\": 2, \"total\": 4}"),
    );

    // Convert structured types using From implementations
    let vrf_data = VrfData::try_from(vrf_challenge)
        .map_err(|e| format!("Failed to convert VRF challenge: {:?}", e))?;
    let webauthn_registration = WebAuthnRegistrationCredential::from(&credential);

    // Access grouped parameters
    let contract_id = &verification.contract_id;
    let encrypted_private_key_data = &decryption.encrypted_private_key_data;
    let encrypted_private_key_iv = &decryption.encrypted_private_key_iv;
    let nonce = nonce_u64;
    let block_hash_bytes = &bs58::decode(block_hash_str).into_vec().map_err(|e| format!("Invalid block hash: {}", e))?;

    // Send contract verification progress
    send_progress_message(
        ProgressMessageType::RegistrationProgress,
        ProgressStep::WebauthnAuthentication,
        "Verifying credentials with contract...",
        Some("{\"step\": 3, \"total\": 4}"),
    );

    // Call the transaction module function with transaction metadata
    let registration_result = crate::transaction::sign_registration_tx_wasm(
        contract_id,
        vrf_data,
        request.registration.deterministic_vrf_public_key.as_deref(), // Convert Option<String> to Option<&str>
        webauthn_registration,
        near_account_id,
        encrypted_private_key_data,
        encrypted_private_key_iv,
        &chacha20_prf_output,
        nonce,
        &block_hash_bytes,
        Some(device_number), // Pass device number for multi-device support
        request.registration.authenticator_options, // Pass authenticator options
    )
    .await
    .map_err(|e| {
        // Send error progress message
        send_error_message(
            ProgressMessageType::RegistrationProgress,
            ProgressStep::Error,
            &format!("Registration failed: {}", e),
            &e.to_string()
        );
        format!("Actual registration failed: {}", e)
    })?;

    // Send transaction signing progress
    send_progress_message(
        ProgressMessageType::RegistrationProgress,
        ProgressStep::TransactionSigningProgress,
        "Signing registration transaction...",
        Some("{\"step\": 4, \"total\": 4}"),
    );

    // Create structured response with embedded borsh bytes
    let signed_transaction_wasm = match registration_result.unwrap_signed_transaction() {
        Some(json_value) => {
            let signed_tx: crate::types::SignedTransaction = serde_json::from_value(json_value.clone())
                .map_err(|e| format!("Failed to parse signed transaction: {}", e))?;
            Some(WasmSignedTransaction::from(&signed_tx))
        }
        None => None
    };
    let pre_signed_delete_transaction_wasm = match registration_result.unwrap_pre_signed_delete_transaction() {
        Some(json_value) => {
            let signed_tx: crate::types::SignedTransaction = serde_json::from_value(json_value.clone())
                .map_err(|e| format!("Failed to parse pre-signed transaction: {}", e))?;
            Some(WasmSignedTransaction::from(&signed_tx))
        }
        None => None
    };

    let registration_info = registration_result.registration_info
        .map(|info| RegistrationInfoStruct::new(
            info.credential_id,
            info.credential_public_key,
            "".to_string(), // Not available from contract response
            None, // Not available from contract response
        ));

    // Send completion progress message
    if registration_result.verified {
        send_completion_message(
            ProgressMessageType::RegistrationComplete,
            ProgressStep::AuthenticationComplete,
            "User registration completed successfully",
            Some(&serde_json::json!({
                "step": 4,
                "total": 4,
                "verified": true,
                "logs": registration_result.logs
            }).to_string())
        );
    } else {
        send_error_message(
            ProgressMessageType::RegistrationProgress,
            ProgressStep::Error,
            "Registration verification failed",
            registration_result.error.as_ref().unwrap_or(&"Unknown verification error".to_string())
        );
    }

    // Merge confirmation logs with registration logs
    let mut combined_logs = logs;
    combined_logs.extend(registration_result.logs);

    let result = RegistrationResult::new(
        registration_result.verified,
        registration_info,
        combined_logs,
        signed_transaction_wasm,
        pre_signed_delete_transaction_wasm,
        registration_result.error,
    );

    Ok(result)
}
