use crate::crypto::WrapKey;
use crate::encoders::{base64_url_decode, base64_url_encode};
use curve25519_dalek::constants::ED25519_BASEPOINT_POINT;
use curve25519_dalek::scalar::Scalar as CurveScalar;
use hkdf::Hkdf;
use sha2::Sha256;

pub(crate) const THRESHOLD_CLIENT_SHARE_SALT_V1: &[u8] =
    b"tatchi-threshold-ed25519-client-share:v1";

pub(crate) fn derive_threshold_client_share_scalar_v1(
    wrap_key: &WrapKey,
    near_account_id: &str,
) -> Result<CurveScalar, String> {
    let seed_bytes = base64_url_decode(&wrap_key.wrap_key_seed)?;
    if seed_bytes.len() != 32 {
        return Err(format!(
            "threshold-signer: invalid WrapKeySeed length: expected 32 bytes, got {}",
            seed_bytes.len()
        ));
    }

    let hk = Hkdf::<Sha256>::new(Some(THRESHOLD_CLIENT_SHARE_SALT_V1), &seed_bytes);
    let mut okm = [0u8; 64];
    hk.expand(near_account_id.as_bytes(), &mut okm)
        .map_err(|_| "threshold-signer: HKDF expand failed".to_string())?;

    let scalar = CurveScalar::from_bytes_mod_order_wide(&okm);
    if scalar == CurveScalar::ZERO {
        return Err("threshold-signer: derived client signing share is zero".to_string());
    }
    Ok(scalar)
}

pub(crate) fn derive_threshold_client_signing_share_bytes_v1(
    wrap_key: &WrapKey,
    near_account_id: &str,
) -> Result<[u8; 32], String> {
    Ok(derive_threshold_client_share_scalar_v1(wrap_key, near_account_id)?.to_bytes())
}

pub(crate) fn derive_threshold_client_verifying_share_bytes_v1(
    wrap_key: &WrapKey,
    near_account_id: &str,
) -> Result<[u8; 32], String> {
    let scalar = derive_threshold_client_share_scalar_v1(wrap_key, near_account_id)?;
    Ok((ED25519_BASEPOINT_POINT * scalar).compress().to_bytes())
}

pub(crate) fn derive_threshold_client_verifying_share_b64u_v1(
    wrap_key: &WrapKey,
    near_account_id: &str,
) -> Result<String, String> {
    let bytes = derive_threshold_client_verifying_share_bytes_v1(wrap_key, near_account_id)?;
    Ok(base64_url_encode(&bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::WrapKey;
    use crate::encoders::base64_url_encode;

    #[test]
    fn derive_client_share_is_deterministic_and_matches_verifying_share() {
        let wrap_key = WrapKey {
            wrap_key_seed: base64_url_encode(&[7u8; 32]),
            wrap_key_salt: base64_url_encode(&[9u8; 32]),
        };

        let s1 = derive_threshold_client_signing_share_bytes_v1(&wrap_key, "alice.near")
            .expect("signing share should derive");
        let s2 = derive_threshold_client_signing_share_bytes_v1(&wrap_key, "alice.near")
            .expect("signing share should derive");
        assert_eq!(s1, s2);

        let v1 = derive_threshold_client_verifying_share_bytes_v1(&wrap_key, "alice.near")
            .expect("verifying share should derive");
        let scalar = CurveScalar::from_bytes_mod_order(s1);
        let expected = (ED25519_BASEPOINT_POINT * scalar).compress().to_bytes();
        assert_eq!(v1, expected);

        let different_account =
            derive_threshold_client_signing_share_bytes_v1(&wrap_key, "bob.near")
                .expect("signing share should derive");
        assert_ne!(s1, different_account);
    }

    #[test]
    fn derive_client_share_rejects_invalid_seed_length() {
        let wrap_key = WrapKey {
            wrap_key_seed: base64_url_encode(&[1u8; 31]),
            wrap_key_salt: base64_url_encode(&[2u8; 32]),
        };

        let err = derive_threshold_client_signing_share_bytes_v1(&wrap_key, "alice.near")
            .unwrap_err();
        assert!(err.contains("expected 32 bytes"), "unexpected error: {err}");
    }
}
