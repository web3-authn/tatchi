use crate::types::ThresholdSignerConfig;

use super::protocol::CommitmentsWire;

pub(super) struct ThresholdEd25519SignInitOk {
    pub(super) signing_session_id: String,
    pub(super) relayer_commitments: CommitmentsWire,
    pub(super) relayer_verifying_share_b64u: String,
}

pub(super) struct ThresholdEd25519SessionMintOk {
    pub(super) expires_at: Option<String>,
    pub(super) jwt: Option<String>,
}

pub(super) trait ThresholdEd25519Transport {
    async fn authorize_mpc_session_id(
        &self,
        cfg: &ThresholdSignerConfig,
        client_verifying_share_b64u: &str,
        near_account_id: &str,
        purpose: &str,
        signing_digest_32: &[u8],
        vrf_challenge: &crate::types::VrfChallenge,
        credential_json: &str,
        signing_payload_json: Option<&str>,
    ) -> Result<String, String>;

    async fn authorize_mpc_session_id_with_threshold_session(
        &self,
        cfg: &ThresholdSignerConfig,
        client_verifying_share_b64u: &str,
        purpose: &str,
        signing_digest_32: &[u8],
        signing_payload_json: Option<&str>,
        bearer_token: Option<&str>,
    ) -> Result<String, String>;

    async fn mint_threshold_session(
        &self,
        cfg: &ThresholdSignerConfig,
        client_verifying_share_b64u: &str,
        near_account_id: &str,
        vrf_challenge: &crate::types::VrfChallenge,
        credential_json: &str,
        session_policy_json: &str,
        session_kind: &str,
    ) -> Result<ThresholdEd25519SessionMintOk, String>;

    async fn sign_init(
        &self,
        cfg: &ThresholdSignerConfig,
        mpc_session_id: &str,
        near_account_id: &str,
        signing_digest_b64u: &str,
        client_commitments: CommitmentsWire,
    ) -> Result<ThresholdEd25519SignInitOk, String>;

    async fn sign_finalize(
        &self,
        cfg: &ThresholdSignerConfig,
        signing_session_id: &str,
        client_signature_share_b64u: &str,
    ) -> Result<String, String>;
}

pub(super) struct HttpThresholdEd25519Transport;

impl ThresholdEd25519Transport for HttpThresholdEd25519Transport {
    async fn authorize_mpc_session_id(
        &self,
        cfg: &ThresholdSignerConfig,
        client_verifying_share_b64u: &str,
        near_account_id: &str,
        purpose: &str,
        signing_digest_32: &[u8],
        vrf_challenge: &crate::types::VrfChallenge,
        credential_json: &str,
        signing_payload_json: Option<&str>,
    ) -> Result<String, String> {
        super::relayer_http::authorize_mpc_session_id(
            cfg,
            client_verifying_share_b64u,
            near_account_id,
            purpose,
            signing_digest_32,
            vrf_challenge,
            credential_json,
            signing_payload_json,
        )
        .await
    }

    async fn authorize_mpc_session_id_with_threshold_session(
        &self,
        cfg: &ThresholdSignerConfig,
        client_verifying_share_b64u: &str,
        purpose: &str,
        signing_digest_32: &[u8],
        signing_payload_json: Option<&str>,
        bearer_token: Option<&str>,
    ) -> Result<String, String> {
        super::relayer_http::authorize_mpc_session_id_with_threshold_session(
            cfg,
            client_verifying_share_b64u,
            purpose,
            signing_digest_32,
            signing_payload_json,
            bearer_token,
        )
        .await
    }

    async fn mint_threshold_session(
        &self,
        cfg: &ThresholdSignerConfig,
        client_verifying_share_b64u: &str,
        near_account_id: &str,
        vrf_challenge: &crate::types::VrfChallenge,
        credential_json: &str,
        session_policy_json: &str,
        session_kind: &str,
    ) -> Result<ThresholdEd25519SessionMintOk, String> {
        let out = super::relayer_http::mint_threshold_session(
            cfg,
            client_verifying_share_b64u,
            near_account_id,
            vrf_challenge,
            credential_json,
            session_policy_json,
            session_kind,
        )
        .await?;

        Ok(ThresholdEd25519SessionMintOk {
            expires_at: out.expires_at,
            jwt: out.jwt,
        })
    }

    async fn sign_init(
        &self,
        cfg: &ThresholdSignerConfig,
        mpc_session_id: &str,
        near_account_id: &str,
        signing_digest_b64u: &str,
        client_commitments: CommitmentsWire,
    ) -> Result<ThresholdEd25519SignInitOk, String> {
        let out = super::relayer_http::sign_init(
            cfg,
            mpc_session_id,
            near_account_id,
            signing_digest_b64u,
            client_commitments,
        )
        .await?;

        Ok(ThresholdEd25519SignInitOk {
            signing_session_id: out.signing_session_id,
            relayer_commitments: out.relayer_commitments,
            relayer_verifying_share_b64u: out.relayer_verifying_share_b64u,
        })
    }

    async fn sign_finalize(
        &self,
        cfg: &ThresholdSignerConfig,
        signing_session_id: &str,
        client_signature_share_b64u: &str,
    ) -> Result<String, String> {
        super::relayer_http::sign_finalize(cfg, signing_session_id, client_signature_share_b64u).await
    }
}
