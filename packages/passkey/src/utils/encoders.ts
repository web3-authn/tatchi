import bs58 from 'bs58';

/**
 * Encodes an ArrayBuffer to standard base64 format for NEAR RPC compatibility.
 * Uses standard base64 characters (+, /, =) rather than base64url encoding.
 * Converts binary data to base64 string using browser's btoa() function.
 *
 * @param value - ArrayBuffer containing the binary data to encode
 * @returns Standard base64-encoded string with padding
 */
export const base64Encode = (value: ArrayBuffer): string => {
  return btoa(String.fromCharCode(...Array.from(new Uint8Array(value))));
}

/**
 * Decodes a standard base64-encoded string into a Uint8Array.
 * Handles standard base64 format with +, /, and = characters.
 *
 * @param base64 - The base64-encoded string to decode
 * @returns Uint8Array containing the decoded bytes
 * @throws Error if decoding fails due to invalid base64 input
 */
export function base64Decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encodes an ArrayBuffer into a base64url string.
 * Converts binary data to base64 then replaces standard base64 characters with URL-safe ones:
 * + -> -
 * / -> _
 * Removes padding = characters
 *
 * Used for WebAuthn API compatibility in browser environments.
 * Equivalent to Buffer.from(value).toString('base64url') in Node.js.
 *
 * @param value - The ArrayBuffer to encode
 * @returns A base64url-encoded string without padding
 */
export const base64UrlEncode = (value: ArrayBuffer): string => {
  return base64Encode(value)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Decodes a base64url-encoded string into a Uint8Array.
 * Handles base64url format by replacing URL-safe characters and adding padding.
 *
 * @param base64Url - The base64url-encoded string to decode
 * @returns Uint8Array containing the decoded bytes
 * @throws Error if decoding fails due to invalid base64url input
 */
export function base64UrlDecode(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/') + padding;
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

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

/**
 * Converts an ArrayBuffer or ArrayBufferLike object to a plain number array for WASM compatibility.
 * WASM bindings require plain number arrays rather than TypedArrays for memory safety and direct access.
 * The resulting array contains values from 0-255 representing raw bytes.
 *
 * @param buffer - The source buffer to convert, either ArrayBuffer or ArrayBufferLike
 * @returns A plain number[] array containing the buffer's bytes
 */
export const toWasmByteArray = (buffer: ArrayBuffer | ArrayBufferLike): number[] => {
  return Array.from(new Uint8Array(buffer));
}
