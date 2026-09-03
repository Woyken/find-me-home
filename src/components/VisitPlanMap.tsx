import { useNavigate } from '@solidjs/router'
import { createEffect, onCleanup } from 'solid-js'
import 'leaflet/dist/leaflet.css'
import type * as Leaflet from 'leaflet'
import { paths } from '../paths'
import type { SourceListingDetail } from '../source-listings/model'
import { sourceListingMapLocation } from '../source-listings/map'

export function VisitPlanMap(props: {
  sourceListings: Array<SourceListingDetail>
}) {
  const navigate = useNavigate()
  let map: Leaflet.Map | undefined
  let sourceListingLayer: Leaflet.LayerGroup | undefined
  let leafletApi: typeof Leaflet | undefined
  let resizeObserver: ResizeObserver | undefined
  let disposed = false

  const draw = (sourceListings: Array<SourceListingDetail>) => {
    if (!leafletApi || !map || !sourceListingLayer) return
    sourceListingLayer.clearLayers()
    const bounds = leafletApi.latLngBounds([])
    sourceListings.forEach((sourceListing, index) => {
      const location = sourceListingMapLocation(sourceListing)
      if (!location) return
      const marker = leafletApi!.circleMarker(
        [location.latitude, location.longitude],
        {
          radius: 17,
          color: '#24483a',
          weight: 3,
          fillColor: '#faf9f4',
          fillOpacity: 0.94,
        },
      )
      marker.bindTooltip(String(index + 1), {
        permanent: true,
        direction: 'center',
        className: 'visit-plan-map-label',
      })
      marker.bindPopup(
        `<b>${escapeHtml(sourceListing.title ?? `Aruodas advert ${sourceListing.sourceId}`)}</b><br>${escapeHtml(sourceListing.address ?? 'Location unknown')}`,
      )
      marker.on('click', () => navigate(paths.sourceListing(sourceListing.id)))
      marker.addTo(sourceListingLayer!)
      bounds.extend(marker.getLatLng())
    })
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 })
    } else {
      map.setView([54.6872, 25.2797], 10)
    }
  }

  const init = (element: HTMLDivElement) => {
    void import('leaflet').then((leaflet) => {
      if (disposed) return
      leafletApi = leaflet
      map = leaflet.map(element, { zoomControl: false })
      sourceListingLayer = leaflet.layerGroup().addTo(map)
      leaflet
        .tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        })
        .addTo(map)
      leaflet.control.zoom({ position: 'bottomright' }).addTo(map)
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
    <div
      ref={init}
      class="h-[32rem] w-full border-x border-b border-[#18241e]"
      aria-label="Map of planned Source Listings"
    />
  )
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[character]!,
  )
}
