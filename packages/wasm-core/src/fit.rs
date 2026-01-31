//! FIT file parsing and anonymization
//!
//! Handles Garmin FIT (Flexible and Interoperable Data Transfer) files
//! used by sports watches, bike computers, and fitness devices.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Cursor;

/// Configuration for FIT file anonymization
#[derive(Debug, Deserialize, Default)]
pub struct FitConfig {
    /// Shift GPS coordinates by a random offset
    pub shift_coordinates: bool,
    /// Offset in meters for lat/lon shifting (default 500m)
    pub coordinate_offset_meters: Option<f64>,
    /// Remove all GPS data entirely
    pub remove_gps: bool,
    /// Shift timestamps by a random offset
    pub shift_timestamps: bool,
    /// Offset in hours for timestamp shifting
    pub timestamp_offset_hours: Option<i64>,
    /// Remove user profile data (name, weight, etc.)
    pub remove_user_profile: bool,
    /// Remove device information
    pub remove_device_info: bool,
    /// Truncate coordinate precision (decimal places to keep)
    pub coordinate_precision: Option<u8>,
}

/// Statistics from FIT file analysis
#[derive(Debug, Serialize, Default)]
pub struct FitStats {
    /// Total number of records in the file
    pub total_records: usize,
    /// Number of GPS points found
    pub gps_points: usize,
    /// Number of heart rate samples
    pub heart_rate_samples: usize,
    /// Number of power samples
    pub power_samples: usize,
    /// Number of cadence samples
    pub cadence_samples: usize,
    /// Number of speed samples
    pub speed_samples: usize,
    /// Number of altitude samples
    pub altitude_samples: usize,
    /// Number of temperature samples
    pub temperature_samples: usize,
    /// Duration in seconds (if available)
    pub duration_seconds: Option<f64>,
    /// Total distance in meters (if available)
    pub total_distance_meters: Option<f64>,
    /// Activity type (if detected)
    pub activity_type: Option<String>,
    /// Start time (if available)
    pub start_time: Option<String>,
    /// End time (if available)
    pub end_time: Option<String>,
    /// Device manufacturer
    pub manufacturer: Option<String>,
    /// Device product name
    pub product: Option<String>,
    /// User profile fields found
    pub user_fields: Vec<String>,
    /// GPS bounding box: [min_lat, min_lon, max_lat, max_lon]
    pub gps_bounds: Option<[f64; 4]>,
}

/// Extracted record for export
#[derive(Debug, Serialize)]
pub struct FitRecord {
    /// Record type (e.g., "record", "lap", "session", "event")
    pub record_type: String,
    /// Field values as key-value pairs
    pub fields: HashMap<String, serde_json::Value>,
    /// Timestamp if available
    pub timestamp: Option<String>,
}

/// Result of FIT file analysis
#[derive(Debug, Serialize)]
pub struct FitAnalysis {
    pub stats: FitStats,
    pub records: Vec<FitRecord>,
    /// Whether the file contains sensitive location data
    pub has_location_data: bool,
    /// Whether the file contains personal user info
    pub has_user_info: bool,
}

