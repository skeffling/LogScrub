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
    pub ipv4_replaced: usize,
    pub ipv6_replaced: usize,
    pub mac_replaced: usize,
    pub errors: Vec<String>,
}

/// Result of PCAP anonymization
#[derive(Debug, Serialize)]
pub struct PcapResult {
    pub data: Vec<u8>,
    pub stats: PcapStats,
    pub mappings: PcapMappings,
}

/// Mappings of original values to anonymized values
#[derive(Debug, Serialize, Default)]
pub struct PcapMappings {
    pub ipv4: HashMap<String, String>,
    pub ipv6: HashMap<String, String>,
    pub mac: HashMap<String, String>,
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
    ipv4_counter: u32,
    ipv6_counter: u128,
    mac_counter: u64,
}

impl PcapAnonymizer {
    pub fn new(config: PcapConfig) -> Self {
        Self {
            config,
            ipv4_map: HashMap::new(),
            ipv6_map: HashMap::new(),
            mac_map: HashMap::new(),
            // Start counters at 1 to avoid 0.0.0.0
            ipv4_counter: 1,
            ipv6_counter: 1,
            mac_counter: 1,
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

    /// Anonymize a single packet's data, returning modified data
    pub fn anonymize_packet(&mut self, data: &[u8], stats: &mut PcapStats) -> Vec<u8> {
        let mut modified = data.to_vec();
        let mut was_modified = false;

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

                // Anonymize IP addresses
                match &parsed.net {
                    Some(NetSlice::Ipv4(ipv4)) => {
                        if self.config.anonymize_ipv4 {
                            let header = ipv4.header();
                            let src_ip = header.source();
                            let dst_ip = header.destination();

                            let anon_src = self.get_anon_ipv4(src_ip);
                            let anon_dst = self.get_anon_ipv4(dst_ip);

                            // Find IP header offset (after Ethernet header, possibly after VLAN tags)
                            if let Some(ip_offset) = find_ip_offset(&data) {
                                // IPv4 header: src at offset 12, dst at offset 16
                                if anon_src != src_ip {
                                    modified[ip_offset + 12..ip_offset + 16]
                                        .copy_from_slice(&anon_src);
                                    was_modified = true;
                                    stats.ipv4_replaced += 1;
                                }
                                if anon_dst != dst_ip {
                                    modified[ip_offset + 16..ip_offset + 20]
                                        .copy_from_slice(&anon_dst);
                                    was_modified = true;
                                    stats.ipv4_replaced += 1;
                                }

                                // Recalculate IP header checksum
                                if was_modified {
                                    recalculate_ipv4_checksum(&mut modified, ip_offset);

                                    // Recalculate transport checksum if TCP/UDP
                                    if let Some(transport) = &parsed.transport {
                                        recalculate_transport_checksum(
                                            &mut modified,
                                            ip_offset,
                                            transport,
                                            false,
                                        );
                                    }
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

                            // Find IP header offset
                            if let Some(ip_offset) = find_ip_offset(&data) {
                                // IPv6 header: src at offset 8 (16 bytes), dst at offset 24 (16 bytes)
                                if anon_src != src_ip {
                                    modified[ip_offset + 8..ip_offset + 24]
                                        .copy_from_slice(&anon_src);
                                    was_modified = true;
                                    stats.ipv6_replaced += 1;
                                }
                                if anon_dst != dst_ip {
                                    modified[ip_offset + 24..ip_offset + 40]
                                        .copy_from_slice(&anon_dst);
                                    was_modified = true;
                                    stats.ipv6_replaced += 1;
                                }

                                // Recalculate transport checksum for IPv6
                                if was_modified {
                                    if let Some(transport) = &parsed.transport {
                                        recalculate_transport_checksum(
                                            &mut modified,
                                            ip_offset,
                                            transport,
                                            true,
                                        );
                                    }
                                }
                            }
                        }
                    }
                    None => {}
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
    let mut anonymizer = PcapAnonymizer::new(config);
    let mut stats = PcapStats::default();
    let mut packets: Vec<PcapPacket<'static>> = Vec::new();

    // Process each packet
    while let Some(pkt) = reader.next_packet() {
        let pkt = pkt.map_err(|e| format!("Failed to read packet: {}", e))?;
        let anon_data = anonymizer.anonymize_packet(&pkt.data, &mut stats);

        packets.push(PcapPacket {
            timestamp: pkt.timestamp,
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

    // Second pass: anonymize packets
    let mut anonymizer = PcapAnonymizer::new(config);
    let mut stats = PcapStats::default();

    let anonymized_packets: Vec<StoredPacket> = packets
        .into_iter()
        .map(|pkt| {
            let anon_data = anonymizer.anonymize_packet(&pkt.data, &mut stats);
            StoredPacket {
                interface_id: pkt.interface_id,
                timestamp: pkt.timestamp,
                original_len: pkt.original_len,
                data: anon_data,
                is_enhanced: pkt.is_enhanced,
            }
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
