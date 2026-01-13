// ******************************************************************************
// *                                                                            *
// *                 HANDLER: SIGN TRANSACTION WITH KEYPAIR                   *
// *                                                                            *
// ******************************************************************************
use std::fmt;

use crate::actions::ActionParams;
use crate::handlers::handle_sign_transactions_with_actions::TransactionSignResult;
use crate::transaction::{
    build_actions_from_params, build_transaction_with_actions, calculate_transaction_hash,
    sign_transaction,
};
use crate::types::wasm_to_json::WasmSignedTransaction;
use bs58;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SignTransactionWithKeyPairRequest {
    pub near_private_key: String, // ed25519:... format
    pub signer_account_id: String,
    pub receiver_id: String,
    pub nonce: String,
    pub block_hash: String,
    #[serde(deserialize_with = "deserialize_actions_flexible")]
    pub actions: Vec<ActionParams>,
}

impl fmt::Debug for SignTransactionWithKeyPairRequest {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SignTransactionWithKeyPairRequest")
            .field("near_private_key", &"[REDACTED]")
            .field("signer_account_id", &self.signer_account_id)
            .field("receiver_id", &self.receiver_id)
            .field("nonce", &self.nonce)
            .field("block_hash", &self.block_hash)
            .field("actions", &self.actions)
            .finish()
    }
}

fn deserialize_actions_flexible<'de, D>(deserializer: D) -> Result<Vec<ActionParams>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    struct ActionsVisitor;

    impl<'de> serde::de::Visitor<'de> for ActionsVisitor {
        type Value = Vec<ActionParams>;

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("a list of actions or a JSON string containing them")
        }

        fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
        where
            A: serde::de::SeqAccess<'de>,
        {
            let mut vec = Vec::new();
            while let Some(elem) = seq.next_element()? {
                vec.push(elem);
            }
            Ok(vec)
        }

        fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
        where
            E: serde::de::Error,
        {
            #[cfg(target_arch = "wasm32")]
            {
                let js_val = js_sys::JSON::parse(v)
                    .map_err(|_| E::custom("Failed to parse actions JSON string"))?;
                serde_wasm_bindgen::from_value(js_val).map_err(E::custom)
            }
            #[cfg(not(target_arch = "wasm32"))]
            {
                let _ = v;
                Err(E::custom(
                    "Parsing actions from JSON string is not supported on native targets",
                ))
            }
        }
    }

    deserializer.deserialize_any(ActionsVisitor)
}

/// Signs a transaction using a provided private key without requiring WebAuthn authentication.
///
/// **Handles:** `WorkerRequestType::SignTransactionWithKeyPair`
///
/// This handler is used for key replacement operations where the application already has access
/// to a private key and needs to sign transactions directly. It bypasses the normal WebAuthn
/// authentication flow and signs transactions immediately.
///
/// # Arguments
/// * `request` - Contains NEAR private key, transaction details, and action parameters
///
/// # Returns
/// * `TransactionSignResult` - Contains signed transaction, transaction hash, and operation logs
pub async fn handle_sign_transaction_with_keypair(
    request: SignTransactionWithKeyPairRequest,
) -> Result<TransactionSignResult, String> {
    let mut logs: Vec<String> = Vec::new();
    use ed25519_dalek::Signer;
    // Parse the private key from NEAR format (ed25519:base58_encoded_64_bytes)
    let private_key_str = if request.near_private_key.starts_with("ed25519:") {
        &request.near_private_key[8..] // Remove "ed25519:" prefix
    } else {
        return Err("Private key must be in ed25519: format".to_string());
    };

    // Decode the base58-encoded private key
    let private_key_bytes = bs58::decode(private_key_str)
        .into_vec()
        .map_err(|e| format!("Failed to decode private key: {}", e))?;

    if private_key_bytes.len() != 64 {
        return Err(format!(
            "Invalid private key length: expected 64 bytes, got {}",
            private_key_bytes.len()
        ));
    }

    // Extract the 32-byte seed (first 32 bytes)
    let seed_bytes: [u8; 32] = private_key_bytes[0..32]
        .try_into()
        .map_err(|_| "Failed to extract seed from private key".to_string())?;

    // Create SigningKey from seed
    let signing_key = ed25519_dalek::SigningKey::from_bytes(&seed_bytes);
    let public_key_bytes = signing_key.verifying_key().to_bytes();

    logs.push("Private key parsed and signing key created".to_string());

    // Use structured actions directly
    let action_params = request.actions.clone();

    logs.push(format!("Using {} actions", action_params.len()));

    let actions = build_actions_from_params(action_params)
        .map_err(|e| format!("Failed to build actions: {}", e))?;

    // Build and sign transaction
    let transaction = build_transaction_with_actions(
        &request.signer_account_id,
        &request.receiver_id,
        request
            .nonce
            .parse()
            .map_err(|e| format!("Invalid nonce: {}", e))?,
        &bs58::decode(&request.block_hash)
            .into_vec()
            .map_err(|e| format!("Invalid block hash: {}", e))?,
        &public_key_bytes,
        actions,
    )
    .map_err(|e| format!("Failed to build transaction: {}", e))?;

    logs.push("Transaction built successfully".to_string());

    let (transaction_hash_to_sign, _size) = transaction.get_hash_and_size();
    let signature_bytes = signing_key.sign(&transaction_hash_to_sign.0).to_bytes();
    let signed_tx_bytes = sign_transaction(transaction, &signature_bytes)
        .map_err(|e| format!("Failed to serialize signed transaction: {}", e))?;

    // Calculate transaction hash from signed transaction bytes (before moving the bytes)
    let transaction_hash = calculate_transaction_hash(&signed_tx_bytes);

    // Create SignedTransaction from signed bytes
    let signed_tx = crate::types::SignedTransaction::from_borsh_bytes(&signed_tx_bytes)
        .map_err(|e| format!("Failed to deserialize SignedTransaction: {}", e))?;

    let signed_tx_wasm = WasmSignedTransaction::from(&signed_tx);

    logs.push("Transaction signing completed successfully".to_string());

    Ok(TransactionSignResult::new(
        true,
        Some(vec![transaction_hash]),
        Some(vec![signed_tx_wasm]),
        logs,
        None,
    ))
}

#[cfg(test)]
mod tests {
    use super::SignTransactionWithKeyPairRequest;

    #[test]
    fn debug_redacts_near_private_key() {
        let req = SignTransactionWithKeyPairRequest {
            near_private_key: "ed25519:SECRET_PRIVATE_KEY".to_string(),
            signer_account_id: "signer.near".to_string(),
            receiver_id: "receiver.near".to_string(),
            nonce: "1".to_string(),
            block_hash: "11111111111111111111111111111111".to_string(),
            actions: Vec::new(),
        };

        let dbg_str = format!("{req:?}");
        assert!(!dbg_str.contains("SECRET_PRIVATE_KEY"));
        assert!(dbg_str.contains("[REDACTED]"));
    }
}
