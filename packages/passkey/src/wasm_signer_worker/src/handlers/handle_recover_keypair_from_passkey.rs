// ******************************************************************************
// *                                                                            *
// *                   HANDLER: RECOVER KEYPAIR FROM PASSKEY                  *
// *                                                                            *
// ******************************************************************************

use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use log::info;
use crate::types::{
    SerializedCredential,
};

#[wasm_bindgen]
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RecoverKeypairRequest {
    #[wasm_bindgen(getter_with_clone)]
    pub credential: SerializedCredential,
    #[wasm_bindgen(getter_with_clone, js_name = "accountIdHint")]
    pub account_id_hint: Option<String>,
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverKeypairResult {
    #[wasm_bindgen(getter_with_clone, js_name = "publicKey")]
    pub public_key: String,
    #[wasm_bindgen(getter_with_clone, js_name = "encryptedData")]
    pub encrypted_data: String,
    #[wasm_bindgen(getter_with_clone)]
    pub iv: String,
    #[wasm_bindgen(getter_with_clone, js_name = "accountIdHint")]
    pub account_id_hint: Option<String>,
}

#[wasm_bindgen]
impl RecoverKeypairResult {
    #[wasm_bindgen(constructor)]
    pub fn new(public_key: String, encrypted_data: String, iv: String, account_id_hint: Option<String>) -> RecoverKeypairResult {
        RecoverKeypairResult {
            public_key,
            encrypted_data,
            iv,
            account_id_hint,
        }
    }
}

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
pub async fn handle_recover_keypair_from_passkey(
    request: RecoverKeypairRequest
) -> Result<RecoverKeypairResult, String> {

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
