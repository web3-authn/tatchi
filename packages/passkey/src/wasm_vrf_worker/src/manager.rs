use crate::config::*;
use crate::errors::{VrfWorkerError, VrfResult, HkdfError, SerializationError};
use crate::types::*;
use crate::utils::{base64_url_encode, base64_url_decode};
use log::{info, debug, error};
use js_sys::Date;

// VRF and crypto imports
use vrf_wasm::ecvrf::ECVRFKeyPair;
use vrf_wasm::vrf::{VRFKeyPair, VRFProof};
use vrf_wasm::traits::WasmRngFromSeed;
use zeroize::ZeroizeOnDrop;
use chacha20poly1305::{ChaCha20Poly1305, Nonce};
use chacha20poly1305::aead::{Aead, KeyInit};
use sha2::{Sha256, Digest};
use hkdf::Hkdf;
use getrandom::getrandom;
use rand_core::SeedableRng;

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
}

// === VRF KEY MANAGER ===

pub struct VRFKeyManager {
    pub vrf_keypair: Option<SecureVRFKeyPair>,
    pub session_active: bool,
    pub session_start_time: f64,
}

impl VRFKeyManager {
    pub fn new() -> Self {
        info!("VRFKeyManager ready (no user session active)");
        Self {
            vrf_keypair: None,
            session_active: false,
            session_start_time: 0.0,
        }
    }

    pub fn generate_vrf_keypair_bootstrap(
        &mut self,
        vrf_input_params: Option<VRFInputData>,
    ) -> VrfResult<VrfKeypairBootstrapResponse> {
        info!("Generating VRF keypair for bootstrapping");
        debug!("VRF keypair will be stored in memory unencrypted until PRF encryption");

        // Clear any existing keypair (automatic zeroization via ZeroizeOnDrop)
        self.vrf_keypair.take();

        // Generate VRF keypair with cryptographically secure randomness
        let vrf_keypair = self.generate_vrf_keypair()?;

        // Get public key bytes for response
        let vrf_public_key_bytes = bincode::serialize(&vrf_keypair.pk)
            .map_err(|e| VrfWorkerError::SerializationError(SerializationError::VrfPublicKeySerialization(format!("{:?}", e))))?;
        let vrf_public_key_b64 = base64_url_encode(&vrf_public_key_bytes);

        // Store VRF keypair in memory (unencrypted)
        self.vrf_keypair = Some(SecureVRFKeyPair::new(vrf_keypair));
        self.session_active = true;
        self.session_start_time = Date::now();

        info!("VRF keypair generated and stored in memory");
        debug!(
            "VRF Public Key: {}...",
            &vrf_public_key_b64[..DISPLAY_TRUNCATE_LENGTH.min(vrf_public_key_b64.len())]
        );

        let mut result = VrfKeypairBootstrapResponse {
            vrf_public_key: vrf_public_key_b64,
            vrf_challenge_data: None,
        };

        // Generate VRF challenge if input parameters provided
        if let Some(vrf_input) = vrf_input_params {
            debug!("Generating VRF challenge using bootstrapped keypair");

            let vrf_keypair = self.vrf_keypair.as_ref().unwrap().inner();
            let challenge_result = self.generate_vrf_challenge_with_keypair(vrf_keypair, vrf_input)?;
            result.vrf_challenge_data = Some(challenge_result);

            info!("VRF challenge generated successfully");
        }

        info!("VRF keypair bootstrap completed");
        Ok(result)
    }

    /// Encrypt VRF keypair with PRF output - looks up in-memory keypair and encrypts it
    /// This is called after WebAuthn ceremony to encrypt the same VRF keypair with real PRF
    pub fn encrypt_vrf_keypair_with_prf(
        &mut self,
        expected_public_key: String,
        prf_key: Vec<u8>,
    ) -> VrfResult<EncryptedVrfKeypairResponse> {
        info!("Encrypting VRF keypair with PRF output");
        debug!(
            "Expected public key: {}...",
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
            return Err(VrfWorkerError::public_key_mismatch(&expected_public_key, &stored_public_key));
        }
        debug!("Public key verification successful");

        // Encrypt the VRF keypair
        let (
            vrf_public_key,
            encrypted_vrf_keypair
        ) = self.encrypt_vrf_keypair_data(vrf_keypair, &prf_key)?;

        info!("VRF keypair encrypted with PRF output");
        debug!("VRF keypair ready for persistent storage");

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
    ) -> Result<(), String> {
        info!("Unlocking VRF keypair for {}", near_account_id);

        // Clear any existing keypair (automatic zeroization via ZeroizeOnDrop)
        self.vrf_keypair.take();

        // Decrypt VRF keypair using PRF-derived AES key
        let decrypted_keypair = self.decrypt_vrf_keypair(encrypted_vrf_keypair, prf_key)?;

        // Wrap in secure container for automatic zeroization
        self.vrf_keypair = Some(SecureVRFKeyPair::new(decrypted_keypair));
        self.session_active = true;
        self.session_start_time = Date::now();

        info!("VRF keypair unlocked successfully");
        Ok(())
    }

