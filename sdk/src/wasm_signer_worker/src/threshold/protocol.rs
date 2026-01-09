use crate::encoders::{base64_url_decode, base64_url_encode};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CommitmentsWire {
    pub(super) hiding: String,
    pub(super) binding: String,
}

pub(super) struct ClientRound1State {
    pub(super) nonces: frost_ed25519::round1::SigningNonces,
    pub(super) commitments: frost_ed25519::round1::SigningCommitments,
    pub(super) commitments_wire: CommitmentsWire,
}

pub(super) fn client_round1_commit(
    key_package: &frost_ed25519::keys::KeyPackage,
) -> Result<ClientRound1State, String> {
    let mut rng = frost_ed25519::rand_core::OsRng;
    let (nonces, commitments) =
        frost_ed25519::round1::commit(key_package.signing_share(), &mut rng);
    let commitments_wire = commitments_to_wire(&commitments)?;
    Ok(ClientRound1State {
        nonces,
        commitments,
        commitments_wire,
    })
}

pub(super) fn commitments_to_wire(
    commitments: &frost_ed25519::round1::SigningCommitments,
) -> Result<CommitmentsWire, String> {
    let hiding_bytes = commitments
        .hiding()
        .serialize()
        .map_err(|e| format!("threshold-signer: serialize hiding commitment: {e}"))?;
    let binding_bytes = commitments
        .binding()
        .serialize()
        .map_err(|e| format!("threshold-signer: serialize binding commitment: {e}"))?;
    Ok(CommitmentsWire {
        hiding: base64_url_encode(&hiding_bytes),
        binding: base64_url_encode(&binding_bytes),
    })
}

pub(super) fn commitments_from_wire(
    wire: &CommitmentsWire,
) -> Result<frost_ed25519::round1::SigningCommitments, String> {
    let hiding_bytes = base64_url_decode(wire.hiding.trim())
        .map_err(|e| format!("threshold-signer: invalid commitments.hiding: {e}"))?;
    let binding_bytes = base64_url_decode(wire.binding.trim())
        .map_err(|e| format!("threshold-signer: invalid commitments.binding: {e}"))?;

    let hiding = frost_ed25519::round1::NonceCommitment::deserialize(&hiding_bytes)
        .map_err(|e| format!("threshold-signer: invalid hiding commitment: {e}"))?;
    let binding = frost_ed25519::round1::NonceCommitment::deserialize(&binding_bytes)
        .map_err(|e| format!("threshold-signer: invalid binding commitment: {e}"))?;
    Ok(frost_ed25519::round1::SigningCommitments::new(
        hiding, binding,
    ))
}

pub(super) fn build_signing_package(
    message: &[u8],
    commitments_by_id: BTreeMap<
        frost_ed25519::Identifier,
        frost_ed25519::round1::SigningCommitments,
    >,
) -> frost_ed25519::SigningPackage {
    frost_ed25519::SigningPackage::new(commitments_by_id, message)
}

pub(super) fn client_round2_signature_share(
    signing_package: &frost_ed25519::SigningPackage,
    nonces: &frost_ed25519::round1::SigningNonces,
    key_package: &frost_ed25519::keys::KeyPackage,
) -> Result<frost_ed25519::round2::SignatureShare, String> {
    frost_ed25519::round2::sign(signing_package, nonces, key_package)
        .map_err(|e| format!("threshold-signer: round2 sign failed: {e}"))
}

pub(super) fn signature_share_to_b64u(
    share: &frost_ed25519::round2::SignatureShare,
) -> Result<String, String> {
    Ok(base64_url_encode(&share.serialize()))
}

pub(super) fn signature_share_from_b64u(
    b64u: &str,
) -> Result<frost_ed25519::round2::SignatureShare, String> {
    let bytes = base64_url_decode(b64u.trim())
        .map_err(|e| format!("threshold-signer: invalid signature share: {e}"))?;
    frost_ed25519::round2::SignatureShare::deserialize(&bytes)
        .map_err(|e| format!("threshold-signer: invalid signature share: {e}"))
}

pub(super) fn verifying_share_from_b64u(
    b64u: &str,
) -> Result<frost_ed25519::keys::VerifyingShare, String> {
    let bytes = base64_url_decode(b64u.trim())
        .map_err(|e| format!("threshold-signer: invalid verifying share: {e}"))?;
    frost_ed25519::keys::VerifyingShare::deserialize(&bytes)
        .map_err(|e| format!("threshold-signer: invalid verifying share: {e}"))
}

pub(super) fn aggregate_signature(
    signing_package: &frost_ed25519::SigningPackage,
    verifying_key: frost_ed25519::VerifyingKey,
    verifying_shares: BTreeMap<frost_ed25519::Identifier, frost_ed25519::keys::VerifyingShare>,
    signature_shares: BTreeMap<frost_ed25519::Identifier, frost_ed25519::round2::SignatureShare>,
) -> Result<[u8; 64], String> {
    let pubkey_package =
        frost_ed25519::keys::PublicKeyPackage::new(verifying_shares, verifying_key);
    let group_signature =
        frost_ed25519::aggregate(signing_package, &signature_shares, &pubkey_package)
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
