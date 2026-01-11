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
                if participant_ids_norm.len() < 2 {
                    return Err("threshold-signer: participantIds must contain at least 2 ids".to_string());
                }
                if !participant_ids_norm.contains(&c) || !participant_ids_norm.contains(&r) {
                    let mut expected = vec![c, r];
                    expected.sort_unstable();
                    expected.dedup();
                    return Err(format!(
                        "threshold-signer: participantIds must include clientParticipantId/relayerParticipantId (expected to include participantIds=[{}], got participantIds=[{}])",
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
            } else if participant_ids_norm.len() > 2 {
                return Err(
                    "threshold-signer: participantIds contains more than 2 ids; set clientParticipantId and relayerParticipantId to select the signer set"
                        .to_string(),
                );
            } else {
                return Err("threshold-signer: participantIds must contain at least 2 ids".to_string());
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
