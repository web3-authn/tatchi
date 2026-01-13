//! Shamir 3-pass Protocol Implementation
//!
//! This module implements the Shamir 3-pass protocol for commutative encryption,
//! allowing a client and server to cooperatively encrypt/decrypt data without
//! either party seeing the plaintext.
//!
//! # Protocol Overview
//!
//! Registration:
//! 1. Client generates random KEK, encrypts VRF key
//! 2. Client adds temporary lock to KEK → KEK_c
//! 3. Server adds its lock → KEK_cs
//! 4. Client removes its lock → KEK_s (stored)
//!
//! Login:
//! 1. Client adds new temporary lock to KEK_s → KEK_st
//! 2. Server removes its lock → KEK_t
//! 3. Client removes its lock → KEK (original)
//! 4. Client decrypts VRF key with KEK

#[cfg(test)]
mod tests_integration;
#[cfg(test)]
mod tests_unit;

use crate::config::{
    DEFAULT_SHAMIR_P_B64U, SHAMIR_MIN_PRIME_BITS, SHAMIR_RANDOM_BYTES_OVERHEAD,
    SHAMIR_REJECTION_SAMPLING_MAX_ATTEMPTS,
};
use base64ct::{Base64UrlUnpadded, Encoding};
use chacha20poly1305::{
    aead::{generic_array::GenericArray, Aead, Key},
    ChaCha20Poly1305, KeyInit,
};
use getrandom::getrandom;
use hkdf::Hkdf;
use num_bigint::{BigInt, BigUint, Sign};
use num_integer::Integer;
use num_traits::{One, Zero};
use sha2::Sha256;
use wasm_bindgen::prelude::*;

// Error types for better error handling
#[derive(Debug)]
pub enum Shamir3PassError {
    InvalidPrime(String),
    PrimeTooSmall { bits: usize, min_bits: usize },
    ModularInverseNotFound,
    RandomGenerationFailed,
    EncryptionFailed(String),
    DecryptionFailed(String),
    SerializationError(String),
}

impl From<Shamir3PassError> for JsValue {
    fn from(err: Shamir3PassError) -> JsValue {
        JsValue::from_str(&format!("Shamir3Pass error: {:?}", err))
    }
}

/// Client lock keys for adding/removing locks
#[derive(Clone, Debug)]
pub struct ClientLockKeys {
    pub e: BigUint, // Encryption exponent (add lock)
    pub d: BigUint, // Decryption exponent (remove lock)
}

/// Shamir 3-pass protocol implementation
#[derive(Clone, Debug)]
pub struct Shamir3Pass {
    p: BigUint,
    p_minus_1: BigUint, // Cached for efficiency
    min_k: BigUint,     // Minimum value for k (security bound)
    max_k: BigUint,     // Maximum value for k (p-2)
}

impl Shamir3Pass {
    /// Create a new instance with the given prime p
    pub fn new(p_b64u: &str) -> Result<Self, Shamir3PassError> {
        let p = decode_biguint_b64u(p_b64u).map_err(|_| {
            Shamir3PassError::InvalidPrime("Invalid base64url encoding".to_string())
        })?;

        Self::new_with_biguint(p)
    }

    /// Create instance with default hardcoded prime
    pub fn new_default() -> Self {
        let p = decode_biguint_b64u(DEFAULT_SHAMIR_P_B64U).expect("Invalid default prime");
        Self::new_with_biguint_unchecked(p)
    }

    /// Create instance with a BigUint prime
    fn new_with_biguint(p: BigUint) -> Result<Self, Shamir3PassError> {
        // Validate prime size
        let bits = p.bits();
        if bits < SHAMIR_MIN_PRIME_BITS as u64 {
            return Err(Shamir3PassError::PrimeTooSmall {
                bits: bits as usize,
                min_bits: SHAMIR_MIN_PRIME_BITS,
            });
        }

        Ok(Self::new_with_biguint_unchecked(p))
    }

