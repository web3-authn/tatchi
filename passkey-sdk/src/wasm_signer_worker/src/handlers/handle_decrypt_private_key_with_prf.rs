// ******************************************************************************
// *                                                                            *
// *                  HANDLER: DECRYPT PRIVATE KEY WITH PRF                   *
// *                                                                            *
// ******************************************************************************
use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use log::info;
use bs58;

#[wasm_bindgen]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecryptPrivateKeyRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "nearAccountId")]
    pub near_account_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "chacha20PrfOutput")]
    pub chacha20_prf_output: String,
    #[wasm_bindgen(getter_with_clone, js_name = "encryptedPrivateKeyData")]
    pub encrypted_private_key_data: String,
    #[wasm_bindgen(getter_with_clone, js_name = "encryptedPrivateKeyIv")]
    pub encrypted_private_key_iv: String,
}

#[wasm_bindgen]
impl DecryptPrivateKeyRequest {
    #[wasm_bindgen(constructor)]
    pub fn new(
        near_account_id: String,
        chacha20_prf_output: String,
        encrypted_private_key_data: String,
        encrypted_private_key_iv: String,
    ) -> DecryptPrivateKeyRequest {
        DecryptPrivateKeyRequest {
            near_account_id,
            chacha20_prf_output,
            encrypted_private_key_data,
            encrypted_private_key_iv,
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
    request: DecryptPrivateKeyRequest
) -> Result<DecryptPrivateKeyResult, String> {

    // Use the core function to decrypt and get SigningKey
    let signing_key = crate::crypto::decrypt_private_key_with_prf(
        &request.near_account_id,
        &request.chacha20_prf_output,
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
