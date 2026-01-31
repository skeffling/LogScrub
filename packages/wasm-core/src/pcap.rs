use etherparse::{NetSlice, SlicedPacket, TransportSlice};
use pcap_file::pcap::{PcapPacket, PcapReader, PcapWriter};
use pcap_file::pcapng::{Block, PcapNgReader, PcapNgWriter};
use std::time::Duration;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Cursor;

/// Statistics about what was anonymized in the PCAP
#[derive(Debug, Serialize, Default)]
pub struct PcapStats {
    pub packets_processed: usize,
    pub packets_modified: usize,
    pub packets_filtered: usize,
    pub ipv4_replaced: usize,
    pub ipv6_replaced: usize,
    pub mac_replaced: usize,
    pub ports_anonymized: usize,
    pub payloads_truncated: usize,
    pub timestamps_shifted: usize,
    pub dns_names_anonymized: usize,
    pub errors: Vec<String>,
    // Filter breakdown
    pub filtered_by_port: usize,
    pub filtered_by_ip: usize,
    pub filtered_by_protocol: usize,
}

/// Result of PCAP anonymization
#[derive(Debug, Serialize)]
pub struct PcapResult {
    pub data: Vec<u8>,
    pub stats: PcapStats,
    pub mappings: PcapMappings,
}

/// Mappings of original values to anonymized values
#[derive(Debug, Serialize, Deserialize, Default, Clone)]
pub struct PcapMappings {
    #[serde(default)]
    pub ipv4: HashMap<String, String>,
    #[serde(default)]
    pub ipv6: HashMap<String, String>,
    #[serde(default)]
    pub mac: HashMap<String, String>,
    #[serde(default)]
    pub ports: HashMap<u16, u16>,
    #[serde(default)]
    pub domains: HashMap<String, String>,
}

/// Port filter specification
#[derive(Debug, Deserialize, Default, Clone)]
pub struct PortFilter {
    /// Single ports to filter
    #[serde(default)]
    pub ports: Vec<u16>,
    /// Port ranges to filter (start, end) inclusive
    #[serde(default)]
    pub ranges: Vec<(u16, u16)>,
}

impl PortFilter {
    pub fn matches(&self, port: u16) -> bool {
        if self.ports.contains(&port) {
            return true;
        }
        for (start, end) in &self.ranges {
            if port >= *start && port <= *end {
                return true;
            }
        }
        false
    }

    pub fn is_empty(&self) -> bool {
        self.ports.is_empty() && self.ranges.is_empty()
    }
}

/// IP filter specification (supports CIDR notation)
#[derive(Debug, Deserialize, Default, Clone)]
pub struct IpFilter {
    /// IPv4 addresses or CIDR blocks (e.g., "192.168.1.0/24")
    #[serde(default)]
    pub ipv4: Vec<String>,
    /// IPv6 addresses or CIDR blocks
    #[serde(default)]
    pub ipv6: Vec<String>,
}

impl IpFilter {
    pub fn matches_ipv4(&self, ip: &[u8; 4]) -> bool {
        for filter in &self.ipv4 {
            if let Some((network, prefix_len)) = parse_ipv4_cidr(filter) {
                if ipv4_matches_cidr(ip, &network, prefix_len) {
                    return true;
                }
            }
        }
        false
    }

    pub fn matches_ipv6(&self, ip: &[u8; 16]) -> bool {
        for filter in &self.ipv6 {
            if let Some((network, prefix_len)) = parse_ipv6_cidr(filter) {
                if ipv6_matches_cidr(ip, &network, prefix_len) {
                    return true;
                }
            }
        }
        false
    }

    pub fn is_empty(&self) -> bool {
        self.ipv4.is_empty() && self.ipv6.is_empty()
    }
}

/// Parse IPv4 CIDR notation (e.g., "192.168.1.0/24" or "192.168.1.1")
fn parse_ipv4_cidr(cidr: &str) -> Option<([u8; 4], u8)> {
    let parts: Vec<&str> = cidr.split('/').collect();
    let ip_str = parts[0];
    let prefix_len = if parts.len() > 1 {
        parts[1].parse().ok()?
    } else {
        32 // Single IP = /32
    };

    let octets: Vec<u8> = ip_str.split('.').filter_map(|s| s.parse().ok()).collect();
    if octets.len() != 4 {
        return None;
    }

    Some(([octets[0], octets[1], octets[2], octets[3]], prefix_len))
}

/// Parse IPv6 CIDR notation
fn parse_ipv6_cidr(cidr: &str) -> Option<([u8; 16], u8)> {
    let parts: Vec<&str> = cidr.split('/').collect();
    let ip_str = parts[0];
    let prefix_len = if parts.len() > 1 {
        parts[1].parse().ok()?
    } else {
        128 // Single IP = /128
    };

    // Simple IPv6 parsing (full form only for now)
    let mut result = [0u8; 16];
    let segments: Vec<&str> = ip_str.split(':').collect();

    // Handle :: expansion
    if ip_str.contains("::") {
        let parts: Vec<&str> = ip_str.split("::").collect();
        let left: Vec<u16> = parts[0].split(':').filter(|s| !s.is_empty())
            .filter_map(|s| u16::from_str_radix(s, 16).ok()).collect();
        let right: Vec<u16> = if parts.len() > 1 {
            parts[1].split(':').filter(|s| !s.is_empty())
                .filter_map(|s| u16::from_str_radix(s, 16).ok()).collect()
        } else {
            vec![]
        };

        let zeros_needed = 8 - left.len() - right.len();
        let mut full: Vec<u16> = left;
        full.extend(vec![0u16; zeros_needed]);
        full.extend(right);

        for (i, seg) in full.iter().enumerate() {
            result[i * 2] = (*seg >> 8) as u8;
            result[i * 2 + 1] = (*seg & 0xff) as u8;
        }
    } else if segments.len() == 8 {
        for (i, seg) in segments.iter().enumerate() {
            if let Ok(val) = u16::from_str_radix(seg, 16) {
                result[i * 2] = (val >> 8) as u8;
                result[i * 2 + 1] = (val & 0xff) as u8;
            }
        }
    } else {
        return None;
    }

    Some((result, prefix_len))
}

/// Check if IPv4 matches CIDR
fn ipv4_matches_cidr(ip: &[u8; 4], network: &[u8; 4], prefix_len: u8) -> bool {
    if prefix_len == 0 {
        return true;
    }
    if prefix_len > 32 {
        return false;
    }

    let ip_u32 = u32::from_be_bytes(*ip);
    let net_u32 = u32::from_be_bytes(*network);
    let mask = if prefix_len == 32 { !0u32 } else { !0u32 << (32 - prefix_len) };

    (ip_u32 & mask) == (net_u32 & mask)
}

/// Check if IPv6 matches CIDR
fn ipv6_matches_cidr(ip: &[u8; 16], network: &[u8; 16], prefix_len: u8) -> bool {
    if prefix_len == 0 {
        return true;
    }
    if prefix_len > 128 {
        return false;
    }

    let full_bytes = (prefix_len / 8) as usize;
    let remaining_bits = prefix_len % 8;

    // Check full bytes
    if ip[..full_bytes] != network[..full_bytes] {
        return false;
    }

    // Check remaining bits
    if remaining_bits > 0 && full_bytes < 16 {
        let mask = !0u8 << (8 - remaining_bits);
        if (ip[full_bytes] & mask) != (network[full_bytes] & mask) {
            return false;
        }
    }

    true
}

