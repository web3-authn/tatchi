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
        let val =
            js_sys::JSON::parse(json_str).map_err(|e| format!("JSON parse failed: {:?}", e))?;

        // Deserialize JsValue to AccessKey
        serde_wasm_bindgen::from_value(val)
            .map_err(|e| format!("AccessKey deserialization failed: {}", e))
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        // Native tests compile this crate without a browser/JS runtime. To keep native
        // `cargo test` lightweight (no `serde_json` dependency), implement a tiny parser
        // that supports the AccessKey shapes we use in tests:
        // - {"nonce":0,"permission":{"FullAccess":{}}}
        // - {"nonce":0,"permission":{"FunctionCall":{"allowance":"..","receiverId":"..","methodNames":[".."]}}}
        parse_access_key_json_minimal(json_str)
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn parse_access_key_json_minimal(json_str: &str) -> Result<crate::types::AccessKey, String> {
    use crate::types::{AccessKey, AccessKeyPermission, FunctionCallPermission, Nonce};

    let compact = strip_whitespace_outside_strings(json_str);

    let nonce_str = extract_number_field(&compact, "nonce")?;
    let nonce: Nonce = nonce_str
        .parse()
        .map_err(|e| format!("Invalid nonce: {}", e))?;

    let perm_section = extract_field_value_start(&compact, "permission")?;

    let permission = if perm_section.starts_with("\"FullAccess\"") {
        AccessKeyPermission::FullAccess
    } else if perm_section.starts_with('{') {
        if perm_section.starts_with("{\"FullAccess\"") {
            AccessKeyPermission::FullAccess
        } else if perm_section.starts_with("{\"FunctionCall\"") {
            let fc_obj = extract_object_value(perm_section, "FunctionCall")?;

            let receiver_id = extract_string_field_any(&fc_obj, &["receiverId", "receiver_id"])?;
            let method_names =
                extract_string_array_field_any(&fc_obj, &["methodNames", "method_names"])?;
            let allowance = match extract_optional_field_value_start(&fc_obj, "allowance")? {
                None => None,
                Some(v) if v.starts_with("null") => None,
                Some(v) if v.starts_with('"') => {
                    let (s, _) = parse_json_string(v)?;
                    Some(parse_balance(&s)?)
                }
                Some(v) => {
                    let num = take_number_prefix(v)
                        .ok_or_else(|| "Invalid allowance value".to_string())?;
                    Some(parse_balance(num)?)
                }
            };

            AccessKeyPermission::FunctionCall(FunctionCallPermission {
                allowance,
                receiver_id,
                method_names,
            })
        } else {
            return Err("Unsupported AccessKey.permission object variant".to_string());
        }
    } else {
        return Err("Invalid AccessKey.permission value".to_string());
    };

    Ok(AccessKey { nonce, permission })
}

#[cfg(not(target_arch = "wasm32"))]
fn strip_whitespace_outside_strings(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut in_string = false;
    let mut escape = false;

    for ch in input.chars() {
        if escape {
            out.push(ch);
            escape = false;
            continue;
        }

        if in_string && ch == '\\' {
            out.push(ch);
            escape = true;
            continue;
        }

        if ch == '"' {
            in_string = !in_string;
            out.push(ch);
            continue;
        }

        if in_string || !ch.is_whitespace() {
            out.push(ch);
        }
    }

    out
}

#[cfg(not(target_arch = "wasm32"))]
fn extract_field_value_start<'a>(json: &'a str, key: &str) -> Result<&'a str, String> {
    let needle = format!("\"{}\":", key);
    let idx = json
        .find(&needle)
        .ok_or_else(|| format!("Missing '{}' field", key))?;
    Ok(&json[idx + needle.len()..])
}

#[cfg(not(target_arch = "wasm32"))]
fn extract_optional_field_value_start<'a>(
    json: &'a str,
    key: &str,
) -> Result<Option<&'a str>, String> {
    let needle = format!("\"{}\":", key);
    let Some(idx) = json.find(&needle) else {
        return Ok(None);
    };
    Ok(Some(&json[idx + needle.len()..]))
}

#[cfg(not(target_arch = "wasm32"))]
fn extract_number_field<'a>(json: &'a str, key: &str) -> Result<&'a str, String> {
    let after = extract_field_value_start(json, key)?;
    let end = after
        .find(|c: char| c == ',' || c == '}')
        .ok_or_else(|| format!("Unterminated '{}' number field", key))?;
    Ok(&after[..end])
}

