use crate::types::progress::{send_progress_message, ProgressMessageType, ProgressStep};

#[test]
fn test_send_progress_message_function() {
    // Test that send_progress_message works in non-WASM context
    send_progress_message(
        ProgressMessageType::ExecuteActionsProgress,
        ProgressStep::TransactionSigningProgress,
        "Test progress message",
        Some(r#"{"step": 1, "total": 3}"#),
    );

    // Should print to console in non-WASM context (no panic)
    assert!(
        true,
        "send_progress_message should not panic in test context"
    );
}

#[test]
fn test_progress_message_types() {
    // Test all supported progress message types
    let message_types = [
        ProgressMessageType::RegistrationProgress,
        ProgressMessageType::RegistrationComplete,
        ProgressMessageType::ExecuteActionsProgress,
        ProgressMessageType::ExecuteActionsComplete,
    ];

    for msg_type in message_types {
        send_progress_message(
            msg_type,
            ProgressStep::Preparation,
            "Test message",
            Some("{}"),
        );
    }

    // Should not panic with any supported message type
    assert!(true, "All message types should be handled without panic");
}

#[test]
fn test_progress_message_json_data() {
    // Test with various JSON data formats
    let test_cases = [
        (
            ProgressMessageType::ExecuteActionsProgress,
            ProgressStep::Preparation,
            "Testing",
            r#"{"step": 1}"#,
        ),
        (
            ProgressMessageType::RegistrationComplete,
            ProgressStep::AuthenticationComplete,
            "Done",
            r#"{"success": true, "count": 5}"#,
        ),
        (
            ProgressMessageType::RegistrationProgress,
            ProgressStep::TransactionSigningProgress,
            "Checking",
            "{}",
        ),
    ];

    for (msg_type, step, message, data) in test_cases {
        send_progress_message(msg_type, step, message, Some(data));
    }

    assert!(true, "Various JSON data formats should be handled");
}
