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
#[derive(Serialize, Deserialize, Debug)]
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

#[derive(Serialize, Deserialize, Debug, Clone)]
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
#[derive(Serialize, Deserialize, Debug, Clone)]
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

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WebAuthnRegistrationResponse {
    #[serde(rename = "clientDataJSON")]
    pub client_data_json: String,
    #[serde(rename = "attestationObject")]
    pub attestation_object: String,
    pub transports: Option<Vec<String>>,
}

// === SHARED CREDENTIAL TYPES ===

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SerializedCredential {
    #[wasm_bindgen(getter_with_clone, js_name = "id")]
    pub id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "rawId")]
    pub raw_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "type")]
    #[serde(alias = "type")]
    pub credential_type: String,
    #[wasm_bindgen(getter_with_clone, js_name = "authenticatorAttachment")]
    pub authenticator_attachment: Option<String>,
    #[wasm_bindgen(getter_with_clone, js_name = "response")]
    pub response: AuthenticationResponse,
    #[wasm_bindgen(getter_with_clone, js_name = "clientExtensionResults")]
    pub client_extension_results: ClientExtensionResults,
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SerializedRegistrationCredential {
    #[wasm_bindgen(getter_with_clone, js_name = "id")]
    pub id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "rawId")]
    pub raw_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "type")]
    #[serde(alias = "type")]
    pub credential_type: String,
    #[wasm_bindgen(getter_with_clone, js_name = "authenticatorAttachment")]
    pub authenticator_attachment: Option<String>,
    #[wasm_bindgen(getter_with_clone, js_name = "response")]
    pub response: RegistrationResponse,
    #[wasm_bindgen(getter_with_clone, js_name = "clientExtensionResults")]
    pub client_extension_results: ClientExtensionResults,
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AuthenticationResponse {
    #[wasm_bindgen(getter_with_clone, js_name = "clientDataJSON")]
    #[serde(alias = "clientDataJSON")]
    pub client_data_json: String,
    #[wasm_bindgen(getter_with_clone, js_name = "authenticatorData")]
    #[serde(alias = "authenticatorData")]
    pub authenticator_data: String,
    #[wasm_bindgen(getter_with_clone)]
    pub signature: String,
    #[wasm_bindgen(getter_with_clone, js_name = "userHandle")]
    #[serde(alias = "userHandle")]
    pub user_handle: Option<String>,
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationResponse {
    #[wasm_bindgen(getter_with_clone, js_name = "clientDataJSON")]
    #[serde(alias = "clientDataJSON")]
    pub client_data_json: String,
    #[wasm_bindgen(getter_with_clone, js_name = "attestationObject")]
    #[serde(alias = "attestationObject")]
    pub attestation_object: String,
    #[wasm_bindgen(getter_with_clone, js_name = "transports")]
    pub transports: Vec<String>,
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ClientExtensionResults {
    #[wasm_bindgen(getter_with_clone, js_name = "prf")]
    pub prf: PrfResults,
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PrfResults {
    #[wasm_bindgen(getter_with_clone, js_name = "results")]
    pub results: PrfOutputs,
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PrfOutputs {
    #[wasm_bindgen(getter_with_clone, js_name = "first")]
    pub first: Option<String>,
    #[wasm_bindgen(getter_with_clone, js_name = "second")]
    pub second: Option<String>,
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VrfChallenge {
    #[wasm_bindgen(getter_with_clone, js_name = "vrfInput")]
    pub vrf_input: String,
    #[wasm_bindgen(getter_with_clone, js_name = "vrfOutput")]
    pub vrf_output: String,
    #[wasm_bindgen(getter_with_clone, js_name = "vrfProof")]
    pub vrf_proof: String,
    #[wasm_bindgen(getter_with_clone, js_name = "vrfPublicKey")]
    pub vrf_public_key: String,
    #[wasm_bindgen(getter_with_clone, js_name = "userId")]
    pub user_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "rpId")]
    pub rp_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "blockHeight")]
    pub block_height: String,
    #[wasm_bindgen(getter_with_clone, js_name = "blockHash")]
    pub block_hash: String,
}