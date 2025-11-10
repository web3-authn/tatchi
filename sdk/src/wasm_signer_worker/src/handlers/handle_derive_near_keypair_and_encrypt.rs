// ******************************************************************************
// *                                                                            *
// *                    HANDLER: DERIVE ED25519 KEYPAIR AND ENCRYPT                   *
// *                                                                            *
// ******************************************************************************

use bs58;
use log::{debug, warn};
use serde::{Deserialize, Serialize};
use serde_json;
use wasm_bindgen::prelude::*;

use crate::encoders::base64_url_decode;
use crate::rpc_calls::VrfData;
use crate::types::wasm_to_json::WasmSignedTransaction;
use crate::types::{
    AuthenticatorOptions, SerializedRegistrationCredential, VrfChallenge,
    WebAuthnRegistrationCredential, WebAuthnRegistrationResponse,
};

#[wasm_bindgen]
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeriveNearKeypairAndEncryptRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "dualPrfOutputs")]
    pub dual_prf_outputs: DualPrfOutputsStruct,
    #[wasm_bindgen(getter_with_clone, js_name = "nearAccountId")]
    pub near_account_id: String,
    #[wasm_bindgen(getter_with_clone)]
    pub credential: SerializedRegistrationCredential,
    #[wasm_bindgen(getter_with_clone, js_name = "registrationTransaction")]
    pub registration_transaction: Option<LinkDeviceRegistrationTransaction>,
    #[wasm_bindgen(getter_with_clone, js_name = "authenticatorOptions")]
    pub authenticator_options: Option<AuthenticatorOptions>,
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DualPrfOutputsStruct {
    #[wasm_bindgen(getter_with_clone, js_name = "chacha20PrfOutput")]
    pub chacha20_prf_output: String,
    #[wasm_bindgen(getter_with_clone, js_name = "ed25519PrfOutput")]
    pub ed25519_prf_output: String,
}

#[wasm_bindgen]
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LinkDeviceRegistrationTransaction {
    #[wasm_bindgen(getter_with_clone, js_name = "vrfChallenge")]
    pub vrf_challenge: VrfChallenge,
    #[wasm_bindgen(getter_with_clone, js_name = "contractId")]
    pub contract_id: String,
    #[wasm_bindgen(getter_with_clone)]
    pub nonce: String,
    #[wasm_bindgen(getter_with_clone, js_name = "blockHash")]
    pub block_hash: String,
    #[wasm_bindgen(getter_with_clone, js_name = "deterministicVrfPublicKey")]
    pub deterministic_vrf_public_key: String,
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeriveNearKeypairAndEncryptResult {
    #[wasm_bindgen(getter_with_clone, js_name = "nearAccountId")]
    pub near_account_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "publicKey")]
    pub public_key: String,
    #[wasm_bindgen(getter_with_clone, js_name = "encryptedData")]
    pub encrypted_data: String,
    #[wasm_bindgen(getter_with_clone)]
    pub iv: String,
    pub stored: bool,
    #[wasm_bindgen(getter_with_clone, js_name = "signedTransaction")]
    pub signed_transaction: Option<WasmSignedTransaction>,
}

#[wasm_bindgen]
impl DeriveNearKeypairAndEncryptResult {
    #[wasm_bindgen(constructor)]
    pub fn new(
        near_account_id: String,
        public_key: String,
        encrypted_data: String,
        iv: String,
        stored: bool,
        signed_transaction: Option<WasmSignedTransaction>,
    ) -> DeriveNearKeypairAndEncryptResult {
        DeriveNearKeypairAndEncryptResult {
            near_account_id,
            public_key,
            encrypted_data,
            iv,
            stored,
            signed_transaction,
        }
    }
}

