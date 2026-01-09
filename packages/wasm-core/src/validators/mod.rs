pub fn luhn_check(number: &str) -> bool {
    let digits: Vec<u32> = number
        .chars()
        .filter(|c| c.is_ascii_digit())
        .filter_map(|c| c.to_digit(10))
        .collect();

    if digits.len() < 13 || digits.len() > 19 {
        return false;
    }

    let mut sum = 0;
    let mut double = false;

    for digit in digits.iter().rev() {
        let mut d = *digit;
        if double {
            d *= 2;
            if d > 9 {
                d -= 9;
            }
        }
        sum += d;
        double = !double;
    }

    sum % 10 == 0
}

pub fn iban_mod97_check(iban: &str) -> bool {
    let cleaned: String = iban
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect::<String>()
        .to_uppercase();

    if cleaned.len() < 15 || cleaned.len() > 34 {
        return false;
    }

    let rearranged = format!("{}{}", &cleaned[4..], &cleaned[..4]);

    let numeric: String = rearranged
        .chars()
        .map(|c| {
            if c.is_ascii_digit() {
                c.to_string()
            } else {
                ((c as u32) - ('A' as u32) + 10).to_string()
            }
        })
        .collect();

    mod97_remainder(&numeric) == 1
}

fn mod97_remainder(s: &str) -> u32 {
    let mut remainder = 0u32;
    for chunk in s.as_bytes().chunks(7) {
        let chunk_str: String = std::str::from_utf8(chunk).unwrap_or("").to_string();
        let combined = format!("{}{}", remainder, chunk_str);
        remainder = combined.parse::<u64>().unwrap_or(0) as u32 % 97;
    }
    remainder
}

pub fn btc_address_check(addr: &str) -> bool {
    if addr.starts_with("bc1") {
        return addr.len() >= 42 && addr.len() <= 62;
    }
    if addr.starts_with('1') || addr.starts_with('3') {
        return addr.len() >= 26 && addr.len() <= 35;
    }
    false
}

pub fn eth_address_check(addr: &str) -> bool {
    let cleaned = addr.strip_prefix("0x").unwrap_or(addr);
    cleaned.len() == 40 && cleaned.chars().all(|c| c.is_ascii_hexdigit())
}

pub fn ssn_check(ssn: &str) -> bool {
    let digits: Vec<&str> = ssn.split('-').collect();
    if digits.len() != 3 {
        return false;
    }

    let area: u32 = match digits[0].parse() {
        Ok(n) => n,
        Err(_) => return false,
    };
    let group: u32 = match digits[1].parse() {
        Ok(n) => n,
        Err(_) => return false,
    };
    let serial: u32 = match digits[2].parse() {
        Ok(n) => n,
        Err(_) => return false,
    };

    if area == 0 || area == 666 || (900..=999).contains(&area) {
        return false;
    }
    if group == 0 {
        return false;
    }
    if serial == 0 {
        return false;
    }

    true
}

