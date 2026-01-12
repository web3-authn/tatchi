// ******************************************************************************
// *                                                                            *
// *          HANDLER: COMBINED DEVICE2 REGISTRATION (DERIVE + SIGN)           *
// *                                                                            *
// ******************************************************************************

use log::debug;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::types::wasm_to_json::WasmSignedTransaction;
use crate::types::SerializedRegistrationCredential;
use crate::WrapKey;
use bs58;

/// Request for combined Device2 registration flow.
/// Assumes WrapKeySeed and PRF.second have already been delivered to the signer worker via MessagePort.
#[wasm_bindgen]
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RegisterDevice2WithDerivedKeyRequest {
    /// Session ID (identifies the MessagePort session where WrapKeySeed and PRF.second were delivered)
    #[wasm_bindgen(getter_with_clone, js_name = "sessionId")]
    pub session_id: String,

    /// Serialized registration credential (contains PRF.second in client extension results)
    #[wasm_bindgen(getter_with_clone)]
    pub credential: SerializedRegistrationCredential,

    /// NEAR account ID for Device2
    #[wasm_bindgen(getter_with_clone, js_name = "nearAccountId")]
    pub near_account_id: String,

    /// Transaction context from VRF worker
    #[wasm_bindgen(skip)]
    #[serde(rename = "transactionContext")]
    pub transaction_context: Device2TransactionContext,

    /// Contract ID (Receiver ID for the transaction)
    #[wasm_bindgen(getter_with_clone, js_name = "contractId")]
    pub contract_id: String,

    /// Contract arguments for Device2 registration (JSON string already serialized in JS)
    #[wasm_bindgen(skip)]
    #[serde(rename = "contractArgsJson")]
    pub contract_args_json: String,
}

/// Transaction context from NEAR RPC
#[wasm_bindgen]
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Device2TransactionContext {
    #[wasm_bindgen(getter_with_clone, js_name = "txBlockHash")]
    pub tx_block_hash: String,
    #[wasm_bindgen(getter_with_clone, js_name = "txBlockHeight")]
    pub tx_block_height: String,
    #[wasm_bindgen(getter_with_clone, js_name = "baseNonce")]
    pub base_nonce: String,
}

/// Result of combined Device2 registration
#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterDevice2WithDerivedKeyResult {
    /// Derived NEAR public key (ed25519, base58-encoded)
    #[wasm_bindgen(getter_with_clone, js_name = "publicKey")]
    pub public_key: String,

    /// Encrypted NEAR private key (base64url-encoded)
    #[wasm_bindgen(getter_with_clone, js_name = "encryptedData")]
    pub encrypted_data: String,

    /// ChaCha20-Poly1305 nonce used for encryption (base64url-encoded)
    #[wasm_bindgen(getter_with_clone, js_name = "chacha20NonceB64u")]
    pub chacha20_nonce_b64u: String,

    /// WrapKeySalt used for KEK derivation (base64url-encoded)
    #[wasm_bindgen(getter_with_clone, js_name = "wrapKeySalt")]
    pub wrap_key_salt: String,

    /// Signed registration transaction (borsh-serialized, base64url-encoded)
    #[wasm_bindgen(getter_with_clone, js_name = "signedTransaction")]
    pub signed_transaction: WasmSignedTransaction,
}

#[wasm_bindgen]
impl RegisterDevice2WithDerivedKeyResult {
    #[wasm_bindgen(constructor)]
    pub fn new(
        public_key: String,
        encrypted_data: String,
        chacha20_nonce_b64u: String,
        wrap_key_salt: String,
        signed_transaction: WasmSignedTransaction,
    ) -> RegisterDevice2WithDerivedKeyResult {
        RegisterDevice2WithDerivedKeyResult {
            public_key,
            encrypted_data,
            chacha20_nonce_b64u,
            wrap_key_salt,
            signed_transaction,
        }
    }
}

