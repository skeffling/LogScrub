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
}
