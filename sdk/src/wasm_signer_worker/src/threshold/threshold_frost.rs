use crate::encoders::{base64_url_decode, base64_url_encode};
use curve25519_dalek::constants::ED25519_BASEPOINT_POINT;
use curve25519_dalek::edwards::CompressedEdwardsY;
use curve25519_dalek::edwards::EdwardsPoint;
use curve25519_dalek::scalar::Scalar as CurveScalar;
use curve25519_dalek::traits::Identity;
use frost_ed25519::Group;
use hkdf::Hkdf;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use wasm_bindgen::prelude::*;

fn parse_near_public_key_to_bytes(public_key: &str) -> Result<[u8; 32], JsValue> {
    let decoded = bs58::decode(public_key.strip_prefix("ed25519:").unwrap_or(public_key))
        .into_vec()
        .map_err(|e| JsValue::from_str(&format!("Invalid public key base58: {e}")))?;
    if decoded.len() != 32 {
        return Err(JsValue::from_str(&format!(
            "Invalid public key length: expected 32 bytes, got {}",
            decoded.len()
        )));
    }
    Ok(decoded.as_slice().try_into().expect("checked length above"))
}

pub(crate) fn compute_threshold_ed25519_group_public_key_2p_from_verifying_shares(
    client_point: EdwardsPoint,
    relayer_point: EdwardsPoint,
    client_participant_id: u16,
    relayer_participant_id: u16,
) -> Result<[u8; 32], String> {
    if client_participant_id == 0 {
        return Err("clientParticipantId must be an integer in [1,65535]".to_string());
    }
    if relayer_participant_id == 0 {
        return Err("relayerParticipantId must be an integer in [1,65535]".to_string());
    }
    if client_participant_id == relayer_participant_id {
        return Err("clientParticipantId must differ from relayerParticipantId".to_string());
    }

    // Group public key is the Lagrange interpolation of the verifying shares at x=0:
    //   PK = λc * Pc + λr * Pr
    //
    // Where (2-participant case):
    //   λc = xr / (xr - xc)
    //   λr = xc / (xc - xr)
    let xc = CurveScalar::from(client_participant_id as u64);
    let xr = CurveScalar::from(relayer_participant_id as u64);
    let denom_c = xr - xc;
    let denom_r = xc - xr;
    if denom_c == CurveScalar::ZERO || denom_r == CurveScalar::ZERO {
        return Err("clientParticipantId must differ from relayerParticipantId".to_string());
    }
    let lambda_c = xr * denom_c.invert();
    let lambda_r = xc * denom_r.invert();

    let group_point = client_point * lambda_c + relayer_point * lambda_r;
    Ok(group_point.compress().to_bytes())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommitmentsWire {
    hiding: String,
    binding: String,
}

const THRESHOLD_RELAYER_SHARE_INFO_PREFIX_V1: &[u8] = b"w3a/threshold/relayer_share_v1";

fn normalize_rp_id(rp_id: &str) -> String {
    rp_id.trim().to_ascii_lowercase()
}

const THRESHOLD_DERIVE_NONZERO_SCALAR_MAX_TRIES_V1: u32 = 1024;

// Deterministic "rejection sampling" for derived scalars:
// try `derive_candidate(ctr)` for ctr=0..MAX and return the first non-zero scalar.
//
// This is useful when deriving secrets via HKDF + `from_bytes_mod_order_wide`, where
// the all-zero scalar is astronomically unlikely but still invalid as a signing share.
fn deterministic_rejection_sample_nonzero_scalar_v1<F>(
    mut derive_candidate: F,
    exhausted_error: &str,
) -> Result<CurveScalar, String>
where
    F: FnMut(u32) -> Result<CurveScalar, String>,
{
    for ctr in 0u32..THRESHOLD_DERIVE_NONZERO_SCALAR_MAX_TRIES_V1 {
        let scalar = derive_candidate(ctr)?;
        if scalar != CurveScalar::ZERO {
            return Ok(scalar);
        }
    }

    Err(exhausted_error.to_string())
}

fn derive_threshold_relayer_share_scalar_v1(
    master_secret_bytes: &[u8],
    near_account_id: &str,
    rp_id: &str,
    client_verifying_share_bytes: &[u8; 32],
) -> Result<CurveScalar, String> {
    if master_secret_bytes.len() != 32 {
        return Err(format!(
            "master secret must be 32 bytes, got {}",
            master_secret_bytes.len()
        ));
    }

    let rp_id = normalize_rp_id(rp_id);

    // Deterministically derive the relayer signing share from the relayer master secret + public inputs.
    //
    // - HKDF salt binds the derivation to the client verifying share (public key-share).
    // - HKDF `info` binds it to the NEAR account + rpId.
    // - `ctr` enables deterministic "rejection sampling": if the reduced scalar is 0 mod ℓ,
    //   increment ctr and retry.
    let salt = Sha256::digest(client_verifying_share_bytes);
    let hk = Hkdf::<Sha256>::new(Some(salt.as_slice()), master_secret_bytes);

    // info := prefix || 0 || near_account_id || 0 || rp_id || 0 || epoch || ctr
    // `0` separators prevent ambiguous concatenation; epoch is reserved for future rotations.
    let near_account_id = near_account_id.trim();
    let mut info: Vec<u8> = Vec::with_capacity(
        THRESHOLD_RELAYER_SHARE_INFO_PREFIX_V1.len()
            + 1
            + near_account_id.len()
            + 1
            + rp_id.len()
            + 1
            + 8
            + 4,
    );
    info.extend_from_slice(THRESHOLD_RELAYER_SHARE_INFO_PREFIX_V1);
    info.push(0);
    info.extend_from_slice(near_account_id.as_bytes());
    info.push(0);
    info.extend_from_slice(rp_id.as_bytes());
    info.push(0);
    info.extend_from_slice(&0u64.to_le_bytes()); // epoch (reserved)
    info.extend_from_slice(&0u32.to_le_bytes()); // ctr (overwritten per-attempt)
    let ctr_offset = info.len() - 4;

    let mut okm = [0u8; 64];
    deterministic_rejection_sample_nonzero_scalar_v1(
        |ctr| {
            info[ctr_offset..].copy_from_slice(&ctr.to_le_bytes());

            // Expand to 64 bytes so we can reduce a "wide" value into a scalar mod ℓ.
            hk.expand(&info, &mut okm)
                .map_err(|_| "HKDF expand failed".to_string())?;

            Ok(CurveScalar::from_bytes_mod_order_wide(&okm))
        },
        "Derived relayer signing share is zero; retry with a different master secret",
    )
}

/// Server-side helper: generate a relayer signing share and compute a group public key from
/// a client verifying share and a relayer signing share.
///
/// This is participant-id aware: callers may override the default {1,2} identifiers.
///
/// NOTE: This is a scaffolding keygen and stores no persistent state by itself. The server
/// should keep `relayerSigningShareB64u` private and return only `publicKey`, `relayerKeyId`,
/// and `relayerVerifyingShareB64u` to the client.
#[wasm_bindgen]
pub fn threshold_ed25519_keygen_from_client_verifying_share(
    args: JsValue,
) -> Result<JsValue, JsValue> {
    #[derive(Debug, Clone, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ThresholdEd25519KeygenFromClientVerifyingShareArgs {
        #[serde(default)]
        client_participant_id: Option<u16>,
        #[serde(default)]
        relayer_participant_id: Option<u16>,
        client_verifying_share_b64u: String,
    }

    let args: ThresholdEd25519KeygenFromClientVerifyingShareArgs =
        serde_wasm_bindgen::from_value(args)
            .map_err(|e| JsValue::from_str(&format!("Invalid args: {e}")))?;

    let client_participant_id = args.client_participant_id.unwrap_or(1);
    let relayer_participant_id = args.relayer_participant_id.unwrap_or(2);

    let bytes = base64_url_decode(args.client_verifying_share_b64u.trim())
        .map_err(|e| JsValue::from_str(&format!("Invalid clientVerifyingShareB64u: {e}")))?;
    if bytes.len() != 32 {
        return Err(JsValue::from_str(&format!(
            "clientVerifyingShareB64u must be 32 bytes, got {}",
            bytes.len()
        )));
    }
    let client_bytes: [u8; 32] = bytes.as_slice().try_into().expect("length checked above");
    let client_point = CompressedEdwardsY(client_bytes)
        .decompress()
        .ok_or_else(|| JsValue::from_str("Invalid client verifying share point"))?;

    // Generate a random non-zero signing share for relayer id=2.
    let mut rng = frost_ed25519::rand_core::OsRng;
    let relayer_scalar: CurveScalar = loop {
        let mut wide = [0u8; 64];
        use frost_ed25519::rand_core::RngCore;
        rng.fill_bytes(&mut wide);
        let s = CurveScalar::from_bytes_mod_order_wide(&wide);
        if s != CurveScalar::ZERO {
            break s;
        }
    };

    let relayer_scalar_bytes = relayer_scalar.to_bytes();
    let relayer_signing_share_b64u = base64_url_encode(&relayer_scalar_bytes);

    let relayer_point = ED25519_BASEPOINT_POINT * relayer_scalar;
    let relayer_verifying_share_bytes = relayer_point.compress().to_bytes();
    let relayer_verifying_share_b64u = base64_url_encode(&relayer_verifying_share_bytes);

    let group_pk_bytes = compute_threshold_ed25519_group_public_key_2p_from_verifying_shares(
        client_point,
        relayer_point,
        client_participant_id,
        relayer_participant_id,
    )
    .map_err(|e| JsValue::from_str(&e))?;

    let public_key = format!("ed25519:{}", bs58::encode(&group_pk_bytes).into_string());
    let relayer_key_id = public_key.clone(); // default: relayerKeyId := publicKey

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Out {
        relayer_key_id: String,
        public_key: String,
        relayer_signing_share_b64u: String,
        relayer_verifying_share_b64u: String,
    }

    serde_wasm_bindgen::to_value(&Out {
        relayer_key_id,
        public_key,
        relayer_signing_share_b64u,
        relayer_verifying_share_b64u,
    })
    .map_err(|e| JsValue::from_str(&format!("Failed to serialize keygen output: {e}")))
}

