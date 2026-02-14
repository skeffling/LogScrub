//! Realistic fake data generation using the `fake` crate
//!
//! This module provides functions to generate realistic-looking fake data
//! for various PII types, making anonymized output look more natural.
//! Format preservation ensures fake data matches the original's structure.

use crate::validators;
use fake::faker::address::en::{CityName, CountryName, StreetName, ZipCode};
use fake::faker::company::en::CompanyName;
use fake::faker::internet::en::{IPv4, IPv6, SafeEmail, Username};
use fake::faker::name::en::{FirstName, LastName, Name};
use fake::Fake;
use rand::{rngs::SmallRng, Rng, SeedableRng};
use std::collections::HashMap;
use std::sync::Mutex;

/// Thread-local RNG with seed derived from a counter for deterministic output
/// This ensures consistent fake data generation across runs with the same input
static RNG_SEED: Mutex<u64> = Mutex::new(12345);

fn get_seeded_rng(pii_type: &str, original: &str) -> SmallRng {
    // Create a deterministic seed based on the original value and type
    // This ensures the same input always produces the same fake output
    let mut seed = *RNG_SEED.lock().unwrap();
    for byte in original.bytes() {
        seed = seed.wrapping_mul(31).wrapping_add(byte as u64);
    }
    for byte in pii_type.bytes() {
        seed = seed.wrapping_mul(31).wrapping_add(byte as u64);
    }
    SmallRng::seed_from_u64(seed)
}

/// Preserve the format of the original string while replacing digits with fake digits
/// Non-digit characters (separators like -, ., spaces) are preserved in place
fn preserve_digit_format(original: &str, rng: &mut SmallRng) -> String {
    original
        .chars()
        .map(|c| {
            if c.is_ascii_digit() {
                // Replace digit with random digit
                char::from_digit(rng.gen_range(0..10), 10).unwrap()
            } else {
                // Preserve separators and other characters
                c
            }
        })
        .collect()
}

/// Preserve format while replacing hex digits
fn preserve_hex_format(original: &str, rng: &mut SmallRng) -> String {
    original
        .chars()
        .map(|c| {
            if c.is_ascii_hexdigit() {
                let val = rng.gen_range(0..16);
                if c.is_ascii_uppercase() {
                    char::from_digit(val, 16).unwrap().to_ascii_uppercase()
                } else {
                    char::from_digit(val, 16).unwrap()
                }
            } else {
                c
            }
        })
        .collect()
}

/// Preserve format while replacing alphanumeric characters
fn preserve_alphanum_format(original: &str, rng: &mut SmallRng) -> String {
    original
        .chars()
        .map(|c| {
            if c.is_ascii_digit() {
                char::from_digit(rng.gen_range(0..10), 10).unwrap()
            } else if c.is_ascii_uppercase() {
                (b'A' + rng.gen_range(0..26)) as char
            } else if c.is_ascii_lowercase() {
                (b'a' + rng.gen_range(0..26)) as char
            } else {
                c
            }
        })
        .collect()
}

/// Preserve format while replacing alphanumeric characters, but skip the first `skip` characters
/// (keeping them unchanged). Useful for preserving structural prefixes like "89" in ICCIDs.
fn preserve_alphanum_format_skip(original: &str, skip: usize, rng: &mut SmallRng) -> String {
    original
        .chars()
        .enumerate()
        .map(|(i, c)| {
            if i < skip {
                c
            } else if c.is_ascii_digit() {
                char::from_digit(rng.gen_range(0..10), 10).unwrap()
            } else if c.is_ascii_uppercase() {
                (b'A' + rng.gen_range(0..26)) as char
            } else if c.is_ascii_lowercase() {
                (b'a' + rng.gen_range(0..26)) as char
            } else {
                c
            }
        })
        .collect()
}

/// Preserve digit format but skip the first `skip` characters
fn preserve_digit_format_skip(original: &str, skip: usize, rng: &mut SmallRng) -> String {
    original
        .chars()
        .enumerate()
        .map(|(i, c)| {
            if i < skip {
                c
            } else if c.is_ascii_digit() {
                char::from_digit(rng.gen_range(0..10), 10).unwrap()
            } else {
                c
            }
        })
        .collect()
}

