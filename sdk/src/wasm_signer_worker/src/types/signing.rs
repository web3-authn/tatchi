use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SignerMode {
    #[serde(rename = "local-signer")]
    LocalSigner,
    #[serde(rename = "threshold-signer")]
    ThresholdSigner,
}

impl Default for SignerMode {
    fn default() -> Self {
        Self::LocalSigner
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThresholdSignerConfig {
    /// Base URL of the relayer server (e.g. https://relay.example.com)
    pub relayer_url: String,
    /// Identifies which relayer-held key share to use.
    pub relayer_key_id: String,
    /// Optional short-lived authorization token returned by `/threshold-ed25519/authorize`.
    /// When omitted, the signer worker will call `/threshold-ed25519/authorize` on-demand per signature.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mpc_session_id: Option<String>,
}
