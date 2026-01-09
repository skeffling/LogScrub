use crate::validators;
use once_cell::sync::Lazy;
use regex::Regex;

#[derive(Debug, Clone)]
pub struct Match {
    pub pii_type: String,
    pub value: String,
    pub start: usize,
    pub end: usize,
}

struct PatternDef {
    id: &'static str,
    regex: &'static Lazy<Regex>,
    validator: Option<fn(&str) -> bool>,
}

static EMAIL_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b").unwrap());

// RFC 2822 Message-ID format: <unique-id@domain>
static EMAIL_MESSAGE_ID_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"<[A-Za-z0-9!#$%&'*+/=?^_`.{|}~-]+@[A-Za-z0-9.-]+>").unwrap());

static IPV4_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(?::\d{1,5})?\b",
    )
    .unwrap()
});

static IPV6_REGEX: Lazy<Regex> = Lazy::new(|| {
    // IPv6 regex covering: full form, compressed forms, bracketed (URL), link-local with zone, IPv4-mapped
    // Order matters: more specific patterns first, longer matches preferred
    Regex::new(concat!(
        r"(?i)",
        // Bracketed forms for URLs [::1]:port, [2001:db8::1]:443, etc.
        r"\[(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\](?::\d{1,5})?|",
        r"\[(?:[0-9a-f]{1,4}:){1,6}:[0-9a-f]{1,4}\](?::\d{1,5})?|",
        r"\[(?:[0-9a-f]{1,4}:){1,5}(?::[0-9a-f]{1,4}){1,2}\](?::\d{1,5})?|",
        r"\[(?:[0-9a-f]{1,4}:){1,4}(?::[0-9a-f]{1,4}){1,3}\](?::\d{1,5})?|",
        r"\[(?:[0-9a-f]{1,4}:){1,3}(?::[0-9a-f]{1,4}){1,4}\](?::\d{1,5})?|",
        r"\[(?:[0-9a-f]{1,4}:){1,2}(?::[0-9a-f]{1,4}){1,5}\](?::\d{1,5})?|",
        r"\[[0-9a-f]{1,4}:(?::[0-9a-f]{1,4}){1,6}\](?::\d{1,5})?|",
        r"\[::(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4}\](?::\d{1,5})?|",
        r"\[(?:[0-9a-f]{1,4}:){1,7}:\](?::\d{1,5})?|",
        r"\[::\](?::\d{1,5})?|",
        // Link-local with zone ID: fe80::1%eth0
        r"fe80:(?::[0-9a-f]{0,4}){0,4}%[a-zA-Z0-9._-]+|",
        // IPv4-mapped: ::ffff:192.168.1.1 or ::192.168.1.1
        r"::(?:ffff(?::0{1,4})?:)?(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)|",
        r"(?:[0-9a-f]{1,4}:){1,4}:(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)|",
        // Full form: 8 groups
        r"\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\b|",
        // Compressed forms with :: in middle (most common case for addresses like fd00:53:2::143:a2)
        r"\b(?:[0-9a-f]{1,4}:){1,6}:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,5}\b|",
        r"\b(?:[0-9a-f]{1,4}:){1,5}(?::[0-9a-f]{1,4}){1,2}\b|",
        r"\b(?:[0-9a-f]{1,4}:){1,4}(?::[0-9a-f]{1,4}){1,3}\b|",
        r"\b(?:[0-9a-f]{1,4}:){1,3}(?::[0-9a-f]{1,4}){1,4}\b|",
        r"\b(?:[0-9a-f]{1,4}:){1,2}(?::[0-9a-f]{1,4}){1,5}\b|",
        r"\b[0-9a-f]{1,4}:(?::[0-9a-f]{1,4}){1,6}\b|",
        // Ends with :: (trailing compression)
        r"\b(?:[0-9a-f]{1,4}:){1,7}:|",
        // Starts with :: (leading compression) - use word boundary simulation
        r"(?:^|[^0-9a-f:])::(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4}\b|",
        // Just :: (all zeros)
        r"(?:^|[^0-9a-f:])::"
    )).unwrap()
});

static MAC_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)\b(?:[0-9A-F]{2}[:-]){5}[0-9A-F]{2}\b").unwrap());

