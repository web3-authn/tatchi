use log::info;
use serde_json;
use serde::{Serialize, Deserialize};
use bs58;

use crate::encoders::{base64_url_decode, base64_standard_encode};
use crate::rpc_calls::{
    VrfData,
    verify_authentication_response_rpc_call,
    check_can_register_user_rpc_call,
};
use crate::transaction::{
    sign_transaction,
    build_actions_from_params,
    build_transaction_with_actions,
    calculate_transaction_hash,
};
use crate::actions::ActionParams;
use crate::types::*;
use crate::types::progress::{
    ProgressMessageType,
    ProgressStep,
    send_progress_message,
    send_completion_message,
    send_error_message
};
use crate::types::wasm_to_json::{
    WasmPublicKey,
    WasmSignature,
    WasmTransaction,
    WasmSignedTransaction
};

// ******************************************************************************
// *                                                                            *
// *                    HANDLER 1: DERIVE KEYPAIR AND ENCRYPT                   *
// *                                                                            *
// ******************************************************************************

/// **Handles:** `WorkerRequestType::DeriveNearKeypairAndEncrypt`
/// This is the primary handler for new device setup and linking. It performs the following operations:
/// 1. Derives Ed25519 keypair from PRF output using HKDF with account-specific salt
/// 2. Encrypts the private key using AES-GCM with AES PRF output
/// 3. Optionally signs a device registration transaction for linking devices
///
/// # Arguments
/// * `request` - Contains dual PRF outputs, account ID, WebAuthn credential, and optional registration transaction
///
/// # Returns
/// * `EncryptionResult` - Contains derived public key, encrypted private key data, and optional signed transaction
pub async fn handle_derive_near_keypair_encrypt_and_sign_msg(request: DeriveKeypairPayload) -> Result<EncryptionResult, String> {

    info!("RUST: WASM binding - starting structured dual PRF keypair derivation with optional transaction signing");

    // Convert wasm-bindgen types to internal types
    let internal_dual_prf_outputs = crate::types::DualPrfOutputs {
        chacha20_prf_output_base64: request.dual_prf_outputs.chacha20_prf_output,
        ed25519_prf_output_base64: request.dual_prf_outputs.ed25519_prf_output,
    };

    // Call the dual PRF derivation function (same as JSON version)
    let (public_key, encrypted_result) = crate::crypto::derive_and_encrypt_keypair_from_dual_prf(
        &internal_dual_prf_outputs,
        &request.near_account_id
    ).map_err(|e| format!("Failed to derive and encrypt keypair: {}", e))?;

    info!("RUST: Structured dual PRF keypair derivation successful");

    // Handle optional transaction signing if registration transaction is provided
    let signed_transaction_wasm = if let Some(registration_tx) = &request.registration_transaction {

        info!("RUST: Optional transaction signing requested - deriving private key for signing");
        // Re-derive the private key from the same PRF output for signing (before it's encrypted)
        let (near_private_key, _near_public_key) = crate::crypto::derive_ed25519_key_from_prf_output(
            &internal_dual_prf_outputs.ed25519_prf_output_base64,
            &request.near_account_id
        ).map_err(|e| format!("Failed to re-derive keypair for signing: {}", e))?;

        // Parse nonce
        let parsed_nonce = registration_tx.nonce.parse::<u64>()
            .map_err(|e| format!("Invalid nonce format: {}", e))?;

        // Use VrfChallenge directly instead of converting
        let vrf_challenge_struct = &registration_tx.vrf_challenge;

        // Convert to VrfData using the existing conversion
        let vrf_data = VrfData::try_from(vrf_challenge_struct)
            .map_err(|e| format!("Failed to convert VRF challenge: {:?}", e))?;

        // Convert the SerializedRegistrationCredential to WebAuthnRegistrationCredential
        let webauthn_registration = WebAuthnRegistrationCredential {
            id: request.credential.id.clone(),
            raw_id: request.credential.raw_id.clone(),
            response: WebAuthnRegistrationResponse {
                client_data_json: request.credential.response.client_data_json.clone(),
                attestation_object: request.credential.response.attestation_object.clone(),
                transports: Some(request.credential.response.transports.clone()),
            },
            authenticator_attachment: request.credential.authenticator_attachment.clone(),
            reg_type: request.credential.credential_type.clone(),
        };

        // Sign the link_device_register_user transaction
        // Decode base64url deterministic VRF public key to Vec<u8>
        let deterministic_vrf_public_key = base64_url_decode(&registration_tx.deterministic_vrf_public_key)
            .map_err(|e| format!("Failed to decode deterministic VRF public key: {}", e))?;

        match crate::transaction::sign_link_device_registration_tx(
            &registration_tx.contract_id,
            vrf_data,
            deterministic_vrf_public_key,
            webauthn_registration,
            &request.near_account_id,
            &near_private_key, // Use the properly derived NEAR private key
            parsed_nonce,
            &registration_tx.block_hash_bytes,
            request.authenticator_options, // Pass authenticator options
        ).await {
            Ok(registration_result) => {
                let signed_tx_result = registration_result.unwrap_signed_transaction();
                // Convert the result to SignedTransaction
                match signed_tx_result {
                    Some(json_value) => {
                        // Parse the JSON value back to SignedTransaction
                        let signed_tx: crate::types::SignedTransaction = serde_json::from_value(json_value)
                            .map_err(|e| format!("Failed to parse signed transaction: {}", e))?;
                        Some(WasmSignedTransaction::from(&signed_tx))
                    }
                    None => None
                }
            }
            Err(e) => {
                info!("RUST: Transaction signing failed: {}", e);
                None
            }
        }
    } else {
        info!("RUST: No transaction signing requested - optional parameters not provided");
        None
    };

    // Convert signed transaction to WASM wrapper if present
    let signed_transaction_struct = signed_transaction_wasm;

    // Return structured result with optional signed transaction
    Ok(EncryptionResult::new(
        request.near_account_id,
        public_key,
        encrypted_result.encrypted_near_key_data_b64u,
        encrypted_result.chacha20_nonce_b64u,
        true, // stored = true since we're storing in WASM
        signed_transaction_struct,
    ))
}

