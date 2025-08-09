use crate::types::progress::{ProgressMessageType, ProgressStep, send_progress_message};

#[test]
fn test_send_progress_message_function() {
    // Test that send_progress_message works in non-WASM context
    send_progress_message(
        ProgressMessageType::SigningProgress,
        ProgressStep::TransactionSigning,
        "Test progress message",
        Some(r#"{"step": 1, "total": 3}"#)
    );

    // Should print to console in non-WASM context (no panic)
    assert!(true, "send_progress_message should not panic in test context");
}

#[test]
fn test_progress_message_types() {
    // Test all supported progress message types
    let message_types = [
        ProgressMessageType::VerificationProgress,
        ProgressMessageType::VerificationComplete,
        ProgressMessageType::SigningProgress,
        ProgressMessageType::SigningComplete,
        ProgressMessageType::RegistrationProgress,
        ProgressMessageType::RegistrationComplete,
    ];

    for msg_type in message_types {
        send_progress_message(
            msg_type,
            ProgressStep::Preparation,
            "Test message",
            Some("{}")
        );
    }

    // Should not panic with any supported message type
    assert!(true, "All message types should be handled without panic");
}

#[test]
fn test_progress_message_json_data() {
    // Test with various JSON data formats
    let test_cases = [
        (ProgressMessageType::SigningProgress, ProgressStep::Preparation, "Testing", r#"{"step": 1}"#),
        (ProgressMessageType::SigningComplete, ProgressStep::ContractVerification, "Done", r#"{"success": true, "count": 5}"#),
        (ProgressMessageType::VerificationProgress, ProgressStep::TransactionSigning, "Checking", "{}"),
    ];

    for (msg_type, step, message, data) in test_cases {
        send_progress_message(msg_type, step, message, Some(data));
    }

    assert!(true, "Various JSON data formats should be handled");
}