/// Protocol filter
#[derive(Debug, Deserialize, Default, Clone)]
pub struct ProtocolFilter {
    /// Filter specific IP protocols by number (6=TCP, 17=UDP, 1=ICMP, etc.)
    #[serde(default)]
    pub ip_protocols: Vec<u8>,
    /// Filter by well-known protocol names
    #[serde(default)]
    pub named_protocols: Vec<String>,
    /// Remove non-IP traffic (ARP, etc.)
    #[serde(default)]
    pub remove_non_ip: bool,
}

impl ProtocolFilter {
    pub fn should_filter_ip_proto(&self, proto: u8) -> bool {
        if self.ip_protocols.contains(&proto) {
            return true;
        }
        // Check named protocols
        for name in &self.named_protocols {
            let proto_num = match name.to_lowercase().as_str() {
                "tcp" => 6,
                "udp" => 17,
                "icmp" => 1,
                "icmpv6" => 58,
                "gre" => 47,
                "esp" => 50,
                "ah" => 51,
                "sctp" => 132,
                _ => continue,
            };
            if proto == proto_num {
                return true;
            }
        }
        false
    }

    pub fn is_empty(&self) -> bool {
        self.ip_protocols.is_empty() && self.named_protocols.is_empty() && !self.remove_non_ip
    }
}

/// Packet filter configuration
#[derive(Debug, Deserialize, Default, Clone)]
pub struct PacketFilter {
    /// Filter by source port
    #[serde(default)]
    pub src_port: PortFilter,
    /// Filter by destination port
    #[serde(default)]
    pub dst_port: PortFilter,
    /// Filter by either source or destination port
    #[serde(default)]
    pub any_port: PortFilter,
    /// Filter by source IP
    #[serde(default)]
    pub src_ip: IpFilter,
    /// Filter by destination IP
    #[serde(default)]
    pub dst_ip: IpFilter,
    /// Filter by either source or destination IP
    #[serde(default)]
    pub any_ip: IpFilter,
    /// Filter by protocol
    #[serde(default)]
    pub protocol: ProtocolFilter,
    /// Invert filter (keep only matching packets instead of removing them)
    #[serde(default)]
    pub invert: bool,
}

impl PacketFilter {
    pub fn is_empty(&self) -> bool {
        self.src_port.is_empty()
            && self.dst_port.is_empty()
            && self.any_port.is_empty()
            && self.src_ip.is_empty()
            && self.dst_ip.is_empty()
            && self.any_ip.is_empty()
            && self.protocol.is_empty()
    }
}

/// Configuration for PCAP anonymization
#[derive(Debug, Deserialize, Default)]
pub struct PcapConfig {
    #[serde(default = "default_true")]
    pub anonymize_ipv4: bool,
    #[serde(default = "default_true")]
    pub anonymize_ipv6: bool,
    #[serde(default = "default_true")]
    pub anonymize_mac: bool,
    #[serde(default)]
    pub preserve_private_ips: bool,
    /// Packet filtering options
    #[serde(default)]
    pub filter: PacketFilter,
    /// Anonymize port numbers
    #[serde(default)]
    pub anonymize_ports: bool,
    /// Preserve well-known ports (0-1023) when anonymizing ports
    #[serde(default = "default_true")]
    pub preserve_well_known_ports: bool,
    /// Shift all timestamps by this many seconds (can be negative)
    #[serde(default)]
    pub timestamp_shift_secs: i64,
    /// Truncate packet payloads to this many bytes (0 = no truncation)
    /// Keeps link layer + IP + transport headers, truncates application data
    #[serde(default)]
    pub payload_max_bytes: usize,
    /// Anonymize DNS domain names in queries and responses
    #[serde(default)]
    pub anonymize_dns: bool,
    /// Import existing mappings for consistent anonymization across files
    #[serde(default)]
    pub import_mappings: Option<PcapMappings>,
}

fn default_true() -> bool {
    true
}

/// Anonymizer that maintains consistent mappings
pub struct PcapAnonymizer {
    config: PcapConfig,
    ipv4_map: HashMap<[u8; 4], [u8; 4]>,
    ipv6_map: HashMap<[u8; 16], [u8; 16]>,
    mac_map: HashMap<[u8; 6], [u8; 6]>,
    port_map: HashMap<u16, u16>,
    domain_map: HashMap<String, String>,
    ipv4_counter: u32,
    ipv6_counter: u128,
    mac_counter: u64,
    port_counter: u16,
    domain_counter: u32,
}

impl PcapAnonymizer {
    pub fn new(config: PcapConfig) -> Self {
        let mut ipv4_map: HashMap<[u8; 4], [u8; 4]> = HashMap::new();
        let mut ipv6_map: HashMap<[u8; 16], [u8; 16]> = HashMap::new();
        let mut mac_map: HashMap<[u8; 6], [u8; 6]> = HashMap::new();
        let mut port_map: HashMap<u16, u16> = HashMap::new();
        let mut domain_map: HashMap<String, String> = HashMap::new();

        // Start counters at 1 to avoid 0.0.0.0
        let mut ipv4_counter: u32 = 1;
        let mut ipv6_counter: u128 = 1;
        let mut mac_counter: u64 = 1;
        let mut port_counter: u16 = 49152;
        let mut domain_counter: u32 = 1;

        // Import existing mappings if provided
        if let Some(ref imported) = config.import_mappings {
            // Import IPv4 mappings
            for (orig_str, anon_str) in &imported.ipv4 {
                if let (Some(orig), Some(anon)) = (parse_ipv4_str(orig_str), parse_ipv4_str(anon_str)) {
                    ipv4_map.insert(orig, anon);
                    // Update counter based on anon IP (extract last octet from 192.0.2.X format)
                    if anon[0] == 192 && anon[1] == 0 && anon[2] == 2 {
                        ipv4_counter = ipv4_counter.max(anon[3] as u32 + 1);
                    } else if anon[0] == 198 && anon[1] == 51 && anon[2] == 100 {
                        ipv4_counter = ipv4_counter.max(254 + anon[3] as u32 + 1);
                    } else if anon[0] == 203 && anon[1] == 0 && anon[2] == 113 {
                        ipv4_counter = ipv4_counter.max(508 + anon[3] as u32 + 1);
                    }
                }
            }

            // Import IPv6 mappings
            for (orig_str, anon_str) in &imported.ipv6 {
                if let (Some(orig), Some(anon)) = (parse_ipv6_str(orig_str), parse_ipv6_str(anon_str)) {
                    ipv6_map.insert(orig, anon);
                    // Extract counter from last 8 bytes
                    let counter_bytes: [u8; 8] = anon[8..16].try_into().unwrap_or([0; 8]);
                    let counter = u64::from_be_bytes(counter_bytes) as u128;
                    ipv6_counter = ipv6_counter.max(counter + 1);
                }
            }

            // Import MAC mappings
            for (orig_str, anon_str) in &imported.mac {
                if let (Some(orig), Some(anon)) = (parse_mac_str(orig_str), parse_mac_str(anon_str)) {
                    mac_map.insert(orig, anon);
                    // Extract counter from last 3 bytes
                    let counter = ((anon[3] as u64) << 16) | ((anon[4] as u64) << 8) | (anon[5] as u64);
                    mac_counter = mac_counter.max(counter + 1);
                }
            }

            // Import port mappings
            for (orig, anon) in &imported.ports {
                port_map.insert(*orig, *anon);
                if *anon >= 49152 {
                    port_counter = port_counter.max(anon.wrapping_add(1));
                    if port_counter < 49152 {
                        port_counter = 49152;
                    }
                }
            }

            // Import domain mappings
            for (orig, anon) in &imported.domains {
                domain_map.insert(orig.clone(), anon.clone());
                // Extract counter from anonXXXXX.example.com format
                if let Some(num_str) = anon.strip_prefix("anon").and_then(|s| s.strip_suffix(".example.com")) {
                    if let Ok(num) = num_str.parse::<u32>() {
                        domain_counter = domain_counter.max(num + 1);
                    }
                }
            }
        }

        Self {
            config,
            ipv4_map,
            ipv6_map,
            mac_map,
            port_map,
            domain_map,
            ipv4_counter,
            ipv6_counter,
            mac_counter,
            port_counter,
            domain_counter,
        }
    }

