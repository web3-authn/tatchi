// === SHARED SERDE HELPERS FOR WASM-FRIENDLY TYPES ===
//
// These helpers live in a dedicated module so they can be reused across
// NEAR types without cluttering core type definitions. They focus on
// serde shapes that play nicely with both JSON and serde_wasm_bindgen
// (e.g. accepting JS arrays and Uint8Array for fixed-size byte arrays).

pub mod serde_array_32 {
    use serde::de::{Error, SeqAccess, Visitor};
    use serde::{Deserializer, Serializer};

    pub fn serialize<S>(value: &[u8; 32], serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        use serde::ser::SerializeTuple;
        let mut seq = serializer.serialize_tuple(32)?;
        for elem in value {
            seq.serialize_element(elem)?;
        }
        seq.end()
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<[u8; 32], D::Error>
    where
        D: Deserializer<'de>,
    {
        struct ArrVisitor;

        impl<'de> Visitor<'de> for ArrVisitor {
            type Value = [u8; 32];

            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("an array of 32 bytes")
            }

            fn visit_seq<A>(self, mut seq: A) -> Result<[u8; 32], A::Error>
            where
                A: SeqAccess<'de>,
            {
                let mut arr = [0u8; 32];
                for i in 0..32 {
                    arr[i] = seq
                        .next_element()?
                        .ok_or_else(|| Error::invalid_length(i, &self))?;
                }
                Ok(arr)
            }

            fn visit_bytes<E>(self, v: &[u8]) -> Result<[u8; 32], E>
            where
                E: Error,
            {
                if v.len() != 32 {
                    return Err(Error::invalid_length(v.len(), &self));
                }
                let mut arr = [0u8; 32];
                arr.copy_from_slice(v);
                Ok(arr)
            }
        }

        deserializer.deserialize_tuple(32, ArrVisitor)
    }
}

pub mod serde_array_64 {
    use serde::de::{Error, SeqAccess, Visitor};
    use serde::{Deserializer, Serializer};

    pub fn serialize<S>(value: &[u8; 64], serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        use serde::ser::SerializeTuple;
        let mut seq = serializer.serialize_tuple(64)?;
        for elem in value {
            seq.serialize_element(elem)?;
        }
        seq.end()
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<[u8; 64], D::Error>
    where
        D: Deserializer<'de>,
    {
        struct ArrVisitor;

        impl<'de> Visitor<'de> for ArrVisitor {
            type Value = [u8; 64];

            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("an array of 64 bytes")
            }

            fn visit_seq<A>(self, mut seq: A) -> Result<[u8; 64], A::Error>
            where
                A: SeqAccess<'de>,
            {
                let mut arr = [0u8; 64];
                for i in 0..64 {
                    arr[i] = seq
                        .next_element()?
                        .ok_or_else(|| Error::invalid_length(i, &self))?;
                }
                Ok(arr)
            }

            fn visit_bytes<E>(self, v: &[u8]) -> Result<[u8; 64], E>
            where
                E: Error,
            {
                if v.len() != 64 {
                    return Err(Error::invalid_length(v.len(), &self));
                }
                let mut arr = [0u8; 64];
                arr.copy_from_slice(v);
                Ok(arr)
            }
        }

        deserializer.deserialize_tuple(64, ArrVisitor)
    }
}
