pub mod handle_check_session_status;
pub mod handle_clear_session;
pub mod handle_confirm_and_prepare_signing_session;
pub mod handle_decrypt_session;
pub mod handle_derive_vrf_keypair_from_prf;
pub mod handle_device2_registration_session;
pub mod handle_dispense_session_key;
pub mod handle_generate_vrf_challenge;
pub mod handle_generate_vrf_keypair_bootstrap;
pub mod handle_mint_session_keys_and_send_to_signer;
pub mod handle_registration_credential_confirmation;
pub mod handle_shamir3pass_client;
pub mod handle_shamir3pass_config;
pub mod handle_shamir3pass_server;
pub mod handle_unlock_vrf_keypair;

pub use handle_check_session_status::*;
pub use handle_clear_session::*;
pub use handle_confirm_and_prepare_signing_session::*;
pub use handle_decrypt_session::*;
pub use handle_derive_vrf_keypair_from_prf::*;
pub use handle_device2_registration_session::*;
pub use handle_dispense_session_key::*;
pub use handle_generate_vrf_challenge::*;
pub use handle_generate_vrf_keypair_bootstrap::*;
pub use handle_mint_session_keys_and_send_to_signer::*;
pub use handle_registration_credential_confirmation::*;
pub use handle_shamir3pass_client::*;
pub use handle_shamir3pass_config::*;
pub use handle_shamir3pass_server::*;
pub use handle_unlock_vrf_keypair::*;

use crate::manager::VRFKeyManager;
use crate::types::VrfWorkerResponse;
use js_sys::Date;
use serde::Serialize;
use std::cell::RefCell;
use std::rc::Rc;

/// Handle PING message
pub fn handle_ping(message_id: Option<String>) -> VrfWorkerResponse {
    #[derive(Serialize)]
    struct PingStatus {
        status: &'static str,
        timestamp: f64,
    }

    VrfWorkerResponse::success_from(
        message_id,
        Some(PingStatus {
            status: "alive",
            timestamp: Date::now(),
        }),
    )
}

/// Handle CHECK_VRF_STATUS message
pub fn handle_check_vrf_status(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
) -> VrfWorkerResponse {
    let manager_ref = manager.borrow();
    let status = manager_ref.get_vrf_status();
    VrfWorkerResponse::success_from(message_id, Some(status))
}

/// Handle CLEAR_VRF message
pub fn handle_logout(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
) -> VrfWorkerResponse {
    let mut manager_mut = manager.borrow_mut();
    match manager_mut.logout() {
        Ok(_) => VrfWorkerResponse::success(message_id, None),
        Err(e) => VrfWorkerResponse::fail(message_id, e.to_string()),
    }
}
