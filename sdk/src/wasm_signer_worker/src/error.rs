use std::fmt;
use wasm_bindgen::JsValue;

#[derive(Clone, Copy)]
enum QuoteStyle {
    Plain,
    Escaped,
}

impl QuoteStyle {
    fn quote(self) -> &'static str {
        match self {
            QuoteStyle::Plain => "\"",
            QuoteStyle::Escaped => "\\\"",
        }
    }

    fn skip_value(self, s: &str) -> Option<&str> {
        match self {
            QuoteStyle::Plain => skip_plain_quoted_value(s),
            QuoteStyle::Escaped => skip_escaped_quoted_value(s),
        }
    }
}

const REDACTED: &str = "[REDACTED]";
const SECRET_STRING_FIELDS: [(&str, QuoteStyle); 32] = [
    ("\"nearPrivateKey\"", QuoteStyle::Plain),
    ("\"near_private_key\"", QuoteStyle::Plain),
    ("\\\"nearPrivateKey\\\"", QuoteStyle::Escaped),
    ("\\\"near_private_key\\\"", QuoteStyle::Escaped),
    ("\"wrapKeySeed\"", QuoteStyle::Plain),
    ("\"wrap_key_seed\"", QuoteStyle::Plain),
    ("\\\"wrapKeySeed\\\"", QuoteStyle::Escaped),
    ("\\\"wrap_key_seed\\\"", QuoteStyle::Escaped),
    ("\"prfOutput\"", QuoteStyle::Plain),
    ("\"prf_output\"", QuoteStyle::Plain),
    ("\\\"prfOutput\\\"", QuoteStyle::Escaped),
    ("\\\"prf_output\\\"", QuoteStyle::Escaped),
    ("\"prfFirst\"", QuoteStyle::Plain),
    ("\"prfSecond\"", QuoteStyle::Plain),
    ("\\\"prfFirst\\\"", QuoteStyle::Escaped),
    ("\\\"prfSecond\\\"", QuoteStyle::Escaped),
    ("\"prf_first\"", QuoteStyle::Plain),
    ("\"prf_second\"", QuoteStyle::Plain),
    ("\\\"prf_first\\\"", QuoteStyle::Escaped),
    ("\\\"prf_second\\\"", QuoteStyle::Escaped),
    ("\"chacha20PrfOutput\"", QuoteStyle::Plain),
    ("\"ed25519PrfOutput\"", QuoteStyle::Plain),
    ("\\\"chacha20PrfOutput\\\"", QuoteStyle::Escaped),
    ("\\\"ed25519PrfOutput\\\"", QuoteStyle::Escaped),
    ("\"chacha20PrfOutputBase64\"", QuoteStyle::Plain),
    ("\"ed25519PrfOutputBase64\"", QuoteStyle::Plain),
    ("\\\"chacha20PrfOutputBase64\\\"", QuoteStyle::Escaped),
    ("\\\"ed25519PrfOutputBase64\\\"", QuoteStyle::Escaped),
    ("\"prfSecondB64u\"", QuoteStyle::Plain),
    ("\"prf_second_b64u\"", QuoteStyle::Plain),
    ("\\\"prfSecondB64u\\\"", QuoteStyle::Escaped),
    ("\\\"prf_second_b64u\\\"", QuoteStyle::Escaped),
];

fn scrub_json_string_fields(input: &str, patterns: &[(&str, QuoteStyle)]) -> String {
    let mut output = input.to_string();
    for (pattern, quote_style) in patterns {
        output = scrub_json_string_field(&output, pattern, *quote_style);
    }
    output
}

fn scrub_json_string_field(input: &str, key_pattern: &str, quote_style: QuoteStyle) -> String {
    let mut out = String::with_capacity(input.len());
    let mut rest = input;

    while let Some((before_key, after_key)) = rest.split_once(key_pattern) {
        out.push_str(before_key);
        out.push_str(key_pattern);
        rest = after_key;

        let Some((before_colon, after_colon)) = rest.split_once(':') else {
            out.push_str(rest);
            return out;
        };

        out.push_str(before_colon);
        out.push(':');
        rest = after_colon;

        let (ws, after_ws) = split_while(rest, |ch| ch.is_whitespace());
        out.push_str(ws);
        rest = after_ws;

        let quote = quote_style.quote();
        let Some(after_open) = rest.strip_prefix(quote) else {
            out.push_str(rest);
            return out;
        };

        out.push_str(quote);
        out.push_str(REDACTED);
        out.push_str(quote);

        rest = match quote_style.skip_value(after_open) {
            Some(after_close) => after_close,
            None => return out,
        };
    }

    out.push_str(rest);
    out
}

fn split_while<F>(s: &str, mut pred: F) -> (&str, &str)
where
    F: FnMut(char) -> bool,
{
    let mut end = 0;
    for (idx, ch) in s.char_indices() {
        if pred(ch) {
            end = idx + ch.len_utf8();
        } else {
            break;
        }
    }
    s.split_at(end)
}

fn skip_plain_quoted_value(s: &str) -> Option<&str> {
    let mut escaped = false;
    for (idx, ch) in s.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if ch == '\\' {
            escaped = true;
            continue;
        }
        if ch == '"' {
            return Some(&s[idx + ch.len_utf8()..]);
        }
    }
    None
}

fn skip_escaped_quoted_value(s: &str) -> Option<&str> {
    s.find("\\\"").map(|idx| &s[idx + 2..])
}

