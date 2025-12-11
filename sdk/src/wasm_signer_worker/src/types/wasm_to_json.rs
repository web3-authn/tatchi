use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

// === WASM-FRIENDLY WRAPPER TYPES ===

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmPublicKey {
    #[wasm_bindgen(getter_with_clone, js_name = "keyType")]
    pub key_type: u8,
    #[wasm_bindgen(getter_with_clone, js_name = "keyData")]
    pub key_data: Vec<u8>,
}

#[wasm_bindgen]
impl WasmPublicKey {
    #[wasm_bindgen(constructor)]
    pub fn new(
        #[wasm_bindgen(js_name = "keyType")] key_type: u8,
        #[wasm_bindgen(js_name = "keyData")] key_data: Vec<u8>,
    ) -> WasmPublicKey {
        WasmPublicKey { key_type, key_data }
    }
}

impl From<&crate::types::PublicKey> for WasmPublicKey {
    fn from(pk: &crate::types::PublicKey) -> Self {
        WasmPublicKey {
            key_type: pk.key_type,
            key_data: pk.to_vec(),
        }
    }
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmSignature {
    #[wasm_bindgen(getter_with_clone, js_name = "keyType")]
    pub key_type: u8,
    #[wasm_bindgen(getter_with_clone, js_name = "signatureData")]
    pub signature_data: Vec<u8>,
}

#[wasm_bindgen]
impl WasmSignature {
    #[wasm_bindgen(constructor)]
    pub fn new(
        #[wasm_bindgen(js_name = "keyType")] key_type: u8,
        #[wasm_bindgen(js_name = "signatureData")] signature_data: Vec<u8>,
    ) -> WasmSignature {
        WasmSignature {
            key_type,
            signature_data,
        }
    }
}

impl From<&crate::types::Signature> for WasmSignature {
    fn from(sig: &crate::types::Signature) -> Self {
        WasmSignature {
            key_type: sig.key_type,
            signature_data: sig.to_vec(),
        }
    }
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmTransaction {
    #[wasm_bindgen(getter_with_clone, js_name = "signerId")]
    pub signer_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "publicKey")]
    pub public_key: WasmPublicKey,
    #[wasm_bindgen(getter_with_clone)]
    pub nonce: u64,
    #[wasm_bindgen(getter_with_clone, js_name = "receiverId")]
    pub receiver_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "blockHash")]
    pub block_hash: Vec<u8>,
    #[wasm_bindgen(getter_with_clone, js_name = "actions")]
    #[serde(with = "serde_wasm_bindgen::preserve")]
    pub actions: JsValue,
}

#[wasm_bindgen]
impl WasmTransaction {
    #[wasm_bindgen(constructor)]
    pub fn new(
        #[wasm_bindgen(js_name = "signerId")] signer_id: String,
        #[wasm_bindgen(js_name = "publicKey")] public_key: WasmPublicKey,
        nonce: u64,
        #[wasm_bindgen(js_name = "receiverId")] receiver_id: String,
        #[wasm_bindgen(js_name = "blockHash")] block_hash: Vec<u8>,
        #[wasm_bindgen(js_name = "actions")] actions: JsValue,
    ) -> WasmTransaction {
        WasmTransaction {
            signer_id,
            public_key,
            nonce,
            receiver_id,
            block_hash,
            actions,
        }
    }
}

