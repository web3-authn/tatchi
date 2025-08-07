use serde::{Deserialize, Serialize};

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
    pub success: bool,
}