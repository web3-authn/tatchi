use bs58;
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{ChaCha20Poly1305, Nonce};
use getrandom::getrandom;
use hkdf::Hkdf;
use log::debug;
use sha2::Sha256;

use crate::config::{
    near_key_salt_for_account,
    CHACHA20_KEY_SIZE, CHACHA20_NONCE_SIZE, ED25519_HKDF_KEY_INFO, ED25519_PRIVATE_KEY_SIZE,
    ERROR_INVALID_KEY_SIZE,
};
use crate::encoders::{base64_url_decode, base64_url_encode};
use crate::error::KdfError;
use crate::types::EncryptedDataChaCha20Response;

/// Ephemeral wrap key material derived in the VRF worker and delivered to the signer.
/// Holds the base64url-encoded WrapKeySeed and its salt, and exposes a helper to derive KEK.
#[derive(Clone, Debug)]
pub struct WrapKey {
    pub(crate) wrap_key_seed: String,
    pub(crate) wrap_key_salt: String,
}

impl WrapKey {
    /// Derive KEK from the stored WrapKeySeed + wrap_key_salt using the shared HKDF helper.
    pub fn derive_kek(&self) -> Result<Vec<u8>, String> {
        derive_kek_from_wrap_key_seed(&self.wrap_key_seed, &self.wrap_key_salt)
            .map_err(|e| format!("WrapKeySeed → KEK derivation failed: {}", e))
    }

    /// Return the base64url-encoded wrap_key_salt associated with this wrap key.
    pub fn salt_b64u(&self) -> &str {
        &self.wrap_key_salt
    }
}

/// Derive KEK from WrapKeySeed + wrap_key_salt (HKDF)
pub(crate) fn derive_kek_from_wrap_key_seed(
    wrap_key_seed_b64u: &str,
    wrap_key_salt_b64u: &str,
) -> Result<Vec<u8>, KdfError> {
    let wrap_key_seed = base64_url_decode(wrap_key_seed_b64u)?;
    if wrap_key_seed.is_empty() {
        return Err(KdfError::InvalidInput("Empty WrapKeySeed".to_string()));
    }
    let wrap_key_salt = base64_url_decode(wrap_key_salt_b64u)?;
    let hk = Hkdf::<Sha256>::new(Some(&wrap_key_salt), &wrap_key_seed);
    let mut kek = vec![0u8; CHACHA20_KEY_SIZE];
    hk.expand(crate::config::NEAR_KEK_INFO, &mut kek)
        .map_err(|_| KdfError::HkdfError)?;
    Ok(kek)
}

// === CHACHA20POLY1305 ENCRYPTION/DECRYPTION ===

/// Encrypt data using ChaCha20Poly1305
pub(crate) fn encrypt_data_chacha20(
    plain_text_data_str: &str,
    key_bytes: &[u8],
) -> Result<EncryptedDataChaCha20Response, String> {
    if key_bytes.len() != CHACHA20_KEY_SIZE {
        return Err(ERROR_INVALID_KEY_SIZE.to_string());
    }

    let key = chacha20poly1305::Key::from_slice(key_bytes);
    let cipher = ChaCha20Poly1305::new(key);

    let mut nonce_bytes = [0u8; 12];
    getrandom(&mut nonce_bytes).map_err(|e| format!("Failed to generate nonce: {}", e))?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plain_text_data_str.as_bytes())
        .map_err(|e| format!("Encryption error: {}", e))?;

    Ok(EncryptedDataChaCha20Response {
        encrypted_near_key_data_b64u: base64_url_encode(&ciphertext),
        chacha20_nonce_b64u: base64_url_encode(&nonce_bytes),
        wrap_key_salt_b64u: None,
    })
}