/// UK NHS Number validation using mod-11 checksum
pub fn uk_nhs_check(nhs: &str) -> bool {
    let digits: Vec<u32> = nhs
        .chars()
        .filter(|c| c.is_ascii_digit())
        .filter_map(|c| c.to_digit(10))
        .collect();

    if digits.len() != 10 {
        return false;
    }

    // NHS checksum: sum of (digit * (11 - position)) must be divisible by 11
    // Weights: 10, 9, 8, 7, 6, 5, 4, 3, 2 for first 9 digits
    let weights = [10, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum: u32 = digits[..9]
        .iter()
        .zip(weights.iter())
        .map(|(d, w)| d * w)
        .sum();

    let remainder = sum % 11;
    let check_digit = if remainder == 0 { 0 } else { 11 - remainder };

    // Check digit of 10 is invalid
    if check_digit == 10 {
        return false;
    }

    digits[9] == check_digit
}

/// Australian Tax File Number validation using weighted checksum
pub fn au_tfn_check(tfn: &str) -> bool {
    let digits: Vec<u32> = tfn
        .chars()
        .filter(|c| c.is_ascii_digit())
        .filter_map(|c| c.to_digit(10))
        .collect();

    if digits.len() != 9 {
        return false;
    }

    // TFN weights: 1, 4, 3, 7, 5, 8, 6, 9, 10
    let weights = [1, 4, 3, 7, 5, 8, 6, 9, 10];
    let sum: u32 = digits
        .iter()
        .zip(weights.iter())
        .map(|(d, w)| d * w)
        .sum();

    sum % 11 == 0
}

/// Calculate Shannon entropy of a string
pub fn calculate_entropy(s: &str) -> f64 {
    if s.is_empty() {
        return 0.0;
    }

    let mut freq = [0u32; 256];
    let len = s.len() as f64;

    for byte in s.bytes() {
        freq[byte as usize] += 1;
    }

    let mut entropy = 0.0f64;
    for &count in freq.iter() {
        if count > 0 {
            let p = (count as f64) / len;
            entropy -= p * p.log2();
        }
    }

    entropy
}

/// Check if a string has high entropy (likely a secret/password)
/// Threshold: 3.5 bits per character (higher than ScrubDuck's 3.2 to reduce false positives)
pub fn high_entropy_check(s: &str) -> bool {
    // Must be at least 8 characters
    if s.len() < 8 {
        return false;
    }

    // Skip if it's all letters (likely a word, not a secret)
    if s.chars().all(|c| c.is_ascii_alphabetic()) {
        return false;
    }

    // Skip if it looks like a common pattern (version numbers, etc.)
    if s.starts_with("v") && s[1..].chars().all(|c| c.is_ascii_digit() || c == '.') {
        return false;
    }

    // Must have mixed character types (letters + digits or special chars)
    let has_letter = s.chars().any(|c| c.is_ascii_alphabetic());
    let has_digit = s.chars().any(|c| c.is_ascii_digit());
    let has_special = s.chars().any(|c| !c.is_ascii_alphanumeric());

    // Require at least 2 of 3 character types
    let type_count = [has_letter, has_digit, has_special].iter().filter(|&&x| x).count();
    if type_count < 2 {
        return false;
    }

    let entropy = calculate_entropy(s);
    entropy > 3.5
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_credit_cards() {
        assert!(luhn_check("4532015112830366"));
        assert!(luhn_check("4111111111111111"));
        assert!(luhn_check("5500000000000004"));
    }

    #[test]
    fn test_invalid_credit_cards() {
        assert!(!luhn_check("4532015112830367"));
        assert!(!luhn_check("1234567890123456"));
    }

    #[test]
    fn test_valid_iban() {
        assert!(iban_mod97_check("GB82WEST12345698765432"));
        assert!(iban_mod97_check("DE89370400440532013000"));
    }

    #[test]
    fn test_invalid_iban() {
        assert!(!iban_mod97_check("GB82WEST12345698765433"));
        assert!(!iban_mod97_check("INVALID"));
    }

    #[test]
    fn test_btc_address() {
        assert!(btc_address_check("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2"));
        assert!(btc_address_check(
            "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"
        ));
    }

    #[test]
    fn test_eth_address() {
        assert!(eth_address_check(
            "0x742d35Cc6634C0532925a3b844Bc9e7595f8bE8f"
        ));
        assert!(!eth_address_check("0xinvalid"));
    }

    #[test]
    fn test_valid_ssn() {
        assert!(ssn_check("123-45-6789"));
        assert!(ssn_check("001-01-0001"));
    }

    #[test]
    fn test_invalid_ssn() {
        assert!(!ssn_check("000-45-6789"));
        assert!(!ssn_check("666-45-6789"));
        assert!(!ssn_check("900-45-6789"));
        assert!(!ssn_check("999-45-6789"));
        assert!(!ssn_check("123-00-6789"));
        assert!(!ssn_check("123-45-0000"));
    }

    #[test]
    fn test_entropy_calculation() {
        // Low entropy - repetitive
        let low_entropy = calculate_entropy("aaaaaaaa");
        assert!(low_entropy < 1.0);

        // Higher entropy - mixed characters
        let high_entropy = calculate_entropy("aB3$xY9!");
        assert!(high_entropy > 2.5);

        // Very high entropy - random-looking
        let very_high = calculate_entropy("xK9#mP2$vL7@nQ4!");
        assert!(very_high > 3.5);
    }

    #[test]
    fn test_high_entropy_check() {
        // Should detect random-looking passwords
        assert!(high_entropy_check("xK9#mP2$vL7@nQ4!"));
        assert!(high_entropy_check("Abc123!@#XyzDef"));

        // Should NOT detect simple words
        assert!(!high_entropy_check("password"));
        assert!(!high_entropy_check("secretkey"));

        // Should NOT detect short strings
        assert!(!high_entropy_check("abc123"));

        // Should NOT detect all-letter strings (likely words)
        assert!(!high_entropy_check("verylongpasswordword"));

        // Should NOT detect version numbers
        assert!(!high_entropy_check("v1.2.3.4.5.6"));
    }
}
