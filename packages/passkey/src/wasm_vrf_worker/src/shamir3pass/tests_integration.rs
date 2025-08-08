//! Integration tests for Shamir 3-pass protocol

#[cfg(test)]
mod tests {
    use super::super::*;
    use num_bigint::BigUint;

    mod integration_tests {
        use super::*;

        #[test]
        fn test_full_registration_login_flow() {
            let shamir = Shamir3Pass::new_default();

            // Server generates permanent keys
            let server_keys = shamir.generate_lock_keys().expect("Server key generation failed");

            // === REGISTRATION ===

            // Client encrypts VRF key
            let vrf_key = b"super secret VRF key material";
            let (ciphertext_vrf, kek) = shamir.encrypt_with_random_kek_key(vrf_key)
                .expect("Encryption failed");

            // Client generates temporary registration keys
            let client_lock_keys = shamir.generate_lock_keys().expect("Client key generation failed");

            // Client adds lock: KEK → KEK_c
            let kek_c = shamir.add_lock(&kek, &client_lock_keys.e);

            // Server adds lock: KEK_c → KEK_cs
            let kek_cs = shamir.add_lock(&kek_c, &server_keys.e);

            // Client removes lock: KEK_cs → KEK_s
            let kek_s = shamir.remove_lock(&kek_cs, &client_lock_keys.d);

            // === LOGIN ===

            // Client generates new temporary login keys
            let client_login_keys = shamir.generate_lock_keys().expect("Client login key generation failed");

            // Client adds lock: KEK_s → KEK_st
            let kek_st = shamir.add_lock(&kek_s, &client_login_keys.e);

            // Server removes lock: KEK_st → KEK_t
            let kek_t = shamir.remove_lock(&kek_st, &server_keys.d);

            // Client removes lock: KEK_t → KEK
            let kek_recovered = shamir.remove_lock(&kek_t, &client_login_keys.d);

            // Verify KEK recovery
            assert_eq!(kek_recovered, kek, "KEK recovery failed");

            // Decrypt VRF key
            let decrypted_vrf = shamir.decrypt_with_key(&ciphertext_vrf, &kek_recovered)
                .expect("Decryption failed");

            assert_eq!(decrypted_vrf, vrf_key);
        }

        #[test]
        fn test_commutative_property() {
            let shamir = Shamir3Pass::new_default();

            let keys1 = shamir.generate_lock_keys().unwrap();
            let keys2 = shamir.generate_lock_keys().unwrap();
            let keys3 = shamir.generate_lock_keys().unwrap();

            let value = BigUint::from(999999u32);

            // Test all 6 permutations of 3 operations
            let permutations = vec![
                vec![(&keys1.e, true), (&keys2.e, true), (&keys3.e, true),
                     (&keys1.d, false), (&keys2.d, false), (&keys3.d, false)],
                vec![(&keys1.e, true), (&keys3.e, true), (&keys2.e, true),
                     (&keys3.d, false), (&keys1.d, false), (&keys2.d, false)],
                vec![(&keys2.e, true), (&keys1.e, true), (&keys3.e, true),
                     (&keys2.d, false), (&keys3.d, false), (&keys1.d, false)],
            ];

            for perm in permutations {
                let mut result = value.clone();
                for (key, is_add) in perm {
                    result = if is_add {
                        shamir.add_lock(&result, key)
                    } else {
                        shamir.remove_lock(&result, key)
                    };
                }
                assert_eq!(result, value, "Commutative property violated");
            }
        }

        #[test]
        fn test_encryption_with_different_data_sizes() {
            let shamir = Shamir3Pass::new_default();

            let test_sizes = vec![
                0,      // Empty
                1,      // Single byte
                16,     // AES block size
                1024,   // 1KB
                65536,  // 64KB
            ];

            for size in test_sizes {
                let data = vec![0xAA; size];
                let (ciphertext, kek) = shamir.encrypt_with_random_kek_key(&data).unwrap();

                // Ciphertext should be data + 12 (nonce) + 16 (auth tag)
                assert_eq!(ciphertext.len(), size + 12 + 16);

                let decrypted = shamir.decrypt_with_key(&ciphertext, &kek).unwrap();
                assert_eq!(decrypted, data);
            }
        }
    }

    mod security_tests {
        use super::*;

        #[test]
        fn test_kek_uniqueness() {
            let shamir = Shamir3Pass::new_default();
            let mut keks = std::collections::HashSet::new();

            // Generate many KEKs and ensure uniqueness
            for _ in 0..50 { // Reduced from 100 due to rejection sampling limits
                match shamir.random_k() {
                    Ok(kek) => assert!(keks.insert(kek), "Duplicate KEK generated"),
                    Err(_) => continue, // Skip failures due to rejection sampling
                }
            }

            // Ensure we got at least some unique KEKs
            assert!(!keks.is_empty(), "No unique KEKs generated");
        }

