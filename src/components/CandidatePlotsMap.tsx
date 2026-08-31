import { onCleanup } from 'solid-js'
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
  let layer: Leaflet.LayerGroup | undefined
  let leaflet: typeof Leaflet | undefined
  let resizeObserver: ResizeObserver | undefined

  const draw = () => {
    const plots = props.plots
    const selectedPlotId = props.selectedPlotId
    if (!map || !leaflet || !layer) return

    layer.clearLayers()
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
          className: 'candidate-plot-map-label',
        })
        boundary.addTo(layer)
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
        className: 'candidate-plot-map-label',
      })
      location.addTo(layer)
      bounds.extend(location.getBounds())
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 17 })
    }
  }

  const init = (element: HTMLDivElement) => {
    void import('leaflet').then((loaded) => {
      leaflet = loaded
      map = loaded.map(element, { zoomControl: false })
      loaded
        .tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        })
        .addTo(map)
      loaded.control.zoom({ position: 'bottomright' }).addTo(map)
      layer = loaded.layerGroup().addTo(map)
      resizeObserver = new ResizeObserver(() => map?.invalidateSize())
      resizeObserver.observe(element)
      draw()
    })
  }

  onCleanup(() => {
    resizeObserver?.disconnect()
    map?.remove()
  })

  return (
    <div
      ref={init}
      class="h-80 w-full border border-[#17231d]/15"
      aria-label="Map of Candidate Plots"
    />
  )
}
