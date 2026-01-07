#[cfg(target_arch = "wasm32")]
use crate::encoders::base64_url_decode;
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
    format!(
        "{}|{}|{}",
        cfg.relayer_url.trim_end_matches('/'),
        cfg.relayer_key_id.trim(),
        near_account_id.trim()
    )
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

    match super::relayer_http::authorize_mpc_session_id_with_threshold_session(
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

    match super::relayer_http::authorize_mpc_session_id_with_threshold_session(
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
        return super::relayer_http::authorize_mpc_session_id_with_threshold_session(
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

        if let Ok(sess) = super::relayer_http::mint_threshold_session(
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

        let client_identifier: frost_ed25519::Identifier = 1u16
            .try_into()
            .map_err(|_| "threshold-signer: invalid client identifier".to_string())?;
        let relayer_identifier: frost_ed25519::Identifier = 2u16
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
            use super::relayer_http::{self, CommitmentsWire, SignFinalizeOk};

            let client_verifying_share_b64u = configured.client_verifying_share_b64u.as_str();

            // Prefer a provided mpcSessionId; otherwise authorize via session/cached WebAuthn.
            let signing_payload_json = authorize_signing_payload_json_opt.as_deref();
            let mpc_session_id = resolve_mpc_session_id(
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

            let mut rng = frost_ed25519::rand_core::OsRng;
            let (client_nonces, client_commitments) =
                frost_ed25519::round1::commit(client_key_package.signing_share(), &mut rng);

            let hiding_bytes = client_commitments
                .hiding()
                .serialize()
                .map_err(|e| format!("threshold-signer: serialize hiding commitment: {e}"))?;
            let binding_bytes = client_commitments
                .binding()
                .serialize()
                .map_err(|e| format!("threshold-signer: serialize binding commitment: {e}"))?;

            let client_commitments_wire = CommitmentsWire {
                hiding: crate::encoders::base64_url_encode(&hiding_bytes),
                binding: crate::encoders::base64_url_encode(&binding_bytes),
            };

            let signing_digest_b64u = crate::encoders::base64_url_encode(message);

            let init = relayer_http::sign_init(
                cfg,
                &mpc_session_id,
                near_account_id,
                &signing_digest_b64u,
                client_commitments_wire,
            )
            .await?;
            let signing_session_id = init.signing_session_id;
            let relayer_commitments = init.relayer_commitments;
            let relayer_verifying_share_b64u = init.relayer_verifying_share_b64u;

            let relayer_hiding = base64_url_decode(&relayer_commitments.hiding)?;
            let relayer_binding = base64_url_decode(&relayer_commitments.binding)?;
            let relayer_hiding = frost_ed25519::round1::NonceCommitment::deserialize(
                &relayer_hiding,
            )
            .map_err(|e| format!("threshold-signer: invalid relayer hiding commitment: {e}"))?;
            let relayer_binding = frost_ed25519::round1::NonceCommitment::deserialize(
                &relayer_binding,
            )
            .map_err(|e| format!("threshold-signer: invalid relayer binding commitment: {e}"))?;
            let relayer_commitments =
                frost_ed25519::round1::SigningCommitments::new(relayer_hiding, relayer_binding);

            let mut commitments_map = BTreeMap::new();
            commitments_map.insert(client_identifier, client_commitments);
            commitments_map.insert(relayer_identifier, relayer_commitments);
            let signing_package = frost_ed25519::SigningPackage::new(commitments_map, message);

            let client_sig_share =
                frost_ed25519::round2::sign(&signing_package, &client_nonces, client_key_package)
                    .map_err(|e| format!("threshold-signer: round2 sign failed: {e}"))?;
            let client_sig_share_b64u =
                crate::encoders::base64_url_encode(&client_sig_share.serialize());

            let relayer_sig_share_b64u =
                match relayer_http::sign_finalize(cfg, &signing_session_id, &client_sig_share_b64u)
                    .await?
                {
                    SignFinalizeOk::Signature(signature) => return Ok(signature),
                    SignFinalizeOk::RelayerSignatureShareB64u(b64u) => b64u,
                };
            let relayer_sig_share_bytes = base64_url_decode(&relayer_sig_share_b64u)?;
            let relayer_sig_share =
                frost_ed25519::round2::SignatureShare::deserialize(&relayer_sig_share_bytes)
                    .map_err(|e| {
                        format!("threshold-signer: invalid relayer signature share: {e}")
                    })?;

            let verifying_key = client_key_package.verifying_key().clone();
            let client_verifying_share = client_key_package.verifying_share().clone();
            let relayer_verifying_share_bytes = base64_url_decode(&relayer_verifying_share_b64u)?;
            let relayer_verifying_share =
                frost_ed25519::keys::VerifyingShare::deserialize(&relayer_verifying_share_bytes)
                    .map_err(|e| {
                        format!("threshold-signer: invalid relayer verifying share: {e}")
                    })?;

            let mut verifying_shares = BTreeMap::new();
            verifying_shares.insert(client_identifier, client_verifying_share);
            verifying_shares.insert(relayer_identifier, relayer_verifying_share);
            let pubkey_package =
                frost_ed25519::keys::PublicKeyPackage::new(verifying_shares, verifying_key);

            let mut signature_shares = BTreeMap::new();
            signature_shares.insert(client_identifier, client_sig_share);
            signature_shares.insert(relayer_identifier, relayer_sig_share);

            let group_signature =
                frost_ed25519::aggregate(&signing_package, &signature_shares, &pubkey_package)
                    .map_err(|e| format!("threshold-signer: aggregate failed: {e}"))?;
            let bytes = group_signature
                .serialize()
                .map_err(|e| format!("threshold-signer: signature serialization failed: {e}"))?;
            if bytes.len() != 64 {
                return Err(format!(
                    "threshold-signer: invalid signature length from aggregation: {}",
                    bytes.len()
                ));
            }
            let mut out = [0u8; 64];
            out.copy_from_slice(&bytes);
            Ok(out)
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
