use serde::{Deserialize, Serialize};
use serde_wasm_bindgen;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsValue;

pub mod http;
pub mod worker_messages;

// Re-export worker_messages types
pub use worker_messages::*;

// === TYPE DEFINITIONS ===

#[derive(Serialize, Deserialize)]
pub struct VRFKeypairData {
    /// Bincode-serialized ECVRFKeyPair (includes both private key and public key)
    pub keypair_bytes: Vec<u8>,
    /// Base64url-encoded public key for convenience
    pub public_key_base64: String,
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EncryptedVRFKeypair {
    #[wasm_bindgen(getter_with_clone, js_name = "encryptedVrfDataB64u")]
    #[serde(rename = "encryptedVrfDataB64u")]
    pub encrypted_vrf_data_b64u: String,
    #[wasm_bindgen(getter_with_clone, js_name = "chacha20NonceB64u")]
    #[serde(rename = "chacha20NonceB64u")]
    pub chacha20_nonce_b64u: String,
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VRFInputData {
    #[wasm_bindgen(getter_with_clone, js_name = "userId")]
    #[serde(rename = "userId")]
    pub user_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "rpId")]
    #[serde(rename = "rpId")]
    pub rp_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "blockHeight")]
    #[serde(rename = "blockHeight")]
    pub block_height: String,
    #[wasm_bindgen(getter_with_clone, js_name = "blockHash")]
    #[serde(rename = "blockHash")]
    pub block_hash: String,
    /// Optional base64url-encoded 32-byte digest to bind into the VRF input hash.
    /// When present, must decode to exactly 32 bytes.
    #[wasm_bindgen(getter_with_clone, js_name = "intentDigest")]
    #[serde(rename = "intentDigest")]
    pub intent_digest: Option<String>,
    /// Optional base64url-encoded 32-byte digest that binds a relayer session policy into the VRF input hash.
    /// When present, must decode to exactly 32 bytes.
    #[wasm_bindgen(getter_with_clone, js_name = "sessionPolicyDigest32")]
    #[serde(rename = "sessionPolicyDigest32")]
    pub session_policy_digest_32: Option<String>,
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VRFChallengeData {
    #[wasm_bindgen(getter_with_clone, js_name = "vrfInput")]
    #[serde(rename = "vrfInput")]
    pub vrf_input: String,
    #[wasm_bindgen(getter_with_clone, js_name = "vrfOutput")]
    #[serde(rename = "vrfOutput")]
    pub vrf_output: String,
    #[wasm_bindgen(getter_with_clone, js_name = "vrfProof")]
    #[serde(rename = "vrfProof")]
    pub vrf_proof: String,
    #[wasm_bindgen(getter_with_clone, js_name = "vrfPublicKey")]
    #[serde(rename = "vrfPublicKey")]
    pub vrf_public_key: String,
    #[wasm_bindgen(getter_with_clone, js_name = "userId")]
    #[serde(rename = "userId")]
    pub user_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "rpId")]
    #[serde(rename = "rpId")]
    pub rp_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "blockHeight")]
    #[serde(rename = "blockHeight")]
    pub block_height: String,
    #[wasm_bindgen(getter_with_clone, js_name = "blockHash")]
    #[serde(rename = "blockHash")]
    pub block_hash: String,
    /// Optional base64url-encoded 32-byte digest that was included in VRF input derivation.
    #[wasm_bindgen(getter_with_clone, js_name = "intentDigest")]
    #[serde(rename = "intentDigest")]
    pub intent_digest: Option<String>,
    /// Optional base64url-encoded 32-byte digest that was included in VRF input derivation.
    #[wasm_bindgen(getter_with_clone, js_name = "sessionPolicyDigest32")]
    #[serde(rename = "sessionPolicyDigest32")]
    pub session_policy_digest_32: Option<String>,
}
impl VRFChallengeData {
    pub fn to_js_value(&self) -> JsValue {
        serde_wasm_bindgen::to_value(self).unwrap_or(JsValue::UNDEFINED)
    }
}

fn js_undefined() -> JsValue {
    JsValue::UNDEFINED
}

#[derive(Serialize, Deserialize)]
pub struct GenerateVrfKeypairBootstrapResponse {
    pub vrf_public_key: String,
    pub vrf_challenge_data: Option<VRFChallengeData>,
}

#[derive(Serialize, Deserialize)]
pub struct EncryptedVrfKeypairResponse {
    pub vrf_public_key: String,
    pub encrypted_vrf_keypair: EncryptedVRFKeypair,
}

/// Mirror of JS WorkerConfirmationResponse (confirmTxFlow/types.ts)
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "snake_case")]
pub struct WorkerConfirmationResponse {
    pub request_id: String,
    pub intent_digest: Option<String>,
    pub confirmed: bool,
    #[serde(default = "js_undefined", with = "serde_wasm_bindgen::preserve")]
    pub credential: JsValue,
    #[serde(default = "js_undefined", with = "serde_wasm_bindgen::preserve")]
    pub vrf_challenge: JsValue,
    #[serde(default = "js_undefined", with = "serde_wasm_bindgen::preserve")]
    pub transaction_context: JsValue,
    pub error: Option<String>,
}
