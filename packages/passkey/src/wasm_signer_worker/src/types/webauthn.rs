use serde::{Serialize, Deserialize};
use wasm_bindgen::prelude::*;

// === WEBAUTHN CREDENTIAL TYPES ===
// WebAuthn credential data structures for registration and authentication

// === WASM-BINDGEN TYPES ===
// WebAuthn credential types for WASM-BINDGEN input
#[wasm_bindgen]
#[derive(Debug, Clone)]
pub struct WebAuthnRegistrationCredentialStruct {
    #[wasm_bindgen(getter_with_clone)]
    pub id: String,
    #[wasm_bindgen(getter_with_clone)]
    pub raw_id: String,
    #[wasm_bindgen(getter_with_clone)]
    pub credential_type: String,
    #[wasm_bindgen(getter_with_clone)]
    pub authenticator_attachment: Option<String>,
    #[wasm_bindgen(getter_with_clone)]
    pub client_data_json: String,
    #[wasm_bindgen(getter_with_clone)]
    pub attestation_object: String,
    #[wasm_bindgen(getter_with_clone)]
    pub transports: Option<Vec<String>>,
    #[wasm_bindgen(getter_with_clone)]
    pub ed25519_prf_output: Option<String>, // For recovery
}

#[wasm_bindgen]
impl WebAuthnRegistrationCredentialStruct {
    #[wasm_bindgen(constructor)]
    pub fn new(
        id: String,
        raw_id: String,
        credential_type: String,
        authenticator_attachment: Option<String>,
        client_data_json: String,
        attestation_object: String,
        transports: Option<Vec<String>>,
        ed25519_prf_output: Option<String>,
    ) -> WebAuthnRegistrationCredentialStruct {
        WebAuthnRegistrationCredentialStruct {
            id,
            raw_id,
            credential_type,
            authenticator_attachment,
            client_data_json,
            attestation_object,
            transports,
            ed25519_prf_output,
        }
    }
}

#[wasm_bindgen]
#[derive(Debug, Clone, Deserialize)]
pub struct WebAuthnAuthenticationCredentialStruct {
    #[wasm_bindgen(getter_with_clone)]
    pub id: String,
    #[wasm_bindgen(getter_with_clone)]
    pub raw_id: String,
    #[wasm_bindgen(getter_with_clone)]
    pub credential_type: String,
    #[wasm_bindgen(getter_with_clone)]
    pub authenticator_attachment: Option<String>,
    #[wasm_bindgen(getter_with_clone)]
    pub client_data_json: String,
    #[wasm_bindgen(getter_with_clone)]
    pub authenticator_data: String,
    #[wasm_bindgen(getter_with_clone)]
    pub signature: String,
    #[wasm_bindgen(getter_with_clone)]
    pub user_handle: Option<String>,
}

#[wasm_bindgen]
impl WebAuthnAuthenticationCredentialStruct {
    #[wasm_bindgen(constructor)]
    pub fn new(
        id: String,
        raw_id: String,
        credential_type: String,
        authenticator_attachment: Option<String>,
        client_data_json: String,
        authenticator_data: String,
        signature: String,
        user_handle: Option<String>,
    ) -> WebAuthnAuthenticationCredentialStruct {
        WebAuthnAuthenticationCredentialStruct {
            id,
            raw_id,
            credential_type,
            authenticator_attachment,
            client_data_json,
            authenticator_data,
            signature,
            user_handle,
        }
    }
}

// === STRUCT CONVERSIONS ===

impl From<&WebAuthnAuthenticationCredentialStruct> for WebAuthnAuthenticationCredential {
    fn from(credential: &WebAuthnAuthenticationCredentialStruct) -> Self {
        WebAuthnAuthenticationCredential {
            id: credential.id.clone(),
            raw_id: credential.raw_id.clone(),
            response: WebAuthnAuthenticationResponse {
                client_data_json: credential.client_data_json.clone(),
                authenticator_data: credential.authenticator_data.clone(),
                signature: credential.signature.clone(),
                user_handle: credential.user_handle.clone(),
            },
            authenticator_attachment: credential.authenticator_attachment.clone(),
            auth_type: credential.credential_type.clone(),
        }
    }
}