    /// Check if an IPv4 address is private (RFC1918) or special
    fn is_private_ipv4(&self, ip: &[u8; 4]) -> bool {
        // 10.0.0.0/8
        if ip[0] == 10 {
            return true;
        }
        // 172.16.0.0/12
        if ip[0] == 172 && (ip[1] >= 16 && ip[1] <= 31) {
            return true;
        }
        // 192.168.0.0/16
        if ip[0] == 192 && ip[1] == 168 {
            return true;
        }
        // 127.0.0.0/8 (loopback)
        if ip[0] == 127 {
            return true;
        }
        // 0.0.0.0
        if ip == &[0, 0, 0, 0] {
            return true;
        }
        // 255.255.255.255 (broadcast)
        if ip == &[255, 255, 255, 255] {
            return true;
        }
        false
    }

    /// Check if an IPv6 address is link-local or special
    fn is_private_ipv6(&self, ip: &[u8; 16]) -> bool {
        // ::1 loopback
        if ip == &[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1] {
            return true;
        }
        // :: unspecified
        if ip == &[0u8; 16] {
            return true;
        }
        // fe80::/10 link-local
        if ip[0] == 0xfe && (ip[1] & 0xc0) == 0x80 {
            return true;
        }
        // fc00::/7 unique local
        if (ip[0] & 0xfe) == 0xfc {
            return true;
        }
        false
    }

    /// Check if a MAC address is broadcast or multicast
    fn is_special_mac(&self, mac: &[u8; 6]) -> bool {
        // Broadcast
        if mac == &[0xff, 0xff, 0xff, 0xff, 0xff, 0xff] {
            return true;
        }
        // All zeros
        if mac == &[0, 0, 0, 0, 0, 0] {
            return true;
        }
        // Multicast (LSB of first byte is 1)
        if mac[0] & 0x01 != 0 {
            return true;
        }
        false
    }

    /// Get or create anonymized IPv4 address
    /// Uses TEST-NET-1 (192.0.2.0/24), TEST-NET-2 (198.51.100.0/24), TEST-NET-3 (203.0.113.0/24)
    fn get_anon_ipv4(&mut self, original: [u8; 4]) -> [u8; 4] {
        if self.config.preserve_private_ips && self.is_private_ipv4(&original) {
            return original;
        }

        *self.ipv4_map.entry(original).or_insert_with(|| {
            let n = self.ipv4_counter;
            self.ipv4_counter += 1;

            // Use documentation IP ranges: 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24
            // That gives us 768 unique IPs
            if n <= 254 {
                [192, 0, 2, n as u8]
            } else if n <= 508 {
                [198, 51, 100, (n - 254) as u8]
            } else if n <= 762 {
                [203, 0, 113, (n - 508) as u8]
            } else {
                // Fallback: cycle through TEST-NET-1
                [192, 0, 2, ((n % 254) + 1) as u8]
            }
        })
    }

    /// Get or create anonymized IPv6 address
    /// Uses documentation prefix 2001:db8::/32
    fn get_anon_ipv6(&mut self, original: [u8; 16]) -> [u8; 16] {
        if self.config.preserve_private_ips && self.is_private_ipv6(&original) {
            return original;
        }

        *self.ipv6_map.entry(original).or_insert_with(|| {
            let n = self.ipv6_counter;
            self.ipv6_counter += 1;

            // 2001:0db8:0000:0000:0000:0000:0000:XXXX
            let mut anon = [0u8; 16];
            anon[0] = 0x20;
            anon[1] = 0x01;
            anon[2] = 0x0d;
            anon[3] = 0xb8;
            // Put counter in last 8 bytes
            let n_bytes = n.to_be_bytes();
            anon[8..16].copy_from_slice(&n_bytes[8..16]);
            anon
        })
    }

    /// Get or create anonymized MAC address
    /// Uses locally administered unicast addresses (02:00:00:XX:XX:XX)
    fn get_anon_mac(&mut self, original: [u8; 6]) -> [u8; 6] {
        if self.is_special_mac(&original) {
            return original;
        }

        *self.mac_map.entry(original).or_insert_with(|| {
            let n = self.mac_counter;
            self.mac_counter += 1;

            // Locally administered unicast: 02:00:00:XX:XX:XX
            let mut anon = [0x02, 0x00, 0x00, 0x00, 0x00, 0x00];
            anon[3] = ((n >> 16) & 0xff) as u8;
            anon[4] = ((n >> 8) & 0xff) as u8;
            anon[5] = (n & 0xff) as u8;
            anon
        })
    }

    /// Get or create anonymized port number
    /// Preserves well-known ports (0-1023) if configured
    fn get_anon_port(&mut self, original: u16) -> u16 {
        // Always preserve port 0
        if original == 0 {
            return 0;
        }

        // Preserve well-known ports if configured
        if self.config.preserve_well_known_ports && original < 1024 {
            return original;
        }

        *self.port_map.entry(original).or_insert_with(|| {
            let n = self.port_counter;
            self.port_counter = self.port_counter.wrapping_add(1);
            // Wrap around in ephemeral range (49152-65535)
            if self.port_counter < 49152 {
                self.port_counter = 49152;
            }
            n
        })
    }

    /// Get or create anonymized domain name
    /// Uses format: anonXXXXX.example.com
    fn get_anon_domain(&mut self, original: &str) -> String {
        // Don't anonymize empty domains or root
        if original.is_empty() || original == "." {
            return original.to_string();
        }

        // Normalize to lowercase for consistent mapping
        let normalized = original.to_lowercase();

        self.domain_map
            .entry(normalized.clone())
            .or_insert_with(|| {
                let n = self.domain_counter;
                self.domain_counter += 1;
                format!("anon{:05}.example.com", n)
            })
            .clone()
    }

