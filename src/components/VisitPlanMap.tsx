import { useNavigate } from '@solidjs/router'
import { Show, createEffect, onCleanup } from 'solid-js'
import 'leaflet/dist/leaflet.css'
import type * as Leaflet from 'leaflet'
import { paths } from '../paths'
import type { SourceListingDetail } from '../source-listings/model'
import { sourceListingMapLocation } from '../source-listings/map'
import {
  OSM_ATTRIBUTION,
  OSM_TILES,
  STAKE,
  itemsBounds,
  shapeLayer,
} from './leaflet-shapes'

/** The trip on a map: every located stop as an orange numbered marker. */
export function VisitPlanMap(props: {
  sourceListings: Array<SourceListingDetail>
}) {
  const navigate = useNavigate()
  let map: Leaflet.Map | undefined
  let stopLayer: Leaflet.LayerGroup | undefined
  let leaflet: typeof Leaflet | undefined
  let resizeObserver: ResizeObserver | undefined
  let disposed = false
  const located = () =>
    props.sourceListings.filter((listing) => sourceListingMapLocation(listing))

  const draw = (sourceListings: Array<SourceListingDetail>) => {
    if (!leaflet || !map || !stopLayer) return
    const stops = sourceListings.flatMap((sourceListing, index) => {
      const location = sourceListingMapLocation(sourceListing)
      return location ? [{ sourceListing, index, location }] : []
    })
    const bounds = itemsBounds(
      leaflet,
      stops.map((stop) => stop.location),
    )
    if (bounds) map.fitBounds(bounds.pad(0.3), { maxZoom: 14 })
    else map.setView([54.6872, 25.2797], 10)
    stopLayer.clearLayers()
    for (const { sourceListing, index, location } of stops) {
      const shape = shapeLayer(leaflet, location, STAKE)
      shape.bindTooltip(String(index + 1), {
        permanent: true,
        direction: 'center',
        interactive: true,
        className: 'fmh-stop',
      })
      const open = () => navigate(paths.sourceListing(sourceListing.id))
      shape.on('click', open)
      shape.getTooltip()?.on('click', open)
      shape.addTo(stopLayer)
    }
  }

  const init = (element: HTMLDivElement) => {
    map?.remove()
    map = undefined
    void import('leaflet').then((loaded) => {
      if (disposed) return
      leaflet = loaded
      map = loaded.map(element, { zoomControl: false })
      stopLayer = loaded.layerGroup().addTo(map)
      loaded
        .tileLayer(OSM_TILES, { attribution: OSM_ATTRIBUTION, maxZoom: 19 })
        .addTo(map)
      loaded.control.zoom({ position: 'bottomright' }).addTo(map)
      draw(props.sourceListings)
      resizeObserver = new ResizeObserver(() => map?.invalidateSize())
      resizeObserver.observe(element)
    })
  }

  createEffect(
    () => props.sourceListings,
    (sourceListings) => draw(sourceListings),
  )

  onCleanup(() => {
    disposed = true
    resizeObserver?.disconnect()
    map?.remove()
  })

  return (
    <div class="bigmap tall">
      <Show
        when={located().length > 0}
        fallback={<p class="nomap">None of these plots is on the map yet.</p>}
      >
        <div ref={init} class="canvas" aria-label="Map of the stops" />
      </Show>
    </div>
  )
}