static HOSTNAME_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+(?:com|org|net|edu|gov|mil|co|io|dev|app|uk|de|fr|jp|cn|au|ca|us|info|biz)\b").unwrap()
});

static URL_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"https?://[^\s<>\[\]{}|\\^`\x00-\x1f\x7f]+").unwrap());

static SSN_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b").unwrap());

static CREDIT_CARD_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b",
    )
    .unwrap()
});

static JWT_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+").unwrap());

static PHONE_US_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\b(?:\+?1[-.\s]?)?(?:\([0-9]{3}\)[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}|[0-9]{3}[-.\s][0-9]{3}[-.\s]?[0-9]{4})\b").unwrap()
});

static PHONE_UK_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\b(?:0[1-9][0-9]{8,9}|0[1-9][0-9]{2,4}[\s-][0-9]{3,4}[\s-]?[0-9]{3,4})\b").unwrap()
});

static PHONE_INTL_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\+[1-9][0-9]{1,3}[\s-]?[0-9]{6,14}\b").unwrap());

static UUID_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b").unwrap()
});

static IBAN_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\b[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}(?:[A-Z0-9]?){0,16}\b").unwrap()
});

static AWS_ACCESS_KEY_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b").unwrap());

static AWS_SECRET_KEY_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)(?:aws.?secret|secret.?access)[^a-z0-9]*['"]?([a-z0-9/+=]{40})['"]?"#)
        .unwrap()
});

static STRIPE_KEY_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b(?:sk|pk)_(?:test|live)_[0-9a-zA-Z]{24,}\b").unwrap());

static GCP_API_KEY_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\bAIza[0-9A-Za-z_-]{35}\b").unwrap());

static GITHUB_TOKEN_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b").unwrap());

static BEARER_TOKEN_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)bearer[ \t]+[a-z0-9_-]+\.[a-z0-9_-]+\.?[a-z0-9_-]*").unwrap());

static GENERIC_SECRET_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|auth[_-]?token|access[_-]?token)[ \t]*[:=][ \t]*['"]?([^\s'"]{8,})['"]?"#).unwrap()
});

static BTC_ADDRESS_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b(?:bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}\b").unwrap());

static ETH_ADDRESS_REGEX: Lazy<Regex> = Lazy::new(|| Regex::new(r"\b0x[a-fA-F0-9]{40}\b").unwrap());

static GPS_COORD_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"-?(?:[1-8]?[0-9](?:\.[0-9]{4,})?|90(?:\.0+)?)[ \t]*,[ \t]*-?(?:1[0-7][0-9]|[1-9]?[0-9])(?:\.[0-9]{4,})?").unwrap()
});

static FILE_PATH_UNIX_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?:/(?:home|Users)/[a-zA-Z0-9_-]+(?:/[a-zA-Z0-9._-]+)+)").unwrap());

static FILE_PATH_WIN_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)[a-z]:\\(?:Users|Documents and Settings)\\[^\s\\]+(?:\\[^\s\\]+)*").unwrap()
});

static POSTCODE_UK_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)\b[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}\b").unwrap());

static POSTCODE_US_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b[0-9]{5}(?:-[0-9]{4})?\b").unwrap());

static PASSPORT_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)\bpassport[:\s#]*[A-Z]{1,2}[0-9]{6,9}\b").unwrap());

static DRIVERS_LICENSE_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(?:d\.?l\.?|driver'?s?[ \t]*(?:license|lic))[: \t#]*[A-Z0-9]{5,15}\b")
        .unwrap()
});

static SESSION_ID_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)(?:session[_-]?id|sid|jsessionid|phpsessid|aspsessionid)[=:\s]*[a-z0-9_-]{16,}",
    )
    .unwrap()
});

static PRIVATE_KEY_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----").unwrap()
});

static SLACK_TOKEN_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\bxox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*\b").unwrap());

static BASIC_AUTH_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)basic[ \t]+[a-z0-9+/]+=*").unwrap());

static URL_CREDENTIALS_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"(?i)(?:https?|ftp)://[^/:@\s"']+:[^@\s"']+@[^\s/"']+"#).unwrap());

static DB_CONNECTION_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)(?:mongodb|postgres|postgresql|mysql|redis|amqp|mssql)://[^\s]+").unwrap()
});

