/**
 * Encodes binary data to standard base64 format for NEAR RPC compatibility.
 * Uses standard base64 characters (+, /, =) rather than base64url encoding.
 *
 * Important: Avoids spreading large arrays into String.fromCharCode(...) which
 * can overflow the JS call stack when encoding big WASM binaries.
 *
 * @param value - ArrayBufferLike or ArrayBufferView containing the binary data to encode
 * @returns Standard base64-encoded string with padding
 */
export const base64Encode = (value: ArrayBufferLike | ArrayBufferView): string => {
  const bytes = ArrayBuffer.isView(value)
    ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    : new Uint8Array(value);
  let binary = '';
  // Build the string incrementally to avoid exceeding the argument limit.
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
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
 * @param value - The ArrayBufferLike or ArrayBufferView to encode
 * @returns A base64url-encoded string without padding
 */
export const base64UrlEncode = (value: ArrayBufferLike | ArrayBufferView): string => {
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
