// ******************************************************************************
// *                                                                            *
// *                        HANDLER 9: SIGN NEP-413 MESSAGE                    *
// *                                                                            *
// ******************************************************************************
use crate::{
    encoders::base64_standard_encode, threshold::signer_backend::Ed25519SignerBackend, WrapKey,
};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SignNep413Request {
    #[serde(default)]
    pub signer_mode: crate::types::SignerMode,
    pub message: String,         // Message to sign
    pub recipient: String,       // Recipient identifier
    pub nonce: String,           // Base64-encoded 32-byte nonce
    pub state: Option<String>,   // Optional state
    pub account_id: String,      // NEAR account ID
    pub near_public_key: String, // NEAR ed25519 public key (ed25519:<base58>)
    pub decryption: crate::types::DecryptionPayload,
    /// Threshold signer config (required when `signer_mode == threshold-signer`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub threshold: Option<crate::types::ThresholdSignerConfig>,
    pub session_id: String,
    /// VRF challenge data required for relayer authorization in threshold mode.
    pub vrf_challenge: Option<crate::types::VrfChallenge>,
    /// Serialized WebAuthn authentication credential JSON (used only for relayer authorization in threshold mode).
    pub credential: Option<String>,
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
    // Decode and validate nonce is exactly 32 bytes
    let nonce_bytes = crate::encoders::base64_standard_decode(&request.nonce)
        .map_err(|e| format!("Failed to decode nonce from base64: {}", e))?;

    if nonce_bytes.len() != 32 {
        return Err(format!(
            "Invalid nonce length: expected 32 bytes, got {}",
            nonce_bytes.len()
        ));
    }

    let signer = match request.signer_mode {
        crate::types::SignerMode::LocalSigner => {
            Ed25519SignerBackend::from_encrypted_near_private_key(
                crate::types::SignerMode::LocalSigner,
                &wrap_key,
                &request.decryption.encrypted_private_key_data,
                &request.decryption.encrypted_private_key_chacha20_nonce_b64u,
            )?
        }
        crate::types::SignerMode::ThresholdSigner => {
            let cfg = request
                .threshold
                .as_ref()
                .ok_or_else(|| "Missing threshold signer config".to_string())?;

            #[derive(Debug, Clone, Serialize)]
            #[serde(rename_all = "camelCase")]
            struct Nep413AuthorizeSigningPayload<'a> {
                kind: &'a str,
                near_account_id: &'a str,
                message: &'a str,
                recipient: &'a str,
                nonce: &'a str,
                #[serde(skip_serializing_if = "Option::is_none")]
                state: Option<&'a str>,
            }

            let signing_payload_json = {
                let js_val = serde_wasm_bindgen::to_value(&Nep413AuthorizeSigningPayload {
                    kind: "nep413",
                    near_account_id: request.account_id.as_str(),
                    message: request.message.as_str(),
                    recipient: request.recipient.as_str(),
                    nonce: request.nonce.as_str(),
                    state: request.state.as_deref(),
                })
                .map_err(|e| format!("Failed to serialize signingPayload: {e}"))?;
                js_sys::JSON::stringify(&js_val)
                    .map_err(|e| format!("JSON.stringify signingPayload failed: {:?}", e))?
                    .as_string()
                    .ok_or_else(|| {
                        "JSON.stringify signingPayload did not return a string".to_string()
                    })?
            };

            Ed25519SignerBackend::from_threshold_signer_config(
                &wrap_key,
                &request.account_id,
                &request.near_public_key,
                "nep413",
                request.vrf_challenge.clone(),
                request.credential.clone(),
                Some(signing_payload_json),
                cfg,
            )?
        }
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

    // Prepend NEP-413 prefix (2^31 + 413 = 2147484061 in little-endian)
    let prefix: u32 = 2147484061;
    let mut prefixed_data = prefix.to_le_bytes().to_vec();
    prefixed_data.extend_from_slice(&serialized);

    // Hash the prefixed data using SHA-256
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(&prefixed_data);
    let hash = hasher.finalize();

    // Sign the hash using the Ed25519 private key
    let signature_bytes = signer.sign(hash.as_slice()).await?;
    let public_key_bytes = signer.public_key_bytes()?;
    let public_key_b58 = format!("ed25519:{}", bs58::encode(&public_key_bytes).into_string());

    // Encode signature as base64
    let signature_b64 = base64_standard_encode(&signature_bytes);

    Ok(SignNep413Result::new(
        request.account_id,
        public_key_b58,
        signature_b64,
        request.state,
    ))
}
