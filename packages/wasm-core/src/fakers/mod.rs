//! Realistic fake data generation using the `fake` crate
//!
//! This module provides functions to generate realistic-looking fake data
//! for various PII types, making anonymized output look more natural.
//! Format preservation ensures fake data matches the original's structure.

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
        "phone_us" | "phone_uk" | "phone_intl" => fake_phone(original),
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
        "btc_address" => {
            let mut rng = get_seeded_rng("btc", original);
            // Preserve format - alphanumeric
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

        // National IDs - preserve format
        "uk_nhs" | "uk_nino" | "uk_sort_code" | "uk_bank_account" | "us_itin" | "au_tfn" | "in_pan" | "sg_nric" | "es_nif" | "es_nie" | "ca_sin" | "vin" => {
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
}
