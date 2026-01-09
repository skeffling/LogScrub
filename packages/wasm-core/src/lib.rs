mod patterns;
mod validators;

use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use patterns::{DetectResult, Match, PiiDetector};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Cursor, Read, Write};
use wasm_bindgen::prelude::*;
use zip::write::FileOptions;
use zip::ZipArchive;

#[derive(Debug, Deserialize)]
struct RuleConfig {
    id: String,
    strategy: String,
    template: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
struct Replacement {
    start: usize,
    end: usize,
    original: String,
    replacement: String,
    pii_type: String,
}

#[derive(Debug, Serialize)]
struct SanitizeResult {
    output: String,
    stats: HashMap<String, usize>,
    matches: HashMap<String, Vec<String>>,
    replacements: Vec<Replacement>,
    logs: Vec<String>,
}

#[wasm_bindgen]
pub fn sanitize(text: &str, rules_json: &str, consistency_mode: bool, label_prefix: &str, label_suffix: &str) -> String {
    let rules: Vec<RuleConfig> = serde_json::from_str(rules_json).unwrap_or_default();
    let enabled_rules: Vec<&str> = rules.iter().map(|r| r.id.as_str()).collect();
    let strategy_map: HashMap<&str, &str> = rules
        .iter()
        .map(|r| (r.id.as_str(), r.strategy.as_str()))
        .collect();
    let template_map: HashMap<&str, &str> = rules
        .iter()
        .filter_map(|r| r.template.as_ref().map(|t| (r.id.as_str(), t.as_str())))
        .collect();

    let detector = PiiDetector::new();
    let DetectResult { matches, logs } = detector.detect(text, &enabled_rules);

    let mut stats: HashMap<String, usize> = HashMap::new();
    let mut found_matches: HashMap<String, Vec<String>> = HashMap::new();

    for m in &matches {
        *stats.entry(m.pii_type.clone()).or_insert(0) += 1;
        found_matches
            .entry(m.pii_type.clone())
            .or_default()
            .push(m.value.clone());
    }

    let (output, replacements) = apply_replacements(
        text,
        &matches,
        &strategy_map,
        &template_map,
        consistency_mode,
        label_prefix,
        label_suffix,
    );

    let result = SanitizeResult {
        output,
        stats,
        matches: found_matches,
        replacements,
        logs,
    };
    serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string())
}

fn apply_template(template: &str, n: usize, pii_type: &str, original: &str) -> String {
    template
        .replace("{n}", &n.to_string())
        .replace("{type}", pii_type)
        .replace("{TYPE}", &pii_type.to_uppercase())
        .replace("{original}", original)
        .replace("{len}", &original.len().to_string())
}

fn apply_replacements(
    text: &str,
    matches: &[Match],
    strategy_map: &HashMap<&str, &str>,
    template_map: &HashMap<&str, &str>,
    consistency_mode: bool,
    label_prefix: &str,
    label_suffix: &str,
) -> (String, Vec<Replacement>) {
    if matches.is_empty() {
        return (text.to_string(), Vec::new());
    }

    let mut sorted_matches = matches.to_vec();
    sorted_matches.sort_by(|a, b| a.start.cmp(&b.start).then_with(|| b.end.cmp(&a.end)));

    let mut filtered_matches: Vec<Match> = Vec::new();
    for m in &sorted_matches {
        let dominated = filtered_matches
            .iter()
            .any(|existing| existing.start <= m.start && existing.end >= m.end);
        if !dominated {
            filtered_matches.push(m.clone());
        }
    }
    let mut sorted_matches = filtered_matches;

    let mut consistency_map: HashMap<String, String> = HashMap::new();
    let mut type_counters: HashMap<String, usize> = HashMap::new();
    let mut replacements: Vec<Replacement> = Vec::new();

    for m in &sorted_matches {
        let strategy = strategy_map
            .get(m.pii_type.as_str())
            .copied()
            .unwrap_or("label");
        let template = template_map.get(m.pii_type.as_str()).copied();

        let replacement_text = if consistency_mode {
            consistency_map
                .entry(m.value.clone())
                .or_insert_with(|| {
                    generate_replacement(
                        &m.pii_type,
                        &m.value,
                        strategy,
                        template,
                        &mut type_counters,
                        label_prefix,
                        label_suffix,
                    )
                })
                .clone()
        } else {
            generate_replacement(
                &m.pii_type,
                &m.value,
                strategy,
                template,
                &mut type_counters,
                label_prefix,
                label_suffix,
            )
        };

        replacements.push(Replacement {
            start: m.start,
            end: m.end,
            original: m.value.clone(),
            replacement: replacement_text,
            pii_type: m.pii_type.clone(),
        });
    }

    sorted_matches.sort_by(|a, b| b.start.cmp(&a.start));
    let mut result = text.to_string();
    for m in sorted_matches {
        let rep = replacements
            .iter()
            .find(|r| r.start == m.start && r.end == m.end)
            .unwrap();
        result.replace_range(m.start..m.end, &rep.replacement);
    }

    (result, replacements)
}

