import { createEffect, onCleanup } from 'solid-js'
import 'leaflet/dist/leaflet.css'
import type * as LeafletNS from 'leaflet'
import type { Feature, Polygon } from 'geojson'
import type { ListingRow } from '../server/scan'
import type { EvaluationRow } from '../server/evaluators'

export interface RequirementMeta {
  requirement: string
  label: string
  hard: boolean
}

export interface FocusRequest {
  id: number
  nonce: number
}

/** Snapshot of the reactive props needed for a full map redraw. */
interface MapData {
  listings: Array<ListingRow>
  requirements: Array<RequirementMeta>
  evalsByListing: Map<number, Map<string, EvaluationRow>>
  selectedId: number | undefined
}

type Verdict = 'red' | 'green' | 'amber' | 'gray'

const VILNIUS_CENTER: [number, number] = [54.6872, 25.2797]

const VERDICT_COLORS: Record<Verdict, string> = {
  red: '#ef4444',
  green: '#10b981',
  amber: '#f59e0b',
  gray: '#9ca3af',
}

const VERDICT_LABELS: Record<Verdict, string> = {
  red: 'hard requirement failed',
  green: 'all hard requirements pass',
  amber: 'mixed / warnings',
  gray: 'not evaluated',
}

/**
 * Overall marker/polygon color: red beats everything if a hard requirement
 * failed, green only when every hard requirement passes with no warnings,
 * gray when nothing has been evaluated yet, amber otherwise.
 */
function deriveVerdict(
  evals: Map<string, EvaluationRow> | undefined,
  requirements: Array<RequirementMeta>,
): Verdict {
  const statuses = requirements.map(
    (r) => evals?.get(r.requirement)?.status ?? 'unknown',
  )
  if (statuses.every((s) => s === 'unknown')) return 'gray'

  const hardStatuses = requirements
    .filter((r) => r.hard)
    .map((r) => evals?.get(r.requirement)?.status ?? 'unknown')
  if (hardStatuses.includes('fail')) return 'red'
  if (hardStatuses.every((s) => s === 'pass') && !statuses.includes('warn')) {
    return 'green'
  }
  return 'amber'
}

function parseBoundary(json: string | null): Polygon | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as { type?: string }
    if (parsed.type === 'Polygon') {
      return parsed as unknown as Polygon
    }
    return null
  } catch {
    return null
  }
}

function buildPopup(listing: ListingRow, verdict: Verdict): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'text-sm min-w-[180px]'

  const title = document.createElement('div')
  title.className = 'font-semibold'
  title.textContent =
    listing.title ?? listing.address ?? `Listing #${listing.id}`
  wrap.appendChild(title)

  const details = document.createElement('div')
  details.className = 'mt-1 text-xs text-gray-600'
  const price =
    listing.price_eur != null
      ? `€${listing.price_eur.toLocaleString('lt-LT')}`
      : '—'
  const area =
    listing.area_ares != null ? `${listing.area_ares.toFixed(1)} a` : '—'
  details.textContent = `${price} · ${area}`
  wrap.appendChild(details)

  const cadastral = listing.boundary_cadastral ?? listing.cadastral_number
  if (cadastral) {
    const cad = document.createElement('div')
    cad.className = 'text-xs text-gray-500'
    cad.textContent = `Cadastral: ${cadastral}`
    wrap.appendChild(cad)
  }

  const sourceBadge = document.createElement('span')
  sourceBadge.className =
    'mt-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px]'
  sourceBadge.textContent = listing.source
  wrap.appendChild(sourceBadge)

  const verdictLine = document.createElement('div')
  verdictLine.className = 'mt-1 text-xs font-medium'
  verdictLine.textContent = `Verdict: ${VERDICT_LABELS[verdict]}`
  verdictLine.style.color = VERDICT_COLORS[verdict]
  wrap.appendChild(verdictLine)

  const link = document.createElement('a')
  link.href = listing.url
  link.target = '_blank'
  link.rel = 'noreferrer'
  link.className = 'mt-1 block text-blue-600 hover:underline'
  link.textContent = 'Open listing →'
  wrap.appendChild(link)

  return wrap
}

