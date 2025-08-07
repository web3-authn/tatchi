use wasm_bindgen::prelude::*;
use sra_wasm::{SRAKey, encrypt, decrypt};

#[wasm_bindgen]
pub struct WasmSRAKey {
    inner: SRAKey,
}

#[wasm_bindgen]
impl WasmSRAKey {
    #[wasm_bindgen(constructor)]
    pub fn new(bits: usize) -> Result<WasmSRAKey, JsValue> {
        let inner = SRAKey::random(bits)
            .map_err(|e| JsValue::from_str(&format!("Failed to generate SRA key: {}", e)))?;
        Ok(WasmSRAKey { inner })
    }

    #[wasm_bindgen(js_name = fromPrivateKey)]
    pub fn from_private_key(private_key_bytes: &[u8]) -> Result<WasmSRAKey, JsValue> {
        let inner = SRAKey::from_private_key(private_key_bytes)
            .map_err(|e| JsValue::from_str(&format!("Failed to create SRA key from private key: {}", e)))?;
        Ok(WasmSRAKey { inner })
    }

    #[wasm_bindgen(js_name = fromPublicKey)]
    pub fn from_public_key(public_key_bytes: &[u8]) -> Result<WasmSRAKey, JsValue> {
        let inner = SRAKey::from_public_key(public_key_bytes)
            .map_err(|e| JsValue::from_str(&format!("Failed to create SRA key from public key: {}", e)))?;
        Ok(WasmSRAKey { inner })
    }

    pub fn encrypt(&self, plaintext: &[u8]) -> Result<Vec<u8>, JsValue> {
        encrypt(&self.inner, plaintext)
            .map_err(|e| JsValue::from_str(&format!("Encryption failed: {}", e)))
    }

    pub fn decrypt(&self, ciphertext: &[u8]) -> Result<Vec<u8>, JsValue> {
        decrypt(&self.inner, ciphertext)
            .map_err(|e| JsValue::from_str(&format!("Decryption failed: {}", e)))
    }

    #[wasm_bindgen(js_name = getPublicKey)]
    pub fn get_public_key(&self) -> Vec<u8> {
        self.inner.get_public_key()
    }

    #[wasm_bindgen(js_name = getPrivateKey)]
    pub fn get_private_key(&self) -> Vec<u8> {
        self.inner.get_private_key()
    }
}