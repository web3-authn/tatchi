use crate::threshold::signer_backend::Ed25519SignerBackend;
use crate::threshold::threshold_client_share::derive_threshold_client_verifying_share_bytes_v1;
use crate::threshold::threshold_frost::compute_threshold_ed25519_group_public_key_2p_from_verifying_shares;
use crate::transaction::{
    build_transaction_with_actions, calculate_transaction_hash, sign_transaction,
};
use crate::types::{
    AccessKey, AccessKeyPermission, DecryptionPayload, NearAction, PublicKey, SignedTransaction,
    SignerMode,
};
use crate::WrapKey;
use bs58;
use curve25519_dalek::edwards::CompressedEdwardsY;
use serde::Deserialize;

use super::handle_sign_transactions_with_actions::TransactionSignResult;
use crate::encoders::base64_url_decode;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignAddKeyThresholdPublicKeyNoPromptRequest {
    pub session_id: String,
    pub created_at: Option<f64>,
    pub decryption: DecryptionPayload,
    pub near_account_id: String,
    pub threshold_public_key: String,
    pub relayer_verifying_share_b64u: String,
    pub client_participant_id: Option<u16>,
    pub relayer_participant_id: Option<u16>,
    pub transaction_context: crate::types::handlers::TransactionContext,
}

pub async fn handle_sign_add_key_threshold_public_key_no_prompt(
    request: SignAddKeyThresholdPublicKeyNoPromptRequest,
    wrap_key: WrapKey,
) -> Result<TransactionSignResult, String> {
    let mut logs: Vec<String> = Vec::new();

    // Validate session expiry if created_at is present
    if let Some(created_at) = request.created_at {
        let now = js_sys::Date::now();
        if now - created_at > crate::config::SESSION_MAX_DURATION_MS {
            return Err("Session expired".to_string());
        }
    }

    let near_account_id = request.near_account_id.trim();
    if near_account_id.is_empty() {
        return Err("Missing nearAccountId".to_string());
    }

    let threshold_public_key_str = request.threshold_public_key.trim();
    if threshold_public_key_str.is_empty() {
        return Err("Missing thresholdPublicKey".to_string());
    }

    let relayer_verifying_share_b64u = request.relayer_verifying_share_b64u.trim();
    if relayer_verifying_share_b64u.is_empty() {
        return Err("Missing relayerVerifyingShareB64u".to_string());
    }

    let tx_context = request.transaction_context;

    let nonce: u64 = tx_context
        .next_nonce
        .trim()
        .parse()
        .map_err(|e| format!("Invalid transactionContext.nextNonce: {e}"))?;

    let block_hash_bytes = bs58::decode(tx_context.tx_block_hash.trim())
        .into_vec()
        .map_err(|e| format!("Invalid block hash base58: {e}"))?;

    // Local signer: decrypt and sign using the locally stored encrypted key material.
    let signer = Ed25519SignerBackend::from_encrypted_near_private_key(
        SignerMode::LocalSigner,
        &wrap_key,
        &request.decryption.encrypted_private_key_data,
        &request.decryption.encrypted_private_key_chacha20_nonce_b64u,
    )?;
    let signer_public_key_bytes = signer.public_key_bytes()?;

    let decoded_threshold_pk = bs58::decode(
        threshold_public_key_str
            .strip_prefix("ed25519:")
            .unwrap_or(threshold_public_key_str),
    )
    .into_vec()
    .map_err(|e| format!("Invalid threshold public key base58: {e}"))?;
    if decoded_threshold_pk.len() != 32 {
        return Err(format!(
            "Invalid threshold public key length: expected 32 bytes, got {}",
            decoded_threshold_pk.len()
        ));
    }
    let threshold_pk_bytes: [u8; 32] = decoded_threshold_pk
        .as_slice()
        .try_into()
        .expect("checked length above");

    let client_verifying_share_bytes =
        derive_threshold_client_verifying_share_bytes_v1(&wrap_key, near_account_id)?;
    let decoded_relayer_verifying_share = base64_url_decode(relayer_verifying_share_b64u)?;
    if decoded_relayer_verifying_share.len() != 32 {
        return Err(format!(
            "Invalid relayer verifying share length: expected 32 bytes, got {}",
            decoded_relayer_verifying_share.len()
        ));
    }
    let relayer_verifying_share_bytes: [u8; 32] = decoded_relayer_verifying_share
        .as_slice()
        .try_into()
        .expect("checked length above");

    let client_point = CompressedEdwardsY(client_verifying_share_bytes)
        .decompress()
        .ok_or_else(|| "Invalid client verifying share point".to_string())?;
    let relayer_point = CompressedEdwardsY(relayer_verifying_share_bytes)
        .decompress()
        .ok_or_else(|| "Invalid relayer verifying share point".to_string())?;

    // Deterministic 2-of-2 group PK from verifying shares (participant-id aware).
    let client_participant_id = request.client_participant_id.unwrap_or(1);
    let relayer_participant_id = request.relayer_participant_id.unwrap_or(2);
    let expected_group_pk_bytes =
        compute_threshold_ed25519_group_public_key_2p_from_verifying_shares(
            client_point,
            relayer_point,
            client_participant_id,
            relayer_participant_id,
        )?;
    if expected_group_pk_bytes != threshold_pk_bytes {
        return Err("Relay returned thresholdPublicKey that does not match the client+relayer verifying shares".to_string());
    }

    let threshold_public_key = PublicKey::from_ed25519_bytes(&threshold_pk_bytes);

    // Always add as FullAccess access key with nonce=0.
    let access_key = AccessKey {
        nonce: 0,
        permission: AccessKeyPermission::FullAccess,
    };

    let actions = vec![NearAction::AddKey {
        public_key: threshold_public_key,
        access_key,
    }];

    // Hard bind receiverId to signer/nearAccountId so this request cannot be abused
    // for arbitrary receiver/actions.
    let transaction = build_transaction_with_actions(
        near_account_id,
        near_account_id,
        nonce,
        &block_hash_bytes,
        &signer_public_key_bytes,
        actions,
    )?;

    let (transaction_hash_to_sign, _size) = transaction.get_hash_and_size();
    let signature_bytes = signer.sign(&transaction_hash_to_sign.0).await?;

    let signed_tx_bytes = sign_transaction(transaction, &signature_bytes)?;
    let tx_hash = calculate_transaction_hash(&signed_tx_bytes);

    let signed_tx: SignedTransaction = borsh::from_slice(&signed_tx_bytes)
        .map_err(|e| format!("Failed to deserialize SignedTransaction: {e}"))?;
    let signed_tx_wasm = crate::types::wasm_to_json::WasmSignedTransaction::from(&signed_tx);

    logs.push(format!(
        "Signed AddKey(thresholdPublicKey) for account {} (txHash {})",
        near_account_id, tx_hash
    ));

    Ok(TransactionSignResult::new(
        true,
        Some(vec![tx_hash]),
        Some(vec![signed_tx_wasm]),
        logs,
        None,
    ))
}
