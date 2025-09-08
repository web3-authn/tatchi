//#region src/utils/base64.ts
/**
* Encodes an ArrayBuffer to standard base64 format for NEAR RPC compatibility.
* Uses standard base64 characters (+, /, =) rather than base64url encoding.
* Converts binary data to base64 string using browser's btoa() function.
*
* @param value - ArrayBuffer containing the binary data to encode
* @returns Standard base64-encoded string with padding
*/
const base64Encode = (value) => {
	return btoa(String.fromCharCode(...Array.from(new Uint8Array(value))));
};
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
const base64UrlEncode = (value) => {
	return base64Encode(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
};
/**
* Decodes a base64url-encoded string into a Uint8Array.
* Handles base64url format by replacing URL-safe characters and adding padding.
*
* @param base64Url - The base64url-encoded string to decode
* @returns Uint8Array containing the decoded bytes
* @throws Error if decoding fails due to invalid base64url input
*/
function base64UrlDecode(base64Url) {
	const padding = "=".repeat((4 - base64Url.length % 4) % 4);
	const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/") + padding;
	const binaryString = atob(base64);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
	return bytes;
}

//#endregion
export { base64Encode, base64UrlDecode, base64UrlEncode };