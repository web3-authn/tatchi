use wasm_bindgen::JsValue;

use crate::handle_signer_message;

#[tokio::test]
async fn rejects_prf_in_payload() {
    let msg = serde_json::json!({
        "type": crate::types::worker_messages::WorkerRequestType::DecryptPrivateKeyWithPrf as u32,
        "payload": {
            "prfOutput": "malicious"
        }
    });
    let result = handle_signer_message(&msg.to_string()).await;
    assert!(result.is_err(), "expected PRF-bearing payload to be rejected");
    let err = result.err().unwrap();
    let err_str = err.as_string().unwrap_or_default();
    assert!(
        err_str.contains("Forbidden secret field"),
        "unexpected error message: {}",
        err_str
    );
}

#[tokio::test]
async fn rejects_vrf_sk_in_payload() {
    let msg = serde_json::json!({
        "type": crate::types::worker_messages::WorkerRequestType::SignTransactionsWithActions as u32,
        "payload": {
            "vrf_sk": "deadbeef"
        }
    });
    let result = handle_signer_message(&msg.to_string()).await;
    assert!(result.is_err(), "expected vrf_sk-bearing payload to be rejected");
    let err = result.err().unwrap();
    let err_str = err.as_string().unwrap_or_default();
    assert!(
        err_str.contains("Forbidden secret field"),
        "unexpected error message: {}",
        err_str
    );
}
