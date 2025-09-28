// ******************************************************************************
// *                                                                            *
// *                  HANDLER: DECRYPT PRIVATE KEY WITH PRF                   *
// *                                                                            *
// ******************************************************************************
use crate::handlers::confirm_tx_details::{generate_request_id, ConfirmationResult};
use bs58;
use log::info;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsValue;

// Bridge to TS awaitSecureConfirmationV2 (defined globally in the worker wrapper)
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_name = awaitSecureConfirmationV2)]
    async fn await_secure_confirmation_v2(request: JsValue) -> JsValue;
}

#[wasm_bindgen]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecryptPrivateKeyRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "nearAccountId")]
    pub near_account_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "chacha20PrfOutput")]
    pub chacha20_prf_output: String,
    #[wasm_bindgen(getter_with_clone, js_name = "encryptedPrivateKeyData")]
    pub encrypted_private_key_data: String,
    #[wasm_bindgen(getter_with_clone, js_name = "encryptedPrivateKeyIv")]
    pub encrypted_private_key_iv: String,
}

#[wasm_bindgen]
impl DecryptPrivateKeyRequest {
    #[wasm_bindgen(constructor)]
    pub fn new(
        near_account_id: String,
        chacha20_prf_output: String,
        encrypted_private_key_data: String,
        encrypted_private_key_iv: String,
    ) -> DecryptPrivateKeyRequest {
        DecryptPrivateKeyRequest {
            near_account_id,
            chacha20_prf_output,
            encrypted_private_key_data,
            encrypted_private_key_iv,
        }
    }
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecryptPrivateKeyResult {
    #[wasm_bindgen(getter_with_clone, js_name = "privateKey")]
    pub private_key: String,
    #[wasm_bindgen(getter_with_clone, js_name = "nearAccountId")]
    pub near_account_id: String,
}

#[wasm_bindgen]
impl DecryptPrivateKeyResult {
    #[wasm_bindgen(constructor)]
    pub fn new(private_key: String, near_account_id: String) -> DecryptPrivateKeyResult {
        DecryptPrivateKeyResult {
            private_key,
            near_account_id,
        }
    }
}

/// **Handles:** `WorkerRequestType::DecryptPrivateKeyWithPrf`
/// This handler takes encrypted private key data and an AES PRF output to decrypt and return
/// the private key in NEAR-compatible format. Used when applications need direct access to
/// the private key for signing operations outside of the worker context.
///
/// # Arguments
/// * `request` - Contains account ID, PRF output, and encrypted private key data with IV
///
/// # Returns
/// * `DecryptPrivateKeyResult` - Contains decrypted private key in NEAR format and account ID
pub async fn handle_decrypt_private_key_with_prf(
    request: DecryptPrivateKeyRequest,
) -> Result<DecryptPrivateKeyResult, String> {
    // Use the core function to decrypt and get SigningKey
    let signing_key = crate::crypto::decrypt_private_key_with_prf(
        &request.near_account_id,
        &request.chacha20_prf_output,
        &request.encrypted_private_key_data,
        &request.encrypted_private_key_iv,
    )
    .map_err(|e| format!("Decryption failed: {}", e))?;

    // Convert SigningKey to NEAR format (64 bytes: 32-byte seed + 32-byte public key)
    let verifying_key = signing_key.verifying_key();
    let public_key_bytes = verifying_key.to_bytes();
    let private_key_seed = signing_key.to_bytes();

    // NEAR Ed25519 format: 32-byte private key seed + 32-byte public key = 64 bytes total
    let mut full_private_key = Vec::with_capacity(64);
    full_private_key.extend_from_slice(&private_key_seed);
    full_private_key.extend_from_slice(&public_key_bytes);

    let private_key_near_format =
        format!("ed25519:{}", bs58::encode(&full_private_key).into_string());

    info!("RUST: Private key decrypted successfully with structured types");

    let result =
        DecryptPrivateKeyResult::new(private_key_near_format, request.near_account_id.clone());

    Ok(result)
}

// ===== Two‑phase export with UI (worker‑driven) =====

#[wasm_bindgen]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportNearKeypairUiRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "nearAccountId")]
    pub near_account_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "publicKey")]
    pub public_key: String,
    #[wasm_bindgen(getter_with_clone, js_name = "encryptedPrivateKeyData")]
    pub encrypted_private_key_data: String,
    #[wasm_bindgen(getter_with_clone, js_name = "encryptedPrivateKeyIv")]
    pub encrypted_private_key_iv: String,
    #[wasm_bindgen(getter_with_clone, js_name = "variant")]
    pub variant: Option<String>,
    #[wasm_bindgen(getter_with_clone, js_name = "theme")]
    pub theme: Option<String>,
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportNearKeypairUiResult {
    #[wasm_bindgen(getter_with_clone, js_name = "nearAccountId")]
    pub near_account_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "publicKey")]
    pub public_key: String,
}

