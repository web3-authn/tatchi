// ******************************************************************************
// *                                                                            *
// *                        HANDLER 9: SIGN NEP-413 MESSAGE                    *
// *                                                                            *
// ******************************************************************************
use crate::{encoders::base64_standard_encode, WrapKey};
use log::debug;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SignNep413Request {
    #[wasm_bindgen(getter_with_clone)]
    pub message: String, // Message to sign
    #[wasm_bindgen(getter_with_clone)]
    pub recipient: String, // Recipient identifier
    #[wasm_bindgen(getter_with_clone)]
    pub nonce: String, // Base64-encoded 32-byte nonce
    #[wasm_bindgen(getter_with_clone)]
    pub state: Option<String>, // Optional state
    #[wasm_bindgen(getter_with_clone, js_name = "accountId")]
    pub account_id: String, // NEAR account ID
    #[wasm_bindgen(getter_with_clone, js_name = "encryptedPrivateKeyData")]
    pub encrypted_private_key_data: String,
    /// ChaCha20-Poly1305 nonce (base64url) for `encryptedPrivateKeyData`.
    ///
    /// Accepts legacy `encryptedPrivateKeyIv` via serde alias.
    #[wasm_bindgen(getter_with_clone, js_name = "encryptedPrivateKeyChacha20NonceB64u")]
    #[serde(alias = "encryptedPrivateKeyIv")]
    pub encrypted_private_key_chacha20_nonce_b64u: String,
    #[wasm_bindgen(getter_with_clone, js_name = "sessionId")]
    pub session_id: String,
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignNep413Result {
    #[wasm_bindgen(getter_with_clone, js_name = "accountId")]
    pub account_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "publicKey")]
    pub public_key: String, // Base58-encoded public key
    #[wasm_bindgen(getter_with_clone)]
    pub signature: String, // Base64-encoded signature
    #[wasm_bindgen(getter_with_clone)]
    pub state: Option<String>,
}

#[wasm_bindgen]
impl SignNep413Result {
    #[wasm_bindgen(constructor)]
    pub fn new(
        account_id: String,
        public_key: String,
        signature: String,
        state: Option<String>,
    ) -> SignNep413Result {
        SignNep413Result {
            account_id,
            public_key,
            signature,
            state,
        }
    }
}

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
pub async fn handle_sign_nep413_message(
    request: SignNep413Request,
    wrap_key: WrapKey,
) -> Result<SignNep413Result, String> {
    debug!("RUST: Starting NEP-413 message signing");

    // Decode and validate nonce is exactly 32 bytes
    let nonce_bytes = crate::encoders::base64_standard_decode(&request.nonce)
        .map_err(|e| format!("Failed to decode nonce from base64: {}", e))?;

    if nonce_bytes.len() != 32 {
        return Err(format!(
            "Invalid nonce length: expected 32 bytes, got {}",
            nonce_bytes.len()
        ));
    }

    // Decrypt private key using WrapKey material for this session
    let kek = wrap_key.derive_kek()?;
    let decrypted_private_key_str = crate::crypto::decrypt_data_chacha20(
        &request.encrypted_private_key_data,
        &request.encrypted_private_key_chacha20_nonce_b64u,
        &kek,
    )
    .map_err(|e| format!("Failed to decrypt private key: {}", e))?;

    let signing_key = {
        use ed25519_dalek::SigningKey;

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

        SigningKey::from_bytes(&secret_bytes)
    };

    // Create NEP-413 payload structure for Borsh serialization
    #[derive(borsh::BorshSerialize)]
    struct Nep413Payload {
        message: String,
        recipient: String,
        nonce: [u8; 32],
        state: Option<String>,
    }

    let nonce_array: [u8; 32] = nonce_bytes
        .try_into()
        .map_err(|_| "Failed to convert nonce to 32-byte array")?;

    let payload = Nep413Payload {
        message: request.message,
        recipient: request.recipient,
        nonce: nonce_array,
        state: request.state.clone(),
    };

    // Serialize with Borsh
    let serialized =
        borsh::to_vec(&payload).map_err(|e| format!("Borsh serialization failed: {}", e))?;

    debug!(
        "RUST: NEP-413 payload serialized with Borsh ({} bytes)",
        serialized.len()
    );

    // Prepend NEP-413 prefix (2^31 + 413 = 2147484061 in little-endian)
    let prefix: u32 = 2147484061;
    let mut prefixed_data = prefix.to_le_bytes().to_vec();
    prefixed_data.extend_from_slice(&serialized);

    debug!(
        "RUST: NEP-413 prefix added, total data size: {} bytes",
        prefixed_data.len()
    );

    // Hash the prefixed data using SHA-256
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(&prefixed_data);
    let hash = hasher.finalize();

    debug!("RUST: SHA-256 hash computed");

    // Sign the hash using the Ed25519 private key
    use ed25519_dalek::Signer;
    let signature = signing_key.sign(&hash);

    // Get the public key from the signing key
    let verifying_key = signing_key.verifying_key();
    let public_key_bytes = verifying_key.to_bytes();
    let public_key_b58 = format!("ed25519:{}", bs58::encode(&public_key_bytes).into_string());

    // Encode signature as base64
    let signature_b64 = base64_standard_encode(&signature.to_bytes());

    debug!("RUST: NEP-413 message signed successfully");

    Ok(SignNep413Result::new(
        request.account_id,
        public_key_b58,
        signature_b64,
        request.state,
    ))
}
