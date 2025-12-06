// ******************************************************************************
// *                                                                            *
// *          HANDLER: COMBINED DEVICE2 REGISTRATION (DERIVE + SIGN)           *
// *                                                                            *
// ******************************************************************************

use log::debug;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::encoders::base64_url_decode;
use crate::types::wasm_to_json::WasmSignedTransaction;
use crate::types::{
    AuthenticatorOptions, SerializedRegistrationCredential,
    WebAuthnRegistrationCredential,
};
use crate::WrapKey;

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

    /// Contract arguments for Device2 registration
    #[wasm_bindgen(skip)]
    #[serde(rename = "contractArgs")]
    pub contract_args: Device2RegistrationArgs,
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

/// Contract arguments for Device2 registration call
#[wasm_bindgen]
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Device2RegistrationArgs {
    #[wasm_bindgen(getter_with_clone, js_name = "contractId")]
    pub contract_id: String,
    #[wasm_bindgen(skip)]
    #[serde(rename = "vrfData")]
    pub vrf_data: Device2VrfData,
    #[wasm_bindgen(skip)]
    #[serde(rename = "webauthnRegistration")]
    pub webauthn_registration: WebAuthnRegistrationCredential,
    #[wasm_bindgen(getter_with_clone, js_name = "deterministicVrfPublicKeyB64")]
    pub deterministic_vrf_public_key_b64: String,
    #[wasm_bindgen(skip)]
    #[serde(rename = "authenticatorOptions")]
    pub authenticator_options: AuthenticatorOptions,
}

