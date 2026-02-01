/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const analyze_pcap: (a: number, b: number, c: number, d: number) => [number, number, number, number];
export const anonymize_pcap: (a: number, b: number, c: number, d: number) => [number, number, number, number];
export const anonymize_pcap_bytes: (a: number, b: number, c: number, d: number) => [number, number, number, number];
export const compress_gzip: (a: number, b: number) => [number, number, number, number];
export const compress_zip: (a: number, b: number, c: number, d: number) => [number, number, number, number];
export const compress_zip_replace: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
export const create_multi_zip: (a: number, b: number) => [number, number, number, number];
export const decompress_gzip: (a: number, b: number) => [number, number, number, number];
export const decompress_zip: (a: number, b: number) => [number, number, number, number];
export const decompress_zip_file: (a: number, b: number, c: number, d: number) => [number, number, number, number];
export const decompress_zip_multi: (a: number, b: number) => [number, number, number, number];
export const sanitize: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number];
export const validate_csv: (a: number, b: number) => [number, number];
export const validate_json: (a: number, b: number) => [number, number];
export const validate_syntax: (a: number, b: number, c: number, d: number) => [number, number];
export const validate_toml: (a: number, b: number) => [number, number];
export const validate_xml: (a: number, b: number) => [number, number];
export const validate_yaml: (a: number, b: number) => [number, number];
export const __wbindgen_externrefs: WebAssembly.Table;
export const __wbindgen_malloc: (a: number, b: number) => number;
export const __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
export const __wbindgen_free: (a: number, b: number, c: number) => void;
export const __externref_table_dealloc: (a: number) => void;
export const __wbindgen_start: () => void;
