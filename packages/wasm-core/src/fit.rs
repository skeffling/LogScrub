//! FIT file parsing and analysis
//!
//! Handles Garmin FIT (Flexible and Interoperable Data Transfer) files
//! used by sports watches, bike computers, and fitness devices.
//!
//! Currently supports:
//! - Analyzing FIT files to detect sensitive data (GPS, user profile, device info)
//! - Exporting to JSON for anonymization with standard text scrubbing
//!
//! FIT file output is not yet supported because fit-rust only writes to filesystem
//! paths, not byte buffers needed for WASM.

use fit_rust::protocol::message_type::MessageType;
use fit_rust::protocol::value::Value;
use fit_rust::protocol::{FitDataMessage, FitMessage};
use fit_rust::Fit;
use serde::Serialize;
use std::collections::HashMap;

/// Statistics from FIT file analysis
#[derive(Debug, Serialize, Default)]
pub struct FitStats {
    /// Total number of messages in the file
    pub total_messages: usize,
    /// Number of data messages
    pub data_messages: usize,
    /// Number of definition messages
    pub definition_messages: usize,
    /// Number of GPS points found (Record messages with position)
    pub gps_points: usize,
    /// Message type counts
    pub message_types: HashMap<String, usize>,
    /// Has user profile data
    pub has_user_profile: bool,
    /// Has device info
    pub has_device_info: bool,
    /// GPS bounding box: [min_lat, min_lon, max_lat, max_lon] in degrees
    pub gps_bounds: Option<[f64; 4]>,
    /// File protocol version
    pub protocol_version: String,
    /// File profile version
    pub profile_version: String,
}

/// Result of FIT file analysis
#[derive(Debug, Serialize)]
pub struct FitAnalysis {
    pub stats: FitStats,
    /// Sample of record data for preview
    pub sample_records: Vec<HashMap<String, String>>,
}

// FIT field numbers for key data
mod field_nums {
    // Record message fields
    pub const POSITION_LAT: u8 = 0;
    pub const POSITION_LONG: u8 = 1;
    pub const ALTITUDE: u8 = 2;
    pub const HEART_RATE: u8 = 3;
    pub const CADENCE: u8 = 4;
    pub const POWER: u8 = 7;
    pub const TEMPERATURE: u8 = 13;
    pub const TIMESTAMP: u8 = 253;
}

// FIT epoch: 1989-12-31 00:00:00 UTC
// Unix epoch: 1970-01-01 00:00:00 UTC
// Difference: 631065600 seconds
const FIT_EPOCH_OFFSET: u32 = 631065600;

/// Convert semicircles to degrees
fn semicircles_to_degrees(semicircles: i32) -> f64 {
    (semicircles as f64) * (180.0 / 2147483648.0)
}

/// Analyze a FIT file without modifying it
pub fn analyze_fit(data: &[u8]) -> Result<FitAnalysis, String> {
    let fit = Fit::read(data.to_vec())
        .map_err(|e| format!("Failed to parse FIT file: {:?}", e))?;

    let mut stats = FitStats::default();
    let mut sample_records: Vec<HashMap<String, String>> = Vec::new();

    let mut min_lat = f64::MAX;
    let mut min_lon = f64::MAX;
    let mut max_lat = f64::MIN;
    let mut max_lon = f64::MIN;
    let mut has_gps = false;

    stats.protocol_version = format!("{}.{}", fit.header.protocol_version >> 4, fit.header.protocol_version & 0xF);
    stats.profile_version = format!("{}.{}", fit.header.profile_version / 100, fit.header.profile_version % 100);

    for msg in &fit.data {
        stats.total_messages += 1;

        match msg {
            FitMessage::Definition(_) => {
                stats.definition_messages += 1;
            }
            FitMessage::Data(data_msg) => {
                stats.data_messages += 1;
                let msg_type = format!("{:?}", data_msg.data.message_type);
                *stats.message_types.entry(msg_type.clone()).or_insert(0) += 1;

                match data_msg.data.message_type {
                    MessageType::Record => {
                        // Check for GPS coordinates
                        let lat = get_field_i32(&data_msg, field_nums::POSITION_LAT);
                        let lon = get_field_i32(&data_msg, field_nums::POSITION_LONG);

                        if let (Some(lat_val), Some(lon_val)) = (lat, lon) {
                            if lat_val != 0x7FFFFFFF && lon_val != 0x7FFFFFFF {
                                stats.gps_points += 1;
                                has_gps = true;

                                let lat_deg = semicircles_to_degrees(lat_val);
                                let lon_deg = semicircles_to_degrees(lon_val);

                                min_lat = min_lat.min(lat_deg);
                                max_lat = max_lat.max(lat_deg);
                                min_lon = min_lon.min(lon_deg);
                                max_lon = max_lon.max(lon_deg);
                            }
                        }

                        // Collect sample records
                        if sample_records.len() < 5 {
                            let record = extract_record_data(&data_msg);
                            if !record.is_empty() {
                                sample_records.push(record);
                            }
                        }
                    }
                    MessageType::UserProfile => {
                        stats.has_user_profile = true;
                    }
                    MessageType::DeviceInfo => {
                        stats.has_device_info = true;
                    }
                    _ => {}
                }
            }
        }
    }

    if has_gps && min_lat != f64::MAX {
        stats.gps_bounds = Some([min_lat, min_lon, max_lat, max_lon]);
    }

    Ok(FitAnalysis {
        stats,
        sample_records,
    })
}

