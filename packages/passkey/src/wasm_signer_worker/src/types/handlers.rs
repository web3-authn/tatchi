use serde::{Serialize, Deserialize};
use wasm_bindgen::prelude::*;

use crate::handlers::handle_derive_near_keypair_and_encrypt::DeriveNearKeypairAndEncryptResult;
use crate::types::{VrfChallenge, SerializedCredential, SerializedRegistrationCredential};

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
    #[serde(rename = "allSubdomains", skip_serializing_if = "Option::is_none", default)]
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
                multiple: None
            }),
        }
    }
}

// ******************************************************************************
// *                                                                            *
// *                    SHARED VERIFICATION & DECRYPTION TYPES                  *
// *                                                                            *
// ******************************************************************************

// === VERIFICATION TYPE (consolidated) ===

/// Consolidated verification type for all flows.
///
/// - For transaction signing, set `vrf_challenge` and `authentication_credential`.
/// - For registration, set `vrf_challenge` and `registration_credential`.
#[wasm_bindgen]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationPayload {
    #[wasm_bindgen(getter_with_clone, js_name = "contractId")]
    pub contract_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "nearRpcUrl")]
    pub near_rpc_url: String,
    #[wasm_bindgen(getter_with_clone, js_name = "vrfChallenge")]
    pub vrf_challenge: Option<VrfChallenge>,
    #[wasm_bindgen(getter_with_clone, js_name = "authenticationCredential")]
    pub authentication_credential: Option<SerializedCredential>,
    #[wasm_bindgen(getter_with_clone, js_name = "registrationCredential")]
    pub registration_credential: Option<SerializedRegistrationCredential>,
}

// === DECRYPTION TYPES ===

/// Decryption payload (consolidated for deserialization and WASM binding)
#[wasm_bindgen]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecryptionPayload {
    #[wasm_bindgen(getter_with_clone, js_name = "chacha20PrfOutput")]
    pub chacha20_prf_output: String,
    #[wasm_bindgen(getter_with_clone, js_name = "encryptedPrivateKeyData")]
    pub encrypted_private_key_data: String,
    #[wasm_bindgen(getter_with_clone, js_name = "encryptedPrivateKeyIv")]
    pub encrypted_private_key_iv: String,
}

#[wasm_bindgen]
impl DecryptionPayload {
    #[wasm_bindgen(constructor)]
    pub fn new(
        chacha20_prf_output: String,
        encrypted_private_key_data: String,
        encrypted_private_key_iv: String,
    ) -> DecryptionPayload {
        DecryptionPayload {
            chacha20_prf_output,
            encrypted_private_key_data,
            encrypted_private_key_iv,
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
