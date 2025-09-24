// ******************************************************************************
// *                                                                            *
// *                    HANDLER: EXTRACT COSE PUBLIC KEY                      *
// *                                                                            *
// ******************************************************************************
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExtractCoseRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "attestationObjectBase64url")]
    pub attestation_object_base64url: String,
}

#[wasm_bindgen]
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CoseExtractionResult {
    #[wasm_bindgen(getter_with_clone, js_name = "cosePublicKeyBytes")]
    pub cose_public_key_bytes: Vec<u8>,
}

/// **Handles:** `WorkerRequestType::ExtractCosePublicKey`
/// This handler parses a WebAuthn attestation object and extracts the COSE-formatted public key
/// for cryptographic operations. Used during registration to obtain the authenticator's public key
/// in a standardized format.
///
/// # Arguments
/// * `request` - Contains base64url-encoded attestation object
///
/// # Returns
/// * `CoseExtractionResult` - Contains extracted COSE public key bytes
pub async fn handle_extract_cose_public_key(
    request: ExtractCoseRequest,
) -> Result<CoseExtractionResult, String> {
    let cose_public_key_bytes = crate::cose::extract_cose_public_key_from_attestation(
        &request.attestation_object_base64url,
    )
    .map_err(|e| format!("Failed to extract COSE public key: {}", e))?;

    let result = CoseExtractionResult {
        cose_public_key_bytes: cose_public_key_bytes,
    };

    Ok(result)
}