/// Decrypt data using ChaCha20Poly1305
pub(crate) fn decrypt_data_chacha20(
    encrypted_data_b64u: &str,
    chacha20_nonce_b64u: &str,
    key_bytes: &[u8],
) -> Result<String, String> {
    if key_bytes.len() != CHACHA20_KEY_SIZE {
        return Err(ERROR_INVALID_KEY_SIZE.to_string());
    }

    let key = chacha20poly1305::Key::from_slice(key_bytes);
    let cipher = ChaCha20Poly1305::new(key);

    let nonce_bytes = base64_url_decode(chacha20_nonce_b64u)
        .map_err(|e| format!("Base64 decode error for ChaCha20 nonce: {}", e))?;
    if nonce_bytes.len() != CHACHA20_NONCE_SIZE {
        return Err(format!(
            "Decryption ChaCha20 nonce must be {} bytes.",
            CHACHA20_NONCE_SIZE
        ));
    }
    let nonce = Nonce::from_slice(&nonce_bytes);

    let encrypted_data = base64_url_decode(encrypted_data_b64u)
        .map_err(|e| format!("Base64 decode error for encrypted data: {}", e))?;

    let decrypted_bytes = cipher
        .decrypt(nonce, encrypted_data.as_slice())
        .map_err(|e| format!("Decryption error: {}", e))?;

    String::from_utf8(decrypted_bytes).map_err(|e| format!("UTF-8 decoding error: {}", e))
}

// === KEY GENERATION ===

/// Secure Ed25519 key derivation from PRF output (prf.results.second)
/// Pure PRF-based Ed25519 key derivation for signing purposes only
pub(crate) fn derive_ed25519_key_from_prf_output(
    prf_output_base64: &str,
    account_id: &str,
) -> Result<(String, String), KdfError> {
    // Decode PRF output from base64
    let prf_output = base64_url_decode(prf_output_base64)?;

    if prf_output.is_empty() {
        return Err(KdfError::InvalidInput("Empty PRF output".to_string()));
    }

    // Create account-specific salt for Ed25519 key derivation (different from ChaCha20)
    let ed25519_salt = near_key_salt_for_account(account_id);
    let salt_bytes = ed25519_salt.as_bytes();

    // Use HKDF with Ed25519-specific domain separation
    let hk = Hkdf::<Sha256>::new(Some(salt_bytes), &prf_output);
    let mut ed25519_key_material = [0u8; ED25519_PRIVATE_KEY_SIZE];

    let info = ED25519_HKDF_KEY_INFO.as_bytes();
    hk.expand(info, &mut ed25519_key_material)
        .map_err(|_| KdfError::HkdfError)?;

    // Create Ed25519 signing key from derived material
    let signing_key = ed25519_dalek::SigningKey::from_bytes(&ed25519_key_material);
    let verifying_key = signing_key.verifying_key();

    // Convert to NEAR format (64 bytes: 32-byte seed + 32-byte public key)
    let seed_bytes = signing_key.to_bytes(); // 32 bytes
    let public_key_bytes = verifying_key.to_bytes(); // 32 bytes

    // NEAR private key format: concatenate seed + public key (64 bytes total)
    let mut near_private_key_bytes = Vec::with_capacity(64);
    near_private_key_bytes.extend_from_slice(&seed_bytes);
    near_private_key_bytes.extend_from_slice(&public_key_bytes);

    let private_key_b58 = bs58::encode(&near_private_key_bytes).into_string();
    let public_key_b58 = bs58::encode(&public_key_bytes).into_string();

    let near_private_key = format!("ed25519:{}", private_key_b58);
    let near_public_key = format!("ed25519:{}", public_key_b58);

    debug!("Successfully derived Ed25519 key for account: {}", account_id);
    Ok((near_private_key, near_public_key))
}

// === RESPONSE HELPERS ===

impl EncryptedDataChaCha20Response {
    pub fn with_wrap_key_salt(mut self, wrap_key_salt: &[u8]) -> Self {
        self.wrap_key_salt_b64u = Some(base64_url_encode(wrap_key_salt));
        self
    }
}
