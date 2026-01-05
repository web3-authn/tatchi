// ******************************************************************************
// *                                                                            *
// *  HANDLER: DERIVE THRESHOLD CLIENT VERIFYING SHARE (PUBLIC, NON-SECRET)    *
// *                                                                            *
// ******************************************************************************

use log::debug;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::WrapKey;

#[wasm_bindgen]
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeriveThresholdEd25519ClientVerifyingShareRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "nearAccountId")]
    pub near_account_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "sessionId")]
    pub session_id: String,
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeriveThresholdEd25519ClientVerifyingShareResult {
    #[wasm_bindgen(getter_with_clone, js_name = "nearAccountId")]
    pub near_account_id: String,
    /// Base64url-encoded 32-byte verifying share (Ed25519 compressed point) for participant id=1.
    #[wasm_bindgen(getter_with_clone, js_name = "clientVerifyingShareB64u")]
    pub client_verifying_share_b64u: String,
    /// Base64url-encoded salt used alongside WrapKeySeed for KEK derivation.
    /// Returned so callers can persist it in the v3 vault entry.
    #[wasm_bindgen(getter_with_clone, js_name = "wrapKeySalt")]
    pub wrap_key_salt: String,
}

/// **Handles:** `WorkerRequestType::DeriveThresholdEd25519ClientVerifyingShare`
///
/// Derives the client's threshold verifying share deterministically from WrapKeySeed + nearAccountId.
/// This returns only the public verifying share (compressed Edwards point) and the session's wrapKeySalt.
pub async fn handle_threshold_ed25519_derive_client_verifying_share(
    request: DeriveThresholdEd25519ClientVerifyingShareRequest,
    wrap_key: WrapKey,
) -> Result<DeriveThresholdEd25519ClientVerifyingShareResult, String> {
    let near_account_id = request.near_account_id.trim().to_string();
    if near_account_id.is_empty() {
        return Err("Missing nearAccountId".to_string());
    }

    debug!(
        "[rust wasm]: derive threshold client verifying share for account {}",
        near_account_id
    );

    let client_verifying_share_b64u =
        crate::threshold::threshold_client_share::derive_threshold_client_verifying_share_b64u_v1(
            &wrap_key,
            &near_account_id,
        )?;

    Ok(DeriveThresholdEd25519ClientVerifyingShareResult {
        near_account_id,
        client_verifying_share_b64u,
        wrap_key_salt: wrap_key.salt_b64u().to_string(),
    })
}