static NPM_TOKEN_REGEX: Lazy<Regex> = Lazy::new(|| Regex::new(r"\bnpm_[A-Za-z0-9]{36}\b").unwrap());

static SENDGRID_KEY_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b").unwrap());

static TWILIO_KEY_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b(?:AC|SK)[a-f0-9]{32}\b").unwrap());

static OPENAI_KEY_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\bsk-(?:proj-)?[a-zA-Z0-9]{32,64}\b").unwrap());

static ANTHROPIC_KEY_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\bsk-ant-[a-zA-Z0-9_-]{32,64}\b").unwrap());

static XAI_KEY_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\bxai-[a-zA-Z0-9]{32,64}\b").unwrap());

static CEREBRAS_KEY_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\bcsk-[a-zA-Z0-9]{40,50}\b").unwrap());

// UK Patterns
static UK_NHS_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b([0-9]{3})[- ]?([0-9]{3})[- ]?([0-9]{4})\b").unwrap());

// UK National Insurance - simplified regex, validation done in validator
static UK_NINO_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b[A-Z]{2}\s?[0-9]{2}\s?[0-9]{2}\s?[0-9]{2}\s?[A-D]\b").unwrap()
});

// US Additional Patterns
static US_ITIN_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\b9[0-9]{2}[- ]?(5[0-9]|6[0-5]|7[0-9]|8[0-8]|9[0-24-9])[- ]?[0-9]{4}\b").unwrap()
});

// Australia Patterns
static AU_TFN_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b[0-9]{3}\s?[0-9]{3}\s?[0-9]{3}\b").unwrap());

// India Patterns
static IN_PAN_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b[A-Z]{3}[ABCFGHLJPT][A-Z][0-9]{4}[A-Z]\b").unwrap());

// Singapore Patterns
static SG_NRIC_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)\b[STFGM][0-9]{7}[A-Z]\b").unwrap());

// High entropy secret detection - matches potential tokens/passwords
// Simple pattern: quoted strings 8-64 chars with mixed characters
static HIGH_ENTROPY_SECRET_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"['"][A-Za-z0-9!@#$%^&*_+\-]{8,64}['"]"#).unwrap()
});

static DATE_MDY_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12][0-9]|3[01])[/-](?:19|20)?[0-9]{2}\b")
        .unwrap()
});

static DATE_DMY_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\b(?:0?[1-9]|[12][0-9]|3[01])[/-](?:0?[1-9]|1[0-2])[/-](?:19|20)?[0-9]{2}\b")
        .unwrap()
});

static DATE_ISO_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\b(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])\b").unwrap()
});

static TIME_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\b(?:[01]?[0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?(?:[ \t]*[AaPp][Mm])?\b")
        .unwrap()
});

static DATETIME_ISO_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\b(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])[T\s](?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]+)?(?:Z|[+-][0-9]{2}:?[0-9]{2})?\b").unwrap()
});

static DATETIME_CLF_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\[?\d{1,2}/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/\d{4}:\d{2}:\d{2}:\d{2}[ \t]*[+-]?\d{4}\]?").unwrap()
});

static TIMESTAMP_UNIX_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b1[0-7][0-9]{8}(?:[0-9]{3})?\b").unwrap());

static SQL_TABLES_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)(?:FROM|JOIN|INTO|UPDATE|TABLE)[ \t]+(`[^`]+`|\[[^\]]+\]|"[^"]+"|[a-zA-Z_][a-zA-Z0-9_]*)"#).unwrap()
});

static SQL_STRINGS_REGEX: Lazy<Regex> = Lazy::new(|| Regex::new(r"'(?:[^'\\\r\n]|\\.)*'").unwrap());

static SQL_IDENTIFIERS_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)(?:SELECT|WHERE|AND|OR|ON|SET|ORDER[ \t]+BY|GROUP[ \t]+BY|HAVING|AS|,)[ \t]*(`[^`]+`|\[[^\]]+\])|(`[^`]+`|\[[^\]]+\])[ \t]*\.[ \t]*(`[^`]+`|\[[^\]]+\])"#).unwrap()
});

// Exim log format patterns
static EXIM_SUBJECT_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"T="(?:[^"\\]|\\.)*""#).unwrap());

static EXIM_SENDER_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"F=<[^>]+>").unwrap());

static EXIM_AUTH_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)A=[a-z_]+(?::[^\s]+)?").unwrap());

