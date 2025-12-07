use crate::actions::ActionParams;
use crate::encoders::hash_delegate_action;
use crate::transaction::build_actions_from_params;
use crate::types::progress::{
    send_completion_message,
    send_progress_message,
    ProgressMessageType,
    ProgressStep,
};
use crate::types::{
    handlers::{ConfirmationConfig, RpcCallPayload},
    wasm_to_json::WasmSignedDelegate,
    AccountId,
    DecryptionPayload,
    DelegateAction,
    PublicKey,
    Signature,
    SignedDelegate,
};
use crate::WrapKey;
use bs58;
use ed25519_dalek::Signer;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DelegatePayload {
    #[wasm_bindgen(getter_with_clone, js_name = "senderId")]
    pub sender_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "receiverId")]
    pub receiver_id: String,
    /// JSON string of ActionParams[]
    #[wasm_bindgen(getter_with_clone)]
    pub actions: String,
    #[wasm_bindgen(getter_with_clone)]
    pub nonce: String,
    #[wasm_bindgen(getter_with_clone, js_name = "maxBlockHeight")]
    pub max_block_height: String,
    /// Expected ed25519 public key for the device (string, with or without ed25519: prefix)
    #[wasm_bindgen(getter_with_clone, js_name = "publicKey")]
    pub public_key: String,
}

impl DelegatePayload {
    pub fn parsed_actions(&self) -> Result<Vec<ActionParams>, serde_json::Error> {
        serde_json::from_str(&self.actions)
    }

    pub fn parsed_actions_value(&self) -> serde_json::Value {
        serde_json::from_str(&self.actions).unwrap_or_else(|_| serde_json::json!([]))
    }
}

#[wasm_bindgen]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignDelegateActionRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "rpcCall")]
    pub rpc_call: RpcCallPayload,
    #[wasm_bindgen(getter_with_clone, js_name = "sessionId")]
    pub session_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "createdAt")]
    pub created_at: Option<f64>,
    #[wasm_bindgen(getter_with_clone)]
    pub decryption: DecryptionPayload,
    #[wasm_bindgen(getter_with_clone)]
    pub delegate: DelegatePayload,
    #[wasm_bindgen(getter_with_clone, js_name = "confirmationConfig")]
    pub confirmation_config: Option<ConfirmationConfig>,
    #[wasm_bindgen(getter_with_clone, js_name = "intentDigest")]
    pub intent_digest: Option<String>,
    #[wasm_bindgen(getter_with_clone, js_name = "transactionContext")]
    pub transaction_context: Option<crate::types::handlers::TransactionContext>,
    #[wasm_bindgen(getter_with_clone)]
    pub credential: Option<String>,
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DelegateSignResult {
    pub success: bool,
    #[wasm_bindgen(getter_with_clone)]
    pub hash: Option<String>,
    #[wasm_bindgen(getter_with_clone, js_name = "signedDelegate")]
    pub signed_delegate: Option<WasmSignedDelegate>,
    #[wasm_bindgen(getter_with_clone)]
    pub logs: Vec<String>,
    #[wasm_bindgen(getter_with_clone)]
    pub error: Option<String>,
}

#[wasm_bindgen]
impl DelegateSignResult {
    #[wasm_bindgen(constructor)]
    pub fn new(
        success: bool,
        hash: Option<String>,
        signed_delegate: Option<WasmSignedDelegate>,
        logs: Vec<String>,
        error: Option<String>,
    ) -> DelegateSignResult {
        DelegateSignResult {
            success,
            hash,
            signed_delegate,
            logs,
            error,
        }
    }

    pub fn failed(logs: Vec<String>, error_msg: String) -> DelegateSignResult {
        DelegateSignResult::new(false, None, None, logs, Some(error_msg))
    }
}