    /// Anonymize DNS packet payload
    /// Returns the modified payload and count of names anonymized
    fn anonymize_dns_payload(&mut self, payload: &[u8]) -> (Vec<u8>, usize) {
        // DNS header is 12 bytes minimum
        if payload.len() < 12 {
            return (payload.to_vec(), 0);
        }

        let mut modified = payload.to_vec();
        let mut names_anonymized = 0;

        // Parse DNS header
        let qdcount = u16::from_be_bytes([payload[4], payload[5]]) as usize;
        let ancount = u16::from_be_bytes([payload[6], payload[7]]) as usize;
        let nscount = u16::from_be_bytes([payload[8], payload[9]]) as usize;
        let arcount = u16::from_be_bytes([payload[10], payload[11]]) as usize;

        let mut offset = 12;

        // Process questions
        for _ in 0..qdcount {
            if let Some((name, name_end)) = self.read_dns_name(&payload, offset) {
                if !name.is_empty() {
                    let anon_name = self.get_anon_domain(&name);
                    if let Some(new_modified) = self.replace_dns_name(&modified, offset, &anon_name) {
                        modified = new_modified;
                        names_anonymized += 1;
                    }
                }
                offset = name_end;
                // Skip QTYPE (2) and QCLASS (2)
                offset += 4;
            } else {
                break;
            }
        }

        // Process answers, authority, and additional records
        let total_rrs = ancount + nscount + arcount;
        for _ in 0..total_rrs {
            if offset >= modified.len() {
                break;
            }
            if let Some((name, name_end)) = self.read_dns_name(&payload, offset) {
                if !name.is_empty() {
                    let anon_name = self.get_anon_domain(&name);
                    if let Some(new_modified) = self.replace_dns_name(&modified, offset, &anon_name) {
                        modified = new_modified;
                        names_anonymized += 1;
                    }
                }
                offset = name_end;

                // Skip TYPE (2), CLASS (2), TTL (4)
                offset += 8;

                if offset + 2 > modified.len() {
                    break;
                }

                // Read RDLENGTH
                let rdlength = u16::from_be_bytes([modified[offset], modified[offset + 1]]) as usize;
                offset += 2;

                // Skip RDATA
                offset += rdlength;
            } else {
                break;
            }
        }

        (modified, names_anonymized)
    }

    /// Read a DNS name from the packet, handling compression
    /// Returns (name, end_offset) where end_offset is after the name in the original position
    fn read_dns_name(&self, data: &[u8], start: usize) -> Option<(String, usize)> {
        let mut name_parts: Vec<String> = Vec::new();
        let mut offset = start;
        let mut end_offset = start;
        let mut followed_pointer = false;
        let mut jumps = 0;
        const MAX_JUMPS: usize = 10; // Prevent infinite loops

        loop {
            if offset >= data.len() || jumps > MAX_JUMPS {
                return None;
            }

            let len = data[offset] as usize;

            if len == 0 {
                // End of name
                if !followed_pointer {
                    end_offset = offset + 1;
                }
                break;
            }

            if (len & 0xC0) == 0xC0 {
                // Compression pointer
                if offset + 1 >= data.len() {
                    return None;
                }
                if !followed_pointer {
                    end_offset = offset + 2;
                    followed_pointer = true;
                }
                let pointer = ((len & 0x3F) << 8) | (data[offset + 1] as usize);
                offset = pointer;
                jumps += 1;
                continue;
            }

            // Regular label
            if offset + 1 + len > data.len() {
                return None;
            }

            if let Ok(label) = std::str::from_utf8(&data[offset + 1..offset + 1 + len]) {
                name_parts.push(label.to_string());
            } else {
                return None;
            }

            offset += 1 + len;
            if !followed_pointer {
                end_offset = offset;
            }
        }

        Some((name_parts.join("."), end_offset))
    }

    /// Replace a DNS name at the given offset with a new name
    /// This simplified version only works for non-compressed names
    fn replace_dns_name(&self, data: &[u8], start: usize, new_name: &str) -> Option<Vec<u8>> {
        // First, find the end of the original name (without following pointers)
        let mut offset = start;
        while offset < data.len() {
            let len = data[offset] as usize;
            if len == 0 {
                break;
            }
            if (len & 0xC0) == 0xC0 {
                // Compression pointer - we can't easily replace these
                // Just return None to skip this replacement
                return None;
            }
            offset += 1 + len;
        }

        if offset >= data.len() {
            return None;
        }

        let original_name_end = offset + 1; // Include the null terminator

        // Encode the new name
        let mut encoded_name: Vec<u8> = Vec::new();
        for label in new_name.split('.') {
            if label.is_empty() {
                continue;
            }
            if label.len() > 63 {
                return None; // Label too long
            }
            encoded_name.push(label.len() as u8);
            encoded_name.extend_from_slice(label.as_bytes());
        }
        encoded_name.push(0); // Null terminator

        // Build the new packet
        let mut result = Vec::new();
        result.extend_from_slice(&data[..start]);
        result.extend_from_slice(&encoded_name);
        result.extend_from_slice(&data[original_name_end..]);

        Some(result)
    }

