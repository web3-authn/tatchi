use borsh;
use sha2::{Digest, Sha256};

use crate::actions::ActionParams;
use crate::types::*;

/// Build a transaction with multiple actions
pub fn build_transaction_with_actions(
    signer_account_id: &str,
    receiver_account_id: &str,
    nonce: u64,
    block_hash_bytes: &[u8],
    public_key_bytes: &[u8; 32],
    actions: Vec<NearAction>,
) -> Result<Transaction, String> {
    // Parse account IDs
    let signer_id: AccountId = signer_account_id
        .parse()
        .map_err(|e| format!("Invalid signer account: {}", e))?;
    let receiver_id: AccountId = receiver_account_id
        .parse()
        .map_err(|e| format!("Invalid receiver account: {}", e))?;

    // Parse block hash
    if block_hash_bytes.len() != 32 {
        return Err("Block hash must be 32 bytes".to_string());
    }
    let mut block_hash_array = [0u8; 32];
    block_hash_array.copy_from_slice(block_hash_bytes);
    let block_hash = CryptoHash::from_bytes(block_hash_array);

    // Create PublicKey from ed25519 verifying key bytes
    let public_key = PublicKey::from_ed25519_bytes(public_key_bytes);

    // Build transaction
    Ok(Transaction {
        signer_id,
        public_key,
        nonce,
        receiver_id,
        block_hash,
        actions,
    })
}

/// Build actions from action parameters
pub fn build_actions_from_params(
    action_params: Vec<ActionParams>,
) -> Result<Vec<NearAction>, String> {
    let mut actions = Vec::new();
    for (i, params) in action_params.into_iter().enumerate() {
        let action = params
            .to_action()
            .map_err(|e| format!("Action {} build failed: {}", i, e))?;
        actions.push(action);
    }
    Ok(actions)
}

/// Low-level transaction signing function
/// Takes an already-built Transaction and SigningKey, signs it, and returns serialized bytes
pub fn sign_transaction(
    transaction: Transaction,
    signature_bytes: &[u8; 64],
) -> Result<Vec<u8>, String> {
    let signature = Signature::from_ed25519_bytes(signature_bytes);

    // Create SignedTransaction
    let signed_transaction = SignedTransaction::new(signature, transaction);

    // Serialize to Borsh
    borsh::to_vec(&signed_transaction)
        .map_err(|e| format!("Signed transaction serialization failed: {}", e))
}

/// Calculate a proper transaction hash from signed transaction bytes using SHA256
pub fn calculate_transaction_hash(signed_tx_bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(signed_tx_bytes);
    let result = hasher.finalize();

    // Convert to hex string for readability and consistency
    format!("{:x}", result)
}
