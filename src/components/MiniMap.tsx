import { Show, createEffect, onCleanup } from 'solid-js'
import 'leaflet/dist/leaflet.css'
import type * as Leaflet from 'leaflet'
import type { CandidatePlotMapItem } from '../source-listings/map'
import { PinIcon } from './icons'
import {
  BLUE,
  OSM_TILES,
  STAKE,
  STILL_MAP_OPTIONS,
  itemsBounds,
  shapeLayer,
} from './leaflet-shapes'

export type MiniMapState = 'exact' | 'approx' | 'problem' | 'unknown'

export const miniMapCaption = (state: MiniMapState) =>
  ({
    exact: 'exact shape',
    approx: 'roughly here',
    problem: 'location failed',
    unknown: 'no location yet',
  })[state]

/**
 * A small still map of the plot with its surroundings, or a dotted
 * placeholder when there is nothing to show yet. The map is created only when
 * it scrolls into view, since a list may hold many of them.
 */
export function MiniMap(props: {
  items: Array<CandidatePlotMapItem>
  state: MiniMapState
  going: boolean
}) {
  let leaflet: typeof Leaflet | undefined
  let map: Leaflet.Map | undefined
  let group: Leaflet.FeatureGroup | undefined
  let observer: IntersectionObserver | undefined
  let disposed = false

  const draw = (items: Array<CandidatePlotMapItem>, going: boolean) => {
    if (!leaflet || !map || !group) return
    const bounds = itemsBounds(leaflet, items)
    if (!bounds) return
    map.fitBounds(bounds.pad(2.2), { maxZoom: 16 })
    group.clearLayers()
    for (const item of items)
      shapeLayer(leaflet, item, going ? STAKE : BLUE).addTo(group)
  }

  const create = async (element: HTMLDivElement) => {
    const loaded = await import('leaflet')
    if (disposed || map) return
    leaflet = loaded
    map = loaded.map(element, STILL_MAP_OPTIONS)
    loaded.tileLayer(OSM_TILES).addTo(map)
    group = loaded.featureGroup().addTo(map)
    draw(props.items, props.going)
  }

  const mount = (element: HTMLDivElement) => {
    // The element is recreated whenever the placeholder swaps back to a map.
    map?.remove()
    map = undefined
    if (typeof IntersectionObserver === 'undefined') {
      void create(element)
      return
    }
    observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer?.disconnect()
        void create(element)
      }
    })
    observer.observe(element)
  }

  createEffect(
    () => [props.items, props.going] as const,
    ([items, going]) => draw(items, going),
  )

  onCleanup(() => {
    disposed = true
    observer?.disconnect()
    map?.remove()
  })

  return (
    <Show
      when={props.items.length > 0}
      fallback={
        <div class="mini none" aria-hidden="true">
          <Show when={props.state === 'problem'} fallback={<PinIcon />}>
            <span class="display bang">!</span>
          </Show>
        </div>
      }
    >
      <div class="mini" ref={mount} aria-hidden="true" />
    </Show>
  )
}