impl From<&WebAuthnRegistrationCredentialStruct> for WebAuthnRegistrationCredential {
    fn from(credential: &WebAuthnRegistrationCredentialStruct) -> Self {
        WebAuthnRegistrationCredential {
            id: credential.id.clone(),
            raw_id: credential.raw_id.clone(),
            response: WebAuthnRegistrationResponse {
                client_data_json: credential.client_data_json.clone(),
                attestation_object: credential.attestation_object.clone(),
                transports: credential.transports.clone(),
            },
            authenticator_attachment: credential.authenticator_attachment.clone(),
            reg_type: credential.credential_type.clone(),
        }
    }
}

/// WebAuthn authentication data for contract verification
#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct WebAuthnAuthenticationCredential {
    pub id: String,
    #[serde(rename = "rawId")]
    pub raw_id: String,
    pub response: WebAuthnAuthenticationResponse,
    #[serde(rename = "authenticatorAttachment")]
    pub authenticator_attachment: Option<String>,
    #[serde(rename = "type")]
    pub auth_type: String,
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct WebAuthnAuthenticationResponse {
    #[serde(rename = "clientDataJSON")]
    pub client_data_json: String,
    #[serde(rename = "authenticatorData")]
    pub authenticator_data: String,
    pub signature: String,
    #[serde(rename = "userHandle")]
    pub user_handle: Option<String>,
}

/// WebAuthn registration data for contract verification
#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct WebAuthnRegistrationCredential {
    pub id: String,
    #[serde(rename = "rawId")]
    pub raw_id: String,
    pub response: WebAuthnRegistrationResponse,
    #[serde(rename = "authenticatorAttachment")]
    pub authenticator_attachment: Option<String>,
    #[serde(rename = "type")]
    pub reg_type: String,
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct WebAuthnRegistrationResponse {
    #[serde(rename = "clientDataJSON")]
    pub client_data_json: String,
    #[serde(rename = "attestationObject")]
    pub attestation_object: String,
    pub transports: Option<Vec<String>>,
}

// === SHARED CREDENTIAL TYPES ===

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SerializedCredential {
    pub id: String,
    #[serde(rename = "rawId")]
    pub raw_id: String,
    #[serde(rename = "type")]
    pub credential_type: String,
    #[serde(rename = "authenticatorAttachment")]
    pub authenticator_attachment: Option<String>,
    pub response: AuthenticationResponse,
    #[serde(rename = "clientExtensionResults")]
    pub client_extension_results: ClientExtensionResults,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SerializedRegistrationCredential {
    pub id: String,
    #[serde(rename = "rawId")]
    pub raw_id: String,
    #[serde(rename = "type")]
    pub credential_type: String,
    #[serde(rename = "authenticatorAttachment")]
    pub authenticator_attachment: Option<String>,
    pub response: RegistrationResponse,
    #[serde(rename = "clientExtensionResults")]
    pub client_extension_results: ClientExtensionResults,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AuthenticationResponse {
    #[serde(rename = "clientDataJSON")]
    pub client_data_json: String,
    #[serde(rename = "authenticatorData")]
    pub authenticator_data: String,
    pub signature: String,
    #[serde(rename = "userHandle")]
    pub user_handle: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RegistrationResponse {
    #[serde(rename = "clientDataJSON")]
    pub client_data_json: String,
    #[serde(rename = "attestationObject")]
    pub attestation_object: String,
    pub transports: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ClientExtensionResults {
    pub prf: PrfResults,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PrfResults {
    pub results: PrfOutputs,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PrfOutputs {
    pub first: Option<String>,
    pub second: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VrfChallenge {
    pub vrf_input: String,
    pub vrf_output: String,
    pub vrf_proof: String,
    pub vrf_public_key: String,
    pub user_id: String,
    pub rp_id: String,
    pub block_height: u64,
    pub block_hash: String,
}