    /// Anonymize a single packet's data, returning modified data
    pub fn anonymize_packet(&mut self, data: &[u8], stats: &mut PcapStats) -> Vec<u8> {
        let mut modified = data.to_vec();
        let mut was_modified = false;
        let mut needs_checksum_recalc = false;

        // Try to parse the packet
        match SlicedPacket::from_ethernet(&data) {
            Ok(parsed) => {
                // Anonymize Ethernet MACs (first 12 bytes: dst[6] + src[6])
                if self.config.anonymize_mac && data.len() >= 14 {
                    let dst_mac: [u8; 6] = data[0..6].try_into().unwrap();
                    let src_mac: [u8; 6] = data[6..12].try_into().unwrap();

                    let anon_dst = self.get_anon_mac(dst_mac);
                    let anon_src = self.get_anon_mac(src_mac);

                    if anon_dst != dst_mac {
                        modified[0..6].copy_from_slice(&anon_dst);
                        was_modified = true;
                        stats.mac_replaced += 1;
                    }
                    if anon_src != src_mac {
                        modified[6..12].copy_from_slice(&anon_src);
                        was_modified = true;
                        stats.mac_replaced += 1;
                    }
                }

                let ip_offset = find_ip_offset(&data);
                let is_ipv6 = matches!(&parsed.net, Some(NetSlice::Ipv6(_)));

                // Anonymize IP addresses
                match &parsed.net {
                    Some(NetSlice::Ipv4(ipv4)) => {
                        if self.config.anonymize_ipv4 {
                            let header = ipv4.header();
                            let src_ip = header.source();
                            let dst_ip = header.destination();

                            let anon_src = self.get_anon_ipv4(src_ip);
                            let anon_dst = self.get_anon_ipv4(dst_ip);

                            if let Some(ip_off) = ip_offset {
                                if anon_src != src_ip {
                                    modified[ip_off + 12..ip_off + 16].copy_from_slice(&anon_src);
                                    was_modified = true;
                                    needs_checksum_recalc = true;
                                    stats.ipv4_replaced += 1;
                                }
                                if anon_dst != dst_ip {
                                    modified[ip_off + 16..ip_off + 20].copy_from_slice(&anon_dst);
                                    was_modified = true;
                                    needs_checksum_recalc = true;
                                    stats.ipv4_replaced += 1;
                                }
                            }
                        }
                    }
                    Some(NetSlice::Ipv6(ipv6)) => {
                        if self.config.anonymize_ipv6 {
                            let header = ipv6.header();
                            let src_ip = header.source();
                            let dst_ip = header.destination();

                            let anon_src = self.get_anon_ipv6(src_ip);
                            let anon_dst = self.get_anon_ipv6(dst_ip);

                            if let Some(ip_off) = ip_offset {
                                if anon_src != src_ip {
                                    modified[ip_off + 8..ip_off + 24].copy_from_slice(&anon_src);
                                    was_modified = true;
                                    needs_checksum_recalc = true;
                                    stats.ipv6_replaced += 1;
                                }
                                if anon_dst != dst_ip {
                                    modified[ip_off + 24..ip_off + 40].copy_from_slice(&anon_dst);
                                    was_modified = true;
                                    needs_checksum_recalc = true;
                                    stats.ipv6_replaced += 1;
                                }
                            }
                        }
                    }
                    None => {}
                }

                // Anonymize ports
                if self.config.anonymize_ports {
                    if let (Some(ip_off), Some(transport)) = (ip_offset, &parsed.transport) {
                        let transport_offset = if is_ipv6 {
                            ip_off + 40
                        } else {
                            let ihl = (modified[ip_off] & 0x0f) as usize * 4;
                            ip_off + ihl
                        };

                        match transport {
                            TransportSlice::Tcp(tcp) => {
                                let src_port = tcp.source_port();
                                let dst_port = tcp.destination_port();
                                let anon_src = self.get_anon_port(src_port);
                                let anon_dst = self.get_anon_port(dst_port);

                                if modified.len() >= transport_offset + 4 {
                                    if anon_src != src_port {
                                        modified[transport_offset..transport_offset + 2]
                                            .copy_from_slice(&anon_src.to_be_bytes());
                                        was_modified = true;
                                        needs_checksum_recalc = true;
                                        stats.ports_anonymized += 1;
                                    }
                                    if anon_dst != dst_port {
                                        modified[transport_offset + 2..transport_offset + 4]
                                            .copy_from_slice(&anon_dst.to_be_bytes());
                                        was_modified = true;
                                        needs_checksum_recalc = true;
                                        stats.ports_anonymized += 1;
                                    }
                                }
                            }
                            TransportSlice::Udp(udp) => {
                                let src_port = udp.source_port();
                                let dst_port = udp.destination_port();
                                let anon_src = self.get_anon_port(src_port);
                                let anon_dst = self.get_anon_port(dst_port);

                                if modified.len() >= transport_offset + 4 {
                                    if anon_src != src_port {
                                        modified[transport_offset..transport_offset + 2]
                                            .copy_from_slice(&anon_src.to_be_bytes());
                                        was_modified = true;
                                        needs_checksum_recalc = true;
                                        stats.ports_anonymized += 1;
                                    }
                                    if anon_dst != dst_port {
                                        modified[transport_offset + 2..transport_offset + 4]
                                            .copy_from_slice(&anon_dst.to_be_bytes());
                                        was_modified = true;
                                        needs_checksum_recalc = true;
                                        stats.ports_anonymized += 1;
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                }

                // DNS anonymization
                if self.config.anonymize_dns {
                    if let Some(transport) = &parsed.transport {
                        // Check if this is DNS (port 53)
                        let (src_port, dst_port) = match transport {
                            TransportSlice::Udp(udp) => (udp.source_port(), udp.destination_port()),
                            TransportSlice::Tcp(tcp) => (tcp.source_port(), tcp.destination_port()),
                            _ => (0, 0),
                        };

                        if src_port == 53 || dst_port == 53 {
                            if let Some(ip_off) = ip_offset {
                                let transport_offset = if is_ipv6 {
                                    ip_off + 40
                                } else {
                                    let ihl = (modified[ip_off] & 0x0f) as usize * 4;
                                    ip_off + ihl
                                };

                                let (header_len, payload_start) = match transport {
                                    TransportSlice::Udp(_) => (8, transport_offset + 8),
                                    TransportSlice::Tcp(tcp) => {
                                        let hdr_len = tcp.data_offset() as usize * 4;
                                        (hdr_len, transport_offset + hdr_len)
                                    }
                                    _ => (0, 0),
                                };

                                if payload_start > 0 && payload_start < modified.len() {
                                    let dns_payload = &modified[payload_start..].to_vec();
                                    let (anon_payload, count) = self.anonymize_dns_payload(dns_payload);

                                    if count > 0 {
                                        // Replace the payload
                                        modified.truncate(payload_start);
                                        modified.extend_from_slice(&anon_payload);
                                        was_modified = true;
                                        needs_checksum_recalc = true;
                                        stats.dns_names_anonymized += count;

                                        // Update UDP length if applicable
                                        if let TransportSlice::Udp(_) = transport {
                                            let new_udp_len = (header_len + anon_payload.len()) as u16;
                                            if modified.len() >= transport_offset + 6 {
                                                modified[transport_offset + 4..transport_offset + 6]
                                                    .copy_from_slice(&new_udp_len.to_be_bytes());
                                            }
                                        }

                                        // Update IP total length
                                        if !is_ipv6 {
                                            let new_total_len = (modified.len() - ip_off) as u16;
                                            modified[ip_off + 2..ip_off + 4]
                                                .copy_from_slice(&new_total_len.to_be_bytes());
                                        } else {
                                            let new_payload_len = (modified.len() - ip_off - 40) as u16;
                                            modified[ip_off + 4..ip_off + 6]
                                                .copy_from_slice(&new_payload_len.to_be_bytes());
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Payload truncation
                if self.config.payload_max_bytes > 0 {
                    if let (Some(ip_off), Some(transport)) = (ip_offset, &parsed.transport) {
                        let transport_offset = if is_ipv6 {
                            ip_off + 40
                        } else {
                            let ihl = (modified[ip_off] & 0x0f) as usize * 4;
                            ip_off + ihl
                        };

                        let transport_header_len = match transport {
                            TransportSlice::Tcp(tcp) => tcp.data_offset() as usize * 4,
                            TransportSlice::Udp(_) => 8,
                            _ => 0,
                        };

                        let payload_start = transport_offset + transport_header_len;
                        let max_len = payload_start + self.config.payload_max_bytes;

                        if modified.len() > max_len {
                            modified.truncate(max_len);
                            was_modified = true;
                            needs_checksum_recalc = true;
                            stats.payloads_truncated += 1;

                            // Update IP total length field
                            if !is_ipv6 {
                                let new_total_len = (modified.len() - ip_off) as u16;
                                modified[ip_off + 2..ip_off + 4]
                                    .copy_from_slice(&new_total_len.to_be_bytes());
                            } else {
                                let new_payload_len = (modified.len() - ip_off - 40) as u16;
                                modified[ip_off + 4..ip_off + 6]
                                    .copy_from_slice(&new_payload_len.to_be_bytes());
                            }

                            // Update UDP length if applicable
                            if let TransportSlice::Udp(_) = transport {
                                let new_udp_len = (modified.len() - transport_offset) as u16;
                                modified[transport_offset + 4..transport_offset + 6]
                                    .copy_from_slice(&new_udp_len.to_be_bytes());
                            }
                        }
                    }
                }

                // Recalculate checksums if needed
                if needs_checksum_recalc {
                    if let Some(ip_off) = ip_offset {
                        if !is_ipv6 {
                            recalculate_ipv4_checksum(&mut modified, ip_off);
                        }
                        if let Some(transport) = &parsed.transport {
                            recalculate_transport_checksum(&mut modified, ip_off, transport, is_ipv6);
                        }
                    }
                }
            }
            Err(e) => {
                stats
                    .errors
                    .push(format!("Failed to parse packet: {}", e));
            }
        }

        if was_modified {
            stats.packets_modified += 1;
        }
        stats.packets_processed += 1;

        modified
    }

    /// Check if a packet should be filtered out
    /// Returns (should_filter, filter_reason) where filter_reason is "port", "ip", or "protocol"
    pub fn should_filter(&self, data: &[u8]) -> (bool, Option<&'static str>) {
        let filter = &self.config.filter;

        // If no filters are set, don't filter anything
        if filter.is_empty() {
            return (false, None);
        }

        // Try to parse the packet
        match SlicedPacket::from_ethernet(data) {
            Ok(parsed) => {
                let mut matches = false;
                let mut reason: Option<&'static str> = None;

                // Check protocol filter
                if !filter.protocol.is_empty() {
                    match &parsed.net {
                        Some(NetSlice::Ipv4(ipv4)) => {
                            let proto = ipv4.header().protocol().0;
                            if filter.protocol.should_filter_ip_proto(proto) {
                                matches = true;
                                reason = Some("protocol");
                            }
                        }
                        Some(NetSlice::Ipv6(ipv6)) => {
                            let proto = ipv6.header().next_header().0;
                            if filter.protocol.should_filter_ip_proto(proto) {
                                matches = true;
                                reason = Some("protocol");
                            }
                        }
                        None => {
                            // Non-IP traffic
                            if filter.protocol.remove_non_ip {
                                matches = true;
                                reason = Some("protocol");
                            }
                        }
                    }
                }

                // Check IP filter
                if !matches {
                    match &parsed.net {
                        Some(NetSlice::Ipv4(ipv4)) => {
                            let src_ip = ipv4.header().source();
                            let dst_ip = ipv4.header().destination();

                            if filter.src_ip.matches_ipv4(&src_ip)
                                || filter.dst_ip.matches_ipv4(&dst_ip)
                                || filter.any_ip.matches_ipv4(&src_ip)
                                || filter.any_ip.matches_ipv4(&dst_ip)
                            {
                                matches = true;
                                reason = Some("ip");
                            }
                        }
                        Some(NetSlice::Ipv6(ipv6)) => {
                            let src_ip = ipv6.header().source();
                            let dst_ip = ipv6.header().destination();

                            if filter.src_ip.matches_ipv6(&src_ip)
                                || filter.dst_ip.matches_ipv6(&dst_ip)
                                || filter.any_ip.matches_ipv6(&src_ip)
                                || filter.any_ip.matches_ipv6(&dst_ip)
                            {
                                matches = true;
                                reason = Some("ip");
                            }
                        }
                        None => {}
                    }
                }

                // Check port filter
                if !matches {
                    if let Some(transport) = &parsed.transport {
                        let (src_port, dst_port) = match transport {
                            TransportSlice::Tcp(tcp) => {
                                (tcp.source_port(), tcp.destination_port())
                            }
                            TransportSlice::Udp(udp) => {
                                (udp.source_port(), udp.destination_port())
                            }
                            _ => (0, 0),
                        };

                        if src_port > 0 || dst_port > 0 {
                            if filter.src_port.matches(src_port)
                                || filter.dst_port.matches(dst_port)
                                || filter.any_port.matches(src_port)
                                || filter.any_port.matches(dst_port)
                            {
                                matches = true;
                                reason = Some("port");
                            }
                        }
                    }
                }

                // Apply inversion if set
                let should_filter = if filter.invert { !matches } else { matches };

                (should_filter, if should_filter { reason } else { None })
            }
            Err(_) => {
                // Can't parse packet - check if we should filter non-IP
                if filter.protocol.remove_non_ip {
                    (true, Some("protocol"))
                } else {
                    (false, None)
                }
            }
        }
    }

    /// Get the mapping tables for the report
    pub fn get_mappings(&self) -> PcapMappings {
        let mut mappings = PcapMappings::default();

        for (orig, anon) in &self.ipv4_map {
            let orig_str = format!("{}.{}.{}.{}", orig[0], orig[1], orig[2], orig[3]);
            let anon_str = format!("{}.{}.{}.{}", anon[0], anon[1], anon[2], anon[3]);
            mappings.ipv4.insert(orig_str, anon_str);
        }

        for (orig, anon) in &self.ipv6_map {
            let orig_str = format_ipv6(orig);
            let anon_str = format_ipv6(anon);
            mappings.ipv6.insert(orig_str, anon_str);
        }

        for (orig, anon) in &self.mac_map {
            let orig_str = format!(
                "{:02x}:{:02x}:{:02x}:{:02x}:{:02x}:{:02x}",
                orig[0], orig[1], orig[2], orig[3], orig[4], orig[5]
            );
            let anon_str = format!(
                "{:02x}:{:02x}:{:02x}:{:02x}:{:02x}:{:02x}",
                anon[0], anon[1], anon[2], anon[3], anon[4], anon[5]
            );
            mappings.mac.insert(orig_str, anon_str);
        }

        for (orig, anon) in &self.port_map {
            mappings.ports.insert(*orig, *anon);
        }

        for (orig, anon) in &self.domain_map {
            mappings.domains.insert(orig.clone(), anon.clone());
        }

        mappings
    }
}

/// Find the offset where the IP header starts (after Ethernet + optional VLAN tags)
fn find_ip_offset(data: &[u8]) -> Option<usize> {
    if data.len() < 14 {
        return None;
    }

    let ethertype = u16::from_be_bytes([data[12], data[13]]);

    match ethertype {
        0x0800 | 0x86DD => Some(14), // IPv4 or IPv6, standard Ethernet
        0x8100 => {
            // 802.1Q VLAN tag
            if data.len() < 18 {
                return None;
            }
            Some(18)
        }
        0x88A8 | 0x9100 => {
            // QinQ double VLAN
            if data.len() < 22 {
                return None;
            }
            Some(22)
        }
        _ => None,
    }
}

/// Recalculate IPv4 header checksum
fn recalculate_ipv4_checksum(data: &mut [u8], ip_offset: usize) {
    // Zero out existing checksum (bytes 10-11 of IP header)
    if data.len() < ip_offset + 20 {
        return;
    }

    data[ip_offset + 10] = 0;
    data[ip_offset + 11] = 0;

    // Calculate header length (IHL * 4)
    let ihl = (data[ip_offset] & 0x0f) as usize * 4;
    if data.len() < ip_offset + ihl {
        return;
    }

    // Calculate checksum over IP header
    let mut sum: u32 = 0;
    for i in (0..ihl).step_by(2) {
        let word = u16::from_be_bytes([data[ip_offset + i], data[ip_offset + i + 1]]);
        sum += word as u32;
    }

    // Fold 32-bit sum to 16 bits
    while sum >> 16 != 0 {
        sum = (sum & 0xffff) + (sum >> 16);
    }

    let checksum = !(sum as u16);
    data[ip_offset + 10] = (checksum >> 8) as u8;
    data[ip_offset + 11] = (checksum & 0xff) as u8;
}

/// Recalculate TCP/UDP checksum
fn recalculate_transport_checksum(
    data: &mut [u8],
    ip_offset: usize,
    transport: &TransportSlice,
    is_ipv6: bool,
) {
    match transport {
        TransportSlice::Tcp(_tcp) => {
            let tcp_offset = if is_ipv6 {
                ip_offset + 40 // Fixed IPv6 header (ignoring extension headers for now)
            } else {
                let ihl = (data[ip_offset] & 0x0f) as usize * 4;
                ip_offset + ihl
            };

            if data.len() < tcp_offset + 20 {
                return;
            }

            // Zero out TCP checksum (bytes 16-17 of TCP header)
            data[tcp_offset + 16] = 0;
            data[tcp_offset + 17] = 0;

            // Calculate TCP length
            let tcp_len = if is_ipv6 {
                let payload_len =
                    u16::from_be_bytes([data[ip_offset + 4], data[ip_offset + 5]]) as usize;
                payload_len
            } else {
                let total_len =
                    u16::from_be_bytes([data[ip_offset + 2], data[ip_offset + 3]]) as usize;
                let ihl = (data[ip_offset] & 0x0f) as usize * 4;
                total_len - ihl
            };

            let checksum = calculate_tcp_udp_checksum(data, ip_offset, tcp_offset, tcp_len, is_ipv6, 6);
            data[tcp_offset + 16] = (checksum >> 8) as u8;
            data[tcp_offset + 17] = (checksum & 0xff) as u8;
        }
        TransportSlice::Udp(_udp) => {
            let udp_offset = if is_ipv6 {
                ip_offset + 40
            } else {
                let ihl = (data[ip_offset] & 0x0f) as usize * 4;
                ip_offset + ihl
            };

            if data.len() < udp_offset + 8 {
                return;
            }

            // Zero out UDP checksum (bytes 6-7 of UDP header)
            data[udp_offset + 6] = 0;
            data[udp_offset + 7] = 0;

            let udp_len = u16::from_be_bytes([data[udp_offset + 4], data[udp_offset + 5]]) as usize;

            let checksum = calculate_tcp_udp_checksum(data, ip_offset, udp_offset, udp_len, is_ipv6, 17);

            // UDP checksum of 0 means "no checksum" - use 0xFFFF instead
            let checksum = if checksum == 0 { 0xFFFF } else { checksum };
            data[udp_offset + 6] = (checksum >> 8) as u8;
            data[udp_offset + 7] = (checksum & 0xff) as u8;
        }
        _ => {}
    }
}

/// Calculate TCP or UDP checksum including pseudo-header
fn calculate_tcp_udp_checksum(
    data: &[u8],
    ip_offset: usize,
    transport_offset: usize,
    transport_len: usize,
    is_ipv6: bool,
    protocol: u8,
) -> u16 {
    let mut sum: u32 = 0;

    // Add pseudo-header
    if is_ipv6 {
        // IPv6 pseudo-header: src (16) + dst (16) + length (4) + zeros (3) + next header (1)
        // Source address
        for i in (0..16).step_by(2) {
            let word = u16::from_be_bytes([data[ip_offset + 8 + i], data[ip_offset + 8 + i + 1]]);
            sum += word as u32;
        }
        // Destination address
        for i in (0..16).step_by(2) {
            let word = u16::from_be_bytes([data[ip_offset + 24 + i], data[ip_offset + 24 + i + 1]]);
            sum += word as u32;
        }
        // Length
        sum += (transport_len >> 16) as u32;
        sum += (transport_len & 0xffff) as u32;
        // Next header (protocol)
        sum += protocol as u32;
    } else {
        // IPv4 pseudo-header: src (4) + dst (4) + zero (1) + protocol (1) + length (2)
        // Source address
        let src_word1 = u16::from_be_bytes([data[ip_offset + 12], data[ip_offset + 13]]);
        let src_word2 = u16::from_be_bytes([data[ip_offset + 14], data[ip_offset + 15]]);
        sum += src_word1 as u32;
        sum += src_word2 as u32;
        // Destination address
        let dst_word1 = u16::from_be_bytes([data[ip_offset + 16], data[ip_offset + 17]]);
        let dst_word2 = u16::from_be_bytes([data[ip_offset + 18], data[ip_offset + 19]]);
        sum += dst_word1 as u32;
        sum += dst_word2 as u32;
        // Protocol
        sum += protocol as u32;
        // Length
        sum += transport_len as u32;
    }

    // Add transport header + data
    let end = transport_offset + transport_len;
    if data.len() >= end {
        for i in (transport_offset..end).step_by(2) {
            if i + 1 < end {
                let word = u16::from_be_bytes([data[i], data[i + 1]]);
                sum += word as u32;
            } else {
                // Odd byte at end
                sum += (data[i] as u32) << 8;
            }
        }
    }

    // Fold and complement
    while sum >> 16 != 0 {
        sum = (sum & 0xffff) + (sum >> 16);
    }

    !(sum as u16)
}

/// Format IPv6 address
fn format_ipv6(ip: &[u8; 16]) -> String {
    let words: Vec<u16> = (0..8)
        .map(|i| u16::from_be_bytes([ip[i * 2], ip[i * 2 + 1]]))
        .collect();
    format!(
        "{:x}:{:x}:{:x}:{:x}:{:x}:{:x}:{:x}:{:x}",
        words[0], words[1], words[2], words[3], words[4], words[5], words[6], words[7]
    )
}

/// Parse IPv4 string (e.g., "192.0.2.1") to bytes
fn parse_ipv4_str(s: &str) -> Option<[u8; 4]> {
    let octets: Vec<u8> = s.split('.').filter_map(|p| p.parse().ok()).collect();
    if octets.len() == 4 {
        Some([octets[0], octets[1], octets[2], octets[3]])
    } else {
        None
    }
}

/// Parse IPv6 string to bytes
fn parse_ipv6_str(s: &str) -> Option<[u8; 16]> {
    let mut result = [0u8; 16];

    // Handle :: expansion
    if s.contains("::") {
        let parts: Vec<&str> = s.split("::").collect();
        let left: Vec<u16> = parts[0]
            .split(':')
            .filter(|p| !p.is_empty())
            .filter_map(|p| u16::from_str_radix(p, 16).ok())
            .collect();
        let right: Vec<u16> = if parts.len() > 1 {
            parts[1]
                .split(':')
                .filter(|p| !p.is_empty())
                .filter_map(|p| u16::from_str_radix(p, 16).ok())
                .collect()
        } else {
            vec![]
        };

        let zeros_needed = 8 - left.len() - right.len();
        let mut full: Vec<u16> = left;
        full.extend(vec![0u16; zeros_needed]);
        full.extend(right);

        for (i, seg) in full.iter().enumerate() {
            result[i * 2] = (*seg >> 8) as u8;
            result[i * 2 + 1] = (*seg & 0xff) as u8;
        }
    } else {
        let segments: Vec<&str> = s.split(':').collect();
        if segments.len() != 8 {
            return None;
        }
        for (i, seg) in segments.iter().enumerate() {
            if let Ok(val) = u16::from_str_radix(seg, 16) {
                result[i * 2] = (val >> 8) as u8;
                result[i * 2 + 1] = (val & 0xff) as u8;
            } else {
                return None;
            }
        }
    }

    Some(result)
}

/// Parse MAC address string (e.g., "02:00:00:00:00:01") to bytes
fn parse_mac_str(s: &str) -> Option<[u8; 6]> {
    let parts: Vec<u8> = s
        .split(':')
        .filter_map(|p| u8::from_str_radix(p, 16).ok())
        .collect();
    if parts.len() == 6 {
        Some([parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]])
    } else {
        None
    }
}

/// Detect if data is PCAPNG format (magic number check)
fn is_pcapng(data: &[u8]) -> bool {
    if data.len() < 8 {
        return false;
    }
    // PCAPNG Section Header Block magic: 0x0A0D0D0A
    data[0..4] == [0x0A, 0x0D, 0x0D, 0x0A]
}

/// Anonymize a legacy PCAP file
pub fn anonymize_pcap_legacy(data: &[u8], config: PcapConfig) -> Result<PcapResult, String> {
    let cursor = Cursor::new(data);
    let mut reader = PcapReader::new(cursor).map_err(|e| format!("Failed to read PCAP: {}", e))?;

    let header = reader.header();
    let timestamp_shift = config.timestamp_shift_secs;
    let mut anonymizer = PcapAnonymizer::new(config);
    let mut stats = PcapStats::default();
    let mut packets: Vec<PcapPacket<'static>> = Vec::new();

    // Process each packet
    while let Some(pkt) = reader.next_packet() {
        let pkt = pkt.map_err(|e| format!("Failed to read packet: {}", e))?;

        // Check if packet should be filtered
        let (should_filter, filter_reason) = anonymizer.should_filter(&pkt.data);
        if should_filter {
            stats.packets_filtered += 1;
            match filter_reason {
                Some("port") => stats.filtered_by_port += 1,
                Some("ip") => stats.filtered_by_ip += 1,
                Some("protocol") => stats.filtered_by_protocol += 1,
                _ => {}
            }
            continue; // Skip this packet
        }

        let anon_data = anonymizer.anonymize_packet(&pkt.data, &mut stats);

        // Apply timestamp shift
        let new_timestamp = if timestamp_shift != 0 {
            stats.timestamps_shifted += 1;
            if timestamp_shift > 0 {
                pkt.timestamp + Duration::from_secs(timestamp_shift as u64)
            } else {
                pkt.timestamp.saturating_sub(Duration::from_secs((-timestamp_shift) as u64))
            }
        } else {
            pkt.timestamp
        };

        packets.push(PcapPacket {
            timestamp: new_timestamp,
            orig_len: pkt.orig_len,
            data: anon_data.into(),
        });
    }

    // Write output
    let output = Cursor::new(Vec::new());
    let mut writer = PcapWriter::with_header(output, header.clone())
        .map_err(|e| format!("Failed to create PCAP writer: {}", e))?;

    for pkt in packets {
        writer
            .write_packet(&pkt)
            .map_err(|e| format!("Failed to write packet: {}", e))?;
    }

    let output_data = writer.into_writer().into_inner();

    Ok(PcapResult {
        data: output_data,
        stats,
        mappings: anonymizer.get_mappings(),
    })
}

/// Stored packet data for processing
struct StoredPacket {
    interface_id: u32,
    timestamp: Duration,
    original_len: u32,
    data: Vec<u8>,
    is_enhanced: bool,
}

/// Anonymize a PCAPNG file
pub fn anonymize_pcapng(data: &[u8], config: PcapConfig) -> Result<PcapResult, String> {
    // First pass: collect all packets as owned data
    let mut packets: Vec<StoredPacket> = Vec::new();

    {
        let cursor = Cursor::new(data);
        let mut reader =
            PcapNgReader::new(cursor).map_err(|e| format!("Failed to read PCAPNG: {}", e))?;

        while let Some(block) = reader.next_block() {
            let block = block.map_err(|e| format!("Failed to read block: {}", e))?;

            match &block {
                Block::EnhancedPacket(epb) => {
                    packets.push(StoredPacket {
                        interface_id: epb.interface_id,
                        timestamp: epb.timestamp,
                        original_len: epb.original_len,
                        data: epb.data.to_vec(),
                        is_enhanced: true,
                    });
                }
                Block::SimplePacket(spb) => {
                    packets.push(StoredPacket {
                        interface_id: 0,
                        timestamp: Duration::ZERO,
                        original_len: spb.original_len,
                        data: spb.data.to_vec(),
                        is_enhanced: false,
                    });
                }
                _ => {
                    // Skip other block types (Section Header, Interface Description, etc.)
                    // PcapNgWriter will auto-generate necessary headers
                }
            }
        }
    }

    // Second pass: filter and anonymize packets
    let timestamp_shift = config.timestamp_shift_secs;
    let mut anonymizer = PcapAnonymizer::new(config);
    let mut stats = PcapStats::default();

    let anonymized_packets: Vec<StoredPacket> = packets
        .into_iter()
        .filter_map(|pkt| {
            // Check if packet should be filtered
            let (should_filter, filter_reason) = anonymizer.should_filter(&pkt.data);
            if should_filter {
                stats.packets_filtered += 1;
                match filter_reason {
                    Some("port") => stats.filtered_by_port += 1,
                    Some("ip") => stats.filtered_by_ip += 1,
                    Some("protocol") => stats.filtered_by_protocol += 1,
                    _ => {}
                }
                return None; // Filter out this packet
            }

            let anon_data = anonymizer.anonymize_packet(&pkt.data, &mut stats);

            // Apply timestamp shift
            let new_timestamp = if timestamp_shift != 0 && pkt.is_enhanced {
                stats.timestamps_shifted += 1;
                if timestamp_shift > 0 {
                    pkt.timestamp + Duration::from_secs(timestamp_shift as u64)
                } else {
                    pkt.timestamp.saturating_sub(Duration::from_secs((-timestamp_shift) as u64))
                }
            } else {
                pkt.timestamp
            };

            Some(StoredPacket {
                interface_id: pkt.interface_id,
                timestamp: new_timestamp,
                original_len: pkt.original_len,
                data: anon_data,
                is_enhanced: pkt.is_enhanced,
            })
        })
        .collect();

    // Write output
    let output = Cursor::new(Vec::new());
    let mut writer =
        PcapNgWriter::new(output).map_err(|e| format!("Failed to create PCAPNG writer: {}", e))?;

    // Write packets as enhanced packet blocks
    for pkt in anonymized_packets {
        if pkt.is_enhanced {
            let epb = pcap_file::pcapng::blocks::enhanced_packet::EnhancedPacketBlock {
                interface_id: pkt.interface_id,
                timestamp: pkt.timestamp,
                original_len: pkt.original_len,
                data: pkt.data.into(),
                options: vec![],
            };
            writer
                .write_block(&Block::EnhancedPacket(epb))
                .map_err(|e| format!("Failed to write packet: {}", e))?;
        } else {
            let spb = pcap_file::pcapng::blocks::simple_packet::SimplePacketBlock {
                original_len: pkt.original_len,
                data: pkt.data.into(),
            };
            writer
                .write_block(&Block::SimplePacket(spb))
                .map_err(|e| format!("Failed to write packet: {}", e))?;
        }
    }

    // Get output data
    let output_data = writer.get_ref().get_ref().clone();

    Ok(PcapResult {
        data: output_data,
        stats,
        mappings: anonymizer.get_mappings(),
    })
}

/// Main entry point: detect format and anonymize
pub fn anonymize_pcap(data: &[u8], config: PcapConfig) -> Result<PcapResult, String> {
    if is_pcapng(data) {
        anonymize_pcapng(data, config)
    } else {
        anonymize_pcap_legacy(data, config)
    }
}