static EXIM_USER_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"U=[^\s]+").unwrap());

static EXIM_DN_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"DN=[^\s]+").unwrap());

static PATTERNS: Lazy<Vec<PatternDef>> = Lazy::new(|| {
    vec![
        PatternDef {
            id: "email",
            regex: &EMAIL_REGEX,
            validator: None,
        },
        PatternDef {
            id: "email_message_id",
            regex: &EMAIL_MESSAGE_ID_REGEX,
            validator: None,
        },
        PatternDef {
            id: "ipv4",
            regex: &IPV4_REGEX,
            validator: None,
        },
        PatternDef {
            id: "ipv6",
            regex: &IPV6_REGEX,
            validator: None,
        },
        PatternDef {
            id: "mac_address",
            regex: &MAC_REGEX,
            validator: None,
        },
        PatternDef {
            id: "hostname",
            regex: &HOSTNAME_REGEX,
            validator: None,
        },
        PatternDef {
            id: "url",
            regex: &URL_REGEX,
            validator: None,
        },
        PatternDef {
            id: "ssn",
            regex: &SSN_REGEX,
            validator: Some(validators::ssn_check),
        },
        PatternDef {
            id: "credit_card",
            regex: &CREDIT_CARD_REGEX,
            validator: Some(validators::luhn_check),
        },
        PatternDef {
            id: "jwt",
            regex: &JWT_REGEX,
            validator: None,
        },
        PatternDef {
            id: "phone_us",
            regex: &PHONE_US_REGEX,
            validator: None,
        },
        PatternDef {
            id: "phone_uk",
            regex: &PHONE_UK_REGEX,
            validator: None,
        },
        PatternDef {
            id: "phone_intl",
            regex: &PHONE_INTL_REGEX,
            validator: None,
        },
        PatternDef {
            id: "uuid",
            regex: &UUID_REGEX,
            validator: None,
        },
        PatternDef {
            id: "iban",
            regex: &IBAN_REGEX,
            validator: Some(validators::iban_mod97_check),
        },
        PatternDef {
            id: "aws_access_key",
            regex: &AWS_ACCESS_KEY_REGEX,
            validator: None,
        },
        PatternDef {
            id: "aws_secret_key",
            regex: &AWS_SECRET_KEY_REGEX,
            validator: None,
        },
        PatternDef {
            id: "stripe_key",
            regex: &STRIPE_KEY_REGEX,
            validator: None,
        },
        PatternDef {
            id: "gcp_api_key",
            regex: &GCP_API_KEY_REGEX,
            validator: None,
        },
        PatternDef {
            id: "github_token",
            regex: &GITHUB_TOKEN_REGEX,
            validator: None,
        },
        PatternDef {
            id: "bearer_token",
            regex: &BEARER_TOKEN_REGEX,
            validator: None,
        },
        PatternDef {
            id: "generic_secret",
            regex: &GENERIC_SECRET_REGEX,
            validator: None,
        },
        PatternDef {
            id: "btc_address",
            regex: &BTC_ADDRESS_REGEX,
            validator: Some(validators::btc_address_check),
        },
        PatternDef {
            id: "eth_address",
            regex: &ETH_ADDRESS_REGEX,
            validator: Some(validators::eth_address_check),
        },
        PatternDef {
            id: "gps_coordinates",
            regex: &GPS_COORD_REGEX,
            validator: None,
        },
        PatternDef {
            id: "file_path_unix",
            regex: &FILE_PATH_UNIX_REGEX,
            validator: None,
        },
        PatternDef {
            id: "file_path_windows",
            regex: &FILE_PATH_WIN_REGEX,
            validator: None,
        },
        PatternDef {
            id: "postcode_uk",
            regex: &POSTCODE_UK_REGEX,
            validator: None,
        },
        PatternDef {
            id: "postcode_us",
            regex: &POSTCODE_US_REGEX,
            validator: None,
        },
        PatternDef {
            id: "passport",
            regex: &PASSPORT_REGEX,
            validator: None,
        },
        PatternDef {
            id: "drivers_license",
            regex: &DRIVERS_LICENSE_REGEX,
            validator: None,
        },
        PatternDef {
            id: "session_id",
            regex: &SESSION_ID_REGEX,
            validator: None,
        },
        PatternDef {
            id: "private_key",
            regex: &PRIVATE_KEY_REGEX,
            validator: None,
        },
        PatternDef {
            id: "slack_token",
            regex: &SLACK_TOKEN_REGEX,
            validator: None,
        },
        PatternDef {
            id: "npm_token",
            regex: &NPM_TOKEN_REGEX,
            validator: None,
        },
        PatternDef {
            id: "sendgrid_key",
            regex: &SENDGRID_KEY_REGEX,
            validator: None,
        },
        PatternDef {
            id: "twilio_key",
            regex: &TWILIO_KEY_REGEX,
            validator: None,
        },
        PatternDef {
            id: "openai_key",
            regex: &OPENAI_KEY_REGEX,
            validator: None,
        },
        PatternDef {
            id: "anthropic_key",
            regex: &ANTHROPIC_KEY_REGEX,
            validator: None,
        },
        PatternDef {
            id: "xai_key",
            regex: &XAI_KEY_REGEX,
            validator: None,
        },
        PatternDef {
            id: "cerebras_key",
            regex: &CEREBRAS_KEY_REGEX,
            validator: None,
        },
        PatternDef {
            id: "uk_nhs",
            regex: &UK_NHS_REGEX,
            validator: Some(validators::uk_nhs_check),
        },
        PatternDef {
            id: "uk_nino",
            regex: &UK_NINO_REGEX,
            validator: Some(validators::uk_nino_check),
        },
        PatternDef {
            id: "us_itin",
            regex: &US_ITIN_REGEX,
            validator: None,
        },
        PatternDef {
            id: "au_tfn",
            regex: &AU_TFN_REGEX,
            validator: Some(validators::au_tfn_check),
        },
        PatternDef {
            id: "in_pan",
            regex: &IN_PAN_REGEX,
            validator: None,
        },
        PatternDef {
            id: "sg_nric",
            regex: &SG_NRIC_REGEX,
            validator: None,
        },
        PatternDef {
            id: "high_entropy_secret",
            regex: &HIGH_ENTROPY_SECRET_REGEX,
            validator: Some(validators::high_entropy_check),
        },
        PatternDef {
            id: "db_connection",
            regex: &DB_CONNECTION_REGEX,
            validator: None,
        },
        PatternDef {
            id: "basic_auth",
            regex: &BASIC_AUTH_REGEX,
            validator: None,
        },
        PatternDef {
            id: "url_credentials",
            regex: &URL_CREDENTIALS_REGEX,
            validator: None,
        },
        PatternDef {
            id: "date_mdy",
            regex: &DATE_MDY_REGEX,
            validator: None,
        },
        PatternDef {
            id: "date_dmy",
            regex: &DATE_DMY_REGEX,
            validator: None,
        },
        PatternDef {
            id: "date_iso",
            regex: &DATE_ISO_REGEX,
            validator: None,
        },
        PatternDef {
            id: "time",
            regex: &TIME_REGEX,
            validator: None,
        },
        PatternDef {
            id: "datetime_iso",
            regex: &DATETIME_ISO_REGEX,
            validator: None,
        },
        PatternDef {
            id: "datetime_clf",
            regex: &DATETIME_CLF_REGEX,
            validator: None,
        },
        PatternDef {
            id: "timestamp_unix",
            regex: &TIMESTAMP_UNIX_REGEX,
            validator: None,
        },
        PatternDef {
            id: "sql_tables",
            regex: &SQL_TABLES_REGEX,
            validator: None,
        },
        PatternDef {
            id: "sql_strings",
            regex: &SQL_STRINGS_REGEX,
            validator: None,
        },
        PatternDef {
            id: "sql_identifiers",
            regex: &SQL_IDENTIFIERS_REGEX,
            validator: None,
        },
        PatternDef {
            id: "exim_subject",
            regex: &EXIM_SUBJECT_REGEX,
            validator: None,
        },
        PatternDef {
            id: "exim_sender",
            regex: &EXIM_SENDER_REGEX,
            validator: None,
        },
        PatternDef {
            id: "exim_auth",
            regex: &EXIM_AUTH_REGEX,
            validator: None,
        },
        PatternDef {
            id: "exim_user",
            regex: &EXIM_USER_REGEX,
            validator: None,
        },
        PatternDef {
            id: "exim_dn",
            regex: &EXIM_DN_REGEX,
            validator: None,
        },
    ]
});

