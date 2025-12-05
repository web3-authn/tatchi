use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{ChaCha20Poly1305, Nonce};
use getrandom::getrandom;
use hkdf::Hkdf;
use js_sys::Date;
use log::{debug, warn};
use rand_core::SeedableRng;
use sha2::{Digest, Sha256};
// VRF and crypto imports
use vrf_wasm::ecvrf::ECVRFKeyPair;
use vrf_wasm::traits::WasmRngFromSeed;
use vrf_wasm::vrf::{VRFKeyPair, VRFProof};
use zeroize::ZeroizeOnDrop;

use crate::config::*;
use crate::errors::{AesError, HkdfError, SerializationError, VrfResult, VrfWorkerError};
use crate::handlers::DeterministicVrfKeypairResponse;
use crate::shamir3pass::Shamir3Pass;
use crate::types::*;
use crate::types::{EncryptedVrfKeypairResponse, GenerateVrfKeypairBootstrapResponse};
use crate::utils::{base64_url_decode, base64_url_encode, parse_block_height};

// === SECURE VRF KEYPAIR WRAPPER ===

/// Secure VRF keypair wrapper with automatic memory zeroization
#[derive(ZeroizeOnDrop)]
pub struct SecureVRFKeyPair {
    keypair: ECVRFKeyPair,
}

impl SecureVRFKeyPair {
    pub fn new(keypair: ECVRFKeyPair) -> Self {
        Self { keypair }
    }

    pub fn inner(&self) -> &ECVRFKeyPair {
        &self.keypair
    }

    pub fn secret_key_bytes(&self) -> Vec<u8> {
        // vrf-wasm 0.8.4 exposes secret_key_bytes()
        self.keypair.secret_key_bytes().to_vec()
    }
}

// === VRF KEY MANAGER ===

pub struct VRFKeyManager {
    pub vrf_keypair: Option<SecureVRFKeyPair>,
    pub session_active: bool,
    pub session_start_time: f64,
    // Shamir 3-pass configs
    pub shamir3pass: Shamir3Pass,
    pub relay_server_url: Option<String>,
    pub apply_lock_route: Option<String>,
    pub remove_lock_route: Option<String>,
}

impl VRFKeyManager {
    pub fn new(
        shamir_p_b64u: Option<&str>,
        relay_server_url: Option<String>,
        apply_lock_route: Option<String>,
        remove_lock_route: Option<String>,
    ) -> Self {
        let shamir3pass = match shamir_p_b64u {
            Some(p) => match Shamir3Pass::new(p) {
                Ok(sp) => sp,
                Err(e) => {
                    warn!(
                        "Failed to create Shamir3Pass with provided p: {:?}, using default",
                        e
                    );
                    Shamir3Pass::new_default()
                }
            },
            None => Shamir3Pass::new_default(),
        };

        Self {
            vrf_keypair: None,
            session_active: false,
            session_start_time: 0.0,
            shamir3pass,
            relay_server_url,
            apply_lock_route,
            remove_lock_route,
        }
    }

    /// Get a reference to the Shamir3Pass instance
    pub fn shamir3pass(&self) -> &Shamir3Pass {
        &self.shamir3pass
    }

    /// Get a mutable reference to the Shamir3Pass instance
    pub fn shamir3pass_mut(&mut self) -> &mut Shamir3Pass {
        &mut self.shamir3pass
    }

    /// Get secret key bytes for the current VRF keypair (error if not unlocked)
    pub fn get_vrf_secret_key_bytes(&self) -> VrfResult<Vec<u8>> {
        if !self.session_active {
            return Err(VrfWorkerError::NoVrfKeypair);
        }
        let sk = self
            .vrf_keypair
            .as_ref()
            .ok_or_else(|| VrfWorkerError::NoVrfKeypair)?;
        Ok(sk.secret_key_bytes())
    }

