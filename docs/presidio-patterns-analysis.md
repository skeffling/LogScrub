# Presidio Patterns Analysis

## Summary

Microsoft Presidio is a comprehensive PII detection framework (MIT licensed). While it requires Python/NLP for full functionality, its **regex patterns and validation algorithms** can be ported to LogScrub.

## Patterns We Could Add

### High Value - UK Patterns (LogScrub has UK users)

| Pattern | Regex | Validation | Notes |
|---------|-------|------------|-------|
| **UK NHS Number** | `\b([0-9]{3})[- ]?([0-9]{3})[- ]?([0-9]{4})\b` | Modulo 11 checksum | 10-digit health ID |
| **UK National Insurance (NINO)** | `\b(?!BG\|GB\|NK\|KN\|NT\|TN\|ZZ)[A-CEGHJ-PR-TW-Z]{2}\s?[0-9]{2}\s?[0-9]{2}\s?[0-9]{2}\s?[A-D]\b` | Format only | Excludes invalid prefixes |

### High Value - US Patterns (Additions)

| Pattern | Regex | Validation | Notes |
|---------|-------|------------|-------|
| **US ITIN** | `\b9\d{2}[- ](5\d\|6[0-5]\|7\d\|8[0-8]\|9([0-2]\|[4-9]))[- ]\d{4}\b` | Format | Individual Taxpayer ID |
| **ABA Routing Number** | `\b[0123678]\d{8}\b` | Checksum (3,7,1 weights) | Bank routing number |
| **US Bank Account** | `\b\d{8,17}\b` | Context-based | Generic, needs context |

### Medium Value - Australia Patterns

| Pattern | Regex | Validation | Notes |
|---------|-------|------------|-------|
| **AU Medicare** | `\b[2-6]\d{3}\s?\d{5}\s?\d\b` | Mod 10 checksum | 10-digit health ID |
| **AU Tax File Number (TFN)** | `\b\d{3}\s?\d{3}\s?\d{3}\b` | Checksum | 9-digit tax ID |
| **AU Business Number (ABN)** | `\b\d{2}\s?\d{3}\s?\d{3}\s?\d{3}\b` | Mod 89 checksum | 11-digit business ID |
| **AU Company Number (ACN)** | `\b\d{3}\s?\d{3}\s?\d{3}\b` | Checksum | 9-digit company ID |

### Medium Value - India Patterns

| Pattern | Regex | Validation | Notes |
|---------|-------|------------|-------|
| **Aadhaar** | `\b[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}\b` | Verhoeff checksum | 12-digit national ID |
| **PAN** | `\b[A-Z]{3}[ABCFGHLJPT][A-Z][0-9]{4}[A-Z]\b` | Format | 10-char tax ID |
| **GSTIN** | `\b(0[1-9]\|[1-3][0-7])[A-Z0-9]{10}[A-Z0-9]Z[A-Z0-9]\b` | Format | GST registration |
| **Voter ID** | `\b[A-Z]{3}[0-9]{7}\b` | Format | Electoral ID |

### Medium Value - Europe Patterns

| Pattern | Regex | Validation | Notes |
|---------|-------|------------|-------|
| **Spain NIF** | `\b[0-9]{8}[A-Z]\b` | Letter checksum | National ID |
| **Spain NIE** | `\b[XYZ][0-9]{7}[A-Z]\b` | Letter checksum | Foreigner ID |
| **Italy Fiscal Code** | `\b[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]\b` | Complex checksum | 16-char tax code |
| **Italy VAT** | `\b[0-9]{11}\b` | Luhn-like | 11-digit VAT |
| **Poland PESEL** | `\b[0-9]{2}([02468][1-9]\|[13579][012])(0[1-9]\|[12][0-9]\|3[01])[0-9]{5}\b` | Checksum | 11-digit national ID |
| **Finland Personal ID** | `\b\d{6}[+-ABCDEFYXWVU]\d{3}[0-9A-Z]\b` | Check digit | Date-based format |

### Medium Value - Asia Patterns

| Pattern | Regex | Validation | Notes |
|---------|-------|------------|-------|
| **Singapore NRIC/FIN** | `\b[STFGM][0-9]{7}[A-Z]\b` | Checksum | 9-char national ID |
| **Korea RRN** | `\b\d{6}-?[1-4]\d{6}\b` | Checksum | 13-digit resident number |
| **Thailand National ID** | `\b[1-8]\d{12}\b` | Checksum | 13-digit national ID |

### Low Value - Generic Patterns

