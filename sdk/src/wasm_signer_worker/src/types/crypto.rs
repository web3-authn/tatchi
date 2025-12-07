// === CRYPTOGRAPHIC TYPES ===
// Dual PRF, encryption, and key derivation types

use serde::{Deserialize, Serialize};

/// Dual PRF outputs for separate encryption and signing key derivation
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DualPrfOutputs {
    /// Base64-encoded PRF output from prf.results.first for AES-GCM encryption
    pub chacha20_prf_output_base64: String,
    /// Base64-encoded PRF output from prf.results.second for Ed25519 signing
    pub ed25519_prf_output_base64: String,
}

/// Updated derivation request supporting dual PRF workflow
/// Replaces single PRF approach with separate encryption/signing key derivation
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DualPrfDeriveKeypairRequest {
    /// Dual PRF outputs for separate AES and Ed25519 key derivation
    pub dual_prf_outputs: DualPrfOutputs,
    /// NEAR account ID for HKDF context and keypair association
    pub account_id: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct EncryptedDataChaCha20Response {
    pub encrypted_near_key_data_b64u: String,
    pub chacha20_nonce_b64u: String,
    pub wrap_key_salt_b64u: Option<String>,
}