// ******************************************************************************
// *                                                                            *
// *                   HANDLER 2: RECOVER KEYPAIR FROM PASSKEY                  *
// *                                                                            *
// ******************************************************************************

/// Recovers a NEAR keypair from an existing WebAuthn authentication credential with dual PRF outputs.
/// **Handles:** `WorkerRequestType::RecoverKeypairFromPasskey`
///
/// This handler is used when a user wants to recover access to their account using an existing passkey.
/// It extracts PRF outputs from the authentication response and regenerates the same keypair that was
/// originally created during registration.
///
/// # Arguments
/// * `request` - Contains authentication credential with PRF outputs and optional account ID hint
///
/// # Returns
/// * `RecoverKeypairResult` - Contains recovered public key, re-encrypted private key data, and account hint
pub async fn handle_recover_keypair_from_passkey_msg(request: RecoverKeypairPayload) -> Result<RecoverKeypairResult, String> {

    // Extract PRF outputs
    let chacha20_prf_output = request.credential.client_extension_results.prf.results.first
        .ok_or_else(|| "Missing AES PRF output (first) in credential".to_string())?;
    let ed25519_prf_output = request.credential.client_extension_results.prf.results.second
        .ok_or_else(|| "Missing Ed25519 PRF output (second) in credential".to_string())?;

    info!("RUST: Parsed authentication credential with ID: {}", request.credential.id);

    // Use account hint if provided, otherwise generate placeholder
    let account_id = request.account_id_hint
        .as_deref()
        .unwrap_or("recovery-account.testnet");

    // Derive Ed25519 keypair from Ed25519 PRF output using account-specific HKDF
    // public_key already contains the ed25519: prefix from the crypto function
    let (private_key, public_key) = crate::crypto::derive_ed25519_key_from_prf_output(&ed25519_prf_output, account_id)
        .map_err(|e| format!("Failed to derive Ed25519 key from PRF: {}", e))?;

    // Encrypt the private key with the AES PRF output (correct usage)
    let encryption_result = crate::crypto::encrypt_private_key_with_prf(
        &private_key,
        &chacha20_prf_output,
        account_id,
    ).map_err(|e| format!("Failed to encrypt private key with AES PRF: {}", e))?;

    info!("RUST: Successfully derived NEAR keypair from Ed25519 PRF and encrypted with AES PRF");
    info!("RUST: PRF-based keypair recovery from authentication credential successful");

    Ok(RecoverKeypairResult::new(
        public_key,
        encryption_result.encrypted_near_key_data_b64u,
        encryption_result.chacha20_nonce_b64u, // IV
        Some(account_id.to_string())
    ))
}

