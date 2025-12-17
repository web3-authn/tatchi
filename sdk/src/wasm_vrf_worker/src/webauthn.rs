use wasm_bindgen::JsValue;

#[cfg(target_arch = "wasm32")]
use js_sys::Reflect;

/// Extract PRF.first output (base64url string) from a WebAuthn credential's
/// `clientExtensionResults.prf.results.first` (or the `response.*` variant).
///
/// Returns `None` if the value is missing or not a string.
#[cfg(target_arch = "wasm32")]
pub(crate) fn extract_prf_first_from_credential(credential: &JsValue) -> Option<String> {
    fn get_nested_str(obj: &JsValue, path: &[&str]) -> Option<String> {
        let mut cur = obj.clone();
        for key in path {
            let next = Reflect::get(&cur, &JsValue::from_str(key)).ok()?;
            if next.is_null() || next.is_undefined() {
                return None;
            }
            cur = next;
        }
        cur.as_string()
    }

    get_nested_str(
        credential,
        &["clientExtensionResults", "prf", "results", "first"],
    )
    .or_else(|| {
        get_nested_str(
            credential,
            &[
                "response",
                "clientExtensionResults",
                "prf",
                "results",
                "first",
            ],
        )
    })
}

#[cfg(not(target_arch = "wasm32"))]
pub(crate) fn extract_prf_first_from_credential(_credential: &JsValue) -> Option<String> {
    None
}

/// Extract PRF.second output (base64url string) from a WebAuthn credential's
/// `clientExtensionResults.prf.results.second` (or the `response.*` variant).
///
/// Returns `None` if the value is missing or not a string.
#[cfg(target_arch = "wasm32")]
pub(crate) fn extract_prf_second_from_credential(credential: &JsValue) -> Option<String> {
    fn get_nested_str(obj: &JsValue, path: &[&str]) -> Option<String> {
        let mut cur = obj.clone();
        for key in path {
            let next = Reflect::get(&cur, &JsValue::from_str(key)).ok()?;
            if next.is_null() || next.is_undefined() {
                return None;
            }
            cur = next;
        }
        cur.as_string()
    }

    get_nested_str(
        credential,
        &["clientExtensionResults", "prf", "results", "second"],
    )
    .or_else(|| {
        get_nested_str(
            credential,
            &[
                "response",
                "clientExtensionResults",
                "prf",
                "results",
                "second",
            ],
        )
    })
}

#[cfg(not(target_arch = "wasm32"))]
#[allow(dead_code)]
pub(crate) fn extract_prf_second_from_credential(_credential: &JsValue) -> Option<String> {
    None
}
