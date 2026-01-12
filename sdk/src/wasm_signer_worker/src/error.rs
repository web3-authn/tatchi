use std::fmt;
use wasm_bindgen::JsValue;

// Parse payload error with message name context
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

fn should_redact_parse_payload_details(message_name: &str) -> bool {
    matches!(message_name, "SIGN_TRANSACTION_WITH_KEYPAIR")
}

#[derive(Clone, Copy)]
enum QuoteStyle {
    Plain,
    Escaped,
}

impl QuoteStyle {
    fn value_quote(self) -> &'static str {
        match self {
            QuoteStyle::Plain => "\"",
            QuoteStyle::Escaped => "\\\"",
        }
    }

    fn skip_value(self, s: &str) -> Option<&str> {
        match self {
            QuoteStyle::Plain => skip_quoted_value(s),
            QuoteStyle::Escaped => skip_escaped_quoted_value(s),
        }
    }
}

const REDACTED: &str = "[redacted]";
const KEY_PATTERNS: [(&str, QuoteStyle); 4] = [
    ("\"nearPrivateKey\"", QuoteStyle::Plain),
    ("\"near_private_key\"", QuoteStyle::Plain),
    ("\\\"nearPrivateKey\\\"", QuoteStyle::Escaped),
    ("\\\"near_private_key\\\"", QuoteStyle::Escaped),
];

fn scrub_near_private_key(input: &str) -> String {
    if !input.contains("nearPrivateKey") && !input.contains("near_private_key") {
        return input.to_string();
    }

    let mut output = input.to_string();
    for (pattern, style) in KEY_PATTERNS {
        output = scrub_json_string_field(&output, pattern, style);
    }
    output
}

pub fn scrub_error_message(message: &str) -> String {
    scrub_near_private_key(message)
}

pub fn scrub_js_error_value(err: JsValue) -> JsValue {
    match err.as_string() {
        Some(message) => JsValue::from_str(&scrub_error_message(&message)),
        None => err,
    }
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

        let quote = quote_style.value_quote();
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

fn skip_quoted_value(s: &str) -> Option<&str> {
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

fn format_parse_payload_error(
    message_name: &str,
    serde_error: &serde_wasm_bindgen::Error,
) -> String {
    let message = if should_redact_parse_payload_details(message_name) {
        format!("Invalid payload for {}", message_name)
    } else {
        format!("Invalid payload for {}: {}", message_name, serde_error)
    };
    scrub_error_message(&message)
}

impl fmt::Debug for ParsePayloadError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
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
        JsValue::from_str(&scrub_error_message(&err.to_string()))
    }
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
        JsValue::from_str(&scrub_error_message(&err.to_string()))
    }
}

impl From<String> for KdfError {
    fn from(err: String) -> Self {
        KdfError::Base64DecodeError(err)
    }
}
