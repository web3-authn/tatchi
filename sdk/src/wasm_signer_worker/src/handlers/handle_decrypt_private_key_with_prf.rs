// ******************************************************************************
// *                                                                            *
// *                  HANDLER: DECRYPT PRIVATE KEY WITH PRF                   *
// *                                                                            *
// ******************************************************************************
use bs58;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::WrapKey;

// Export/decrypt confirmation has been moved to the VRF bridge; signer no longer owns awaitSecureConfirmationV2.
// Export flows must be VRF-prepared: this handler expects WrapKeySeed material injected via the
// session-bound WrapKeySeed MessagePort, never raw PRF outputs in the request payload.

#[wasm_bindgen]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecryptPrivateKeyRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "nearAccountId")]
    pub near_account_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "encryptedPrivateKeyData")]
    pub encrypted_private_key_data: String,
    /// ChaCha20-Poly1305 nonce (base64url) for `encryptedPrivateKeyData`.
    #[wasm_bindgen(getter_with_clone, js_name = "encryptedPrivateKeyChacha20NonceB64u")]
    pub encrypted_private_key_chacha20_nonce_b64u: String,
    #[wasm_bindgen(getter_with_clone, js_name = "sessionId")]
    pub session_id: String,
}

#[wasm_bindgen]
impl DecryptPrivateKeyRequest {
    #[wasm_bindgen(constructor)]
    pub fn new(
        near_account_id: String,
        encrypted_private_key_data: String,
        encrypted_private_key_chacha20_nonce_b64u: String,
        session_id: String,
    ) -> DecryptPrivateKeyRequest {
        DecryptPrivateKeyRequest {
            near_account_id,
            encrypted_private_key_data,
            encrypted_private_key_chacha20_nonce_b64u,
            session_id,
        }
    }
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecryptPrivateKeyResult {
    #[wasm_bindgen(getter_with_clone, js_name = "privateKey")]
    pub private_key: String,
    #[wasm_bindgen(getter_with_clone, js_name = "nearAccountId")]
    pub near_account_id: String,
}

#[wasm_bindgen]
impl DecryptPrivateKeyResult {
    #[wasm_bindgen(constructor)]
    pub fn new(private_key: String, near_account_id: String) -> DecryptPrivateKeyResult {
        DecryptPrivateKeyResult {
            private_key,
            near_account_id,
        }
    }
}

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
pub async fn handle_decrypt_private_key_with_prf(
    request: DecryptPrivateKeyRequest,
    wrap_key: WrapKey,
) -> Result<DecryptPrivateKeyResult, String> {
    // Derive KEK from WrapKeySeed + wrap_key_salt and decrypt
    let kek = wrap_key.derive_kek()?;

    let decrypted_private_key_str = crate::crypto::decrypt_data_chacha20(
        &request.encrypted_private_key_data,
        &request.encrypted_private_key_chacha20_nonce_b64u,
        &kek,
    )
    .map_err(|e| format!("Decryption failed: {}", e))?;

    // Convert decrypted string into SigningKey
    let decoded = bs58::decode(
        decrypted_private_key_str
            .strip_prefix("ed25519:")
            .unwrap_or(&decrypted_private_key_str),
    )
    .into_vec()
    .map_err(|e| format!("Invalid private key base58: {}", e))?;

    if decoded.len() < 32 {
        return Err("Decoded private key too short".to_string());
    }
    let secret_bytes: [u8; 32] = decoded[0..32]
        .try_into()
        .map_err(|_| "Invalid secret key length".to_string())?;

    let signing_key = ed25519_dalek::SigningKey::from_bytes(&secret_bytes);

    // Convert SigningKey to NEAR format (64 bytes: 32-byte seed + 32-byte public key)
    let verifying_key = signing_key.verifying_key();
    let public_key_bytes = verifying_key.to_bytes();
    let private_key_seed = signing_key.to_bytes();

    // NEAR Ed25519 format: 32-byte private key seed + 32-byte public key = 64 bytes total
    let mut full_private_key = Vec::with_capacity(64);
    full_private_key.extend_from_slice(&private_key_seed);
    full_private_key.extend_from_slice(&public_key_bytes);

    let private_key_near_format =
        format!("ed25519:{}", bs58::encode(&full_private_key).into_string());

    let result =
        DecryptPrivateKeyResult::new(private_key_near_format, request.near_account_id.clone());

    Ok(result)
}