/// Analyze a FIT file and extract statistics
pub fn analyze_fit(data: &[u8]) -> Result<FitAnalysis, String> {
    let mut cursor = Cursor::new(data);
    let fit_data = fitparser::from_reader(&mut cursor)
        .map_err(|e| format!("Failed to parse FIT file: {}", e))?;

    let mut stats = FitStats::default();
    let mut records = Vec::new();
    let mut has_location_data = false;
    let mut has_user_info = false;

    let mut min_lat = f64::MAX;
    let mut min_lon = f64::MAX;
    let mut max_lat = f64::MIN;
    let mut max_lon = f64::MIN;
    let mut has_gps_bounds = false;

    for data_record in &fit_data {
        stats.total_records += 1;

        let record_type = format!("{:?}", data_record.kind());
        let mut fields: HashMap<String, serde_json::Value> = HashMap::new();
        let mut timestamp: Option<String> = None;

        for field in data_record.fields() {
            let field_name = field.name().to_string();
            let field_value = format!("{:?}", field.value());

            // Convert field value to JSON
            fields.insert(field_name.clone(), serde_json::Value::String(field_value.clone()));

            // Count specific data types
            match field_name.as_str() {
                "position_lat" | "start_position_lat" | "end_position_lat" => {
                    stats.gps_points += 1;
                    has_location_data = true;
                    if let Some(lat) = parse_semicircles_to_degrees(&field_value) {
                        min_lat = min_lat.min(lat);
                        max_lat = max_lat.max(lat);
                        has_gps_bounds = true;
                    }
                }
                "position_long" | "start_position_long" | "end_position_long" => {
                    has_location_data = true;
                    if let Some(lon) = parse_semicircles_to_degrees(&field_value) {
                        min_lon = min_lon.min(lon);
                        max_lon = max_lon.max(lon);
                        has_gps_bounds = true;
                    }
                }
                "heart_rate" => stats.heart_rate_samples += 1,
                "power" => stats.power_samples += 1,
                "cadence" | "fractional_cadence" => stats.cadence_samples += 1,
                "speed" | "enhanced_speed" => stats.speed_samples += 1,
                "altitude" | "enhanced_altitude" => stats.altitude_samples += 1,
                "temperature" => stats.temperature_samples += 1,
                "total_elapsed_time" | "total_timer_time" => {
                    if let Some(duration) = parse_duration(&field_value) {
                        stats.duration_seconds = Some(duration);
                    }
                }
                "total_distance" => {
                    if let Some(dist) = parse_distance(&field_value) {
                        stats.total_distance_meters = Some(dist);
                    }
                }
                "sport" | "sub_sport" => {
                    if stats.activity_type.is_none() {
                        stats.activity_type = Some(field_value.trim_matches('"').to_string());
                    }
                }
                "timestamp" | "start_time" => {
                    timestamp = Some(field_value.clone());
                    if stats.start_time.is_none() {
                        stats.start_time = Some(field_value.clone());
                    }
                    stats.end_time = Some(field_value);
                }
                "manufacturer" => {
                    stats.manufacturer = Some(field_value.trim_matches('"').to_string());
                }
                "product" | "product_name" => {
                    stats.product = Some(field_value.trim_matches('"').to_string());
                }
                // User profile fields
                "friendly_name" | "user_name" | "weight" | "gender" | "age" |
                "height" | "resting_heart_rate" | "max_heart_rate" |
                "language" | "date_of_birth" => {
                    has_user_info = true;
                    if !stats.user_fields.contains(&field_name) {
                        stats.user_fields.push(field_name);
                    }
                }
                _ => {}
            }
        }

        records.push(FitRecord {
            record_type,
            fields,
            timestamp,
        });
    }

    if has_gps_bounds && min_lat != f64::MAX {
        stats.gps_bounds = Some([min_lat, min_lon, max_lat, max_lon]);
    }

    Ok(FitAnalysis {
        stats,
        records,
        has_location_data,
        has_user_info,
    })
}

/// Parse semicircles value to degrees
fn parse_semicircles_to_degrees(value: &str) -> Option<f64> {
    // FIT files store lat/lon in semicircles
    // 1 semicircle = 180/2^31 degrees
    let semicircles: i32 = value.trim().parse().ok()?;
    Some((semicircles as f64) * (180.0 / 2147483648.0))
}

/// Parse duration value
fn parse_duration(value: &str) -> Option<f64> {
    // Duration might be in milliseconds or seconds
    let trimmed = value.trim().trim_matches('"');
    trimmed.parse::<f64>().ok().map(|v| {
        // If value is very large, it's probably in milliseconds
        if v > 100000.0 { v / 1000.0 } else { v }
    })
}

/// Parse distance value
fn parse_distance(value: &str) -> Option<f64> {
    // Distance is typically in centimeters
    let trimmed = value.trim().trim_matches('"');
    trimmed.parse::<f64>().ok().map(|v| v / 100.0) // Convert cm to meters
}

/// Export FIT file data to JSON format for anonymization
/// Since we can't easily rewrite FIT files, we export to JSON which can be scrubbed
pub fn fit_to_json(data: &[u8]) -> Result<String, String> {
    let analysis = analyze_fit(data)?;

    // Create a structured export
    #[derive(Serialize)]
    struct FitExport {
        metadata: FitStats,
        records: Vec<FitRecord>,
    }

    let export = FitExport {
        metadata: analysis.stats,
        records: analysis.records,
    };

    serde_json::to_string_pretty(&export)
        .map_err(|e| format!("Failed to serialize to JSON: {}", e))
}
