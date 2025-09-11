
pub mod confirm_tx_details;
pub mod handle_check_can_register_user;
pub mod handle_decrypt_private_key_with_prf;
pub mod handle_derive_near_keypair_and_encrypt;
pub mod handle_extract_cose_public_key;
pub mod handle_recover_keypair_from_passkey;
pub mod handle_sign_nep413_message;
pub mod handle_sign_transaction_with_keypair;
pub mod handle_sign_transactions_with_actions;
pub mod handle_sign_verify_and_register_user;
pub mod handle_request_registration_credential_confirmation;

// Handler functions
pub use handle_check_can_register_user::handle_check_can_register_user;
pub use handle_decrypt_private_key_with_prf::handle_decrypt_private_key_with_prf;
pub use handle_derive_near_keypair_and_encrypt::handle_derive_near_keypair_and_encrypt;
pub use handle_extract_cose_public_key::handle_extract_cose_public_key;
pub use handle_recover_keypair_from_passkey::handle_recover_keypair_from_passkey;
pub use handle_sign_nep413_message::handle_sign_nep413_message;
pub use handle_sign_transaction_with_keypair::handle_sign_transaction_with_keypair;
pub use handle_sign_transactions_with_actions::handle_sign_transactions_with_actions;
pub use handle_sign_verify_and_register_user::handle_sign_verify_and_register_user;
pub use handle_request_registration_credential_confirmation::handle_request_registration_credential_confirmation;

// Request/Result types
pub use handle_check_can_register_user::{
    CheckCanRegisterUserRequest,
    RegistrationCheckRequest,
    RegistrationCheckResult,
};
pub use handle_sign_verify_and_register_user::RegistrationInfoStruct;
pub use handle_extract_cose_public_key::{
    ExtractCoseRequest,
    CoseExtractionResult
};
pub use handle_recover_keypair_from_passkey::{
    RecoverKeypairRequest,
    RecoverKeypairResult
};
pub use handle_sign_nep413_message::{
    SignNep413Request,
    SignNep413Result
};
pub use handle_sign_transaction_with_keypair::SignTransactionWithKeyPairRequest;
pub use handle_sign_transactions_with_actions::{
    SignTransactionsWithActionsRequest,
    TransactionPayload,
    KeyActionResult
};
pub use handle_sign_verify_and_register_user::{
    SignVerifyAndRegisterUserRequest,
    RegistrationResult
};
pub use handle_request_registration_credential_confirmation::{
    RegistrationCredentialConfirmationRequest,
    RegistrationCredentialConfirmationResult,
};

// Transaction confirmation utilities
pub use confirm_tx_details::{
    ConfirmationResult,
    request_user_confirmation,
    request_user_confirmation_with_config,
    generate_request_id,
    create_transaction_summary,
    compute_intent_digest_from_js_inputs
};

// Confirmation configuration types (from types module)
pub use crate::types::handlers::{
    ConfirmationConfig,
    ConfirmationUIMode,
    ConfirmationBehavior,
};