// ******************************************************************************
// *                                                                            *
// *                     HANDLER 3: CHECK CAN REGISTER USER                     *
// *                                                                            *
// ******************************************************************************

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
pub async fn handle_check_can_register_user_msg(request: CheckCanRegisterUserPayload) -> Result<RegistrationCheckResult, String> {

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
        request.credential.client_extension_results.prf.results.second,
    );

    let check_request = RegistrationCheckRequest::new(
        request.contract_id,
        request.near_rpc_url,
    );

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
        request.authenticator_options
    ).await
    .map_err(|e| format!("Registration check failed: {}", e))?;

    // Check if the RPC call itself failed (e.g., "Server error")
    if !registration_result.success {
        let error_msg = registration_result.error.unwrap_or_else(|| "Unknown RPC error".to_string());
        return Err(format!("RPC call failed: {}", error_msg));
    }

    // Create structured response
    let signed_transaction_wasm = match registration_result.unwrap_signed_transaction() {
        Some(json_value) => {
            let signed_tx: crate::types::SignedTransaction = serde_json::from_value(json_value.clone())
                .map_err(|e| format!("Failed to parse signed transaction: {}", e))?;
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

    Ok(RegistrationCheckResult::new(
        registration_result.verified,
        registration_info,
        registration_result.logs,
        signed_transaction_wasm,
        registration_result.error,
    ))
}

// ******************************************************************************
// *                                                                            *
// *                  HANDLER 4: SIGN VERIFY AND REGISTER USER                  *
// *                                                                            *
// *                  DEPRECATED: ONLY USED FOR TESTNET REGISTRATION            *
// *                                                                            *
// ******************************************************************************

/// **Handles:** `WorkerRequestType::SignVerifyAndRegisterUser`
/// This handler performs the full registration flow including contract verification, private key
/// decryption, transaction signing, and optional pre-signed transaction generation for account recovery.
/// It sends progress updates throughout the multi-step process.
///
/// # Arguments
/// * `parsed_payload` - Contains all registration data including VRF challenge, credentials, and transaction details
///
/// # Returns
/// * `RegistrationResult` - Contains final verification status, signed transactions, and registration metadata
/// @deprecated Testnet only, use createAccountAndRegisterWithRelayServer instead for prod
pub async fn handle_sign_verify_and_register_user_msg(parsed_payload: SignVerifyAndRegisterUserPayload) -> Result<RegistrationResult, String> {

    let vrf_challenge = &parsed_payload.vrf_challenge;

    let credential = WebAuthnRegistrationCredentialStruct::new(
        parsed_payload.credential.id,
        parsed_payload.credential.raw_id,
        parsed_payload.credential.credential_type,
        parsed_payload.credential.authenticator_attachment,
        parsed_payload.credential.response.client_data_json,
        parsed_payload.credential.response.attestation_object,
        Some(parsed_payload.credential.response.transports),
        parsed_payload.credential.client_extension_results.prf.results.second,
    );

    let verification = Verification::new(
        parsed_payload.contract_id,
        parsed_payload.near_rpc_url,
    );

    let decryption = Decryption::new(
        parsed_payload.prf_output,
        parsed_payload.encrypted_private_key_data,
        parsed_payload.encrypted_private_key_iv,
    );

    let transaction = RegistrationTxData::new(
        parsed_payload.near_account_id,
        parsed_payload.nonce.parse().map_err(|e| format!("Invalid nonce: {}", e))?,
        parsed_payload.block_hash_bytes,
        parsed_payload.device_number.unwrap_or(1), // Default to device number 1 if not provided
    );

    let registration_request = RegistrationRequest::new(
        verification,
        decryption,
        transaction,
    );

    // Send initial progress message
    send_progress_message(
        ProgressMessageType::RegistrationProgress,
        ProgressStep::Preparation,
        "Starting dual VRF user registration process...",
        Some(&serde_json::json!({"step": 1, "total": 4}).to_string())
    );

    // Convert structured types using From implementations
    let vrf_data = VrfData::try_from(vrf_challenge)
        .map_err(|e| format!("Failed to convert VRF challenge: {:?}", e))?;
    let webauthn_registration = WebAuthnRegistrationCredential::from(&credential);

    // Access grouped parameters
    let contract_id = &registration_request.verification.contract_id;
    let signer_account_id = &registration_request.transaction.signer_account_id;
    let encrypted_private_key_data = &registration_request.decryption.encrypted_private_key_data;
    let encrypted_private_key_iv = &registration_request.decryption.encrypted_private_key_iv;
    let chacha20_prf_output = &registration_request.decryption.chacha20_prf_output;
    let nonce = registration_request.transaction.nonce;
    let block_hash_bytes = &registration_request.transaction.block_hash_bytes;
    let device_number = registration_request.transaction.device_number;

    // Send contract verification progress
    send_progress_message(
        ProgressMessageType::RegistrationProgress,
        ProgressStep::WebauthnAuthentication,
        "Verifying credentials with contract...",
        Some(&serde_json::json!({"step": 2, "total": 4}).to_string())
    );

    // Call the transaction module function with transaction metadata
    let registration_result = crate::transaction::sign_registration_tx_wasm(
        contract_id,
        vrf_data,
        parsed_payload.deterministic_vrf_public_key.as_deref(), // Convert Option<String> to Option<&str>
        webauthn_registration,
        signer_account_id,
        encrypted_private_key_data,
        encrypted_private_key_iv,
        chacha20_prf_output,
        nonce,
        block_hash_bytes,
        Some(device_number), // Pass device number for multi-device support
        parsed_payload.authenticator_options, // Pass authenticator options
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
        Some(&serde_json::json!({"step": 3, "total": 4}).to_string())
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

    let result = RegistrationResult::new(
        registration_result.verified,
        registration_info,
        registration_result.logs,
        signed_transaction_wasm,
        pre_signed_delete_transaction_wasm,
        registration_result.error,
    );

    Ok(result)
}

// ******************************************************************************
// *                                                                            *
// *                  HANDLER 5: DECRYPT PRIVATE KEY WITH PRF                   *
// *                                                                            *
// ******************************************************************************

/// **Handles:** `WorkerRequestType::DecryptPrivateKeyWithPrf`
/// This handler takes encrypted private key data and an AES PRF output to decrypt and return
/// the private key in NEAR-compatible format. Used when applications need direct access to
/// the private key for signing operations outside of the worker context.
///
/// # Arguments
/// * `request` - Contains account ID, PRF output, and encrypted private key data with IV
///
/// # Returns
/// * `DecryptPrivateKeyResult` - Contains decrypted private key in NEAR format and account ID
pub async fn handle_decrypt_private_key_with_prf_msg(request: DecryptKeyPayload) -> Result<DecryptPrivateKeyResult, String> {

    // Use the core function to decrypt and get SigningKey
    let signing_key = crate::crypto::decrypt_private_key_with_prf(
        &request.near_account_id,
        &request.prf_output,
        &request.encrypted_private_key_data,
        &request.encrypted_private_key_iv,
    ).map_err(|e| format!("Decryption failed: {}", e))?;

    // Convert SigningKey to NEAR format (64 bytes: 32-byte seed + 32-byte public key)
    let verifying_key = signing_key.verifying_key();
    let public_key_bytes = verifying_key.to_bytes();
    let private_key_seed = signing_key.to_bytes();

    // NEAR Ed25519 format: 32-byte private key seed + 32-byte public key = 64 bytes total
    let mut full_private_key = Vec::with_capacity(64);
    full_private_key.extend_from_slice(&private_key_seed);
    full_private_key.extend_from_slice(&public_key_bytes);

    let private_key_near_format = format!("ed25519:{}", bs58::encode(&full_private_key).into_string());

    info!("RUST: Private key decrypted successfully with structured types");

    let result = DecryptPrivateKeyResult::new(
        private_key_near_format,
        request.near_account_id.clone()
    );

    Ok(result)
}

// ******************************************************************************
// *                                                                            *
// *                 HANDLER 6: SIGN TRANSACTIONS WITH ACTIONS                  *
// *                                                                            *
// ******************************************************************************

/// **Handles:** `WorkerRequestType::SignTransactionsWithActions`
/// This handler processes multiple transactions in a single batch, performing contract verification
/// once and then signing all transactions with the same decrypted private key. It provides detailed
/// progress updates and comprehensive error handling for each transaction in the batch.
///
/// # Arguments
/// * `tx_batch_request` - Contains verification data, decryption parameters, and array of transaction requests
///
/// # Returns
/// * `TransactionSignResult` - Contains success status, transaction hashes, signed transactions, and detailed logs
pub async fn handle_sign_transactions_with_actions_msg(tx_batch_request: SignTransactionsWithActionsPayload) -> Result<TransactionSignResult, String> {

    // Validate input
    if tx_batch_request.tx_signing_requests.is_empty() {
        return Err("No transactions provided".to_string());
    }

    let mut logs: Vec<String> = Vec::new();
    logs.push(format!("Processing {} transactions", tx_batch_request.tx_signing_requests.len()));

    // Send initial progress message
    send_progress_message(
        ProgressMessageType::ExecuteActionsProgress,
        ProgressStep::Preparation,
        "Starting batch transaction verification and signing...",
        Some(&serde_json::json!({"step": 1, "total": 4, "transaction_count": tx_batch_request.tx_signing_requests.len()}).to_string())
    );

    let vrf_challenge = &tx_batch_request.verification.vrf_challenge;
    let credential = tx_batch_request.verification.credential;

    let credential = WebAuthnAuthenticationCredentialStruct::new(
        credential.id,
        credential.raw_id,
        credential.credential_type,
        credential.authenticator_attachment,
        credential.response.client_data_json,
        credential.response.authenticator_data,
        credential.response.signature,
        credential.response.user_handle,
    );

    // Step 1: Contract verification (once for the entire batch)
    logs.push(format!("Starting contract verification for {}", tx_batch_request.verification.contract_id));

    // Send verification progress
    send_progress_message(
        ProgressMessageType::ExecuteActionsProgress,
        ProgressStep::WebauthnAuthentication,
        "Verifying credentials with contract...",
        Some(&serde_json::json!({"step": 2, "total": 4}).to_string())
    );

    // Convert structured types
    let vrf_data = VrfData::try_from(vrf_challenge)
        .map_err(|e| format!("Failed to convert VRF data: {:?}", e))?;
    let webauthn_auth = WebAuthnAuthenticationCredential::from(&credential);

    // Perform contract verification once for the entire batch
    let verification_result = match verify_authentication_response_rpc_call(
        &tx_batch_request.verification.contract_id,
        &tx_batch_request.verification.near_rpc_url,
        vrf_data,
        webauthn_auth,
    ).await {
        Ok(result) => {
            logs.extend(result.logs.clone());

            // Send verification complete progress
            send_completion_message(
                ProgressMessageType::ExecuteActionsProgress,
                ProgressStep::AuthenticationComplete,
                "Contract verification completed successfully",
                Some(&serde_json::json!({
                    "step": 2,
                    "total": 4,
                    "verified": result.verified,
                    "logs": result.logs
                }).to_string())
            );

            result
        }
        Err(e) => {
            let error_msg = format!("Contract verification failed: {}", e);
            logs.push(error_msg.clone());

            // Send error progress message
            send_error_message(
                ProgressMessageType::ExecuteActionsProgress,
                ProgressStep::Error,
                &error_msg,
                &e.to_string()
            );

            return Ok(TransactionSignResult::failed(logs, error_msg));
        }
    };

    if !verification_result.verified {
        let error_msg = verification_result.error.unwrap_or_else(|| "Contract verification failed".to_string());
        logs.push(error_msg.clone());

        send_error_message(
            ProgressMessageType::ExecuteActionsProgress,
            ProgressStep::Error,
            &error_msg,
            "verification failed"
        );

        return Ok(TransactionSignResult::failed(logs, error_msg));
    }

    logs.push("Contract verification successful".to_string());

    // Step 2: Batch transaction signing (verification already done once)
    logs.push(format!("Signing {} transactions in secure WASM context...", tx_batch_request.tx_signing_requests.len()));

    // Send signing progress
    send_progress_message(
        ProgressMessageType::ExecuteActionsProgress,
        ProgressStep::TransactionSigningProgress,
        "Decrypting private key and signing transactions...",
        Some(&serde_json::json!({"step": 3, "total": 4, "transaction_count": tx_batch_request.tx_signing_requests.len()}).to_string())
    );

    // Create shared decryption object
    let decryption = Decryption::new(
        tx_batch_request.decryption.chacha20_prf_output.clone(),
        tx_batch_request.decryption.encrypted_private_key_data.clone(),
        tx_batch_request.decryption.encrypted_private_key_iv.clone(),
    );

    // Process all transactions using the shared verification and decryption
    let tx_count = tx_batch_request.tx_signing_requests.len();
    let result = sign_near_transactions_with_actions_impl(
        tx_batch_request.tx_signing_requests,
        &decryption,
        logs,
    ).await?;

    // Send completion progress message
    send_completion_message(
        ProgressMessageType::ExecuteActionsProgress,
        ProgressStep::TransactionSigningComplete,
        &format!("{} transactions signed successfully", tx_count),
        Some(&serde_json::json!({
            "step": 4,
            "total": 4,
            "success": result.success,
            "transaction_count": tx_count,
            "logs": result.logs
        }).to_string())
    );

    Ok(result)
}

/// Internal implementation for batch transaction signing after verification is complete.
/// This function handles the actual signing logic for multiple transactions using a shared
/// decrypted private key. It processes each transaction individually, provides detailed logging
/// for each step, and handles errors gracefully while continuing with remaining transactions.
///
/// # Arguments
/// * `tx_requests` - Array of transaction payloads to sign
/// * `decryption` - Shared decryption parameters for private key access
/// * `logs` - Existing log entries to append to
///
/// # Returns
/// * `TransactionSignResult` - Contains batch signing results with individual transaction details
async fn sign_near_transactions_with_actions_impl(
    tx_requests: Vec<TransactionPayload>,
    decryption: &Decryption,
    mut logs: Vec<String>,
) -> Result<TransactionSignResult, String> {

    if tx_requests.is_empty() {
        let error_msg = "No transactions provided".to_string();
        logs.push(error_msg.clone());
        return Ok(TransactionSignResult::failed(logs, error_msg));
    }

    // Decrypt private key using the shared decryption data (use first transaction's signer account)
    let first_transaction = &tx_requests[0];

    // Validate that all transactions use the same NEAR account ID
    for tx in &tx_requests {
        if first_transaction.near_account_id != tx.near_account_id {
            let error_msg = format!("All transactions must use the same NEAR account ID");
            return Ok(TransactionSignResult::failed(logs, error_msg));
        }
    }

    logs.push(format!("Processing {} transactions", tx_requests.len()));
    let signing_key = crate::crypto::decrypt_private_key_with_prf(
        &first_transaction.near_account_id,
        &decryption.chacha20_prf_output,
        &decryption.encrypted_private_key_data,
        &decryption.encrypted_private_key_iv,
    ).map_err(|e| format!("Decryption failed: {}", e))?;

    logs.push("Private key decrypted successfully".to_string());

    // Process each transaction
    let mut signed_transactions_wasm = Vec::new();
    let mut transaction_hashes = Vec::new();

    for (index, tx_data) in tx_requests.iter().enumerate() {
        logs.push(format!("Processing transaction {} of {}", index + 1, tx_requests.len()));

        // Parse and build actions for this transaction
        let action_params: Vec<ActionParams> = match serde_json::from_str::<Vec<ActionParams>>(&tx_data.actions) {
            Ok(params) => {
                logs.push(format!("Transaction {}: Parsed {} actions", index + 1, params.len()));
                params
            }
            Err(e) => {
                let error_msg = format!("Transaction {}: Failed to parse actions: {}", index + 1, e);
                logs.push(error_msg.clone());
                return Ok(TransactionSignResult::failed(logs, error_msg));
            }
        };

        let actions = match build_actions_from_params(action_params) {
            Ok(actions) => {
                logs.push(format!("Transaction {}: Actions built successfully", index + 1));
                actions
            }
            Err(e) => {
                let error_msg = format!("Transaction {}: Failed to build actions: {}", index + 1, e);
                logs.push(error_msg.clone());
                return Ok(TransactionSignResult::failed(logs, error_msg));
            }
        };

        // Build and sign transaction
        let transaction = match build_transaction_with_actions(
            &tx_data.near_account_id,
            &tx_data.receiver_id,
            tx_data.nonce.parse().map_err(|e| format!("Invalid nonce: {}", e))?,
            &tx_data.block_hash_bytes,
            &signing_key,
            actions,
        ) {
            Ok(tx) => {
                logs.push(format!("Transaction {}: Built successfully", index + 1));
                tx
            }
            Err(e) => {
                let error_msg = format!("Transaction {}: Failed to build transaction: {}", index + 1, e);
                logs.push(error_msg.clone());
                return Ok(TransactionSignResult::failed(logs, error_msg));
            }
        };

        let signed_tx_bytes = match sign_transaction(transaction, &signing_key) {
            Ok(bytes) => {
                logs.push(format!("Transaction {}: Signed successfully", index + 1));
                bytes
            }
            Err(e) => {
                let error_msg = format!("Transaction {}: Failed to sign transaction: {}", index + 1, e);
                logs.push(error_msg.clone());
                return Ok(TransactionSignResult::failed(logs, error_msg));
            }
        };

        // Calculate transaction hash from signed transaction bytes (before moving the bytes)
        let transaction_hash = calculate_transaction_hash(&signed_tx_bytes);
        logs.push(format!("Transaction {}: Hash calculated - {}", index + 1, transaction_hash));

        // Create SignedTransaction from signed bytes
        let signed_tx: SignedTransaction = borsh::from_slice(&signed_tx_bytes)
            .map_err(|e| {
                let error_msg = format!("Transaction {}: Failed to deserialize SignedTransaction: {}", index + 1, e);
                logs.push(error_msg.clone());
                error_msg
            })?;

        let signed_tx_wasm = WasmSignedTransaction::from(&signed_tx);

        signed_transactions_wasm.push(signed_tx_wasm);
        transaction_hashes.push(transaction_hash);
    }

    logs.push(format!("All {} transactions signed successfully", signed_transactions_wasm.len()));
    info!("RUST: Batch signing completed successfully");

    Ok(TransactionSignResult::new(
        true,
        Some(transaction_hashes),
        Some(signed_transactions_wasm),
        logs,
        None,
    ))
}

// ******************************************************************************
// *                                                                            *
// *                    HANDLER 7: EXTRACT COSE PUBLIC KEY                      *
// *                                                                            *
// ******************************************************************************

/// **Handles:** `WorkerRequestType::ExtractCosePublicKey`
/// This handler parses a WebAuthn attestation object and extracts the COSE-formatted public key
/// for cryptographic operations. Used during registration to obtain the authenticator's public key
/// in a standardized format.
///
/// # Arguments
/// * `request` - Contains base64url-encoded attestation object
///
/// # Returns
/// * `CoseExtractionResult` - Contains extracted COSE public key bytes
pub async fn handle_extract_cose_public_key_msg(request: ExtractCosePayload) -> Result<CoseExtractionResult, String> {

    info!("RUST: WASM binding - extracting COSE public key from attestation object");

    let cose_public_key_bytes = crate::cose::extract_cose_public_key_from_attestation(&request.attestation_object_base64url)
        .map_err(|e| format!("Failed to extract COSE public key: {}", e))?;

    info!("RUST: WASM binding - COSE public key extraction successful ({} bytes)", cose_public_key_bytes.len());

    let result = CoseExtractionResult {
        cose_public_key_bytes: cose_public_key_bytes,
    };

    Ok(result)
}

// ******************************************************************************
// *                                                                            *
// *                 HANDLER 8: SIGN TRANSACTION WITH KEYPAIR                   *
// *                                                                            *
// ******************************************************************************

/// Signs a transaction using a provided private key without requiring WebAuthn authentication.
///
/// **Handles:** `WorkerRequestType::SignTransactionWithKeyPair`
///
/// This handler is used for key replacement operations where the application already has access
/// to a private key and needs to sign transactions directly. It bypasses the normal WebAuthn
/// authentication flow and signs transactions immediately.
///
/// # Arguments
/// * `request` - Contains NEAR private key, transaction details, and action parameters
///
/// # Returns
/// * `TransactionSignResult` - Contains signed transaction, transaction hash, and operation logs
pub async fn handle_sign_transaction_with_keypair_msg(request: SignTransactionWithKeyPairPayload) -> Result<TransactionSignResult, String> {

    let mut logs: Vec<String> = Vec::new();
    info!("RUST: WASM binding - starting transaction signing with provided private key");

    // Parse the private key from NEAR format (ed25519:base58_encoded_64_bytes)
    let private_key_str = if request.near_private_key.starts_with("ed25519:") {
        &request.near_private_key[8..] // Remove "ed25519:" prefix
    } else {
        return Err("Private key must be in ed25519: format".to_string());
    };

    // Decode the base58-encoded private key
    let private_key_bytes = bs58::decode(private_key_str)
        .into_vec()
        .map_err(|e| format!("Failed to decode private key: {}", e))?;

    if private_key_bytes.len() != 64 {
        return Err(format!("Invalid private key length: expected 64 bytes, got {}", private_key_bytes.len()));
    }

    // Extract the 32-byte seed (first 32 bytes)
    let seed_bytes: [u8; 32] = private_key_bytes[0..32].try_into()
        .map_err(|_| "Failed to extract seed from private key".to_string())?;

    // Create SigningKey from seed
    let signing_key = ed25519_dalek::SigningKey::from_bytes(&seed_bytes);

    logs.push("Private key parsed and signing key created".to_string());

    // Parse and build actions
    let action_params: Vec<ActionParams> = serde_json::from_str(&request.actions)
        .map_err(|e| format!("Failed to parse actions: {}", e))?;

    logs.push(format!("Parsed {} actions", action_params.len()));

    let actions = build_actions_from_params(action_params)
        .map_err(|e| format!("Failed to build actions: {}", e))?;

    // Build and sign transaction
    let transaction = build_transaction_with_actions(
        &request.signer_account_id,
        &request.receiver_id,
        request.nonce.parse().map_err(|e| format!("Invalid nonce: {}", e))?,
        &request.block_hash_bytes,
        &signing_key,
        actions,
    ).map_err(|e| format!("Failed to build transaction: {}", e))?;

    logs.push("Transaction built successfully".to_string());

    let signed_tx_bytes = sign_transaction(transaction, &signing_key)
        .map_err(|e| format!("Failed to sign transaction: {}", e))?;

    // Calculate transaction hash from signed transaction bytes (before moving the bytes)
    let transaction_hash = calculate_transaction_hash(&signed_tx_bytes);

    // Create SignedTransaction from signed bytes
    let signed_tx = crate::types::SignedTransaction::from_borsh_bytes(&signed_tx_bytes)
        .map_err(|e| format!("Failed to deserialize SignedTransaction: {}", e))?;

    let signed_tx_wasm = WasmSignedTransaction::from(&signed_tx);

    logs.push("Transaction signing completed successfully".to_string());

    Ok(TransactionSignResult::new(
        true,
        Some(vec![transaction_hash]),
        Some(vec![signed_tx_wasm]),
        logs,
        None,
    ))
}

// ******************************************************************************
// *                                                                            *
// *                        HANDLER 9: SIGN NEP-413 MESSAGE                    *
// *                                                                            *
// ******************************************************************************

/// **Handles:** `WorkerRequestType::SignNep413Message`
/// This handler implements NEP-413 message signing, which allows signing arbitrary off-chain messages
/// that cannot represent valid NEAR transactions. It follows the NEP-413 specification for message
/// structure, serialization, hashing, and signing.
///
/// # Arguments
/// * `request` - Contains message data, recipient, nonce, optional state, and decryption parameters
///
/// # Returns
/// * `SignNep413Result` - Contains signed message with account ID, public key, signature, and optional state
pub async fn handle_sign_nep413_message_msg(request: SignNep413Payload) -> Result<SignNep413Result, String> {
    info!("RUST: Starting NEP-413 message signing");

    // Validate nonce is exactly 32 bytes
    if request.nonce.len() != 32 {
        return Err(format!("Invalid nonce length: expected 32 bytes, got {}", request.nonce.len()));
    }

    // Decrypt private key using PRF output
    let signing_key = crate::crypto::decrypt_private_key_with_prf(
        &request.account_id,
        &request.prf_output,
        &request.encrypted_private_key_data,
        &request.encrypted_private_key_iv,
    ).map_err(|e| format!("Failed to decrypt private key: {}", e))?;

    // Create NEP-413 payload structure for Borsh serialization
    #[derive(borsh::BorshSerialize)]
    struct Nep413Payload {
        message: String,
        recipient: String,
        nonce: [u8; 32],
        state: Option<String>,
    }

    let nonce_array: [u8; 32] = request.nonce.try_into()
        .map_err(|_| "Failed to convert nonce to 32-byte array")?;

    let payload = Nep413Payload {
        message: request.message,
        recipient: request.recipient,
        nonce: nonce_array,
        state: request.state.clone(),
    };

    // Serialize with Borsh
    let serialized = borsh::to_vec(&payload)
        .map_err(|e| format!("Borsh serialization failed: {}", e))?;

    info!("RUST: NEP-413 payload serialized with Borsh ({} bytes)", serialized.len());

    // Prepend NEP-413 prefix (2^31 + 413 = 2147484061 in little-endian)
    let prefix: u32 = 2147484061;
    let mut prefixed_data = prefix.to_le_bytes().to_vec();
    prefixed_data.extend_from_slice(&serialized);

    info!("RUST: NEP-413 prefix added, total data size: {} bytes", prefixed_data.len());

    // Hash the prefixed data using SHA-256
    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    hasher.update(&prefixed_data);
    let hash = hasher.finalize();

    info!("RUST: SHA-256 hash computed");

    // Sign the hash using the Ed25519 private key
    use ed25519_dalek::Signer;
    let signature = signing_key.sign(&hash);

    // Get the public key from the signing key
    let verifying_key = signing_key.verifying_key();
    let public_key_bytes = verifying_key.to_bytes();
    let public_key_b58 = format!("ed25519:{}", bs58::encode(&public_key_bytes).into_string());

    // Encode signature as base64
    let signature_b64 = base64_standard_encode(&signature.to_bytes());

    info!("RUST: NEP-413 message signed successfully");

    Ok(SignNep413Result::new(
        request.account_id,
        public_key_b58,
        signature_b64,
        request.state,
    ))
}