    pub fn generate_vrf_keypair_bootstrap(
        &mut self,
        vrf_input_data: Option<VRFInputData>,
    ) -> VrfResult<GenerateVrfKeypairBootstrapResponse> {
        debug!("Generating VRF keypair for bootstrapping");
        debug!("VRF keypair will be stored in memory unencrypted until PRF encryption");

        // Clear any existing keypair (zeroization via ZeroizeOnDrop)
        self.vrf_keypair.take();

        // Generate VRF keypair with cryptographically secure randomness
        let vrf_keypair = self.generate_vrf_keypair()?;

        // Get public key bytes for response
        let vrf_public_key_bytes = bincode::serialize(&vrf_keypair.pk).map_err(|e| {
            VrfWorkerError::SerializationError(SerializationError::VrfPublicKeySerialization(
                format!("{:?}", e),
            ))
        })?;
        let vrf_public_key_b64 = base64_url_encode(&vrf_public_key_bytes);

        // Store VRF keypair in memory (unencrypted)
        self.vrf_keypair = Some(SecureVRFKeyPair::new(vrf_keypair));
        self.session_active = true;
        self.session_start_time = Date::now();

        let mut result = GenerateVrfKeypairBootstrapResponse {
            vrf_public_key: vrf_public_key_b64,
            vrf_challenge_data: None,
        };

        // Generate VRF challenge if input parameters provided
        if let Some(vrf_input_data) = vrf_input_data {
            debug!("Generating VRF challenge using bootstrapped keypair");
            let vrf_keypair = self.vrf_keypair.as_ref().unwrap().inner();
            let challenge_result =
                self.generate_vrf_challenge_with_keypair(vrf_keypair, vrf_input_data)?;
            result.vrf_challenge_data = Some(challenge_result);
        }

        debug!("VRF challenge generated successfully");
        Ok(result)
    }

    /// Encrypt VRF keypair with PRF output - looks up in-memory keypair and encrypts it
    /// This is called after WebAuthn ceremony to encrypt the same VRF keypair with real PRF
    pub fn encrypt_vrf_keypair_with_prf(
        &mut self,
        expected_public_key: String,
        prf_key: Vec<u8>,
    ) -> VrfResult<EncryptedVrfKeypairResponse> {
        debug!(
            "Encrypting VRF keypair with PRF output. Expected public key: {}...",
            &expected_public_key[..DISPLAY_TRUNCATE_LENGTH.min(expected_public_key.len())]
        );

        // Verify we have an active VRF keypair in memory
        if !self.session_active || self.vrf_keypair.is_none() {
            return Err(VrfWorkerError::NoVrfKeypair);
        }

        // Get the VRF keypair from memory and extract its public key
        let vrf_keypair = self.vrf_keypair.as_ref().unwrap().inner();
        let stored_public_key_bytes = bincode::serialize(&vrf_keypair.pk)
            .map_err(|e| format!("Failed to serialize stored VRF public key: {:?}", e))?;
        let stored_public_key = base64_url_encode(&stored_public_key_bytes);

        // Verify the public key matches what's expected
        if stored_public_key != expected_public_key {
            return Err(VrfWorkerError::public_key_mismatch(
                &expected_public_key,
                &stored_public_key,
            ));
        }
        debug!("Public key verification successful");

        // Encrypt the VRF keypair
        let (vrf_public_key, encrypted_vrf_keypair) =
            self.encrypt_vrf_keypair_data(vrf_keypair, &prf_key)?;
        debug!("VRF keypair encrypted with PRF output");

        Ok(EncryptedVrfKeypairResponse {
            vrf_public_key,
            encrypted_vrf_keypair,
        })
    }

    pub fn unlock_vrf_keypair(
        &mut self,
        near_account_id: String,
        encrypted_vrf_keypair: EncryptedVRFKeypair,
        prf_key: Vec<u8>,
    ) -> VrfResult<()> {
        debug!("Unlocking VRF keypair for {}", near_account_id);
        // Clear any existing keypair (zeroization via ZeroizeOnDrop)
        self.vrf_keypair.take();

        // Decrypt VRF keypair using PRF-derived AES key
        let decrypted_keypair = self.decrypt_vrf_keypair(encrypted_vrf_keypair, prf_key)?;

        // Wrap in secure container for automatic zeroization
        self.vrf_keypair = Some(SecureVRFKeyPair::new(decrypted_keypair));
        self.session_active = true;
        self.session_start_time = Date::now();

        debug!("VRF keypair unlocked successfully");
        Ok(())
    }

    /// Load a plaintext VRF keypair from VRFKeypairData (used after Shamir 3‑pass unlock)
    pub fn load_plaintext_vrf_keypair(
        &mut self,
        near_account_id: String,
        keypair_data: VRFKeypairData,
    ) -> VrfResult<()> {
        debug!("Loading VRF keypair for {}", near_account_id);
        // Clear any existing keypair
        self.vrf_keypair.take();
        // Reconstruct ECVRFKeyPair from stored bytes
        let keypair: ECVRFKeyPair = bincode::deserialize(&keypair_data.keypair_bytes)?;
        self.vrf_keypair = Some(SecureVRFKeyPair::new(keypair));
        self.session_active = true;
        self.session_start_time = Date::now();
        Ok(())
    }

