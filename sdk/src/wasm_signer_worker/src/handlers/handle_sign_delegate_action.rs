use crate::actions::ActionParams;
use crate::encoders::hash_delegate_action;
use crate::threshold::signer_backend::Ed25519SignerBackend;
use crate::transaction::build_actions_from_params;
use crate::types::progress::{
    send_completion_message, send_progress_message, ProgressData, ProgressMessageType, ProgressStep,
};
use crate::types::{
    handlers::{ConfirmationConfig, RpcCallPayload},
    wasm_to_json::WasmSignedDelegate,
    AccountId, DecryptionPayload, DelegateAction, PublicKey, Signature, SignedDelegate, SignerMode,
    ThresholdSignerConfig,
};
use crate::WrapKey;
use bs58;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DelegatePayload {
    pub sender_id: String,
    pub receiver_id: String,
    pub actions: Vec<ActionParams>,
    pub nonce: String,
    pub max_block_height: String,
    /// Expected ed25519 public key for the device (string, with or without ed25519: prefix)
    pub public_key: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignDelegateActionRequest {
    pub signer_mode: SignerMode,
    pub rpc_call: RpcCallPayload,
    pub session_id: String,
    pub created_at: Option<f64>,
    pub decryption: DecryptionPayload,
    /// Threshold signer config (required when `signer_mode == threshold-signer`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub threshold: Option<ThresholdSignerConfig>,
    pub delegate: DelegatePayload,
    pub confirmation_config: Option<ConfirmationConfig>,
    pub intent_digest: Option<String>,
    pub transaction_context: Option<crate::types::handlers::TransactionContext>,
    /// VRF challenge data required for relayer authorization in threshold mode.
    pub vrf_challenge: Option<crate::types::VrfChallenge>,
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
        Some(&ProgressData::new(1, 4).with_context("delegate")),
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
        Some(&ProgressData::new(2, 4).with_context("delegate")),
    );

    let action_params = request.delegate.actions.clone();
    logs.push(format!("Using {} delegate actions", action_params.len()));

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
            let base: u64 = ctx.tx_block_height.parse().unwrap_or(0);
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
            logs.push(
                "Normalized delegate maxBlockHeight from 0 to fallback 10000 (no tx context)"
                    .to_string(),
            );
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
        Some(&ProgressData::new(3, 4).with_context("delegate")),
    );

    let signer = match request.signer_mode {
        SignerMode::LocalSigner => Ed25519SignerBackend::from_encrypted_near_private_key(
            SignerMode::LocalSigner,
            &wrap_key,
            &request.decryption.encrypted_private_key_data,
            &request.decryption.encrypted_private_key_chacha20_nonce_b64u,
        )?,
        SignerMode::ThresholdSigner => {
            let cfg = request
                .threshold
                .as_ref()
                .ok_or_else(|| "Missing threshold signer config".to_string())?;

            #[derive(Debug, Clone, Serialize)]
            #[serde(rename_all = "camelCase")]
            struct DelegateAuthorizeSigningPayload<'a> {
                kind: &'a str,
                delegate: DelegateAuthorizeDelegate<'a>,
            }

            #[derive(Debug, Clone, Serialize)]
            #[serde(rename_all = "camelCase")]
            struct DelegateAuthorizeDelegate<'a> {
                sender_id: &'a str,
                receiver_id: &'a str,
                actions: &'a Vec<ActionParams>,
                nonce: String,
                max_block_height: String,
                public_key: &'a str,
            }

            let signing_payload_json = {
                let js_val = serde_wasm_bindgen::to_value(&DelegateAuthorizeSigningPayload {
                    kind: "nep461_delegate",
                    delegate: DelegateAuthorizeDelegate {
                        sender_id: sender_id.0.as_str(),
                        receiver_id: receiver_id.0.as_str(),
                        actions: &request.delegate.actions,
                        nonce: nonce.to_string(),
                        max_block_height: max_block_height.to_string(),
                        public_key: transaction_context.near_public_key_str.as_str(),
                    },
                })
                .map_err(|e| format!("Failed to serialize signingPayload: {e}"))?;
                js_sys::JSON::stringify(&js_val)
                    .map_err(|e| format!("JSON.stringify signingPayload failed: {:?}", e))?
                    .as_string()
                    .ok_or_else(|| {
                        "JSON.stringify signingPayload did not return a string".to_string()
                    })?
            };

            Ed25519SignerBackend::from_threshold_signer_config(
                &wrap_key,
                &request.rpc_call.near_account_id,
                &transaction_context.near_public_key_str,
                "nep461_delegate",
                request.vrf_challenge.clone(),
                request.credential.clone(),
                Some(signing_payload_json),
                cfg,
            )?
        }
    };

    let verifying_key_bytes = signer.public_key_bytes()?;
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
        let error_msg = "Delegate public key does not match signing key".to_string();
        logs.push(error_msg.clone());
        return Ok(DelegateSignResult::failed(logs, error_msg));
    }

    let public_key = PublicKey::from_ed25519_bytes(&verifying_key_bytes);

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

    let signature_bytes = signer.sign(&delegate_hash_bytes).await?;
    let signature = Signature::from_ed25519_bytes(&signature_bytes);

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
            &ProgressData::new(4, 4)
                .with_context("delegate")
                .with_success(true)
                .with_hash(delegate_hash_hex.clone()),
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
