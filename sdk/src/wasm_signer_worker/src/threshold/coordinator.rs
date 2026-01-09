use crate::types::ThresholdSignerConfig;
use std::collections::BTreeMap;

use super::protocol;
use super::transport::ThresholdEd25519Transport;

pub(super) async fn sign_ed25519_2p_v1<T: ThresholdEd25519Transport>(
    transport: &T,
    cfg: &ThresholdSignerConfig,
    mpc_session_id: &str,
    near_account_id: &str,
    signing_digest_32: &[u8],
    client_key_package: &frost_ed25519::keys::KeyPackage,
    client_identifier: frost_ed25519::Identifier,
    relayer_identifier: frost_ed25519::Identifier,
) -> Result<[u8; 64], String> {
    let round1 = protocol::client_round1_commit(client_key_package)?;
    let client_commitments_wire = round1.commitments_wire;

    let signing_digest_b64u = crate::encoders::base64_url_encode(signing_digest_32);

    let init = transport
        .sign_init(
            cfg,
            mpc_session_id,
            near_account_id,
            &signing_digest_b64u,
            client_commitments_wire,
        )
        .await?;

    let signing_session_id = init.signing_session_id;
    let relayer_commitments_wire = init.relayer_commitments;
    let relayer_verifying_share_b64u = init.relayer_verifying_share_b64u;

    let relayer_commitments = protocol::commitments_from_wire(&relayer_commitments_wire)?;

    let mut commitments_by_id = BTreeMap::new();
    commitments_by_id.insert(client_identifier, round1.commitments);
    commitments_by_id.insert(relayer_identifier, relayer_commitments);
    let signing_package = protocol::build_signing_package(signing_digest_32, commitments_by_id);

    let client_sig_share = protocol::client_round2_signature_share(
        &signing_package,
        &round1.nonces,
        client_key_package,
    )?;
    let client_sig_share_b64u = protocol::signature_share_to_b64u(&client_sig_share)?;

    let relayer_sig_share_b64u = transport
        .sign_finalize(cfg, &signing_session_id, &client_sig_share_b64u)
        .await?;

    let relayer_sig_share = protocol::signature_share_from_b64u(&relayer_sig_share_b64u)?;

    let verifying_key = client_key_package.verifying_key().clone();
    let client_verifying_share = client_key_package.verifying_share().clone();
    let relayer_verifying_share =
        protocol::verifying_share_from_b64u(&relayer_verifying_share_b64u)?;

    let mut verifying_shares_by_id = BTreeMap::new();
    verifying_shares_by_id.insert(client_identifier, client_verifying_share);
    verifying_shares_by_id.insert(relayer_identifier, relayer_verifying_share);

    let mut signature_shares_by_id = BTreeMap::new();
    signature_shares_by_id.insert(client_identifier, client_sig_share);
    signature_shares_by_id.insert(relayer_identifier, relayer_sig_share);

    protocol::aggregate_signature(
        &signing_package,
        verifying_key,
        verifying_shares_by_id,
        signature_shares_by_id,
    )
}
