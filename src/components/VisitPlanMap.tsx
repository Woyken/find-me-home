import { useNavigate } from '@solidjs/router'
import { onCleanup } from 'solid-js'
import 'leaflet/dist/leaflet.css'
import type * as Leaflet from 'leaflet'
import type { SourceListingSummary } from '../server/source-listings'
import { paths } from '../paths'

export function VisitPlanMap(props: { listings: Array<SourceListingSummary> }) {
  const navigate = useNavigate()
  let map: Leaflet.Map | undefined
  let resizeObserver: ResizeObserver | undefined
  let disposed = false

  const init = (element: HTMLDivElement) => {
    void import('leaflet').then((leaflet) => {
      if (disposed) return
      map = leaflet.map(element, { zoomControl: false })
      leaflet
        .tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        })
        .addTo(map)
      leaflet.control.zoom({ position: 'bottomright' }).addTo(map)
      const bounds = leaflet.latLngBounds([])

      props.listings.forEach((listing, index) => {
        if (listing.mapLatitude === null || listing.mapLongitude === null)
          return
        const referenceOnly = listing.mapSource === 'advertisement_plan'
        const marker = leaflet.circleMarker(
          [listing.mapLatitude, listing.mapLongitude],
          {
            radius: 17,
            color: referenceOnly ? '#765516' : '#24483a',
            weight: 3,
            fillColor: referenceOnly ? '#f6e9ce' : '#faf9f4',
            fillOpacity: 0.94,
            dashArray: referenceOnly ? '4 4' : undefined,
          },
        )
        marker.bindTooltip(String(index + 1), {
          permanent: true,
          direction: 'center',
          className: 'visit-plan-map-label',
        })
        marker.bindPopup(
          `<b>${escapeHtml(listing.title ?? `Aruodas advert ${listing.sourceId}`)}</b><br>${escapeHtml(listing.locationLabel ?? 'Location unknown')}${referenceOnly ? '<br><small>Advertisement plan reference only</small>' : ''}`,
        )
        marker.on('click', () => {
          navigate(paths.sourceListing(listing.id))
        })
        marker.addTo(map!)
        bounds.extend(marker.getLatLng())
      })

      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 })
      } else {
        map.setView([54.6872, 25.2797], 10)
      }
      resizeObserver = new ResizeObserver(() => map?.invalidateSize())
      resizeObserver.observe(element)
    })
  }

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