/// Server-side helper: deterministically derive the relayer signing share from a relayer master
/// secret and client-provided public data, then compute the corresponding group public key.
///
/// This enables stateless relayer deployments: the relayer does not need to persist long-lived
/// signing shares, as they can be re-derived on-demand.
///
/// This is participant-id aware: callers may override the default {1,2} identifiers.
#[wasm_bindgen]
pub fn threshold_ed25519_keygen_from_master_secret_and_client_verifying_share(
    args: JsValue,
) -> Result<JsValue, JsValue> {
    #[derive(Debug, Clone, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ThresholdEd25519KeygenFromMasterSecretArgs {
        #[serde(default)]
        client_participant_id: Option<u16>,
        #[serde(default)]
        relayer_participant_id: Option<u16>,
        master_secret_b64u: String,
        near_account_id: String,
        rp_id: String,
        client_verifying_share_b64u: String,
    }

    let args: ThresholdEd25519KeygenFromMasterSecretArgs = serde_wasm_bindgen::from_value(args)
        .map_err(|e| JsValue::from_str(&format!("Invalid args: {e}")))?;

    let client_participant_id = args.client_participant_id.unwrap_or(1);
    let relayer_participant_id = args.relayer_participant_id.unwrap_or(2);

    let master_secret_bytes = base64_url_decode(args.master_secret_b64u.trim()).map_err(|e| {
        JsValue::from_str(&format!(
            "Invalid THRESHOLD_ED25519_MASTER_SECRET_B64U: {e}"
        ))
    })?;
    if master_secret_bytes.len() != 32 {
        return Err(JsValue::from_str(&format!(
            "THRESHOLD_ED25519_MASTER_SECRET_B64U must be 32 bytes, got {}",
            master_secret_bytes.len()
        )));
    }

    let bytes = base64_url_decode(args.client_verifying_share_b64u.trim())
        .map_err(|e| JsValue::from_str(&format!("Invalid clientVerifyingShareB64u: {e}")))?;
    if bytes.len() != 32 {
        return Err(JsValue::from_str(&format!(
            "clientVerifyingShareB64u must be 32 bytes, got {}",
            bytes.len()
        )));
    }
    let client_bytes: [u8; 32] = bytes.as_slice().try_into().expect("length checked above");
    let client_point = CompressedEdwardsY(client_bytes)
        .decompress()
        .ok_or_else(|| JsValue::from_str("Invalid client verifying share point"))?;

    let relayer_scalar = derive_threshold_relayer_share_scalar_v1(
        master_secret_bytes.as_slice(),
        &args.near_account_id,
        &args.rp_id,
        &client_bytes,
    )
    .map_err(|e| JsValue::from_str(&e))?;

    let relayer_scalar_bytes = relayer_scalar.to_bytes();
    let relayer_signing_share_b64u = base64_url_encode(&relayer_scalar_bytes);

    let relayer_point = ED25519_BASEPOINT_POINT * relayer_scalar;
    let relayer_verifying_share_bytes = relayer_point.compress().to_bytes();
    let relayer_verifying_share_b64u = base64_url_encode(&relayer_verifying_share_bytes);

    let group_pk_bytes = compute_threshold_ed25519_group_public_key_2p_from_verifying_shares(
        client_point,
        relayer_point,
        client_participant_id,
        relayer_participant_id,
    )
    .map_err(|e| JsValue::from_str(&e))?;

    let public_key = format!("ed25519:{}", bs58::encode(&group_pk_bytes).into_string());
    let relayer_key_id = public_key.clone(); // default: relayerKeyId := publicKey

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Out {
        relayer_key_id: String,
        public_key: String,
        relayer_signing_share_b64u: String,
        relayer_verifying_share_b64u: String,
    }

    serde_wasm_bindgen::to_value(&Out {
        relayer_key_id,
        public_key,
        relayer_signing_share_b64u,
        relayer_verifying_share_b64u,
    })
    .map_err(|e| JsValue::from_str(&format!("Failed to serialize keygen output: {e}")))
}