    pub fn generate_vrf_challenge(&self, input_data: VRFInputData) -> VrfResult<VRFChallengeData> {
        if !self.session_active || self.vrf_keypair.is_none() {
            return Err(VrfWorkerError::VrfNotUnlocked);
        }

        debug!("Generating VRF challenge");
        let vrf_keypair = self.vrf_keypair.as_ref().unwrap().inner();

        self.generate_vrf_challenge_with_keypair(vrf_keypair, input_data)
    }

    /// Generate VRF challenge using a specific keypair (can be in-memory or provided)
    pub fn generate_vrf_challenge_with_keypair(
        &self,
        vrf_keypair: &ECVRFKeyPair,
        input_data: VRFInputData,
    ) -> VrfResult<VRFChallengeData> {
        debug!("Generating VRF challenge using provided keypair");

        // Construct VRF input according to specification from the contract test
        let domain_separator = VRF_DOMAIN_SEPARATOR;
        let user_id_bytes = input_data.user_id.as_bytes();
        let rp_id_bytes = input_data.rp_id.as_bytes();
        let block_height_num = parse_block_height(&input_data.block_height)?;
        let block_height_bytes = block_height_num.to_le_bytes();

        // Decode block_hash from base58 string to bytes
        let block_hash_bytes = bs58::decode(&input_data.block_hash)
            .into_vec()
            .map_err(|e| VrfWorkerError::invalid_format(&format!("invalid blockHash: {}", e)))?;

        // Concatenate all input components following the test pattern
        let mut vrf_input_data = Vec::new();
        vrf_input_data.extend_from_slice(domain_separator);
        vrf_input_data.extend_from_slice(user_id_bytes);
        vrf_input_data.extend_from_slice(rp_id_bytes);
        vrf_input_data.extend_from_slice(&block_height_bytes);
        vrf_input_data.extend_from_slice(&block_hash_bytes);

        // Hash the input data (VRF input should be hashed)
        let vrf_input = Sha256::digest(&vrf_input_data).to_vec();

        // Generate VRF proof and output using the proper vrf-wasm API
        let proof = vrf_keypair.prove(&vrf_input);
        let vrf_output = proof.to_hash().to_vec();

        let proof_bytes = bincode::serialize(&proof).map_err(|e| {
            VrfWorkerError::SerializationError(SerializationError::VrfKeypairSerialization(
                format!("{:?}", e),
            ))
        })?;
        let pk_bytes = bincode::serialize(&vrf_keypair.pk).map_err(|e| {
            VrfWorkerError::SerializationError(SerializationError::VrfPublicKeySerialization(
                format!("{:?}", e),
            ))
        })?;
        let result = VRFChallengeData {
            vrf_input: base64_url_encode(&vrf_input),
            vrf_output: base64_url_encode(&vrf_output),
            vrf_proof: base64_url_encode(&proof_bytes),
            vrf_public_key: base64_url_encode(&pk_bytes),
            user_id: input_data.user_id,
            rp_id: input_data.rp_id,
            block_height: input_data.block_height,
            block_hash: base64_url_encode(&block_hash_bytes),
        };

        Ok(result)
    }

    pub fn get_vrf_status(&self) -> serde_json::Value {
        let session_duration = if self.session_active {
            Date::now() - self.session_start_time
        } else {
            0.0
        };
        serde_json::json!({
            "active": self.session_active,
            "sessionDuration": session_duration
        })
    }

    pub fn logout(&mut self) -> VrfResult<()> {
        // Clear VRF keypair (automatic zeroization via ZeroizeOnDrop)
        if self.vrf_keypair.take().is_some() {
            debug!("VRF keypair cleared with zeroization");
        }
        // Clear session data
        self.session_active = false;
        self.session_start_time = 0.0;
        Ok(())
    }