/// Generate a realistic fake email address
pub fn fake_email(original: &str) -> String {
    let mut rng = get_seeded_rng("email", original);
    SafeEmail().fake_with_rng(&mut rng)
}

/// Generate a realistic fake name
pub fn fake_name(original: &str) -> String {
    let mut rng = get_seeded_rng("name", original);
    Name().fake_with_rng(&mut rng)
}

/// Generate a realistic fake first name
#[allow(dead_code)]
pub fn fake_first_name(original: &str) -> String {
    let mut rng = get_seeded_rng("first_name", original);
    FirstName().fake_with_rng(&mut rng)
}

/// Generate a realistic fake last name
#[allow(dead_code)]
pub fn fake_last_name(original: &str) -> String {
    let mut rng = get_seeded_rng("last_name", original);
    LastName().fake_with_rng(&mut rng)
}

/// Generate a realistic fake username
pub fn fake_username(original: &str) -> String {
    let mut rng = get_seeded_rng("username", original);
    Username().fake_with_rng(&mut rng)
}

/// Generate a realistic fake IPv4 address
pub fn fake_ipv4(original: &str) -> String {
    let mut rng = get_seeded_rng("ipv4", original);
    IPv4().fake_with_rng(&mut rng)
}

/// Generate a realistic fake IPv6 address
pub fn fake_ipv6(original: &str) -> String {
    let mut rng = get_seeded_rng("ipv6", original);
    IPv6().fake_with_rng(&mut rng)
}

/// Generate a realistic fake MAC address preserving the original format
pub fn fake_mac_address(original: &str) -> String {
    let mut rng = get_seeded_rng("mac", original);
    preserve_hex_format(original, &mut rng)
}

/// Generate a realistic fake phone number preserving the original format
pub fn fake_phone(original: &str) -> String {
    let mut rng = get_seeded_rng("phone", original);
    preserve_digit_format(original, &mut rng)
}

/// Generate a realistic fake company name
pub fn fake_company(original: &str) -> String {
    let mut rng = get_seeded_rng("company", original);
    CompanyName().fake_with_rng(&mut rng)
}

/// Generate a realistic fake city name
pub fn fake_city(original: &str) -> String {
    let mut rng = get_seeded_rng("city", original);
    CityName().fake_with_rng(&mut rng)
}

/// Generate a realistic fake street name
#[allow(dead_code)]
pub fn fake_street(original: &str) -> String {
    let mut rng = get_seeded_rng("street", original);
    StreetName().fake_with_rng(&mut rng)
}

/// Generate a realistic fake zip/postal code
#[allow(dead_code)]
pub fn fake_zipcode(original: &str) -> String {
    let mut rng = get_seeded_rng("zipcode", original);
    ZipCode().fake_with_rng(&mut rng)
}

/// Generate a realistic fake country name
#[allow(dead_code)]
pub fn fake_country(original: &str) -> String {
    let mut rng = get_seeded_rng("country", original);
    CountryName().fake_with_rng(&mut rng)
}

/// Generate a realistic fake credit card number preserving format (Luhn-valid)
pub fn fake_credit_card(original: &str, _count: usize) -> String {
    let mut rng = get_seeded_rng("credit_card", original);

    // Count digits in original to determine card length
    let digit_count = original.chars().filter(|c| c.is_ascii_digit()).count();

    // Generate random digits (all but last which is check digit)
    let mut digits: Vec<u8> = (0..digit_count.saturating_sub(1))
        .map(|_| rng.gen_range(0..10))
        .collect();

    // Keep first digit as 4 (Visa) for validity appearance
    if !digits.is_empty() {
        digits[0] = 4;
    }

    // Calculate Luhn check digit
    let mut sum = 0u32;
    for (i, &d) in digits.iter().enumerate() {
        let mut val = d as u32;
        // Double every second digit from the right (starting from position before check digit)
        if (digits.len() - i) % 2 == 0 {
            val *= 2;
            if val > 9 {
                val -= 9;
            }
        }
        sum += val;
    }
    let check_digit = ((10 - (sum % 10)) % 10) as u8;
    digits.push(check_digit);

    // Apply digits to original format, preserving separators
    let mut digit_iter = digits.iter();
    original
        .chars()
        .map(|c| {
            if c.is_ascii_digit() {
                digit_iter.next().map(|&d| char::from_digit(d as u32, 10).unwrap()).unwrap_or(c)
            } else {
                c
            }
        })
        .collect()
}

