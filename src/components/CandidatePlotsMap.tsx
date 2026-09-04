import { Show, createEffect, createSignal, onCleanup } from 'solid-js'
import 'leaflet/dist/leaflet.css'
import type * as Leaflet from 'leaflet'
import type { CandidatePlotMapItem } from '../source-listings/map'
import {
  BLUE,
  OSM_ATTRIBUTION,
  OSM_TILES,
  STAKE,
  itemsBounds,
  shapeLayer,
} from './leaflet-shapes'

export type MapFocusRequest = { plotId: string; nonce: number }

/**
 * The big map of a plot's marked areas. Clicking a shape selects it; a
 * `focus` request flies to one. Includes "Where am I" and full screen.
 */
export function CandidatePlotsMap(props: {
  plots: Array<CandidatePlotMapItem>
  selectedPlotId: string | undefined
  onSelect: (plotId: string) => void
  focus?: MapFocusRequest
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
    const labels = [
      ...map.getContainer().querySelectorAll<HTMLElement>('.fmh-label'),
    ]
    labels.forEach((label) => (label.style.visibility = 'visible'))
    labels.sort((label) => (label.classList.contains('sel') ? -1 : 1))
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
    plots: Array<CandidatePlotMapItem>,
    selectedPlotId: string | undefined,
  ) => {
    if (!map || !leaflet || !plotLayer) return
    const bounds = itemsBounds(leaflet, plots)
    if (fitBounds && bounds) map.fitBounds(bounds.pad(0.3), { maxZoom: 17 })
    else if (fitBounds) map.setView([54.6872, 25.2797], 10)
    plotLayer.clearLayers()
    for (const plot of plots) {
      const selected = plot.id === selectedPlotId
      const shape = shapeLayer(leaflet, plot, selected ? STAKE : BLUE, selected)
      const select = () => props.onSelect(plot.id)
      shape.on('click', select)
      shape.bindTooltip(plot.label, {
        permanent: true,
        direction: 'top',
        interactive: true,
        className: `fmh-label ${selected ? 'sel' : ''}`,
      })
      shape.getTooltip()?.on('click', select)
      shape.addTo(plotLayer)
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
      loaded
        .tileLayer(OSM_TILES, { attribution: OSM_ATTRIBUTION, maxZoom: 19 })
        .addTo(map)
      loaded.control.zoom({ position: 'bottomright' }).addTo(map)
      draw(true, props.plots, props.selectedPlotId)
      map.on('zoomend moveend', resolveLabelCollisions)
      resizeObserver = new ResizeObserver(() => map?.invalidateSize())
      resizeObserver.observe(element)
    })
  }

  createEffect(
    () => [props.plots, props.selectedPlotId] as const,
    ([plots, selectedPlotId]) => draw(false, plots, selectedPlotId),
  )

  createEffect(
    () => props.focus,
    (focus) => {
      if (!focus || !map) return
      const plot = props.plots.find((item) => item.id === focus.plotId)
      if (!plot) return
      map.flyTo([plot.latitude, plot.longitude], Math.max(map.getZoom(), 16), {
        duration: 0.5,
      })
    },
  )

  onCleanup(() => {
    disposed = true
    resizeObserver?.disconnect()
    map?.remove()
  })

  const locate = () => {
    if (!('geolocation' in navigator) || !leaflet || !map || !householdLayer) {
      setLocationState('unavailable')
      setLocationMessage('Your location is not available here.')
      return
    }
    setLocationState('locating')
    setLocationMessage('Finding you…')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (disposed || !leaflet || !map || !householdLayer) return
        householdLayer.clearLayers()
        leaflet
          .circle([coords.latitude, coords.longitude], {
            radius: coords.accuracy,
            color: BLUE,
            weight: 1,
            fillColor: BLUE,
            fillOpacity: 0.1,
          })
          .addTo(householdLayer)
        leaflet
          .circleMarker([coords.latitude, coords.longitude], {
            radius: 7,
            color: '#fff',
            weight: 3,
            fillColor: BLUE,
            fillOpacity: 1,
          })
          .bindTooltip(`You · ±${Math.round(coords.accuracy)} m`)
          .addTo(householdLayer)
        map.setView(
          [coords.latitude, coords.longitude],
          Math.max(map.getZoom(), 16),
        )
        setLocationMessage(
          `You are here, give or take ${Math.round(coords.accuracy)} m`,
        )
        setLocationState('available')
      },
      (error) => {
        if (disposed) return
        setLocationState('unavailable')
        setLocationMessage(
          error.code === error.PERMISSION_DENIED
            ? 'Location access was denied. The map still works.'
            : error.code === error.TIMEOUT
              ? 'Finding you took too long. The map still works.'
              : 'Your location is not available. The map still works.',
        )
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 15_000 },
    )
  }

  const toggleFullscreen = async () => {
    if (!container) return
    if (document.fullscreenElement) await document.exitFullscreen()
    else await container.requestFullscreen()
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
    <div ref={container} class="bigmap">
      <div ref={init} class="canvas" aria-label="Map of the marked areas" />
      <div class="overlay">
        <button
          class="btn sm"
          type="button"
          disabled={locationState() === 'locating'}
          onClick={locate}
        >
          {locationState() === 'locating' ? 'Finding you…' : 'Where am I'}
        </button>
        <button
          class="btn sm"
          type="button"
          onClick={() => void toggleFullscreen()}
        >
          {fullscreen() ? 'Exit full screen' : 'Full screen'}
        </button>
      </div>
      <Show when={locationMessage()}>
        <p class="status" role="status">
          {locationMessage()}
        </p>
      </Show>
    </div>
  )
}
