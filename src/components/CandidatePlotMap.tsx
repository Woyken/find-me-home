import { onCleanup } from 'solid-js'
import 'leaflet/dist/leaflet.css'
import type * as Leaflet from 'leaflet'
import type { Feature, Polygon } from 'geojson'

export function CandidatePlotMap(props: {
  lat: number
  lng: number
  boundary: Polygon | null
  precision: 'exact' | 'approx'
}) {
  let map: Leaflet.Map | undefined
  let layer: Leaflet.LayerGroup | undefined
  let leaflet: typeof Leaflet | undefined
  let resizeObserver: ResizeObserver | undefined

  const draw = () => {
    if (!map || !leaflet || !layer) return
    layer.clearLayers()
    const color = '#d96a45'
    const marker = leaflet.circleMarker([props.lat, props.lng], {
      radius: 7,
      color,
      weight: 2,
      fillColor: color,
      fillOpacity: props.precision === 'exact' ? 0.9 : 0.45,
      dashArray: props.precision === 'approx' ? '3 3' : undefined,
    })
    marker.addTo(layer)
    if (props.boundary) {
      const feature: Feature<Polygon> = {
        type: 'Feature',
        properties: {},
        geometry: props.boundary,
      }
      const boundary = leaflet.geoJSON(feature, {
        style: { color, weight: 2, fillColor: color, fillOpacity: 0.14 },
      })
      boundary.addTo(layer)
      map.fitBounds(boundary.getBounds(), { padding: [18, 18], maxZoom: 17 })
    } else {
      map.setView([props.lat, props.lng], props.precision === 'exact' ? 17 : 14)
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

  return <div ref={init} class="h-64 w-full border border-[#17231d]/15" />
}
