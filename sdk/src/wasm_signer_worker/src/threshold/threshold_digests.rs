use crate::actions::ActionParams;
use crate::encoders::{base64_standard_decode, hash_delegate_action};
use crate::transaction::{build_actions_from_params, build_transaction_with_actions};
use crate::types::{AccountId, DelegateAction, PublicKey};
use serde::Deserialize;
use wasm_bindgen::prelude::*;

fn parse_near_public_key_to_bytes(public_key: &str) -> Result<[u8; 32], JsValue> {
    let decoded = bs58::decode(public_key.strip_prefix("ed25519:").unwrap_or(public_key))
        .into_vec()
        .map_err(|e| JsValue::from_str(&format!("Invalid public key base58: {e}")))?;
    if decoded.len() != 32 {
        return Err(JsValue::from_str(&format!(
            "Invalid public key length: expected 32 bytes, got {}",
            decoded.len()
        )));
    }
    Ok(decoded.as_slice().try_into().expect("checked length above"))
}

fn parse_near_block_hash_to_bytes(block_hash_b58: &str) -> Result<[u8; 32], JsValue> {
    let decoded = bs58::decode(block_hash_b58.trim())
        .into_vec()
        .map_err(|e| JsValue::from_str(&format!("Invalid block hash base58: {e}")))?;
    if decoded.len() != 32 {
        return Err(JsValue::from_str(&format!(
            "Invalid block hash length: expected 32 bytes, got {}",
            decoded.len()
        )));
    }
    Ok(decoded.as_slice().try_into().expect("checked length above"))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NearTxSigningPayload {
    tx_signing_requests: Vec<NearTxRequest>,
    transaction_context: NearTxContext,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NearTxRequest {
    near_account_id: String,
    receiver_id: String,
    actions: Vec<ActionParams>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NearTxContext {
    near_public_key_str: String,
    next_nonce: String,
    tx_block_hash: String,
}

/// Compute the NEAR transaction signing digests (`sha256(borsh(Transaction))`) for the
/// provided batch signing payload (tx list + transaction context).
///
/// Returns a JS Array of Uint8Array (each 32 bytes), one per tx in order.
#[wasm_bindgen]
pub fn threshold_ed25519_compute_near_tx_signing_digests(
    payload: JsValue,
) -> Result<JsValue, JsValue> {
    let payload: NearTxSigningPayload = serde_wasm_bindgen::from_value(payload)
        .map_err(|e| JsValue::from_str(&format!("Invalid near_tx signingPayload: {e}")))?;
    if payload.tx_signing_requests.is_empty() {
        return Err(JsValue::from_str("txSigningRequests must not be empty"));
    }

    let near_public_key_bytes =
        parse_near_public_key_to_bytes(&payload.transaction_context.near_public_key_str)?;
    let block_hash_bytes =
        parse_near_block_hash_to_bytes(&payload.transaction_context.tx_block_hash)?;

    let base_nonce: u64 = payload
        .transaction_context
        .next_nonce
        .trim()
        .parse()
        .map_err(|e| JsValue::from_str(&format!("Invalid transactionContext.nextNonce: {e}")))?;

    // Ensure all txs share the same signer account id (mirrors worker behavior).
    let signer_account_id = payload.tx_signing_requests[0]
        .near_account_id
        .trim()
        .to_string();
    if signer_account_id.is_empty() {
        return Err(JsValue::from_str(
            "txSigningRequests[0].nearAccountId is required",
        ));
    }
    for tx in &payload.tx_signing_requests {
        if tx.near_account_id.trim() != signer_account_id {
            return Err(JsValue::from_str(
                "All txSigningRequests[].nearAccountId must match",
            ));
        }
    }

    let out = js_sys::Array::new();
    for (i, tx) in payload.tx_signing_requests.iter().enumerate() {
        let nonce = base_nonce.saturating_add(i as u64);
        let actions = build_actions_from_params(tx.actions.clone())
            .map_err(|e| JsValue::from_str(&format!("Failed to build actions: {e}")))?;
        let tx_obj = build_transaction_with_actions(
            &signer_account_id,
            tx.receiver_id.trim(),
            nonce,
            &block_hash_bytes,
            &near_public_key_bytes,
            actions,
        )
        .map_err(|e| JsValue::from_str(&format!("Failed to build transaction: {e}")))?;
        let (hash, _size) = tx_obj.get_hash_and_size();
        out.push(&js_sys::Uint8Array::from(hash.0.as_slice()));
    }

    Ok(out.into())
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DelegateSigningPayload {
    delegate: DelegatePayload,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DelegatePayload {
    sender_id: String,
    receiver_id: String,
    actions: Vec<ActionParams>,
    nonce: String,
    max_block_height: String,
    public_key: String,
}

/// Compute the NEP-461 delegate signing digest (`sha256(encodeDelegateAction(...))`).
/// Returns a 32-byte Uint8Array.
#[wasm_bindgen]
pub fn threshold_ed25519_compute_delegate_signing_digest(
    payload: JsValue,
) -> Result<Vec<u8>, JsValue> {
    let payload: DelegateSigningPayload = serde_wasm_bindgen::from_value(payload)
        .map_err(|e| JsValue::from_str(&format!("Invalid nep461_delegate signingPayload: {e}")))?;

    let sender_id: AccountId = payload
        .delegate
        .sender_id
        .trim()
        .parse()
        .map_err(|e| JsValue::from_str(&format!("Invalid delegate.senderId: {e}")))?;
    let receiver_id: AccountId = payload
        .delegate
        .receiver_id
        .trim()
        .parse()
        .map_err(|e| JsValue::from_str(&format!("Invalid delegate.receiverId: {e}")))?;

    let actions = build_actions_from_params(payload.delegate.actions.clone())
        .map_err(|e| JsValue::from_str(&format!("Failed to build delegate actions: {e}")))?;

    let nonce: u64 = payload
        .delegate
        .nonce
        .trim()
        .parse()
        .map_err(|e| JsValue::from_str(&format!("Invalid delegate.nonce: {e}")))?;
    let max_block_height: u64 = payload
        .delegate
        .max_block_height
        .trim()
        .parse()
        .map_err(|e| JsValue::from_str(&format!("Invalid delegate.maxBlockHeight: {e}")))?;

    let pk_bytes = parse_near_public_key_to_bytes(payload.delegate.public_key.trim())?;
    let public_key = PublicKey::from_ed25519_bytes(&pk_bytes);

    let delegate_action = DelegateAction {
        sender_id,
        receiver_id,
        actions,
        nonce,
        max_block_height,
        public_key,
    };

    let hash = hash_delegate_action(&delegate_action)
        .map_err(|e| JsValue::from_str(&format!("Failed to hash delegate action: {e}")))?;
    Ok(hash.to_vec())
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Nep413SigningPayload {
    message: String,
    recipient: String,
    nonce: String,
    #[serde(default)]
    state: Option<String>,
}

/// Compute the NEP-413 signing digest (sha256(prefix || borsh(payload))).
/// Returns a 32-byte Uint8Array.
#[wasm_bindgen]
pub fn threshold_ed25519_compute_nep413_signing_digest(
    payload: JsValue,
) -> Result<Vec<u8>, JsValue> {
    let payload: Nep413SigningPayload = serde_wasm_bindgen::from_value(payload)
        .map_err(|e| JsValue::from_str(&format!("Invalid nep413 signingPayload: {e}")))?;

    let nonce_bytes = base64_standard_decode(payload.nonce.trim())
        .map_err(|e| JsValue::from_str(&format!("Invalid nonce (base64): {e}")))?;
    if nonce_bytes.len() != 32 {
        return Err(JsValue::from_str(&format!(
            "Invalid nonce length: expected 32 bytes, got {}",
            nonce_bytes.len()
        )));
    }
    let nonce_array: [u8; 32] = nonce_bytes
        .as_slice()
        .try_into()
        .expect("checked length above");

    #[derive(borsh::BorshSerialize)]
    struct Nep413PayloadBorsh {
        message: String,
        recipient: String,
        nonce: [u8; 32],
        state: Option<String>,
    }

    let payload_borsh = Nep413PayloadBorsh {
        message: payload.message,
        recipient: payload.recipient,
        nonce: nonce_array,
        state: payload.state,
    };

    let serialized = borsh::to_vec(&payload_borsh)
        .map_err(|e| JsValue::from_str(&format!("Borsh serialization failed: {e}")))?;
    let prefix: u32 = 2147484061;
    let mut prefixed = prefix.to_le_bytes().to_vec();
    prefixed.extend_from_slice(&serialized);

    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(&prefixed);
    let digest = hasher.finalize();
    Ok(digest.to_vec())
}
