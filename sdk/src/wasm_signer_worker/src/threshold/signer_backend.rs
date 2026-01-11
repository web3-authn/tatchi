use crate::threshold::participant_ids::{
    normalize_participant_ids, validate_threshold_ed25519_participant_ids_2p,
};
use crate::types::SignerMode;
use crate::types::ThresholdSignerConfig;
use crate::WrapKey;
use ed25519_dalek::Signer;
#[cfg(target_arch = "wasm32")]
use js_sys::Date;
#[cfg(target_arch = "wasm32")]
use std::cell::RefCell;
#[cfg(target_arch = "wasm32")]
use std::collections::BTreeMap;

fn threshold_signer_not_implemented_error() -> String {
    "threshold-signer requires relayer FROST endpoints and threshold key material (client share + relayer share). Use signerMode='local-signer' for now. See docs/threshold-ed25519-near-spec.md."
        .to_string()
}

#[cfg(target_arch = "wasm32")]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ThresholdAuthSessionKind {
    Jwt,
    Cookie,
}

#[cfg(target_arch = "wasm32")]
#[derive(Clone, Debug)]
struct CachedThresholdAuthSession {
    kind: ThresholdAuthSessionKind,
    jwt: Option<String>,
    expires_at_ms: Option<f64>,
}

#[cfg(target_arch = "wasm32")]
thread_local! {
    static THRESHOLD_AUTH_SESSIONS: RefCell<BTreeMap<String, CachedThresholdAuthSession>> =
        RefCell::new(BTreeMap::new());
}

#[cfg(target_arch = "wasm32")]
fn threshold_auth_cache_key(cfg: &ThresholdSignerConfig, near_account_id: &str) -> String {
    let mut out = format!(
        "{}|{}|{}",
        cfg.relayer_url.trim_end_matches('/'),
        cfg.relayer_key_id.trim(),
        near_account_id.trim()
    );

    if let Some(ids) = cfg.participant_ids.as_ref() {
        let mut ids_norm: Vec<u16> = ids.iter().copied().filter(|n| *n > 0).collect();
        ids_norm.sort_unstable();
        ids_norm.dedup();
        if !ids_norm.is_empty() {
            out.push('|');
            out.push_str(
                &ids_norm
                    .iter()
                    .map(|n| n.to_string())
                    .collect::<Vec<_>>()
                    .join(","),
            );
        }
    }

    out
}

#[cfg(target_arch = "wasm32")]
fn normalize_threshold_session_kind(input: Option<&str>) -> ThresholdAuthSessionKind {
    match input.map(|s| s.trim()) {
        Some("cookie") => ThresholdAuthSessionKind::Cookie,
        _ => ThresholdAuthSessionKind::Jwt,
    }
}

#[cfg(target_arch = "wasm32")]
fn trim_nonempty(input: Option<&str>) -> Option<&str> {
    input.map(str::trim).filter(|s| !s.is_empty())
}

#[cfg(target_arch = "wasm32")]
fn is_cached_session_valid(sess: &CachedThresholdAuthSession) -> bool {
    if let Some(expires_at_ms) = sess.expires_at_ms {
        let now = Date::now();
        if now.is_nan() || now >= expires_at_ms {
            return false;
        }
    }
    true
}

#[cfg(target_arch = "wasm32")]
fn get_cached_threshold_auth_session(
    cfg: &ThresholdSignerConfig,
    near_account_id: &str,
) -> Option<CachedThresholdAuthSession> {
    let key = threshold_auth_cache_key(cfg, near_account_id);
    THRESHOLD_AUTH_SESSIONS.with(|m| m.borrow().get(&key).cloned())
}

#[cfg(target_arch = "wasm32")]
fn put_cached_threshold_auth_session(
    cfg: &ThresholdSignerConfig,
    near_account_id: &str,
    session: CachedThresholdAuthSession,
) {
    let key = threshold_auth_cache_key(cfg, near_account_id);
    THRESHOLD_AUTH_SESSIONS.with(|m| {
        m.borrow_mut().insert(key, session);
    });
}

