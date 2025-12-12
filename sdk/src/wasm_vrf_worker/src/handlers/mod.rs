pub mod handle_derive_vrf_keypair_from_prf;
pub mod handle_generate_vrf_challenge;
pub mod handle_generate_vrf_keypair_bootstrap;
pub mod handle_shamir3pass_client;
pub mod handle_shamir3pass_config;
pub mod handle_shamir3pass_server;
pub mod handle_unlock_vrf_keypair;
pub mod handle_derive_wrap_key_seed_and_session;
pub mod handle_decrypt_session;
pub mod handle_registration_credential_confirmation;
pub mod handle_device2_registration_session;

pub use handle_derive_vrf_keypair_from_prf::*;
pub use handle_generate_vrf_challenge::*;
pub use handle_generate_vrf_keypair_bootstrap::*;
pub use handle_shamir3pass_client::*;
pub use handle_shamir3pass_config::*;
pub use handle_shamir3pass_server::*;
pub use handle_unlock_vrf_keypair::*;
pub use handle_derive_wrap_key_seed_and_session::*;
pub use handle_decrypt_session::*;
pub use handle_registration_credential_confirmation::*;
pub use handle_device2_registration_session::*;

use crate::manager::VRFKeyManager;
use crate::types::VrfWorkerResponse;
use std::cell::RefCell;
use std::rc::Rc;
use serde::Serialize;
use js_sys::Date;

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

/// Handle LOGOUT message
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
