import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef, useState } from 'react'
import type { HocrPage } from '../utils/hocrParser'
import { mapReplacementsToBoxes } from '../utils/hocrParser'
import type { ReplacementInfo } from '../stores/useAppStore'

const TYPE_COLORS: Record<string, string> = {
  email: '#3b82f6',
  phone_us: '#60a5fa',
  phone_uk: '#93c5fd',
  phone_intl: '#2563eb',
  ipv4: '#22c55e',
  ipv6: '#4ade80',
  mac_address: '#86efac',
  hostname: '#16a34a',
  url: '#15803d',
  ssn: '#a855f7',
  passport: '#c084fc',
  drivers_license: '#d8b4fe',
  credit_card: '#ef4444',
  iban: '#f87171',
  btc_address: '#f97316',
  jwt: '#eab308',
  aws_access_key: '#fbbf24',
  aws_secret_key: '#f59e0b',
  generic_secret: '#fcd34d',
  private_key: '#fde047',
  uuid: '#14b8a6',
  gps_coordinates: '#2dd4bf',
  file_path_unix: '#64748b',
  file_path_windows: '#94a3b8',
}

function getTypeColor(type: string): string {
  return TYPE_COLORS[type] || '#6b7280'
}

export interface ImageRedactorHandle {
  exportImage: () => void
}

interface ImageRedactorProps {
  imageUrl: string
  hocrPage: HocrPage
  replacements: ReplacementInfo[]
  showRedactions: boolean
  fileName?: string
}

export const ImageRedactor = forwardRef<ImageRedactorHandle, ImageRedactorProps>(
  ({ imageUrl, hocrPage, replacements, showRedactions, fileName }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const imageRef = useRef<HTMLImageElement | null>(null)
    const [loaded, setLoaded] = useState(false)

    // Load the image
    useEffect(() => {
      const img = new Image()
      img.onload = () => {
        imageRef.current = img
        setLoaded(true)
      }
      img.src = imageUrl
      return () => {
        img.onload = null
      }
    }, [imageUrl])

    const draw = useCallback((exportMode = false) => {
      const canvas = canvasRef.current
      const img = imageRef.current
      if (!canvas || !img) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      if (exportMode) {
        // Full resolution for export
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        ctx.drawImage(img, 0, 0)
      } else {
        // Scale to fit container
        const container = containerRef.current
        if (!container) return
        const containerWidth = container.clientWidth
        const containerHeight = container.clientHeight

        const scale = Math.min(
          containerWidth / img.naturalWidth,
          containerHeight / img.naturalHeight,
          1 // don't upscale
        )

        canvas.width = img.naturalWidth * scale
        canvas.height = img.naturalHeight * scale
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      }

      if (showRedactions && replacements.length > 0) {
        const boxes = mapReplacementsToBoxes(hocrPage.words, replacements)
        const scaleX = canvas.width / (hocrPage.width || img.naturalWidth)
        const scaleY = canvas.height / (hocrPage.height || img.naturalHeight)

        for (const box of boxes) {
          const x = box.bbox.x1 * scaleX
          const y = box.bbox.y1 * scaleY
          const w = (box.bbox.x2 - box.bbox.x1) * scaleX
          const h = (box.bbox.y2 - box.bbox.y1) * scaleY

          const color = getTypeColor(box.piiType)

          // Draw filled rectangle
          ctx.fillStyle = color
          ctx.globalAlpha = 0.9
          ctx.fillRect(x, y, w, h)

          // Draw label text if box is large enough
          ctx.globalAlpha = 1
          const fontSize = Math.max(10, Math.min(h * 0.7, 14))
          ctx.font = `bold ${fontSize}px monospace`
          ctx.fillStyle = '#ffffff'
          ctx.textBaseline = 'middle'
          const label = box.replacement
          const textWidth = ctx.measureText(label).width
          if (textWidth < w - 4) {
            ctx.fillText(label, x + 2, y + h / 2)
          }
        }
        ctx.globalAlpha = 1
      }
    }, [hocrPage, replacements, showRedactions])

    // Redraw when dependencies change
    useEffect(() => {
      if (loaded) draw()
    }, [loaded, draw])

    // Redraw on container resize
    useEffect(() => {
      const container = containerRef.current
      if (!container || !loaded) return

      const observer = new ResizeObserver(() => draw())
      observer.observe(container)
      return () => observer.disconnect()
    }, [loaded, draw])

    // Expose export method
    useImperativeHandle(ref, () => ({
      exportImage: () => {
        if (!imageRef.current || !canvasRef.current) return

        // Draw at full resolution
        draw(true)

        canvasRef.current.toBlob((blob) => {
          if (!blob) return
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `redacted_${fileName || 'image'}.png`
          a.click()
          URL.revokeObjectURL(url)

          // Redraw at display resolution
          draw(false)
        }, 'image/png')
      }
    }), [draw, fileName])

    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 overflow-auto">
        {!loaded ? (
          <div className="text-gray-500 dark:text-gray-400 text-sm">Loading image...</div>
        ) : (
          <canvas ref={canvasRef} className="max-w-full max-h-full object-contain" />
        )}
      </div>
    )
  }
)

ImageRedactor.displayName = 'ImageRedactor'
