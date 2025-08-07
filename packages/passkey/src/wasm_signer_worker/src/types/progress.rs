//! Progress Message Types - Auto-Generated TypeScript Interface
//!
//! These Rust types use wasm-bindgen to automatically generate corresponding
//! TypeScript types, ensuring type safety between Rust and TypeScript.
//!
//! MESSAGING FLOW DOCUMENTATION:
//! =============================
//!
//! 1. PROGRESS MESSAGES (During Operation):
//!    Rust WASM → send_progress_message() → TypeScript sendProgressMessage() → postMessage() → Main Thread
//!    - Used for real-time updates during long operations
//!    - Multiple progress messages can be sent per operation
//!    - Does not affect the final result
//!
//! 2. FINAL RESULTS (Operation Complete):
//!    Rust WASM → return value from handle_signer_message() → TypeScript worker → postMessage() → Main Thread
//!    - Contains the actual operation result (success/error)
//!    - Only one result message per operation
//!    - This is what the main thread awaits for completion

use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};

/// Progress message types that can be sent during WASM operations
/// Values align with TypeScript WorkerResponseType enum for proper mapping
///
/// Should match the Progress WorkerResponseTypes in worker_messages.rs:
/// - WorkerResponseType::RegistrationProgress
/// - WorkerResponseType::RegistrationComplete,
/// - WorkerResponseType::WebauthnAuthenticationProgress
/// - WorkerResponseType::AuthenticationComplete
/// - WorkerResponseType::TransactionSigningProgress
/// - WorkerResponseType::TransactionSigningComplete
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProgressMessageType {
    RegistrationProgress = 18,
    RegistrationComplete = 19,
    ExecuteActionsProgress = 20,
    ExecuteActionsComplete = 21,
}

impl TryFrom<u32> for ProgressMessageType {
    type Error = String;

    fn try_from(value: u32) -> Result<Self, <Self as TryFrom<u32>>::Error> {
        match value {
            18 => Ok(ProgressMessageType::RegistrationProgress),
            19 => Ok(ProgressMessageType::RegistrationComplete),
            20 => Ok(ProgressMessageType::ExecuteActionsProgress),
            21 => Ok(ProgressMessageType::ExecuteActionsComplete),
            _ => Err(format!("Invalid ProgressMessageType value: {}", value)),
        }
    }
}

/// Progress step identifiers for different phases of operations
/// Values start at 100 to avoid conflicts with WorkerResponseType enum
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProgressStep {
    Preparation = 100,
    WebauthnAuthentication = 101,
    AuthenticationComplete = 102,
    TransactionSigningProgress = 103,
    TransactionSigningComplete = 104,
    Error = 105,
}

impl TryFrom<u32> for ProgressStep {
    type Error = String;

    fn try_from(value: u32) -> Result<Self, <Self as TryFrom<u32>>::Error> {
        match value {
            100 => Ok(ProgressStep::Preparation),
            101 => Ok(ProgressStep::WebauthnAuthentication),
            102 => Ok(ProgressStep::AuthenticationComplete),
            103 => Ok(ProgressStep::TransactionSigningProgress),
            104 => Ok(ProgressStep::TransactionSigningComplete),
            105 => Ok(ProgressStep::Error),
            _ => Err(format!("Invalid ProgressStep value: {}", value)),
        }
    }
}

/// Status of a progress message
/// Auto-generates TypeScript enum: ProgressStatus
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProgressStatus {
    Progress = "progress",
    Success = "success",
    Error = "error",
}

/// Base progress message structure sent from WASM to TypeScript
/// Auto-generates TypeScript interface: WorkerProgressMessage
#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkerProgressMessage {
    #[wasm_bindgen(getter_with_clone)]
    pub message_type: String, // Will contain ProgressMessageType value

    #[wasm_bindgen(getter_with_clone)]
    pub step: String, // Will contain ProgressStep value

    #[wasm_bindgen(getter_with_clone)]
    pub message: String,

    #[wasm_bindgen(getter_with_clone)]
    pub status: String, // Will contain ProgressStatus value

    pub timestamp: f64,

    #[wasm_bindgen(getter_with_clone)]
    pub data: Option<String>, // JSON stringified data
}

