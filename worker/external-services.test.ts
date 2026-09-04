import { describe, expect, it, vi } from 'vitest'
import { handleWorkerRequest } from './index'

const origin = 'https://woyken.github.io'
const request = (path: string, init?: RequestInit) =>
  new Request(`https://worker.test${path}`, {
    ...init,
    headers: { Origin: origin, ...init?.headers },
  })
const options = (fetcher: typeof fetch) => ({
  productionOrigin: origin,
  fetch: fetcher,
  now: () => new Date('2026-09-03T12:00:00Z'),
})

describe('retained external-service Worker operations', () => {
  it('returns normalized nearby Trafi stops without credentials', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        stops: [
          {
            stop: {
              id: 7,
              name: 'Centras',
              location: { lat: 54.7, lng: 25.3 },
            },
          },
        ],
      }),
    )

    const response = await handleWorkerRequest(
      request('/trafi/nearby-stops?latitude=54.7&longitude=25.3'),
      options(fetcher),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      { id: '7', name: 'Centras', latitude: 54.7, longitude: 25.3 },
    ])
    const [input, init] = fetcher.mock.calls[0]
    expect(String(input)).toBe(
      'https://whitelabel-app-api-wl.vilkas.trafi.com/v1/transit/stops/nearby?lat=54.700000&lng=25.300000',
    )
    expect(new Headers(init?.headers).has('Authorization')).toBe(false)
  })

  it('falls back to the fixed Trafi bounds operation for a valid empty nearby result', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ stops: [] }))
      .mockResolvedValueOnce(
        Response.json([
          { id: 'rural', name: 'Kaimas', lat: 54.71, lng: 25.31 },
        ]),
      )
    const response = await handleWorkerRequest(
      request('/trafi/nearby-stops?latitude=54.7&longitude=25.3'),
      options(fetcher),
    )

    expect(await response.json()).toEqual([
      { id: 'rural', name: 'Kaimas', latitude: 54.71, longitude: 25.31 },
    ])
    expect(String(fetcher.mock.calls[1][0])).toContain('/v1/transit/stops?')
  })

  it('normalizes walking directions and route search', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          path: { duration: { seconds: 420 }, distance: { meters: 510 } },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          routes: [
            {
              startTime: '2026-09-07T07:30:00+03:00',
              endTime: '2026-09-07T08:00:00+03:00',
              segments: [
                { mode: 'BUS', transit: { schedule: { name: '1G' } } },
              ],
            },
          ],
        }),
      )
    const walking = await handleWorkerRequest(
      request(
        '/trafi/walking-directions?startLatitude=54.7&startLongitude=25.3&endLatitude=54.71&endLongitude=25.31',
      ),
      options(fetcher),
    )
    const routes = await handleWorkerRequest(
      request('/trafi/route-search', {
        method: 'POST',
        body: JSON.stringify({
          start: { latitude: 54.7, longitude: 25.3 },
          end: { latitude: 54.71, longitude: 25.31 },
          arriveBy: '2026-09-07T08:00:00+03:00',
          url: 'https://attacker.test',
        }),
      }),
      options(fetcher),
    )

    expect(await walking.json()).toEqual({
      durationSeconds: 420,
      distanceMeters: 510,
    })
    expect(await routes.json()).toEqual([
      {
        durationSeconds: 1800,
        startTime: '2026-09-07T07:30:00+03:00',
        endTime: '2026-09-07T08:00:00+03:00',
        segments: [{ mode: 'BUS', name: '1G' }],
      },
    ])
    expect(String(fetcher.mock.calls[1][0])).toBe(
      'https://whitelabel-app-api-wl.vilkas.trafi.com/v2/routes',
    )
  })

  it('counts fixed IRD crime results within the requested radius', async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      const query = JSON.parse(
        decodeURIComponent(String(init?.body).replace(/^query=/, '')),
      ) as { shape: { rings: Array<[number, number]> } }
      const [x, y] = query.shape.rings[0]
      return Response.json({
        grid: [],
        bare: [
          [1, x - 1000, y, '129::::::::::', 0],
          [2, x - 950, y, '178::::::::::', 0],
          [3, x - 2500, y, '178::::::::::', 0],
        ],
      })
    })
    const response = await handleWorkerRequest(
      request(
        '/crime/density?latitude=54.7&longitude=25.3&radiusMeters=1000&years=3',
      ),
      options(fetcher),
    )

    expect(await response.json()).toEqual({
      rawCount: 2,
      weightedCount: 4,
      violentCount: 1,
      radiusMeters: 1000,
      years: 3,
      dateFrom: '2023-09-03',
      dateTo: '2026-09-03',
      emptyResponse: false,
    })
    expect(String(fetcher.mock.calls[0][0])).toBe(
      'https://maps.ird.lt/nvzr-services/query',
    )
  })

  it('explains why the IRD crime query failed in the 502 body', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const path =
      '/crime/density?latitude=54.7&longitude=25.3&radiusMeters=1000&years=3'
    const upstreamDown = await handleWorkerRequest(
      request(path),
      options(
        vi.fn<typeof fetch>(
          async () =>
            new Response('maintenance', {
              status: 503,
              statusText: 'Service Unavailable',
            }),
        ),
      ),
    )
    const notJson = await handleWorkerRequest(
      request(path),
      options(vi.fn<typeof fetch>(async () => new Response('<html>oops'))),
    )
    const noBare = await handleWorkerRequest(
      request(path),
      options(vi.fn<typeof fetch>(async () => Response.json({ grid: [] }))),
    )
    const networkFailure = await handleWorkerRequest(
      request(path),
      options(
        vi.fn<typeof fetch>(async () => {
          throw new TypeError('fetch failed')
        }),
      ),
    )

    expect(upstreamDown.status).toBe(502)
    expect(await upstreamDown.json()).toEqual({
      error: 'IRD unavailable',
      reason: 'IRD responded HTTP 503 Service Unavailable',
    })
    expect(await notJson.json()).toMatchObject({
      reason: expect.stringContaining('IRD returned non-JSON body'),
    })
    expect(await noBare.json()).toMatchObject({
      reason: 'IRD response has no "bare" array; keys: grid',
    })
    expect(await networkFailure.json()).toMatchObject({
      reason:
        'POST https://maps.ird.lt/nvzr-services/query failed: fetch failed',
    })
  })

  it('distinguishes valid empty transport noise from unavailable schemas', async () => {
    const emptyFetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ features: [] }),
    )
    const empty = await handleWorkerRequest(
      request('/inspire/transport-noise?latitude=54.7&longitude=25.3'),
      options(emptyFetcher),
    )
    const invalid = await handleWorkerRequest(
      request('/inspire/transport-noise?latitude=54.7&longitude=25.3'),
      options(vi.fn<typeof fetch>(async () => Response.json({}))),
    )

    expect(await empty.json()).toEqual({
      railwayDistanceMeters: null,
      majorRoadDistanceMeters: null,
    })
    expect(invalid.status).toBe(502)
    expect(await invalid.json()).toEqual({ error: 'INSPIRE unavailable' })
    expect(emptyFetcher).toHaveBeenCalledTimes(2)
    for (const [input] of emptyFetcher.mock.calls)
      expect(String(input)).toContain(
        'https://inspire-geoportal.lt/geoserver/tn/wfs?',
      )
  })

  it('normalizes INSPIRE transport lines to nearest distances', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) =>
      String(input).includes('RailwayLink')
        ? Response.json({
            features: [
              {
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [25.3, 54.699],
                    [25.3, 54.701],
                  ],
                },
              },
            ],
          })
        : Response.json({ features: [] }),
    )
    const response = await handleWorkerRequest(
      request('/inspire/transport-noise?latitude=54.7&longitude=25.301'),
      options(fetcher),
    )

    expect(await response.json()).toEqual({
      railwayDistanceMeters: expect.any(Number),
      majorRoadDistanceMeters: null,
    })
    const result = await handleWorkerRequest(
      request('/inspire/transport-noise?latitude=54.7&longitude=25.3'),
      options(
        vi.fn<typeof fetch>(async () =>
          Response.json({
            features: [{ geometry: { type: 'Point', coordinates: [] } }],
          }),
        ),
      ),
    )
    expect(result.status).toBe(502)
  })

  it('does not connect separate INSPIRE MultiLineString components', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        features: [
          {
            geometry: {
              type: 'MultiLineString',
              coordinates: [
                [
                  [25.29, 54.69],
                  [25.29, 54.7],
                ],
                [
                  [25.31, 54.7],
                  [25.31, 54.71],
                ],
              ],
            },
          },
        ],
      }),
    )
    const response = await handleWorkerRequest(
      request('/inspire/transport-noise?latitude=54.7&longitude=25.3'),
      options(fetcher),
    )
    const value = (await response.json()) as {
      railwayDistanceMeters: number
      majorRoadDistanceMeters: number
    }

    expect(value.railwayDistanceMeters).toBeGreaterThan(500)
    expect(value.majorRoadDistanceMeters).toBeGreaterThan(500)
  })

  it('rejects invalid input, schema failures, arbitrary targets, and disallowed CORS', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ unexpected: true }),
    )
    const invalid = await handleWorkerRequest(
      request('/crime/density?latitude=200&longitude=25.3'),
      options(fetcher),
    )
    const schema = await handleWorkerRequest(
      request('/trafi/nearby-stops?latitude=54.7&longitude=25.3'),
      options(fetcher),
    )
    const arbitrary = await handleWorkerRequest(
      request('/proxy?url=https://attacker.test'),
      options(fetcher),
    )
    const forbidden = await handleWorkerRequest(
      new Request(
        'https://worker.test/trafi/nearby-stops?latitude=54.7&longitude=25.3',
        {
          headers: { Origin: 'https://attacker.test' },
        },
      ),
      options(fetcher),
    )

    expect(invalid.status).toBe(400)
    expect(schema.status).toBe(502)
    expect(arbitrary.status).toBe(404)
    expect(forbidden.status).toBe(403)
    expect(invalid.headers.get('Access-Control-Allow-Origin')).toBe(origin)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('remains publicly callable without granting cross-origin browser access', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ stops: [] }),
    )
    const response = await handleWorkerRequest(
      new Request(
        'https://worker.test/trafi/nearby-stops?latitude=54.7&longitude=25.3',
      ),
      options(fetcher),
    )

    expect(response.status).toBe(200)
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('permits route-search preflight only from the production origin', async () => {
    const allowed = await handleWorkerRequest(
      request('/trafi/route-search', {
        method: 'OPTIONS',
        headers: { 'Access-Control-Request-Method': 'POST' },
      }),
      options(vi.fn<typeof fetch>()),
    )
    const forbidden = await handleWorkerRequest(
      new Request('https://worker.test/trafi/route-search', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://attacker.test',
          'Access-Control-Request-Method': 'POST',
        },
      }),
      options(vi.fn<typeof fetch>()),
    )

    expect(allowed.status).toBe(204)
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(origin)
    expect(allowed.headers.get('Access-Control-Allow-Methods')).toContain(
      'POST',
    )
    expect(forbidden.status).toBe(403)
  })
})