/// Handles session-based delegate action signing (NEP-461).
pub async fn handle_sign_delegate_action(
    request: SignDelegateActionRequest,
    wrap_key: WrapKey,
) -> Result<DelegateSignResult, String> {
    let mut logs: Vec<String> = Vec::new();

    // Validate session expiry if created_at is present
    if let Some(created_at) = request.created_at {
        let now = js_sys::Date::now();
        if now - created_at > crate::config::SESSION_MAX_DURATION_MS {
            return Err("Session expired".to_string());
        }
    }

    // Step 1: Pre-confirmed context
    send_progress_message(
        ProgressMessageType::ExecuteActionsProgress,
        ProgressStep::UserConfirmation,
        "Using pre-confirmed VRF/WebAuthn session for delegate signing...",
        Some(
            &serde_json::json!({"step": 1, "total": 4, "context": "delegate"})
                .to_string(),
        ),
    );

    let intent_digest = request
        .intent_digest
        .clone()
        .ok_or_else(|| "Missing intent digest from pre-confirmed session".to_string())?;

    let transaction_context = request
        .transaction_context
        .clone()
        .ok_or_else(|| "Missing transaction context from confirmation".to_string())?;

    logs.push(format!(
        "Pre-confirmed session ready (intent digest: {})",
        intent_digest
    ));
    logs.push(format!(
        "Transaction context block height: {} (block hash: {})",
        transaction_context.tx_block_height, transaction_context.tx_block_hash
    ));

    // Step 2: Validate and prepare delegate inputs
    send_progress_message(
        ProgressMessageType::ExecuteActionsProgress,
        ProgressStep::Preparation,
        "Preparing delegate inputs...",
        Some(&serde_json::json!({"step": 2, "total": 4, "context": "delegate"}).to_string()),
    );

    let action_params: Vec<ActionParams> = match request.delegate.parsed_actions() {
        Ok(params) => {
            logs.push(format!("Parsed {} delegate actions", params.len()));
            params
        }
        Err(e) => {
            let error_msg = format!("Failed to parse delegate actions: {}", e);
            logs.push(error_msg.clone());
            return Ok(DelegateSignResult::failed(logs, error_msg));
        }
    };

    let actions = match build_actions_from_params(action_params) {
        Ok(actions) => actions,
        Err(e) => {
            let error_msg = format!("Failed to build delegate actions: {}", e);
            logs.push(error_msg.clone());
            return Ok(DelegateSignResult::failed(logs, error_msg));
        }
    };

    // Derive delegate nonce from transaction context whenever possible so it
    // matches the user's on-chain access key nonce expectations. This avoids
    // DelegateActionInvalidNonce when relayers submit the signed delegate.
    let mut nonce: u64 = match request.delegate.nonce.parse() {
        Ok(n) => n,
        Err(_) => 0,
    };

    if let Some(ctx) = &request.transaction_context {
        // Use the NonceManager-provided nextNonce as the canonical delegate nonce.
        match ctx.next_nonce.parse::<u64>() {
            Ok(chain_next) => {
                if nonce == 0 || nonce <= chain_next {
                    let prev = nonce;
                    nonce = chain_next;
                    logs.push(format!(
                        "Normalized delegate nonce from {} to chain nextNonce {}",
                        prev, nonce
                    ));
                }
            }
            Err(e) => {
                let error_msg = format!("Invalid transactionContext.nextNonce: {}", e);
                logs.push(error_msg.clone());
                return Ok(DelegateSignResult::failed(logs, error_msg));
            }
        }
    }

    if nonce == 0 {
        let error_msg = "Delegate nonce must be non-zero".to_string();
        logs.push(error_msg.clone());
        return Ok(DelegateSignResult::failed(logs, error_msg));
    }

    let mut max_block_height: u64 = match request.delegate.max_block_height.parse() {
        Ok(h) => h,
        Err(e) => {
            let error_msg = format!("Invalid maxBlockHeight: {}", e);
            logs.push(error_msg.clone());
            return Ok(DelegateSignResult::failed(logs, error_msg));
        }
    };

    // Treat maxBlockHeight == 0 as “no explicit expiry” from the caller.
    // For NEP-461 this must still be a concrete future block height, so
    // derive one from the transaction context when available.
    if max_block_height == 0 {
        if let Some(ctx) = &request.transaction_context {
            let base: u64 = ctx
                .tx_block_height
                .parse()
                .unwrap_or(0);
            // Give a generous horizon in blocks to avoid accidental expiry
            // while keeping the delegate bounded.
            max_block_height = base.saturating_add(10_000);
            logs.push(format!(
                "Normalized delegate maxBlockHeight from 0 to {} based on tx_block_height {}",
                max_block_height, ctx.tx_block_height
            ));
        } else {
            // Fallback: choose a fixed horizon if no context is present.
            max_block_height = 10_000;
            logs.push("Normalized delegate maxBlockHeight from 0 to fallback 10000 (no tx context)".to_string());
        }
    }

    let sender_id: AccountId = match request.delegate.sender_id.parse() {
        Ok(id) => id,
        Err(e) => {
            let error_msg = format!("Invalid senderId: {}", e);
            logs.push(error_msg.clone());
            return Ok(DelegateSignResult::failed(logs, error_msg));
        }
    };

    let receiver_id: AccountId = match request.delegate.receiver_id.parse() {
        Ok(id) => id,
        Err(e) => {
            let error_msg = format!("Invalid receiverId: {}", e);
            logs.push(error_msg.clone());
            return Ok(DelegateSignResult::failed(logs, error_msg));
        }
    };

    // Step 3: Decrypt and sign
    send_progress_message(
        ProgressMessageType::ExecuteActionsProgress,
        ProgressStep::TransactionSigningProgress,
        "Decrypting private key and signing delegate action...",
        Some(&serde_json::json!({"step": 3, "total": 4, "context": "delegate"}).to_string()),
    );

    let kek = wrap_key.derive_kek()?;
    let decrypted_private_key_str = crate::crypto::decrypt_data_chacha20(
        &request.decryption.encrypted_private_key_data,
        &request.decryption.encrypted_private_key_iv,
        &kek,
    )
    .map_err(|e| format!("Decryption failed: {}", e))?;

    let normalized_private_key = decrypted_private_key_str
        .strip_prefix("ed25519:")
        .unwrap_or(&decrypted_private_key_str)
        .to_string();

    let decoded_pk = bs58::decode(&normalized_private_key)
        .into_vec()
        .map_err(|e| format!("Invalid private key base58: {}", e))?;

    if decoded_pk.len() < 32 {
        return Err("Decoded private key too short".to_string());
    }

    let secret_bytes: [u8; 32] = decoded_pk[0..32]
        .try_into()
        .map_err(|_| "Invalid secret key length".to_string())?;

    let signing_key = ed25519_dalek::SigningKey::from_bytes(&secret_bytes);
    let verifying_key_bytes = signing_key.verifying_key().to_bytes();
    let device_public_key_b58 = bs58::encode(verifying_key_bytes).into_string();

    let normalized_delegate_pk = request
        .delegate
        .public_key
        .strip_prefix("ed25519:")
        .unwrap_or(&request.delegate.public_key)
        .to_string();

    let provided_pk_bytes = match bs58::decode(&normalized_delegate_pk).into_vec() {
        Ok(bytes) => bytes,
        Err(e) => {
            let error_msg = format!("Invalid delegate public key: {}", e);
            logs.push(error_msg.clone());
            return Ok(DelegateSignResult::failed(logs, error_msg));
        }
    };

    if provided_pk_bytes.len() != 32 {
        let error_msg = "Delegate public key must be 32 bytes".to_string();
        logs.push(error_msg.clone());
        return Ok(DelegateSignResult::failed(logs, error_msg));
    }

    if device_public_key_b58 != normalized_delegate_pk {
        let error_msg = "Delegate public key does not match device key".to_string();
        logs.push(error_msg.clone());
        return Ok(DelegateSignResult::failed(logs, error_msg));
    }

    let mut public_key_array = [0u8; 32];
    public_key_array.copy_from_slice(&verifying_key_bytes);
    let public_key = PublicKey::from_ed25519_bytes(&public_key_array);

    let delegate_action = DelegateAction {
        sender_id,
        receiver_id,
        actions,
        nonce,
        max_block_height,
        public_key,
    };

    let delegate_hash_bytes = hash_delegate_action(&delegate_action)?;
    let delegate_hash_hex: String = delegate_hash_bytes
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect();

    let signature_bytes = signing_key.sign(&delegate_hash_bytes);
    let signature = Signature::from_ed25519_bytes(&signature_bytes.to_bytes());

    let signed_delegate = SignedDelegate {
        delegate_action,
        signature,
    };

    let wasm_signed_delegate = WasmSignedDelegate::from(&signed_delegate);

    logs.push(format!(
        "Delegate action signed successfully (hash: {})",
        delegate_hash_hex
    ));

    send_completion_message(
        ProgressMessageType::ExecuteActionsProgress,
        ProgressStep::TransactionSigningComplete,
        "Delegate action signed",
        Some(
            &serde_json::json!({
                "step": 4,
                "total": 4,
                "context": "delegate",
                "success": true,
                "hash": delegate_hash_hex
            })
            .to_string(),
        ),
    );

    Ok(DelegateSignResult::new(
        true,
        Some(delegate_hash_hex),
        Some(wasm_signed_delegate),
        logs,
        None,
    ))
}