    /// Create instance with a BigUint prime without size validation (for default prime)
    fn new_with_biguint_unchecked(p: BigUint) -> Self {
        // TODO: Add primality test for production use
        // For now, we trust that provided primes are actually prime

        let one = BigUint::one();
        let two = &one + &one;
        let p_minus_1 = &p - &one;
        let p_minus_2 = &p - &two;

        // Security bound: k should be at least 2^64 for 64-bit security (reduced for smaller primes)
        let min_k = if p.bits() >= 1024 {
            BigUint::from(1u128 << 64) // Conservative lower bound for large primes
        } else {
            BigUint::from(1u64 << 32) // Reduced bound for smaller primes (like our 256-bit default)
        };

        Shamir3Pass {
            p,
            p_minus_1,
            min_k,
            max_k: p_minus_2,
        }
    }

    /// Get the prime p
    pub fn p(&self) -> &BigUint {
        &self.p
    }

    /// Get prime as base64url string
    pub fn p_b64u(&self) -> String {
        encode_biguint_b64u(&self.p)
    }

    /// Modular exponentiation with input validation
    pub fn modexp(&self, base: &BigUint, exp: &BigUint) -> BigUint {
        if self.p.is_zero() {
            return BigUint::zero();
        }
        base.modpow(exp, &self.p)
    }

    /// Compute modular inverse using extended Euclidean algorithm
    pub fn modinv(&self, a: &BigUint) -> Option<BigUint> {
        let a_bigint = BigInt::from_biguint(Sign::Plus, a.clone());
        let m_bigint = BigInt::from_biguint(Sign::Plus, self.p_minus_1.clone());

        let (gcd, x, _) = extended_gcd(a_bigint, m_bigint.clone());

        if gcd != BigInt::one() {
            return None;
        }

        // Ensure positive result
        let mut x_mod = x % &m_bigint;
        if x_mod.sign() == Sign::Minus {
            x_mod += &m_bigint;
        }

        Some(x_mod.to_biguint().unwrap())
    }

    /// Generate random k in range [min_k, p-2] using rejection sampling
    pub fn random_k(&self) -> Result<BigUint, Shamir3PassError> {
        // Use rejection sampling for uniform distribution
        let range = &self.max_k - &self.min_k;
        let bytes_needed = ((range.bits() + 7) / 8 + SHAMIR_RANDOM_BYTES_OVERHEAD as u64) as usize;

        for _ in 0..SHAMIR_REJECTION_SAMPLING_MAX_ATTEMPTS {
            let mut buf = vec![0u8; bytes_needed];
            getrandom(&mut buf).map_err(|_| Shamir3PassError::RandomGenerationFailed)?;

            let candidate = BigUint::from_bytes_be(&buf) % &range;
            let k = &self.min_k + candidate;

            // Ensure gcd(k, p-1) = 1
            if k.gcd(&self.p_minus_1) == BigUint::one() {
                return Ok(k);
            }
        }

        Err(Shamir3PassError::RandomGenerationFailed)
    }

    /// Generate client lock keys (e, d) where e*d ≡ 1 (mod p-1)
    pub fn generate_lock_keys(&self) -> Result<ClientLockKeys, Shamir3PassError> {
        let e = self.random_k()?;
        let d = self
            .modinv(&e)
            .ok_or(Shamir3PassError::ModularInverseNotFound)?;

        Ok(ClientLockKeys { e, d })
    }

    /// Encrypt data with a fresh random KEK key
    /// Returns (ciphertext, kek_key)
    pub fn encrypt_with_random_kek_key(
        &self,
        plaintext: &[u8],
    ) -> Result<(Vec<u8>, BigUint), Shamir3PassError> {
        let kek = self.random_k()?;
        let ciphertext = self.encrypt_with_kek(&kek, plaintext)?;
        Ok((ciphertext, kek))
    }

    /// Decrypt data with provided KEK key
    pub fn decrypt_with_key(
        &self,
        ciphertext: &[u8],
        kek: &BigUint,
    ) -> Result<Vec<u8>, Shamir3PassError> {
        self.decrypt_with_kek(kek, ciphertext)
    }

    /// Add a lock: compute base^exponent mod p
    pub fn add_lock(&self, base: &BigUint, exponent: &BigUint) -> BigUint {
        self.modexp(base, exponent)
    }

