//! Realistic fake data generation using the `fake` crate
//!
//! This module provides functions to generate realistic-looking fake data
//! for various PII types, making anonymized output look more natural.

use fake::faker::address::en::{CityName, CountryName, StreetName, ZipCode};
use fake::faker::company::en::CompanyName;
use fake::faker::internet::en::{IPv4, IPv6, MACAddress, SafeEmail, Username};
use fake::faker::name::en::{FirstName, LastName, Name};
use fake::faker::phone_number::en::PhoneNumber;
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

/// Generate a realistic fake MAC address
pub fn fake_mac_address(original: &str) -> String {
    let mut rng = get_seeded_rng("mac", original);
    MACAddress().fake_with_rng(&mut rng)
}

/// Generate a realistic fake phone number
pub fn fake_phone(original: &str) -> String {
    let mut rng = get_seeded_rng("phone", original);
    PhoneNumber().fake_with_rng(&mut rng)
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

/// Generate a realistic fake credit card number (Luhn-valid)
pub fn fake_credit_card(_original: &str, count: usize) -> String {
    // Generate a Luhn-valid credit card number
    // Using a deterministic approach based on count
    let base = 4111111111110000u64 + (count as u64 % 10000);
    let digits: Vec<u8> = format!("{:016}", base)
        .chars()
        .filter_map(|c| c.to_digit(10).map(|d| d as u8))
        .collect();

    // Calculate Luhn check digit
    let mut sum = 0u32;
    for (i, &d) in digits[..15].iter().enumerate() {
        let mut val = d as u32;
        if i % 2 == 0 {
            val *= 2;
            if val > 9 {
                val -= 9;
            }
        }
        sum += val;
    }
    let check_digit = (10 - (sum % 10)) % 10;

    format!(
        "{}{}{}{}-{}{}{}{}-{}{}{}{}-{}{}{}{}",
        digits[0], digits[1], digits[2], digits[3],
        digits[4], digits[5], digits[6], digits[7],
        digits[8], digits[9], digits[10], digits[11],
        digits[12], digits[13], digits[14], check_digit
    )
}

/// Generate a realistic fake SSN (format: XXX-XX-XXXX)
pub fn fake_ssn(_original: &str, count: usize) -> String {
    // Generate a valid-looking SSN (avoiding invalid ranges)
    let area = 100 + (count % 599); // 100-698, avoiding 000, 666, 900-999
    let group = 1 + (count % 99);    // 01-99
    let serial = 1 + (count % 9999); // 0001-9999
    format!("{:03}-{:02}-{:04}", area, group, serial)
}

/// Generate a realistic fake UUID
pub fn fake_uuid(original: &str) -> String {
    let mut rng = get_seeded_rng("uuid", original);
    let bytes: [u8; 16] = rng.gen();

    // Format as UUID v4
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-4{:01x}{:02x}-{:01x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3],
        bytes[4], bytes[5],
        bytes[6] & 0x0F, bytes[7],
        8 | (bytes[8] & 0x03), bytes[9],
        bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
    )
}

