use crate::types::*;
use bs58;
use serde::{Deserialize, Serialize};

// === ACTION TYPES AND HANDLERS ===

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "action_type")]
pub enum ActionParams {
    CreateAccount,
    DeployContract {
        code: Vec<u8>,
    },
    FunctionCall {
        method_name: String,
        args: String, // Expecting JSON string from TS
        gas: String,
        deposit: String,
    },
    Transfer {
        deposit: String,
    },
    Stake {
        stake: String,
        public_key: String, // NEAR format public key
    },
    AddKey {
        public_key: String,
        access_key: String, // Expecting JSON string from TS
    },
    DeleteKey {
        public_key: String,
    },
    DeleteAccount {
        beneficiary_id: String,
    },
    SignedDelegate {
        /// Fully-typed NEP-461 SignedDelegate payload, passed through from TS.
        delegate_action: DelegateAction,
        signature: Signature,
    },
    // NEP-0591 Global Contracts
    DeployGlobalContract {
        code: Vec<u8>,
        // "CodeHash" | "AccountId" (same strings as TS ActionType side)
        deploy_mode: String,
    },
    UseGlobalContract {
        // Exactly one of these must be set by TS side
        account_id: Option<String>,
        code_hash: Option<String>, // bs58 string encoded 32-byte hash
    },
}

