import { useState, useEffect, useRef } from 'react'

interface ReplacementInfo {
  original: string
  replacement: string
}

interface DocumentPreviewProps {
  file: File | null
  fileType: 'pdf' | 'xlsx' | 'docx' | 'odt' | 'ods' | null
  page?: number
  onPageChange?: (page: number) => void
  scrollTop?: number
  scrollLeft?: number
  onScroll?: (scrollTop: number, scrollLeft: number) => void
  replacements?: ReplacementInfo[]
}

interface PDFPage {
  pageNumber: number
  imageData: string
  width: number
  height: number
  textContent: string
}

export function DocumentPreview({ file, fileType, page, onPageChange, scrollTop, scrollLeft, onScroll, replacements }: DocumentPreviewProps) {
  const [pdfPages, setPdfPages] = useState<PDFPage[]>([])
  const [excelData, setExcelData] = useState<{ sheets: { name: string; rows: string[][] }[] } | null>(null)
  const [docxHtml, setDocxHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [internalPage, setInternalPage] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const isScrollingRef = useRef(false)

  // Use controlled or uncontrolled page state
  const currentPage = page !== undefined ? page : internalPage
  const setCurrentPage = (newPage: number) => {
    if (onPageChange) {
      onPageChange(newPage)
    } else {
      setInternalPage(newPage)
    }
  }

  // Sync scroll position from props
  useEffect(() => {
    if (containerRef.current && scrollTop !== undefined && scrollLeft !== undefined && !isScrollingRef.current) {
      containerRef.current.scrollTop = scrollTop
      containerRef.current.scrollLeft = scrollLeft
    }
  }, [scrollTop, scrollLeft])

  const handleScroll = () => {
    if (containerRef.current && onScroll) {
      isScrollingRef.current = true
      onScroll(containerRef.current.scrollTop, containerRef.current.scrollLeft)
      requestAnimationFrame(() => {
        isScrollingRef.current = false
      })
    }
  }

  useEffect(() => {
    if (!file || !fileType) {
      setPdfPages([])
      setExcelData(null)
      setDocxHtml(null)
      return
    }

    const loadPreview = async () => {
      setLoading(true)
      setError(null)

      try {
        if (fileType === 'pdf') {
          await loadPdfPreview(file)
        } else if (fileType === 'xlsx') {
          await loadExcelPreview(file)
        } else if (fileType === 'ods') {
          await loadOdsPreview(file)
        } else if (fileType === 'docx') {
          await loadDocxPreview(file)
        } else if (fileType === 'odt') {
          await loadOdtPreview(file)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load preview')
      } finally {
        setLoading(false)
      }
    }

    loadPreview()
  }, [file, fileType])

  const loadPdfPreview = async (file: File) => {
    // Configure mupdf WASM location before importing
    ;(globalThis as Record<string, unknown>).$libmupdf_wasm_Module = {
      locateFile: (path: string) => `/assets/${path}`
    }
    const mupdf = await import('mupdf')

    const buffer = new Uint8Array(await file.arrayBuffer())
    const doc = mupdf.PDFDocument.openDocument(buffer, 'application/pdf') as InstanceType<typeof mupdf.PDFDocument>

    const pages: PDFPage[] = []
    const pageCount = doc.countPages()

    for (let i = 0; i < pageCount; i++) {
      const page = doc.loadPage(i)
      const bounds = page.getBounds()
      const [x0, , x1] = bounds
      const pageWidth = x1 - x0

      // Scale to max 800px wide, max 2x
      const scale = Math.min(800 / pageWidth, 2)
      const matrix = mupdf.Matrix.scale(scale, scale)

      // Render to pixmap
      const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false)
      const pngData = pixmap.asPNG()

      // Convert to blob URL for display
      const blob = new Blob([pngData], { type: 'image/png' })
      const imageData = URL.createObjectURL(blob)

      // Extract text content for match counting
      const stext = page.toStructuredText('preserve-whitespace')
      const textContent = stext.asText()

      pages.push({
        pageNumber: i + 1,
        imageData,
        width: pixmap.getWidth(),
        height: pixmap.getHeight(),
        textContent
      })

      pixmap.destroy()
    }

    doc.destroy()
    setPdfPages(pages)
    setCurrentPage(0)
  }

  const loadExcelPreview = async (file: File) => {
    const { init } = await import('excelize-wasm')
    const excelize = await init('/assets/excelize.wasm.gz')
    const buffer = new Uint8Array(await file.arrayBuffer())
    const f = excelize.OpenReader(buffer)

    if (f.error) {
      throw new Error(f.error)
    }

    const sheets: { name: string; rows: string[][] }[] = []
    const sheetList = f.GetSheetList().list

    for (const sheetName of sheetList) {
      const { result, error } = f.GetRows(sheetName)
      if (!error && result) {
        sheets.push({ name: sheetName, rows: result })
      }
    }

    setExcelData({ sheets })
    setCurrentPage(0)
  }

  const loadDocxPreview = async (file: File) => {
    const { renderAsync } = await import('docx-preview')
    const arrayBuffer = await file.arrayBuffer()

    // Create container for rendered content
    const container = document.createElement('div')
    container.className = 'docx-preview-container'

    await renderAsync(arrayBuffer, container, undefined, {
      className: 'docx-preview-content',
      inWrapper: true,
      ignoreWidth: true,  // Fit to container width
      ignoreHeight: true, // Don't enforce page height
      renderHeaders: true,
      renderFooters: true
    })

    setDocxHtml(container.innerHTML)
  }

  const loadOdtPreview = async (file: File) => {
    // Import our WASM for zip extraction
    const { decompress_zip_file } = await import('../wasm-core/wasm_core')
    const buffer = new Uint8Array(await file.arrayBuffer())

    const xml = decompress_zip_file(buffer, 'content.xml')

    // Parse ODT XML to basic HTML
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'application/xml')

    // Extract paragraphs and headings using OpenDocument namespaces
    let html = '<div class="odt-preview">'
    const textNS = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0'
    const paragraphs = doc.getElementsByTagNameNS(textNS, 'p')
    const headings = doc.getElementsByTagNameNS(textNS, 'h')

    const allParagraphs = [...Array.from(paragraphs), ...Array.from(headings)]

    for (const p of allParagraphs) {
      html += '<p>' + escapeHtml(p.textContent || '') + '</p>'
    }

    html += '</div>'
    setDocxHtml(html)
  }

  const loadOdsPreview = async (file: File) => {
    // Import our WASM for zip extraction
    const { decompress_zip_file } = await import('../wasm-core/wasm_core')
    const buffer = new Uint8Array(await file.arrayBuffer())

    const xml = decompress_zip_file(buffer, 'content.xml')

    // Parse ODS XML to extract spreadsheet data
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'application/xml')

    const sheets: { name: string; rows: string[][] }[] = []
    const tableNS = 'urn:oasis:names:tc:opendocument:xmlns:table:1.0'
    const textNS = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0'

    const tables = doc.getElementsByTagNameNS(tableNS, 'table')

    for (let t = 0; t < tables.length; t++) {
      const table = tables[t]
      const sheetName = table.getAttribute('table:name') || `Sheet${t + 1}`
      const rows: string[][] = []

      const tableRows = table.getElementsByTagNameNS(tableNS, 'table-row')
      for (let r = 0; r < tableRows.length; r++) {
        const row = tableRows[r]
        const cells: string[] = []
        const tableCells = row.getElementsByTagNameNS(tableNS, 'table-cell')

        for (let c = 0; c < tableCells.length; c++) {
          const cell = tableCells[c]
          // Get repeat count
          const repeat = parseInt(cell.getAttribute('table:number-columns-repeated') || '1', 10)
          // Get cell text content
          const textElements = cell.getElementsByTagNameNS(textNS, 'p')
          let cellText = ''
          for (let p = 0; p < textElements.length; p++) {
            if (p > 0) cellText += '\n'
            cellText += textElements[p].textContent || ''
          }
          // Add cell (potentially repeated)
          for (let rep = 0; rep < Math.min(repeat, 100); rep++) {
            cells.push(cellText)
          }
        }

        // Only add non-empty rows
        if (cells.some(c => c.trim())) {
          rows.push(cells)
        }
      }

      if (rows.length > 0) {
        sheets.push({ name: sheetName, rows })
      }
    }

    setExcelData({ sheets })
    setCurrentPage(0)
  }

  const escapeHtml = (text: string) => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  if (!file || !fileType) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <p>No document loaded</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400">Loading preview...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        <p>Error: {error}</p>
      </div>
    )
  }

  // PDF Preview
  if (fileType === 'pdf' && pdfPages.length > 0) {
    // Count matches on current page
    const currentPageText = pdfPages[currentPage]?.textContent || ''
    let pageMatchCount = 0
    if (replacements && replacements.length > 0) {
      const uniqueOriginals = new Set(replacements.map(r => r.original))
      for (const original of uniqueOriginals) {
        const regex = new RegExp(original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
        const matches = currentPageText.match(regex)
        if (matches) {
          pageMatchCount += matches.length
        }
      }
    }

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-3 py-1 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
          <div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              PDF Preview
            </span>
            {pageMatchCount > 0 && (
              <span className="ml-2 text-xs text-orange-600 dark:text-orange-400">
                {pageMatchCount} match{pageMatchCount !== 1 ? 'es' : ''} on page
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
              className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-50"
            >
              Prev
            </button>
            <span className="text-xs text-gray-600 dark:text-gray-400">
              {currentPage + 1} / {pdfPages.length}
            </span>
            <button
              onClick={() => setCurrentPage(Math.min(pdfPages.length - 1, currentPage + 1))}
              disabled={currentPage === pdfPages.length - 1}
              className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
        <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-auto p-4 bg-gray-100 dark:bg-gray-900">
          <img
            src={pdfPages[currentPage].imageData}
            alt={`Page ${currentPage + 1}`}
            className="max-w-full mx-auto shadow-lg"
          />
        </div>
      </div>
    )
  }

  // Excel/ODS Preview
  if ((fileType === 'xlsx' || fileType === 'ods') && excelData) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-3 py-2 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {fileType === 'ods' ? 'Calc Preview' : 'Excel Preview'}
          </span>
          {excelData.sheets.length > 1 && (
            <div className="flex items-center gap-1">
              {excelData.sheets.map((sheet, idx) => (
                <button
                  key={sheet.name}
                  onClick={() => setCurrentPage(idx)}
                  className={`px-2 py-1 text-xs rounded ${
                    currentPage === idx
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {sheet.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-auto">
          <table className="w-full text-sm border-collapse">
            <tbody>
              {excelData.sheets[currentPage]?.rows.map((row, rowIdx) => (
                <tr key={rowIdx} className={rowIdx === 0 ? 'bg-gray-100 dark:bg-gray-800 font-semibold' : ''}>
                  {row.map((cell, cellIdx) => (
                    <td
                      key={cellIdx}
                      className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-900 dark:text-gray-100"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // DOCX/ODT Preview
  if ((fileType === 'docx' || fileType === 'odt') && docxHtml) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {fileType === 'odt' ? 'Writer Preview' : 'Document Preview'}
          </span>
        </div>
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-auto p-4 prose dark:prose-invert max-w-none text-gray-900 dark:text-gray-100"
          dangerouslySetInnerHTML={{ __html: docxHtml }}
        />
      </div>
    )
  }

  return null
}
