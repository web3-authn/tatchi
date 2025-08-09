use std::fmt;
use serde::{Deserialize, Serialize};

/// VRF Worker Error Types
///
/// This module defines all error types used by the VRF worker,
/// providing structured error handling with proper context and debugging information.

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum VrfWorkerError {
    /// No VRF keypair is currently loaded in memory
    NoVrfKeypair,

    /// VRF keypair is not unlocked (session not active)
    VrfNotUnlocked,

    /// PRF output is empty or invalid
    InvalidPrfOutput(String),

    /// HKDF key derivation failed
    HkdfDerivationFailed(HkdfError),

    /// AES-GCM encryption/decryption errors
    AesGcmError(AesError),

    /// Invalid IV/nonce length for AES-GCM
    InvalidIvLength { expected: usize, actual: usize },

    /// Serialization/deserialization errors
    SerializationError(SerializationError),

    /// VRF cryptographic operation errors
    VrfCryptoError(VrfCryptoError),

    /// Public key mismatch during verification
    PublicKeyMismatch { expected: String, actual: String },

    /// Worker message parsing errors
    MessageParsingError(MessageError),

    /// Missing required data in worker messages
    MissingRequiredData(String),

    /// Invalid worker message format
    InvalidMessageFormat(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum HkdfError {
    /// HKDF key derivation failed
    KeyDerivationFailed,
    /// HKDF VRF seed derivation failed
    VrfSeedDerivationFailed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AesError {
    /// Failed to create AES cipher
    CipherCreationFailed(String),
    /// AES encryption failed
    EncryptionFailed(String),
    /// AES decryption failed
    DecryptionFailed(String),
    /// Failed to generate secure IV
    IvGenerationFailed(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SerializationError {
    /// Failed to serialize VRF public key
    VrfPublicKeySerialization(String),
    /// Failed to serialize VRF keypair
    VrfKeypairSerialization(String),
    /// Failed to serialize keypair data
    KeypairDataSerialization(String),
    /// Failed to deserialize keypair data
    KeypairDataDeserialization(String),
    /// Failed to deserialize VRF keypair
    VrfKeypairDeserialization(String),
    /// Base64 encoding/decoding errors
    Base64Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum VrfCryptoError {
    /// VRF proof generation failed
    ProofGenerationFailed(String),
    /// VRF verification failed
    VerificationFailed(String),
    /// Invalid VRF input data
    InvalidInput(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MessageError {
    /// Failed to stringify JSON message
    StringifyFailed,
    /// Message is not a valid string
    NotString,
    /// Failed to parse JSON message
    JsonParsingFailed(String),
}

// Display implementations for user-friendly error messages
impl fmt::Display for VrfWorkerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            VrfWorkerError::NoVrfKeypair => {
                write!(f, "No VRF keypair in memory - please generate keypair first")
            }
            VrfWorkerError::VrfNotUnlocked => {
                write!(f, "VRF keypair not unlocked - please login first")
            }
            VrfWorkerError::InvalidPrfOutput(msg) => {
                write!(f, "Invalid PRF output: {}", msg)
            }
            VrfWorkerError::HkdfDerivationFailed(err) => {
                write!(f, "HKDF derivation failed: {}", err)
            }
            VrfWorkerError::AesGcmError(err) => {
                write!(f, "AES-GCM operation failed: {}", err)
            }
            VrfWorkerError::InvalidIvLength { expected, actual } => {
                write!(f, "Invalid IV length for AES-GCM: expected {} bytes, got {} bytes", expected, actual)
            }
            VrfWorkerError::SerializationError(err) => {
                write!(f, "Serialization error: {}", err)
            }
            VrfWorkerError::VrfCryptoError(err) => {
                write!(f, "VRF cryptographic error: {}", err)
            }
            VrfWorkerError::PublicKeyMismatch { expected, actual } => {
                write!(f, "VRF public key mismatch - expected: {}..., actual: {}...",
                    &expected[..20.min(expected.len())],
                    &actual[..20.min(actual.len())])
            }
            VrfWorkerError::MessageParsingError(err) => {
                write!(f, "Message parsing error: {}", err)
            }
            VrfWorkerError::MissingRequiredData(field) => {
                write!(f, "Missing required data: {}", field)
            }
            VrfWorkerError::InvalidMessageFormat(msg) => {
                write!(f, "Invalid message format: {}", msg)
            }
        }
    }
}

impl fmt::Display for HkdfError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            HkdfError::KeyDerivationFailed => write!(f, "HKDF key derivation failed"),
            HkdfError::VrfSeedDerivationFailed => write!(f, "HKDF VRF seed derivation failed"),
        }
    }
}

impl fmt::Display for AesError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AesError::CipherCreationFailed(msg) => write!(f, "Failed to create cipher: {}", msg),
            AesError::EncryptionFailed(msg) => write!(f, "Encryption failed: {}", msg),
            AesError::DecryptionFailed(msg) => write!(f, "Failed to decrypt VRF keypair: {}", msg),
            AesError::IvGenerationFailed(msg) => write!(f, "Failed to generate secure IV: {}", msg),
        }
    }
}