/// Server-side helper: Round 1 FROST commit for the relayer share.
/// Returns relayer nonces (opaque, serialized) and relayer commitments (public).
#[wasm_bindgen]
pub fn threshold_ed25519_round1_commit(
    relayer_signing_share_b64u: String,
) -> Result<JsValue, JsValue> {
    let share_bytes = base64_url_decode(relayer_signing_share_b64u.trim())
        .map_err(|e| JsValue::from_str(&format!("Invalid relayerSigningShareB64u: {e}")))?;
    if share_bytes.len() != 32 {
        return Err(JsValue::from_str(&format!(
            "relayerSigningShareB64u must be 32 bytes, got {}",
            share_bytes.len()
        )));
    }
    let signing_share = frost_ed25519::keys::SigningShare::deserialize(&share_bytes)
        .map_err(|e| JsValue::from_str(&format!("Invalid relayer signing share: {e}")))?;

    let mut rng = frost_ed25519::rand_core::OsRng;
    let (nonces, commitments) = frost_ed25519::round1::commit(&signing_share, &mut rng);

    let nonces_bytes = nonces
        .serialize()
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize signing nonces: {e}")))?;

    let hiding_bytes = commitments
        .hiding()
        .serialize()
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize hiding commitment: {e}")))?;
    let binding_bytes = commitments
        .binding()
        .serialize()
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize binding commitment: {e}")))?;

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Out {
        relayer_nonces_b64u: String,
        relayer_commitments: CommitmentsWire,
    }

    serde_wasm_bindgen::to_value(&Out {
        relayer_nonces_b64u: base64_url_encode(&nonces_bytes),
        relayer_commitments: CommitmentsWire {
            hiding: base64_url_encode(&hiding_bytes),
            binding: base64_url_encode(&binding_bytes),
        },
    })
    .map_err(|e| JsValue::from_str(&format!("Failed to serialize round1 output: {e}")))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Round2SignArgs {
    #[serde(default)]
    client_participant_id: Option<u16>,
    #[serde(default)]
    relayer_participant_id: Option<u16>,
    relayer_signing_share_b64u: String,
    relayer_nonces_b64u: String,
    group_public_key: String,
    signing_digest_b64u: String,
    client_commitments: CommitmentsWire,
    relayer_commitments: CommitmentsWire,
}

/// Server-side helper: Round 2 FROST sign for the relayer share.
/// Produces the relayer signature share (public) for aggregation by the client coordinator.
#[wasm_bindgen]
pub fn threshold_ed25519_round2_sign(args: JsValue) -> Result<JsValue, JsValue> {
    let args: Round2SignArgs = serde_wasm_bindgen::from_value(args)
        .map_err(|e| JsValue::from_str(&format!("Invalid round2 args: {e}")))?;

    let share_bytes = base64_url_decode(args.relayer_signing_share_b64u.trim())
        .map_err(|e| JsValue::from_str(&format!("Invalid relayerSigningShareB64u: {e}")))?;
    if share_bytes.len() != 32 {
        return Err(JsValue::from_str(&format!(
            "relayerSigningShareB64u must be 32 bytes, got {}",
            share_bytes.len()
        )));
    }

    let nonces_bytes = base64_url_decode(args.relayer_nonces_b64u.trim())
        .map_err(|e| JsValue::from_str(&format!("Invalid relayerNoncesB64u: {e}")))?;
    let nonces = frost_ed25519::round1::SigningNonces::deserialize(&nonces_bytes)
        .map_err(|e| JsValue::from_str(&format!("Invalid relayer signing nonces: {e}")))?;

    let message = base64_url_decode(args.signing_digest_b64u.trim())
        .map_err(|e| JsValue::from_str(&format!("Invalid signingDigestB64u: {e}")))?;

    let group_pk_bytes = parse_near_public_key_to_bytes(args.group_public_key.trim())?;
    let verifying_key = frost_ed25519::VerifyingKey::deserialize(&group_pk_bytes)
        .map_err(|e| JsValue::from_str(&format!("Invalid group public key: {e}")))?;

    let relayer_scalar_bytes: [u8; 32] = share_bytes
        .as_slice()
        .try_into()
        .expect("checked length above");
    let relayer_scalar = CurveScalar::from_bytes_mod_order(relayer_scalar_bytes);
    let relayer_point = ED25519_BASEPOINT_POINT * relayer_scalar;
    let relayer_verifying_share_bytes = relayer_point.compress().to_bytes();
    let verifying_share =
        frost_ed25519::keys::VerifyingShare::deserialize(&relayer_verifying_share_bytes)
            .map_err(|e| JsValue::from_str(&format!("Invalid relayer verifying share: {e}")))?;

    let signing_share = frost_ed25519::keys::SigningShare::deserialize(&share_bytes)
        .map_err(|e| JsValue::from_str(&format!("Invalid relayer signing share: {e}")))?;

    let client_id = args.client_participant_id.unwrap_or(1u16);
    let relayer_id = args.relayer_participant_id.unwrap_or(2u16);
    if client_id == relayer_id {
        return Err(JsValue::from_str(
            "Invalid participant identifiers: clientParticipantId must differ from relayerParticipantId",
        ));
    }

    let relayer_identifier: frost_ed25519::Identifier = relayer_id
        .try_into()
        .map_err(|_| JsValue::from_str("Invalid relayer identifier"))?;
    let key_package = frost_ed25519::keys::KeyPackage::new(
        relayer_identifier,
        signing_share,
        verifying_share,
        verifying_key,
        2, // min_signers (2-of-2)
    );

    let client_identifier: frost_ed25519::Identifier = client_id
        .try_into()
        .map_err(|_| JsValue::from_str("Invalid client identifier"))?;

    let client_hiding = base64_url_decode(args.client_commitments.hiding.trim())
        .map_err(|e| JsValue::from_str(&format!("Invalid client commitments.hiding: {e}")))?;
    let client_binding = base64_url_decode(args.client_commitments.binding.trim())
        .map_err(|e| JsValue::from_str(&format!("Invalid client commitments.binding: {e}")))?;
    let client_hiding = frost_ed25519::round1::NonceCommitment::deserialize(&client_hiding)
        .map_err(|e| JsValue::from_str(&format!("Invalid client hiding commitment: {e}")))?;
    let client_binding = frost_ed25519::round1::NonceCommitment::deserialize(&client_binding)
        .map_err(|e| JsValue::from_str(&format!("Invalid client binding commitment: {e}")))?;
    let client_commitments =
        frost_ed25519::round1::SigningCommitments::new(client_hiding, client_binding);

    let relayer_hiding = base64_url_decode(args.relayer_commitments.hiding.trim())
        .map_err(|e| JsValue::from_str(&format!("Invalid relayer commitments.hiding: {e}")))?;
    let relayer_binding = base64_url_decode(args.relayer_commitments.binding.trim())
        .map_err(|e| JsValue::from_str(&format!("Invalid relayer commitments.binding: {e}")))?;
    let relayer_hiding = frost_ed25519::round1::NonceCommitment::deserialize(&relayer_hiding)
        .map_err(|e| JsValue::from_str(&format!("Invalid relayer hiding commitment: {e}")))?;
    let relayer_binding = frost_ed25519::round1::NonceCommitment::deserialize(&relayer_binding)
        .map_err(|e| JsValue::from_str(&format!("Invalid relayer binding commitment: {e}")))?;
    let relayer_commitments =
        frost_ed25519::round1::SigningCommitments::new(relayer_hiding, relayer_binding);

    let mut commitments_map = BTreeMap::new();
    commitments_map.insert(client_identifier, client_commitments);
    commitments_map.insert(relayer_identifier, relayer_commitments);
    let signing_package = frost_ed25519::SigningPackage::new(commitments_map, &message);

    let relayer_sig_share = frost_ed25519::round2::sign(&signing_package, &nonces, &key_package)
        .map_err(|e| JsValue::from_str(&format!("Round2 sign failed: {e}")))?;

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Out {
        relayer_signature_share_b64u: String,
    }

    serde_wasm_bindgen::to_value(&Out {
        relayer_signature_share_b64u: base64_url_encode(&relayer_sig_share.serialize()),
    })
    .map_err(|e| JsValue::from_str(&format!("Failed to serialize round2 output: {e}")))
}

fn threshold_ed25519_round2_sign_cosigner_bytes(args: Round2SignArgs) -> Result<[u8; 32], String> {
    let share_bytes = base64_url_decode(args.relayer_signing_share_b64u.trim())
        .map_err(|e| format!("Invalid relayerSigningShareB64u: {e}"))?;
    if share_bytes.len() != 32 {
        return Err(format!(
            "relayerSigningShareB64u must be 32 bytes, got {}",
            share_bytes.len()
        ));
    }
    let share_scalar = Option::<CurveScalar>::from(CurveScalar::from_canonical_bytes(
        share_bytes
            .as_slice()
            .try_into()
            .expect("checked length above"),
    ))
    .ok_or_else(|| "Invalid relayer signing share scalar".to_string())?;

    let nonces_bytes = base64_url_decode(args.relayer_nonces_b64u.trim())
        .map_err(|e| format!("Invalid relayerNoncesB64u: {e}"))?;
    let nonces = frost_ed25519::round1::SigningNonces::deserialize(&nonces_bytes)
        .map_err(|e| format!("Invalid relayer signing nonces: {e}"))?;

    // Extract nonce scalars via serialization (internals feature not required).
    let hiding_bytes = nonces.hiding().serialize();
    if hiding_bytes.len() != 32 {
        return Err("Invalid hiding nonce encoding".to_string());
    }
    let binding_bytes = nonces.binding().serialize();
    if binding_bytes.len() != 32 {
        return Err("Invalid binding nonce encoding".to_string());
    }
    let hiding_scalar = Option::<CurveScalar>::from(CurveScalar::from_canonical_bytes(
        hiding_bytes
            .as_slice()
            .try_into()
            .expect("checked length above"),
    ))
    .ok_or_else(|| "Invalid hiding nonce scalar".to_string())?;
    let binding_scalar = Option::<CurveScalar>::from(CurveScalar::from_canonical_bytes(
        binding_bytes
            .as_slice()
            .try_into()
            .expect("checked length above"),
    ))
    .ok_or_else(|| "Invalid binding nonce scalar".to_string())?;

    let message = base64_url_decode(args.signing_digest_b64u.trim())
        .map_err(|e| format!("Invalid signingDigestB64u: {e}"))?;

    let group_pk_bytes = bs58::decode(args.group_public_key.trim().strip_prefix("ed25519:").unwrap_or(args.group_public_key.trim()))
        .into_vec()
        .map_err(|e| format!("Invalid group public key base58: {e}"))?;
    if group_pk_bytes.len() != 32 {
        return Err(format!(
            "Invalid group public key length: expected 32 bytes, got {}",
            group_pk_bytes.len()
        ));
    }
    let group_pk_bytes: [u8; 32] = group_pk_bytes
        .as_slice()
        .try_into()
        .expect("checked length above");

    let verifying_key = frost_ed25519::VerifyingKey::deserialize(&group_pk_bytes)
        .map_err(|e| format!("Invalid group public key: {e}"))?;

    let client_id = args.client_participant_id.unwrap_or(1u16);
    let relayer_id = args.relayer_participant_id.unwrap_or(2u16);
    if client_id == relayer_id {
        return Err(
            "Invalid participant identifiers: clientParticipantId must differ from relayerParticipantId"
                .to_string(),
        );
    }

    let relayer_identifier: frost_ed25519::Identifier = relayer_id
        .try_into()
        .map_err(|_| "Invalid relayer identifier".to_string())?;
    let client_identifier: frost_ed25519::Identifier = client_id
        .try_into()
        .map_err(|_| "Invalid client identifier".to_string())?;

    // Parse commitments (client + *aggregated* relayer commitments).
    let client_hiding = base64_url_decode(args.client_commitments.hiding.trim())
        .map_err(|e| format!("Invalid client commitments.hiding: {e}"))?;
    let client_binding = base64_url_decode(args.client_commitments.binding.trim())
        .map_err(|e| format!("Invalid client commitments.binding: {e}"))?;
    let client_hiding = frost_ed25519::round1::NonceCommitment::deserialize(&client_hiding)
        .map_err(|e| format!("Invalid client hiding commitment: {e}"))?;
    let client_binding = frost_ed25519::round1::NonceCommitment::deserialize(&client_binding)
        .map_err(|e| format!("Invalid client binding commitment: {e}"))?;
    let client_commitments =
        frost_ed25519::round1::SigningCommitments::new(client_hiding, client_binding);

    let relayer_hiding = base64_url_decode(args.relayer_commitments.hiding.trim())
        .map_err(|e| format!("Invalid relayer commitments.hiding: {e}"))?;
    let relayer_binding = base64_url_decode(args.relayer_commitments.binding.trim())
        .map_err(|e| format!("Invalid relayer commitments.binding: {e}"))?;
    let relayer_hiding = frost_ed25519::round1::NonceCommitment::deserialize(&relayer_hiding)
        .map_err(|e| format!("Invalid relayer hiding commitment: {e}"))?;
    let relayer_binding = frost_ed25519::round1::NonceCommitment::deserialize(&relayer_binding)
        .map_err(|e| format!("Invalid relayer binding commitment: {e}"))?;
    let relayer_commitments =
        frost_ed25519::round1::SigningCommitments::new(relayer_hiding, relayer_binding);

    let mut commitments_map = BTreeMap::new();
    commitments_map.insert(client_identifier, client_commitments);
    commitments_map.insert(relayer_identifier, relayer_commitments);
    let signing_package = frost_ed25519::SigningPackage::new(commitments_map, &message);

    // Compute binding factors (rho) using the same preimages as frost-core.
    let preimages = signing_package
        .binding_factor_preimages(&verifying_key, &[])
        .map_err(|e| format!("Failed to compute binding factor preimages: {e}"))?;
    let mut rho_by_id: BTreeMap<frost_ed25519::Identifier, CurveScalar> = BTreeMap::new();
    for (id, preimage) in preimages {
        let rho = <frost_ed25519::Ed25519Sha512 as frost_ed25519::Ciphersuite>::H1(
            preimage.as_slice(),
        );
        rho_by_id.insert(id, rho);
    }
    let rho_relayer = rho_by_id
        .get(&relayer_identifier)
        .ok_or_else(|| "Missing relayer binding factor".to_string())?;

    // Compute group commitment R = sum(hiding_i) + sum(rho_i * binding_i)
    let mut group_commitment: EdwardsPoint = EdwardsPoint::identity();
    for (id, c) in signing_package.signing_commitments() {
        let hiding_bytes = c
            .hiding()
            .serialize()
            .map_err(|e| format!("Invalid hiding commitment: {e}"))?;
        if hiding_bytes.len() != 32 {
            return Err("Invalid hiding commitment encoding".to_string());
        }
        let hiding = frost_ed25519::Ed25519Group::deserialize(
            hiding_bytes
                .as_slice()
                .try_into()
                .expect("checked length above"),
        )
        .map_err(|e| format!("Invalid hiding commitment: {e}"))?;

        let binding_bytes = c
            .binding()
            .serialize()
            .map_err(|e| format!("Invalid binding commitment: {e}"))?;
        if binding_bytes.len() != 32 {
            return Err("Invalid binding commitment encoding".to_string());
        }
        let binding = frost_ed25519::Ed25519Group::deserialize(
            binding_bytes
                .as_slice()
                .try_into()
                .expect("checked length above"),
        )
        .map_err(|e| format!("Invalid binding commitment: {e}"))?;

        let rho = rho_by_id
            .get(id)
            .ok_or_else(|| "Missing binding factor for commitment".to_string())?;
        group_commitment = group_commitment + hiding + (binding * (*rho));
    }
    let group_commitment_bytes = frost_ed25519::Ed25519Group::serialize(&group_commitment)
        .map_err(|e| format!("Invalid group commitment: {e}"))?;

    // Compute challenge c = H2(encode(R) || encode(Y) || msg)
    let vk_bytes = verifying_key
        .serialize()
        .map_err(|e| format!("Invalid verifying key: {e}"))?;
    let mut challenge_preimage = Vec::new();
    challenge_preimage.extend_from_slice(group_commitment_bytes.as_ref());
    challenge_preimage.extend_from_slice(vk_bytes.as_ref());
    challenge_preimage.extend_from_slice(message.as_slice());
    let challenge =
        <frost_ed25519::Ed25519Sha512 as frost_ed25519::Ciphersuite>::H2(
            challenge_preimage.as_slice(),
        );

    // For 2-of-2, compute Lagrange coefficient for the relayer signer at x=0:
    //   lambda_relayer = x_client / (x_client - x_relayer)
    let xc = CurveScalar::from(client_id as u64);
    let xr = CurveScalar::from(relayer_id as u64);
    let denom = xc - xr;
    if denom == CurveScalar::ZERO {
        return Err("Invalid participant identifiers".to_string());
    }
    let lambda_relayer = xc * denom.invert();

    // Signature share scalar:
    //   z_i = r_i^hiding + rho_relayer * r_i^binding + lambda_relayer * share_i * challenge
    let z = hiding_scalar
        + (binding_scalar * (*rho_relayer))
        + (lambda_relayer * share_scalar * challenge);
    Ok(z.to_bytes())
}

/// Internal helper for the relayer-fleet "cosigner" mode.
///
/// In this mode, the relayer participant's (id=2 in the 2-party scheme) secret share is split
/// across multiple relayer servers (cosigners). Each cosigner holds:
/// - a Shamir share of the *relayer signing share* (not the group secret), and
/// - its own per-signature nonces.
///
/// The coordinator aggregates:
/// - relayer commitments (hiding/binding) by point addition, and
/// - relayer signature shares by scalar addition.
///
/// We cannot call `frost_ed25519::round2::sign` on each cosigner using the *aggregated* relayer
/// commitments because `sign` checks that the commitments match the signer's own nonces.
/// Instead, we compute the signature-share scalar directly using the same binding factors,
/// group commitment, Lagrange coefficient (2-party signer set), and challenge as the normal flow.
#[wasm_bindgen]
pub fn threshold_ed25519_round2_sign_cosigner(args: JsValue) -> Result<JsValue, JsValue> {
    let args: Round2SignArgs = serde_wasm_bindgen::from_value(args)
        .map_err(|e| JsValue::from_str(&format!("Invalid round2 args: {e}")))?;
    let z_bytes = threshold_ed25519_round2_sign_cosigner_bytes(args)
        .map_err(|e| JsValue::from_str(&e))?;

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Out {
        relayer_signature_share_b64u: String,
    }

    serde_wasm_bindgen::to_value(&Out {
        relayer_signature_share_b64u: base64_url_encode(z_bytes.as_ref()),
    })
    .map_err(|e| JsValue::from_str(&format!("Failed to serialize round2 output: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::WrapKey;
    use crate::encoders::base64_url_encode;
    use ed25519_dalek::Verifier;

    #[test]
    fn deterministic_relayer_share_is_stable_and_rp_id_normalized() {
        let master_secret = [7u8; 32];
        let near_account_id = "alice.near";
        let rp_id_mixed_case = "Example.Com";

        let client_scalar = CurveScalar::from(5u64);
        let client_point = ED25519_BASEPOINT_POINT * client_scalar;
        let client_bytes = client_point.compress().to_bytes();

        let s1 = derive_threshold_relayer_share_scalar_v1(
            &master_secret,
            near_account_id,
            rp_id_mixed_case,
            &client_bytes,
        )
        .expect("should derive scalar");
        let s2 = derive_threshold_relayer_share_scalar_v1(
            &master_secret,
            near_account_id,
            rp_id_mixed_case,
            &client_bytes,
        )
        .expect("should derive scalar");
        assert_eq!(s1.to_bytes(), s2.to_bytes());

        // rpId normalization: mixed-case rpId should be treated the same as lowercase.
        let s3 = derive_threshold_relayer_share_scalar_v1(
            &master_secret,
            near_account_id,
            "example.com",
            &client_bytes,
        )
        .expect("should derive scalar");
        assert_eq!(s1.to_bytes(), s3.to_bytes());
    }

    #[test]
    fn deterministic_relayer_share_changes_with_inputs() {
        let master_secret = [42u8; 32];

        let client_scalar = CurveScalar::from(7u64);
        let client_point = ED25519_BASEPOINT_POINT * client_scalar;
        let client_bytes = client_point.compress().to_bytes();

        let base = derive_threshold_relayer_share_scalar_v1(
            &master_secret,
            "alice.near",
            "example.com",
            &client_bytes,
        )
        .expect("should derive scalar");

        let different_near = derive_threshold_relayer_share_scalar_v1(
            &master_secret,
            "bob.near",
            "example.com",
            &client_bytes,
        )
        .expect("should derive scalar");
        assert_ne!(base.to_bytes(), different_near.to_bytes());

        let different_rp = derive_threshold_relayer_share_scalar_v1(
            &master_secret,
            "alice.near",
            "other.example.com",
            &client_bytes,
        )
        .expect("should derive scalar");
        assert_ne!(base.to_bytes(), different_rp.to_bytes());

        let client_scalar2 = CurveScalar::from(9u64);
        let client_point2 = ED25519_BASEPOINT_POINT * client_scalar2;
        let client_bytes2 = client_point2.compress().to_bytes();
        let different_client = derive_threshold_relayer_share_scalar_v1(
            &master_secret,
            "alice.near",
            "example.com",
            &client_bytes2,
        )
        .expect("should derive scalar");
        assert_ne!(base.to_bytes(), different_client.to_bytes());
    }

    #[test]
    fn two_of_two_signature_from_derived_shares_verifies() {
        // NOTE: This is a pure in-process cryptography test (no HTTP).
        //
        // In the real browser (client) + relayer protocol, the *client* triggers relayer work via:
        // - Enrollment/key material: `POST /threshold-ed25519/keygen`
        // - (Optional) session issuance: `POST /threshold-ed25519/session` (to avoid repeated WebAuthn prompts)
        // - Per-sign authorization: `POST /threshold-ed25519/authorize` (yields `mpcSessionId`)
        // - Round 1 commitments exchange: `POST /threshold-ed25519/sign/init`
        // - Round 2 share exchange / aggregation: `POST /threshold-ed25519/sign/finalize`
        //
        // The steps below label where those calls would occur in an end-to-end flow.
        //
        // FROST nonce/commitment model (why Round 1 exists):
        // - Each signer generates fresh secret nonces for this signature (kept private forever; never sent).
        // - Each signer publishes *commitments* to those nonces (public), so both parties can build the same
        //   `SigningPackage` and therefore derive the same challenge/transcript.
        // - In Round 2, each signer uses (a) its private signing share + (b) its private nonces + (c) the
        //   shared `SigningPackage` to produce a signature share.
        //
        // Rough privacy / sharing split:
        // - Private (client): signing_share, nonces, wrap_key_seed/salt (input to share derivation).
        // - Private (relayer): signing_share, nonces, master_secret (derived mode input).
        // - Shared/public: verifying_shares, commitments (Round 1), signature_shares (Round 2),
        //   group public key, and the final aggregated signature.

        // Step 0 (test setup): fixed inputs for deterministic share derivation (client + relayer)
        let master_secret = [99u8; 32];
        let near_account_id = "alice.near";
        let rp_id = "example.com";
        let wrap_key = WrapKey {
            wrap_key_seed: base64_url_encode(&[7u8; 32]),
            wrap_key_salt: base64_url_encode(&[8u8; 32]),
        };

        // Step 1 (client): derive the client signing share (secret scalar) and verifying share (public point)
        let client_signing_share_bytes =
            crate::threshold::threshold_client_share::derive_threshold_client_signing_share_bytes_v1(
                &wrap_key,
                near_account_id,
            ).expect("client signing share should derive");
        let client_verifying_share_bytes =
            crate::threshold::threshold_client_share::derive_threshold_client_verifying_share_bytes_v1(
                &wrap_key,
                near_account_id,
            ).expect("client verifying share should derive");

        // Step 2 (client -> relayer): key material lookup / derivation.
        //
        // In production, after the client derives `clientVerifyingShareB64u`, it calls:
        //   `POST /threshold-ed25519/keygen`
        // and the relayer responds with `relayerVerifyingShareB64u` + `publicKey` (aka `relayerKeyId`).
        let relayer_scalar = derive_threshold_relayer_share_scalar_v1(
            &master_secret,
            near_account_id,
            rp_id,
            &client_verifying_share_bytes,
        )
        .expect("relayer share should derive");
        let relayer_signing_share_bytes = relayer_scalar.to_bytes();
        let relayer_verifying_share_bytes = (ED25519_BASEPOINT_POINT * relayer_scalar)
            .compress()
            .to_bytes();

        // Step 3a (relayer): compute the 2-of-2 group public key via Lagrange interpolation at x=0.
        //
        // In production, this group public key is returned by `/threshold-ed25519/keygen` and is what the
        // client will put on-chain as an access key (AddKey).
        //
        // For participant identifiers {1,2}, Lagrange coefficients at x=0 are:
        //   λ1 = 2, λ2 = -1
        //
        // Since Pi = si·B, the group public key is:
        //   PK = λ1·P1 + λ2·P2 = 2·P1 - P2
        let client_point = CompressedEdwardsY(client_verifying_share_bytes)
            .decompress()
            .expect("client verifying share must decompress");
        let relayer_point = CompressedEdwardsY(relayer_verifying_share_bytes)
            .decompress()
            .expect("relayer verifying share must decompress");
        let group_pk_bytes_relayer = (client_point + client_point - relayer_point)
            .compress()
            .to_bytes();

        // Step 3b (client): independently recompute the expected group public key.
        //
        // This is the client-side "anti key-injection" check: the client verifies the relayer did not
        // substitute a different public key / verifying share during `/threshold-ed25519/keygen`.
        let client_point = CompressedEdwardsY(client_verifying_share_bytes)
            .decompress()
            .expect("client verifying share must decompress");
        let relayer_point = CompressedEdwardsY(relayer_verifying_share_bytes)
            .decompress()
            .expect("relayer verifying share must decompress");
        let group_pk_bytes_client = (client_point + client_point - relayer_point)
            .compress()
            .to_bytes();

        assert_eq!(group_pk_bytes_client, group_pk_bytes_relayer);
        let group_pk_bytes = group_pk_bytes_client;

        // Step 4a (client): build the client's FROST key package using the shared group verifying key
        let verifying_key = frost_ed25519::VerifyingKey::deserialize(&group_pk_bytes)
            .expect("group verifying key must deserialize");
        let client_identifier: frost_ed25519::Identifier =
            1u16.try_into().expect("valid client identifier");
        let relayer_identifier: frost_ed25519::Identifier =
            2u16.try_into().expect("valid relayer identifier");

        let client_signing_share =
            frost_ed25519::keys::SigningShare::deserialize(&client_signing_share_bytes)
                .expect("client signing share must deserialize");
        let client_verifying_share =
            frost_ed25519::keys::VerifyingShare::deserialize(&client_verifying_share_bytes)
                .expect("client verifying share must deserialize");
        let client_key_package = frost_ed25519::keys::KeyPackage::new(
            client_identifier,
            client_signing_share,
            client_verifying_share.clone(),
            verifying_key.clone(),
            2,
        );

        // Step 4b (relayer): build the relayer's FROST key package using the shared group verifying key
        let relayer_signing_share =
            frost_ed25519::keys::SigningShare::deserialize(&relayer_signing_share_bytes)
                .expect("relayer signing share must deserialize");
        let relayer_verifying_share =
            frost_ed25519::keys::VerifyingShare::deserialize(&relayer_verifying_share_bytes)
                .expect("relayer verifying share must deserialize");
        let relayer_key_package = frost_ed25519::keys::KeyPackage::new(
            relayer_identifier,
            relayer_signing_share,
            relayer_verifying_share.clone(),
            verifying_key.clone(),
            2,
        );

        // Step 5 (client): choose the 32-byte digest to be signed (both signers must sign the exact same bytes)
        let msg_digest: [u8; 32] = Sha256::digest(b"test message")
            .as_slice()
            .try_into()
            .expect("sha256 digest must be 32 bytes");

        // Step 5.5 (client -> relayer): authorization (not modeled in this test).
        //
        // In production, before Round 1 begins, the client calls:
        //   `POST /threshold-ed25519/authorize`
        // which yields an `mpcSessionId` bound to the exact digest (and intent) being signed.

        // Step 6a (client): Round 1 (commit), generate nonces + public commitments.
        // In production, the client computes these locally *before* calling `/threshold-ed25519/sign/init`.
        let mut rng = frost_ed25519::rand_core::OsRng;
        let (client_nonces, client_commitments) =
            frost_ed25519::round1::commit(client_key_package.signing_share(), &mut rng);

        // Step 6a.1 (client -> relayer): Round 1 HTTP call (commitments exchange).
        //
        // The client sends `clientCommitments` + `signingDigestB64u` + `mpcSessionId` to:
        //   `POST /threshold-ed25519/sign/init`
        // The relayer responds with `relayerCommitments` + `relayerVerifyingShareB64u` and a `signingSessionId`.

        // Step 6b (relayer): Round 1 (commit), generate nonces + public commitments (performed on the server
        // while handling `/threshold-ed25519/sign/init`).
        let (relayer_nonces, relayer_commitments) =
            frost_ed25519::round1::commit(relayer_key_package.signing_share(), &mut rng);

        // Step 7 (client): form the signing package from commitments + message digest.
        // The digest is communicated to the relayer earlier so both parties sign the same bytes:
        // - `/threshold-ed25519/authorize` receives `signing_digest_32` and binds it to an `mpcSessionId`
        // - `/threshold-ed25519/sign/init` receives `signingDigestB64u` and checks it matches the `mpcSessionId`
        let mut commitments_map = BTreeMap::new();
        commitments_map.insert(client_identifier, client_commitments);
        commitments_map.insert(relayer_identifier, relayer_commitments);
        let signing_package = frost_ed25519::SigningPackage::new(commitments_map, &msg_digest);

        // Step 8 (client + relayer): Round 2 (sign), each signer produces a signature share.
        // Step 8a (client): produce the client's signature share.
        let client_sig_share =
            frost_ed25519::round2::sign(&signing_package, &client_nonces, &client_key_package)
                .expect("client round2 sign should succeed");

        // Step 8a.1 (client -> relayer): Round 2 HTTP call (signature share exchange / aggregation).
        //
        // The client sends `clientSignatureShareB64u` + `signingSessionId` to:
        //   `POST /threshold-ed25519/sign/finalize`
        // The relayer responds with `relayerSignatureShareB64u` and (optionally) the aggregated signature.

        // Step 8b (relayer): produce the relayer's signature share (performed on the server while handling
        // `/threshold-ed25519/sign/finalize`).
        let relayer_sig_share =
            frost_ed25519::round2::sign(&signing_package, &relayer_nonces, &relayer_key_package)
                .expect("relayer round2 sign should succeed");

        // Step 9 (client/coordinator): collect the verify shares into a public key package
        //  for validating shares + aggregating signature shares
        let mut verifying_shares = BTreeMap::new();
        verifying_shares.insert(client_identifier, client_verifying_share);
        verifying_shares.insert(relayer_identifier, relayer_verifying_share);
        let pubkey_package =
            frost_ed25519::keys::PublicKeyPackage::new(verifying_shares, verifying_key);

        // Step 10 (client/coordinator): aggregate signature shares into a single Ed25519 signature
        let mut signature_shares = BTreeMap::new();
        signature_shares.insert(client_identifier, client_sig_share);
        signature_shares.insert(relayer_identifier, relayer_sig_share);

        let group_signature = frost_ed25519::aggregate(
            &signing_package, // client constructed this from collected commitments + message digest
            &signature_shares,
            &pubkey_package,
        )
        .expect("aggregate should succeed");

        let sig_bytes = group_signature
            .serialize()
            .expect("signature serialization should succeed");

        assert_eq!(sig_bytes.len(), 64);

        // Step 11 (any verifier; e.g. the chain): verifies the aggregated signature
        let vk = ed25519_dalek::VerifyingKey::from_bytes(&group_pk_bytes)
            .expect("ed25519 group pk must be valid");
        let sig: [u8; 64] = sig_bytes
            .as_slice()
            .try_into()
            .expect("signature must be 64 bytes");
        let sig = ed25519_dalek::Signature::from_bytes(&sig);

        vk.verify(&msg_digest, &sig)
            .expect("ed25519-dalek should verify group signature");
    }

    #[test]
    fn relayer_fleet_cosigner_round2_sign_cosigner_aggregates_and_verifies() {
        // This test exercises the relayer-fleet ("internal t-of-n") cosigner model:
        //
        // - Externally (from the client's POV), the signing set is still 2-party FROST:
        //     participant 1 = client, participant 2 = relayer
        // - Internally (inside the relayer fleet), participant 2's secret signing share is split
        //   across multiple relayer servers (cosigners).
        //
        // The goal: cosigners compute partial contributions using
        // `threshold_ed25519_round2_sign_cosigner`, the coordinator sums them, and the resulting
        // (client share + relayer share) aggregates into a valid Ed25519 signature under the same
        // 2-party group public key.

        // Step 0 (test setup): fixed inputs for deterministic share derivation (client + relayer)
        let master_secret = [99u8; 32];
        let near_account_id = "alice.near";
        let rp_id = "example.com";
        let wrap_key = WrapKey {
            wrap_key_seed: base64_url_encode(&[7u8; 32]),
            wrap_key_salt: base64_url_encode(&[8u8; 32]),
        };

        // Step 1 (client): derive the client signing share (secret scalar) and verifying share (public point)
        let client_signing_share_bytes =
            crate::threshold::threshold_client_share::derive_threshold_client_signing_share_bytes_v1(
                &wrap_key,
                near_account_id,
            )
            .expect("client signing share should derive");
        let client_verifying_share_bytes =
            crate::threshold::threshold_client_share::derive_threshold_client_verifying_share_bytes_v1(
                &wrap_key,
                near_account_id,
            )
            .expect("client verifying share should derive");

        // Step 2 (client -> coordinator relayer): key material lookup / derivation via `/threshold-ed25519/keygen`
        let relayer_scalar = derive_threshold_relayer_share_scalar_v1(
            &master_secret,
            near_account_id,
            rp_id,
            &client_verifying_share_bytes,
        )
        .expect("relayer share should derive");
        let relayer_verifying_share_bytes = (ED25519_BASEPOINT_POINT * relayer_scalar)
            .compress()
            .to_bytes();

        // Step 3 (coordinator relayer): compute the 2-of-2 group public key (what the chain verifies with)
        let client_point = CompressedEdwardsY(client_verifying_share_bytes)
            .decompress()
            .expect("client verifying share must decompress");
        let relayer_point = CompressedEdwardsY(relayer_verifying_share_bytes)
            .decompress()
            .expect("relayer verifying share must decompress");
        let group_pk_bytes = compute_threshold_ed25519_group_public_key_2p_from_verifying_shares(
            client_point,
            relayer_point,
            1,
            2,
        )
        .expect("group pk should compute");

        let verifying_key = frost_ed25519::VerifyingKey::deserialize(&group_pk_bytes)
            .expect("group verifying key must deserialize");
        let group_public_key = format!("ed25519:{}", bs58::encode(&group_pk_bytes).into_string());

        // Step 4 (client): locally prepare key packages for standard 2-party FROST.
        let client_identifier: frost_ed25519::Identifier = 1u16.try_into().unwrap();
        let relayer_identifier: frost_ed25519::Identifier = 2u16.try_into().unwrap();

        let client_signing_share =
            frost_ed25519::keys::SigningShare::deserialize(&client_signing_share_bytes)
                .expect("client signing share must deserialize");
        let client_verifying_share =
            frost_ed25519::keys::VerifyingShare::deserialize(&client_verifying_share_bytes)
                .expect("client verifying share must deserialize");
        let client_key_package = frost_ed25519::keys::KeyPackage::new(
            client_identifier,
            client_signing_share,
            client_verifying_share,
            verifying_key,
            2,
        );

        let relayer_verifying_share =
            frost_ed25519::keys::VerifyingShare::deserialize(&relayer_verifying_share_bytes)
                .expect("relayer verifying share must deserialize");

        // Fixed message digest (represents `signing_digest_32` / `signingDigestB64u` in HTTP routes).
        let msg_digest = Sha256::digest(b"cosigner-round2-sign-test");
        let msg_digest_b64u = base64_url_encode(msg_digest.as_slice());

        // Step 5 (client): Round 1 commitments (computed locally before calling `/threshold-ed25519/sign/init`)
        let mut rng = frost_ed25519::rand_core::OsRng;
        let (client_nonces, client_commitments) =
            frost_ed25519::round1::commit(client_key_package.signing_share(), &mut rng);

        // Step 6 (coordinator relayer): split the *relayer signing share* (participant 2 share) across the fleet.
        //
        // Step 6a (coordinator -> relayer2): coordinator sends `cosignerShareB64u` in
        //   `POST /threshold-ed25519/internal/cosign/init`
        //
        // Step 6b (relayer2): each cosigner generates its own nonces + commitments from its share.
        let cosigner_ids_all = [1u16, 2u16, 3u16];
        let a1 = relayer_scalar; // non-zero; chosen so y_i can't be 0 for small cosigner ids
        let mut shares_by_cosigner_id: BTreeMap<u16, CurveScalar> = BTreeMap::new();
        for id in cosigner_ids_all {
            let x = CurveScalar::from(id as u64);
            let y = relayer_scalar + (a1 * x);
            assert!(y != CurveScalar::ZERO, "derived cosigner share must be non-zero");
            shares_by_cosigner_id.insert(id, y);
        }

        // Coordinator picks any 2 cosigners (t=2). Here we select {1,2}.
        let selected_cosigner_ids = [1u16, 2u16];

        // Lagrange coefficients at x=0 for the selected cosigner set.
        // (Coordinator computes this; each cosigner is sent an implicitly "weighted" share.)
        let lagrange_at_zero = |id: u16| -> CurveScalar {
            let x_i = CurveScalar::from(id as u64);
            let mut num = CurveScalar::ONE;
            let mut den = CurveScalar::ONE;
            for j in selected_cosigner_ids {
                if j == id {
                    continue;
                }
                let x_j = CurveScalar::from(j as u64);
                num *= x_j;
                den *= x_j - x_i;
            }
            num * den.invert()
        };

        let y1 = *shares_by_cosigner_id.get(&1).unwrap();
        let y2 = *shares_by_cosigner_id.get(&2).unwrap();
        let eff1 = lagrange_at_zero(1) * y1;
        let eff2 = lagrange_at_zero(2) * y2;
        assert_eq!(
            eff1 + eff2,
            relayer_scalar,
            "weighted cosigner shares must reconstruct relayer share"
        );

        // Step 7 (coordinator relayer): Round 1 cosigner fanout.
        //
        // Step 7a (coordinator -> relayer1/relayer2): send client commitments + cosigner share.
        // Step 7b (relayer1/relayer2): return commitments; coordinator aggregates them into the
        // relayer participant's (id=2) commitments.
        let cosigner1_share =
            frost_ed25519::keys::SigningShare::deserialize(&y1.to_bytes())
                .expect("cosigner1 share must deserialize");
        let cosigner2_share =
            frost_ed25519::keys::SigningShare::deserialize(&y2.to_bytes())
                .expect("cosigner2 share must deserialize");

        let (cosigner1_nonces, cosigner1_commitments) =
            frost_ed25519::round1::commit(&cosigner1_share, &mut rng);
        let (cosigner2_nonces, cosigner2_commitments) =
            frost_ed25519::round1::commit(&cosigner2_share, &mut rng);

        let sum_points = |a: &[u8], b: &[u8]| -> [u8; 32] {
            let a: [u8; 32] = a.try_into().expect("commitment must be 32 bytes");
            let b: [u8; 32] = b.try_into().expect("commitment must be 32 bytes");
            let a = frost_ed25519::Ed25519Group::deserialize(&a)
                .expect("commitment must deserialize");
            let b = frost_ed25519::Ed25519Group::deserialize(&b)
                .expect("commitment must deserialize");
            frost_ed25519::Ed25519Group::serialize(&(a + b))
                .expect("aggregated commitment must serialize")
        };

        let relayer_hiding_bytes = sum_points(
            &cosigner1_commitments
                .hiding()
                .serialize()
                .expect("cosigner1 hiding must serialize"),
            &cosigner2_commitments
                .hiding()
                .serialize()
                .expect("cosigner2 hiding must serialize"),
        );
        let relayer_binding_bytes = sum_points(
            &cosigner1_commitments
                .binding()
                .serialize()
                .expect("cosigner1 binding must serialize"),
            &cosigner2_commitments
                .binding()
                .serialize()
                .expect("cosigner2 binding must serialize"),
        );

        let relayer_commitments = frost_ed25519::round1::SigningCommitments::new(
            frost_ed25519::round1::NonceCommitment::deserialize(&relayer_hiding_bytes)
                .expect("relayer hiding commitment must deserialize"),
            frost_ed25519::round1::NonceCommitment::deserialize(&relayer_binding_bytes)
                .expect("relayer binding commitment must deserialize"),
        );

        // Step 8 (client/coordinator): build the signing package from *client commitments* and the
        // *aggregated relayer commitments* returned by `/threshold-ed25519/sign/init`.
        let mut commitments_map = BTreeMap::new();
        commitments_map.insert(client_identifier, client_commitments);
        commitments_map.insert(relayer_identifier, relayer_commitments);
        let signing_package = frost_ed25519::SigningPackage::new(commitments_map, msg_digest.as_slice());

        // Step 9 (client): Round 2 client signature share (sent to coordinator via `/threshold-ed25519/sign/finalize`)
        let client_sig_share =
            frost_ed25519::round2::sign(&signing_package, &client_nonces, &client_key_package)
                .expect("client round2 sign should succeed");

        // Step 10 (coordinator -> relayer1/relayer2): `/threshold-ed25519/internal/cosign/finalize`
        // coordinator sends (1) the aggregated commitments for participant 2, (2) group PK, and
        // (3) the signing digest. Each cosigner returns a *partial* relayer signature share scalar.
        let client_commitments_wire = CommitmentsWire {
            hiding: base64_url_encode(
                &client_commitments
                    .hiding()
                    .serialize()
                    .expect("client hiding must serialize"),
            ),
            binding: base64_url_encode(
                &client_commitments
                    .binding()
                    .serialize()
                    .expect("client binding must serialize"),
            ),
        };
        let relayer_commitments_wire = CommitmentsWire {
            hiding: base64_url_encode(relayer_hiding_bytes.as_ref()),
            binding: base64_url_encode(relayer_binding_bytes.as_ref()),
        };

        let cosigner1_nonces_b64u = base64_url_encode(
            &cosigner1_nonces
                .serialize()
                .expect("cosigner1 nonces must serialize"),
        );
        let cosigner2_nonces_b64u = base64_url_encode(
            &cosigner2_nonces
                .serialize()
                .expect("cosigner2 nonces must serialize"),
        );

        let cosigner1_z_bytes = threshold_ed25519_round2_sign_cosigner_bytes(Round2SignArgs {
            client_participant_id: Some(1),
            relayer_participant_id: Some(2),
            relayer_signing_share_b64u: base64_url_encode(eff1.to_bytes().as_ref()),
            relayer_nonces_b64u: cosigner1_nonces_b64u,
            group_public_key: group_public_key.clone(),
            signing_digest_b64u: msg_digest_b64u.clone(),
            client_commitments: client_commitments_wire.clone(),
            relayer_commitments: relayer_commitments_wire.clone(),
        })
        .expect("cosigner1 round2 must succeed");

        let cosigner2_z_bytes = threshold_ed25519_round2_sign_cosigner_bytes(Round2SignArgs {
            client_participant_id: Some(1),
            relayer_participant_id: Some(2),
            relayer_signing_share_b64u: base64_url_encode(eff2.to_bytes().as_ref()),
            relayer_nonces_b64u: cosigner2_nonces_b64u,
            group_public_key: group_public_key.clone(),
            signing_digest_b64u: msg_digest_b64u,
            client_commitments: client_commitments_wire,
            relayer_commitments: relayer_commitments_wire,
        })
        .expect("cosigner2 round2 must succeed");

        // Step 11 (coordinator): sum cosigner partials into the relayer participant's signature share.
        let z1 = Option::<CurveScalar>::from(CurveScalar::from_canonical_bytes(cosigner1_z_bytes))
            .expect("z1 must be canonical");
        let z2 = Option::<CurveScalar>::from(CurveScalar::from_canonical_bytes(cosigner2_z_bytes))
            .expect("z2 must be canonical");
        let relayer_z = (z1 + z2).to_bytes();
        let relayer_sig_share = frost_ed25519::round2::SignatureShare::deserialize(&relayer_z)
            .expect("relayer signature share must deserialize");

        // Step 12 (client/coordinator): aggregate client+relayer signature shares into a final signature.
        let mut verifying_shares = BTreeMap::new();
        verifying_shares.insert(client_identifier, client_verifying_share);
        verifying_shares.insert(relayer_identifier, relayer_verifying_share);
        let pubkey_package =
            frost_ed25519::keys::PublicKeyPackage::new(verifying_shares, verifying_key);

        let mut signature_shares = BTreeMap::new();
        signature_shares.insert(client_identifier, client_sig_share);
        signature_shares.insert(relayer_identifier, relayer_sig_share);
        let group_signature = frost_ed25519::aggregate(&signing_package, &signature_shares, &pubkey_package)
            .expect("aggregate should succeed");

        let sig_bytes = group_signature
            .serialize()
            .expect("signature serialization should succeed");
        let vk = ed25519_dalek::VerifyingKey::from_bytes(&group_pk_bytes)
            .expect("ed25519 group pk must be valid");
        let sig: [u8; 64] = sig_bytes.as_slice().try_into().expect("signature must be 64 bytes");
        let sig = ed25519_dalek::Signature::from_bytes(&sig);
        vk.verify(msg_digest.as_slice(), &sig)
            .expect("ed25519-dalek should verify group signature");
    }
}
