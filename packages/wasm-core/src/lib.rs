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

    let (output, replacements) = apply_replacements(
        text,
        &matches,
        &strategy_map,
        &template_map,
        consistency_mode,
        label_prefix,
        label_suffix,
    );

    // Calculate stats from actual replacements (after overlap filtering)
    let mut stats: HashMap<String, usize> = HashMap::new();
    let mut found_matches: HashMap<String, Vec<String>> = HashMap::new();

    for r in &replacements {
        *stats.entry(r.pii_type.clone()).or_insert(0) += 1;
        found_matches
            .entry(r.pii_type.clone())
            .or_default()
            .push(r.original.clone());
    }

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
        "exim_subject" => format!("T=\"[Subject {}]\"", count),
        "exim_sender" => format!("F=<user{}@example.com>", count),
        "exim_auth" => format!("A=login:user{}", count),
        "exim_user" => format!("U=user{}", count),
        "exim_dn" => format!("DN=CN=User{},O=Example", count),
        "md5_hash" => format!("{:032x}", count),
        "sha1_hash" => format!("{:040x}", count),
        "sha256_hash" => format!("{:064x}", count),
        "docker_container_id" => format!("{:012x}", count),
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
pub fn decompress_zip_file(data: &[u8], target_filename: &str) -> Result<String, JsValue> {
    let cursor = Cursor::new(data);
    let mut archive = ZipArchive::new(cursor)
        .map_err(|e| JsValue::from_str(&format!("Failed to read zip: {}", e)))?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| JsValue::from_str(&format!("Failed to read zip entry: {}", e)))?;

        let name = file.name().to_string();
        if name == target_filename {
            let mut contents = String::new();
            file.read_to_string(&mut contents)
                .map_err(|e| JsValue::from_str(&format!("Failed to read file contents: {}", e)))?;
            return Ok(contents);
        }
    }

    Err(JsValue::from_str(&format!("File '{}' not found in zip", target_filename)))
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

/// Repackage a ZIP archive with one file's content replaced
/// Used for modifying DOCX/XLSX files while preserving other files
#[wasm_bindgen]
pub fn compress_zip_replace(original_data: &[u8], target_filename: &str, new_content: &str) -> Result<Vec<u8>, JsValue> {
    let cursor = Cursor::new(original_data);
    let mut archive = ZipArchive::new(cursor)
        .map_err(|e| JsValue::from_str(&format!("Failed to read zip: {}", e)))?;

    let mut output_buffer = Cursor::new(Vec::new());
    {
        let mut zip_writer = zip::ZipWriter::new(&mut output_buffer);

        for i in 0..archive.len() {
            let mut file = archive
                .by_index(i)
                .map_err(|e| JsValue::from_str(&format!("Failed to read zip entry: {}", e)))?;

            let name = file.name().to_string();
            let options = FileOptions::default()
                .compression_method(file.compression())
                .unix_permissions(file.unix_mode().unwrap_or(0o644));

            if file.is_dir() {
                zip_writer.add_directory(&name, options)
                    .map_err(|e| JsValue::from_str(&format!("Failed to add directory: {}", e)))?;
            } else {
                zip_writer.start_file(&name, options)
                    .map_err(|e| JsValue::from_str(&format!("Failed to start file: {}", e)))?;

                if name == target_filename {
                    // Write the new content for the target file
                    zip_writer.write_all(new_content.as_bytes())
                        .map_err(|e| JsValue::from_str(&format!("Failed to write new content: {}", e)))?;
                } else {
                    // Copy original content
                    let mut contents = Vec::new();
                    file.read_to_end(&mut contents)
                        .map_err(|e| JsValue::from_str(&format!("Failed to read file: {}", e)))?;
                    zip_writer.write_all(&contents)
                        .map_err(|e| JsValue::from_str(&format!("Failed to write content: {}", e)))?;
                }
            }
        }

        zip_writer.finish()
            .map_err(|e| JsValue::from_str(&format!("Failed to finish zip: {}", e)))?;
    }

    Ok(output_buffer.into_inner())
}

// ============================================================================
// Syntax Validation Functions
// ============================================================================

#[derive(Debug, Serialize)]
struct ValidationResult {
    valid: bool,
    format: String,
    error_message: Option<String>,
    line: Option<usize>,
    column: Option<usize>,
}

