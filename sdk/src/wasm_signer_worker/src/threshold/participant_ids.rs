pub fn join_participant_ids(ids: &[u16]) -> String {
    ids.iter()
        .map(|n| n.to_string())
        .collect::<Vec<_>>()
        .join(",")
}

pub fn normalize_participant_ids(ids: Option<&Vec<u16>>) -> Vec<u16> {
    let mut out: Vec<u16> = ids
        .map(|ids| ids.iter().copied().filter(|n| *n > 0).collect())
        .unwrap_or_default();
    out.sort_unstable();
    out.dedup();
    out
}

pub fn ensure_2p_participant_ids(participant_ids_norm: &[u16]) -> Result<(), String> {
    if participant_ids_norm.len() > 2 {
        return Err(format!(
            "threshold-signer: multi-party threshold signing is not supported yet (got participantIds=[{}])",
            join_participant_ids(participant_ids_norm)
        ));
    }
    Ok(())
}

pub fn validate_threshold_ed25519_participant_ids_2p(
    client_id_opt: Option<u16>,
    relayer_id_opt: Option<u16>,
    participant_ids_norm: &[u16],
) -> Result<(u16, u16), String> {
    let (client_id, relayer_id) = match (client_id_opt, relayer_id_opt) {
        (Some(c), Some(r)) => {
            if c == r {
                return Err(
                    "threshold-signer: clientParticipantId must differ from relayerParticipantId"
                        .to_string(),
                );
            }
            if !participant_ids_norm.is_empty() {
                if participant_ids_norm.len() != 2 {
                    return Err(
                        "threshold-signer: participantIds must contain exactly 2 ids for 2-party signing"
                            .to_string(),
                    );
                }
                let mut expected = vec![c, r];
                expected.sort_unstable();
                expected.dedup();
                if participant_ids_norm != expected.as_slice() {
                    return Err(format!(
                        "threshold-signer: participantIds does not match clientParticipantId/relayerParticipantId (expected participantIds=[{}], got participantIds=[{}])",
                        join_participant_ids(&expected),
                        join_participant_ids(participant_ids_norm)
                    ));
                }
            }
            (c, r)
        }
        (None, None) => {
            if participant_ids_norm.is_empty() {
                (1u16, 2u16)
            } else if participant_ids_norm.len() == 2 {
                (participant_ids_norm[0], participant_ids_norm[1])
            } else {
                return Err(
                    "threshold-signer: participantIds must contain exactly 2 ids for 2-party signing"
                        .to_string(),
                );
            }
        }
        _ => {
            return Err(
                "threshold-signer: clientParticipantId and relayerParticipantId must be set together"
                    .to_string(),
            );
        }
    };

    Ok((client_id, relayer_id))
}