fn generate_replacement(
    pii_type: &str,
    original: &str,
    strategy: &str,
    template: Option<&str>,
    counters: &mut HashMap<String, usize>,
    label_prefix: &str,
    label_suffix: &str,
) -> String {
    match strategy {
        "template" => {
            if let Some(tmpl) = template {
                let count = counters
                    .entry(format!("{}_template", pii_type))
                    .or_insert(0);
                *count += 1;
                apply_template(tmpl, *count, pii_type, original)
            } else {
                format!("{}{}{}",label_prefix, pii_type.to_uppercase(), label_suffix)
            }
        }
        "label" => {
            let count = counters.entry(pii_type.to_string()).or_insert(0);
            *count += 1;
            format!("{}{}-{}{}", label_prefix, pii_type.to_uppercase(), count, label_suffix)
        }
        "fake" => {
            let count = counters.entry(format!("{}_fake", pii_type)).or_insert(0);
            *count += 1;
            generate_fake(pii_type, original, *count)
        }
        "redact" => "\u{2588}".repeat(original.len().min(16)),
        _ => format!("{}{}{}", label_prefix, pii_type.to_uppercase(), label_suffix),
    }
}

fn generate_fake(pii_type: &str, _original: &str, count: usize) -> String {
    match pii_type {
        "email" => format!("user{}@example.com", count),
        "email_message_id" => format!("<msg{}@mail.example.com>", count),
        "ipv4" => format!("192.0.2.{}", count.min(255)),
        "ipv6" => format!("2001:db8::{}", count),
        "mac_address" => format!("00:00:00:00:00:{:02X}", count.min(255)),
        "hostname" => format!("example{}.com", count),
        "url" => format!("https://example.com/path{}", count),
        "credit_card" => format!("411111111111{:04}", count % 10000),
        "ssn" => format!("000-00-{:04}", count % 10000),
        "jwt" => format!("eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IjAifQ.XXXXX{}", count),
        "phone_us" | "phone_intl" => format!("+1-555-000-{:04}", count % 10000),
        "phone_uk" => format!("01onal {:06}", count % 1000000),
        "uuid" => format!("00000000-0000-0000-0000-{:012}", count),
        "iban" => format!("GB00XXXX0000000000{:04}", count % 10000),
        "aws_access_key" => format!("AKIAIOSFODNN{:08}", count),
        "aws_secret_key" => format!("wJalrXUtnFEMI/K7MDENG/bPxRfiCY{:010}", count),
        "stripe_key" => format!("sk_test_{:024}", count),
        "gcp_api_key" => format!("AIzaSy{:033}", count),
        "github_token" => format!("ghp_{:036}", count),
        "bearer_token" => format!("Bearer XXXXX.XXXXX.{:05}", count),
        "generic_secret" => format!("password: ****{}", count),
        "btc_address" => format!("1FAKE{:028}", count),
        "eth_address" => format!("0x{:040}", count),
        "gps_coordinates" => format!("{}.0000, {}.0000", count % 90, count % 180),
        "file_path_unix" => format!("/home/user/file{}.txt", count),
        "file_path_windows" => format!("C:\\Users\\user\\file{}.txt", count),
        "postcode_uk" => format!("SW{} 1AA", count % 100),
        "postcode_us" => format!("{:05}", count % 100000),
        "passport" => format!("X{:08}", count),
        "drivers_license" => format!("DL: X{:07}", count),
        "session_id" => format!("session_id={:016X}", count),
        "private_key" => "-----BEGIN PRIVATE KEY-----".to_string(),
        "slack_token" => format!("xoxb-{:010}-{:013}-XXXX", count, count),
        "openai_key" => format!("sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxx{:04}", count),
        "anthropic_key" => format!("sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx{:04}", count),
        "xai_key" => format!("xai-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx{:04}", count),
        "cerebras_key" => format!("csk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx{:04}", count),
        "uk_nhs" => format!("{:03} {:03} {:04}", count % 1000, count % 1000, count % 10000),
        "uk_nino" => format!("AB{:02}{:02}{:02}C", count % 100, count % 100, count % 100),
        "us_itin" => format!("9{:02}-{:02}-{:04}", count % 100, 50 + (count % 30), count % 10000),
        "au_tfn" => format!("{:03} {:03} {:03}", count % 1000, count % 1000, count % 1000),
        "in_pan" => format!("XXXPX{:04}X", count % 10000),
        "sg_nric" => format!("S{:07}X", count % 10000000),
        "high_entropy_secret" => format!("[HIGH-ENTROPY-SECRET-{}]", count),
        "basic_auth" => format!("Basic XXXX{}", count),
        "url_credentials" => format!("https://user{}:****@example.com", count),
        "date_mdy" => format!("01/{:02}/2000", (count % 28) + 1),
        "date_dmy" => format!("{:02}/01/2000", (count % 28) + 1),
        "date_iso" => format!("2000-01-{:02}", (count % 28) + 1),
        "time" => format!("{:02}:00:00", count % 24),
        "datetime_iso" => format!("2000-01-{:02}T00:00:00Z", (count % 28) + 1),
        "timestamp_unix" => format!("{}", 946684800 + count * 86400),
        _ => format!("[REDACTED-{}]", count),
    }
}

