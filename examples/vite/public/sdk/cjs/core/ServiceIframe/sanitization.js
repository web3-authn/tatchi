
//#region src/core/ServiceIframe/sanitization.ts
/**
* Security utilities for ServiceIframe HTML generation
* Prevents injection attacks in srcdoc and HTML generation
*/
/**
* Sanitizes sdkBasePath to prevent injection attacks
*
* Removes or normalizes:
* - HTML/JS special characters that could break out of attributes
* - Path traversal attempts (../)
* - Dangerous protocols at the beginning (javascript:, data:, vbscript:)
* - Duplicate slashes, while preserving scheme separators (e.g., https://)
*
* Supports both path-only inputs (e.g., "/sdk") and absolute URLs
* (e.g., "https://wallet.example.com/sdk").
*/
function sanitizeSdkBasePath(path) {
	let p = String(path ?? "").trim();
	p = p.replace(/[<>"']/g, "");
	p = p.replace(/^\s*javascript:/i, "").replace(/^\s*data:/i, "").replace(/^\s*vbscript:/i, "");
	p = p.replace(/\.\./g, "");
	p = p.replace(/([^:])\/{2,}/g, "$1/");
	const isAbsoluteUrl = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(p);
	if (!isAbsoluteUrl) p = p.replace(/^\/+/, "/");
	if (p.length > 1) p = p.replace(/\/$/, "");
	return p;
}
/**
* Escapes HTML attribute values to prevent injection
*
* Converts special characters to HTML entities:
* - & -> &amp;
* - " -> &quot;
* - ' -> &#x27;
* - < -> &lt;
* - > -> &gt;
*/
function escapeHtmlAttribute(value) {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

//#endregion
exports.escapeHtmlAttribute = escapeHtmlAttribute;
exports.sanitizeSdkBasePath = sanitizeSdkBasePath;
//# sourceMappingURL=sanitization.js.map