/// VRF data for contract verification
#[wasm_bindgen]
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Device2VrfData {
    #[wasm_bindgen(getter_with_clone, js_name = "vrfInputB64")]
    pub vrf_input_b64: String,
    #[wasm_bindgen(getter_with_clone, js_name = "vrfOutputB64")]
    pub vrf_output_b64: String,
    #[wasm_bindgen(getter_with_clone, js_name = "vrfProofB64")]
    pub vrf_proof_b64: String,
    #[wasm_bindgen(getter_with_clone, js_name = "vrfPublicKeyB64")]
    pub vrf_public_key_b64: String,
    #[wasm_bindgen(getter_with_clone, js_name = "userId")]
    pub user_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "rpId")]
    pub rp_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "blockHeight")]
    pub block_height: String,
    #[wasm_bindgen(getter_with_clone, js_name = "blockHash")]
    pub block_hash: String,
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

    /// ChaCha20 nonce used for encryption (base64url-encoded)
    #[wasm_bindgen(getter_with_clone)]
    pub iv: String,

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
        iv: String,
        wrap_key_salt: String,
        signed_transaction: WasmSignedTransaction,
    ) -> RegisterDevice2WithDerivedKeyResult {
        RegisterDevice2WithDerivedKeyResult {
            public_key,
            encrypted_data,
            iv,
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
/// * `request` - Contains sessionId, account ID, transaction context, contract args
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
    debug!(
        "[rust wasm signer]: Starting Device2 combined registration for account {}",
        request.near_account_id
    );

    // === STEP 1: Derive NEAR keypair from PRF.second ===
    let (near_private_key, near_public_key) =
        crate::crypto::derive_ed25519_key_from_prf_output(&prf_second_b64u, &request.near_account_id)
            .map_err(|e| format!("Failed to derive ed25519 key from PRF.second: {}", e))?;

    debug!(
        "[rust wasm signer]: Derived Device2 NEAR keypair, public key: {}",
        near_public_key
    );

    // === STEP 2: Encrypt NEAR private key with KEK ===
    let kek = wrap_key
        .derive_kek()
        .map_err(|e| format!("Failed to derive KEK for Device2 key encryption: {}", e))?;

    let wrap_key_salt_bytes = crate::encoders::base64_url_decode(wrap_key.salt_b64u())
        .map_err(|e| format!("Failed to decode wrapKeySalt: {}", e))?;

    let encryption_result = crate::crypto::encrypt_data_chacha20(&near_private_key, &kek)
        .map_err(|e| format!("Failed to encrypt Device2 private key: {}", e))?
        .with_wrap_key_salt(&wrap_key_salt_bytes);

    debug!("[rust wasm signer]: Encrypted Device2 NEAR private key");

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

    // Get the public key bytes for transaction building
    let public_key_bytes: [u8; 32] = private_key_bytes[32..64]
        .try_into()
        .map_err(|_| "Failed to extract public key from private key".to_string())?;

    debug!("[rust wasm signer]: Parsed Device2 signing key");

    // === STEP 4: Build Device2 registration transaction ===
    let registration_tx = build_device2_registration_transaction(&request, &public_key_bytes)?;

    debug!(
        "[rust wasm signer]: Built Device2 registration transaction for contract {}",
        request.contract_args.contract_id
    );

    // === STEP 5: Sign transaction with derived NEAR keypair ===
    let signed_tx_bytes = crate::transaction::sign_transaction(registration_tx, &signing_key)
        .map_err(|e| format!("Failed to sign Device2 registration transaction: {}", e))?;

    debug!(
        "[rust wasm signer]: Signed Device2 registration transaction"
    );

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
) -> Result<crate::types::near::Transaction, String> {
    use crate::types::near::{Action, FunctionCallAction};

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

    // Decode VRF data from base64
    let vrf_input = base64_url_decode(&request.contract_args.vrf_data.vrf_input_b64)
        .map_err(|e| format!("Failed to decode VRF input: {}", e))?;
    let vrf_output = base64_url_decode(&request.contract_args.vrf_data.vrf_output_b64)
        .map_err(|e| format!("Failed to decode VRF output: {}", e))?;
    let vrf_proof = base64_url_decode(&request.contract_args.vrf_data.vrf_proof_b64)
        .map_err(|e| format!("Failed to decode VRF proof: {}", e))?;
    let vrf_public_key = base64_url_decode(&request.contract_args.vrf_data.vrf_public_key_b64)
        .map_err(|e| format!("Failed to decode VRF public key: {}", e))?;
    let vrf_block_hash = base64_url_decode(&request.contract_args.vrf_data.block_hash)
        .map_err(|e| format!("Failed to decode VRF block hash: {}", e))?;
    let deterministic_vrf_public_key = base64_url_decode(&request.contract_args.deterministic_vrf_public_key_b64)
        .map_err(|e| format!("Failed to decode deterministic VRF public key: {}", e))?;

    // ============================================================================
    // CONTRACT INTERFACE: link_device_register_user
    // ============================================================================
    // Reference: sdk/src/core/TatchiPasskey/faucets/createAccountRelayServer.ts
    // Contract: web3-authn-sdk smart contract on NEAR
    // ============================================================================

    #[derive(Serialize)]
    struct ContractArgs<'a> {
        /// VRF verification data containing cryptographic proofs
        vrf_data: VrfDataForContract,

        /// WebAuthn registration credential with base64url-encoded attestation data
        /// CONTRACT EXPECTS: Strings for clientDataJSON and attestationObject (NOT decoded bytes)
        webauthn_registration: &'a WebAuthnRegistrationCredential,

        /// Deterministic VRF public key for Device2
        /// CONTRACT EXPECTS: Vec<u8> (byte array, decoded from base64url)
        deterministic_vrf_public_key: Vec<u8>,

        /// Authenticator policy configuration
        authenticator_options: &'a AuthenticatorOptions,
    }

    /// VRF data structure for contract verification
    /// Reference: CreateAccountAndRegisterUserRequest.vrf_data in createAccountRelayServer.ts
    #[derive(Serialize)]
    struct VrfDataForContract {
        /// VRF input data (commitment hash)
        /// TypeScript: Array.from(base64UrlDecode(vrfChallenge.vrfInput))
        /// CONTRACT EXPECTS: Vec<u8> (byte array, decoded from base64url)
        vrf_input_data: Vec<u8>,  // NOTE: Field name is "vrf_input_data" NOT "vrf_input"

        /// VRF output (deterministic random output)
        /// TypeScript: Array.from(base64UrlDecode(vrfChallenge.vrfOutput))
        /// CONTRACT EXPECTS: Vec<u8> (byte array, decoded from base64url)
        vrf_output: Vec<u8>,

        /// VRF proof (cryptographic proof of correctness)
        /// TypeScript: Array.from(base64UrlDecode(vrfChallenge.vrfProof))
        /// CONTRACT EXPECTS: Vec<u8> (byte array, decoded from base64url)
        vrf_proof: Vec<u8>,

        /// VRF public key (ephemeral session key)
        /// TypeScript: Array.from(base64UrlDecode(vrfChallenge.vrfPublicKey))
        /// CONTRACT EXPECTS: Vec<u8> (byte array, decoded from base64url)
        public_key: Vec<u8>,  // NOTE: Field name is "public_key" NOT "vrf_public_key"

        /// WebAuthn user ID (NEAR account ID)
        /// TypeScript: vrfChallenge.userId
        /// CONTRACT EXPECTS: String
        user_id: String,

        /// WebAuthn relying party ID (domain)
        /// TypeScript: vrfChallenge.rpId
        /// CONTRACT EXPECTS: String
        rp_id: String,

        /// NEAR block height for VRF challenge freshness
        /// TypeScript: Number(vrfChallenge.blockHeight)
        /// CONTRACT EXPECTS: u64 (number, NOT string)
        block_height: u64,

        /// NEAR block hash for VRF challenge context
        /// TypeScript: Array.from(base64UrlDecode(vrfChallenge.blockHash))
        /// CONTRACT EXPECTS: Vec<u8> (byte array, decoded from base64url)
        block_hash: Vec<u8>,
    }

    // Parse block_height to u64
    let block_height_u64 = request
        .contract_args
        .vrf_data
        .block_height
        .parse::<u64>()
        .map_err(|e| format!("Invalid block_height format: {}", e))?;

    let contract_args = ContractArgs {
        vrf_data: VrfDataForContract {
            vrf_input_data: vrf_input,
            vrf_output,
            vrf_proof,
            public_key: vrf_public_key,
            user_id: request.contract_args.vrf_data.user_id.clone(),
            rp_id: request.contract_args.vrf_data.rp_id.clone(),
            block_height: block_height_u64,
            block_hash: vrf_block_hash,
        },
        webauthn_registration: &request.contract_args.webauthn_registration,
        deterministic_vrf_public_key,
        authenticator_options: &request.contract_args.authenticator_options,
    };

    let function_call_args_bytes = serde_json::to_vec(&contract_args)
        .map_err(|e| format!("Failed to serialize function call args: {}", e))?;

    let actions = vec![Action::FunctionCall(Box::new(FunctionCallAction {
        method_name: "link_device_register_user".to_string(),
        args: function_call_args_bytes,
        gas: 50_000_000_000_000, // 50 TGas
        deposit: 0,               // No deposit required
    }))];

    // Build NEAR transaction
    let tx = crate::types::near::Transaction {
        signer_id: request.near_account_id.parse().map_err(|e| {
            format!(
                "Invalid signer_id (NEAR account ID): {}",
                e
            )
        })?,
        public_key: crate::types::near::PublicKey::from_ed25519_bytes(public_key_bytes),
        nonce: parsed_nonce,
        receiver_id: request
            .contract_args
            .contract_id
            .parse()
            .map_err(|e| format!("Invalid receiver_id (contract ID): {}", e))?,
        block_hash: crate::types::near::CryptoHash(block_hash),
        actions,
    };

    Ok(tx)
}