/// Handler for combined Device2 registration.
///
/// This handler performs:
/// 1. Retrieve PRF.second from session storage (delivered via MessagePort)
/// 2. Derive NEAR ed25519 keypair from PRF.second using HKDF
/// 3. Encrypt NEAR private key with KEK (derived from WrapKeySeed + wrapKeySalt)
/// 4. Build Device2 registration transaction (`link_device_register_user`)
/// 5. Sign transaction with the derived NEAR keypair
/// 6. Return public key, encrypted key data, and signed transaction
///
/// # Arguments
/// * `request` - Contains sessionId, account ID, transaction context, contract args JSON
/// * `wrap_key` - Contains WrapKeySeed (delivered from VRF via MessagePort) and wrapKeySalt
/// * `prf_second_b64u` - PRF.second output retrieved from session storage
///
/// # Returns
/// * `RegisterDevice2WithDerivedKeyResult` - Public key, encrypted key data, signed tx
pub async fn handle_register_device2_with_derived_key(
    request: RegisterDevice2WithDerivedKeyRequest,
    wrap_key: WrapKey,
    prf_second_b64u: String,
) -> Result<RegisterDevice2WithDerivedKeyResult, String> {
    // === STEP 1: Derive NEAR keypair from PRF.second ===
    let (near_private_key, near_public_key) = crate::crypto::derive_ed25519_key_from_prf_output(
        &prf_second_b64u,
        &request.near_account_id,
    )
    .map_err(|e| format!("Failed to derive ed25519 key from PRF.second: {}", e))?;

    // === STEP 2: Encrypt NEAR private key with KEK ===
    let kek = wrap_key
        .derive_kek()
        .map_err(|e| format!("Failed to derive KEK for Device2 key encryption: {}", e))?;

    let wrap_key_salt_bytes = crate::encoders::base64_url_decode(wrap_key.salt_b64u())
        .map_err(|e| format!("Failed to decode wrapKeySalt: {}", e))?;

    let encryption_result = crate::crypto::encrypt_data_chacha20(&near_private_key, &kek)
        .map_err(|_| "Failed to encrypt Device2 private key".to_string())?
        .with_wrap_key_salt(&wrap_key_salt_bytes);

    // === STEP 3: Parse private key to extract signing key ===
    // near_private_key is in format "ed25519:base58_encoded_64_bytes"
    let private_key_str = if near_private_key.starts_with("ed25519:") {
        &near_private_key[8..] // Remove "ed25519:" prefix
    } else {
        return Err("Private key must be in ed25519: format".to_string());
    };

    // Decode the base58-encoded private key
    let private_key_bytes = bs58::decode(private_key_str)
        .into_vec()
        .map_err(|_| "Failed to decode private key".to_string())?;

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

    // Get the public key bytes for transaction building
    let public_key_bytes: [u8; 32] = private_key_bytes[32..64]
        .try_into()
        .map_err(|_| "Failed to extract public key from private key".to_string())?;

    // === STEP 4: Build Device2 registration transaction ===
    // Use the JSON args provided by TS directly
    let function_call_args = request.contract_args_json.clone().into_bytes();

    let registration_tx =
        build_device2_registration_transaction(&request, &public_key_bytes, function_call_args)?;

    // === STEP 5: Sign transaction with derived NEAR keypair ===
    use ed25519_dalek::Signer;
    let (tx_hash_to_sign, _size) = registration_tx.get_hash_and_size();
    let signature_bytes = signing_key.sign(&tx_hash_to_sign.0).to_bytes();
    let signed_tx_bytes = crate::transaction::sign_transaction(registration_tx, &signature_bytes)
        .map_err(|e| {
        format!(
            "Failed to serialize signed Device2 registration transaction: {}",
            e
        )
    })?;

    // === STEP 6: Convert to WasmSignedTransaction ===
    let signed_tx = crate::types::SignedTransaction::from_borsh_bytes(&signed_tx_bytes)
        .map_err(|e| format!("Failed to deserialize SignedTransaction: {}", e))?;

    let signed_transaction_wasm = WasmSignedTransaction::from(&signed_tx);

    // === STEP 7: Return result ===
    Ok(RegisterDevice2WithDerivedKeyResult::new(
        near_public_key,
        encryption_result.encrypted_near_key_data_b64u,
        encryption_result.chacha20_nonce_b64u,
        encryption_result
            .wrap_key_salt_b64u
            .unwrap_or_else(|| String::new()),
        signed_transaction_wasm,
    ))
}

/// Build Device2 registration transaction for `link_device_register_user` contract call.
fn build_device2_registration_transaction(
    request: &RegisterDevice2WithDerivedKeyRequest,
    public_key_bytes: &[u8; 32],
    function_call_args: Vec<u8>,
) -> Result<crate::types::near::Transaction, String> {
    use crate::types::near::{FunctionCallAction, NearAction};

    // Parse nonce
    let parsed_nonce = request
        .transaction_context
        .base_nonce
        .parse::<u64>()
        .map_err(|e| format!("Invalid nonce format: {}", e))?;

    // Decode block hash (base58-encoded)
    let block_hash_bytes = bs58::decode(&request.transaction_context.tx_block_hash)
        .into_vec()
        .map_err(|e| format!("Failed to decode block hash: {}", e))?;
    let block_hash: [u8; 32] = block_hash_bytes
        .try_into()
        .map_err(|_| "Block hash must be 32 bytes".to_string())?;

    let actions = vec![NearAction::FunctionCall(Box::new(FunctionCallAction {
        method_name: "link_device_register_user".to_string(),
        args: function_call_args,
        gas: 50_000_000_000_000, // 50 TGas
        deposit: 0,              // No deposit required
    }))];

    // Build NEAR transaction
    let tx = crate::types::near::Transaction {
        signer_id: request
            .near_account_id
            .parse()
            .map_err(|e| format!("Invalid signer_id (NEAR account ID): {}", e))?,
        public_key: crate::types::near::PublicKey::from_ed25519_bytes(public_key_bytes),
        nonce: parsed_nonce,
        receiver_id: request
            .contract_id
            .parse()
            .map_err(|e| format!("Invalid receiver_id (contract ID): {}", e))?,
        block_hash: crate::types::near::CryptoHash(block_hash),
        actions,
    };

    Ok(tx)
}
