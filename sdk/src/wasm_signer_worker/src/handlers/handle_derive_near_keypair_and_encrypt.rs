// ******************************************************************************
// *                                                                            *
// *                    HANDLER: DERIVE ED25519 KEYPAIR AND ENCRYPT                   *
// *                                                                            *
// ******************************************************************************

use log::debug;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::types::{AuthenticatorOptions, SerializedRegistrationCredential};
use crate::WrapKey;

#[wasm_bindgen]
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeriveNearKeypairAndEncryptRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "nearAccountId")]
    pub near_account_id: String,
    #[wasm_bindgen(getter_with_clone)]
    pub credential: SerializedRegistrationCredential,
    #[wasm_bindgen(getter_with_clone, js_name = "authenticatorOptions")]
    pub authenticator_options: Option<AuthenticatorOptions>,
    #[wasm_bindgen(getter_with_clone, js_name = "sessionId")]
    pub session_id: String,
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeriveNearKeypairAndEncryptResult {
    #[wasm_bindgen(getter_with_clone, js_name = "nearAccountId")]
    pub near_account_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "publicKey")]
    pub public_key: String,
    #[wasm_bindgen(getter_with_clone, js_name = "encryptedData")]
    pub encrypted_data: String,
    #[wasm_bindgen(getter_with_clone, js_name = "chacha20NonceB64u")]
    pub chacha20_nonce_b64u: String,
    #[wasm_bindgen(getter_with_clone, js_name = "wrapKeySalt")]
    pub wrap_key_salt: String,
    #[wasm_bindgen(getter_with_clone, js_name = "version")]
    pub version: u8,
    pub stored: bool,
}

#[wasm_bindgen]
impl DeriveNearKeypairAndEncryptResult {
    #[wasm_bindgen(constructor)]
    pub fn new(
        near_account_id: String,
        public_key: String,
        encrypted_data: String,
        chacha20_nonce_b64u: String,
        wrap_key_salt: String,
        version: u8,
        stored: bool,
    ) -> DeriveNearKeypairAndEncryptResult {
        DeriveNearKeypairAndEncryptResult {
            near_account_id,
            public_key,
            encrypted_data,
            chacha20_nonce_b64u,
            wrap_key_salt,
            version,
            stored,
        }
    }
}

/// **Handles:** `WorkerRequestType::DeriveNearKeypairAndEncrypt`
/// This is the primary handler for new device setup and linking. It performs the following operations:
/// 1. Derives Ed25519 keypair from PRF.second (delivered via MessagePort) using HKDF with account-specific salt
/// 2. Encrypts the private key using KEK derived from WrapKeySeed (delivered via MessagePort)
///
/// # Security Note
/// PRF outputs are delivered via MessagePort from VRF worker and never exposed to main thread.
///
/// # Arguments
/// * `request` - Contains account ID and WebAuthn credential metadata for derivation
/// * `wrap_key` - WrapKeySeed and wrapKeySalt delivered from VRF worker via MessagePort
/// * `prf_second_b64u` - PRF.second output retrieved from session storage (delivered via MessagePort)
///
/// # Returns
/// * `DeriveNearKeypairResult` - Contains derived public key, encrypted private key data, and optional signed transaction
pub async fn handle_derive_near_keypair_and_encrypt(
    request: DeriveNearKeypairAndEncryptRequest,
    wrap_key: WrapKey,
    prf_second_b64u: String,
) -> Result<DeriveNearKeypairAndEncryptResult, String> {
    debug!("[rust wasm]: starting PRF-based keypair derivation (secure MessagePort flow)");

    // Derive Ed25519 keypair from PRF.second (delivered securely via MessagePort)
    let (near_private_key, near_public_key) = crate::crypto::derive_ed25519_key_from_prf_output(
        &prf_second_b64u,
        &request.near_account_id,
    )
    .map_err(|e| format!("Failed to derive Ed25519 key from PRF.second: {}", e))?;

    // Derive KEK from WrapKeySeed+wrapKeySalt and encrypt NEAR private key
    let kek = wrap_key.derive_kek()?;

    let wrap_key_salt_bytes = crate::encoders::base64_url_decode(wrap_key.salt_b64u())
        .map_err(|e| format!("Failed to decode wrapKeySalt: {}", e))?;
    let encryption_result = crate::crypto::encrypt_data_chacha20(&near_private_key, &kek)
        .map_err(|e| format!("Failed to encrypt private key: {}", e))?
        .with_wrap_key_salt(&wrap_key_salt_bytes);

    // Return structured result
    Ok(DeriveNearKeypairAndEncryptResult::new(
        request.near_account_id,
        near_public_key,
        encryption_result.encrypted_near_key_data_b64u,
        encryption_result.chacha20_nonce_b64u,
        encryption_result
            .wrap_key_salt_b64u
            .unwrap_or_else(|| "".to_string()),
        2,
        true, // stored = true since we're storing in WASM
    ))
}