#[wasm_bindgen]
pub fn decompress_gzip(data: &[u8]) -> Result<String, JsValue> {
    let mut decoder = GzDecoder::new(data);
    let mut result = String::new();
    decoder
        .read_to_string(&mut result)
        .map_err(|e| JsValue::from_str(&format!("Gzip decompression failed: {}", e)))?;
    Ok(result)
}

#[wasm_bindgen]
pub fn compress_gzip(text: &str) -> Result<Vec<u8>, JsValue> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::best());
    encoder
        .write_all(text.as_bytes())
        .map_err(|e| JsValue::from_str(&format!("Gzip compression failed: {}", e)))?;
    encoder
        .finish()
        .map_err(|e| JsValue::from_str(&format!("Gzip finish failed: {}", e)))
}

#[wasm_bindgen]
pub fn decompress_zip(data: &[u8]) -> Result<String, JsValue> {
    let cursor = Cursor::new(data);
    let mut archive = ZipArchive::new(cursor)
        .map_err(|e| JsValue::from_str(&format!("Failed to read zip: {}", e)))?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| JsValue::from_str(&format!("Failed to read zip entry: {}", e)))?;

        let name = file.name().to_string();
        if file.is_dir() || name.starts_with("__MACOSX") || name.starts_with('.') {
            continue;
        }

        let mut contents = String::new();
        file.read_to_string(&mut contents)
            .map_err(|e| JsValue::from_str(&format!("Failed to read file contents: {}", e)))?;
        return Ok(contents);
    }

    Err(JsValue::from_str("No text files found in zip"))
}

#[wasm_bindgen]
pub fn compress_zip(text: &str, filename: &str) -> Result<Vec<u8>, JsValue> {
    let mut buffer = Cursor::new(Vec::new());
    {
        let mut zip = zip::ZipWriter::new(&mut buffer);
        let options = FileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .unix_permissions(0o644);

        zip.start_file(filename, options)
            .map_err(|e| JsValue::from_str(&format!("Failed to start zip file: {}", e)))?;
        zip.write_all(text.as_bytes())
            .map_err(|e| JsValue::from_str(&format!("Failed to write to zip: {}", e)))?;
        zip.finish()
            .map_err(|e| JsValue::from_str(&format!("Failed to finish zip: {}", e)))?;
    }
    Ok(buffer.into_inner())
}