#[wasm_bindgen]
impl WorkerProgressMessage {
    #[wasm_bindgen(constructor)]
    pub fn new(
        message_type: &str,
        step: &str,
        message: &str,
        status: &str,
        timestamp: f64,
        data: Option<String>,
    ) -> WorkerProgressMessage {
        WorkerProgressMessage {
            message_type: message_type.to_string(),
            step: step.to_string(),
            message: message.to_string(),
            status: status.to_string(),
            timestamp,
            data,
        }
    }
}

/// Type-safe helper for sending progress messages from WASM
/// This ensures all progress messages use the correct types
/// Now uses numeric enum values directly for better type safety
pub fn send_progress_message(
    message_type: ProgressMessageType,
    step: ProgressStep,
    message: &str,
    data: Option<&str>,
) {
    crate::send_progress_message(
        message_type as u32,
        step as u32,
        message,
        data.unwrap_or("{}"),
    );
}

/// Type-safe helper for sending completion messages from WASM
pub fn send_completion_message(
    message_type: ProgressMessageType,
    step: ProgressStep,
    message: &str,
    data: Option<&str>,
) {
    // Completion messages have the same structure as progress, just different status
    crate::send_progress_message(
        message_type as u32,
        step as u32,
        message,
        data.unwrap_or("{}"),
    );
}

/// Type-safe helper for sending error messages from WASM
pub fn send_error_message(
    message_type: ProgressMessageType,
    step: ProgressStep,
    message: &str,
    error: &str,
) {
    let error_data = serde_json::json!({ "error": error }).to_string();
    crate::send_progress_message(
        message_type as u32,
        step as u32,
        message,
        &error_data,
    );
}

// === DEBUGGING HELPERS ===
// Convert numeric enum values to readable strings for debugging
// This makes Rust logs easier to read when dealing with numeric enum values

/// Convert ProgressMessageType enum to readable string for debugging
pub fn progress_message_type_name(message_type: ProgressMessageType) -> &'static str {
    match message_type {
        ProgressMessageType::RegistrationProgress => "REGISTRATION_PROGRESS",
        ProgressMessageType::RegistrationComplete => "REGISTRATION_COMPLETE",
        ProgressMessageType::ExecuteActionsProgress => "EXECUTE_ACTIONS_PROGRESS",
        ProgressMessageType::ExecuteActionsComplete => "EXECUTE_ACTIONS_COMPLETE",
    }
}

/// Convert ProgressStep enum to readable string for debugging
pub fn progress_step_name(step: ProgressStep) -> &'static str {
    match step {
        ProgressStep::Preparation => "preparation",
        ProgressStep::WebauthnAuthentication => "webauthn-authentication",
        ProgressStep::AuthenticationComplete => "authentication-complete",
        ProgressStep::TransactionSigningProgress => "transaction-signing-progress",
        ProgressStep::TransactionSigningComplete => "transaction-signing-complete",
        ProgressStep::Error => "error",
    }
}

/// Convert ProgressStatus enum to readable string for debugging
pub fn progress_status_name(status: ProgressStatus) -> &'static str {
    match status {
        ProgressStatus::Progress => "progress",
        ProgressStatus::Success => "success",
        ProgressStatus::Error => "error",
        ProgressStatus::__Invalid => "invalid",
    }
}

/// Enhanced logging helper that includes enum names for better debugging
pub fn log_progress_message(
    message_type: ProgressMessageType,
    step: ProgressStep,
    message: &str,
) {
    crate::log(&format!(
        "Progress: {} ({}) - {} ({}) - {}",
        progress_message_type_name(message_type),
        message_type as u32,
        progress_step_name(step),
        step as u32,
        message
    ));
}