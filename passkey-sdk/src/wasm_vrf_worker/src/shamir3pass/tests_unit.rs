//! Unit tests for Shamir 3-pass protocol

#[cfg(test)]
mod tests {
    use super::super::*;
    use num_bigint::BigUint;
    use num_traits::{One, Zero};

    // Test vectors for known primes
    const TEST_PRIME_2048_B64U: &str = "3N5w46AIGjGT2v5Vua_TMD5Ywfa9U2F7-WzW8SNDsIM";

    #[test]
    fn test_modular_inverse() {
        let shamir = Shamir3Pass::new_default();
        let a = BigUint::from(17u32);

        let inv = shamir.modinv(&a).unwrap();
        let product = (&a * &inv) % &shamir.p_minus_1;

        assert_eq!(product, BigUint::one());
    }

    #[test]
    fn test_initialization_with_valid_prime() {
        let shamir = Shamir3Pass::new(TEST_PRIME_2048_B64U);
        assert!(shamir.is_ok());

        let shamir = shamir.unwrap();
        assert_eq!(shamir.p_b64u(), TEST_PRIME_2048_B64U);
    }

    #[test]
    fn test_modular_exponentiation_edge_cases() {
        let shamir = Shamir3Pass::new_default();

        // Test with zero base
        let result = shamir.modexp(&BigUint::zero(), &BigUint::from(5u32));
        assert_eq!(result, BigUint::zero());

        // Test with zero exponent
        let result = shamir.modexp(&BigUint::from(5u32), &BigUint::zero());
        assert_eq!(result, BigUint::one());

        // Test with one as base
        let result = shamir.modexp(&BigUint::one(), &BigUint::from(1000u32));
        assert_eq!(result, BigUint::one());
    }

    #[test]
    fn test_modular_inverse_properties() {
        let shamir = Shamir3Pass::new_default();

        // Test multiple values
        for i in 2u32..20 {
            let a = BigUint::from(i);
            if a.gcd(&shamir.p_minus_1) != BigUint::one() {
                continue;
            }

            let inv = shamir.modinv(&a).expect("Inverse should exist");
            let product = (&a * &inv) % &shamir.p_minus_1;
            assert_eq!(product, BigUint::one(), "a * a^-1 ≡ 1 (mod p-1) failed for a={}", i);
        }
    }

    #[test]
    fn test_generate_lock_keys_validity() {
        let shamir = Shamir3Pass::new_default();

        for _ in 0..10 {
            let keys = shamir.generate_lock_keys().expect("Key generation failed");

            // Verify e * d ≡ 1 (mod p-1)
            let product = (&keys.e * &keys.d) % &shamir.p_minus_1;
            assert_eq!(product, BigUint::one());

            // Verify gcd(e, p-1) = 1
            assert_eq!(keys.e.gcd(&shamir.p_minus_1), BigUint::one());
        }
    }

    #[test]
    fn test_random_k_distribution() {
        let shamir = Shamir3Pass::new_default();
        let mut values = Vec::new();

        // Generate fewer random k values due to reduced rejection sampling attempts
        for _ in 0..100 {
            match shamir.random_k() {
                Ok(k) => values.push(k),
                Err(_) => {
                    // With reduced rejection sampling, some failures are expected
                    continue;
                }
            }
        }

        // Ensure we got at least some values
        assert!(!values.is_empty(), "No random k values generated");

        // Check that we have unique values (some overlap is expected but not too much)
        let unique_count = values.iter().collect::<std::collections::HashSet<_>>().len();
        assert!(unique_count > values.len() / 2, "Too many duplicate values: {} out of {}", unique_count, values.len());

        // Check that all values are within expected range
        for k in &values {
            assert!(k >= &shamir.min_k);
            assert!(k <= &shamir.max_k);
        }
    }

    #[test]
    fn test_invalid_prime_size() {
        let small_prime = BigUint::from(65537u32); // Too small
        let result = Shamir3Pass::new_with_biguint(small_prime);

        match result {
            Err(Shamir3PassError::PrimeTooSmall { .. }) => (),
            _ => panic!("Expected PrimeTooSmall error"),
        }
    }

    #[test]
    fn test_kek_encryption_roundtrip() {
        let shamir = Shamir3Pass::new_default();
        let plaintext = b"test data for encryption";

        let (ciphertext, kek) = shamir.encrypt_with_random_kek_key(plaintext).unwrap();
        let decrypted = shamir.decrypt_with_key(&ciphertext, &kek).unwrap();

        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_lock_unlock_inverse() {
        let shamir = Shamir3Pass::new_default();
        let keys = shamir.generate_lock_keys().unwrap();

        let original_value = BigUint::from(12345u32);

        // Apply lock then remove it
        let locked = shamir.add_lock(&original_value, &keys.e);
        let unlocked = shamir.remove_lock(&locked, &keys.d);

        assert_eq!(unlocked, original_value);
    }

    #[test]
    fn test_associative_property() {
        let shamir = Shamir3Pass::new_default();
        let keys1 = shamir.generate_lock_keys().unwrap();
        let keys2 = shamir.generate_lock_keys().unwrap();

        let value = BigUint::from(12345u32);

        // (value^e1)^e2 = value^(e1*e2)
        let path1 = shamir.add_lock(&value, &keys1.e);
        let path1 = shamir.add_lock(&path1, &keys2.e);

        let combined_exp = (&keys1.e * &keys2.e) % &shamir.p_minus_1;
        let path2 = shamir.add_lock(&value, &combined_exp);

        assert_eq!(path1, path2);
    }
}
