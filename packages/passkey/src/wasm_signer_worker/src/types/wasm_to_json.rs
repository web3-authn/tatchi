use serde::{Serialize};
use wasm_bindgen::prelude::*;

// === WASM-FRIENDLY WRAPPER TYPES ===

// Trait for converting response types to JSON
pub trait ToJson {
    fn to_json(&self) -> Result<serde_json::Value, String>;
}

impl<T: Serialize> ToJson for T {
    fn to_json(&self) -> Result<serde_json::Value, String> {
        serde_json::to_value(self).map_err(|e| format!("Failed to serialize to JSON: {}", e))
    }
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize)]
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
        #[wasm_bindgen(js_name = "keyData")] key_data: Vec<u8>
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
#[derive(Debug, Clone, Serialize)]
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
        #[wasm_bindgen(js_name = "signatureData")] signature_data: Vec<u8>
    ) -> WasmSignature {
        WasmSignature { key_type, signature_data }
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
#[derive(Debug, Clone, Serialize)]
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
    #[wasm_bindgen(getter_with_clone, js_name = "actionsJson")]
    pub actions_json: String,
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
        #[wasm_bindgen(js_name = "actionsJson")] actions_json: String,
    ) -> WasmTransaction {
        WasmTransaction {
            signer_id,
            public_key,
            nonce,
            receiver_id,
            block_hash,
            actions_json,
        }
    }
}

// Simplified From implementation that serializes actions to JSON string
impl From<&crate::types::Transaction> for WasmTransaction {
    fn from(tx: &crate::types::Transaction) -> Self {
        let actions_json = serde_json::to_string(&tx.actions).unwrap_or_else(|_| "[]".to_string());
        WasmTransaction {
            signer_id: tx.signer_id.0.clone(),
            public_key: WasmPublicKey::from(&tx.public_key),
            nonce: tx.nonce,
            receiver_id: tx.receiver_id.0.clone(),
            block_hash: tx.block_hash.to_vec(),
            actions_json,
        }
    }
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize)]
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

// No wasm_bindgen macro here because we're not exporting these methods to TypeScript
impl WasmSignedTransaction {
    pub fn to_borsh_bytes(&self) -> Result<Vec<u8>, String> {
        Ok(self.borsh_bytes.clone())
    }

    /// Create JSON with borsh bytes included
    pub fn to_json_with_borsh(&self, borsh_bytes: Option<Vec<u8>>) -> Result<serde_json::Value, String> {
        let mut json = serde_json::Map::new();

        // Serialize transaction
        let tx_json = serde_json::to_value(&self.transaction)
            .map_err(|e| format!("Failed to serialize transaction: {}", e))?;
        json.insert("transaction".to_string(), tx_json);

        // Serialize signature
        let sig_json = serde_json::to_value(&self.signature)
            .map_err(|e| format!("Failed to serialize signature: {}", e))?;
        json.insert("signature".to_string(), sig_json);

        // Add borsh bytes if provided
        if let Some(bytes) = borsh_bytes {
            json.insert("borshBytes".to_string(), serde_json::Value::Array(
                bytes.iter().map(|&b| serde_json::Value::Number(serde_json::Number::from(b))).collect()
            ));
        }

        Ok(serde_json::Value::Object(json))
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