/// **Handles:** `WorkerRequestType::DeriveNearKeypairAndEncrypt`
/// This is the primary handler for new device setup and linking. It performs the following operations:
/// 1. Derives Ed25519 keypair from PRF output using HKDF with account-specific salt
/// 2. Encrypts the private key using AES-GCM with AES PRF output
/// 3. Optionally signs a device registration transaction for linking devices
///
/// # Arguments
/// * `request` - Contains dual PRF outputs, account ID, WebAuthn credential, and optional registration transaction
///
/// # Returns
/// * `DeriveNearKeypairResult` - Contains derived public key, encrypted private key data, and optional signed transaction
pub async fn handle_derive_near_keypair_and_encrypt(
    request: DeriveNearKeypairAndEncryptRequest,
) -> Result<DeriveNearKeypairAndEncryptResult, String> {
    debug!("[rust wasm]: starting dual PRF keypair derivation with optional transaction signing");
    // Convert wasm-bindgen types to internal types
    let internal_dual_prf_outputs = crate::types::DualPrfOutputs {
        chacha20_prf_output_base64: request.dual_prf_outputs.chacha20_prf_output,
        ed25519_prf_output_base64: request.dual_prf_outputs.ed25519_prf_output,
    };

    // Call the dual PRF derivation function (same as JSON version)
    let (public_key, encrypted_result) = crate::crypto::derive_and_encrypt_keypair_from_dual_prf(
        &internal_dual_prf_outputs,
        &request.near_account_id,
    )
    .map_err(|e| format!("Failed to derive and encrypt keypair: {}", e))?;

    // Handle optional transaction signing if registration transaction is provided
    let signed_transaction_wasm = if let Some(registration_tx) = &request.registration_transaction {
        // Re-derive the private key from the same PRF output for signing (before it's encrypted)
        let (near_private_key, _near_public_key) =
            crate::crypto::derive_ed25519_key_from_prf_output(
                &internal_dual_prf_outputs.ed25519_prf_output_base64,
                &request.near_account_id,
            )
            .map_err(|e| format!("Failed to re-derive keypair for signing: {}", e))?;

        // Parse nonce
        let parsed_nonce = registration_tx
            .nonce
            .parse::<u64>()
            .map_err(|e| format!("Invalid nonce format: {}", e))?;

        // Use VrfChallenge directly instead of converting
        let vrf_challenge_struct = &registration_tx.vrf_challenge;

        // Convert to VrfData using the existing conversion
        let vrf_data = VrfData::try_from(vrf_challenge_struct)
            .map_err(|e| format!("Failed to convert VRF challenge: {:?}", e))?;

        // Convert the SerializedRegistrationCredential to WebAuthnRegistrationCredential
        let webauthn_registration = WebAuthnRegistrationCredential {
            id: request.credential.id.clone(),
            raw_id: request.credential.raw_id.clone(),
            response: WebAuthnRegistrationResponse {
                client_data_json: request.credential.response.client_data_json.clone(),
                attestation_object: request.credential.response.attestation_object.clone(),
                transports: Some(request.credential.response.transports.clone()),
            },
            authenticator_attachment: request.credential.authenticator_attachment.clone(),
            reg_type: request.credential.credential_type.clone(),
        };

        // Sign the link_device_register_user transaction
        // Decode base64url deterministic VRF public key to Vec<u8>
        let deterministic_vrf_public_key =
            base64_url_decode(&registration_tx.deterministic_vrf_public_key)
                .map_err(|e| format!("Failed to decode deterministic VRF public key: {}", e))?;

        match crate::transaction::sign_link_device_registration_tx(
            &registration_tx.contract_id,
            vrf_data,
            deterministic_vrf_public_key,
            webauthn_registration,
            &request.near_account_id,
            &near_private_key, // Use the properly derived NEAR private key
            parsed_nonce,
            &bs58::decode(&registration_tx.block_hash)
                .into_vec()
                .map_err(|e| format!("Invalid block hash: {}", e))?,
            request.authenticator_options, // Pass authenticator options
        )
        .await
        {
            Ok(registration_result) => {
                let signed_tx_result = registration_result.unwrap_signed_transaction();
                // Convert the result to SignedTransaction
                match signed_tx_result {
                    Some(json_value) => {
                        // Parse the JSON value back to SignedTransaction
                        let signed_tx: crate::types::SignedTransaction =
                            serde_json::from_value(json_value).map_err(|e| {
                                format!("Failed to parse signed transaction: {}", e)
                            })?;
                        Some(WasmSignedTransaction::from(&signed_tx))
                    }
                    None => None,
                }
            }
            Err(e) => {
                warn!("RUST: Transaction signing failed: {}", e);
                None
            }
        }
    } else {
        debug!("[rust wasm]: No transaction signing requested: parameters not provided");
        None
    };

    // Convert signed transaction to WASM wrapper if present
    let signed_transaction_struct = signed_transaction_wasm;

    // Return structured result with optional signed transaction
    Ok(DeriveNearKeypairAndEncryptResult::new(
        request.near_account_id,
        public_key,
        encrypted_result.encrypted_near_key_data_b64u,
        encrypted_result.chacha20_nonce_b64u,
        true, // stored = true since we're storing in WASM
        signed_transaction_struct,
    ))
}
