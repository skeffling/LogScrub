/* tslint:disable */
/* eslint-disable */

/**
 * Analyze a PCAP file without modifying it - returns stats and what would be anonymized
 */
export function analyze_pcap(data: Uint8Array, config_json: string): string;

/**
 * Anonymize a PCAP/PCAPNG file
 * config_json: {"anonymize_ipv4": true, "anonymize_ipv6": true, "anonymize_mac": true, "preserve_private_ips": false}
 * Returns JSON with base64-encoded data, stats, and mappings
 */
export function anonymize_pcap(data: Uint8Array, config_json: string): string;

/**
 * Anonymize a PCAP/PCAPNG file and return the anonymized bytes
 * This is the function to call to get the actual anonymized PCAP data
 */
export function anonymize_pcap_bytes(data: Uint8Array, config_json: string): Uint8Array;

export function compress_gzip(text: string): Uint8Array;

export function compress_zip(text: string, filename: string): Uint8Array;

/**
 * Repackage a ZIP archive with one file's content replaced
 * Used for modifying DOCX/XLSX files while preserving other files
 */
export function compress_zip_replace(original_data: Uint8Array, target_filename: string, new_content: string): Uint8Array;

/**
 * Create a ZIP archive containing multiple files
 * files_json should be a JSON array of objects: [{name: "file.txt", content: "text"}]
 */
export function create_multi_zip(files_json: string): Uint8Array;

export function decompress_gzip(data: Uint8Array): string;

export function decompress_zip(data: Uint8Array): string;

export function decompress_zip_file(data: Uint8Array, target_filename: string): string;

/**
 * Extract all text files from a ZIP archive
 * Returns JSON: [{name: "file.txt", content: "...", size: 123}, ...]
 */
export function decompress_zip_multi(data: Uint8Array): string;

export function sanitize(text: string, rules_json: string, consistency_mode: boolean, label_prefix: string, label_suffix: string): string;

export function validate_csv(text: string): string;

export function validate_json(text: string): string;

export function validate_syntax(text: string, filename?: string | null): string;

export function validate_toml(text: string): string;

export function validate_xml(text: string): string;

export function validate_yaml(text: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly analyze_pcap: (a: number, b: number, c: number, d: number) => [number, number, number, number];
  readonly anonymize_pcap: (a: number, b: number, c: number, d: number) => [number, number, number, number];
  readonly anonymize_pcap_bytes: (a: number, b: number, c: number, d: number) => [number, number, number, number];
  readonly compress_gzip: (a: number, b: number) => [number, number, number, number];
  readonly compress_zip: (a: number, b: number, c: number, d: number) => [number, number, number, number];
  readonly compress_zip_replace: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
  readonly create_multi_zip: (a: number, b: number) => [number, number, number, number];
  readonly decompress_gzip: (a: number, b: number) => [number, number, number, number];
  readonly decompress_zip: (a: number, b: number) => [number, number, number, number];
  readonly decompress_zip_file: (a: number, b: number, c: number, d: number) => [number, number, number, number];
  readonly decompress_zip_multi: (a: number, b: number) => [number, number, number, number];
  readonly sanitize: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number];
  readonly validate_csv: (a: number, b: number) => [number, number];
  readonly validate_json: (a: number, b: number) => [number, number];
  readonly validate_syntax: (a: number, b: number, c: number, d: number) => [number, number];
  readonly validate_toml: (a: number, b: number) => [number, number];
  readonly validate_xml: (a: number, b: number) => [number, number];
  readonly validate_yaml: (a: number, b: number) => [number, number];
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