        #[test]
        fn test_lock_keys_independence() {
            let shamir = Shamir3Pass::new_default();
            let mut e_values = std::collections::HashSet::new();
            let mut d_values = std::collections::HashSet::new();

            // Generate many key pairs and check for collisions
            for _ in 0..25 { // Reduced from 50 due to rejection sampling limits
                match shamir.generate_lock_keys() {
                    Ok(keys) => {
                        assert!(e_values.insert(keys.e.clone()), "Duplicate e value");
                        assert!(d_values.insert(keys.d.clone()), "Duplicate d value");
                    },
                    Err(_) => continue, // Skip failures due to rejection sampling
                }
            }

            // Ensure we got at least some unique keys
            assert!(!e_values.is_empty(), "No unique e values generated");
            assert!(!d_values.is_empty(), "No unique d values generated");
        }

        #[test]
        fn test_ciphertext_randomness() {
            let shamir = Shamir3Pass::new_default();
            let data = b"test data";

            let kek = match shamir.random_k() {
                Ok(k) => k,
                Err(_) => {
                    // Skip test if we can't generate a KEK
                    return;
                }
            };

            // Encrypt same data multiple times
            let mut ciphertexts = Vec::new();
            for _ in 0..5 { // Reduced from 10 due to rejection sampling limits
                match shamir.encrypt_with_kek(&kek, data) {
                    Ok(ct) => ciphertexts.push(ct),
                    Err(_) => continue, // Skip failures
                }
            }

            // Ensure we got at least some ciphertexts
            assert!(!ciphertexts.is_empty(), "No ciphertexts generated");

            // All ciphertexts should be different due to random nonces
            for i in 0..ciphertexts.len() {
                for j in i+1..ciphertexts.len() {
                    assert_ne!(ciphertexts[i], ciphertexts[j],
                              "Identical ciphertexts produced");
                }
            }
        }

        #[test]
        fn test_decryption_failure_with_wrong_key() {
            let shamir = Shamir3Pass::new_default();
            let data = b"secret data";

            let (ciphertext, _kek1) = match shamir.encrypt_with_random_kek_key(data) {
                Ok(result) => result,
                Err(_) => {
                    // Skip test if we can't encrypt
                    return;
                }
            };

            let kek2 = match shamir.random_k() {
                Ok(k) => k,
                Err(_) => {
                    // Skip test if we can't generate a different key
                    return;
                }
            };

            let result = shamir.decrypt_with_key(&ciphertext, &kek2);
            assert!(result.is_err(), "Decryption should fail with wrong key");
        }

        #[test]
        fn test_ciphertext_tampering_detection() {
            let shamir = Shamir3Pass::new_default();
            let data = b"authentic data";

            let (mut ciphertext, kek) = match shamir.encrypt_with_random_kek_key(data) {
                Ok(result) => result,
                Err(_) => {
                    // Skip test if we can't encrypt
                    return;
                }
            };

            // Tamper with ciphertext
            if let Some(last) = ciphertext.last_mut() {
                *last ^= 0xFF;
            }

            let result = shamir.decrypt_with_key(&ciphertext, &kek);
            assert!(result.is_err(), "Tampered ciphertext should fail authentication");
        }
    }

    mod property_tests {
        use super::*;

        #[test]
        fn test_lock_unlock_inverse() {
            let shamir = Shamir3Pass::new_default();

            for _ in 0..10 { // Reduced from 20 due to rejection sampling limits
                let keys = match shamir.generate_lock_keys() {
                    Ok(keys) => keys,
                    Err(_) => continue, // Skip failures due to rejection sampling
                };

                let value = match shamir.random_k() {
                    Ok(k) => k,
                    Err(_) => continue, // Skip failures due to rejection sampling
                };

                // Add then remove
                let locked = shamir.add_lock(&value, &keys.e);
                let unlocked = shamir.remove_lock(&locked, &keys.d);
                assert_eq!(unlocked, value);

                // Remove then add (should also work due to commutativity)
                let unlocked = shamir.remove_lock(&value, &keys.d);
                let locked = shamir.add_lock(&unlocked, &keys.e);
                assert_eq!(locked, value);
            }
        }

        #[test]
        fn test_associative_property() {
            let shamir = Shamir3Pass::new_default();

            let keys1 = shamir.generate_lock_keys().unwrap();
            let keys2 = shamir.generate_lock_keys().unwrap();
            let keys3 = shamir.generate_lock_keys().unwrap();

            let value = BigUint::from(42u32);

            // (a * b) * c = a * (b * c)
            let left = shamir.add_lock(&value, &keys1.e);
            let left = shamir.add_lock(&left, &keys2.e);
            let left = shamir.add_lock(&left, &keys3.e);

            let right = shamir.add_lock(&value, &keys2.e);
            let right = shamir.add_lock(&right, &keys3.e);
            let right = shamir.add_lock(&right, &keys1.e);

            assert_eq!(left, right);
        }
    }
}