#[cfg(target_arch = "wasm32")]
fn clear_cached_threshold_auth_session(cfg: &ThresholdSignerConfig, near_account_id: &str) {
    let key = threshold_auth_cache_key(cfg, near_account_id);
    THRESHOLD_AUTH_SESSIONS.with(|m| {
        m.borrow_mut().remove(&key);
    });
}

#[cfg(target_arch = "wasm32")]
async fn authorize_mpc_session_id_with_cached_threshold_auth_session_strict(
    transport: &impl super::transport::ThresholdEd25519Transport,
    cfg: &ThresholdSignerConfig,
    client_verifying_share_b64u: &str,
    near_account_id: &str,
    purpose: &str,
    signing_digest_32: &[u8],
    signing_payload_json: Option<&str>,
    sess: CachedThresholdAuthSession,
) -> Result<String, String> {
    if !is_cached_session_valid(&sess) {
        clear_cached_threshold_auth_session(cfg, near_account_id);
        return Err(
            "threshold-signer: relayer threshold session expired; re-authenticate".to_string(),
        );
    }

    let bearer = match sess.kind {
        ThresholdAuthSessionKind::Jwt => sess.jwt.as_deref(),
        ThresholdAuthSessionKind::Cookie => None,
    };

    match transport
        .authorize_mpc_session_id_with_threshold_session(
            cfg,
            client_verifying_share_b64u,
            purpose,
            signing_digest_32,
            signing_payload_json,
            bearer,
        )
        .await
    {
        Ok(id) => Ok(id),
        Err(e) => {
            clear_cached_threshold_auth_session(cfg, near_account_id);
            Err(e)
        }
    }
}

#[cfg(target_arch = "wasm32")]
async fn try_authorize_mpc_session_id_with_cached_threshold_auth_session(
    transport: &impl super::transport::ThresholdEd25519Transport,
    cfg: &ThresholdSignerConfig,
    client_verifying_share_b64u: &str,
    near_account_id: &str,
    purpose: &str,
    signing_digest_32: &[u8],
    signing_payload_json: Option<&str>,
) -> Option<String> {
    let sess = get_cached_threshold_auth_session(cfg, near_account_id)?;
    if !is_cached_session_valid(&sess) {
        clear_cached_threshold_auth_session(cfg, near_account_id);
        return None;
    }

    let bearer = match sess.kind {
        ThresholdAuthSessionKind::Jwt => sess.jwt.as_deref(),
        ThresholdAuthSessionKind::Cookie => None,
    };

    match transport
        .authorize_mpc_session_id_with_threshold_session(
            cfg,
            client_verifying_share_b64u,
            purpose,
            signing_digest_32,
            signing_payload_json,
            bearer,
        )
        .await
    {
        Ok(id) => Some(id),
        Err(_e) => {
            clear_cached_threshold_auth_session(cfg, near_account_id);
            None
        }
    }
}

