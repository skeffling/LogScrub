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
}

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
