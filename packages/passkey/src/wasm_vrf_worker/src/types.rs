use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

// === TYPE DEFINITIONS ===

#[derive(Serialize, Deserialize)]
pub struct VRFKeypairData {
    /// Bincode-serialized ECVRFKeyPair (includes both private key and public key)
    pub keypair_bytes: Vec<u8>,
    /// Base64url-encoded public key for convenience
    pub public_key_base64: String,
}

#[derive(Serialize, Deserialize)]
pub struct EncryptedVRFKeypair {
    pub encrypted_vrf_data_b64u: String,
    pub chacha20_nonce_b64u: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct VRFInputData {
    pub user_id: String,
    pub rp_id: String,
    pub block_height: u64,
    pub block_hash: Vec<u8>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VRFChallengeData {
    pub vrf_input: String,
    pub vrf_output: String,
    pub vrf_proof: String,
    pub vrf_public_key: String,
    pub user_id: String,
    pub rp_id: String,
    pub block_height: u64,
    pub block_hash: String,
}

#[derive(Serialize, Deserialize)]
pub struct VRFWorkerMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub id: Option<String>,
    pub data: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize)]
pub struct VRFWorkerResponse {
    pub id: Option<String>,
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
}
impl VRFWorkerResponse {
    pub fn new(
        id: Option<String>,
        success: bool,
        data: Option<serde_json::Value>,
        error: Option<String>
    ) -> Self {
        Self { id, success, data, error }
    }
    pub fn success(id: Option<String>, data: Option<serde_json::Value>) -> Self {
        Self::new(id, true, data, None)
    }
    pub fn fail(id: Option<String>, message: impl Into<String>) -> Self {
        Self::new(id, false, None, Some(message.into()))
    }
    pub fn error(id: Option<String>, error: String) -> Self {
        Self::new(id, false, None, Some(error))
    }
}

// === RESPONSE TYPES ===

#[derive(Serialize, Deserialize)]
pub struct VrfKeypairResponse {
    pub vrf_public_key: String,
    pub encrypted_vrf_keypair: serde_json::Value,
}

#[derive(Serialize, Deserialize)]
pub struct VrfKeypairBootstrapResponse {
    pub vrf_public_key: String,
    pub vrf_challenge_data: Option<VRFChallengeData>,
}

#[derive(Serialize, Deserialize)]
pub struct EncryptedVrfKeypairResponse {
    pub vrf_public_key: String,
    pub encrypted_vrf_keypair: serde_json::Value,
}

#[derive(Serialize, Deserialize)]
pub struct DeterministicVrfKeypairResponse {
    pub vrf_public_key: String,
    pub vrf_challenge_data: Option<VRFChallengeData>,
    pub encrypted_vrf_keypair: Option<serde_json::Value>,
    pub server_encrypted_vrf_keypair: Option<serde_json::Value>,
    pub success: bool,
}

// === Shamir 3-pass HTTP types (exported to TS via wasm-bindgen) ===

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone)]
pub struct ApplyServerLockRequest {
    kek_c_b64u: String,
}

#[wasm_bindgen]
impl ApplyServerLockRequest {
    #[wasm_bindgen(constructor)]
    pub fn new(kek_c_b64u: String) -> ApplyServerLockRequest {
        ApplyServerLockRequest { kek_c_b64u }
    }

    #[wasm_bindgen(getter)]
    pub fn kek_c_b64u(&self) -> String {
        self.kek_c_b64u.clone()
    }

    #[wasm_bindgen(setter)]
    pub fn set_kek_c_b64u(&mut self, kek_c_b64u: String) {
        self.kek_c_b64u = kek_c_b64u;
    }
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone)]
pub struct ApplyServerLockResponse {
    kek_cs_b64u: String,
}

#[wasm_bindgen]
impl ApplyServerLockResponse {
    #[wasm_bindgen(constructor)]
    pub fn new(kek_cs_b64u: String) -> ApplyServerLockResponse {
        ApplyServerLockResponse { kek_cs_b64u }
    }

    #[wasm_bindgen(getter)]
    pub fn kek_cs_b64u(&self) -> String {
        self.kek_cs_b64u.clone()
    }

    #[wasm_bindgen(setter)]
    pub fn set_kek_cs_b64u(&mut self, kek_cs_b64u: String) {
        self.kek_cs_b64u = kek_cs_b64u;
    }
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone)]
pub struct RemoveServerLockRequest {
    kek_cs_b64u: String,
}

#[wasm_bindgen]
impl RemoveServerLockRequest {
    #[wasm_bindgen(constructor)]
    pub fn new(kek_cs_b64u: String) -> RemoveServerLockRequest {
        RemoveServerLockRequest { kek_cs_b64u }
    }

    #[wasm_bindgen(getter)]
    pub fn kek_cs_b64u(&self) -> String {
        self.kek_cs_b64u.clone()
    }

    #[wasm_bindgen(setter)]
    pub fn set_kek_cs_b64u(&mut self, kek_cs_b64u: String) {
        self.kek_cs_b64u = kek_cs_b64u;
    }
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone)]
pub struct RemoveServerLockResponse {
    kek_c_b64u: String,
}

#[wasm_bindgen]
impl RemoveServerLockResponse {
    #[wasm_bindgen(constructor)]
    pub fn new(kek_c_b64u: String) -> RemoveServerLockResponse {
        RemoveServerLockResponse { kek_c_b64u }
    }

    #[wasm_bindgen(getter)]
    pub fn kek_c_b64u(&self) -> String {
        self.kek_c_b64u.clone()
    }

    #[wasm_bindgen(setter)]
    pub fn set_kek_c_b64u(&mut self, kek_c_b64u: String) {
        self.kek_c_b64u = kek_c_b64u;
    }
}