/// Generate a realistic fake IBAN (simplified, not fully valid)
pub fn fake_iban(_original: &str, count: usize) -> String {
    // Generate a plausible-looking IBAN
    let countries = ["DE", "FR", "ES", "IT", "NL", "BE", "AT", "PT"];
    let country = countries[count % countries.len()];
    let check = 10 + (count % 90);
    let bank = format!("{:08}", count % 100000000);
    let account = format!("{:010}", (count as u64 * 7) % 10000000000u64);
    format!("{}{}{}{}", country, check, bank, account)
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
        "generic_secret" | "high_entropy_secret" => {
            let mut rng = get_seeded_rng("secret", original);
            let chars: String = (0..24)
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
        "btc_address" => {
            // Generate a plausible Bitcoin address
            let mut rng = get_seeded_rng("btc", original);
            let prefix = if rng.gen::<bool>() { "1" } else { "3" };
            let chars: String = (0..33)
                .map(|_| {
                    let alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
                    let idx: usize = rng.gen::<usize>() % alphabet.len();
                    alphabet.chars().nth(idx).unwrap()
                })
                .collect();
            format!("{}{}", prefix, chars)
        }
        "eth_address" => {
            let mut rng = get_seeded_rng("eth", original);
            let chars: String = (0..40)
                .map(|_| {
                    let idx: usize = rng.gen::<usize>() % 16;
                    "0123456789abcdef".chars().nth(idx).unwrap()
                })
                .collect();
            format!("0x{}", chars)
        }
        "gps_coordinates" => {
            let mut rng = get_seeded_rng("gps", original);
            let lat: f64 = (rng.gen::<f64>() * 180.0) - 90.0;
            let lon: f64 = (rng.gen::<f64>() * 360.0) - 180.0;
            format!("{:.6}, {:.6}", lat, lon)
        }
        "postcode_uk" => {
            let mut rng = get_seeded_rng("postcode_uk", original);
            let areas = ["SW", "NW", "SE", "NE", "W", "E", "N", "EC", "WC"];
            let area = areas[rng.gen::<usize>() % areas.len()];
            let num: u8 = 1 + (rng.gen::<u8>() % 20);
            let num2: u8 = 1 + (rng.gen::<u8>() % 9);
            let letters: String = (0..2)
                .map(|_| (b'A' + (rng.gen::<u8>() % 26)) as char)
                .collect();
            format!("{}{} {}{}", area, num, num2, letters)
        }
        "postcode_us" => {
            let mut rng = get_seeded_rng("postcode_us", original);
            let zip: u32 = 10000 + (rng.gen::<u32>() % 90000);
            format!("{:05}", zip)
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

        // Date/time - keep format but randomize values
        "date_mdy" => {
            let mut rng = get_seeded_rng("date", original);
            let month: u8 = 1 + (rng.gen::<u8>() % 12);
            let day: u8 = 1 + (rng.gen::<u8>() % 28);
            let year: u16 = 2000 + (rng.gen::<u16>() % 25);
            format!("{:02}/{:02}/{}", month, day, year)
        }
        "date_dmy" => {
            let mut rng = get_seeded_rng("date", original);
            let day: u8 = 1 + (rng.gen::<u8>() % 28);
            let month: u8 = 1 + (rng.gen::<u8>() % 12);
            let year: u16 = 2000 + (rng.gen::<u16>() % 25);
            format!("{:02}/{:02}/{}", day, month, year)
        }
        "date_iso" => {
            let mut rng = get_seeded_rng("date", original);
            let year: u16 = 2000 + (rng.gen::<u16>() % 25);
            let month: u8 = 1 + (rng.gen::<u8>() % 12);
            let day: u8 = 1 + (rng.gen::<u8>() % 28);
            format!("{}-{:02}-{:02}", year, month, day)
        }
        "time" => {
            let mut rng = get_seeded_rng("time", original);
            let hour: u8 = rng.gen::<u8>() % 24;
            let min: u8 = rng.gen::<u8>() % 60;
            let sec: u8 = rng.gen::<u8>() % 60;
            format!("{:02}:{:02}:{:02}", hour, min, sec)
        }
        "datetime_iso" => {
            let mut rng = get_seeded_rng("datetime", original);
            let year: u16 = 2000 + (rng.gen::<u16>() % 25);
            let month: u8 = 1 + (rng.gen::<u8>() % 12);
            let day: u8 = 1 + (rng.gen::<u8>() % 28);
            let hour: u8 = rng.gen::<u8>() % 24;
            let min: u8 = rng.gen::<u8>() % 60;
            let sec: u8 = rng.gen::<u8>() % 60;
            format!("{}-{:02}-{:02}T{:02}:{:02}:{:02}Z", year, month, day, hour, min, sec)
        }

        // Hash values - generate random-looking hashes
        "md5_hash" => {
            let mut rng = get_seeded_rng("md5", original);
            let bytes: [u8; 16] = rng.gen();
            bytes.iter().map(|b| format!("{:02x}", b)).collect()
        }
        "sha1_hash" => {
            let mut rng = get_seeded_rng("sha1", original);
            let bytes: [u8; 20] = rng.gen();
            bytes.iter().map(|b| format!("{:02x}", b)).collect()
        }
        "sha256_hash" => {
            let mut rng = get_seeded_rng("sha256", original);
            let bytes: [u8; 32] = rng.gen();
            bytes.iter().map(|b| format!("{:02x}", b)).collect()
        }

        // National IDs - generate format-valid but fake
        "uk_nhs" => {
            let mut rng = get_seeded_rng("nhs", original);
            let digits: Vec<u8> = (0..9).map(|_| rng.gen::<u8>() % 10).collect();
            // Calculate NHS check digit
            let weights = [10, 9, 8, 7, 6, 5, 4, 3, 2];
            let sum: u32 = digits.iter().zip(weights.iter()).map(|(&d, &w)| d as u32 * w).sum();
            let remainder = sum % 11;
            let check = if remainder == 0 { 0 } else { 11 - remainder };
            if check == 10 {
                // Invalid check digit, regenerate
                format!("{}{}{} {}{}{} {}{}{}{}", digits[0], digits[1], digits[2], digits[3], digits[4], digits[5], digits[6], digits[7], digits[8], 0)
            } else {
                format!("{}{}{} {}{}{} {}{}{}{}", digits[0], digits[1], digits[2], digits[3], digits[4], digits[5], digits[6], digits[7], digits[8], check)
            }
        }
        "uk_nino" => {
            let mut rng = get_seeded_rng("nino", original);
            let first_chars = "ABCEGHJKLMNPRSTWXYZ"; // Valid first letters
            let second_chars = "ABCEGHJKLMNPRSTWXYZ"; // Valid second letters
            let suffix_chars = "ABCD";
            let first = first_chars.chars().nth(rng.gen::<usize>() % first_chars.len()).unwrap();
            let second = second_chars.chars().nth(rng.gen::<usize>() % second_chars.len()).unwrap();
            let suffix = suffix_chars.chars().nth(rng.gen::<usize>() % suffix_chars.len()).unwrap();
            let nums: String = (0..6).map(|_| (b'0' + (rng.gen::<u8>() % 10)) as char).collect();
            format!("{}{}{}{}", first, second, nums, suffix)
        }
        "uk_sort_code" => {
            let mut rng = get_seeded_rng("sort_code", original);
            let d1: u8 = rng.gen::<u8>() % 10;
            let d2: u8 = rng.gen::<u8>() % 10;
            let d3: u8 = rng.gen::<u8>() % 10;
            let d4: u8 = rng.gen::<u8>() % 10;
            let d5: u8 = rng.gen::<u8>() % 10;
            let d6: u8 = rng.gen::<u8>() % 10;
            format!("{}{}-{}{}-{}{}", d1, d2, d3, d4, d5, d6)
        }
        "uk_bank_account" => {
            let mut rng = get_seeded_rng("bank_account", original);
            let digits: String = (0..8).map(|_| (b'0' + (rng.gen::<u8>() % 10)) as char).collect();
            digits
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
