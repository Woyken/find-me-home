import { Show, createEffect, createSignal, onCleanup } from 'solid-js'
import 'leaflet/dist/leaflet.css'
import type * as Leaflet from 'leaflet'
import type { Feature, Polygon } from 'geojson'

interface MapPlot {
  id: number
  label: string
  latitude: number
  longitude: number
  boundary: Polygon | null
  precision: 'exact' | 'approx'
}

export function CandidatePlotsMap(props: {
  plots: Array<MapPlot>
  selectedPlotId: number | undefined
  onSelect: (plotId: number) => void
}) {
  let map: Leaflet.Map | undefined
  let plotLayer: Leaflet.LayerGroup | undefined
  let leaflet: typeof Leaflet | undefined
  let resizeObserver: ResizeObserver | undefined
  let householdLayer: Leaflet.LayerGroup | undefined
  let container: HTMLDivElement | undefined
  let disposed = false
  const [locationState, setLocationState] = createSignal<
    'idle' | 'locating' | 'available' | 'unavailable'
  >('idle')
  const [locationMessage, setLocationMessage] = createSignal('')
  const [fullscreen, setFullscreen] = createSignal(false)

  const resolveLabelCollisions = () => {
    if (!map) return
    const mapContainer = map.getContainer()
    const labels = [
      ...mapContainer.querySelectorAll<HTMLElement>(
        '.candidate-plot-map-label',
      ),
    ]
    labels.forEach((label) => (label.style.visibility = 'visible'))
    labels.sort((label) =>
      label.classList.contains('candidate-plot-map-label-selected') ? -1 : 1,
    )

    const visible: Array<DOMRect> = []
    for (const label of labels) {
      const bounds = label.getBoundingClientRect()
      const overlaps = visible.some(
        (other) =>
          bounds.left < other.right &&
          bounds.right > other.left &&
          bounds.top < other.bottom &&
          bounds.bottom > other.top,
      )
      if (overlaps) label.style.visibility = 'hidden'
      else visible.push(bounds)
    }
  }

  const draw = (
    fitBounds: boolean,
    plots: Array<MapPlot>,
    selectedPlotId: number | undefined,
  ) => {
    if (!map || !leaflet || !plotLayer) return

    plotLayer.clearLayers()
    const bounds = leaflet.latLngBounds([])
    for (const plot of plots) {
      const selected = plot.id === selectedPlotId
      const color = selected ? '#d96a45' : '#315f73'

      if (plot.boundary) {
        const feature: Feature<Polygon> = {
          type: 'Feature',
          properties: {},
          geometry: plot.boundary,
        }
        const boundary = leaflet.geoJSON(feature, {
          style: {
            color,
            weight: selected ? 4 : 2,
            fillColor: color,
            fillOpacity: selected ? 0.3 : 0.14,
          },
        })
        boundary.on('click', () => props.onSelect(plot.id))
        boundary.bindTooltip(plot.label, {
          permanent: true,
          direction: 'center',
          className: `candidate-plot-map-label ${
            selected ? 'candidate-plot-map-label-selected' : ''
          }`,
        })
        boundary.addTo(plotLayer)
        bounds.extend(boundary.getBounds())
        continue
      }

      const radius = plot.precision === 'approx' ? 80 : 24
      const location = leaflet.circle([plot.latitude, plot.longitude], {
        radius,
        color,
        weight: selected ? 4 : 2,
        fillColor: color,
        fillOpacity: selected ? 0.24 : 0.1,
        dashArray: '6 5',
      })
      location.on('click', () => props.onSelect(plot.id))
      location.bindTooltip(plot.label, {
        permanent: true,
        direction: 'center',
        className: `candidate-plot-map-label ${
          selected ? 'candidate-plot-map-label-selected' : ''
        }`,
      })
      location.addTo(plotLayer)
      bounds.extend(location.getBounds())
    }

    if (fitBounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 17 })
    }
    requestAnimationFrame(resolveLabelCollisions)
  }

  const init = (element: HTMLDivElement) => {
    void import('leaflet').then((loaded) => {
      if (disposed) return
      leaflet = loaded
      map = loaded.map(element, { zoomControl: false })
      plotLayer = loaded.layerGroup().addTo(map)
      householdLayer = loaded.layerGroup().addTo(map)
      draw(true, props.plots, props.selectedPlotId)
      loaded
        .tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        })
        .addTo(map)
      loaded.control.zoom({ position: 'bottomright' }).addTo(map)
      map.on('zoomend moveend', resolveLabelCollisions)
      resizeObserver = new ResizeObserver(() => map?.invalidateSize())
      resizeObserver.observe(element)
      try {
        locate()
      } catch {
        setLocationState('unavailable')
        setLocationMessage(
          'Live location is unavailable. Map and field notes remain usable.',
        )
      }
    })
  }

  createEffect(
    () => [props.plots, props.selectedPlotId] as const,
    ([plots, selectedPlotId]) => draw(false, plots, selectedPlotId),
  )

  onCleanup(() => {
    disposed = true
    resizeObserver?.disconnect()
    map?.remove()
  })

  const locate = () => {
    if (!('geolocation' in navigator) || !leaflet || !map || !householdLayer) {
      setLocationState('unavailable')
      setLocationMessage(
        'Live location is unavailable. Map and field notes remain usable.',
      )
      return
    }
    setLocationState('locating')
    setLocationMessage('Finding your location…')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (disposed || !leaflet || !map || !householdLayer) return
        householdLayer.clearLayers()
        leaflet
          .circle([coords.latitude, coords.longitude], {
            radius: coords.accuracy,
            color: '#315f73',
            weight: 1,
            fillColor: '#315f73',
            fillOpacity: 0.1,
          })
          .addTo(householdLayer)
        leaflet
          .circleMarker([coords.latitude, coords.longitude], {
            radius: 7,
            color: '#faf9f4',
            weight: 3,
            fillColor: '#315f73',
            fillOpacity: 1,
          })
          .bindTooltip(`You · ±${Math.round(coords.accuracy)} m`)
          .addTo(householdLayer)
        map.setView(
          [coords.latitude, coords.longitude],
          Math.max(map.getZoom(), 16),
        )
        setLocationMessage(
          `Live location accuracy ±${Math.round(coords.accuracy)} m`,
        )
        setLocationState('available')
      },
      (error) => {
        if (disposed) return
        setLocationState('unavailable')
        setLocationMessage(
          error.code === error.PERMISSION_DENIED
            ? 'Location access denied. Map and field notes remain usable.'
            : error.code === error.TIMEOUT
              ? 'Location timed out. Map and field notes remain usable.'
              : 'Live location is unavailable. Map and field notes remain usable.',
        )
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 15_000 },
    )
  }

  const toggleFullscreen = async () => {
    const element = container
    if (!element) return
    if (document.fullscreenElement) await document.exitFullscreen()
    else await element.requestFullscreen()
  }

  const onFullscreenChange = () => {
    setFullscreen(document.fullscreenElement === container)
    requestAnimationFrame(() => map?.invalidateSize())
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('fullscreenchange', onFullscreenChange)
    onCleanup(() =>
      document.removeEventListener('fullscreenchange', onFullscreenChange),
    )
  }

  return (
    <div
      ref={container}
      class="relative h-80 w-full border border-[#17231d]/15 bg-[#f6f4ec] fullscreen:h-screen"
    >
      <div
        ref={init}
        class="absolute inset-0"
        aria-label="Map of Candidate Plots"
      />
      <div class="absolute left-3 top-3 z-[500] flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2">
        <button
          class="min-h-11 border border-[#17231d]/25 bg-[#faf9f4] px-3 text-xs font-bold shadow"
          disabled={locationState() === 'locating'}
          onClick={locate}
        >
          {locationState() === 'locating' ? 'Locating…' : 'Center on me'}
        </button>
        <button
          class="min-h-11 border border-[#17231d]/25 bg-[#faf9f4] px-3 text-xs font-bold shadow"
          onClick={() => void toggleFullscreen()}
        >
          {fullscreen() ? 'Exit full screen' : 'Full screen'}
        </button>
      </div>
      <Show when={locationMessage()}>
        <p
          class="absolute bottom-3 left-3 z-[500] max-w-[calc(100%-5rem)] bg-[#faf9f4] px-3 py-2 text-xs font-bold shadow"
          role="status"
        >
          {locationMessage()}
        </p>
      </Show>
    </div>
  )
}