/// Get an i32 field value from a data message
fn get_field_i32(msg: &FitDataMessage, field_num: u8) -> Option<i32> {
    for field in &msg.data.values {
        if field.field_num == field_num {
            return match &field.value {
                Value::I32(v) => Some(*v),
                Value::U32(v) => Some(*v as i32),
                Value::I16(v) => Some(*v as i32),
                Value::U16(v) => Some(*v as i32),
                Value::I8(v) => Some(*v as i32),
                Value::U8(v) => Some(*v as i32),
                _ => None,
            };
        }
    }
    None
}

/// Extract readable data from a Record message
fn extract_record_data(msg: &FitDataMessage) -> HashMap<String, String> {
    let mut data = HashMap::new();

    for field in &msg.data.values {
        let field_name = match field.field_num {
            0 => "position_lat",
            1 => "position_long",
            2 => "altitude",
            3 => "heart_rate",
            4 => "cadence",
            5 => "distance",
            6 => "speed",
            7 => "power",
            13 => "temperature",
            253 => "timestamp",
            _ => continue,
        };

        let value_str = match &field.value {
            Value::I32(v) => {
                if field.field_num == 0 || field.field_num == 1 {
                    format!("{:.6}", semicircles_to_degrees(*v))
                } else {
                    v.to_string()
                }
            }
            Value::U32(v) => v.to_string(),
            Value::I16(v) => v.to_string(),
            Value::U16(v) => v.to_string(),
            Value::I8(v) => v.to_string(),
            Value::U8(v) => v.to_string(),
            Value::F32(v) => format!("{:.2}", v),
            Value::F64(v) => format!("{:.2}", v),
            _ => continue,
        };

        data.insert(field_name.to_string(), value_str);
    }

    data
}

// Note: FIT file writing is not yet supported because fit-rust only writes to filesystem paths,
// not to byte buffers. For WASM compatibility, we would need to either:
// 1. Fork fit-rust to expose buffer writing
// 2. Implement FIT binary serialization ourselves
// 3. Use a different approach (e.g., convert to GPX which is simpler XML)
//
// For now, we support:
// - Analyzing FIT files to show what sensitive data they contain
// - Exporting to JSON for anonymization with standard text scrubbing

/// Export FIT file data to JSON format for viewing
pub fn fit_to_json(data: &[u8]) -> Result<String, String> {
    let analysis = analyze_fit(data)?;

    #[derive(Serialize)]
    struct FitExport {
        stats: FitStats,
        sample_records: Vec<HashMap<String, String>>,
    }

    let export = FitExport {
        stats: analysis.stats,
        sample_records: analysis.sample_records,
    };

    serde_json::to_string_pretty(&export)
        .map_err(|e| format!("Failed to serialize to JSON: {}", e))
}

/// Convert FIT timestamp to ISO 8601 format
fn fit_timestamp_to_iso(fit_timestamp: u32) -> String {
    // FIT uses seconds since 1989-12-31 00:00:00 UTC
    let unix_timestamp = fit_timestamp as i64 + FIT_EPOCH_OFFSET as i64;

    // Convert to date/time components
    let secs_per_day = 86400i64;
    let days = unix_timestamp / secs_per_day;
    let remaining_secs = unix_timestamp % secs_per_day;

    let hours = remaining_secs / 3600;
    let minutes = (remaining_secs % 3600) / 60;
    let seconds = remaining_secs % 60;

    // Calculate year, month, day from days since 1970-01-01
    let (year, month, day) = days_to_ymd(days);

    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
            year, month, day, hours, minutes, seconds)
}

/// Convert days since Unix epoch to year, month, day
fn days_to_ymd(days: i64) -> (i32, u32, u32) {
    // Algorithm from http://howardhinnant.github.io/date_algorithms.html
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };

    (year as i32, m, d)
}

/// Get a u32 field value from a data message
fn get_field_u32(msg: &FitDataMessage, field_num: u8) -> Option<u32> {
    for field in &msg.data.values {
        if field.field_num == field_num {
            return match &field.value {
                Value::U32(v) => Some(*v),
                Value::I32(v) => Some(*v as u32),
                Value::U16(v) => Some(*v as u32),
                Value::I16(v) => Some(*v as u32),
                Value::U8(v) => Some(*v as u32),
                Value::I8(v) => Some(*v as u32),
                _ => None,
            };
        }
    }
    None
}

/// Get a u16 field value from a data message
fn get_field_u16(msg: &FitDataMessage, field_num: u8) -> Option<u16> {
    for field in &msg.data.values {
        if field.field_num == field_num {
            return match &field.value {
                Value::U16(v) => Some(*v),
                Value::I16(v) => Some(*v as u16),
                Value::U8(v) => Some(*v as u16),
                Value::I8(v) => Some(*v as u16),
                _ => None,
            };
        }
    }
    None
}