    /// Remove a lock: compute base^exponent mod p (same operation)
    pub fn remove_lock(&self, base: &BigUint, exponent: &BigUint) -> BigUint {
        self.modexp(base, exponent)
    }

    // Private helper methods

    /// Derive AEAD key from KEK using HKDF
    fn derive_aead_key(&self, kek_bytes: &[u8]) -> Result<[u8; 32], Shamir3PassError> {
        let hkdf = Hkdf::<Sha256>::new(None, kek_bytes);
        let mut key = [0u8; 32];
        hkdf.expand(crate::config::SHAMIR_AEAD_HKDF_INFO, &mut key)
            .map_err(|_| Shamir3PassError::EncryptionFailed("HKDF expansion failed".to_string()))?;
        Ok(key)
    }

    /// Encrypt data using KEK-derived AEAD key
    fn encrypt_with_kek(
        &self,
        kek: &BigUint,
        plaintext: &[u8],
    ) -> Result<Vec<u8>, Shamir3PassError> {
        let kek_bytes = kek.to_bytes_be();
        let key_bytes = self.derive_aead_key(&kek_bytes)?;

        let cipher = ChaCha20Poly1305::new(Key::<ChaCha20Poly1305>::from_slice(&key_bytes));

        let mut nonce = [0u8; 12];
        getrandom(&mut nonce).map_err(|_| Shamir3PassError::RandomGenerationFailed)?;
        let nonce_ga = GenericArray::from_slice(&nonce);

        let ciphertext = cipher
            .encrypt(nonce_ga, plaintext)
            .map_err(|e| Shamir3PassError::EncryptionFailed(e.to_string()))?;

        // Prepend nonce to ciphertext
        let mut result = nonce.to_vec();
        result.extend_from_slice(&ciphertext);
        Ok(result)
    }

    /// Decrypt data using KEK-derived AEAD key
    fn decrypt_with_kek(
        &self,
        kek: &BigUint,
        ciphertext: &[u8],
    ) -> Result<Vec<u8>, Shamir3PassError> {
        if ciphertext.len() < 12 {
            return Err(Shamir3PassError::DecryptionFailed(
                "Ciphertext too short".to_string(),
            ));
        }

        let (nonce_bytes, ct) = ciphertext.split_at(12);

        let kek_bytes = kek.to_bytes_be();
        let key_bytes = self.derive_aead_key(&kek_bytes)?;

        let cipher = ChaCha20Poly1305::new(Key::<ChaCha20Poly1305>::from_slice(&key_bytes));
        let nonce_ga = GenericArray::from_slice(nonce_bytes);

        cipher
            .decrypt(nonce_ga, ct)
            .map_err(|e| Shamir3PassError::DecryptionFailed(e.to_string()))
    }
}

// Utility functions

/// Extended Euclidean algorithm
fn extended_gcd(a: BigInt, b: BigInt) -> (BigInt, BigInt, BigInt) {
    if b.is_zero() {
        return (a, BigInt::one(), BigInt::zero());
    }

    let (gcd, x1, y1) = extended_gcd(b.clone(), &a % &b);
    let x = y1.clone();
    let y = x1 - (&a / &b) * y1;

    (gcd, x, y)
}

/// Encode BigUint as base64url
pub fn encode_biguint_b64u(x: &BigUint) -> String {
    Base64UrlUnpadded::encode_string(&x.to_bytes_be())
}

/// Decode BigUint from base64url
pub fn decode_biguint_b64u(s: &str) -> Result<BigUint, JsValue> {
    let bytes =
        Base64UrlUnpadded::decode_vec(s).map_err(|_| JsValue::from_str("Invalid base64url"))?;
    Ok(BigUint::from_bytes_be(&bytes))
}

// WASM exports

#[wasm_bindgen]
pub fn get_shamir_p_b64u() -> String {
    DEFAULT_SHAMIR_P_B64U.to_string()
}

#[wasm_bindgen(js_name = SHAMIR_P_B64U)]
pub fn export_shamir_p_b64u_const() -> String {
    DEFAULT_SHAMIR_P_B64U.to_string()
}
