import { useState, useMemo } from 'react'

interface GpxTransposeModalProps {
  isOpen: boolean
  onClose: () => void
  gpxContent: string
  onTranspose: (transposedGpx: string, continent: string) => void
}

interface Continent {
  id: string
  name: string
  // Target center coordinates for transposition
  lat: number
  lon: number
  description: string
}

const CONTINENTS: Continent[] = [
  { id: 'europe', name: 'Europe', lat: 48.8566, lon: 2.3522, description: 'Paris area, France' },
  { id: 'north-america', name: 'North America', lat: 40.7128, lon: -74.0060, description: 'New York area, USA' },
  { id: 'south-america', name: 'South America', lat: -23.5505, lon: -46.6333, description: 'São Paulo area, Brazil' },
  { id: 'asia', name: 'Asia', lat: 35.6762, lon: 139.6503, description: 'Tokyo area, Japan' },
  { id: 'oceania', name: 'Oceania', lat: -33.8688, lon: 151.2093, description: 'Sydney area, Australia' },
  { id: 'africa', name: 'Africa', lat: -33.9249, lon: 18.4241, description: 'Cape Town area, South Africa' },
]

interface GpxStats {
  trackName: string
  pointCount: number
  centerLat: number
  centerLon: number
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
  minEle: number
  maxEle: number
  startTime: string | null
  endTime: string | null
  durationMinutes: number | null
}

function parseGpxStats(gpxContent: string): GpxStats | null {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(gpxContent, 'text/xml')

    // Check for parse errors
    const parseError = doc.querySelector('parsererror')
    if (parseError) return null

    const trackName = doc.querySelector('trk > name')?.textContent ||
                      doc.querySelector('metadata > name')?.textContent ||
                      'Unnamed Track'

    const trkpts = doc.querySelectorAll('trkpt')
    if (trkpts.length === 0) return null

    let sumLat = 0, sumLon = 0
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180
    let minEle = Infinity, maxEle = -Infinity
    let startTime: string | null = null
    let endTime: string | null = null

    trkpts.forEach((pt, idx) => {
      const lat = parseFloat(pt.getAttribute('lat') || '0')
      const lon = parseFloat(pt.getAttribute('lon') || '0')
      const ele = parseFloat(pt.querySelector('ele')?.textContent || '0')
      const time = pt.querySelector('time')?.textContent || null

      sumLat += lat
      sumLon += lon
      minLat = Math.min(minLat, lat)
      maxLat = Math.max(maxLat, lat)
      minLon = Math.min(minLon, lon)
      maxLon = Math.max(maxLon, lon)
      minEle = Math.min(minEle, ele)
      maxEle = Math.max(maxEle, ele)

      if (idx === 0) startTime = time
      if (idx === trkpts.length - 1) endTime = time
    })

    let durationMinutes: number | null = null
    if (startTime && endTime) {
      const start = new Date(startTime).getTime()
      const end = new Date(endTime).getTime()
      durationMinutes = Math.round((end - start) / 60000)
    }

    return {
      trackName,
      pointCount: trkpts.length,
      centerLat: sumLat / trkpts.length,
      centerLon: sumLon / trkpts.length,
      minLat,
      maxLat,
      minLon,
      maxLon,
      minEle: minEle === Infinity ? 0 : minEle,
      maxEle: maxEle === -Infinity ? 0 : maxEle,
      startTime,
      endTime,
      durationMinutes,
    }
  } catch {
    return null
  }
}

function transposeGpx(gpxContent: string, targetLat: number, targetLon: number, stats: GpxStats): string {
  // Calculate offset from current center to target center
  const latOffset = targetLat - stats.centerLat
  const lonOffset = targetLon - stats.centerLon

  // Parse and modify
  const parser = new DOMParser()
  const doc = parser.parseFromString(gpxContent, 'text/xml')

  // Update all trkpt elements
  const trkpts = doc.querySelectorAll('trkpt')
  trkpts.forEach(pt => {
    const lat = parseFloat(pt.getAttribute('lat') || '0')
    const lon = parseFloat(pt.getAttribute('lon') || '0')
    pt.setAttribute('lat', (lat + latOffset).toFixed(6))
    pt.setAttribute('lon', (lon + lonOffset).toFixed(6))
  })

  // Also update any waypoints
  const wpts = doc.querySelectorAll('wpt')
  wpts.forEach(pt => {
    const lat = parseFloat(pt.getAttribute('lat') || '0')
    const lon = parseFloat(pt.getAttribute('lon') || '0')
    pt.setAttribute('lat', (lat + latOffset).toFixed(6))
    pt.setAttribute('lon', (lon + lonOffset).toFixed(6))
  })

  // Also update route points if present
  const rtepts = doc.querySelectorAll('rtept')
  rtepts.forEach(pt => {
    const lat = parseFloat(pt.getAttribute('lat') || '0')
    const lon = parseFloat(pt.getAttribute('lon') || '0')
    pt.setAttribute('lat', (lat + latOffset).toFixed(6))
    pt.setAttribute('lon', (lon + lonOffset).toFixed(6))
  })

  // Serialize back to string
  const serializer = new XMLSerializer()
  return serializer.serializeToString(doc)
}

