import type * as Leaflet from 'leaflet'
import type { Feature, Polygon } from 'geojson'
import type { CandidatePlotMapItem } from '../source-listings/map'

export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

export const BLUE = '#2a5d9f'
export const STAKE = '#e8641b'

export type PlotShape = Leaflet.Layer

/**
 * The plot as a shape: its registry boundary when we have it, otherwise a
 * dashed circle sized by how exact the location is.
 */
export const shapeLayer = (
  leaflet: typeof Leaflet,
  item: Pick<
    CandidatePlotMapItem,
    'latitude' | 'longitude' | 'boundary' | 'precision'
  >,
  color: string,
  selected = false,
): PlotShape => {
  const style = {
    color,
    weight: selected ? 4 : 2.5,
    fillColor: color,
    fillOpacity: selected ? 0.35 : 0.18,
  }
  if (item.boundary) {
    const feature: Feature<Polygon> = {
      type: 'Feature',
      properties: {},
      geometry: item.boundary,
    }
    return leaflet.geoJSON(feature, { style })
  }
  return leaflet.circle([item.latitude, item.longitude], {
    radius: item.precision === 'approx' ? 80 : 24,
    dashArray: '6 5',
    ...style,
  })
}

/**
 * Bounds of a plot's shape computed from data alone, so the map view can be
 * set before any layer is added (a Circle can't report bounds until then).
 */
export const shapeBounds = (
  leaflet: typeof Leaflet,
  item: Pick<
    CandidatePlotMapItem,
    'latitude' | 'longitude' | 'boundary' | 'precision'
  >,
): Leaflet.LatLngBounds => {
  if (item.boundary) {
    const feature: Feature<Polygon> = {
      type: 'Feature',
      properties: {},
      geometry: item.boundary,
    }
    return leaflet.geoJSON(feature).getBounds()
  }
  return leaflet
    .latLng(item.latitude, item.longitude)
    .toBounds((item.precision === 'approx' ? 80 : 24) * 2)
}

/** Bounds around every item, or undefined when there are none. */
export const itemsBounds = (
  leaflet: typeof Leaflet,
  items: Array<
    Pick<
      CandidatePlotMapItem,
      'latitude' | 'longitude' | 'boundary' | 'precision'
    >
  >,
) => {
  const bounds = leaflet.latLngBounds([])
  for (const item of items) bounds.extend(shapeBounds(leaflet, item))
  return bounds.isValid() ? bounds : undefined
}

/** Non-interactive map options for thumbnails. */
export const STILL_MAP_OPTIONS: Leaflet.MapOptions = {
  zoomControl: false,
  attributionControl: false,
  dragging: false,
  scrollWheelZoom: false,
  doubleClickZoom: false,
  boxZoom: false,
  keyboard: false,
  touchZoom: false,
}