impl fmt::Display for SerializationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SerializationError::VrfPublicKeySerialization(msg) => {
                write!(f, "Failed to serialize VRF public key: {}", msg)
            }
            SerializationError::VrfKeypairSerialization(msg) => {
                write!(f, "Failed to serialize VRF keypair: {}", msg)
            }
            SerializationError::KeypairDataSerialization(msg) => {
                write!(f, "Failed to serialize VRF keypair data: {}", msg)
            }
            SerializationError::KeypairDataDeserialization(msg) => {
                write!(f, "Failed to deserialize keypair data: {}", msg)
            }
            SerializationError::VrfKeypairDeserialization(msg) => {
                write!(f, "Failed to deserialize VRF keypair: {}", msg)
            }
            SerializationError::Base64Error(msg) => {
                write!(f, "Base64 encoding/decoding error: {}", msg)
            }
        }
    }
}

impl fmt::Display for VrfCryptoError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            VrfCryptoError::ProofGenerationFailed(msg) => {
                write!(f, "VRF proof generation failed: {}", msg)
            }
            VrfCryptoError::VerificationFailed(msg) => {
                write!(f, "VRF verification failed: {}", msg)
            }
            VrfCryptoError::InvalidInput(msg) => {
                write!(f, "Invalid VRF input: {}", msg)
            }
        }
    }
}

impl fmt::Display for MessageError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            MessageError::StringifyFailed => write!(f, "Failed to stringify message"),
            MessageError::NotString => write!(f, "Message is not a string"),
            MessageError::JsonParsingFailed(msg) => write!(f, "Failed to parse message: {}", msg),
        }
    }
}

// Standard Error trait implementations
impl std::error::Error for VrfWorkerError {}
impl std::error::Error for HkdfError {}
impl std::error::Error for AesError {}
impl std::error::Error for SerializationError {}
impl std::error::Error for VrfCryptoError {}
impl std::error::Error for MessageError {}

// Conversion helpers for common error types
impl From<serde_json::Error> for VrfWorkerError {
    fn from(err: serde_json::Error) -> Self {
        VrfWorkerError::MessageParsingError(MessageError::JsonParsingFailed(err.to_string()))
    }
}

// Add From<String> implementation to handle string errors
impl From<String> for VrfWorkerError {
    fn from(err: String) -> Self {
        VrfWorkerError::InvalidMessageFormat(err)
    }
}

// Result type alias for convenience
pub type VrfResult<T> = Result<T, VrfWorkerError>;

// Helper functions for creating specific errors
impl VrfWorkerError {
    pub fn empty_prf_output() -> Self {
        VrfWorkerError::InvalidPrfOutput("PRF output cannot be empty".to_string())
    }

    pub fn missing_field(field: &str) -> Self {
        VrfWorkerError::MissingRequiredData(field.to_string())
    }

    pub fn invalid_format(msg: &str) -> Self {
        VrfWorkerError::InvalidMessageFormat(msg.to_string())
    }

    pub fn public_key_mismatch(expected: &str, actual: &str) -> Self {
        VrfWorkerError::PublicKeyMismatch {
            expected: expected.to_string(),
            actual: actual.to_string(),
        }
    }
}
