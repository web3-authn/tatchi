use crate::encoders::{base64_url_decode, base64_url_encode};
use curve25519_dalek::constants::ED25519_BASEPOINT_POINT;
use curve25519_dalek::edwards::CompressedEdwardsY;
use curve25519_dalek::scalar::Scalar as CurveScalar;
use serde::{Deserialize, Serialize};
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
    Ok(decoded
        .as_slice()
        .try_into()
        .expect("checked length above"))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommitmentsWire {
    hiding: String,
    binding: String,
}

/// Server-side helper: generate a relayer signing share and compute a group public key from
/// a client verifying share (participant id=1) and a relayer signing share (participant id=2).
///
/// NOTE: This is a scaffolding keygen and stores no persistent state by itself. The server
/// should keep `relayerSigningShareB64u` private and return only `publicKey`, `relayerKeyId`,
/// and `relayerVerifyingShareB64u` to the client.
#[wasm_bindgen]
pub fn threshold_ed25519_keygen_from_client_verifying_share(
    client_verifying_share_b64u: String,
) -> Result<JsValue, JsValue> {
    let bytes = base64_url_decode(client_verifying_share_b64u.trim())
        .map_err(|e| JsValue::from_str(&format!("Invalid clientVerifyingShareB64u: {e}")))?;
    if bytes.len() != 32 {
        return Err(JsValue::from_str(&format!(
            "clientVerifyingShareB64u must be 32 bytes, got {}",
            bytes.len()
        )));
    }
    let client_bytes: [u8; 32] = bytes
        .as_slice()
        .try_into()
        .expect("length checked above");
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

    // For identifiers {1,2}, Lagrange coefficients at x=0 are: λ1 = 2, λ2 = -1.
    let lambda1 = CurveScalar::from(2u64);
    let lambda2 = -CurveScalar::ONE;
    let group_point = client_point * lambda1 + relayer_point * lambda2;
    let group_pk_bytes = group_point.compress().to_bytes();

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
pub fn threshold_ed25519_round1_commit(relayer_signing_share_b64u: String) -> Result<JsValue, JsValue> {
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
    let verifying_share = frost_ed25519::keys::VerifyingShare::deserialize(&relayer_verifying_share_bytes)
        .map_err(|e| JsValue::from_str(&format!("Invalid relayer verifying share: {e}")))?;

    let signing_share = frost_ed25519::keys::SigningShare::deserialize(&share_bytes)
        .map_err(|e| JsValue::from_str(&format!("Invalid relayer signing share: {e}")))?;

    let relayer_identifier: frost_ed25519::Identifier = 2u16
        .try_into()
        .map_err(|_| JsValue::from_str("Invalid relayer identifier"))?;
    let key_package = frost_ed25519::keys::KeyPackage::new(
        relayer_identifier,
        signing_share,
        verifying_share,
        verifying_key,
        2, // min_signers (2-of-2)
    );

    let client_identifier: frost_ed25519::Identifier = 1u16
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
    let client_commitments = frost_ed25519::round1::SigningCommitments::new(client_hiding, client_binding);

    let relayer_hiding = base64_url_decode(args.relayer_commitments.hiding.trim())
        .map_err(|e| JsValue::from_str(&format!("Invalid relayer commitments.hiding: {e}")))?;
    let relayer_binding = base64_url_decode(args.relayer_commitments.binding.trim())
        .map_err(|e| JsValue::from_str(&format!("Invalid relayer commitments.binding: {e}")))?;
    let relayer_hiding = frost_ed25519::round1::NonceCommitment::deserialize(&relayer_hiding)
        .map_err(|e| JsValue::from_str(&format!("Invalid relayer hiding commitment: {e}")))?;
    let relayer_binding = frost_ed25519::round1::NonceCommitment::deserialize(&relayer_binding)
        .map_err(|e| JsValue::from_str(&format!("Invalid relayer binding commitment: {e}")))?;
    let relayer_commitments = frost_ed25519::round1::SigningCommitments::new(relayer_hiding, relayer_binding);

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
