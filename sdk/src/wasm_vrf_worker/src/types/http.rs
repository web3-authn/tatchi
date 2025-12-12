use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use serde_wasm_bindgen;

// === Shamir 3-pass HTTP types (exported to TS via wasm-bindgen) ===

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone)]
pub struct ShamirApplyServerLockHTTPRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "kek_c_b64u")]
    pub kek_c_b64u: String,
}
impl ShamirApplyServerLockHTTPRequest {
    pub fn to_js_value(&self) -> JsValue {
        serde_wasm_bindgen::to_value(self).unwrap_or(JsValue::UNDEFINED)
    }
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone)]
pub struct ShamirApplyServerLockHTTPResponse {
    #[wasm_bindgen(getter_with_clone, js_name = "kek_cs_b64u")]
    pub kek_cs_b64u: String,
    #[wasm_bindgen(getter_with_clone, js_name = "keyId")]
    #[serde(default, rename = "keyId")]
    pub key_id: Option<String>,
}
impl ShamirApplyServerLockHTTPResponse {
    pub fn from_str(s: &str) -> Result<Self, String> {
        let js_val = js_sys::JSON::parse(s)
            .map_err(|e| format!("Failed to parse response JSON: {:?}", e))?;
        serde_wasm_bindgen::from_value(js_val)
            .map_err(|e| format!("Failed to deserialize response JSON: {}", e))
    }
    pub fn to_js_value(&self) -> JsValue {
        serde_wasm_bindgen::to_value(self).unwrap_or(JsValue::UNDEFINED)
    }
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone)]
pub struct ShamirRemoveServerLockHTTPRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "kek_cs_b64u")]
    pub kek_cs_b64u: String,
    #[wasm_bindgen(getter_with_clone, js_name = "keyId")]
    #[serde(rename = "keyId")]
    pub key_id: String,
}
impl ShamirRemoveServerLockHTTPRequest {
    pub fn to_js_value(&self) -> JsValue {
        serde_wasm_bindgen::to_value(self).unwrap_or(JsValue::UNDEFINED)
    }
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone)]
pub struct ShamirRemoveServerLockHTTPResponse {
    #[wasm_bindgen(getter_with_clone, js_name = "kek_c_b64u")]
    pub kek_c_b64u: String,
}
impl ShamirRemoveServerLockHTTPResponse {
    pub fn from_str(s: &str) -> Result<Self, String> {
        let js_val = js_sys::JSON::parse(s)
            .map_err(|e| format!("Failed to parse response JSON: {:?}", e))?;
        serde_wasm_bindgen::from_value(js_val)
            .map_err(|e| format!("Failed to deserialize response JSON: {}", e))
    }
    pub fn to_js_value(&self) -> JsValue {
        serde_wasm_bindgen::to_value(self).unwrap_or(JsValue::UNDEFINED)
    }
}