pub struct DetectResult {
    pub matches: Vec<Match>,
    pub logs: Vec<String>,
}

pub struct PiiDetector;

impl PiiDetector {
    pub fn new() -> Self {
        Self
    }

    pub fn detect(&self, text: &str, enabled_rules: &[&str]) -> DetectResult {
        let mut matches = Vec::new();
        let mut logs = Vec::new();

        for pattern in PATTERNS.iter() {
            if !enabled_rules.contains(&pattern.id) {
                continue;
            }

            logs.push(format!("Pattern: {}", pattern.id));

            let mut pattern_matches = 0;
            for cap in pattern.regex.find_iter(text) {
                let value = cap.as_str();

                if let Some(validator) = pattern.validator {
                    if !validator(value) {
                        continue;
                    }
                }

                matches.push(Match {
                    pii_type: pattern.id.to_string(),
                    value: value.to_string(),
                    start: cap.start(),
                    end: cap.end(),
                });
                pattern_matches += 1;
            }

            if pattern_matches > 0 {
                logs.push(format!("  -> {} matches", pattern_matches));
            }
        }

        DetectResult { matches, logs }
    }
}

impl Default for PiiDetector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod url_credential_tests {
    use super::*;

    #[test]
    fn test_url_credentials_valid_match() {
        let re = &URL_CREDENTIALS_REGEX;
        assert!(re.is_match("http://user:pass@example.com"));
        assert!(re.is_match("https://admin:secret123@api.example.com"));
        assert!(re.is_match("ftp://user:p4ss@ftp.server.net"));
    }

