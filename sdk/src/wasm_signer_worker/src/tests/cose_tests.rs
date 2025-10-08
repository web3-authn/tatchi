use crate::cose::*;
use base64ct::{Base64UrlUnpadded, Encoding};
use ciborium::value::Value as CborValue;

/// Helper function to create a mock attestation object for testing
fn create_mock_attestation_object() -> Vec<u8> {
    // Create mock authenticator data
    let rp_id_hash = vec![0x49u8; 32]; // Mock RP ID hash
    let flags = 0x45u8; // UP=1, UV=1, AT=1
    let counter = 0x00000001u32.to_be_bytes(); // Counter as big-endian
    let aaguid = vec![0x00u8; 16]; // Mock AAGUID
    let cred_id_length = 0x0020u16.to_be_bytes(); // 32 bytes credential ID
    let cred_id = vec![0x42u8; 32]; // Mock credential ID

    // Create mock COSE key
    let mut cose_key_vec = Vec::new();
    cose_key_vec.push((CborValue::Integer(1.into()), CborValue::Integer(2.into()))); // kty: 2 (EC2)
    cose_key_vec.push((
        CborValue::Integer(3.into()),
        CborValue::Integer((-7).into()),
    )); // alg: -7 (ES256)
    cose_key_vec.push((
        CborValue::Integer((-1).into()),
        CborValue::Integer(1.into()),
    )); // crv: 1 (P-256)
    cose_key_vec.push((
        CborValue::Integer((-2).into()),
        CborValue::Bytes(vec![0x42u8; 32]),
    )); // x
    cose_key_vec.push((
        CborValue::Integer((-3).into()),
        CborValue::Bytes(vec![0x84u8; 32]),
    )); // y

    let cose_key = CborValue::Map(cose_key_vec);
    let mut cose_key_bytes = Vec::new();
    ciborium::into_writer(&cose_key, &mut cose_key_bytes).unwrap();

    // Combine all authenticator data
    let mut auth_data = Vec::new();
    auth_data.extend_from_slice(&rp_id_hash);
    auth_data.push(flags);
    auth_data.extend_from_slice(&counter);
    auth_data.extend_from_slice(&aaguid);
    auth_data.extend_from_slice(&cred_id_length);
    auth_data.extend_from_slice(&cred_id);
    auth_data.extend_from_slice(&cose_key_bytes);

    // Create attestation object
    let mut cbor_vec = Vec::new();
    cbor_vec.push((
        CborValue::Text("fmt".to_string()),
        CborValue::Text("none".to_string()),
    ));
    cbor_vec.push((
        CborValue::Text("attStmt".to_string()),
        CborValue::Map(Vec::new()),
    ));
    cbor_vec.push((
        CborValue::Text("authData".to_string()),
        CborValue::Bytes(auth_data),
    ));

    let cbor_attestation = CborValue::Map(cbor_vec);
    let mut buffer = Vec::new();
    ciborium::into_writer(&cbor_attestation, &mut buffer).unwrap();
    buffer
}

#[test]
fn test_parse_attestation_object() {
    let attestation_object_bytes = create_mock_attestation_object();
    let auth_data = parse_attestation_object(&attestation_object_bytes).unwrap();

    // Verify auth data structure
    assert!(auth_data.len() > 37); // Minimum size for valid auth data

    // Check flags byte (should have AT flag set)
    assert_eq!(auth_data[32] & 0x40, 0x40); // AT flag set
}

#[test]
fn test_parse_attestation_object_invalid_cbor() {
    let invalid_cbor = vec![0xFF, 0xFF, 0xFF]; // Invalid CBOR
    let result = parse_attestation_object(&invalid_cbor);
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("Failed to parse CBOR"));
}

#[test]
fn test_parse_attestation_object_missing_auth_data() {
    // Create attestation object without authData
    let mut cbor_vec = Vec::new();
    cbor_vec.push((
        CborValue::Text("fmt".to_string()),
        CborValue::Text("none".to_string()),
    ));
    cbor_vec.push((
        CborValue::Text("attStmt".to_string()),
        CborValue::Map(Vec::new()),
    ));
    // Missing authData

    let cbor_attestation = CborValue::Map(cbor_vec);
    let mut buffer = Vec::new();
    ciborium::into_writer(&cbor_attestation, &mut buffer).unwrap();

    let result = parse_attestation_object(&buffer);
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("authData not found"));
}

#[test]
fn test_parse_authenticator_data() {
    let attestation_object_bytes = create_mock_attestation_object();
    let auth_data = parse_attestation_object(&attestation_object_bytes).unwrap();

    let cose_public_key = parse_authenticator_data(&auth_data).unwrap();
    assert!(!cose_public_key.is_empty());

    // Verify it's a COSE key by parsing the CBOR structure
    let cbor_value: CborValue = ciborium::from_reader(cose_public_key.as_slice()).unwrap();
    assert!(matches!(cbor_value, CborValue::Map(_)));
}

#[test]
fn test_parse_authenticator_data_too_short() {
    let short_auth_data = vec![0x00u8; 36]; // Too short (< 37 bytes)
    let result = parse_authenticator_data(&short_auth_data);
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("Authenticator data too short"));
}

#[test]
fn test_parse_authenticator_data_no_attested_credential() {
    // Create auth data without AT flag
    let mut auth_data = vec![0x00u8; 37];
    auth_data[32] = 0x00; // flags byte without AT flag

    let result = parse_authenticator_data(&auth_data);
    assert!(result.is_err());
    assert!(result
        .unwrap_err()
        .contains("No attested credential data present"));
}

#[test]
fn test_extract_cose_public_key_from_attestation() {
    // Create a mock attestation object and encode to base64url
    let attestation_object_bytes = create_mock_attestation_object();
    let attestation_object_b64u = Base64UrlUnpadded::encode_string(&attestation_object_bytes);

    let cose_key_bytes =
        extract_cose_public_key_from_attestation(&attestation_object_b64u).unwrap();

    // Verify it's a valid COSE key by parsing the CBOR structure
    let cbor_value: CborValue = ciborium::from_reader(cose_key_bytes.as_slice()).unwrap();
    if let CborValue::Map(map) = cbor_value {
        // Check for required COSE key parameters
        let mut has_kty = false;
        let mut has_alg = false;
        for (key, _value) in map.iter() {
            if let CborValue::Integer(key_int) = key {
                let key_val: i128 = (*key_int).into();
                match key_val {
                    1 => has_kty = true, // kty
                    3 => has_alg = true, // alg
                    _ => {}
                }
            }
        }
        assert!(has_kty, "COSE key missing kty parameter");
        assert!(has_alg, "COSE key missing alg parameter");
    } else {
        panic!("COSE key is not a CBOR map");
    }
}

#[test]
fn test_extract_cose_public_key_invalid_base64() {
    let invalid_b64 = "Invalid@Base64!";
    let result = extract_cose_public_key_from_attestation(invalid_b64);
    assert!(result.is_err());
    assert!(result
        .unwrap_err()
        .contains("Failed to decode attestation object"));
}
