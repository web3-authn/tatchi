use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

// ******************************************************************************
// *                                                                            *
// *                    SHARED AUTHENTICATOR OPTIONS TYPES                      *
// *                                                                            *
// ******************************************************************************

// === AUTHENTICATOR OPTIONS TYPES ===

/// User verification policy for WebAuthn authenticators
#[wasm_bindgen]
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum UserVerificationPolicy {
    #[serde(rename = "required")]
    Required,
    #[serde(rename = "preferred")]
    Preferred,
    #[serde(rename = "discouraged")]
    Discouraged,
}

/// Origin policy input for WebAuthn registration (user-provided)
#[wasm_bindgen]
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct OriginPolicyInput {
    /// Exactly one of these should be set
    #[serde(skip_serializing_if = "Option::is_none", default)]
    #[wasm_bindgen(getter_with_clone)]
    pub single: Option<bool>,
    #[serde(
        rename = "allSubdomains",
        skip_serializing_if = "Option::is_none",
        default
    )]
    #[wasm_bindgen(getter_with_clone)]
    pub all_subdomains: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    #[wasm_bindgen(getter_with_clone)]
    pub multiple: Option<Vec<String>>,
}

/// Options for configuring WebAuthn authenticator behavior during registration
#[wasm_bindgen]
#[wasm_bindgen]
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct AuthenticatorOptions {
    #[wasm_bindgen(getter_with_clone, js_name = "userVerification")]
    pub user_verification: Option<UserVerificationPolicy>,
    #[wasm_bindgen(getter_with_clone, js_name = "originPolicy")]
    pub origin_policy: Option<OriginPolicyInput>,
}

impl Default for AuthenticatorOptions {
    fn default() -> Self {
        Self {
            user_verification: Some(UserVerificationPolicy::Preferred),
            origin_policy: Some(OriginPolicyInput {
                single: None,
                all_subdomains: Some(true),
                multiple: None,
            }),
        }
    }
}

// ******************************************************************************
// *                                                                            *
// *                    SHARED VERIFICATION & DECRYPTION TYPES                  *
// *                                                                            *
// ******************************************************************************

// === RPC CALL PAYLOAD TYPE ===

/// RPC call parameters for NEAR operations and VRF generation
/// Used to pass essential parameters for background operations
#[wasm_bindgen]
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcCallPayload {
    #[wasm_bindgen(getter_with_clone, js_name = "contractId")]
    pub contract_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "nearRpcUrl")]
    pub near_rpc_url: String,
    #[wasm_bindgen(getter_with_clone, js_name = "nearAccountId")]
    pub near_account_id: String,
}

// === TRANSACTION CONTEXT TYPE ===

/// Transaction context containing NEAR blockchain data
/// Computed in the main thread confirmation flow
#[wasm_bindgen]
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionContext {
    #[wasm_bindgen(getter_with_clone, js_name = "nearPublicKeyStr")]
    pub near_public_key_str: String,
    #[wasm_bindgen(getter_with_clone, js_name = "nextNonce")]
    pub next_nonce: String,
    #[wasm_bindgen(getter_with_clone, js_name = "txBlockHeight")]
    pub tx_block_height: String,
    #[wasm_bindgen(getter_with_clone, js_name = "txBlockHash")]
    pub tx_block_hash: String,
}

// NOTE: VerificationPayload was deprecated; use RpcCallPayload instead (struct removed).

// === DECRYPTION TYPES ===

// ******************************************************************************
// *                                                                            *
// *                    CONFIRMATION CONFIGURATION TYPES                        *
// *                                                                            *
// ******************************************************************************

/// UI mode for confirmation display
#[wasm_bindgen]
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum ConfirmationUIMode {
    #[serde(rename = "skip")]
    Skip,
    #[serde(rename = "modal")]
    Modal,
    #[serde(rename = "drawer")]
    Drawer,
}

/// Behavior mode for confirmation flow
#[wasm_bindgen]
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum ConfirmationBehavior {
    #[serde(rename = "requireClick")]
    RequireClick,
    #[serde(rename = "autoProceed")]
    AutoProceed,
}

/// Unified confirmation configuration passed from main thread to WASM worker
#[wasm_bindgen]
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConfirmationConfig {
    /// Type of UI to display for confirmation
    #[wasm_bindgen(getter_with_clone, js_name = "uiMode")]
    pub ui_mode: ConfirmationUIMode,

    /// How the confirmation UI behaves
    #[wasm_bindgen(getter_with_clone)]
    pub behavior: ConfirmationBehavior,

    /// Delay in milliseconds before auto-proceeding (only used with autoProceedWithDelay)
    #[wasm_bindgen(getter_with_clone, js_name = "autoProceedDelay")]
    pub auto_proceed_delay: Option<u32>,

    /// UI theme preference (dark/light)
    #[wasm_bindgen(getter_with_clone)]
    pub theme: Option<String>,
}

impl Default for ConfirmationConfig {
    fn default() -> Self {
        Self {
            ui_mode: ConfirmationUIMode::Modal,
            behavior: ConfirmationBehavior::RequireClick,
            auto_proceed_delay: Some(2000),
            theme: Some("dark".to_string()),
        }
    }
}

// === DECRYPTION TYPES ===

/// Decryption payload (consolidated for deserialization and WASM binding)
#[wasm_bindgen]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecryptionPayload {
    /// Encrypted NEAR private key
    #[wasm_bindgen(getter_with_clone, js_name = "encryptedPrivateKeyData")]
    pub encrypted_private_key_data: String,
    /// ChaCha20-Poly1305 nonce (base64url) for `encryptedPrivateKeyData`.
    ///
    /// Accepts legacy `encryptedPrivateKeyIv` via serde alias.
    #[wasm_bindgen(getter_with_clone, js_name = "encryptedPrivateKeyChacha20NonceB64u")]
    #[serde(alias = "encryptedPrivateKeyIv")]
    pub encrypted_private_key_chacha20_nonce_b64u: String,
}

#[wasm_bindgen]
impl DecryptionPayload {
    #[wasm_bindgen(constructor)]
    pub fn new(
        encrypted_private_key_data: String,
        encrypted_private_key_chacha20_nonce_b64u: String,
    ) -> DecryptionPayload {
        DecryptionPayload {
            encrypted_private_key_data,
            encrypted_private_key_chacha20_nonce_b64u,
        }
    }
}

// === REGISTRATION TYPES ===

#[wasm_bindgen]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationPayload {
    #[wasm_bindgen(getter_with_clone, js_name = "nearAccountId")]
    pub near_account_id: String,
    #[wasm_bindgen(getter_with_clone)]
    pub nonce: String,
    #[wasm_bindgen(getter_with_clone, js_name = "blockHash")]
    pub block_hash: String,
    #[wasm_bindgen(getter_with_clone, js_name = "deterministicVrfPublicKey")]
    pub deterministic_vrf_public_key: Option<String>,
    #[wasm_bindgen(getter_with_clone, js_name = "deviceNumber")]
    pub device_number: Option<u8>,
    #[wasm_bindgen(getter_with_clone, js_name = "authenticatorOptions")]
    pub authenticator_options: Option<AuthenticatorOptions>,
}
