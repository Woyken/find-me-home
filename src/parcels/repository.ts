import type {
  ParcelAsset,
  ParcelManifest,
  ParcelReference,
  PrefixShard,
  SpatialParcelTuple,
  SpatialShard,
} from './artifacts'

export interface RegisteredParcel {
  id: string
  municipalityCode: number
  cadastralNumber: string | null
  uniqueNumber: string | null
  areaM2: number | null
  purposeText: string | null
  rings: Array<Array<[number, number]>>
}

interface RepositoryOptions {
  fetch?: typeof fetch
  cacheStorage?: CacheStorage
}

function pointInRing(
  x: number,
  y: number,
  ring: Array<[number, number]>,
): boolean {
  let inside = false
  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index++
  ) {
    const [x1, y1] = ring[index]
    const [x2, y2] = ring[previous]
    if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) {
      inside = !inside
    }
  }
  return inside
}

function containsPoint(
  x: number,
  y: number,
  rings: Array<Array<[number, number]>>,
): boolean {
  return (
    rings.length > 0 &&
    pointInRing(x, y, rings[0]) &&
    !rings.slice(1).some((ring) => pointInRing(x, y, ring))
  )
}

async function decompressJson<T>(bytes: Uint8Array): Promise<T> {
  const body = new Response(bytes as BodyInit).body
  if (!body) throw new Error('compressed parcel response has no body')
  const stream = body.pipeThrough(new DecompressionStream('gzip'))
  return JSON.parse(await new Response(stream).text()) as T
}

export class ParcelRepository {
  readonly #baseUrl: string
  readonly #fetch: typeof fetch
  readonly #cacheStorage: CacheStorage | undefined
  readonly #loaded = new Map<string, Promise<unknown>>()
  #manifest: Promise<ParcelManifest> | undefined
  datasetVersion: string | null = null

  constructor(baseUrl: string, options: RepositoryOptions = {}) {
    this.#baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
    this.#fetch = options.fetch ?? fetch
    this.#cacheStorage =
      options.cacheStorage ??
      (typeof globalThis.caches === 'undefined' ? undefined : globalThis.caches)
  }

  async #getManifest(): Promise<ParcelManifest> {
    if (this.#manifest) return this.#manifest
    const loading = this.#fetch(
      new URL('manifest.json', this.#absoluteBase()),
      {
        cache: 'no-store',
      },
    ).then(async (response) => {
      if (!response.ok)
        throw new Error(`parcel manifest: HTTP ${response.status}`)
      const manifest = (await response.json()) as ParcelManifest
      if (manifest.schemaVersion !== 1)
        throw new Error('unsupported parcel schema')
      this.datasetVersion = manifest.datasetVersion
      return manifest
    })
    this.#manifest = loading
    loading.catch(() => {
      if (this.#manifest === loading) this.#manifest = undefined
    })
    return loading
  }

  #absoluteBase(): string {
    return new URL(
      this.#baseUrl,
      typeof location === 'undefined' ? 'http://localhost/' : location.href,
    ).href
  }

  async #loadCompressed<T>(assetPath: string): Promise<T> {
    const manifest = await this.#getManifest()
    const key = `${manifest.datasetVersion}/${assetPath}`
    const existing = this.#loaded.get(key)
    if (existing) return existing as Promise<T>
    const loading = (async () => {
      const request = new Request(new URL(assetPath, this.#absoluteBase()))
      const cache = await this.#cacheStorage?.open(
        `registered-parcels-${manifest.datasetVersion}`,
      )
      const cached = await cache?.match(request)
      if (cached) {
        try {
          return await decompressJson<T>(
            new Uint8Array(await cached.arrayBuffer()),
          )
        } catch {
          await cache?.delete(request)
        }
      }
      const response = await this.#fetch(request)
      if (!response.ok) throw new Error(`${assetPath}: HTTP ${response.status}`)
      const bytes = new Uint8Array(await response.clone().arrayBuffer())
      const parsed = await decompressJson<T>(bytes)
      await cache?.put(request, response.clone())
      if (this.#cacheStorage) {
        const current = `registered-parcels-${manifest.datasetVersion}`
        await Promise.all(
          (await this.#cacheStorage.keys())
            .filter(
              (name) =>
                name.startsWith('registered-parcels-') && name !== current,
            )
            .map(async (name) => {
              const staleCache = await this.#cacheStorage!.open(name)
              await staleCache.delete(request)
            }),
        )
      }
      return parsed
    })()
    this.#loaded.set(key, loading)
    loading.catch(() => this.#loaded.delete(key))
    return loading
  }

  async #spatialParcel(
    reference: ParcelReference,
  ): Promise<RegisteredParcel | null> {
    const [municipalityCode, cell, parcelId] = reference
    const manifest = await this.#getManifest()
    const asset = manifest.cells[cell] as ParcelAsset | undefined
    if (!asset) throw new Error(`parcel manifest has no cell ${cell}`)
    const shard = await this.#loadCompressed<SpatialShard>(asset.path)
    const tuple = shard.parcels.find(([id]) => id === parcelId)
    return tuple ? this.#toParcel(tuple, municipalityCode) : null
  }

  #toParcel(
    tuple: SpatialParcelTuple,
    municipalityCode: number,
  ): RegisteredParcel {
    const [id, cadastralNumber, uniqueNumber, areaM2, purposeText, rings] =
      tuple
    return {
      id,
      municipalityCode,
      cadastralNumber,
      uniqueNumber,
      areaM2,
      purposeText,
      rings,
    }
  }

  async findByNumber(number: string): Promise<Array<RegisteredParcel>> {
    const normalized = number.replace(/\D/g, '')
    if (normalized.length < 4) return []
    const manifest = await this.#getManifest()
    const asset = manifest.prefixes[normalized.slice(0, 4)] as
      ParcelAsset | undefined
    if (!asset) return []
    const shard = await this.#loadCompressed<PrefixShard>(asset.path)
    const references =
      shard.references.find(([value]) => value === normalized)?.[1] ?? []
    const parcels = await Promise.all(
      references.map((reference) => this.#spatialParcel(reference)),
    )
    return [
      ...new Map(
        parcels
          .filter((parcel) => parcel !== null)
          .map((parcel) => [parcel.id, parcel]),
      ).values(),
    ]
  }

  async findAtLks94(x: number, y: number): Promise<RegisteredParcel | null> {
    const manifest = await this.#getManifest()
    const cell = `${Math.floor(x / manifest.cellSizeMetres)}_${Math.floor(y / manifest.cellSizeMetres)}`
    const asset = manifest.cells[cell] as ParcelAsset | undefined
    if (!asset) return null
    const shard = await this.#loadCompressed<SpatialShard>(asset.path)
    let best: RegisteredParcel | null = null
    let bestArea = Infinity
    for (const tuple of shard.parcels) {
      const [, , , areaM2, , rings, [minX, minY, maxX, maxY]] = tuple
      if (
        x < minX ||
        x > maxX ||
        y < minY ||
        y > maxY ||
        !containsPoint(x, y, rings)
      )
        continue
      const area = areaM2 ?? Infinity
      if (best === null || area < bestArea) {
        best = this.#toParcel(tuple, Number(tuple[0].split(':')[0]))
        bestArea = area
      }
    }
    return best
  }
}
