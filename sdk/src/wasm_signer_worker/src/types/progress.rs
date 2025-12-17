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

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// Progress message types that can be sent during WASM operations.
/// Values MUST align with the progress variants of WorkerResponseType in
/// `worker_messages.rs` so that TypeScript can treat them as progress
/// responses (not success/failure) based on the shared numeric codes.
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
    UserConfirmation = 101,
    WebauthnAuthentication = 102,
    AuthenticationComplete = 103,
    TransactionSigningProgress = 104,
    TransactionSigningComplete = 105,
    Error = 106,
}

impl TryFrom<u32> for ProgressStep {
    type Error = String;

    fn try_from(value: u32) -> Result<Self, <Self as TryFrom<u32>>::Error> {
        match value {
            100 => Ok(ProgressStep::Preparation),
            101 => Ok(ProgressStep::UserConfirmation),
            102 => Ok(ProgressStep::WebauthnAuthentication),
            103 => Ok(ProgressStep::AuthenticationComplete),
            104 => Ok(ProgressStep::TransactionSigningProgress),
            105 => Ok(ProgressStep::TransactionSigningComplete),
            106 => Ok(ProgressStep::Error),
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
pub fn send_progress_message<T: Serialize + ?Sized>(
    msg_type: ProgressMessageType,
    step: ProgressStep,
    log: &str,
    data: Option<&T>,
) {
    let data_js = if let Some(_d) = data {
        #[cfg(target_arch = "wasm32")]
        {
            serde_wasm_bindgen::to_value(_d).unwrap_or(JsValue::UNDEFINED)
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            JsValue::UNDEFINED
        }
    } else {
        JsValue::UNDEFINED
    };

    crate::send_progress_message(msg_type as u32, step as u32, log, data_js);
}

/// Type-safe helper for sending completion messages from WASM
pub fn send_completion_message<T: Serialize + ?Sized>(
    msg_type: ProgressMessageType,
    step: ProgressStep,
    log: &str,
    data: Option<&T>,
) {
    send_progress_message(msg_type, step, log, data);
}

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
        ProgressStep::UserConfirmation => "user-confirmation",
        ProgressStep::WebauthnAuthentication => "webauthn-authentication",
        ProgressStep::AuthenticationComplete => "authentication-complete",
        ProgressStep::TransactionSigningProgress => "transaction-signing-progress",
        ProgressStep::TransactionSigningComplete => "transaction-signing-complete",
        ProgressStep::Error => "error",
    }
}

/// Structured data payload for progress messages.
/// Used to replace generic JSON objects to remove serde_json dependency.
#[derive(Debug, Clone, Serialize)]
pub struct ProgressData {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step: Option<u32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<u32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub transaction_count: Option<usize>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub success: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub logs: Option<Vec<String>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub hash: Option<String>,
}

impl ProgressData {
    pub fn new(step: u32, total: u32) -> Self {
        Self {
            step: Some(step),
            total: Some(total),
            transaction_count: None,
            success: None,
            logs: None,
            context: None,
            hash: None,
        }
    }

    pub fn with_context(mut self, context: &str) -> Self {
        self.context = Some(context.to_string());
        self
    }

    pub fn with_transaction_count(mut self, count: usize) -> Self {
        self.transaction_count = Some(count);
        self
    }

    pub fn with_success(mut self, success: bool) -> Self {
        self.success = Some(success);
        self
    }

    pub fn with_logs(mut self, logs: Vec<String>) -> Self {
        self.logs = Some(logs);
        self
    }

    pub fn with_hash(mut self, hash: String) -> Self {
        self.hash = Some(hash);
        self
    }
}
