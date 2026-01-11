use std::collections::BTreeMap;

use ed25519_dalek::Verifier;
use frost_ed25519 as frost;

#[test]
fn frost_ed25519_signatures_verify_with_ed25519_dalek() -> Result<(), frost::Error> {
    let mut rng = frost::rand_core::OsRng;

    // 2-of-2 dealer keygen (matches our initial threshold model).
    let (shares, pubkey_package) =
        frost::keys::generate_with_dealer(2, 2, frost::keys::IdentifierList::Default, &mut rng)?;

    // Each participant validates + stores its key package.
    let mut key_packages: BTreeMap<frost::Identifier, frost::keys::KeyPackage> = BTreeMap::new();
    for (identifier, secret_share) in shares {
        let key_package = frost::keys::KeyPackage::try_from(secret_share)?;
        key_packages.insert(identifier, key_package);
    }

    // Round 1: each participant generates nonces + commitments.
    let message = b"hello threshold schnorr";
    let mut nonces_map = BTreeMap::new();
    let mut commitments_map = BTreeMap::new();
    for identifier in key_packages.keys() {
        let key_package = &key_packages[identifier];
        let (nonces, commitments) = frost::round1::commit(key_package.signing_share(), &mut rng);
        nonces_map.insert(*identifier, nonces);
        commitments_map.insert(*identifier, commitments);
    }

    // Coordinator builds signing package.
    let signing_package = frost::SigningPackage::new(commitments_map, message);

    // Round 2: each participant produces a signature share.
    let mut signature_shares = BTreeMap::new();
    for identifier in nonces_map.keys() {
        let key_package = &key_packages[identifier];
        let nonces = &nonces_map[identifier];
        let sig_share = frost::round2::sign(&signing_package, nonces, key_package)?;
        signature_shares.insert(*identifier, sig_share);
    }

    // Aggregate signature shares into a full signature.
    let group_signature = frost::aggregate(&signing_package, &signature_shares, &pubkey_package)?;

    // FROST verifier should accept the signature.
    assert!(pubkey_package
        .verifying_key()
        .verify(message, &group_signature)
        .is_ok());

    // Confirm compatibility with standard Ed25519 (NEAR) verification.
    let sig_bytes = group_signature.serialize()?;
    assert_eq!(sig_bytes.len(), 64);
    let pk_bytes = pubkey_package.verifying_key().serialize()?;
    assert_eq!(pk_bytes.len(), 32);

    let pk: [u8; 32] = pk_bytes
        .as_slice()
        .try_into()
        .expect("verifying key must be 32 bytes");
    let sig: [u8; 64] = sig_bytes
        .as_slice()
        .try_into()
        .expect("signature must be 64 bytes");

    let dalek_vk =
        ed25519_dalek::VerifyingKey::from_bytes(&pk).expect("ed25519 public key should be valid");
    let dalek_sig = ed25519_dalek::Signature::from_bytes(&sig);

    dalek_vk
        .verify(message, &dalek_sig)
        .expect("ed25519-dalek should verify FROST signature bytes");

    Ok(())
}

#[test]
fn frost_detects_tampered_signature_share() -> Result<(), frost::Error> {
    let mut rng = frost::rand_core::OsRng;

    let (shares, pubkey_package) =
        frost::keys::generate_with_dealer(2, 2, frost::keys::IdentifierList::Default, &mut rng)?;

    let mut key_packages: BTreeMap<frost::Identifier, frost::keys::KeyPackage> = BTreeMap::new();
    for (identifier, secret_share) in shares {
        key_packages.insert(identifier, frost::keys::KeyPackage::try_from(secret_share)?);
    }

    let message = b"tamper test";
    let mut nonces_map = BTreeMap::new();
    let mut commitments_map = BTreeMap::new();
    for identifier in key_packages.keys() {
        let (nonces, commitments) =
            frost::round1::commit(key_packages[identifier].signing_share(), &mut rng);
        nonces_map.insert(*identifier, nonces);
        commitments_map.insert(*identifier, commitments);
    }

    let signing_package = frost::SigningPackage::new(commitments_map, message);

    let mut signature_shares = BTreeMap::new();
    for identifier in nonces_map.keys() {
        let sig_share = frost::round2::sign(
            &signing_package,
            &nonces_map[identifier],
            &key_packages[identifier],
        )?;
        signature_shares.insert(*identifier, sig_share);
    }

    // Tamper: flip one bit in one participant's share serialization and re-deserialize.
    let (first_id, first_share) = signature_shares
        .iter()
        .next()
        .expect("at least one signature share");
    let mut bytes = first_share.serialize();
    bytes[0] ^= 0x01;
    let tampered = frost::round2::SignatureShare::deserialize(&bytes)?;
    signature_shares.insert(*first_id, tampered);

    let err = frost::aggregate(&signing_package, &signature_shares, &pubkey_package).unwrap_err();
    let msg = format!("{err}");
    assert!(
        msg.contains("InvalidSignature") || msg.contains("Invalid signature"),
        "unexpected error: {msg}"
    );

    Ok(())
}