fn result_ok(format: &str) -> String {
    serde_json::to_string(&ValidationResult {
        valid: true,
        format: format.to_string(),
        error_message: None,
        line: None,
        column: None,
    })
    .unwrap_or_else(|_| r#"{"valid":true}"#.to_string())
}

fn result_err(format: &str, message: &str, line: Option<usize>, column: Option<usize>) -> String {
    serde_json::to_string(&ValidationResult {
        valid: false,
        format: format.to_string(),
        error_message: Some(message.to_string()),
        line,
        column,
    })
    .unwrap_or_else(|_| r#"{"valid":false}"#.to_string())
}

/// Convert a byte offset to line and column numbers (1-indexed)
fn offset_to_line_col(text: &str, offset: usize) -> (usize, usize) {
    let mut line = 1;
    let mut col = 1;
    for (i, c) in text.char_indices() {
        if i >= offset {
            break;
        }
        if c == '\n' {
            line += 1;
            col = 1;
        } else {
            col += 1;
        }
    }
    (line, col)
}

#[wasm_bindgen]
pub fn validate_json(text: &str) -> String {
    match serde_json::from_str::<serde_json::Value>(text) {
        Ok(_) => result_ok("json"),
        Err(e) => result_err("json", &e.to_string(), Some(e.line()), Some(e.column())),
    }
}

#[wasm_bindgen]
pub fn validate_xml(text: &str) -> String {
    use quick_xml::events::Event;
    use quick_xml::Reader;

    let mut reader = Reader::from_str(text);
    reader.trim_text(true);

    loop {
        match reader.read_event() {
            Ok(Event::Eof) => return result_ok("xml"),
            Err(e) => {
                let pos = reader.buffer_position();
                let (line, col) = offset_to_line_col(text, pos);
                return result_err("xml", &e.to_string(), Some(line), Some(col));
            }
            _ => {}
        }
    }
}

#[wasm_bindgen]
pub fn validate_csv(text: &str) -> String {
    let mut rdr = csv::ReaderBuilder::new()
        .flexible(false)
        .has_headers(true)
        .from_reader(text.as_bytes());

    for (row_idx, result) in rdr.records().enumerate() {
        if let Err(e) = result {
            return result_err("csv", &e.to_string(), Some(row_idx + 2), None); // +2 for header + 1-indexing
        }
    }
    result_ok("csv")
}

#[wasm_bindgen]
pub fn validate_yaml(text: &str) -> String {
    match serde_yaml::from_str::<serde_yaml::Value>(text) {
        Ok(_) => result_ok("yaml"),
        Err(e) => {
            let loc = e.location();
            result_err(
                "yaml",
                &e.to_string(),
                loc.as_ref().map(|l| l.line()),
                loc.as_ref().map(|l| l.column()),
            )
        }
    }
}

#[wasm_bindgen]
pub fn validate_toml(text: &str) -> String {
    match text.parse::<toml::Value>() {
        Ok(_) => result_ok("toml"),
        Err(e) => {
            let span = e.span();
            let (line, col) = span
                .map(|s| offset_to_line_col(text, s.start))
                .unwrap_or((1, 1));
            result_err("toml", e.message(), Some(line), Some(col))
        }
    }
}

fn detect_format(text: &str, filename: Option<&str>) -> &'static str {
    // Check filename extension first
    if let Some(name) = filename {
        let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
        match ext.as_str() {
            "json" => return "json",
            "xml" | "svg" | "html" | "xhtml" | "gpx" => return "xml",
            "csv" | "tsv" => return "csv",
            "yaml" | "yml" => return "yaml",
            "toml" => return "toml",
            _ => {}
        }
    }

    // Content-based detection
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return "unknown";
    }

    if trimmed.starts_with('{') || trimmed.starts_with('[') {
        "json"
    } else if trimmed.starts_with('<') {
        "xml"
    } else if trimmed.contains(" = ") && (trimmed.contains('[') || !trimmed.contains(':')) {
        "toml"
    } else if trimmed.contains(':') && !trimmed.contains(',') {
        "yaml"
    } else {
        "unknown"
    }
}

#[wasm_bindgen]
pub fn validate_syntax(text: &str, filename: Option<String>) -> String {
    let format = detect_format(text, filename.as_deref());
    match format {
        "json" => validate_json(text),
        "xml" => validate_xml(text),
        "csv" => validate_csv(text),
        "yaml" => validate_yaml(text),
        "toml" => validate_toml(text),
        _ => result_ok("unknown"),
    }
}
