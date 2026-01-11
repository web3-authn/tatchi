use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ThresholdParticipantRole {
    #[serde(rename = "client")]
    Client,
    #[serde(rename = "relayer")]
    Relayer,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ThresholdEd25519ShareDerivationV1 {
    #[serde(rename = "prf_first_v1")]
    PrfFirstV1,
    #[serde(rename = "derived_master_secret_v1")]
    DerivedMasterSecretV1,
    #[serde(rename = "kv_random_v1")]
    KvRandomV1,
    #[serde(rename = "unknown")]
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThresholdEd25519ParticipantV1 {
    /// FROST identifier (1-indexed).
    pub id: u16,
    pub role: ThresholdParticipantRole,
    /// Optional relayer endpoint for this participant (future multi-relayer support).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub relayer_url: Option<String>,
    /// Key/share identifier understood by this participant (e.g. relayerKeyId).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub relayer_key_id: Option<String>,
    /// Base64url-encoded 32-byte verifying share (compressed EdwardsY).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verifying_share_b64u: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub share_derivation: Option<ThresholdEd25519ShareDerivationV1>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ThresholdEd25519ParticipantSetVersion {
    #[serde(rename = "threshold_ed25519_participants_v1")]
    V1,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThresholdEd25519ParticipantSetV1 {
    pub version: ThresholdEd25519ParticipantSetVersion,
    pub group_public_key: String,
    pub participants: Vec<ThresholdEd25519ParticipantV1>,
}
