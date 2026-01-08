use crate::fetch::{
    build_json_post_init, fetch_with_init, response_json, response_ok, response_status,
    response_status_text, response_text,
};
use crate::types::ThresholdSignerConfig;
use js_sys::{Object, Reflect};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use wasm_bindgen::JsValue;
use super::protocol::CommitmentsWire;

#[derive(Debug, Clone)]
pub(super) struct SignInitOk {
    pub(super) signing_session_id: String,
    pub(super) relayer_commitments: CommitmentsWire,
    pub(super) relayer_verifying_share_b64u: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthorizeResponse {
    ok: bool,
    code: Option<String>,
    message: Option<String>,
    mpc_session_id: Option<String>,
    expires_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
#[serde(rename_all = "camelCase")]
pub(super) struct ThresholdSessionResponse {
    pub(super) ok: bool,
    pub(super) code: Option<String>,
    pub(super) message: Option<String>,
    pub(super) session_id: Option<String>,
    pub(super) expires_at: Option<String>,
    pub(super) remaining_uses: Option<u32>,
    pub(super) jwt: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SignInitRequest<'a> {
    #[serde(rename = "mpcSessionId")]
    mpc_session_id: &'a str,
    #[serde(rename = "relayerKeyId")]
    relayer_key_id: &'a str,
    #[serde(rename = "nearAccountId")]
    near_account_id: &'a str,
    #[serde(rename = "signingDigestB64u")]
    signing_digest_b64u: &'a str,
    #[serde(rename = "clientCommitments")]
    client_commitments: CommitmentsWire,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SignInitResponse {
    ok: bool,
    code: Option<String>,
    message: Option<String>,
    signing_session_id: Option<String>,
    commitments_by_id: Option<BTreeMap<String, CommitmentsWire>>,
    relayer_verifying_shares_by_id: Option<BTreeMap<String, String>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SignFinalizeRequest<'a> {
    signing_session_id: &'a str,
    #[serde(rename = "clientSignatureShareB64u")]
    client_signature_share_b64u: &'a str,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SignFinalizeResponse {
    ok: bool,
    code: Option<String>,
    message: Option<String>,
    relayer_signature_shares_by_id: Option<BTreeMap<String, String>>,
}

fn bytes_to_js_array(bytes: &[u8]) -> js_sys::Array {
    let arr = js_sys::Array::new();
    for b in bytes {
        arr.push(&JsValue::from_f64(*b as f64));
    }
    arr
}

fn to_json_string<T: Serialize>(val: &T) -> Result<String, String> {
    let js_val = serde_wasm_bindgen::to_value(val)
        .map_err(|e| format!("threshold-signer: failed to serialize request: {e}"))?;
    js_sys::JSON::stringify(&js_val)
        .map_err(|e| format!("threshold-signer: JSON.stringify failed: {:?}", e))?
        .as_string()
        .ok_or_else(|| "threshold-signer: JSON.stringify did not return a string".to_string())
}

fn set_authorization_header(init: &JsValue, token: &str) -> Result<(), String> {
    let headers_val = Reflect::get(init, &JsValue::from_str("headers"))
        .map_err(|_| "threshold-signer: failed to read fetch init.headers".to_string())?;
    if !headers_val.is_object() {
        return Err("threshold-signer: fetch init.headers is not an object".to_string());
    }
    Reflect::set(
        &headers_val,
        &JsValue::from_str("Authorization"),
        &JsValue::from_str(&format!("Bearer {}", token.trim())),
    )
    .map_err(|_| "threshold-signer: failed to set Authorization header".to_string())?;
    Ok(())
}

async fn post_json(
    cfg: &ThresholdSignerConfig,
    path: &str,
    body: &str,
    label: &str,
    bearer_token: Option<&str>,
) -> Result<JsValue, String> {
    let url = format!(
        "{}/{}",
        cfg.relayer_url.trim_end_matches('/'),
        path.trim_start_matches('/')
    );
    let init = build_json_post_init(body)?;
    if let Some(token) = bearer_token {
        set_authorization_header(&init, token)?;
    }
    let resp = fetch_with_init(&url, &init).await?;

    if !response_ok(&resp)? {
        let status = response_status(&resp).unwrap_or(0);
        let status_text = response_status_text(&resp).unwrap_or_default();
        let body = response_text(&resp).await.unwrap_or_default();
        return Err(format!(
            "threshold-signer: {label} HTTP {} {}: {}",
            status, status_text, body
        ));
    }

    response_json(&resp).await
}

fn resolve_relayer_participant_id(cfg: &ThresholdSignerConfig) -> u16 {
    if let Some(id) = cfg.relayer_participant_id {
        return id;
    }

    let client_id = cfg.client_participant_id;
    if let Some(ids) = cfg.participant_ids.as_ref().filter(|ids| ids.len() == 2) {
        if let Some(cid) = client_id {
            if let Some(other) = ids.iter().find(|id| **id != cid) {
                return *other;
            }
        }

        if ids[0] == 1 && ids[1] != 1 {
            return ids[1];
        }
        if ids[1] == 1 && ids[0] != 1 {
            return ids[0];
        }

        if let Some(max) = ids.iter().max() {
            return *max;
        }
    }

    2
}

fn build_authorize_body(
    cfg: &ThresholdSignerConfig,
    client_verifying_share_b64u: &str,
    purpose: &str,
    signing_digest_32: &[u8],
    signing_payload_json: Option<&str>,
    vrf_data_val: Option<JsValue>,
    webauthn_val: Option<JsValue>,
) -> Result<String, String> {
    let auth_obj = Object::new();
    Reflect::set(
        &auth_obj,
        &JsValue::from_str("relayerKeyId"),
        &JsValue::from_str(cfg.relayer_key_id.trim()),
    )
    .map_err(|_| "threshold-signer: failed to set authorize.relayerKeyId".to_string())?;
    Reflect::set(
        &auth_obj,
        &JsValue::from_str("clientVerifyingShareB64u"),
        &JsValue::from_str(client_verifying_share_b64u.trim()),
    )
    .map_err(|_| "threshold-signer: failed to set authorize.clientVerifyingShareB64u".to_string())?;
    Reflect::set(
        &auth_obj,
        &JsValue::from_str("purpose"),
        &JsValue::from_str(purpose),
    )
    .map_err(|_| "threshold-signer: failed to set authorize.purpose".to_string())?;
    Reflect::set(
        &auth_obj,
        &JsValue::from_str("signing_digest_32"),
        &bytes_to_js_array(signing_digest_32).into(),
    )
    .map_err(|_| "threshold-signer: failed to set authorize.signing_digest_32".to_string())?;

    if let Some(vrf_data_val) = vrf_data_val {
        Reflect::set(&auth_obj, &JsValue::from_str("vrf_data"), &vrf_data_val)
            .map_err(|_| "threshold-signer: failed to set authorize.vrf_data".to_string())?;
    }
    if let Some(webauthn_val) = webauthn_val {
        Reflect::set(
            &auth_obj,
            &JsValue::from_str("webauthn_authentication"),
            &webauthn_val,
        )
        .map_err(|_| {
            "threshold-signer: failed to set authorize.webauthn_authentication".to_string()
        })?;
    }

    if let Some(payload_json) = signing_payload_json
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
    {
        let payload_val = js_sys::JSON::parse(&payload_json)
            .map_err(|_| "threshold-signer: invalid signingPayload JSON".to_string())?;
        Reflect::set(
            &auth_obj,
            &JsValue::from_str("signingPayload"),
            &payload_val,
        )
        .map_err(|_| "threshold-signer: failed to set authorize.signingPayload".to_string())?;
    }

    js_sys::JSON::stringify(&auth_obj.into())
        .map_err(|e| format!("threshold-signer: JSON.stringify failed: {:?}", e))?
        .as_string()
        .ok_or_else(|| "threshold-signer: JSON.stringify did not return a string".to_string())
}

fn build_contract_vrf_data(vrf_challenge: &crate::types::VrfChallenge) -> Result<JsValue, String> {
    let vrf_input_data = crate::encoders::base64_url_decode(vrf_challenge.vrf_input.trim())?;
    let vrf_output = crate::encoders::base64_url_decode(vrf_challenge.vrf_output.trim())?;
    let vrf_proof = crate::encoders::base64_url_decode(vrf_challenge.vrf_proof.trim())?;
    let public_key = crate::encoders::base64_url_decode(vrf_challenge.vrf_public_key.trim())?;
    let block_hash = crate::encoders::base64_url_decode(vrf_challenge.block_hash.trim())?;
    let intent_digest_b64u = vrf_challenge
        .intent_digest
        .as_deref()
        .ok_or_else(|| "threshold-signer: missing vrfChallenge.intentDigest".to_string())?;
    let intent_digest_32 = crate::encoders::base64_url_decode(intent_digest_b64u.trim())?;
    if intent_digest_32.len() != 32 {
        return Err(format!(
            "threshold-signer: vrfChallenge.intentDigest must decode to 32 bytes, got {}",
            intent_digest_32.len()
        ));
    }
    let session_policy_digest_32 = match vrf_challenge.session_policy_digest_32.as_deref() {
        Some(b64u) if !b64u.trim().is_empty() => {
            let bytes = crate::encoders::base64_url_decode(b64u.trim())?;
            if bytes.len() != 32 {
                return Err(format!(
                    "threshold-signer: vrfChallenge.sessionPolicyDigest32 must decode to 32 bytes, got {}",
                    bytes.len()
                ));
            }
            Some(bytes)
        }
        _ => None,
    };

    let block_height: u64 = vrf_challenge
        .block_height
        .trim()
        .parse()
        .map_err(|e| format!("threshold-signer: invalid vrfChallenge.blockHeight: {e}"))?;

    let vrf_data_obj = Object::new();
    Reflect::set(
        &vrf_data_obj,
        &JsValue::from_str("vrf_input_data"),
        &bytes_to_js_array(&vrf_input_data).into(),
    )
    .map_err(|_| "threshold-signer: failed to set vrf_data.vrf_input_data".to_string())?;
    Reflect::set(
        &vrf_data_obj,
        &JsValue::from_str("vrf_output"),
        &bytes_to_js_array(&vrf_output).into(),
    )
    .map_err(|_| "threshold-signer: failed to set vrf_data.vrf_output".to_string())?;
    Reflect::set(
        &vrf_data_obj,
        &JsValue::from_str("vrf_proof"),
        &bytes_to_js_array(&vrf_proof).into(),
    )
    .map_err(|_| "threshold-signer: failed to set vrf_data.vrf_proof".to_string())?;
    Reflect::set(
        &vrf_data_obj,
        &JsValue::from_str("public_key"),
        &bytes_to_js_array(&public_key).into(),
    )
    .map_err(|_| "threshold-signer: failed to set vrf_data.public_key".to_string())?;
    Reflect::set(
        &vrf_data_obj,
        &JsValue::from_str("user_id"),
        &JsValue::from_str(vrf_challenge.user_id.trim()),
    )
    .map_err(|_| "threshold-signer: failed to set vrf_data.user_id".to_string())?;
    Reflect::set(
        &vrf_data_obj,
        &JsValue::from_str("rp_id"),
        &JsValue::from_str(vrf_challenge.rp_id.trim()),
    )
    .map_err(|_| "threshold-signer: failed to set vrf_data.rp_id".to_string())?;
    Reflect::set(
        &vrf_data_obj,
        &JsValue::from_str("block_height"),
        &JsValue::from_f64(block_height as f64),
    )
    .map_err(|_| "threshold-signer: failed to set vrf_data.block_height".to_string())?;
    Reflect::set(
        &vrf_data_obj,
        &JsValue::from_str("block_hash"),
        &bytes_to_js_array(&block_hash).into(),
    )
    .map_err(|_| "threshold-signer: failed to set vrf_data.block_hash".to_string())?;
    Reflect::set(
        &vrf_data_obj,
        &JsValue::from_str("intent_digest_32"),
        &bytes_to_js_array(&intent_digest_32).into(),
    )
    .map_err(|_| "threshold-signer: failed to set vrf_data.intent_digest_32".to_string())?;
    if let Some(bytes) = session_policy_digest_32.as_deref() {
        Reflect::set(
            &vrf_data_obj,
            &JsValue::from_str("session_policy_digest_32"),
            &bytes_to_js_array(bytes).into(),
        )
        .map_err(|_| {
            "threshold-signer: failed to set vrf_data.session_policy_digest_32".to_string()
        })?;
    }

    Ok(vrf_data_obj.into())
}

pub(super) async fn authorize_mpc_session_id(
    cfg: &ThresholdSignerConfig,
    client_verifying_share_b64u: &str,
    near_account_id: &str,
    purpose: &str,
    signing_digest_32: &[u8],
    vrf_challenge: &crate::types::VrfChallenge,
    credential_json: &str,
    signing_payload_json: Option<&str>,
) -> Result<String, String> {
    if vrf_challenge.user_id.trim() != near_account_id.trim() {
        return Err(
            "threshold-signer: vrfChallenge.userId does not match nearAccountId".to_string(),
        );
    }

    let cred_js = js_sys::JSON::parse(credential_json)
        .map_err(|e| format!("threshold-signer: invalid credential JSON: {:?}", e))?;
    let webauthn: crate::types::WebAuthnAuthenticationCredential =
        serde_wasm_bindgen::from_value(cred_js)
            .map_err(|e| format!("threshold-signer: invalid webauthn_authentication: {e}"))?;
    let webauthn_val = serde_wasm_bindgen::to_value(&webauthn).map_err(|e| {
        format!("threshold-signer: failed to serialize webauthn_authentication: {e}")
    })?;

    let vrf_data_val = build_contract_vrf_data(vrf_challenge)?;
    let auth_body = build_authorize_body(
        cfg,
        client_verifying_share_b64u,
        purpose,
        signing_digest_32,
        signing_payload_json,
        Some(vrf_data_val),
        Some(webauthn_val),
    )?;

    let auth_json = post_json(
        cfg,
        "/threshold-ed25519/authorize",
        &auth_body,
        "/authorize",
        None,
    )
    .await?;
    let auth: AuthorizeResponse = serde_wasm_bindgen::from_value(auth_json)
        .map_err(|e| format!("threshold-signer: failed to parse /authorize response: {e}"))?;

    if !auth.ok {
        let mut msg = auth.message.clone().unwrap_or_else(|| {
            format!(
                "threshold-signer: /authorize failed ({})",
                auth.code.unwrap_or_default()
            )
        });
        if let Some(expires) = auth.expires_at {
            msg = format!("{msg} (expiresAt={expires})");
        }
        return Err(msg);
    }

    auth.mpc_session_id
        .clone()
        .ok_or_else(|| "threshold-signer: /authorize missing mpcSessionId".to_string())
}

pub(super) async fn authorize_mpc_session_id_with_threshold_session(
    cfg: &ThresholdSignerConfig,
    client_verifying_share_b64u: &str,
    purpose: &str,
    signing_digest_32: &[u8],
    signing_payload_json: Option<&str>,
    bearer_token: Option<&str>,
) -> Result<String, String> {
    let auth_body = build_authorize_body(
        cfg,
        client_verifying_share_b64u,
        purpose,
        signing_digest_32,
        signing_payload_json,
        None,
        None,
    )?;
    let auth_json = post_json(
        cfg,
        "/threshold-ed25519/authorize",
        &auth_body,
        "/authorize",
        bearer_token,
    )
    .await?;
    let auth: AuthorizeResponse = serde_wasm_bindgen::from_value(auth_json)
        .map_err(|e| format!("threshold-signer: failed to parse /authorize response: {e}"))?;

    if !auth.ok {
        let mut msg = auth.message.clone().unwrap_or_else(|| {
            format!(
                "threshold-signer: /authorize failed ({})",
                auth.code.unwrap_or_default()
            )
        });
        if let Some(expires) = auth.expires_at {
            msg = format!("{msg} (expiresAt={expires})");
        }
        return Err(msg);
    }

    auth.mpc_session_id
        .clone()
        .ok_or_else(|| "threshold-signer: /authorize missing mpcSessionId".to_string())
}

pub(super) async fn mint_threshold_session(
    cfg: &ThresholdSignerConfig,
    client_verifying_share_b64u: &str,
    near_account_id: &str,
    vrf_challenge: &crate::types::VrfChallenge,
    credential_json: &str,
    session_policy_json: &str,
    session_kind: &str,
) -> Result<ThresholdSessionResponse, String> {
    if vrf_challenge.user_id.trim() != near_account_id.trim() {
        return Err(
            "threshold-signer: vrfChallenge.userId does not match nearAccountId".to_string(),
        );
    }

    let cred_js = js_sys::JSON::parse(credential_json)
        .map_err(|e| format!("threshold-signer: invalid credential JSON: {:?}", e))?;
    let webauthn: crate::types::WebAuthnAuthenticationCredential =
        serde_wasm_bindgen::from_value(cred_js)
            .map_err(|e| format!("threshold-signer: invalid webauthn_authentication: {e}"))?;
    let webauthn_val = serde_wasm_bindgen::to_value(&webauthn).map_err(|e| {
        format!("threshold-signer: failed to serialize webauthn_authentication: {e}")
    })?;

    let vrf_data_val = build_contract_vrf_data(vrf_challenge)?;

    let policy_val = js_sys::JSON::parse(session_policy_json)
        .map_err(|_| "threshold-signer: invalid thresholdSessionPolicyJson".to_string())?;

    let body_obj = Object::new();
    Reflect::set(
        &body_obj,
        &JsValue::from_str("relayerKeyId"),
        &JsValue::from_str(cfg.relayer_key_id.trim()),
    )
    .map_err(|_| "threshold-signer: failed to set session.relayerKeyId".to_string())?;
    Reflect::set(
        &body_obj,
        &JsValue::from_str("clientVerifyingShareB64u"),
        &JsValue::from_str(client_verifying_share_b64u.trim()),
    )
    .map_err(|_| "threshold-signer: failed to set session.clientVerifyingShareB64u".to_string())?;
    Reflect::set(&body_obj, &JsValue::from_str("sessionPolicy"), &policy_val)
        .map_err(|_| "threshold-signer: failed to set session.sessionPolicy".to_string())?;
    Reflect::set(&body_obj, &JsValue::from_str("vrf_data"), &vrf_data_val)
        .map_err(|_| "threshold-signer: failed to set session.vrf_data".to_string())?;
    Reflect::set(
        &body_obj,
        &JsValue::from_str("webauthn_authentication"),
        &webauthn_val,
    )
    .map_err(|_| "threshold-signer: failed to set session.webauthn_authentication".to_string())?;
    Reflect::set(
        &body_obj,
        &JsValue::from_str("sessionKind"),
        &JsValue::from_str(session_kind),
    )
    .map_err(|_| "threshold-signer: failed to set session.sessionKind".to_string())?;

    let body = js_sys::JSON::stringify(&body_obj.into())
        .map_err(|e| format!("threshold-signer: JSON.stringify failed: {:?}", e))?
        .as_string()
        .ok_or_else(|| "threshold-signer: JSON.stringify did not return a string".to_string())?;

    let resp_json = post_json(cfg, "/threshold-ed25519/session", &body, "/session", None).await?;
    let resp: ThresholdSessionResponse = serde_wasm_bindgen::from_value(resp_json)
        .map_err(|e| format!("threshold-signer: failed to parse /session response: {e}"))?;

    if !resp.ok {
        return Err(resp.message.clone().unwrap_or_else(|| {
            format!(
                "threshold-signer: /session failed ({})",
                resp.code.unwrap_or_default()
            )
        }));
    }

    Ok(resp)
}

pub(super) async fn sign_init(
    cfg: &ThresholdSignerConfig,
    mpc_session_id: &str,
    near_account_id: &str,
    signing_digest_b64u: &str,
    client_commitments: CommitmentsWire,
) -> Result<SignInitOk, String> {
    let init_req = SignInitRequest {
        mpc_session_id,
        relayer_key_id: cfg.relayer_key_id.trim(),
        near_account_id,
        signing_digest_b64u,
        client_commitments,
    };

    let init_body = to_json_string(&init_req)?;

    let init_json = post_json(cfg, "/threshold-ed25519/sign/init", &init_body, "/sign/init", None)
        .await?;
    let init: SignInitResponse = serde_wasm_bindgen::from_value(init_json)
        .map_err(|e| format!("threshold-signer: failed to parse /sign/init response: {e}"))?;

    if !init.ok {
        return Err(init.message.clone().unwrap_or_else(|| {
            format!(
                "threshold-signer: /sign/init failed ({})",
                init.code.unwrap_or_default()
            )
        }));
    }

    let signing_session_id = init.signing_session_id.clone().ok_or_else(|| {
        "threshold-signer: /sign/init missing signingSessionId".to_string()
    })?;
    let relayer_id = resolve_relayer_participant_id(cfg).to_string();
    let commitments_by_id = init.commitments_by_id.ok_or_else(|| {
        "threshold-signer: /sign/init missing commitmentsById".to_string()
    })?;
    let relayer_commitments = commitments_by_id.get(&relayer_id).cloned().ok_or_else(|| {
        format!(
            "threshold-signer: /sign/init missing commitmentsById[{}]",
            relayer_id
        )
    })?;
    let verifying_by_id = init.relayer_verifying_shares_by_id.ok_or_else(|| {
        "threshold-signer: /sign/init missing relayerVerifyingSharesById".to_string()
    })?;
    let relayer_verifying_share_b64u = verifying_by_id.get(&relayer_id).cloned().ok_or_else(|| {
        format!(
            "threshold-signer: /sign/init missing relayerVerifyingSharesById[{}]",
            relayer_id
        )
    })?;

    Ok(SignInitOk {
        signing_session_id,
        relayer_commitments,
        relayer_verifying_share_b64u,
    })
}

pub(super) async fn sign_finalize(
    cfg: &ThresholdSignerConfig,
    signing_session_id: &str,
    client_signature_share_b64u: &str,
) -> Result<String, String> {
    let finalize_req = SignFinalizeRequest {
        signing_session_id,
        client_signature_share_b64u,
    };
    let finalize_body = to_json_string(&finalize_req)?;

    let finalize_json = post_json(
        cfg,
        "/threshold-ed25519/sign/finalize",
        &finalize_body,
        "/sign/finalize",
        None,
    )
    .await?;
    let finalize: SignFinalizeResponse = serde_wasm_bindgen::from_value(finalize_json)
        .map_err(|e| format!("threshold-signer: failed to parse /sign/finalize response: {e}"))?;

    if !finalize.ok {
        return Err(finalize.message.clone().unwrap_or_else(|| {
            format!(
                "threshold-signer: /sign/finalize failed ({})",
                finalize.code.unwrap_or_default()
            )
        }));
    }

    let relayer_id = resolve_relayer_participant_id(cfg).to_string();
    let shares_by_id = finalize.relayer_signature_shares_by_id.ok_or_else(|| {
        "threshold-signer: /sign/finalize missing relayerSignatureSharesById".to_string()
    })?;
    shares_by_id.get(&relayer_id).cloned().ok_or_else(|| {
        format!(
            "threshold-signer: /sign/finalize missing relayerSignatureSharesById[{}]",
            relayer_id
        )
    })
}