| Pattern | Regex | Validation | Notes |
|---------|-------|------------|-------|
| **Bitcoin Address** | `(bc1\|[13])[a-zA-HJ-NP-Z0-9]{25,59}` | Base58/Bech32 checksum | Crypto wallet |
| **Phone Numbers** | (uses python-phonenumbers lib) | Library-based | Not regex-based |

## Validation Algorithms to Port

### 1. NHS Checksum (UK)
```rust
fn validate_nhs(digits: &str) -> bool {
    let total: u32 = digits.chars()
        .enumerate()
        .map(|(i, c)| c.to_digit(10).unwrap() * (10 - i as u32))
        .sum();
    total % 11 == 0
}
```

### 2. Verhoeff Algorithm (India Aadhaar)
Uses multiplication table `d`, permutation table `p`, and inverse table. Full implementation from Presidio:
```rust
fn is_verhoeff(input: &str) -> bool {
    let d: [[u8; 10]; 10] = [
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
        [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
        [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
        [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
        [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
        [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
        [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
        [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
        [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
    ];
    let p: [[u8; 10]; 8] = [
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
        [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
        [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
        [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
        [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
        [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
        [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
    ];
    let inv = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

    let mut c = 0u8;
    for (i, ch) in input.chars().rev().enumerate() {
        let digit = ch.to_digit(10).unwrap() as usize;
        c = d[c as usize][p[i % 8][digit] as usize];
    }
    inv[c as usize] == 0
}
```

### 3. ABA Routing Checksum (US)
```rust
fn validate_aba(digits: &str) -> bool {
    let weights = [3, 7, 1, 3, 7, 1, 3, 7, 1];
    let sum: u32 = digits.chars()
        .zip(weights.iter())
        .map(|(c, w)| c.to_digit(10).unwrap() * w)
        .sum();
    sum % 10 == 0
}
```

### 4. Australian TFN Checksum
```rust
fn validate_au_tfn(digits: &str) -> bool {
    let weights = [1, 4, 3, 7, 5, 8, 6, 9, 10];
    let sum: u32 = digits.chars()
        .zip(weights.iter())
        .map(|(c, w)| c.to_digit(10).unwrap() * w)
        .sum();
    sum % 11 == 0
}
```

### 5. Spain NIF/NIE Letter Checksum
```rust
fn validate_nif(pattern_text: &str) -> bool {
    let letters = "TRWAGMYFPDXBNJZSQVHLCKE";
    let letter = pattern_text.chars().last().unwrap();
    let number: u32 = pattern_text[..pattern_text.len()-1]
        .chars().filter(|c| c.is_digit(10))
        .collect::<String>().parse().unwrap();
    letter == letters.chars().nth((number % 23) as usize).unwrap()
}

fn validate_nie(pattern_text: &str) -> bool {
    let letters = "TRWAGMYFPDXBNJZSQVHLCKE";
    let letter = pattern_text.chars().last().unwrap();
    let prefix_map = [('X', 0), ('Y', 1), ('Z', 2)];
    let prefix_digit = prefix_map.iter()
        .find(|(c, _)| *c == pattern_text.chars().next().unwrap())
        .map(|(_, d)| d).unwrap();
    let number: u32 = format!("{}{}", prefix_digit, &pattern_text[1..pattern_text.len()-1])
        .parse().unwrap();
    letter == letters.chars().nth((number % 23) as usize).unwrap()
}
```

### 6. Poland PESEL Checksum
```rust
fn validate_pesel(digits: &str) -> bool {
    let weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
    let sum: u32 = digits[..10].chars()
        .zip(weights.iter())
        .map(|(c, w)| c.to_digit(10).unwrap() * w)
        .sum();
    (sum % 10) == digits.chars().nth(10).unwrap().to_digit(10).unwrap()
}
```

### 7. Finland Personal ID Check Digit
```rust
fn validate_fi_hetu(id: &str) -> bool {
    let valid_chars = "0123456789ABCDEFHJKLMNPRSTUVWXY";
    let date_part = &id[0..6];
    let individual = &id[7..10];
    let control = id.chars().last().unwrap();
    let number: u32 = format!("{}{}", date_part, individual).parse().unwrap();
    control == valid_chars.chars().nth((number % 31) as usize).unwrap()
}
```

