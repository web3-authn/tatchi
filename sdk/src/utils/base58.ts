import bs58 from 'bs58';

/**
 * Encodes binary data to base58 string using Bitcoin's base58 alphabet.
 * Used extensively in NEAR for account IDs, public keys, hashes, and signatures.
 *
 * @param data - Binary data to encode (Uint8Array, ArrayBuffer, or number[])
 * @returns Base58-encoded string
 */
export const base58Encode = (data: Uint8Array | ArrayBuffer | number[]): string => {
  if (data instanceof ArrayBuffer) {
    return bs58.encode(new Uint8Array(data));
  }
  if (Array.isArray(data)) {
    return bs58.encode(new Uint8Array(data));
  }
  return bs58.encode(data);
};

/**
 * Decodes a base58 string to binary data using Bitcoin's base58 alphabet.
 * Returns a Uint8Array containing the decoded bytes.
 *
 * @param base58String - Base58-encoded string to decode
 * @returns Uint8Array containing the decoded bytes
 * @throws Error if input contains invalid base58 characters
 */
export const base58Decode = (base58String: string): Uint8Array => {
  return bs58.decode(base58String);
};

