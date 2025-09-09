use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

// === Shamir 3-pass HTTP types (exported to TS via wasm-bindgen) ===

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone)]
pub struct ShamirApplyServerLockHTTPRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "kek_c_b64u")]
    pub kek_c_b64u: String,
}
impl ShamirApplyServerLockHTTPRequest {
    pub fn to_js_value(&self) -> JsValue {
        JsValue::from_str(&serde_json::to_string(self).unwrap())
    }
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone)]
pub struct ShamirApplyServerLockHTTPResponse {
    #[wasm_bindgen(getter_with_clone, js_name = "kek_cs_b64u")]
    pub kek_cs_b64u: String,
}
impl ShamirApplyServerLockHTTPResponse {
    pub fn from_str(s: &str) -> Result<Self, String> {
        serde_json::from_str(s)
            .map_err(|e| format!("Failed to parse response JSON: {}", e))
    }
    pub fn to_js_value(&self) -> JsValue {
        JsValue::from_str(&serde_json::to_string(self).unwrap())
    }
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone)]
pub struct ShamirRemoveServerLockHTTPRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "kek_cs_b64u")]
    pub kek_cs_b64u: String,
}
impl ShamirRemoveServerLockHTTPRequest {
    pub fn to_js_value(&self) -> JsValue {
        JsValue::from_str(&serde_json::to_string(self).unwrap())
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
        serde_json::from_str(s)
            .map_err(|e| format!("Failed to parse response JSON: {}", e))
    }
    pub fn to_js_value(&self) -> JsValue {
        JsValue::from_str(&serde_json::to_string(self).unwrap())
    }
}