impl ActionParams {
    /// Validate the current params and convert into a concrete NEAR `NearAction`.
    pub fn to_action(&self) -> Result<NearAction, String> {
        match self {
            ActionParams::CreateAccount => Ok(NearAction::CreateAccount),

            ActionParams::DeployContract { code } => {
                if code.is_empty() {
                    return Err("Contract code cannot be empty".to_string());
                }
                Ok(NearAction::DeployContract { code: code.clone() })
            }

            ActionParams::FunctionCall {
                method_name,
                args,
                gas,
                deposit,
            } => {
                if method_name.is_empty() {
                    return Err("Method name cannot be empty".to_string());
                }

                let gas_amount = gas
                    .parse::<Gas>()
                    .map_err(|_| "Invalid gas amount".to_string())?;

                let deposit_amount = deposit
                    .parse::<Balance>()
                    .map_err(|_| "Invalid deposit amount".to_string())?;

                let args_vec = args.as_bytes().to_vec();

                Ok(NearAction::FunctionCall(Box::new(FunctionCallAction {
                    method_name: method_name.clone(),
                    args: args_vec,
                    gas: gas_amount,
                    deposit: deposit_amount,
                })))
            }

            ActionParams::Transfer { deposit } => {
                if deposit.is_empty() {
                    return Err("Transfer deposit cannot be empty".to_string());
                }
                let deposit_amount = deposit
                    .parse::<Balance>()
                    .map_err(|_| "Invalid deposit amount".to_string())?;
                Ok(NearAction::Transfer {
                    deposit: deposit_amount,
                })
            }

            ActionParams::Stake { stake, public_key } => {
                if stake.is_empty() {
                    return Err("Stake amount cannot be empty".to_string());
                }
                let stake_amount = stake
                    .parse::<Balance>()
                    .map_err(|_| "Invalid stake amount".to_string())?;

                if public_key.is_empty() {
                    return Err("Public key cannot be empty".to_string());
                }
                if !public_key.starts_with("ed25519:") && public_key.len() < 32 {
                    return Err("Invalid public key format".to_string());
                }

                let parsed_public_key = if public_key.starts_with("ed25519:") {
                    let key_str = &public_key[8..];
                    let key_bytes = bs58::decode(key_str)
                        .into_vec()
                        .map_err(|e| format!("Failed to decode public key: {}", e))?;

                    if key_bytes.len() != 32 {
                        return Err("Public key must be 32 bytes".to_string());
                    }

                    let mut key_array = [0u8; 32];
                    key_array.copy_from_slice(&key_bytes);
                    crate::types::PublicKey::from_ed25519_bytes(&key_array)
                } else {
                    return Err("Public key must start with 'ed25519:'".to_string());
                };

                Ok(NearAction::Stake {
                    stake: stake_amount,
                    public_key: parsed_public_key,
                })
            }

            ActionParams::AddKey {
                public_key,
                access_key,
            } => {
                if public_key.is_empty() {
                    return Err("Public key cannot be empty".to_string());
                }

                if !public_key.starts_with("ed25519:") && public_key.len() < 32 {
                    return Err("Invalid public key format".to_string());
                }

                let parsed_public_key = if public_key.starts_with("ed25519:") {
                    let key_str = &public_key[8..];
                    let key_bytes = bs58::decode(key_str)
                        .into_vec()
                        .map_err(|e| format!("Failed to decode public key: {}", e))?;

                    if key_bytes.len() != 32 {
                        return Err("Public key must be 32 bytes".to_string());
                    }

                    let mut key_array = [0u8; 32];
                    key_array.copy_from_slice(&key_bytes);
                    crate::types::PublicKey::from_ed25519_bytes(&key_array)
                } else {
                    return Err("Public key must start with 'ed25519:'".to_string());
                };

                // Parse access_key using helper (handles WASM vs Native)
                let parsed_access_key = parse_access_key_from_json(&access_key)?;

                Ok(NearAction::AddKey {
                    public_key: parsed_public_key,
                    access_key: parsed_access_key,
                })
            }

            ActionParams::DeleteKey { public_key } => {
                if public_key.is_empty() {
                    return Err("Public key cannot be empty".to_string());
                }

                // Validate public key format (should be "ed25519:..." or raw base58)
                if !public_key.starts_with("ed25519:") && public_key.len() < 32 {
                    return Err("Invalid public key format".to_string());
                }

                // Parse the public key
                let parsed_public_key = if public_key.starts_with("ed25519:") {
                    let key_str = &public_key[8..]; // Remove "ed25519:" prefix
                    let key_bytes = bs58::decode(key_str)
                        .into_vec()
                        .map_err(|e| format!("Failed to decode public key: {}", e))?;

                    if key_bytes.len() != 32 {
                        return Err("Public key must be 32 bytes".to_string());
                    }

                    let mut key_array = [0u8; 32];
                    key_array.copy_from_slice(&key_bytes);
                    crate::types::PublicKey::from_ed25519_bytes(&key_array)
                } else {
                    return Err("Public key must start with 'ed25519:'".to_string());
                };

                Ok(NearAction::DeleteKey {
                    public_key: parsed_public_key,
                })
            }

            ActionParams::DeleteAccount { beneficiary_id } => {
                if beneficiary_id.is_empty() {
                    return Err("Beneficiary ID cannot be empty".to_string());
                }

                let beneficiary = beneficiary_id
                    .parse::<crate::types::AccountId>()
                    .map_err(|e| format!("Failed to parse beneficiary account ID: {}", e))?;

                Ok(NearAction::DeleteAccount {
                    beneficiary_id: beneficiary,
                })
            }

            ActionParams::SignedDelegate {
                delegate_action,
                signature,
            } => {
                if delegate_action.sender_id.0.is_empty() {
                    return Err("delegate_action.sender_id cannot be empty".to_string());
                }
                if delegate_action.receiver_id.0.is_empty() {
                    return Err("delegate_action.receiver_id cannot be empty".to_string());
                }
                if delegate_action.actions.is_empty() {
                    return Err("delegate_action.actions cannot be empty".to_string());
                }
                if delegate_action.nonce == 0 {
                    return Err("delegate_action.nonce must be non-zero".to_string());
                }
                if signature.signature_data.len() != 64 {
                    return Err("delegate signature must be 64 bytes".to_string());
                }

                let signed = SignedDelegate {
                    delegate_action: delegate_action.clone(),
                    signature: signature.clone(),
                };
                Ok(NearAction::SignedDelegate(Box::new(signed)))
            }

            ActionParams::DeployGlobalContract { code, deploy_mode } => {
                if code.is_empty() {
                    return Err("Global contract code cannot be empty".to_string());
                }
                let mode = match deploy_mode.as_str() {
                    "CodeHash" => GlobalContractDeployMode::CodeHash,
                    "AccountId" => GlobalContractDeployMode::AccountId,
                    other => return Err(format!("Invalid deploy_mode: {}", other)),
                };
                Ok(NearAction::DeployGlobalContract {
                    code: code.clone(),
                    deploy_mode: mode,
                })
            }

            ActionParams::UseGlobalContract {
                account_id,
                code_hash,
            } => {
                let identifier = match (account_id, code_hash) {
                    (Some(id), None) => {
                        if id.is_empty() {
                            return Err("account_id cannot be empty".to_string());
                        }
                        let acc = id
                            .parse::<crate::types::AccountId>()
                            .map_err(|e| format!("Invalid account_id: {}", e))?;
                        GlobalContractIdentifier::AccountId(acc)
                    }
                    (None, Some(hash_str)) => {
                        if hash_str.is_empty() {
                            return Err("code_hash cannot be empty".to_string());
                        }
                        let bytes = bs58::decode(hash_str)
                            .into_vec()
                            .map_err(|e| format!("Invalid code_hash: {}", e))?;
                        if bytes.len() != 32 {
                            return Err("code_hash must be 32 bytes".to_string());
                        }
                        let mut arr = [0u8; 32];
                        arr.copy_from_slice(&bytes);
                        GlobalContractIdentifier::CodeHash(CryptoHash::from_bytes(arr))
                    }
                    _ => {
                        return Err(
                            "UseGlobalContract requires exactly one of account_id or code_hash"
                                .to_string(),
                        );
                    }
                };

                Ok(NearAction::UseGlobalContract {
                    contract_identifier: identifier,
                })
            }
        }
    }

    /// Lightweight validator used by tests and callers that only care about
    /// parameter validity, not the constructed action.
    pub fn validate(&self) -> Result<(), String> {
        self.to_action().map(|_| ())
    }
}

// Helper for parsing JSON string to AccessKey without serde_json dependency on WASM
fn parse_access_key_from_json(json_str: &str) -> Result<crate::types::AccessKey, String> {
    #[cfg(target_arch = "wasm32")]
    {
        // Parse JSON string to JsValue
        let val = js_sys::JSON::parse(json_str)
            .map_err(|e| format!("JSON parse failed: {:?}", e))?;

        // Deserialize JsValue to AccessKey
        serde_wasm_bindgen::from_value(val)
            .map_err(|e| format!("AccessKey deserialization failed: {}", e))
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        // Native fallback - requires serde_json or manual parsing.
        // Since we don't have serde_json in dependencies, we return error.
        let _ = json_str;
        Err(
            "Parsing JSON string AccessKey not supported on native target without serde_json"
                .to_string(),
        )
    }
}
