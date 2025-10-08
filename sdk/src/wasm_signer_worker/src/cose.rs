use ciborium::Value as CborValue;
use log::debug;

use crate::encoders::base64_url_decode;

/// Parse WebAuthn attestation object to extract authData
pub fn parse_attestation_object(attestation_object_bytes: &[u8]) -> Result<Vec<u8>, String> {
    let cbor_value: CborValue = ciborium::from_reader(attestation_object_bytes)
        .map_err(|e| format!("Failed to parse CBOR: {}", e))?;

    if let CborValue::Map(map) = cbor_value {
        // Extract authData (required)
        for (key, value) in map.iter() {
            if let CborValue::Text(key_str) = key {
                if key_str == "authData" {
                    if let CborValue::Bytes(auth_data_bytes) = value {
                        return Ok(auth_data_bytes.clone());
                    }
                }
            }
        }
        Err("authData not found in attestation object".to_string())
    } else {
        Err("Attestation object is not a CBOR map".to_string())
    }
}

/// Parse authenticator data to extract COSE public key
pub fn parse_authenticator_data(auth_data_bytes: &[u8]) -> Result<Vec<u8>, String> {
    if auth_data_bytes.len() < 37 {
        return Err("Authenticator data too short".to_string());
    }

    let flags = auth_data_bytes[32];

    // Check if attested credential data is present (AT flag = bit 6)
    if (flags & 0x40) == 0 {
        return Err("No attested credential data present".to_string());
    }

    let mut offset = 37; // Skip rpIdHash(32) + flags(1) + counter(4)

    // Skip AAGUID (16 bytes)
    if auth_data_bytes.len() < offset + 16 {
        return Err("Authenticator data too short for AAGUID".to_string());
    }
    offset += 16;

    // Get credential ID length (2 bytes, big-endian)
    if auth_data_bytes.len() < offset + 2 {
        return Err("Authenticator data too short for credential ID length".to_string());
    }
    let cred_id_length =
        u16::from_be_bytes([auth_data_bytes[offset], auth_data_bytes[offset + 1]]) as usize;
    offset += 2;

    // Skip credential ID
    if auth_data_bytes.len() < offset + cred_id_length {
        return Err("Authenticator data too short for credential ID".to_string());
    }
    offset += cred_id_length;

    // The rest is the credential public key (COSE format)
    let credential_public_key = auth_data_bytes[offset..].to_vec();
    Ok(credential_public_key)
}

/// Extract COSE public key from WebAuthn attestation object
pub fn extract_cose_public_key_from_attestation(
    attestation_object_b64u: &str,
) -> Result<Vec<u8>, String> {
    debug!("Extracting COSE public key from attestation object");

    // Decode the base64url attestation object
    let attestation_object_bytes = base64_url_decode(attestation_object_b64u)
        .map_err(|e| format!("Failed to decode attestation object: {:?}", e))?;

    // Parse the attestation object to get authData
    let auth_data_bytes = parse_attestation_object(&attestation_object_bytes)?;

    // Extract the COSE public key from authenticator data
    let cose_public_key_bytes = parse_authenticator_data(&auth_data_bytes)?;

    debug!(
        "Successfully extracted COSE public key ({} bytes)",
        cose_public_key_bytes.len()
    );
    Ok(cose_public_key_bytes)
}
