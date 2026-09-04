import { gzipSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import { PARCEL_MUNICIPALITIES, buildParcelAssetsInMemory } from './artifacts'
import type { ParcelSource } from './artifacts'
import { ParcelRepository } from './repository'

const source: ParcelSource = {
  municipalityCode: 13,
  sourceVersion: 'fixture-1',
  parcels: [
    {
      cadastralNumber: '0101/0001:42',
      uniqueNumber: '130012345678',
      purposeText: 'Agricultural',
      areaM2: 10_000,
      rings: [
        [
          [500_000, 6_000_000],
          [500_100, 6_000_000],
          [500_100, 6_000_100],
          [500_000, 6_000_100],
          [500_000, 6_000_000],
        ],
        [
          [500_020, 6_000_020],
          [500_040, 6_000_020],
          [500_040, 6_000_040],
          [500_020, 6_000_040],
          [500_020, 6_000_020],
        ],
      ],
    },
  ],
}

const sources = () => [
  source,
  ...PARCEL_MUNICIPALITIES.slice(1).map((municipalityCode, index) => ({
    municipalityCode,
    sourceVersion: 'fixture-1',
    parcels: [
      {
        cadastralNumber: `0202/0001:${index + 1}`,
        uniqueNumber: `${municipalityCode}0099999999`,
        purposeText: null,
        areaM2: 100,
        rings: [
          [
            [600_000 + index * 10_000, 6_100_000],
            [600_010 + index * 10_000, 6_100_000],
            [600_010 + index * 10_000, 6_100_010],
            [600_000 + index * 10_000, 6_100_010],
            [600_000 + index * 10_000, 6_100_000],
          ],
        ] as ParcelSource['parcels'][number]['rings'],
      },
    ],
  })),
]

describe('ParcelRepository', () => {
  it('fetches only required shards for exact-number and point lookups', async () => {
    const files = buildParcelAssetsInMemory(sources(), {
      builtAt: '2026-09-02T00:00:00.000Z',
    })
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input)
      const pathname = new URL(url, 'https://example.test').pathname
      const bytes = files.get(pathname.replace('/parcels/', ''))
      return bytes
        ? new Response(bytes as BodyInit, { status: 200 })
        : new Response(null, { status: 404 })
    })
    const repository = new ParcelRepository('/parcels/', { fetch: fetcher })

    const exact = await repository.findByNumber('1300-1234-5678')
    expect(exact).toHaveLength(1)
    expect(exact[0].cadastralNumber).toBe('0101/0001:42')
    expect(fetcher).toHaveBeenCalledTimes(3)

    expect(await repository.findAtLks94(500_010, 6_000_010)).toMatchObject({
      uniqueNumber: '130012345678',
      purposeText: 'Agricultural',
    })
    expect(await repository.findAtLks94(500_030, 6_000_030)).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(repository.datasetVersion).toBeTruthy()
  })

  it('rejects corrupt compressed responses instead of caching them', async () => {
    const files = buildParcelAssetsInMemory(sources())
    const manifest = files.get('manifest.json')!
    let prefixRequests = 0
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input)
      const pathname = new URL(url, 'https://example.test').pathname
      if (pathname.endsWith('manifest.json')) {
        return new Response(manifest as BodyInit)
      }
      prefixRequests++
      return new Response(
        prefixRequests === 1 ? new Uint8Array([1, 2, 3]) : gzipSync('{}'),
      )
    })
    const repository = new ParcelRepository('/parcels/', { fetch: fetcher })

    await expect(repository.findByNumber('130012345678')).rejects.toThrow()
    await expect(repository.findByNumber('130012345678')).rejects.toThrow()
    expect(prefixRequests).toBe(2)
  })

  it('evicts a corrupt cached shard and retries it from the network', async () => {
    const files = buildParcelAssetsInMemory(sources())
    const manifest = JSON.parse(
      new TextDecoder().decode(files.get('manifest.json')),
    ) as { datasetVersion: string; cells: Record<string, { path: string }> }
    const assetPath = manifest.cells['100_1200'].path
    const cache = new Map<string, Response>([
      [
        `registered-parcels-${manifest.datasetVersion}:${assetPath}`,
        new Response(new Uint8Array([1, 2, 3])),
      ],
    ])
    const cacheKey = (name: string, request: Request) =>
      `${name}:${new URL(request.url).pathname.replace('/parcels/', '')}`
    const cacheStorage = {
      open: vi.fn(async (name: string) => ({
        match: async (request: Request) =>
          cache.get(cacheKey(name, request))?.clone(),
        put: async (request: Request, response: Response) => {
          cache.set(cacheKey(name, request), response.clone())
        },
        delete: async (request: Request) =>
          cache.delete(cacheKey(name, request)),
      })),
      keys: async () => [],
    } as unknown as CacheStorage
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input)
      const file = new URL(url).pathname.replace('/parcels/', '')
      return new Response(files.get(file) as BodyInit)
    })
    const repository = new ParcelRepository('/parcels/', {
      fetch: fetcher,
      cacheStorage,
    })

    await expect(
      repository.findAtLks94(500_010, 6_000_010),
    ).resolves.toMatchObject({ uniqueNumber: '130012345678' })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('resolves from the network when Cache Storage is unavailable', async () => {
    const files = buildParcelAssetsInMemory(sources())
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input)
      const file = new URL(url).pathname.replace('/parcels/', '')
      return new Response(files.get(file) as BodyInit)
    })
    const cacheStorage = {
      open: vi.fn(async () => {
        throw new Error('Cache Storage unavailable')
      }),
      keys: vi.fn(async () => {
        throw new Error('Cache Storage unavailable')
      }),
    } as unknown as CacheStorage
    const repository = new ParcelRepository('/parcels/', {
      fetch: fetcher,
      cacheStorage,
    })

    await expect(
      repository.findAtLks94(500_010, 6_000_010),
    ).resolves.toMatchObject({ uniqueNumber: '130012345678' })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('keeps a network result when cache persistence fails', async () => {
    const files = buildParcelAssetsInMemory(sources())
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input)
      const file = new URL(url).pathname.replace('/parcels/', '')
      return new Response(files.get(file) as BodyInit)
    })
    const cacheStorage = {
      open: vi.fn(async () => ({
        match: async () => undefined,
        put: async () => {
          throw new Error('Cache write unavailable')
        },
      })),
      keys: vi.fn(async () => {
        throw new Error('Cache cleanup unavailable')
      }),
    } as unknown as CacheStorage
    const repository = new ParcelRepository('/parcels/', {
      fetch: fetcher,
      cacheStorage,
    })

    await expect(
      repository.findAtLks94(500_010, 6_000_010),
    ).resolves.toMatchObject({ uniqueNumber: '130012345678' })
  })

  it('resolves a containing parcel whose registered area is unknown', async () => {
    const files = buildParcelAssetsInMemory([
      {
        ...source,
        parcels: [{ ...source.parcels[0], areaM2: null }],
      },
      ...sources().slice(1),
    ])
    const fetcher = async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input)
      const file = new URL(url).pathname.replace('/parcels/', '')
      return new Response(files.get(file) as BodyInit)
    }
    const repository = new ParcelRepository('/parcels/', { fetch: fetcher })

    expect(await repository.findAtLks94(500_010, 6_000_010)).toMatchObject({
      areaM2: null,
    })
  })

  it('retries after a transient manifest failure', async () => {
    const files = buildParcelAssetsInMemory(sources())
    let attempts = 0
    const fetcher = async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input)
      const file = new URL(url).pathname.replace('/parcels/', '')
      if (file === 'manifest.json' && attempts++ === 0) {
        return new Response(null, { status: 503 })
      }
      return new Response(files.get(file) as BodyInit)
    }
    const repository = new ParcelRepository('/parcels/', { fetch: fetcher })

    await expect(repository.findByNumber('130012345678')).rejects.toThrow(
      /HTTP 503/,
    )
    await expect(repository.findByNumber('130012345678')).resolves.toHaveLength(
      1,
    )
  })
})