/// Generate a realistic fake SSN preserving format
pub fn fake_ssn(original: &str, _count: usize) -> String {
    let mut rng = get_seeded_rng("ssn", original);
    // Preserve the original format (dashes, spaces, etc.)
    preserve_digit_format(original, &mut rng)
}

/// Generate a realistic fake UUID preserving format
pub fn fake_uuid(original: &str) -> String {
    let mut rng = get_seeded_rng("uuid", original);
    // Preserve the original format (lowercase/uppercase, dashes)
    preserve_hex_format(original, &mut rng)
}

/// Generate a realistic fake IBAN preserving format
pub fn fake_iban(original: &str, _count: usize) -> String {
    let mut rng = get_seeded_rng("iban", original);
    // Preserve format: letters stay as letters, digits as digits
    preserve_alphanum_format(original, &mut rng)
}

/// Generate a realistic fake URL
pub fn fake_url(original: &str) -> String {
    let mut rng = get_seeded_rng("url", original);
    let domains = ["example.com", "test.org", "sample.net", "demo.io", "app.dev"];
    let paths = ["api", "users", "data", "v1", "v2", "resources", "items"];
    let domain = domains[rng.gen::<usize>() % domains.len()];
    let path = paths[rng.gen::<usize>() % paths.len()];
    let id: u32 = rng.gen::<u32>() % 10000;
    format!("https://{}/{}/{}", domain, path, id)
}

/// Generate a realistic fake hostname
pub fn fake_hostname(original: &str) -> String {
    let mut rng = get_seeded_rng("hostname", original);
    let prefixes = ["server", "web", "app", "api", "db", "cache", "mail", "proxy"];
    let suffixes = ["example.com", "test.local", "internal.net", "corp.io"];
    let prefix = prefixes[rng.gen::<usize>() % prefixes.len()];
    let num: u32 = rng.gen::<u32>() % 100;
    let suffix = suffixes[rng.gen::<usize>() % suffixes.len()];
    format!("{}{}.{}", prefix, num, suffix)
}

