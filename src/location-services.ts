import { ParcelRepository } from './parcels/repository'
import { createLocationResolver } from './location-resolution'
import type { AddressResult } from './location-resolution'

const WORKER_URL = import.meta.env.VITE_WORKER_URL as string | undefined
const NOMINATIM_DELAY_MS = 1_000
let nextNominatimRequestAt = 0
let nominatimQueue = Promise.resolve()

const openCache = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('find-me-home-external-cache', 1)
    request.onupgradeneeded = () =>
      request.result.createObjectStore('responses', { keyPath: 'key' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const cachedResponse = async (key: string) => {
  const database = await openCache()
  try {
    return await new Promise<string | undefined>((resolve, reject) => {
      const request = database
        .transaction('responses')
        .objectStore('responses')
        .get(key)
      request.onsuccess = () =>
        resolve((request.result as { value?: string } | undefined)?.value)
      request.onerror = () => reject(request.error)
    })
  } finally {
    database.close()
  }
}

const cacheResponse = async (key: string, value: string) => {
  const database = await openCache()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('responses', 'readwrite')
      transaction.objectStore('responses').put({ key, value })
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}

const rateLimitedFetch = async (url: string) => {
  const request = nominatimQueue.then(async () => {
    const wait = Math.max(0, nextNominatimRequestAt - Date.now())
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait))
    nextNominatimRequestAt = Date.now() + NOMINATIM_DELAY_MS
    return fetch(url, { headers: { 'Accept-Language': 'lt' } })
  })
  nominatimQueue = request.then(
    () => undefined,
    () => undefined,
  )
  return request
}

export const searchRegiaAddress = async (
  address: string,
): Promise<AddressResult | null> => {
  if (!WORKER_URL) throw new Error('Regia address service is not configured')
  const key = `find-me-home:regia:address:${address.trim().toLocaleLowerCase('lt-LT').replace(/\s+/g, ' ')}`
  const cached = await cachedResponse(key)
  if (cached) return JSON.parse(cached) as AddressResult
  const response = await fetch(
    `${WORKER_URL.replace(/\/$/, '')}/regia/address-search?query=${encodeURIComponent(address)}`,
  )
  if (!response.ok)
    throw new Error(`Regia address service: HTTP ${response.status}`)
  const candidates = (await response.json()) as AddressResult[]
  const candidate = candidates.at(0) ?? null
  if (candidate) await cacheResponse(key, JSON.stringify(candidate))
  return candidate
}

export const reverseNominatimAddress = async (
  latitude: number,
  longitude: number,
): Promise<string | null> => {
  const key = `find-me-home:nominatim:reverse:${latitude.toFixed(5)},${longitude.toFixed(5)}`
  const cached = await cachedResponse(key)
  if (cached) return cached
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.search = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: 'jsonv2',
    'accept-language': 'lt',
  }).toString()
  const response = await rateLimitedFetch(url.toString())
  if (!response.ok) throw new Error(`Nominatim: HTTP ${response.status}`)
  const result = (await response.json()) as { display_name?: string }
  const address = result.display_name?.trim() || null
  if (address) await cacheResponse(key, address)
  return address
}

export const createBrowserLocationResolver = () =>
  createLocationResolver({
    parcels: new ParcelRepository(
      new URL('parcels/', new URL(import.meta.env.BASE_URL, location.href))
        .href,
    ),
    searchAddress: searchRegiaAddress,
    reverseAddress: reverseNominatimAddress,
  })