#[cfg(not(target_arch = "wasm32"))]
fn extract_string_field_any(json: &str, keys: &[&str]) -> Result<String, String> {
    for key in keys {
        if let Ok(after) = extract_field_value_start(json, key) {
            let (value, _) = parse_json_string(after)?;
            return Ok(value);
        }
    }
    Err(format!("Missing string field (any of: {:?})", keys))
}

#[cfg(not(target_arch = "wasm32"))]
fn extract_string_array_field_any(json: &str, keys: &[&str]) -> Result<Vec<String>, String> {
    for key in keys {
        if let Ok(after) = extract_field_value_start(json, key) {
            return parse_json_string_array(after);
        }
    }
    Err(format!("Missing string[] field (any of: {:?})", keys))
}

#[cfg(not(target_arch = "wasm32"))]
fn extract_object_value<'a>(permission_json: &'a str, variant: &str) -> Result<&'a str, String> {
    // Expects: {"Variant":{...}} and returns the `{...}` slice.
    let needle = format!("{{\"{}\":", variant);
    if !permission_json.starts_with(&needle) {
        return Err(format!("Expected permission variant '{}'", variant));
    }
    let after = &permission_json[needle.len()..];
    if !after.starts_with('{') {
        return Err(format!(
            "Expected object for permission variant '{}'",
            variant
        ));
    }
    let end = find_matching_brace_index(after)
        .ok_or_else(|| format!("Unterminated permission variant '{}'", variant))?;
    Ok(&after[..=end])
}

#[cfg(not(target_arch = "wasm32"))]
fn find_matching_brace_index(s: &str) -> Option<usize> {
    let mut depth: i32 = 0;
    let mut in_string = false;
    let mut escape = false;

    for (i, ch) in s.char_indices() {
        if escape {
            escape = false;
            continue;
        }
        if in_string && ch == '\\' {
            escape = true;
            continue;
        }
        if ch == '"' {
            in_string = !in_string;
            continue;
        }
        if in_string {
            continue;
        }
        if ch == '{' {
            depth += 1;
        } else if ch == '}' {
            depth -= 1;
            if depth == 0 {
                return Some(i);
            }
        }
    }
    None
}

#[cfg(not(target_arch = "wasm32"))]
fn parse_json_string(input: &str) -> Result<(String, &str), String> {
    let mut chars = input.chars();
    let Some('"') = chars.next() else {
        return Err("Expected '\"'".to_string());
    };

    let mut out = String::new();
    let mut escape = false;
    let mut consumed = 1usize;

    for ch in chars {
        consumed += ch.len_utf8();
        if escape {
            out.push(ch);
            escape = false;
            continue;
        }
        if ch == '\\' {
            escape = true;
            continue;
        }
        if ch == '"' {
            let rest = &input[consumed..];
            return Ok((out, rest));
        }
        out.push(ch);
    }

    Err("Unterminated string".to_string())
}

#[cfg(not(target_arch = "wasm32"))]
fn parse_json_string_array(input: &str) -> Result<Vec<String>, String> {
    // Expects: ["a","b"] (whitespace already stripped outside strings)
    if !input.starts_with('[') {
        return Err("Expected '['".to_string());
    }
    let end = input
        .find(']')
        .ok_or_else(|| "Unterminated string array".to_string())?;
    let mut cursor = &input[1..end];
    let mut out: Vec<String> = Vec::new();

    while !cursor.is_empty() {
        if cursor.starts_with(',') {
            cursor = &cursor[1..];
            continue;
        }
        let (s, rest) = parse_json_string(cursor)?;
        out.push(s);
        cursor = rest;
    }

    Ok(out)
}

#[cfg(not(target_arch = "wasm32"))]
fn take_number_prefix(input: &str) -> Option<&str> {
    let end = input
        .find(|c: char| c == ',' || c == '}' || c == ']')
        .unwrap_or(input.len());
    let prefix = &input[..end];
    if prefix.is_empty() {
        None
    } else {
        Some(prefix)
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn parse_balance(input: &str) -> Result<Balance, String> {
    input
        .parse::<Balance>()
        .map_err(|e| format!("Invalid allowance: {}", e))
}