export function ListingsMap(props: {
  listings: Array<ListingRow>
  requirements: Array<RequirementMeta>
  evalsByListing: Map<number, Map<string, EvaluationRow>>
  selectedId: number | undefined
  onSelect: (id: number) => void
  focusRequest: FocusRequest | undefined
}) {
  let map: LeafletNS.Map | undefined
  let layerGroup: LeafletNS.LayerGroup | undefined
  let leaflet: typeof LeafletNS | undefined
  let resizeObserver: ResizeObserver | undefined
  /** Bounds waiting to be fitted once the container has a real size. */
  let pendingFitBounds: LeafletNS.LatLngBounds | undefined
  /** Signature of the last listing set the view was fitted to. */
  let lastFitSignature: string | undefined
  /** Latest snapshot of reactive props, captured by the redraw effect. */
  let lastData: MapData | undefined
  const markersById = new Map<number, LeafletNS.CircleMarker>()

  /**
   * Fit the view to the given bounds — deferred while the container has no
   * layout size yet (Solid commits the DOM after the ref runs, so Leaflet
   * would otherwise clamp to maxZoom on a 0×0 map).
   */
  function fitTo(bounds: LeafletNS.LatLngBounds) {
    if (!map) return
    if (map.getSize().x === 0) {
      pendingFitBounds = bounds
      return
    }
    pendingFitBounds = undefined
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 })
    } else {
      map.setView(VILNIUS_CENTER, 11)
    }
  }

  function redraw(data: MapData) {
    lastData = data
    if (!leaflet || !map || !layerGroup) return
    layerGroup.clearLayers()
    markersById.clear()
    const bounds = leaflet.latLngBounds([])

    for (const listing of data.listings) {
      const evals = data.evalsByListing.get(listing.id)
      const verdict = deriveVerdict(evals, data.requirements)
      const color = VERDICT_COLORS[verdict]
      const boundary = parseBoundary(listing.boundary_json)
      const approx = listing.location_confidence !== 'exact'

      if (boundary) {
        const feature: Feature<Polygon> = {
          type: 'Feature',
          properties: {},
          geometry: boundary,
        }
        const layer = leaflet.geoJSON(feature, {
          style: {
            color,
            weight: 2,
            fillColor: color,
            fillOpacity: 0.15,
            dashArray: approx ? '4 4' : undefined,
          },
        })
        layer.on('click', () => props.onSelect(listing.id))
        layer.bindPopup(buildPopup(listing, verdict))
        layer.addTo(layerGroup)
        for (const ring of boundary.coordinates) {
          for (const [lng, lat] of ring) {
            bounds.extend([lat, lng])
          }
        }
      }

      if (listing.lat != null && listing.lng != null) {
        const selected = data.selectedId === listing.id
        const marker = leaflet.circleMarker([listing.lat, listing.lng], {
          radius: selected ? 10 : 7,
          color: selected ? '#1d4ed8' : color,
          weight: selected ? 3 : 2,
          fillColor: color,
          fillOpacity: approx ? 0.4 : 0.85,
          dashArray: approx ? '3 3' : undefined,
        })
        marker.bindPopup(buildPopup(listing, verdict))
        marker.on('click', () => props.onSelect(listing.id))
        marker.addTo(layerGroup)
        markersById.set(listing.id, marker)
        bounds.extend([listing.lat, listing.lng])
      }
    }

    // Re-fit only when the set of plotted listings changes, so selection
    // clicks and focus fly-tos don't reset the user's pan/zoom.
    const signature = data.listings.map((l) => l.id).join(',')
    if (signature !== lastFitSignature) {
      lastFitSignature = signature
      fitTo(bounds)
    }
  }

  function initMap(el: HTMLDivElement) {
    void import('leaflet').then((L) => {
      leaflet = L
      map = L.map(el, {
        center: VILNIUS_CENTER,
        zoom: 11,
      })
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map)
      layerGroup = L.layerGroup().addTo(map)
      resizeObserver = new ResizeObserver(() => {
        if (!map) return
        map.invalidateSize()
        if (pendingFitBounds) fitTo(pendingFitBounds)
      })
      resizeObserver.observe(el)
      if (lastData) redraw(lastData)
    })
  }

  onCleanup(() => {
    resizeObserver?.disconnect()
    resizeObserver = undefined
    map?.remove()
    map = undefined
  })

  createEffect(
    // Compute phase: read every reactive prop the redraw depends on.
    () => ({
      listings: props.listings,
      requirements: props.requirements,
      evalsByListing: props.evalsByListing,
      selectedId: props.selectedId,
    }),
    (data) => {
      redraw(data)
    },
  )

  createEffect(
    () => props.focusRequest,
    (req) => {
      if (!req || !map) return
      const marker = markersById.get(req.id)
      if (marker) {
        map.flyTo(marker.getLatLng(), 16, { duration: 0.8 })
        marker.openPopup()
      }
    },
  )

  return (
    <div
      ref={initMap}
      class="h-[420px] w-full rounded-lg border border-gray-200"
    />
  )
}
