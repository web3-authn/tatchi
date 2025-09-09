// === NEAR BLOCKCHAIN TYPES ===
// WASM-compatible structs that mirror near-primitives

use serde::{Serialize, Deserialize};
use borsh::{BorshSerialize, BorshDeserialize};
use sha2::{Sha256, Digest};
use serde_bytes;
use wasm_bindgen::prelude::*;
use crate::types::ToJson;

// === CORE NEAR TYPES ===

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountId(pub String);

impl AccountId {
    pub fn new(account_id: String) -> Result<Self, String> {
        if account_id.is_empty() {
            return Err("Account ID cannot be empty".to_string());
        }
        Ok(AccountId(account_id))
    }
}

impl std::str::FromStr for AccountId {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        AccountId::new(s.to_string())
    }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicKey {
    pub key_type: u8, // 0 for ED25519
    #[serde(with = "serde_bytes")]
    pub key_data: [u8; 32], // Fixed: back to [u8; 32] for proper borsh serialization
}

impl PublicKey {
    pub fn from_ed25519_bytes(bytes: &[u8; 32]) -> Self {
        PublicKey {
            key_type: 0, // ED25519
            key_data: *bytes,
        }
    }

    // WASM-friendly getter that returns Vec<u8>
    pub fn to_vec(&self) -> Vec<u8> {
        self.key_data.to_vec()
    }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Signature {
    pub key_type: u8, // 0 for ED25519
    #[serde(with = "serde_bytes")]
    pub signature_data: [u8; 64], // Fixed: back to [u8; 64] for proper borsh serialization
}

impl Signature {
    pub fn from_ed25519_bytes(bytes: &[u8; 64]) -> Self {
        Signature {
            key_type: 0, // ED25519
            signature_data: *bytes,
        }
    }

    // WASM-friendly getter that returns Vec<u8>
    pub fn to_vec(&self) -> Vec<u8> {
        self.signature_data.to_vec()
    }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CryptoHash(#[serde(with = "serde_bytes")] pub [u8; 32]); // [u8; 32] for proper borsh serialization

impl CryptoHash {
    pub fn from_bytes(bytes: [u8; 32]) -> Self {
        CryptoHash(bytes)
    }

    // WASM-friendly getter that returns Vec<u8>
    pub fn to_vec(&self) -> Vec<u8> {
        self.0.to_vec()
    }
}

pub type Nonce = u64;
pub type Gas = u64;
pub type Balance = u128;

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FunctionCallAction {
    pub method_name: String,
    #[serde(with = "serde_bytes")]
    pub args: Vec<u8>,
    pub gas: Gas,
    pub deposit: Balance,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Action {
    CreateAccount,
    DeployContract {
        #[serde(with = "serde_bytes")]
        code: Vec<u8>
    },
    FunctionCall(Box<FunctionCallAction>),
    Transfer { deposit: Balance },
    Stake { stake: Balance, public_key: PublicKey },
    AddKey { public_key: PublicKey, access_key: AccessKey },
    DeleteKey { public_key: PublicKey },
    DeleteAccount { beneficiary_id: AccountId },
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessKey {
    pub nonce: Nonce,
    pub permission: AccessKeyPermission,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AccessKeyPermission {
    FunctionCall(FunctionCallPermission),
    FullAccess,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FunctionCallPermission {
    pub allowance: Option<Balance>,
    pub receiver_id: String,
    pub method_names: Vec<String>,
}

// Internal Transaction representation for borsh serialization
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transaction {
    pub signer_id: AccountId,
    pub public_key: PublicKey,
    pub nonce: Nonce,
    pub receiver_id: AccountId,
    pub block_hash: CryptoHash,
    pub actions: Vec<Action>,
}

impl Transaction {
    /// Computes a hash of the transaction for signing
    /// This mirrors the logic from near-primitives Transaction::get_hash_and_size()
    pub fn get_hash_and_size(&self) -> (CryptoHash, u64) {
        let bytes = borsh::to_vec(&self).expect("Failed to serialize transaction");
        let hash_bytes = {
            let mut hasher = Sha256::new();
            hasher.update(&bytes);
            hasher.finalize()
        };
        let mut hash_array = [0u8; 32];
        hash_array.copy_from_slice(&hash_bytes);
        (CryptoHash::from_bytes(hash_array), bytes.len() as u64)
    }

    // WASM-friendly getters
    pub fn get_signer_id(&self) -> String {
        self.signer_id.0.clone()
    }

    pub fn get_receiver_id(&self) -> String {
        self.receiver_id.0.clone()
    }

    pub fn get_block_hash(&self) -> Vec<u8> {
        self.block_hash.to_vec()
    }

    pub fn get_actions_json(&self) -> Result<String, String> {
        serde_json::to_string(&self.actions)
            .map_err(|e| format!("Failed to serialize actions: {}", e))
    }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignedTransaction {
    pub transaction: Transaction,
    pub signature: Signature,
}

impl SignedTransaction {
    pub fn new(signature: Signature, transaction: Transaction) -> Self {
        SignedTransaction {
            transaction,
            signature,
        }
    }

    /// Convert to borsh bytes for transmission
    pub fn to_borsh_bytes(&self) -> Result<Vec<u8>, String> {
        borsh::to_vec(self).map_err(|e| format!("Failed to serialize to borsh: {}", e))
    }

    /// Create from borsh bytes
    pub fn from_borsh_bytes(bytes: &[u8]) -> Result<Self, String> {
        borsh::from_slice(bytes).map_err(|e| format!("Failed to deserialize from borsh: {}", e))
    }
}

// === TO_JSON IMPLEMENTATIONS ===
// All NEAR types now use the default ToJson implementation since they have Serialize + camelCase
// This eliminates manual camelCase conversions and reduces code duplication

// Helper method to create JsonSignedTransaction with borsh bytes
impl SignedTransaction {
    /// Create a JSON-serializable version with optional borsh bytes
    pub fn to_json_with_borsh(&self, borsh_bytes: Option<Vec<u8>>) -> Result<serde_json::Value, String> {
        let mut json_map = match self.to_json()? {
            serde_json::Value::Object(map) => map,
            _ => return Err("Expected a JSON object".to_string()),
        };

        if let Some(bytes) = borsh_bytes {
            let json_bytes = bytes.iter().map(|&b| serde_json::Value::Number(b.into())).collect();
            json_map.insert(
                "borshBytes".to_string(),
                serde_json::Value::Array(json_bytes)
            );
        }
        Ok(serde_json::Value::Object(json_map))
    }
}