    /// Derive deterministic VRF keypair from PRF output for recovery
    /// Optionally generates VRF challenge if input parameters are provided
    /// This is the main entry point for deterministic VRF derivation
    pub fn derive_vrf_keypair_from_prf(
        &self,
        prf_output: Vec<u8>,
        near_account_id: String,
        vrf_input_params: Option<VRFInputData>,
    ) -> VrfResult<(DeterministicVrfKeypairResponse, ECVRFKeyPair)> {
        if prf_output.is_empty() {
            return Err(VrfWorkerError::empty_prf_output());
        }

        // Generate deterministic VRF keypair from PRF output
        let vrf_keypair = self.generate_vrf_keypair_from_seed(&prf_output, &near_account_id)?;

        // Get public key bytes for response
        let vrf_public_key_bytes = bincode::serialize(&vrf_keypair.pk).map_err(|e| {
            VrfWorkerError::SerializationError(
                crate::errors::SerializationError::VrfPublicKeySerialization(format!("{:?}", e)),
            )
        })?;
        let vrf_public_key_b64 = base64_url_encode(&vrf_public_key_bytes);

        // Encrypt the VRF keypair with the same PRF output used for derivation (for local storage)
        let (_public_key, encrypted_vrf_keypair) =
            self.encrypt_vrf_keypair_data(&vrf_keypair, &prf_output)?;

        // Generate VRF challenge if input parameters provided
        let vrf_challenge_data = if let Some(vrf_input_params) = vrf_input_params {
            let challenge_data =
                self.generate_vrf_challenge_with_keypair(&vrf_keypair, vrf_input_params)?;
            Some(challenge_data)
        } else {
            None
        };

        let response = DeterministicVrfKeypairResponse {
            vrf_public_key: vrf_public_key_b64,
            vrf_challenge_data,
            encrypted_vrf_keypair: Some(encrypted_vrf_keypair),
            success: true,
            server_encrypted_vrf_keypair: None,
            // added next in handler.rs: perform_shamir3pass_client_encrypt_current_vrf_keypair
        };

        Ok((response, vrf_keypair))
    }

    /// Store VRF keypair in memory (separate method to avoid borrowing conflicts)
    pub fn store_vrf_keypair_in_memory(
        &mut self,
        vrf_keypair: ECVRFKeyPair,
        near_account_id: String,
    ) {
        debug!(
            "Storing VRF keypair in worker memory for account: {}",
            near_account_id
        );
        // Clear any existing keypair and save the new one
        self.vrf_keypair.take();
        self.vrf_keypair = Some(SecureVRFKeyPair::new(vrf_keypair));
        self.session_active = true;
        self.session_start_time = js_sys::Date::now();
        debug!("VRF keypair stored in memory for future operations");
    }

    // === PRIVATE HELPER METHODS ===

    fn decrypt_vrf_keypair(
        &self,
        encrypted_vrf_keypair: EncryptedVRFKeypair,
        prf_key: Vec<u8>,
    ) -> VrfResult<ECVRFKeyPair> {
        // Use HKDF-SHA256 to derive ChaCha20 key from PRF key for better security
        debug!("Deriving ChaCha20 key using HKDF-SHA256");

        let hk = Hkdf::<Sha256>::new(None, &prf_key);
        let mut chacha20_key = [0u8; CHACHA20_KEY_SIZE];
        hk.expand(HKDF_CHACHA20_KEY_INFO, &mut chacha20_key)
            .map_err(|e| VrfWorkerError::from(e))?;

        // Decode encrypted data and IV
        let encrypted_data = base64_url_decode(&encrypted_vrf_keypair.encrypted_vrf_data_b64u)
            .map_err(|e| VrfWorkerError::SerializationError(SerializationError::Base64Error(e)))?;
        let iv_nonce_bytes = base64_url_decode(&encrypted_vrf_keypair.chacha20_nonce_b64u)
            .map_err(|e| VrfWorkerError::SerializationError(SerializationError::Base64Error(e)))?;

        if iv_nonce_bytes.len() != CHACHA20_NONCE_SIZE {
            return Err(VrfWorkerError::InvalidIvLength {
                expected: CHACHA20_NONCE_SIZE,
                actual: iv_nonce_bytes.len(),
            });
        }

        // Decrypt the VRF keypair using derived ChaCha20 key
        let key = chacha20poly1305::Key::from_slice(&chacha20_key);
        let cipher = ChaCha20Poly1305::new(key);
        let nonce = Nonce::from_slice(&iv_nonce_bytes);

        let decrypted_data = cipher
            .decrypt(nonce, encrypted_data.as_ref())
            .map_err(|e| VrfWorkerError::AesGcmError(AesError::DecryptionFailed(e.to_string())))?;

        // Parse decrypted keypair data using bincode (not JSON)
        let keypair_data: VRFKeypairData = bincode::deserialize(&decrypted_data).map_err(|e| {
            VrfWorkerError::SerializationError(SerializationError::KeypairDataDeserialization(
                e.to_string(),
            ))
        })?;

        // Reconstruct ECVRFKeyPair from the stored bincode bytes
        // This preserves the exact original keypair without regeneration
        let keypair: ECVRFKeyPair =
            bincode::deserialize(&keypair_data.keypair_bytes).map_err(|e| {
                VrfWorkerError::SerializationError(SerializationError::VrfKeypairDeserialization(
                    e.to_string(),
                ))
            })?;

        debug!("VRF keypair successfully restored from bincode");
        Ok(keypair)
    }