function detectCurrentContinent(lat: number, lon: number): string {
  // Simple detection based on coordinates
  if (lat > 35 && lat < 72 && lon > -25 && lon < 45) return 'Europe'
  if (lat > 25 && lat < 72 && lon > -170 && lon < -50) return 'North America'
  if (lat > -60 && lat < 15 && lon > -90 && lon < -30) return 'South America'
  if (lat > -10 && lat < 55 && lon > 60 && lon < 150) return 'Asia'
  if (lat > -50 && lat < -10 && lon > 110 && lon < 180) return 'Oceania'
  if (lat > -40 && lat < 40 && lon > -20 && lon < 55) return 'Africa'
  return 'Unknown'
}

export function GpxTransposeModal({ isOpen, onClose, gpxContent, onTranspose }: GpxTransposeModalProps) {
  const [selectedContinent, setSelectedContinent] = useState<string | null>(null)

  const stats = useMemo(() => parseGpxStats(gpxContent), [gpxContent])

  const currentContinent = useMemo(() => {
    if (!stats) return 'Unknown'
    return detectCurrentContinent(stats.centerLat, stats.centerLon)
  }, [stats])

  const handleTranspose = () => {
    if (!selectedContinent || !stats) return
    const continent = CONTINENTS.find(c => c.id === selectedContinent)
    if (!continent) return

    const transposed = transposeGpx(gpxContent, continent.lat, continent.lon, stats)
    onTranspose(transposed, continent.name)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b dark:border-gray-700 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              GPX Route Transposition
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Move your route to a different location while preserving all stats
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 flex-1 overflow-auto">
          {stats ? (
            <>
              {/* Current Route Info */}
              <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Current Route</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Track Name:</span>
                    <span className="ml-2 text-gray-900 dark:text-white font-medium">{stats.trackName}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Region:</span>
                    <span className="ml-2 text-gray-900 dark:text-white font-medium">{currentContinent}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Points:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">{stats.pointCount.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Duration:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">
                      {stats.durationMinutes ? `${Math.floor(stats.durationMinutes / 60)}h ${stats.durationMinutes % 60}m` : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Elevation:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">
                      {stats.minEle.toFixed(0)}m - {stats.maxEle.toFixed(0)}m
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Center:</span>
                    <span className="ml-2 text-gray-900 dark:text-white font-mono text-xs">
                      {stats.centerLat.toFixed(4)}, {stats.centerLon.toFixed(4)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Continent Selection */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Select destination region
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {CONTINENTS.map(continent => (
                    <button
                      key={continent.id}
                      onClick={() => setSelectedContinent(continent.id)}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        selectedContinent === continent.id
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <div className="font-medium text-gray-900 dark:text-white">
                        {continent.name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {continent.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* What's preserved */}
              <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
                  What's preserved:
                </h4>
                <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                  <li>• Route shape and distances between points</li>
                  <li>• All timestamps and duration</li>
                  <li>• Elevation data</li>
                  <li>• Track segments and waypoints</li>
                </ul>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              Unable to parse GPX file. Please ensure it's a valid GPX format.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t dark:border-gray-700 flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleTranspose}
            disabled={!selectedContinent || !stats}
            className={`px-4 py-2 rounded-lg ${
              selectedContinent && stats
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
            }`}
          >
            Transpose Route
          </button>
        </div>
      </div>
    </div>
  )
}

export function isGpxFile(fileName: string, content: string): boolean {
  if (fileName.toLowerCase().endsWith('.gpx')) return true
  // Check content for GPX markers
  const sample = content.slice(0, 500).toLowerCase()
  return sample.includes('<gpx') && sample.includes('xmlns')
}