pub fn scrub_error_message(message: &str) -> String {
    let scrubbed = scrub_json_string_fields(message, &SECRET_STRING_FIELDS);
    if scrubbed.contains("\"prf\"") || scrubbed.contains("\\\"prf\\\"") {
        scrub_json_string_fields(
            &scrubbed,
            &[
                ("\"first\"", QuoteStyle::Plain),
                ("\"second\"", QuoteStyle::Plain),
                ("\\\"first\\\"", QuoteStyle::Escaped),
                ("\\\"second\\\"", QuoteStyle::Escaped),
            ],
        )
    } else {
        scrubbed
    }
}

pub fn scrub_js_error_value(err: JsValue) -> JsValue {
    if let Some(message) = err.as_string() {
        return JsValue::from_str(&scrub_error_message(&message));
    }
    JsValue::from_str(&scrub_error_message(&format!("{err:?}")))
}

/// Parse payload error with message name context.
///
/// Important: `serde_wasm_bindgen::Error` can embed the full JS value in its
/// Display representation (including secrets).
pub struct ParsePayloadError {
    pub message_name: String,
    pub serde_error: serde_wasm_bindgen::Error,
}

impl ParsePayloadError {
    pub fn new(message_name: &str, serde_error: serde_wasm_bindgen::Error) -> Self {
        Self {
            message_name: message_name.to_string(),
            serde_error,
        }
    }
}

impl fmt::Debug for ParsePayloadError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ParsePayloadError")
            .field("message_name", &self.message_name)
            .field(
                "error",
                &format_parse_payload_error(&self.message_name, &self.serde_error),
            )
            .finish()
    }
}

impl fmt::Display for ParsePayloadError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(
            f,
            "{}",
            format_parse_payload_error(&self.message_name, &self.serde_error)
        )
    }
}

impl From<ParsePayloadError> for String {
    fn from(err: ParsePayloadError) -> Self {
        err.to_string()
    }
}

impl From<ParsePayloadError> for JsValue {
    fn from(err: ParsePayloadError) -> Self {
        scrub_js_error_value(JsValue::from_str(&err.to_string()))
    }
}

fn format_parse_payload_error(
    message_name: &str,
    serde_error: &serde_wasm_bindgen::Error,
) -> String {
    // We rely on scrub_error_message to hide secrets.
    // We want the structural details (e.g. "invalid type: found integer") to remain.
    let message = format!("Invalid payload for {}: {}", message_name, serde_error);
    scrub_error_message(&message)
}

// Custom error type for KDF operations
#[derive(Debug)]
pub enum KdfError {
    JsonParseError(String),
    Base64DecodeError(String),
    InvalidClientData,
    MissingField(&'static str),
    HkdfError,
    InvalidOperationContext,
    InvalidInput(String),
    EncryptionError(String),
}

impl fmt::Display for KdfError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            KdfError::JsonParseError(e) => write!(f, "JSON parse error: {}", e),
            KdfError::Base64DecodeError(e) => write!(f, "Base64 decode error: {}", e),
            KdfError::InvalidClientData => write!(f, "Invalid client data"),
            KdfError::MissingField(field) => write!(f, "Missing field: {}", field),
            KdfError::HkdfError => write!(f, "HKDF operation failed"),
            KdfError::InvalidOperationContext => write!(f, "Invalid operation context"),
            KdfError::InvalidInput(e) => write!(f, "Invalid input: {}", e),
            KdfError::EncryptionError(e) => write!(f, "Encryption error: {}", e),
        }
    }
}

impl From<KdfError> for JsValue {
    fn from(err: KdfError) -> Self {
        scrub_js_error_value(JsValue::from_str(&err.to_string()))
    }
}

impl From<String> for KdfError {
    fn from(err: String) -> Self {
        KdfError::Base64DecodeError(err)
    }
}

#[cfg(test)]
mod tests {
    use super::scrub_error_message;

    #[test]
    fn scrubs_plain_json_string_fields() {
        let input = r#"{"nearPrivateKey":"ed25519:SECRET","wrapKeySeed":"SEED","ok":true}"#;
        let scrubbed = scrub_error_message(input);
        assert!(scrubbed.contains(r#""nearPrivateKey":"[REDACTED]""#));
        assert!(scrubbed.contains(r#""wrapKeySeed":"[REDACTED]""#));
        assert!(scrubbed.contains(r#""ok":true"#));
        assert!(!scrubbed.contains("ed25519:SECRET"));
        assert!(!scrubbed.contains("SEED"));
    }

    #[test]
    fn scrubs_escaped_json_string_fields() {
        let input = r#"{\"nearPrivateKey\":\"ed25519:SECRET\",\"wrapKeySeed\":\"SEED\"}"#;
        let scrubbed = scrub_error_message(input);
        assert!(scrubbed.contains(r#"\"nearPrivateKey\":\"[REDACTED]\""#));
        assert!(scrubbed.contains(r#"\"wrapKeySeed\":\"[REDACTED]\""#));
        assert!(!scrubbed.contains("ed25519:SECRET"));
        assert!(!scrubbed.contains("SEED"));
    }

    #[test]
    fn scrubs_prf_first_second_when_prf_present() {
        let input = r#"{"prf":{"first":"AAA","second":"BBB"}}"#;
        let scrubbed = scrub_error_message(input);
        assert!(scrubbed.contains(r#""first":"[REDACTED]""#));
        assert!(scrubbed.contains(r#""second":"[REDACTED]""#));
        assert!(!scrubbed.contains(r#""first":"AAA""#));
        assert!(!scrubbed.contains(r#""second":"BBB""#));
    }
}