impl ExportNearKeypairUiResult {
    pub fn to_json(&self) -> Result<serde_json::Value, String> {
        serde_json::to_value(self)
            .map_err(|e| format!("Failed to serialize ExportNearKeypairUiResult: {}", e))
    }
}

/// Orchestrates two-phase export:
/// 1) awaitSecureConfirmationV2(decryptPrivateKeyWithPrf) to collect PRF (no UI)
/// 2) Decrypt in-worker using encrypted data provided in the request
/// 3) awaitSecureConfirmationV2(showSecurePrivateKeyUi) to render the viewer with the decrypted key
pub async fn handle_export_near_keypair_ui(
    request: ExportNearKeypairUiRequest,
) -> Result<ExportNearKeypairUiResult, String> {
    let account_id = request.near_account_id.clone();
    let public_key = request.public_key.clone();

    // Phase 1: collect PRF (UI skipped by main thread)
    let req1 = serde_json::json!({
        "schemaVersion": 2,
        "requestId": generate_request_id(),
        "type": "decryptPrivateKeyWithPrf",
        "summary": {
            "operation": "Export Private Key",
            "accountId": account_id,
            "publicKey": public_key,
            "warning": "Revealing your private key grants full control of your account."
        },
        "payload": {
            "nearAccountId": request.near_account_id,
            "publicKey": request.public_key,
        },
        // main thread clamps to uiMode: 'skip' for this type; include explicit hint
        "confirmationConfig": { "uiMode": "skip" }
    });
    let req1_str =
        serde_json::to_string(&req1).map_err(|e| format!("Serialize V2 request failed: {}", e))?;
    let js_req1 = JsValue::from_str(&req1_str);
    let resp1 = await_secure_confirmation_v2(js_req1).await;
    let conf1: ConfirmationResult = serde_wasm_bindgen::from_value(resp1)
        .map_err(|e| format!("Failed to parse V2 decryptPrivateKeyWithPrf result: {}", e))?;
    if !conf1.confirmed {
        return Err(conf1.error.unwrap_or_else(|| "User cancelled".to_string()));
    }
    let prf = conf1
        .prf_output
        .ok_or_else(|| "Missing PRF output from confirmation".to_string())?;

    // Decrypt using PRF output and encrypted material
    let signing_key = crate::crypto::decrypt_private_key_with_prf(
        &request.near_account_id,
        &prf,
        &request.encrypted_private_key_data,
        &request.encrypted_private_key_iv,
    )
    .map_err(|e| format!("Decryption failed: {}", e))?;

    // Convert to NEAR ed25519:<b58(64)>
    let verifying_key = signing_key.verifying_key();
    let public_key_bytes = verifying_key.to_bytes();
    let private_key_seed = signing_key.to_bytes();
    let mut full_private_key = Vec::with_capacity(64);
    full_private_key.extend_from_slice(&private_key_seed);
    full_private_key.extend_from_slice(&public_key_bytes);
    let private_key_near_format =
        format!("ed25519:{}", bs58::encode(&full_private_key).into_string());

    // Phase 2: show secure UI with decrypted key
    let req2 = serde_json::json!({
        "schemaVersion": 2,
        "requestId": generate_request_id(),
        "type": "showSecurePrivateKeyUi",
        "summary": {
            "operation": "Export Private Key",
            "accountId": account_id,
            "publicKey": public_key,
        },
        "payload": {
            "nearAccountId": request.near_account_id,
            "publicKey": request.public_key,
            "privateKey": private_key_near_format,
            "variant": request.variant,
            "theme": request.theme,
        }
    });
    let req2_str = serde_json::to_string(&req2)
        .map_err(|e| format!("Serialize V2 request (show UI) failed: {}", e))?;
    let js_req2 = JsValue::from_str(&req2_str);
    let _ = await_secure_confirmation_v2(js_req2).await; // fire-and-wait; viewer stays open until user closes

    Ok(ExportNearKeypairUiResult {
        near_account_id: account_id,
        public_key,
    })
}
