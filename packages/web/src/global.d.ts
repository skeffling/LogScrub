interface Window {
  umami?: {
    track: (event: string, data?: Record<string, unknown>) => void
  }
}

declare module 'scribe.js-ocr' {
  interface Scribe {
    init(options?: { ocr?: boolean }): Promise<void>
    importFiles(files: (File | string | ArrayBuffer)[]): Promise<void>
    recognize(): Promise<void>
    exportData(format: 'hocr' | 'txt' | 'pdf' | 'docx' | 'xlsx'): Promise<string | ArrayBuffer>
    download(format: string, fileName: string): Promise<void>
  }
  const scribe: Scribe
  export default scribe
}
