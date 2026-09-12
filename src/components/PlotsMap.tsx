import { useNavigate } from '@solidjs/router'
import { Show, createEffect, createMemo, onCleanup } from 'solid-js'
import 'leaflet/dist/leaflet.css'
import type * as Leaflet from 'leaflet'
import { routes } from '../paths'
import type { SourceListingDetail } from '../source-listings/model'
import type { CandidatePlotMapItem } from '../source-listings/map'
import { sourceListingMapItems, sourceListingMapLabel } from '../source-listings/map'
import { BLUE, OSM_ATTRIBUTION, OSM_TILES, STAKE, itemsBounds, shapeLayer } from './leaflet-shapes'

/** A listing that can be drawn, with whether we're going to see it. */
export type PlotsMapStop = {
  sourceListing: SourceListingDetail
  location: CandidatePlotMapItem
  going: boolean
}

export type PlotsMapData = {
  stops: Array<PlotsMapStop>
  unlocatedListingCount: number
}

/** Every located marked area in list order, retaining its source listing's state. */
export const plotsMapData = (
  sourceListings: Array<SourceListingDetail>,
  goingIds: Array<string>,
): PlotsMapData => {
  let unlocatedListingCount = 0
  const stops = sourceListings.flatMap((sourceListing) => {
    const locations = sourceListingMapItems(sourceListing)
    if (locations.length === 0) {
      unlocatedListingCount += 1
      return []
    }
    return locations.map((location) => ({
      sourceListing,
      location: { ...location, label: sourceListingMapLabel(sourceListing) },
      going: goingIds.includes(sourceListing.id),
    }))
  })
  return { stops, unlocatedListingCount }
}

/**
 * Every listed plot on one map: blue shapes, orange for the ones we're going
 * to see. Tapping a plot (or its label) opens the listing.
 */
export function PlotsMap(props: {
  sourceListings: Array<SourceListingDetail>
  goingIds: Array<string>
}) {
  const navigate = useNavigate()
  let map: Leaflet.Map | undefined
  let plotLayer: Leaflet.LayerGroup | undefined
  let leaflet: typeof Leaflet | undefined
  let resizeObserver: ResizeObserver | undefined
  let disposed = false
  const mapData = createMemo(() => plotsMapData(props.sourceListings, props.goingIds))
  const stops = () => mapData().stops
  const offMap = () => mapData().unlocatedListingCount

  const draw = (drawn: Array<PlotsMapStop>) => {
    if (!leaflet || !map || !plotLayer) return
    const bounds = itemsBounds(
      leaflet,
      drawn.map((stop) => stop.location),
    )
    if (bounds) map.fitBounds(bounds.pad(0.3), { maxZoom: 14 })
    else map.setView([54.6872, 25.2797], 10)
    plotLayer.clearLayers()
    for (const { sourceListing, location, going } of drawn) {
      const shape = shapeLayer(leaflet, location, going ? STAKE : BLUE)
      shape.bindTooltip(location.label, {
        permanent: true,
        direction: 'top',
        interactive: true,
        className: `fmh-label ${going ? 'sel' : ''}`,
      })
      const open = () => navigate(routes.sourceListing(sourceListing.id))
      shape.on('click', open)
      shape.getTooltip()?.on('click', open)
      shape.addTo(plotLayer)
    }
  }

  const init = (element: HTMLDivElement) => {
    map?.remove()
    map = undefined
    void import('leaflet').then((loaded) => {
      if (disposed) return
      leaflet = loaded
      map = loaded.map(element, { zoomControl: false })
      plotLayer = loaded.layerGroup().addTo(map)
      loaded.tileLayer(OSM_TILES, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(map)
      loaded.control.zoom({ position: 'bottomright' }).addTo(map)
      draw(stops())
      resizeObserver = new ResizeObserver(() => map?.invalidateSize())
      resizeObserver.observe(element)
    })
  }

  createEffect(
    () => stops(),
    (drawn) => draw(drawn),
  )

  onCleanup(() => {
    disposed = true
    resizeObserver?.disconnect()
    map?.remove()
  })

  return (
    <>
      <div class="bigmap tall">
        <Show
          when={stops().length > 0}
          fallback={<p class="nomap">None of these plots is on the map yet.</p>}
        >
          <div ref={init} class="canvas" aria-label="Map of the plots" />
        </Show>
      </div>
      <Show when={stops().length > 0 && offMap() > 0}>
        <p class="small muted">
          {offMap()} {offMap() === 1 ? 'plot is' : 'plots are'} not on the map yet: no location
          recorded.
        </p>
      </Show>
    </>
  )
}