/// Get a u8 field value from a data message
fn get_field_u8(msg: &FitDataMessage, field_num: u8) -> Option<u8> {
    for field in &msg.data.values {
        if field.field_num == field_num {
            return match &field.value {
                Value::U8(v) => Some(*v),
                Value::I8(v) => Some(*v as u8),
                _ => None,
            };
        }
    }
    None
}

/// Convert FIT file to GPX format
///
/// This allows FIT files to be exported as GPX, which can then be anonymized
/// using the standard GPX/XML processing pipeline.
pub fn fit_to_gpx(data: &[u8]) -> Result<String, String> {
    let fit = Fit::read(data.to_vec())
        .map_err(|e| format!("Failed to parse FIT file: {:?}", e))?;

    let mut gpx = String::new();

    // GPX header
    gpx.push_str(r#"<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="LogScrub FIT Converter"
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata>
    <name>Converted from FIT</name>
    <desc>Activity data exported from FIT file</desc>
  </metadata>
  <trk>
    <name>Activity</name>
    <trkseg>
"#);

    let mut point_count = 0;

    for msg in &fit.data {
        if let FitMessage::Data(data_msg) = msg {
            if data_msg.data.message_type == MessageType::Record {
                // Get GPS coordinates
                let lat = get_field_i32(&data_msg, field_nums::POSITION_LAT);
                let lon = get_field_i32(&data_msg, field_nums::POSITION_LONG);

                // Skip records without valid GPS
                let (lat_val, lon_val) = match (lat, lon) {
                    (Some(la), Some(lo)) if la != 0x7FFFFFFF && lo != 0x7FFFFFFF => (la, lo),
                    _ => continue,
                };

                let lat_deg = semicircles_to_degrees(lat_val);
                let lon_deg = semicircles_to_degrees(lon_val);

                gpx.push_str(&format!("      <trkpt lat=\"{:.7}\" lon=\"{:.7}\">\n", lat_deg, lon_deg));

                // Elevation (altitude in FIT is in meters with scale 5, offset 500)
                if let Some(alt) = get_field_u16(&data_msg, field_nums::ALTITUDE) {
                    // FIT altitude: (value / 5) - 500 = meters
                    let ele_meters = (alt as f64 / 5.0) - 500.0;
                    if ele_meters > -500.0 && ele_meters < 10000.0 {
                        gpx.push_str(&format!("        <ele>{:.1}</ele>\n", ele_meters));
                    }
                }

                // Timestamp
                if let Some(ts) = get_field_u32(&data_msg, field_nums::TIMESTAMP) {
                    let iso_time = fit_timestamp_to_iso(ts);
                    gpx.push_str(&format!("        <time>{}</time>\n", iso_time));
                }

                // Extensions (heart rate, cadence, power, temperature)
                let hr = get_field_u8(&data_msg, field_nums::HEART_RATE);
                let cad = get_field_u8(&data_msg, field_nums::CADENCE);
                let power = get_field_u16(&data_msg, field_nums::POWER);
                let temp = get_field_u8(&data_msg, field_nums::TEMPERATURE);

                if hr.is_some() || cad.is_some() || power.is_some() || temp.is_some() {
                    gpx.push_str("        <extensions>\n");
                    gpx.push_str("          <gpxtpx:TrackPointExtension>\n");

                    if let Some(hr_val) = hr {
                        if hr_val > 0 && hr_val < 255 {
                            gpx.push_str(&format!("            <gpxtpx:hr>{}</gpxtpx:hr>\n", hr_val));
                        }
                    }
                    if let Some(cad_val) = cad {
                        if cad_val < 255 {
                            gpx.push_str(&format!("            <gpxtpx:cad>{}</gpxtpx:cad>\n", cad_val));
                        }
                    }
                    if let Some(power_val) = power {
                        if power_val > 0 && power_val < 10000 {
                            // Power is stored directly in watts
                            gpx.push_str(&format!("            <gpxtpx:power>{}</gpxtpx:power>\n", power_val));
                        }
                    }
                    if let Some(temp_val) = temp {
                        // Temperature in Celsius (signed, but we read as u8)
                        let temp_c = temp_val as i8;
                        if temp_c > -50 && temp_c < 100 {
                            gpx.push_str(&format!("            <gpxtpx:atemp>{}</gpxtpx:atemp>\n", temp_c));
                        }
                    }

                    gpx.push_str("          </gpxtpx:TrackPointExtension>\n");
                    gpx.push_str("        </extensions>\n");
                }

                gpx.push_str("      </trkpt>\n");
                point_count += 1;
            }
        }
    }

    // GPX footer
    gpx.push_str(r#"    </trkseg>
  </trk>
</gpx>
"#);

    if point_count == 0 {
        return Err("No GPS track points found in FIT file".to_string());
    }

    Ok(gpx)
}