    /// Generate a new VRF keypair with cryptographically secure randomness
    fn generate_vrf_keypair(&self) -> VrfResult<ECVRFKeyPair> {
        debug!("Generating VRF keypair with secure randomness");

        // Generate VRF keypair with cryptographically secure randomness
        let mut rng = WasmRngFromSeed::from_entropy();
        let vrf_keypair = ECVRFKeyPair::generate(&mut rng);

        debug!("VRF keypair generated successfully");

        Ok(vrf_keypair)
    }

    /// Generate deterministic VRF keypair from seed material (PRF output)
    /// This enables deterministic VRF key derivation for account recovery
    fn generate_vrf_keypair_from_seed(
        &self,
        seed: &[u8],
        account_id: &str,
    ) -> VrfResult<ECVRFKeyPair> {

        debug!("Generating deterministic VRF keypair for account: {}", account_id);
        // Use HKDF-SHA256 to derive a proper 32-byte seed from PRF output
        let hk = Hkdf::<Sha256>::new(Some(account_id.as_bytes()), seed);
        let mut vrf_seed = [0u8; VRF_SEED_SIZE];
        hk.expand(HKDF_VRF_KEYPAIR_INFO, &mut vrf_seed)
            .map_err(|_| {
                VrfWorkerError::HkdfDerivationFailed(HkdfError::VrfSeedDerivationFailed)
            })?;

        // Generate VRF keypair deterministically from the derived seed
        let mut rng = WasmRngFromSeed::from_seed(vrf_seed);
        let vrf_keypair = ECVRFKeyPair::generate(&mut rng);

        debug!("Deterministic VRF keypair generated successfully");

        Ok(vrf_keypair)
    }

    /// Encrypt VRF keypair data using PRF-derived AES key
    fn encrypt_vrf_keypair_data(
        &self,
        vrf_keypair: &ECVRFKeyPair,
        prf_key: &[u8],
    ) -> VrfResult<(String, EncryptedVRFKeypair)> {
        debug!("Encrypting VRF keypair data");

        // Serialize the entire keypair using bincode for efficient, deterministic storage
        let vrf_keypair_bytes = bincode::serialize(vrf_keypair)?;

        // Get public key bytes for convenience
        let vrf_public_key_bytes = bincode::serialize(&vrf_keypair.pk)?;

        // Create VRF keypair data structure
        let keypair_data = VRFKeypairData {
            keypair_bytes: vrf_keypair_bytes,
            public_key_base64: base64_url_encode(&vrf_public_key_bytes),
        };

        // Serialize the VRF keypair data using bincode
        let keypair_data_bytes = bincode::serialize(&keypair_data).map_err(|e| {
            VrfWorkerError::SerializationError(SerializationError::KeypairDataSerialization(
                format!("{:?}", e),
            ))
        })?;

        // Encrypt the VRF keypair data using AES-GCM
        let encrypted_keypair = self.encrypt_vrf_keypair(&keypair_data_bytes, prf_key)?;

        debug!("VRF keypair encrypted successfully");

        Ok((base64_url_encode(&vrf_public_key_bytes), encrypted_keypair))
    }

    /// Enhanced VRF keypair generation with explicit control over memory storage and challenge generation
    fn encrypt_vrf_keypair(&self, data: &[u8], key: &[u8]) -> VrfResult<EncryptedVRFKeypair> {
        debug!("Deriving ChaCha20 key using HKDF-SHA256 for encryption");

        // Use HKDF-SHA256 to derive ChaCha20 key from PRF key for better security
        let hk = Hkdf::<Sha256>::new(None, key);
        let mut chacha20_key = [0u8; CHACHA20_KEY_SIZE];
        hk.expand(HKDF_CHACHA20_KEY_INFO, &mut chacha20_key)
            .map_err(|_| VrfWorkerError::HkdfDerivationFailed(HkdfError::KeyDerivationFailed))?;

        let key_slice = chacha20poly1305::Key::from_slice(&chacha20_key);
        let cipher = ChaCha20Poly1305::new(key_slice);

        // Generate cryptographically secure random IV/nonce
        let mut iv_nonce_bytes = [0u8; CHACHA20_NONCE_SIZE];
        getrandom(&mut iv_nonce_bytes).map_err(|e| {
            VrfWorkerError::AesGcmError(AesError::IvGenerationFailed(e.to_string()))
        })?;
        let nonce = Nonce::from_slice(&iv_nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, data)
            .map_err(|e| VrfWorkerError::AesGcmError(AesError::EncryptionFailed(e.to_string())))?;

        Ok(EncryptedVRFKeypair {
            encrypted_vrf_data_b64u: base64_url_encode(&ciphertext),
            chacha20_nonce_b64u: base64_url_encode(&iv_nonce_bytes),
        })
    }
}