/// Main function to generate realistic fake data for any PII type
pub fn generate_realistic(
    pii_type: &str,
    original: &str,
    count: usize,
    consistency_cache: &mut HashMap<String, String>,
) -> String {
    // Check cache first for consistency
    if let Some(cached) = consistency_cache.get(original) {
        return cached.clone();
    }

    let fake_value = match pii_type {
        // ML-detected entities
        "ml_person_name" => fake_name(original),
        "ml_location" => fake_city(original),
        "ml_organization" => fake_company(original),

        "email" | "email_message_id" => fake_email(original),
        "ipv4" => fake_ipv4(original),
        "ipv6" => fake_ipv6(original),
        "mac_address" => fake_mac_address(original),
        "hostname" => fake_hostname(original),
        "url" | "url_credentials" => fake_url(original),
        "phone_us" | "phone_uk" | "phone_intl" | "phone_intl_no_plus" => fake_phone(original),
        "uuid" => fake_uuid(original),
        "credit_card" => fake_credit_card(original, count),
        "ssn" => fake_ssn(original, count),
        "iban" => fake_iban(original, count),

        // For types without good fakers, fall back to structured patterns
        "jwt" => format!(
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ7fSJ9.fake{}",
            count
        ),
        "aws_access_key" => format!("AKIAIOSFODNN{:08X}", count),
        "aws_secret_key" => {
            let mut rng = get_seeded_rng("aws_secret", original);
            let chars: String = (0..40)
                .map(|_| {
                    let idx: usize = rng.gen::<usize>() % 62;
                    let c = if idx < 26 {
                        (b'A' + idx as u8) as char
                    } else if idx < 52 {
                        (b'a' + (idx - 26) as u8) as char
                    } else {
                        (b'0' + (idx - 52) as u8) as char
                    };
                    c
                })
                .collect();
            chars
        }
        "stripe_key" => format!("sk_test_{}", fake_username(original).replace('.', "_")),
        "github_token" => format!("ghp_{}", &fake_uuid(original).replace('-', "")[..36]),
        "bearer_token" => format!("Bearer {}", &fake_uuid(original)),
        "generic_secret" | "high_entropy_secret" | "session_id" | "private_key" | "basic_auth" => {
            let mut rng = get_seeded_rng("secret", original);
            // Preserve format - replace alphanumeric while keeping structure
            preserve_alphanum_format(original, &mut rng)
        }
        "eth_address" => {
            let mut rng = get_seeded_rng("eth", original);
            // Preserve format (0x prefix and case)
            preserve_hex_format(original, &mut rng)
        }
        "gps_coordinates" => {
            let mut rng = get_seeded_rng("gps", original);
            // Preserve format - replace digits while keeping decimal points and separators
            preserve_digit_format(original, &mut rng)
        }
        "postcode_uk" => {
            let mut rng = get_seeded_rng("postcode_uk", original);
            // Preserve format - replace alphanumeric while keeping spaces
            preserve_alphanum_format(original, &mut rng)
        }
        "postcode_us" => {
            let mut rng = get_seeded_rng("postcode_us", original);
            // Preserve format - replace digits
            preserve_digit_format(original, &mut rng)
        }
        "file_path_unix" => {
            let mut rng = get_seeded_rng("filepath", original);
            let dirs = ["home", "var", "opt", "usr", "tmp"];
            let users = ["user", "admin", "app", "service"];
            let files = ["data", "config", "log", "output", "cache"];
            let exts = ["txt", "log", "json", "xml", "csv"];
            format!(
                "/{}/{}/{}.{}",
                dirs[rng.gen::<usize>() % dirs.len()],
                users[rng.gen::<usize>() % users.len()],
                files[rng.gen::<usize>() % files.len()],
                exts[rng.gen::<usize>() % exts.len()]
            )
        }
        "file_path_windows" => {
            let mut rng = get_seeded_rng("filepath_win", original);
            let users = ["User", "Admin", "App"];
            let folders = ["Documents", "Downloads", "Desktop", "Data"];
            let files = ["file", "data", "report", "export"];
            let exts = ["txt", "log", "xlsx", "docx", "pdf"];
            format!(
                "C:\\Users\\{}\\{}\\{}.{}",
                users[rng.gen::<usize>() % users.len()],
                folders[rng.gen::<usize>() % folders.len()],
                files[rng.gen::<usize>() % files.len()],
                exts[rng.gen::<usize>() % exts.len()]
            )
        }

        // Date/time - preserve format while randomizing digits
        "date_mdy" | "date_dmy" | "date_iso" => {
            let mut rng = get_seeded_rng("date", original);
            preserve_digit_format(original, &mut rng)
        }
        "time" => {
            let mut rng = get_seeded_rng("time", original);
            preserve_digit_format(original, &mut rng)
        }
        "datetime_iso" | "datetime_clf" | "timestamp_unix" => {
            let mut rng = get_seeded_rng("datetime", original);
            preserve_digit_format(original, &mut rng)
        }

        // Hash values - preserve format (hex)
        "md5_hash" | "sha1_hash" | "sha256_hash" | "docker_container_id" => {
            let mut rng = get_seeded_rng("hash", original);
            preserve_hex_format(original, &mut rng)
        }

        // National IDs - preserve format with structural prefixes
        "iccid" => {
            let mut rng = get_seeded_rng("national_id", original);
            // Preserve "89" prefix (MII for telecommunications)
            preserve_alphanum_format_skip(original, 2, &mut rng)
        }
        "btc_address" => {
            let mut rng = get_seeded_rng("btc", original);
            // Preserve prefix: "bc1" (3), "1" or "3" (1)
            let skip = if original.starts_with("bc1") { 3 } else { 1 };
            preserve_alphanum_format_skip(original, skip, &mut rng)
        }
        "sg_nric" => {
            let mut rng = get_seeded_rng("national_id", original);
            // Preserve first letter (S/T/F/G/M)
            preserve_alphanum_format_skip(original, 1, &mut rng)
        }
        "es_nie" => {
            let mut rng = get_seeded_rng("national_id", original);
            // Preserve first letter (X/Y/Z)
            preserve_alphanum_format_skip(original, 1, &mut rng)
        }
        "uk_nino" => {
            let mut rng = get_seeded_rng("national_id", original);
            // Preserve first 2 letters
            preserve_alphanum_format_skip(original, 2, &mut rng)
        }
        "us_itin" => {
            let mut rng = get_seeded_rng("national_id", original);
            // Preserve leading "9"
            preserve_alphanum_format_skip(original, 1, &mut rng)
        }
        "uk_nhs" | "uk_sort_code" | "uk_bank_account" | "au_tfn" | "in_pan" | "es_nif" | "ca_sin" | "vin" => {
            let mut rng = get_seeded_rng("national_id", original);
            preserve_alphanum_format(original, &mut rng)
        }

        // Default: return a generic anonymized value
        _ => format!("[ANON-{}-{}]", pii_type.to_uppercase(), count),
    };

    // Cache for consistency
    consistency_cache.insert(original.to_string(), fake_value.clone());
    fake_value
}

