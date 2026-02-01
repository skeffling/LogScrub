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

/// UK National Insurance Number validation
/// Checks for invalid prefixes and valid character ranges
pub fn uk_nino_check(nino: &str) -> bool {
    let upper = nino.to_uppercase();
    let chars: Vec<char> = upper.chars().filter(|c| c.is_ascii_alphanumeric()).collect();

    if chars.len() < 9 {
        return false;
    }

    let prefix: String = chars[0..2].iter().collect();

    // Invalid prefixes
    let invalid_prefixes = ["BG", "GB", "NK", "KN", "NT", "TN", "ZZ"];
    if invalid_prefixes.contains(&prefix.as_str()) {
        return false;
    }

    // First letter must be A-Z excluding D, F, I, Q, U, V
    let first = chars[0];
    if matches!(first, 'D' | 'F' | 'I' | 'Q' | 'U' | 'V') {
        return false;
    }

    // Second letter must be A-Z excluding D, F, I, O, Q, U, V
    let second = chars[1];
    if matches!(second, 'D' | 'F' | 'I' | 'O' | 'Q' | 'U' | 'V') {
        return false;
    }

    true
}

/// Singapore NRIC/FIN checksum validation
/// Uses weighted sum with different check letter tables based on first letter
pub fn sg_nric_check(nric: &str) -> bool {
    let upper = nric.to_uppercase();
    let chars: Vec<char> = upper.chars().collect();

    if chars.len() != 9 {
        return false;
    }

    let first = chars[0];
    let check_letter = chars[8];

    // Extract 7 digits
    let digits: Vec<u32> = chars[1..8]
        .iter()
        .filter_map(|c| c.to_digit(10))
        .collect();

    if digits.len() != 7 {
        return false;
    }

    // Weights: 2, 7, 6, 5, 4, 3, 2
    let weights = [2, 7, 6, 5, 4, 3, 2];
    let mut sum: u32 = digits.iter().zip(weights.iter()).map(|(d, w)| d * w).sum();

    // Add offset based on first letter
    match first {
        'S' | 'T' => {
            // Offset for S/T (citizens)
            if first == 'T' {
                sum += 4;
            }
            let check_letters = ['J', 'Z', 'I', 'H', 'G', 'F', 'E', 'D', 'C', 'B', 'A'];
            let idx = (sum % 11) as usize;
            check_letter == check_letters[idx]
        }
        'F' | 'G' => {
            // Offset for F/G (permanent residents)
            if first == 'G' {
                sum += 4;
            }
            let check_letters = ['X', 'W', 'U', 'T', 'R', 'Q', 'P', 'N', 'M', 'L', 'K'];
            let idx = (sum % 11) as usize;
            check_letter == check_letters[idx]
        }
        'M' => {
            // M prefix (2022+)
            sum += 3;
            let check_letters = ['X', 'W', 'U', 'T', 'R', 'Q', 'P', 'N', 'M', 'L', 'K'];
            let idx = (sum % 11) as usize;
            check_letter == check_letters[idx]
        }
        _ => false,
    }
}

/// Spanish NIF (DNI) validation using mod-23 checksum
/// Format: 8 digits + 1 check letter
pub fn es_nif_check(nif: &str) -> bool {
    let chars: Vec<char> = nif.chars().collect();

    if chars.len() != 9 {
        return false;
    }

    // First 8 characters should be digits
    let digits: String = chars[..8].iter().collect();
    let number: u32 = match digits.parse() {
        Ok(n) => n,
        Err(_) => return false,
    };

    let check_letter = chars[8].to_ascii_uppercase();
    let check_letters = ['T', 'R', 'W', 'A', 'G', 'M', 'Y', 'F', 'P', 'D', 'X', 'B', 'N', 'J', 'Z', 'S', 'Q', 'V', 'H', 'L', 'C', 'K', 'E'];

    let expected = check_letters[(number % 23) as usize];
    check_letter == expected
}

/// Spanish NIE validation using mod-23 checksum
/// Format: X/Y/Z + 7 digits + 1 check letter (X=0, Y=1, Z=2)
pub fn es_nie_check(nie: &str) -> bool {
    let upper = nie.to_uppercase();
    let chars: Vec<char> = upper.chars().collect();

    if chars.len() != 9 {
        return false;
    }

    // First character determines prefix value
    let prefix_value = match chars[0] {
        'X' => 0,
        'Y' => 1,
        'Z' => 2,
        _ => return false,
    };

    // Middle 7 characters should be digits
    let digits: String = chars[1..8].iter().collect();
    let middle_number: u32 = match digits.parse() {
        Ok(n) => n,
        Err(_) => return false,
    };

    // Combine prefix with middle digits
    let number = prefix_value * 10_000_000 + middle_number;

    let check_letter = chars[8];
    let check_letters = ['T', 'R', 'W', 'A', 'G', 'M', 'Y', 'F', 'P', 'D', 'X', 'B', 'N', 'J', 'Z', 'S', 'Q', 'V', 'H', 'L', 'C', 'K', 'E'];

    let expected = check_letters[(number % 23) as usize];
    check_letter == expected
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

    #[test]
    fn test_valid_sg_nric() {
        // Valid S-series NRIC (S1234567: sum=106, 106%11=7 → D)
        assert!(sg_nric_check("S1234567D"));
        // Valid S-series (S0000001: sum=2, 2%11=2 → I)
        assert!(sg_nric_check("S0000001I"));
        // Valid T-series NRIC (T0000001: sum=2+4=6, 6%11=6 → E)
        assert!(sg_nric_check("T0000001E"));
        // Valid F-series FIN (F1234567: sum=106, 106%11=7 → N)
        assert!(sg_nric_check("F1234567N"));
        // Valid G-series FIN (G1234567: sum=106+4=110, 110%11=0 → X)
        assert!(sg_nric_check("G1234567X"));
    }

    #[test]
    fn test_invalid_sg_nric() {
        // Wrong check letter
        assert!(!sg_nric_check("S1234567A"));
        // Too short
        assert!(!sg_nric_check("S123456D"));
        // Too long
        assert!(!sg_nric_check("S12345678D"));
        // Invalid prefix
        assert!(!sg_nric_check("A1234567D"));
    }

    #[test]
    fn test_valid_es_nif() {
        // Valid NIF/DNI numbers
        assert!(es_nif_check("12345678Z"));
        assert!(es_nif_check("00000000T"));
    }

    #[test]
    fn test_invalid_es_nif() {
        // Wrong check letter
        assert!(!es_nif_check("12345678A"));
        // Too short
        assert!(!es_nif_check("1234567Z"));
        // Too long
        assert!(!es_nif_check("123456789Z"));
    }

    #[test]
    fn test_valid_es_nie() {
        // Valid NIE numbers
        assert!(es_nie_check("X0000000T"));
        assert!(es_nie_check("Y0000000Z"));
        assert!(es_nie_check("Z0000000M"));
    }

    #[test]
    fn test_invalid_es_nie() {
        // Wrong check letter
        assert!(!es_nie_check("X0000000A"));
        // Invalid prefix
        assert!(!es_nie_check("A0000000T"));
        // Too short
        assert!(!es_nie_check("X000000T"));
    }
}