#[cfg(target_arch = "wasm32")]
async fn resolve_mpc_session_id(
    transport: &impl super::transport::ThresholdEd25519Transport,
    cfg: &ThresholdSignerConfig,
    client_verifying_share_b64u: &str,
    near_account_id: &str,
    purpose: &str,
    signing_digest_32: &[u8],
    signing_payload_json: Option<&str>,
    vrf_challenge_opt: Option<&crate::types::VrfChallenge>,
    credential_json_opt: Option<&str>,
) -> Result<String, String> {
    if let Some(id) = trim_nonempty(cfg.mpc_session_id.as_deref()) {
        return Ok(id.to_string());
    }

    // If the caller provided a threshold session JWT (persisted outside this worker), prefer it
    // over any in-worker cache so session-style authorization works across one-shot signer worker
    // instances.
    if let Some(jwt) = trim_nonempty(cfg.threshold_session_jwt.as_deref()) {
        return transport
            .authorize_mpc_session_id_with_threshold_session(
                cfg,
                client_verifying_share_b64u,
                purpose,
                signing_digest_32,
                signing_payload_json,
                Some(jwt),
            )
            .await;
    }

    // Prefer a cached relayer session token/cookie when available.
    if let Some(sess) = get_cached_threshold_auth_session(cfg, near_account_id) {
        return authorize_mpc_session_id_with_cached_threshold_auth_session_strict(
            transport,
            cfg,
            client_verifying_share_b64u,
            near_account_id,
            purpose,
            signing_digest_32,
            signing_payload_json,
            sess,
        )
        .await;
    }

    // No cached session: require WebAuthn+VRF to mint one (if configured), then authorize per
    // signature.
    let vrf_challenge = vrf_challenge_opt.ok_or_else(|| {
        "threshold-signer: missing vrfChallenge and no cached threshold session token".to_string()
    })?;
    let credential_json = credential_json_opt.ok_or_else(|| {
        "threshold-signer: missing credential and no cached threshold session token".to_string()
    })?;

    // Best-effort session mint when policy JSON is configured.
    if let Some(policy_json) = trim_nonempty(cfg.threshold_session_policy_json.as_deref()) {
        let kind = normalize_threshold_session_kind(cfg.threshold_session_kind.as_deref());
        let kind_str = match kind {
            ThresholdAuthSessionKind::Cookie => "cookie",
            ThresholdAuthSessionKind::Jwt => "jwt",
        };

        if let Ok(sess) = transport
            .mint_threshold_session(
                cfg,
                client_verifying_share_b64u,
                near_account_id,
                vrf_challenge,
                credential_json,
                policy_json,
                kind_str,
            )
            .await
        {
            let expires_at_ms = sess
                .expires_at
                .as_deref()
                .map(Date::parse)
                .filter(|ms| !ms.is_nan());
            let cached = CachedThresholdAuthSession {
                kind,
                jwt: sess
                    .jwt
                    .as_ref()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty()),
                expires_at_ms,
            };
            put_cached_threshold_auth_session(cfg, near_account_id, cached);
        }
    }

    // After session-mint attempt, prefer session authorization if token/cookie is present.
    if let Some(id) = try_authorize_mpc_session_id_with_cached_threshold_auth_session(
        transport,
        cfg,
        client_verifying_share_b64u,
        near_account_id,
        purpose,
        signing_digest_32,
        signing_payload_json,
    )
    .await
    {
        return Ok(id);
    }

    // Fallback: authorize per signature with WebAuthn+VRF.
    transport
        .authorize_mpc_session_id(
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

pub enum Ed25519SignerBackend {
    Local(LocalEd25519Signer),
    Threshold(ThresholdEd25519RelayerSigner),
}

impl Ed25519SignerBackend {
    pub fn from_encrypted_near_private_key(
        signer_mode: SignerMode,
        wrap_key: &WrapKey,
        encrypted_private_key_data: &str,
        encrypted_private_key_chacha20_nonce_b64u: &str,
    ) -> Result<Self, String> {
        match signer_mode {
            SignerMode::LocalSigner => Ok(Self::Local(
                LocalEd25519Signer::from_encrypted_near_private_key(
                    wrap_key,
                    encrypted_private_key_data,
                    encrypted_private_key_chacha20_nonce_b64u,
                )?,
            )),
            SignerMode::ThresholdSigner => Ok(Self::Threshold(
                ThresholdEd25519RelayerSigner::unconfigured(),
            )),
        }
    }

    pub fn from_threshold_signer_config(
        wrap_key: &WrapKey,
        near_account_id: &str,
        near_public_key_str: &str,
        purpose: &str,
        vrf_challenge: Option<crate::types::VrfChallenge>,
        webauthn_authentication_json: Option<String>,
        authorize_signing_payload_json: Option<String>,
        cfg: &ThresholdSignerConfig,
    ) -> Result<Self, String> {
        Ok(Self::Threshold(ThresholdEd25519RelayerSigner::new(
            wrap_key,
            near_account_id,
            near_public_key_str,
            purpose,
            vrf_challenge,
            webauthn_authentication_json,
            authorize_signing_payload_json,
            cfg,
        )?))
    }

    pub fn public_key_bytes(&self) -> Result<[u8; 32], String> {
        match self {
            Self::Local(signer) => Ok(signer.public_key_bytes()),
            Self::Threshold(signer) => signer.public_key_bytes(),
        }
    }

    pub async fn sign(&self, message: &[u8]) -> Result<[u8; 64], String> {
        match self {
            Self::Local(signer) => Ok(signer.sign(message)),
            Self::Threshold(signer) => signer.sign(message).await,
        }
    }
}

pub struct LocalEd25519Signer {
    signing_key: ed25519_dalek::SigningKey,
}

impl LocalEd25519Signer {
    pub fn from_encrypted_near_private_key(
        wrap_key: &WrapKey,
        encrypted_private_key_data: &str,
        encrypted_private_key_chacha20_nonce_b64u: &str,
    ) -> Result<Self, String> {
        let kek = wrap_key.derive_kek()?;
        let decrypted_private_key_str = crate::crypto::decrypt_data_chacha20(
            encrypted_private_key_data,
            encrypted_private_key_chacha20_nonce_b64u,
            &kek,
        )
        .map_err(|e| format!("Failed to decrypt private key: {}", e))?;

        let signing_key = parse_near_private_key_to_signing_key(&decrypted_private_key_str)?;
        Ok(Self { signing_key })
    }

    pub fn public_key_bytes(&self) -> [u8; 32] {
        self.signing_key.verifying_key().to_bytes()
    }

    pub fn sign(&self, message: &[u8]) -> [u8; 64] {
        self.signing_key.sign(message).to_bytes()
    }
}

pub enum ThresholdEd25519RelayerSigner {
    Unconfigured,
    Configured(ThresholdEd25519RelayerSignerConfigured),
}

pub struct ThresholdEd25519RelayerSignerConfigured {
    cfg: ThresholdSignerConfig,
    near_account_id: String,
    near_public_key_bytes: [u8; 32],
    client_verifying_share_b64u: String,
    client_key_package: frost_ed25519::keys::KeyPackage,
    client_identifier: frost_ed25519::Identifier,
    relayer_identifier: frost_ed25519::Identifier,
    purpose: String,
    vrf_challenge: Option<crate::types::VrfChallenge>,
    webauthn_authentication_json: Option<String>,
    authorize_signing_payload_json: Option<String>,
}

impl ThresholdEd25519RelayerSigner {
    pub fn unconfigured() -> Self {
        Self::Unconfigured
    }

    pub fn public_key_bytes(&self) -> Result<[u8; 32], String> {
        match self {
            Self::Unconfigured => Err(threshold_signer_not_implemented_error()),
            Self::Configured(cfg) => Ok(cfg.near_public_key_bytes),
        }
    }

    pub fn new(
        wrap_key: &WrapKey,
        near_account_id: &str,
        near_public_key_str: &str,
        purpose: &str,
        vrf_challenge: Option<crate::types::VrfChallenge>,
        webauthn_authentication_json: Option<String>,
        authorize_signing_payload_json: Option<String>,
        cfg: &ThresholdSignerConfig,
    ) -> Result<Self, String> {
        let relayer_url = cfg.relayer_url.trim();
        let relayer_key_id = cfg.relayer_key_id.trim();
        if relayer_url.is_empty() {
            return Err("threshold-signer: missing relayerUrl".to_string());
        }
        if relayer_key_id.is_empty() {
            return Err("threshold-signer: missing relayerKeyId".to_string());
        }
        let purpose = purpose.trim();
        if purpose.is_empty() {
            return Err("threshold-signer: missing purpose".to_string());
        }

        let participant_ids_norm = normalize_participant_ids(cfg.participant_ids.as_ref());

        let normalized_mpc_session_id = cfg
            .mpc_session_id
            .as_ref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        // If we don't have an externally provided mpcSessionId, we must have enough context to
        // authorize per signature. This may be either:
        // - a WebAuthn+VRF payload (for per-signature or session-mint), or
        // - a cached threshold auth session token/cookie (session-style).
        //
        // signingPayload is always required so the relayer can recompute digests server-side.
        if normalized_mpc_session_id.is_none()
            && authorize_signing_payload_json
                .as_ref()
                .map(|s| s.trim().is_empty())
                .unwrap_or(true)
        {
            return Err(
                "threshold-signer: missing signingPayload (required to authorize)".to_string(),
            );
        }

        let near_public_key_bytes = parse_near_public_key_to_bytes(near_public_key_str)?;

        let client_id_opt = cfg.client_participant_id.filter(|n| *n > 0);
        let relayer_id_opt = cfg.relayer_participant_id.filter(|n| *n > 0);
        let (client_id, relayer_id) = validate_threshold_ed25519_participant_ids_2p(
            client_id_opt,
            relayer_id_opt,
            &participant_ids_norm,
        )?;

        let client_identifier: frost_ed25519::Identifier = client_id
            .try_into()
            .map_err(|_| "threshold-signer: invalid client identifier".to_string())?;
        let relayer_identifier: frost_ed25519::Identifier = relayer_id
            .try_into()
            .map_err(|_| "threshold-signer: invalid relayer identifier".to_string())?;

        let key_package = derive_client_key_package_from_wrap_key_seed(
            wrap_key,
            near_account_id,
            &near_public_key_bytes,
            client_identifier,
        )?;
        let client_verifying_share_b64u = crate::threshold::threshold_client_share::derive_threshold_client_verifying_share_b64u_v1(
            wrap_key,
            near_account_id,
        )?;

        let mut cfg_norm = cfg.clone();
        cfg_norm.mpc_session_id = normalized_mpc_session_id.clone();

        Ok(Self::Configured(ThresholdEd25519RelayerSignerConfigured {
            cfg: cfg_norm,
            near_account_id: near_account_id.to_string(),
            near_public_key_bytes,
            client_verifying_share_b64u,
            client_key_package: key_package,
            client_identifier,
            relayer_identifier,
            purpose: purpose.to_string(),
            vrf_challenge,
            webauthn_authentication_json,
            authorize_signing_payload_json,
        }))
    }

    pub async fn sign(&self, message: &[u8]) -> Result<[u8; 64], String> {
        let configured = match self {
            Self::Unconfigured => return Err(threshold_signer_not_implemented_error()),
            Self::Configured(cfg) => cfg,
        };

        let cfg = &configured.cfg;
        let near_account_id = configured.near_account_id.as_str();
        let purpose = configured.purpose.as_str();
        let client_key_package = &configured.client_key_package;
        let client_identifier = configured.client_identifier;
        let relayer_identifier = configured.relayer_identifier;
        let vrf_challenge_opt = &configured.vrf_challenge;
        let webauthn_authentication_json_opt = &configured.webauthn_authentication_json;
        let authorize_signing_payload_json_opt = &configured.authorize_signing_payload_json;

        if message.len() != 32 {
            return Err(format!(
                "threshold-signer: signing digest must be 32 bytes, got {}",
                message.len()
            ));
        }

        #[cfg(not(target_arch = "wasm32"))]
        {
            let _ = cfg;
            let _ = near_account_id;
            let _ = configured.client_verifying_share_b64u.as_str();
            let _ = purpose;
            let _ = client_key_package;
            let _ = client_identifier;
            let _ = relayer_identifier;
            let _ = vrf_challenge_opt;
            let _ = webauthn_authentication_json_opt;
            let _ = authorize_signing_payload_json_opt;
            let _ = message;
            return Err("threshold-signer is only supported in wasm32 builds".to_string());
        }

        #[cfg(target_arch = "wasm32")]
        {
            use super::coordinator;
            use super::transport::HttpThresholdEd25519Transport;

            let client_verifying_share_b64u = configured.client_verifying_share_b64u.as_str();
            let transport = HttpThresholdEd25519Transport;

            // Prefer a provided mpcSessionId; otherwise authorize via session/cached WebAuthn.
            let signing_payload_json = authorize_signing_payload_json_opt.as_deref();
            let mpc_session_id = resolve_mpc_session_id(
                &transport,
                cfg,
                client_verifying_share_b64u,
                near_account_id,
                purpose,
                message,
                signing_payload_json,
                vrf_challenge_opt.as_ref(),
                webauthn_authentication_json_opt.as_deref(),
            )
            .await?;

            coordinator::sign_ed25519_2p_v1(
                &transport,
                cfg,
                &mpc_session_id,
                near_account_id,
                message,
                client_key_package,
                client_identifier,
                relayer_identifier,
            )
            .await
        }
    }
}

fn parse_near_private_key_to_signing_key(
    private_key: &str,
) -> Result<ed25519_dalek::SigningKey, String> {
    let decoded = bs58::decode(private_key.strip_prefix("ed25519:").unwrap_or(private_key))
        .into_vec()
        .map_err(|e| format!("Invalid private key base58: {}", e))?;

    if decoded.len() < 32 {
        return Err("Decoded private key too short".to_string());
    }

    let secret_bytes: [u8; 32] = decoded[0..32]
        .try_into()
        .map_err(|_| "Invalid secret key length".to_string())?;

    Ok(ed25519_dalek::SigningKey::from_bytes(&secret_bytes))
}

fn parse_near_public_key_to_bytes(public_key: &str) -> Result<[u8; 32], String> {
    let decoded = bs58::decode(public_key.strip_prefix("ed25519:").unwrap_or(public_key))
        .into_vec()
        .map_err(|e| format!("Invalid public key base58: {}", e))?;
    if decoded.len() != 32 {
        return Err(format!(
            "Invalid public key length: expected 32 bytes, got {}",
            decoded.len()
        ));
    }
    Ok(decoded.as_slice().try_into().expect("checked length above"))
}

fn derive_client_key_package_from_wrap_key_seed(
    wrap_key: &WrapKey,
    near_account_id: &str,
    near_public_key_bytes: &[u8; 32],
    client_identifier: frost_ed25519::Identifier,
) -> Result<frost_ed25519::keys::KeyPackage, String> {
    let signing_share_bytes =
        crate::threshold::threshold_client_share::derive_threshold_client_signing_share_bytes_v1(
            wrap_key,
            near_account_id,
        )?;
    let signing_share = frost_ed25519::keys::SigningShare::deserialize(&signing_share_bytes)
        .map_err(|e| format!("threshold-signer: invalid derived signing share: {e}"))?;

    let verifying_share_bytes =
        crate::threshold::threshold_client_share::derive_threshold_client_verifying_share_bytes_v1(
            wrap_key,
            near_account_id,
        )?;
    let verifying_share = frost_ed25519::keys::VerifyingShare::deserialize(&verifying_share_bytes)
        .map_err(|e| format!("threshold-signer: invalid verifying share: {e}"))?;

    let verifying_key = frost_ed25519::VerifyingKey::deserialize(near_public_key_bytes)
        .map_err(|e| format!("threshold-signer: invalid group public key: {e}"))?;

    Ok(frost_ed25519::keys::KeyPackage::new(
        client_identifier,
        signing_share,
        verifying_share,
        verifying_key,
        2, // min_signers (2-of-2)
    ))
}