/// Generate a fake credit card number preserving the first `preserve` digits (BIN),
/// randomizing the rest, and recomputing a valid Luhn check digit.
fn fake_credit_card_preserve_bin(original: &str, preserve: usize, rng: &mut SmallRng) -> String {
    let digit_count = original.chars().filter(|c| c.is_ascii_digit()).count();
    let orig_digits: Vec<u8> = original
        .chars()
        .filter(|c| c.is_ascii_digit())
        .map(|c| c.to_digit(10).unwrap() as u8)
        .collect();

    // Build digits: preserve first N, randomize middle, recompute check
    let mut digits: Vec<u8> = Vec::with_capacity(digit_count);
    for i in 0..digit_count.saturating_sub(1) {
        if i < preserve && i < orig_digits.len() {
            digits.push(orig_digits[i]);
        } else {
            digits.push(rng.gen_range(0..10));
        }
    }

    // Luhn check digit
    let mut sum = 0u32;
    for (i, &d) in digits.iter().enumerate() {
        let mut val = d as u32;
        if (digits.len() - i) % 2 == 0 {
            val *= 2;
            if val > 9 {
                val -= 9;
            }
        }
        sum += val;
    }
    let check_digit = ((10 - (sum % 10)) % 10) as u8;
    digits.push(check_digit);

    // Apply to original format
    let mut digit_iter = digits.iter();
    original
        .chars()
        .map(|c| {
            if c.is_ascii_digit() {
                digit_iter
                    .next()
                    .map(|&d| char::from_digit(d as u32, 10).unwrap())
                    .unwrap_or(c)
            } else {
                c
            }
        })
        .collect()
}

/// Extract the TLD from a domain/hostname string (e.g. "foo.co.uk" → ".co.uk", "bar.com" → ".com")
fn extract_tld(domain: &str) -> &str {
    // Known two-part TLDs
    let two_part = [
        ".co.uk", ".org.uk", ".ac.uk", ".gov.uk", ".net.uk", ".me.uk",
        ".co.jp", ".co.kr", ".co.in", ".co.nz", ".co.za", ".co.id",
        ".com.au", ".com.br", ".com.cn", ".com.mx", ".com.sg", ".com.tw", ".com.hk",
        ".org.au", ".net.au", ".gov.au",
        ".co.il", ".ac.il",
    ];
    let lower = domain.to_lowercase();
    for tld in &two_part {
        if lower.ends_with(tld) {
            let start = domain.len() - tld.len();
            return &domain[start..];
        }
    }
    // Fall back to last dot segment
    if let Some(pos) = domain.rfind('.') {
        &domain[pos..]
    } else {
        ""
    }
}

