use super::deserializers::{serde_array_32, serde_array_64};
use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

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
    #[serde(with = "serde_array_32")]
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
    #[serde(with = "serde_array_64")]
    pub signature_data: [u8; 64], // [u8; 64] for proper borsh serialization
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
pub struct CryptoHash(#[serde(with = "serde_array_32")] pub [u8; 32]); // [u8; 32] for proper borsh serialization

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

// === SERDE HELPERS FOR BALANCE (u128) ===
// JSON does not natively support 128-bit integers. To keep JSON round-trips
// working (especially for delegate actions that serialize inner `Action`s),
// we encode Balance as a decimal string and accept either a string or a
// non-negative number when deserializing.
mod serde_balance_as_dec_str {
    use super::Balance;
    use serde::{Deserializer, Serializer};

    pub fn serialize<S>(value: &Balance, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&value.to_string())
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Balance, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct Visitor;

        impl<'de> serde::de::Visitor<'de> for Visitor {
            type Value = Balance;

            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("a non-negative u128 as string or number")
            }

            fn visit_u64<E>(self, v: u64) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                Ok(v as Balance)
            }

            fn visit_u128<E>(self, v: u128) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                Ok(v as Balance)
            }

            fn visit_i64<E>(self, v: i64) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                if v < 0 {
                    return Err(E::custom("negative values are not allowed for Balance"));
                }
                Ok(v as u128)
            }

            fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                v.parse::<Balance>().map_err(E::custom)
            }

            fn visit_string<E>(self, v: String) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                self.visit_str(&v)
            }
        }

        deserializer.deserialize_any(Visitor)
    }
}

mod serde_option_balance_as_dec_str {
    use super::Balance;
    use serde::{Deserializer, Serializer};

    pub fn serialize<S>(value: &Option<Balance>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match value {
            Some(v) => crate::types::near::serde_balance_as_dec_str::serialize(v, serializer),
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<Balance>, D::Error>
    where
        D: Deserializer<'de>,
    {
        // Treat absence / null as None, otherwise delegate to Balance helper.
        struct OptVisitor;
        impl<'de> serde::de::Visitor<'de> for OptVisitor {
            type Value = Option<Balance>;

            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("an optional non-negative u128 as string or number")
            }

            fn visit_unit<E>(self) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                Ok(None)
            }

            fn visit_none<E>(self) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                Ok(None)
            }

            fn visit_some<D2>(self, deserializer: D2) -> Result<Self::Value, D2::Error>
            where
                D2: Deserializer<'de>,
            {
                crate::types::near::serde_balance_as_dec_str::deserialize(deserializer).map(Some)
            }
        }

        deserializer.deserialize_option(OptVisitor)
    }
}

// === NEP-0591 GLOBAL CONTRACT TYPES ===

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GlobalContractDeployMode {
    CodeHash,
    AccountId,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GlobalContractIdentifier {
    CodeHash(CryptoHash), // 32-byte code hash
    AccountId(AccountId), // owner account ID
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FunctionCallAction {
    pub method_name: String,
    pub args: Vec<u8>,
    pub gas: Gas,
    #[serde(with = "serde_balance_as_dec_str")]
    pub deposit: Balance,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NearAction {
    CreateAccount,
    DeployContract {
        code: Vec<u8>,
    },
    FunctionCall(Box<FunctionCallAction>),
    Transfer {
        #[serde(with = "serde_balance_as_dec_str")]
        deposit: Balance,
    },
    Stake {
        #[serde(with = "serde_balance_as_dec_str")]
        stake: Balance,
        public_key: PublicKey,
    },
    AddKey {
        public_key: PublicKey,
        access_key: AccessKey,
    },
    DeleteKey {
        public_key: PublicKey,
    },
    DeleteAccount {
        beneficiary_id: AccountId,
    },
    SignedDelegate(Box<SignedDelegate>),
    DeployGlobalContract {
        code: Vec<u8>,
        deploy_mode: GlobalContractDeployMode,
    },
    UseGlobalContract {
        contract_identifier: GlobalContractIdentifier,
    },
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessKey {
    pub nonce: Nonce,
    #[serde(deserialize_with = "deserialize_access_key_permission_compat")]
    pub permission: AccessKeyPermission,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum AccessKeyPermission {
    FunctionCall(FunctionCallPermission),
    FullAccess,
}

// Allow only NEAR-style `{ "FullAccess": {} }` and
// `{"FunctionCall": { ... }}` shapes for AccessKeyPermission. This
// matches near-api-js and RPC JSON while keeping a single canonical
// representation at the JSON boundary.
pub(crate) fn deserialize_access_key_permission_compat<'de, D>(
    deserializer: D,
) -> Result<AccessKeyPermission, D::Error>
where
    D: serde::Deserializer<'de>,
{
    // Helper enum to capture the supported JSON shapes.
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Compat {
        // NEAR-style unit variant map: { "FullAccess": {} }
        FullAccessMap {
            #[serde(rename = "FullAccess")]
            full_access: serde::de::IgnoredAny,
        },
        // NEAR-style function-call map: { "FunctionCall": { ... } }
        FunctionCallMap {
            #[serde(rename = "FunctionCall")]
            function_call: FunctionCallPermission,
        },
    }

    let compat = Compat::deserialize(deserializer)?;

    match compat {
        Compat::FullAccessMap {
            full_access: _full_access,
        } => Ok(AccessKeyPermission::FullAccess),
        Compat::FunctionCallMap { function_call: fc } => Ok(AccessKeyPermission::FunctionCall(fc)),
    }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FunctionCallPermission {
    #[serde(with = "serde_option_balance_as_dec_str")]
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
    pub actions: Vec<NearAction>,
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

// === DELEGATE ACTION TYPES (NEP-461) ===

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DelegateAction {
    pub sender_id: AccountId,
    pub receiver_id: AccountId,
    pub actions: Vec<NearAction>,
    pub nonce: Nonce,
    pub max_block_height: u64,
    pub public_key: PublicKey,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignedDelegate {
    pub delegate_action: DelegateAction,
    pub signature: Signature,
}

impl SignedDelegate {
    /// Convert to borsh bytes for transmission
    pub fn to_borsh_bytes(&self) -> Result<Vec<u8>, String> {
        borsh::to_vec(self).map_err(|e| format!("Failed to serialize signed delegate: {}", e))
    }
}
