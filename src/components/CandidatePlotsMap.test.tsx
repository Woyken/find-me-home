// @vitest-environment jsdom

import { render } from '@solidjs/web'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CandidatePlotsMap } from './CandidatePlotsMap'

const leaflet = vi.hoisted(() => {
  const layer = () => ({
    addTo: vi.fn().mockReturnThis(),
    clearLayers: vi.fn(),
    setLatLng: vi.fn().mockReturnThis(),
    setRadius: vi.fn().mockReturnThis(),
    bindTooltip: vi.fn().mockReturnThis(),
    getLatLng: vi.fn(() => [55, 26]),
  })
  return {
    map: vi.fn(() => ({
      setView: vi.fn(),
      getZoom: vi.fn(() => 17),
      getContainer: () => document.createElement('div'),
      on: vi.fn(),
      invalidateSize: vi.fn(),
      remove: vi.fn(),
    })),
    layerGroup: vi.fn(layer),
    circle: vi.fn(layer),
    circleMarker: vi.fn(layer),
    tileLayer: vi.fn(layer),
    control: { zoom: vi.fn(layer) },
    latLngBounds: vi.fn(() => ({ isValid: () => false })),
  }
})

vi.mock('leaflet', () => leaflet)

let dispose: (() => void) | undefined
const watchPosition = vi.fn<Geolocation['watchPosition']>(() => 0)
const clearWatch = vi.fn<Geolocation['clearWatch']>()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  vi.stubGlobal('navigator', { geolocation: { watchPosition, clearWatch } })
})

afterEach(() => {
  dispose?.()
  dispose = undefined
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

const mount = async () => {
  const container = document.createElement('div')
  document.body.append(container)
  dispose = render(
    () => (
      <CandidatePlotsMap
        plots={[]}
        selectedPlotId={undefined}
        onSelect={() => {}}
      />
    ),
    container,
  )
  await vi.waitFor(() => expect(leaflet.map).toHaveBeenCalledOnce())
  return document.querySelector('button')!
}

const position = (
  latitude: number,
  longitude: number,
  accuracy: number,
): GeolocationPosition => ({
  coords: {
    latitude,
    longitude,
    accuracy,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    toJSON() {
      return {}
    },
  },
  timestamp: Date.now(),
  toJSON() {
    return {}
  },
})

const locationError = (code: number): GeolocationPositionError => ({
  code,
  message: 'Location error',
  PERMISSION_DENIED: 1,
  POSITION_UNAVAILABLE: 2,
  TIMEOUT: 3,
})

it('starts on click and updates the marker and accuracy without repeatedly recentering', async () => {
  const button = await mount()
  expect(watchPosition).not.toHaveBeenCalled()
  button.click()
  expect(watchPosition).toHaveBeenCalledWith(
    expect.any(Function),
    expect.any(Function),
    {
      enableHighAccuracy: true,
      timeout: 10_000,
      maximumAge: 0,
    },
  )
  const success = watchPosition.mock.calls[0][0]
  const map = leaflet.map.mock.results[0].value
  map.setView.mockClear()

  success(position(54, 25, 20))
  expect(leaflet.circleMarker).toHaveBeenCalledWith(
    [54, 25],
    expect.any(Object),
  )
  expect(map.setView).toHaveBeenCalledExactlyOnceWith([54, 25], 17)
  success(position(55, 26, 5))
  expect(leaflet.circleMarker).toHaveBeenCalledOnce()
  const marker = leaflet.circleMarker.mock.results[0].value
  const circle = leaflet.circle.mock.results[0].value
  expect(marker.setLatLng).toHaveBeenCalledWith([55, 26])
  expect(circle.setLatLng).toHaveBeenCalledWith([55, 26])
  expect(circle.setRadius).toHaveBeenCalledWith(5)
  expect(map.setView).toHaveBeenCalledOnce()
  await vi.waitFor(() => {
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      'Live location, give or take 5 m',
    )
    expect(button.disabled).toBe(false)
  })
  button.click()
  expect(watchPosition).toHaveBeenCalledOnce()
  expect(map.setView).toHaveBeenCalledTimes(2)

  dispose?.()
  dispose = undefined
  expect(clearWatch).toHaveBeenCalledExactlyOnceWith(0)
  success(position(56, 27, 10))
  expect(marker.setLatLng).toHaveBeenCalledTimes(1)
})

it('keeps watching after a timeout and removes the stale location until recovery', async () => {
  const button = await mount()
  button.click()
  const [success, error] = watchPosition.mock.calls[0]
  success(position(54, 25, 20))
  error?.(locationError(3))
  expect(clearWatch).not.toHaveBeenCalled()
  expect(
    leaflet.layerGroup.mock.results[1].value.clearLayers,
  ).toHaveBeenCalledOnce()
  await vi.waitFor(() =>
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      'Still trying',
    ),
  )
  expect(button.disabled).toBe(true)
  success(position(55, 26, 5))
  expect(leaflet.circleMarker).toHaveBeenCalledTimes(2)
  await vi.waitFor(() =>
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      'Live location',
    ),
  )
})

it('clears a denied watch and allows retrying', async () => {
  const button = await mount()
  button.click()
  watchPosition.mock.calls[0][1]?.(locationError(1))
  expect(clearWatch).toHaveBeenCalledWith(0)
  await vi.waitFor(() => {
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      'Location access was denied',
    )
    expect(button.disabled).toBe(false)
  })
  button.click()
  expect(watchPosition).toHaveBeenCalledTimes(2)
})

it('clears a pending watch when the map closes', async () => {
  const button = await mount()
  button.click()
  dispose?.()
  dispose = undefined
  expect(clearWatch).toHaveBeenCalledExactlyOnceWith(0)
})