    pub fn generate_vrf_challenge(&self, input_data: VRFInputData) -> Result<VRFChallengeData, String> {
        if !self.session_active || self.vrf_keypair.is_none() {
            return Err(VrfWorkerError::VrfNotUnlocked.to_string());
        }

        info!("Generating VRF challenge");
        let vrf_keypair = self.vrf_keypair.as_ref().unwrap().inner();

        self.generate_vrf_challenge_with_keypair(vrf_keypair, input_data)
    }

    /// Generate VRF challenge using a specific keypair (can be in-memory or provided)
    pub fn generate_vrf_challenge_with_keypair(&self, vrf_keypair: &ECVRFKeyPair, input_data: VRFInputData) -> Result<VRFChallengeData, String> {
        debug!("Generating VRF challenge using provided keypair");

        // Construct VRF input according to specification from the contract test
        let domain_separator = VRF_DOMAIN_SEPARATOR;
        let user_id_bytes = input_data.user_id.as_bytes();
        let rp_id_bytes = input_data.rp_id.as_bytes();
        let block_height_bytes = input_data.block_height.to_le_bytes();

        // Concatenate all input components following the test pattern
        let mut vrf_input_data = Vec::new();
        vrf_input_data.extend_from_slice(domain_separator);
        vrf_input_data.extend_from_slice(user_id_bytes);
        vrf_input_data.extend_from_slice(rp_id_bytes);
        vrf_input_data.extend_from_slice(&block_height_bytes);
        vrf_input_data.extend_from_slice(&input_data.block_hash);

        // Hash the input data (VRF input should be hashed)
        let vrf_input = Sha256::digest(&vrf_input_data).to_vec();

        // Generate VRF proof and output using the proper vrf-wasm API
        let proof = vrf_keypair.prove(&vrf_input);
        let vrf_output = proof.to_hash().to_vec();

        let result = VRFChallengeData {
            vrf_input: base64_url_encode(&vrf_input),
            vrf_output: base64_url_encode(&vrf_output),
            vrf_proof: base64_url_encode(&bincode::serialize(&proof).unwrap()),
            vrf_public_key: base64_url_encode(&bincode::serialize(&vrf_keypair.pk).unwrap()),
            user_id: input_data.user_id,
            rp_id: input_data.rp_id,
            block_height: input_data.block_height,
            block_hash: base64_url_encode(&input_data.block_hash),
        };

        info!("VRF challenge generated successfully using provided keypair");
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

    pub fn logout(&mut self) -> Result<(), String> {
        info!("Logging out and securely clearing VRF keypair");
        // Clear VRF keypair (automatic zeroization via ZeroizeOnDrop)
        if self.vrf_keypair.take().is_some() {
            debug!("VRF keypair cleared with automatic zeroization");
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
    ) -> VrfResult<DeterministicVrfKeypairResponse> {
        info!(
            "Deriving deterministic VRF keypair from PRF for account: {} (with challenge: {})",
            near_account_id,
            vrf_input_params.is_some()
        );

        if prf_output.is_empty() {
            return Err(VrfWorkerError::empty_prf_output());
        }

        // Generate deterministic VRF keypair from PRF output
        let vrf_keypair = self.generate_vrf_keypair_from_seed(&prf_output, &near_account_id)
            .map_err(|e| VrfWorkerError::InvalidMessageFormat(e))?;

        // Get public key bytes for response
        let vrf_public_key_bytes = bincode::serialize(&vrf_keypair.pk)
            .map_err(|e| VrfWorkerError::SerializationError(
                crate::errors::SerializationError::VrfPublicKeySerialization(format!("{:?}", e))
            ))?;
        let vrf_public_key_b64 = base64_url_encode(&vrf_public_key_bytes);

        debug!(
            "Deterministic VRF public key: {}...",
            &vrf_public_key_b64[..DISPLAY_TRUNCATE_LENGTH.min(vrf_public_key_b64.len())]
        );

        // Encrypt the VRF keypair with the same PRF output used for derivation
        debug!("Encrypting deterministic VRF keypair with PRF output");
        let (_public_key, encrypted_vrf_keypair) = self.encrypt_vrf_keypair_data(&vrf_keypair, &prf_output)
            .map_err(|e| VrfWorkerError::InvalidMessageFormat(e))?;
        debug!("VRF keypair encrypted successfully");

        // Generate VRF challenge if input parameters provided
        let vrf_challenge_data = if let Some(vrf_input_params) = vrf_input_params {
            debug!("Generating VRF challenge using deterministic keypair");
            let challenge_data = self.generate_vrf_challenge_with_keypair(&vrf_keypair, vrf_input_params)
                .map_err(|e| VrfWorkerError::InvalidMessageFormat(e))?;
            info!("VRF challenge generated successfully");
            Some(challenge_data)
        } else {
            None
        };

        info!("Deterministic VRF keypair derivation completed successfully");

        Ok(DeterministicVrfKeypairResponse {
            vrf_public_key: vrf_public_key_b64,
            vrf_challenge_data,
            encrypted_vrf_keypair: Some(encrypted_vrf_keypair),
            success: true,
        })
    }

    // === PRIVATE HELPER METHODS ===

    fn decrypt_vrf_keypair(
        &self,
        encrypted_vrf_keypair: EncryptedVRFKeypair,
        prf_key: Vec<u8>,
    ) -> Result<ECVRFKeyPair, String> {
        // Use HKDF-SHA256 to derive ChaCha20 key from PRF key for better security
        debug!("Deriving ChaCha20 key using HKDF-SHA256");

        let hk = Hkdf::<Sha256>::new(None, &prf_key);
        let mut chacha20_key = [0u8; CHACHA20_KEY_SIZE];
        hk.expand(HKDF_CHACHA20_KEY_INFO, &mut chacha20_key)
            .map_err(|_| VrfWorkerError::HkdfDerivationFailed(HkdfError::KeyDerivationFailed).to_string())?;

        // Decode encrypted data and IV
        let encrypted_data = base64_url_decode(&encrypted_vrf_keypair.encrypted_vrf_data_b64u)
            .map_err(|e| format!("Failed to decode encrypted data: {}", e))?;
        let iv_nonce_bytes = base64_url_decode(&encrypted_vrf_keypair.chacha20_nonce_b64u)
            .map_err(|e| format!("Failed to decode IV: {}", e))?;

        if iv_nonce_bytes.len() != CHACHA20_NONCE_SIZE {
            return Err(VrfWorkerError::InvalidIvLength {
                expected: CHACHA20_NONCE_SIZE,
                actual: iv_nonce_bytes.len()
            }.to_string());
        }

        // Decrypt the VRF keypair using derived ChaCha20 key
        let key = chacha20poly1305::Key::from_slice(&chacha20_key);
        let cipher = ChaCha20Poly1305::new(key);
        let nonce = Nonce::from_slice(&iv_nonce_bytes);

        let decrypted_data = cipher
            .decrypt(nonce, encrypted_data.as_ref())
            .map_err(|e| format!("Failed to decrypt VRF keypair: {}", e))?;

        // Parse decrypted keypair data using bincode (not JSON)
        let keypair_data: VRFKeypairData = bincode::deserialize(&decrypted_data)
            .map_err(|e| format!("Failed to deserialize keypair data: {}", e))?;

        // Reconstruct ECVRFKeyPair from the stored bincode bytes
        // This preserves the exact original keypair without regeneration
        let keypair: ECVRFKeyPair = bincode::deserialize(&keypair_data.keypair_bytes)
            .map_err(|e| format!("Failed to deserialize VRF keypair: {}", e))?;

        debug!("VRF keypair successfully restored from bincode");
        Ok(keypair)
    }

    /// Generate a new VRF keypair with cryptographically secure randomness
    fn generate_vrf_keypair(&self) -> Result<ECVRFKeyPair, String> {
        debug!("Generating VRF keypair with secure randomness");

        // Generate VRF keypair with cryptographically secure randomness
        let mut rng = WasmRngFromSeed::from_entropy();
        let vrf_keypair = ECVRFKeyPair::generate(&mut rng);

        debug!("VRF keypair generated successfully");

        Ok(vrf_keypair)
    }

    /// Generate deterministic VRF keypair from seed material (PRF output)
    /// This enables deterministic VRF key derivation for account recovery
    fn generate_vrf_keypair_from_seed(&self, seed: &[u8], account_id: &str) -> Result<ECVRFKeyPair, String> {
        debug!("Generating deterministic VRF keypair from seed for account: {}", account_id);

        // Use HKDF-SHA256 to derive a proper 32-byte seed from PRF output
        let hk = Hkdf::<Sha256>::new(Some(account_id.as_bytes()), seed);
        let mut vrf_seed = [0u8; VRF_SEED_SIZE];
        hk.expand(HKDF_VRF_KEYPAIR_INFO, &mut vrf_seed)
            .map_err(|_| error_messages::HKDF_VRF_SEED_DERIVATION_FAILED.to_string())?;

        // Generate VRF keypair deterministically from the derived seed
        let mut rng = WasmRngFromSeed::from_seed(vrf_seed);
        let vrf_keypair = ECVRFKeyPair::generate(&mut rng);

        debug!("Deterministic VRF keypair generated successfully");

        Ok(vrf_keypair)
    }

    /// Encrypt VRF keypair data using PRF-derived AES key
    fn encrypt_vrf_keypair_data(&self, vrf_keypair: &ECVRFKeyPair, prf_key: &[u8]) -> Result<(String, serde_json::Value), String> {
        debug!("Encrypting VRF keypair data");

        // Serialize the entire keypair using bincode for efficient, deterministic storage
        let vrf_keypair_bytes = bincode::serialize(vrf_keypair)
            .map_err(|e| format!("Failed to serialize VRF keypair with bincode: {:?}", e))?;

        // Get public key bytes for convenience
        let vrf_public_key_bytes = bincode::serialize(&vrf_keypair.pk)
            .map_err(|e| format!("Failed to serialize VRF public key: {:?}", e))?;

        // Create VRF keypair data structure
        let keypair_data = VRFKeypairData {
            keypair_bytes: vrf_keypair_bytes,
            public_key_base64: base64_url_encode(&vrf_public_key_bytes),
        };

        // Serialize the VRF keypair data using bincode
        let keypair_data_bytes = bincode::serialize(&keypair_data)
            .map_err(|e| format!("Failed to serialize VRF keypair data: {:?}", e))?;

        // Encrypt the VRF keypair data using AES-GCM
        let encrypted_keypair = self.encrypt_vrf_keypair(&keypair_data_bytes, prf_key)?;

        debug!("VRF keypair encrypted successfully");

        Ok((base64_url_encode(&vrf_public_key_bytes), encrypted_keypair))
    }

    /// Enhanced VRF keypair generation with explicit control over memory storage and challenge generation
    fn encrypt_vrf_keypair(&self, data: &[u8], key: &[u8]) -> Result<serde_json::Value, String> {
        debug!("Deriving ChaCha20 key using HKDF-SHA256 for encryption");

        // Use HKDF-SHA256 to derive ChaCha20 key from PRF key for better security
        let hk = Hkdf::<Sha256>::new(None, key);
        let mut chacha20_key = [0u8; CHACHA20_KEY_SIZE];
        hk.expand(HKDF_CHACHA20_KEY_INFO, &mut chacha20_key)
            .map_err(|_| error_messages::HKDF_KEY_DERIVATION_FAILED.to_string())?;

        let key_slice = chacha20poly1305::Key::from_slice(&chacha20_key);
        let cipher = ChaCha20Poly1305::new(key_slice);

        // Generate cryptographically secure random IV/nonce
        let mut iv_nonce_bytes = [0u8; CHACHA20_NONCE_SIZE];
        getrandom(&mut iv_nonce_bytes)
            .map_err(|e| format!("Failed to generate secure IV: {}", e))?;
        let nonce = Nonce::from_slice(&iv_nonce_bytes);

        let ciphertext = cipher.encrypt(nonce, data)
            .map_err(|e| format!("Encryption failed: {}", e))?;

        Ok(serde_json::json!({
            "encrypted_vrf_data_b64u": base64_url_encode(&ciphertext),
            "chacha20_nonce_b64u": base64_url_encode(&iv_nonce_bytes)
        }))
    }
}