### 8. Korea RRN Checksum
```rust
fn validate_kr_rrn(rrn: &str) -> bool {
    let weights = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];
    let sum: u32 = rrn[..12].chars()
        .zip(weights.iter())
        .map(|(c, w)| c.to_digit(10).unwrap() * w)
        .sum();
    let checksum = (11 - (sum % 11)) % 10;
    checksum == rrn.chars().nth(12).unwrap().to_digit(10).unwrap()
}
```

### 9. Thailand TNIN Checksum
```rust
fn validate_th_tnin(tnin: &str) -> bool {
    let weights: Vec<u32> = (2..=13).rev().collect(); // [13,12,11,...,2]
    let sum: u32 = tnin[..12].chars()
        .zip(weights.iter())
        .map(|(c, w)| c.to_digit(10).unwrap() * w)
        .sum();
    let x = sum % 11;
    let expected = if x <= 1 { 1 - x } else { 11 - x };
    expected == tnin.chars().nth(12).unwrap().to_digit(10).unwrap()
}
```

### 10. Italy Fiscal Code Checksum
Complex algorithm using odd/even position maps and mod-26 final calculation.
See `it_fiscal_code_recognizer.py` for full implementation.

### 11. Italy VAT Checksum (Luhn-like)
```rust
fn validate_it_vat(vat: &str) -> bool {
    if vat == "00000000000" { return false; }
    let mut x = 0u32;
    let mut y = 0u32;
    for i in 0..5 {
        x += vat.chars().nth(2*i).unwrap().to_digit(10).unwrap();
        let mut tmp_y = vat.chars().nth(2*i+1).unwrap().to_digit(10).unwrap() * 2;
        if tmp_y > 9 { tmp_y -= 9; }
        y += tmp_y;
    }
    let c = (10 - ((x + y) % 10)) % 10;
    c == vat.chars().nth(10).unwrap().to_digit(10).unwrap()
}
```

## Key Learnings from Presidio Architecture

### 1. Confidence Scoring
Presidio assigns confidence scores (0.01 to 1.0) to patterns:
- Very Weak: 0.01-0.05 (generic patterns, high false positive risk)
- Weak: 0.1-0.3 (needs context)
- Medium: 0.5 (good standalone)
- High: 0.7-1.0 (very specific patterns)

**Recommendation**: We could display confidence/specificity info in LogScrub's help docs.

### 2. Context Words
Presidio boosts confidence when PII appears near related words:
- NHS: ["national health service", "nhs", "health authority"]
- ITIN: ["individual", "taxpayer", "itin", "tax", "payer"]
- Bank: ["aba", "routing", "bank"]

**Recommendation**: Could be a future feature for LogScrub.

### 3. Multiple Pattern Variants
Each entity has multiple regex patterns for different formats:
- With/without separators
- With/without leading context words
- Strict vs. loose matching

**Recommendation**: We already do this for some patterns (phone_us, date variants).

### 12. US SSN Invalidation Rules
Presidio doesn't use a checksum but invalidates certain patterns:
- All same digit (111-11-1111)
- Groups with all zeros (XXX-00-XXXX or XXX-XX-0000)
- Invalid prefixes: 000, 666, 078051120, 123456789, 98765432
- Mismatched delimiters

## Implementation Priority

### Phase 1 - Quick Wins (Regex-only, no complex validation)
1. UK NINO (format validation only, excludes invalid prefixes)
2. US ITIN (format validation)
3. Singapore NRIC/FIN (format validation)
4. India PAN (format validation)
5. Bitcoin/Crypto wallet address

### Phase 2 - With Simple Validators
1. UK NHS (mod 11)
2. ABA Routing (weighted 3-7-1 checksum)
3. Australia TFN (weighted mod 11)
4. Spain NIF/NIE (mod 23 letter)
5. Poland PESEL (weighted checksum)
6. Finland Personal ID (mod 31)