// Simplified From implementation that serializes actions to JSON string
impl From<&crate::types::Transaction> for WasmTransaction {
    fn from(tx: &crate::types::Transaction) -> Self {
        let actions = serde_wasm_bindgen::to_value(&tx.actions).unwrap_or(JsValue::NULL);
        WasmTransaction {
            signer_id: tx.signer_id.0.clone(),
            public_key: WasmPublicKey::from(&tx.public_key),
            nonce: tx.nonce,
            receiver_id: tx.receiver_id.0.clone(),
            block_hash: tx.block_hash.to_vec(),
            actions,
        }
    }
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmSignedTransaction {
    #[wasm_bindgen(getter_with_clone)]
    pub transaction: WasmTransaction,
    #[wasm_bindgen(getter_with_clone)]
    pub signature: WasmSignature,
    #[wasm_bindgen(getter_with_clone, js_name = "borshBytes")]
    pub borsh_bytes: Vec<u8>,
}

#[wasm_bindgen]
impl WasmSignedTransaction {
    #[wasm_bindgen(constructor)]
    pub fn new(
        transaction: WasmTransaction,
        signature: WasmSignature,
        #[wasm_bindgen(js_name = "borshBytes")] borsh_bytes: Vec<u8>,
    ) -> WasmSignedTransaction {
        WasmSignedTransaction {
            transaction,
            signature,
            borsh_bytes,
        }
    }
}

impl From<&crate::types::SignedTransaction> for WasmSignedTransaction {
    fn from(signed_tx: &crate::types::SignedTransaction) -> Self {
        let borsh_bytes = signed_tx.to_borsh_bytes().unwrap_or_default();
        WasmSignedTransaction {
            transaction: WasmTransaction::from(&signed_tx.transaction),
            signature: WasmSignature::from(&signed_tx.signature),
            borsh_bytes,
        }
    }
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmDelegateAction {
    #[wasm_bindgen(getter_with_clone, js_name = "senderId")]
    pub sender_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "receiverId")]
    pub receiver_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "actions")]
    #[serde(with = "serde_wasm_bindgen::preserve")]
    pub actions: JsValue,
    pub nonce: u64,
    #[wasm_bindgen(getter_with_clone, js_name = "maxBlockHeight")]
    pub max_block_height: u64,
    #[wasm_bindgen(getter_with_clone, js_name = "publicKey")]
    pub public_key: WasmPublicKey,
}

impl From<&crate::types::DelegateAction> for WasmDelegateAction {
    fn from(delegate: &crate::types::DelegateAction) -> Self {
        let actions = serde_wasm_bindgen::to_value(&delegate.actions).unwrap_or(JsValue::NULL);

        WasmDelegateAction {
            sender_id: delegate.sender_id.0.clone(),
            receiver_id: delegate.receiver_id.0.clone(),
            actions,
            nonce: delegate.nonce,
            max_block_height: delegate.max_block_height,
            public_key: WasmPublicKey::from(&delegate.public_key),
        }
    }
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmSignedDelegate {
    #[wasm_bindgen(getter_with_clone, js_name = "delegateAction")]
    pub delegate_action: WasmDelegateAction,
    #[wasm_bindgen(getter_with_clone)]
    pub signature: WasmSignature,
    #[wasm_bindgen(getter_with_clone, js_name = "borshBytes")]
    pub borsh_bytes: Vec<u8>,
}

#[wasm_bindgen]
impl WasmSignedDelegate {
    #[wasm_bindgen(constructor)]
    pub fn new(
        #[wasm_bindgen(js_name = "delegateAction")] delegate_action: WasmDelegateAction,
        signature: WasmSignature,
        #[wasm_bindgen(js_name = "borshBytes")] borsh_bytes: Vec<u8>,
    ) -> WasmSignedDelegate {
        WasmSignedDelegate {
            delegate_action,
            signature,
            borsh_bytes,
        }
    }

    pub fn to_borsh_bytes(&self) -> Result<Vec<u8>, String> {
        Ok(self.borsh_bytes.clone())
    }
}

impl From<&crate::types::SignedDelegate> for WasmSignedDelegate {
    fn from(sd: &crate::types::SignedDelegate) -> Self {
        let borsh_bytes = sd.to_borsh_bytes().unwrap_or_default();
        WasmSignedDelegate {
            delegate_action: WasmDelegateAction::from(&sd.delegate_action),
            signature: WasmSignature::from(&sd.signature),
            borsh_bytes,
        }
    }
}
