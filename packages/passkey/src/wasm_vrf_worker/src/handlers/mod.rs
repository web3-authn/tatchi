pub mod handle_shamir3pass_config;
pub mod handle_derive_vrf_keypair_from_prf;
pub mod handle_generate_vrf_challenge;
pub mod handle_generate_vrf_keypair_bootstrap;
pub mod handle_shamir3pass_client;
pub mod handle_shamir3pass_server;
pub mod handle_unlock_vrf_keypair;

pub use handle_shamir3pass_config::*;
pub use handle_derive_vrf_keypair_from_prf::*;
pub use handle_generate_vrf_challenge::*;
pub use handle_generate_vrf_keypair_bootstrap::*;
pub use handle_shamir3pass_server::*;
pub use handle_shamir3pass_client::*;
pub use handle_unlock_vrf_keypair::*;

use std::rc::Rc;
use std::cell::RefCell;
use crate::manager::VRFKeyManager;
use crate::types::VrfWorkerResponse;

/// Handle PING message
pub fn handle_ping(message_id: Option<String>) -> VrfWorkerResponse {
    VrfWorkerResponse::success(
        message_id,
        Some(serde_json::json!({
            "status": "alive",
            "timestamp": js_sys::Date::now()
        }))
    )
}

/// Handle CHECK_VRF_STATUS message
pub fn handle_check_vrf_status(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
) -> VrfWorkerResponse {
    let manager_ref = manager.borrow();
    let status = manager_ref.get_vrf_status();
    VrfWorkerResponse::success(message_id, Some(status))
}

/// Handle LOGOUT message
pub fn handle_logout(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
) -> VrfWorkerResponse {
    let mut manager_mut = manager.borrow_mut();
    match manager_mut.logout() {
        Ok(_) => {
            VrfWorkerResponse::success(message_id, None)
        },
        Err(e) => {
            VrfWorkerResponse::fail(message_id, e.to_string())
        }
    }
}
