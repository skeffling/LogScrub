import { DocumentMetadata } from '../components/MetadataDialog'

/**
 * Extract metadata from DOCX or XLSX files
 * These are ZIP archives with docProps/core.xml and docProps/app.xml
 */
export async function extractOfficeMetadata(
  file: File,
  decompress_zip_file: (data: Uint8Array, filename: string) => string
): Promise<DocumentMetadata> {
  const buffer = new Uint8Array(await file.arrayBuffer())
  const metadata: DocumentMetadata = {}

  // Try to extract core.xml (contains creator, title, dates, etc.)
  try {
    const coreXml = decompress_zip_file(buffer, 'docProps/core.xml')
    if (coreXml) {
      const parser = new DOMParser()
      const doc = parser.parseFromString(coreXml, 'application/xml')

      // Dublin Core namespace elements
      const dcNS = 'http://purl.org/dc/elements/1.1/'
      const dcTermsNS = 'http://purl.org/dc/terms/'
      const cpNS = 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties'

      const getElement = (ns: string, name: string): string | undefined => {
        const el = doc.getElementsByTagNameNS(ns, name)[0]
        return el?.textContent?.trim() || undefined
      }

      metadata.title = getElement(dcNS, 'title')
      metadata.subject = getElement(dcNS, 'subject')
      metadata.creator = getElement(dcNS, 'creator')
      metadata.description = getElement(dcNS, 'description')
      metadata.keywords = getElement(cpNS, 'keywords')
      metadata.lastModifiedBy = getElement(cpNS, 'lastModifiedBy')
      metadata.revision = getElement(cpNS, 'revision')
      metadata.category = getElement(cpNS, 'category')
      metadata.created = getElement(dcTermsNS, 'created')
      metadata.modified = getElement(dcTermsNS, 'modified')
    }
  } catch {
    // core.xml not found or invalid
  }

  // Try to extract app.xml (contains application, company, etc.)
  try {
    const appXml = decompress_zip_file(buffer, 'docProps/app.xml')
    if (appXml) {
      const parser = new DOMParser()
      const doc = parser.parseFromString(appXml, 'application/xml')

      const epNS = 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties'

      const getElement = (name: string): string | undefined => {
        const el = doc.getElementsByTagNameNS(epNS, name)[0]
        return el?.textContent?.trim() || undefined
      }

      metadata.application = getElement('Application')
      metadata.company = getElement('Company')
      metadata.manager = getElement('Manager')
    }
  } catch {
    // app.xml not found or invalid
  }

  return metadata
}

/**
 * Extract metadata from ODT or ODS files
 * These are ZIP archives with meta.xml
 */
export async function extractOpenDocumentMetadata(
  file: File,
  decompress_zip_file: (data: Uint8Array, filename: string) => string
): Promise<DocumentMetadata> {
  const buffer = new Uint8Array(await file.arrayBuffer())
  const metadata: DocumentMetadata = {}

  try {
    const metaXml = decompress_zip_file(buffer, 'meta.xml')
    if (metaXml) {
      const parser = new DOMParser()
      const doc = parser.parseFromString(metaXml, 'application/xml')

      const dcNS = 'http://purl.org/dc/elements/1.1/'
      const metaNS = 'urn:oasis:names:tc:opendocument:xmlns:meta:1.0'

      const getElementDC = (name: string): string | undefined => {
        const el = doc.getElementsByTagNameNS(dcNS, name)[0]
        return el?.textContent?.trim() || undefined
      }

      const getElementMeta = (name: string): string | undefined => {
        const el = doc.getElementsByTagNameNS(metaNS, name)[0]
        return el?.textContent?.trim() || undefined
      }

      metadata.title = getElementDC('title')
      metadata.subject = getElementDC('subject')
      metadata.creator = getElementDC('creator')
      metadata.description = getElementDC('description')
      metadata.created = getElementMeta('creation-date')
      metadata.keywords = getElementMeta('keyword')
      metadata.application = getElementMeta('generator')

      // Initial creator is often stored separately
      const initialCreator = getElementMeta('initial-creator')
      if (initialCreator) {
        metadata.author = initialCreator
      }
    }
  } catch {
    // meta.xml not found or invalid
  }

  return metadata
}

/**
 * Extract metadata from PDF files using MuPDF
 */
export async function extractPdfMetadata(file: File): Promise<DocumentMetadata> {
  const metadata: DocumentMetadata = {}

  try {
    // Configure mupdf WASM location before importing
    ;(globalThis as Record<string, unknown>).$libmupdf_wasm_Module = {
      locateFile: (path: string) => `/${path}`
    }
    const mupdf = await import('mupdf')

    const buffer = new Uint8Array(await file.arrayBuffer())
    const doc = mupdf.PDFDocument.openDocument(buffer, 'application/pdf') as InstanceType<typeof mupdf.PDFDocument>

    // Get document metadata using the PDF info dictionary
    // MuPDF provides these through specific methods
    try {
      // Try to get metadata from the trailer's Info dictionary
      const trailer = doc.getTrailer()
      if (trailer) {
        const info = trailer.get('Info')
        if (info) {
          const getString = (key: string): string | undefined => {
            try {
              const val = info.get(key)
              if (val) {
                const str = val.asString?.() || val.toString?.()
                return str?.trim() || undefined
              }
            } catch {
              return undefined
            }
            return undefined
          }

          metadata.title = getString('Title')
          metadata.author = getString('Author')
          metadata.subject = getString('Subject')
          metadata.keywords = getString('Keywords')
          metadata.creator = getString('Creator')
          metadata.producer = getString('Producer')
          metadata.created = getString('CreationDate')
          metadata.modified = getString('ModDate')
        }
      }
    } catch {
      // Metadata extraction failed
    }

    doc.destroy()
  } catch (err) {
    console.error('Failed to extract PDF metadata:', err)
  }

  return metadata
}

/**
 * Check if metadata object has any meaningful values
 */
export function hasMetadata(metadata: DocumentMetadata): boolean {
  return Object.values(metadata).some(v => v && v.trim())
}

/**
 * Generate minimal core.xml for Office documents
 */
export function generateMinimalCoreXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
</cp:coreProperties>`
}

/**
 * Generate minimal app.xml for Office documents
 */
export function generateMinimalAppXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
</Properties>`
}

/**
 * Generate minimal meta.xml for OpenDocument files
 */
export function generateMinimalMetaXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" office:version="1.2">
  <office:meta>
  </office:meta>
</office:document-meta>`
}