    #[test]
    fn test_url_credentials_no_false_positives() {
        let re = &URL_CREDENTIALS_REGEX;
        // Should NOT match normal URLs without credentials
        assert!(!re.is_match("http://firebrick.ltd.uk/xml/test/"));
        assert!(!re.is_match("https://www.example.com/path"));
        assert!(!re.is_match(r#"xmlns="http://firebrick.ltd.uk/xml/test/""#));
    }

    #[test]
    fn test_url_credentials_no_multiline_greed() {
        let re = &URL_CREDENTIALS_REGEX;
        let xml = r#"xmlns="http://firebrick.ltd.uk/xml/test/"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        email="hostmaster@aa.net.uk""#;
        assert!(!re.is_match(xml));
    }
}

#[cfg(test)]
mod ipv6_tests {
    use super::*;

    #[test]
    fn test_ipv6_full_form() {
        let re = &IPV6_REGEX;
        assert!(re.is_match("2001:0db8:85a3:0000:0000:8a2e:0370:7334"));
        assert!(re.is_match("2001:db8:85a3:0:0:8a2e:370:7334"));
    }

    #[test]
    fn test_ipv6_compressed() {
        let re = &IPV6_REGEX;
        assert!(re.is_match("2001:db8::1"));
        assert!(re.is_match("::1"));
        assert!(re.is_match("fe80::"));
        assert!(re.is_match("2001:db8:85a3::8a2e:370:7334"));
    }

    #[test]
    fn test_ipv6_bracketed_with_port() {
        let re = &IPV6_REGEX;
        assert!(re.is_match("[::1]:8080"));
        assert!(re.is_match("[2001:db8::1]:443"));
        assert!(re.is_match("[fe80::1]:22"));
    }

    #[test]
    fn test_ipv6_link_local_with_zone() {
        let re = &IPV6_REGEX;
        assert!(re.is_match("fe80::1%eth0"));
        assert!(re.is_match("fe80::a:b:c:d%en0"));
        assert!(re.is_match("fe80::%lo0"));
    }

    #[test]
    fn test_ipv6_ipv4_mapped() {
        let re = &IPV6_REGEX;
        assert!(re.is_match("::ffff:192.168.0.1"));
        assert!(re.is_match("::ffff:10.0.0.1"));
        assert!(re.is_match("::192.168.1.1"));
    }

    #[test]
    fn test_ipv6_mixed_notation() {
        let re = &IPV6_REGEX;
        assert!(re.is_match("2001:db8::192.168.0.1"));
        assert!(re.is_match("64:ff9b::192.0.2.1"));
    }
}
