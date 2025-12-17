// ******************************************************************************
// *                                                                            *
// *                   HANDLER: RECOVER KEYPAIR FROM PASSKEY                  *
// *                                                                            *
// ******************************************************************************

use crate::{types::SerializedCredential, WrapKey};
use log::debug;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RecoverKeypairRequest {
    #[wasm_bindgen(getter_with_clone)]
    pub credential: SerializedCredential,
    #[wasm_bindgen(getter_with_clone, js_name = "accountIdHint")]
    pub account_id_hint: Option<String>,
    #[wasm_bindgen(getter_with_clone, js_name = "sessionId")]
    pub session_id: String,
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverKeypairResult {
    #[wasm_bindgen(getter_with_clone, js_name = "publicKey")]
    pub public_key: String,
    #[wasm_bindgen(getter_with_clone, js_name = "encryptedData")]
    pub encrypted_data: String,
    #[wasm_bindgen(getter_with_clone, js_name = "chacha20NonceB64u")]
    pub chacha20_nonce_b64u: String,
    #[wasm_bindgen(getter_with_clone, js_name = "wrapKeySalt")]
    pub wrap_key_salt: String,
    #[wasm_bindgen(getter_with_clone, js_name = "accountIdHint")]
    pub account_id_hint: Option<String>,
}

#[wasm_bindgen]
impl RecoverKeypairResult {
    #[wasm_bindgen(constructor)]
    pub fn new(
        public_key: String,
        encrypted_data: String,
        chacha20_nonce_b64u: String,
        wrap_key_salt: String,
        account_id_hint: Option<String>,
    ) -> RecoverKeypairResult {
        RecoverKeypairResult {
            public_key,
            encrypted_data,
            chacha20_nonce_b64u,
            wrap_key_salt,
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
    request: RecoverKeypairRequest,
    wrap_key: WrapKey,
) -> Result<RecoverKeypairResult, String> {
    let ed25519_prf_output = request
        .credential
        .client_extension_results
        .prf
        .results
        .second
        .ok_or_else(|| "Missing PRF output (second) in credential".to_string())?;

    debug!(
        "RUST: Parsed authentication credential with ID: {}",
        request.credential.id
    );
    // Use account hint if provided, otherwise generate placeholder
    let account_id = request
        .account_id_hint
        .as_deref()
        .unwrap_or("recovery-account.testnet");

    // Derive Ed25519 keypair from Ed25519 PRF output using account-specific HKDF
    // public_key already contains the ed25519: prefix from the crypto function
    let (private_key, public_key) =
        crate::crypto::derive_ed25519_key_from_prf_output(&ed25519_prf_output, account_id)
            .map_err(|e| format!("Failed to derive Ed25519 key: {}", e))?;

    let kek = wrap_key.derive_kek()?;

    let wrap_key_salt_bytes = crate::encoders::base64_url_decode(wrap_key.salt_b64u())
        .map_err(|e| format!("Failed to decode wrapKeySalt: {}", e))?;
    let encryption_result = crate::crypto::encrypt_data_chacha20(&private_key, &kek)
        .map_err(|e| format!("Failed to encrypt private key: {}", e))?
        .with_wrap_key_salt(&wrap_key_salt_bytes);

    debug!("[rust wasm]: Successfully derived NEAR keypair and encrypted with ChaCha20Poly1305");
    debug!("[rust wasm]: Key recovery from authentication credential successful");

    Ok(RecoverKeypairResult::new(
        public_key,
        encryption_result.encrypted_near_key_data_b64u,
        encryption_result.chacha20_nonce_b64u,
        wrap_key.salt_b64u().to_string(),
        Some(account_id.to_string()),
    ))
}