/// Generate realistic fake data preserving country-specific prefixes
pub fn generate_realistic_country(
    pii_type: &str,
    original: &str,
    count: usize,
    consistency_cache: &mut HashMap<String, String>,
) -> String {
    // Check cache first
    if let Some(cached) = consistency_cache.get(original) {
        return cached.clone();
    }

    let fake_value = match pii_type {
        "phone_intl" => {
            // Format: +<CC><number> — preserve + and country code digits
            let mut rng = get_seeded_rng("phone_country", original);
            if let Some(rest) = original.strip_prefix('+') {
                let digits: Vec<u8> = rest
                    .chars()
                    .filter(|c| c.is_ascii_digit())
                    .map(|c| c.to_digit(10).unwrap() as u8)
                    .collect();
                let cc_len = validators::e164_cc_length(&digits);
                if cc_len > 0 {
                    // Count chars in original (after +) that contain the CC digits
                    let mut digit_seen = 0;
                    let mut char_skip = 0;
                    for ch in rest.chars() {
                        if digit_seen >= cc_len {
                            break;
                        }
                        char_skip += ch.len_utf8();
                        if ch.is_ascii_digit() {
                            digit_seen += 1;
                        }
                    }
                    // +1 for the leading '+'
                    format!("+{}", preserve_digit_format_skip(rest, char_skip, &mut rng))
                } else {
                    format!("+{}", preserve_digit_format(rest, &mut rng))
                }
            } else {
                preserve_digit_format(original, &mut rng)
            }
        }
        "phone_intl_no_plus" => {
            let mut rng = get_seeded_rng("phone_country", original);
            let digits: Vec<u8> = original
                .chars()
                .filter(|c| c.is_ascii_digit())
                .map(|c| c.to_digit(10).unwrap() as u8)
                .collect();
            let cc_len = validators::e164_cc_length(&digits);
            if cc_len > 0 {
                let mut digit_seen = 0;
                let mut char_skip = 0;
                for ch in original.chars() {
                    if digit_seen >= cc_len {
                        break;
                    }
                    char_skip += ch.len_utf8();
                    if ch.is_ascii_digit() {
                        digit_seen += 1;
                    }
                }
                preserve_digit_format_skip(original, char_skip, &mut rng)
            } else {
                preserve_digit_format(original, &mut rng)
            }
        }
        "phone_us" => {
            let mut rng = get_seeded_rng("phone_country", original);
            // Preserve +1 or leading 1
            if original.starts_with("+1") {
                let skip = "+1".len();
                format!("+1{}", preserve_digit_format(&original[skip..], &mut rng))
            } else if original.starts_with('1') {
                preserve_digit_format_skip(original, 1, &mut rng)
            } else {
                preserve_digit_format(original, &mut rng)
            }
        }
        "phone_uk" => {
            let mut rng = get_seeded_rng("phone_country", original);
            // Preserve leading 0
            if original.starts_with('0') {
                preserve_digit_format_skip(original, 1, &mut rng)
            } else {
                preserve_digit_format(original, &mut rng)
            }
        }
        "iccid" => {
            let mut rng = get_seeded_rng("iccid_country", original);
            // Preserve 89 + country code (up to 3 digits MCC) = 5 chars of digits
            // Count char positions that cover 5 digits
            let mut digit_seen = 0;
            let mut char_skip = 0;
            for ch in original.chars() {
                if digit_seen >= 5 {
                    break;
                }
                char_skip += 1;
                if ch.is_ascii_digit() {
                    digit_seen += 1;
                }
            }
            preserve_alphanum_format_skip(original, char_skip, &mut rng)
        }
        "iban" => {
            let mut rng = get_seeded_rng("iban_country", original);
            // Preserve first 2 characters (country code letters)
            preserve_alphanum_format_skip(original, 2, &mut rng)
        }
        "hostname" => {
            let mut rng = get_seeded_rng("hostname_country", original);
            let tld = extract_tld(original);
            if tld.is_empty() {
                return fake_hostname(original);
            }
            let prefixes = ["server", "web", "app", "api", "db", "cache", "mail", "proxy"];
            let prefix = prefixes[rng.gen::<usize>() % prefixes.len()];
            let num: u32 = rng.gen::<u32>() % 100;
            format!("{}{}{}", prefix, num, tld)
        }
        "email" => {
            let mut rng = get_seeded_rng("email_country", original);
            // Preserve TLD from the domain
            let tld = if let Some(at_pos) = original.rfind('@') {
                extract_tld(&original[at_pos + 1..])
            } else {
                ".com"
            };
            let username: String = Username().fake_with_rng(&mut rng);
            let domains = ["mail", "inbox", "post", "send", "msg"];
            let domain = domains[rng.gen::<usize>() % domains.len()];
            format!("{}@{}{}", username, domain, tld)
        }
        "url" | "url_credentials" => {
            let mut rng = get_seeded_rng("url_country", original);
            // Extract domain TLD
            // Find domain part: after :// and before first /
            let domain_start = original.find("://").map(|p| p + 3).unwrap_or(0);
            let rest = &original[domain_start..];
            let domain_end = rest.find('/').unwrap_or(rest.len());
            // Strip credentials (user:pass@)
            let domain_part = if let Some(at) = rest[..domain_end].rfind('@') {
                &rest[at + 1..domain_end]
            } else {
                &rest[..domain_end]
            };
            // Strip port
            let domain_no_port = if let Some(colon) = domain_part.rfind(':') {
                &domain_part[..colon]
            } else {
                domain_part
            };
            let tld = extract_tld(domain_no_port);
            let hosts = ["example", "test", "sample", "demo", "app"];
            let paths = ["api", "users", "data", "v1", "v2", "resources"];
            let host = hosts[rng.gen::<usize>() % hosts.len()];
            let path = paths[rng.gen::<usize>() % paths.len()];
            let id: u32 = rng.gen::<u32>() % 10000;
            let scheme = if original.starts_with("https") { "https" } else { "http" };
            format!("{}://{}{}/{}/{}", scheme, host, tld, path, id)
        }
        "mac_address" => {
            let mut rng = get_seeded_rng("mac_country", original);
            // Preserve OUI (first 3 octets = first 8 chars like "XX:XX:XX")
            // Find position after 3rd separator to identify where OUI ends
            let chars: Vec<char> = original.chars().collect();
            let mut sep_count = 0;
            let mut oui_end = 0;
            for (i, &c) in chars.iter().enumerate() {
                if !c.is_ascii_hexdigit() {
                    sep_count += 1;
                    if sep_count >= 3 {
                        oui_end = i;
                        break;
                    }
                }
            }
            if oui_end == 0 {
                // Fallback: preserve first 8 chars
                oui_end = 8.min(chars.len());
            }
            // Preserve OUI, randomize the rest
            let prefix: String = chars[..oui_end].iter().collect();
            let suffix = preserve_hex_format(&chars[oui_end..].iter().collect::<String>(), &mut rng);
            format!("{}{}", prefix, suffix)
        }
        "credit_card" => {
            let mut rng = get_seeded_rng("cc_country", original);
            // Preserve BIN (first 6 digits)
            fake_credit_card_preserve_bin(original, 6, &mut rng)
        }
        // For all other types, delegate to base realistic mode
        _ => {
            return generate_realistic(pii_type, original, count, consistency_cache);
        }
    };

    consistency_cache.insert(original.to_string(), fake_value.clone());
    fake_value
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fake_email() {
        let email = fake_email("john.doe@example.com");
        assert!(email.contains('@'));
        assert!(email.contains('.'));
    }

    #[test]
    fn test_fake_ipv4() {
        let ip = fake_ipv4("192.168.1.1");
        let parts: Vec<&str> = ip.split('.').collect();
        assert_eq!(parts.len(), 4);
    }

    #[test]
    fn test_fake_consistency() {
        // Same input should produce same output
        let email1 = fake_email("test@test.com");
        let email2 = fake_email("test@test.com");
        assert_eq!(email1, email2);

        // Different input should produce different output
        let email3 = fake_email("other@test.com");
        assert_ne!(email1, email3);
    }

    #[test]
    fn test_fake_credit_card() {
        let cc = fake_credit_card("4111111111111111", 1);
        // Should have 16 digits + 3 dashes
        let digits: String = cc.chars().filter(|c| c.is_ascii_digit()).collect();
        assert_eq!(digits.len(), 16);
    }

    #[test]
    fn test_fake_ssn() {
        let ssn = fake_ssn("123-45-6789", 1);
        assert!(ssn.contains('-'));
        let parts: Vec<&str> = ssn.split('-').collect();
        assert_eq!(parts.len(), 3);
    }

    #[test]
    fn test_realistic_iccid_preserves_89() {
        let mut cache = HashMap::new();
        let result = generate_realistic("iccid", "8944200011231044047", 1, &mut cache);
        assert!(result.starts_with("89"), "ICCID should start with 89, got: {}", result);
    }

    #[test]
    fn test_realistic_btc_preserves_prefix() {
        let mut cache = HashMap::new();
        let result = generate_realistic("btc_address", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", 1, &mut cache);
        assert!(result.starts_with("bc1"), "BTC bech32 should start with bc1, got: {}", result);

        cache.clear();
        let result2 = generate_realistic("btc_address", "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2", 1, &mut cache);
        assert!(result2.starts_with('1'), "BTC P2PKH should start with 1, got: {}", result2);
    }

    #[test]
    fn test_realistic_country_phone_preserves_cc() {
        let mut cache = HashMap::new();
        let result = generate_realistic_country("phone_intl", "+447508804412", 1, &mut cache);
        assert!(result.starts_with("+44"), "UK phone should preserve +44, got: {}", result);

        cache.clear();
        let result2 = generate_realistic_country("phone_intl", "+12025551234", 1, &mut cache);
        assert!(result2.starts_with("+1"), "US phone should preserve +1, got: {}", result2);
    }

    #[test]
    fn test_realistic_country_iccid_preserves_mcc() {
        let mut cache = HashMap::new();
        let result = generate_realistic_country("iccid", "8944200011231044047", 1, &mut cache);
        assert!(result.starts_with("89442"), "ICCID should preserve 89+MCC (89442), got: {}", result);
    }

    #[test]
    fn test_realistic_country_iban_preserves_country() {
        let mut cache = HashMap::new();
        let result = generate_realistic_country("iban", "GB82WEST12345698765432", 1, &mut cache);
        assert!(result.starts_with("GB"), "IBAN should preserve GB, got: {}", result);
    }

    #[test]
    fn test_realistic_country_email_preserves_tld() {
        let mut cache = HashMap::new();
        let result = generate_realistic_country("email", "user@company.co.uk", 1, &mut cache);
        assert!(result.ends_with(".co.uk"), "Email should preserve .co.uk TLD, got: {}", result);
        assert!(result.contains('@'), "Email should contain @, got: {}", result);
    }

    #[test]
    fn test_realistic_country_mac_preserves_oui() {
        let mut cache = HashMap::new();
        let result = generate_realistic_country("mac_address", "AA:BB:CC:11:22:33", 1, &mut cache);
        assert!(result.starts_with("AA:BB:CC"), "MAC should preserve OUI, got: {}", result);
    }

    #[test]
    fn test_extract_tld() {
        assert_eq!(extract_tld("example.co.uk"), ".co.uk");
        assert_eq!(extract_tld("foo.com"), ".com");
        assert_eq!(extract_tld("bar.org.au"), ".org.au");
        assert_eq!(extract_tld("test.de"), ".de");
    }
}