### Phase 3 - Complex Validators
1. India Aadhaar (Verhoeff algorithm)
2. Italy Fiscal Code (odd/even position maps)
3. Italy VAT (Luhn-like)
4. Korea RRN (weighted checksum)
5. Thailand TNIN (weighted mod 11)
6. Enhanced IBAN (country-specific formats from Presidio's 70+ patterns)

## Files Reference

Presidio source: `/tmp/presidio/presidio-analyzer/presidio_analyzer/predefined_recognizers/`
- `country_specific/uk/` - NHS, NINO
- `country_specific/us/` - SSN, ITIN, ABA, Passport, Driver License, Medical License, Bank Account
- `country_specific/australia/` - TFN, Medicare, ABN, ACN
- `country_specific/india/` - Aadhaar, PAN, GSTIN, Voter ID, Passport, Vehicle Registration
- `country_specific/italy/` - Fiscal Code, VAT, Passport, ID Card, Driver License
- `country_specific/spain/` - NIF, NIE
- `country_specific/singapore/` - NRIC/FIN, UEN (Unique Entity Number)
- `country_specific/korea/` - RRN, Passport, Driver License
- `country_specific/poland/` - PESEL
- `country_specific/finland/` - Personal Identity Code (Henkilötunnus)
- `country_specific/thai/` - National ID (TNIN)
- `generic/` - IBAN (70+ countries), Credit Card, Email, URL, IP, Date, Crypto (Bitcoin)
- `ner/` - GLiNER (named entity recognition)
- `nlp_engine_recognizers/` - spaCy, Stanza, Transformers
- `third_party/` - Azure AI Language, OpenAI integration

## Complete Pattern Regex Reference

### UK
| Entity | Regex |
|--------|-------|
| NHS | `\b([0-9]{3})[- ]?([0-9]{3})[- ]?([0-9]{4})\b` |
| NINO | `\b(?!BG\|GB\|NK\|KN\|NT\|TN\|ZZ)[A-CEGHJ-PR-TW-Z]{2}\s?[0-9]{2}\s?[0-9]{2}\s?[0-9]{2}\s?[A-D]\b` |

### US
| Entity | Regex |
|--------|-------|
| SSN | `\b([0-9]{3})[- .]([0-9]{2})[- .]([0-9]{4})\b` |
| ITIN | `\b9\d{2}[- ](5\d\|6[0-5]\|7\d\|8[0-8]\|9([0-2]\|[4-9]))[- ]\d{4}\b` |
| ABA Routing | `\b[0123678]\d{8}\b` |
| Passport | `\b[0-9]{9}\b` or `\b[A-Z][0-9]{8}\b` |

### Australia
| Entity | Regex |
|--------|-------|
| TFN | `\b\d{3}\s\d{3}\s\d{3}\b` |
| Medicare | `\b[2-6]\d{3}\s?\d{5}\s?\d\b` |
| ABN | `\b\d{2}\s?\d{3}\s?\d{3}\s?\d{3}\b` |
| ACN | `\b\d{3}\s?\d{3}\s?\d{3}\b` |

### India
| Entity | Regex |
|--------|-------|
| Aadhaar | `\b[0-9]{4}[- :]?[0-9]{4}[- :]?[0-9]{4}\b` |
| PAN | `\b[A-Z]{3}[ABCFGHLJPT][A-Z][0-9]{4}[A-Z]\b` |

### Europe
| Entity | Regex |
|--------|-------|
| Spain NIF | `\b[0-9]?[0-9]{7}[-]?[A-Z]\b` |
| Spain NIE | `\b[X-Z]?[0-9]?[0-9]{7}[-]?[A-Z]\b` |
| Italy Fiscal Code | Complex - see source |
| Italy VAT | `\b([0-9][ _]?){11}\b` |
| Poland PESEL | `[0-9]{2}([02468][1-9]\|[13579][012])(0[1-9]\|1[0-9]\|2[0-9]\|3[01])[0-9]{5}` |
| Finland Personal ID | `\b(\d{6})([+-ABCDEFYXWVU])(\d{3})([0-9A-Z])\b` |

### Asia
| Entity | Regex |
|--------|-------|
| Singapore NRIC/FIN | `\b[STFGM][0-9]{7}[A-Z]\b` |
| Singapore UEN | `\b\d{8}[A-Z]\b\|\b\d{9}[A-Z]\b\|\b(T\|S)\d{2}[A-Z]{2}\d{4}[A-Z]\b` |
| Korea RRN | `\d{2}(0[1-9]\|1[0-2])(0[1-9]\|[12]\d\|3[01])(-?)[1-4]\d{6}` |
| Thailand TNIN | `\b[1-9](?:[134][0-9]\|[25][0134567]\|[67][01234567]\|[89][0123456])\d{10}\b` |

### Generic
| Entity | Regex |
|--------|-------|
| Bitcoin | `(bc1\|[13])[a-zA-HJ-NP-Z0-9]{25,59}` |
| IPv4 | `\b(?:25[0-5]\|2[0-4][0-9]\|[01]?[0-9][0-9]?)\.(?:...){3}\b` |
| Email | `\b((([!#$%&'*+\-/=?^_\`{\|}~\w])\|...[@]\w+[-.]?\w+\.\w+)\b` |
