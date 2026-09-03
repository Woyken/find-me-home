import { describe, expect, it, vi } from 'vitest'
import { createExternalServiceClient } from './external-service-client'

describe('browser external-service client', () => {
  it('calls each fixed Worker operation and preserves no-result responses', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const path = new URL(String(input)).pathname
      if (path === '/trafi/nearby-stops') return Response.json([])
      if (path === '/trafi/walking-directions')
        return Response.json({ durationSeconds: 120, distanceMeters: null })
      if (path === '/trafi/route-search') return Response.json([])
      if (path === '/crime/density')
        return Response.json({
          rawCount: 0,
          weightedCount: 0,
          violentCount: 0,
          radiusMeters: 1000,
          years: 3,
          dateFrom: '2023-09-03',
          dateTo: '2026-09-03',
          emptyResponse: true,
        })
      return Response.json({
        railwayDistanceMeters: null,
        majorRoadDistanceMeters: null,
      })
    })
    const client = createExternalServiceClient('https://worker.test/', fetcher)

    await expect(client.nearbyStops(54.7, 25.3)).resolves.toEqual([])
    await expect(
      client.walkingDirections(
        { latitude: 54.7, longitude: 25.3 },
        { latitude: 54.71, longitude: 25.31 },
      ),
    ).resolves.toEqual({ durationSeconds: 120, distanceMeters: null })
    await expect(
      client.searchRoutes(
        { latitude: 54.7, longitude: 25.3 },
        { latitude: 54.71, longitude: 25.31 },
        '2026-09-07T08:00:00+03:00',
      ),
    ).resolves.toEqual([])
    await expect(client.crimeDensity(54.7, 25.3)).resolves.toMatchObject({
      emptyResponse: true,
    })
    await expect(client.transportNoise(54.7, 25.3)).resolves.toEqual({
      railwayDistanceMeters: null,
      majorRoadDistanceMeters: null,
    })

    expect(
      fetcher.mock.calls.map(([input]) => new URL(String(input)).pathname),
    ).toEqual([
      '/trafi/nearby-stops',
      '/trafi/walking-directions',
      '/trafi/route-search',
      '/crime/density',
      '/inspire/transport-noise',
    ])
  })

  it('reports HTTP and response-schema failures as unavailable for manual retry', async () => {
    const unavailable = createExternalServiceClient(
      'https://worker.test',
      vi.fn<typeof fetch>(async () => new Response('failure', { status: 502 })),
    )
    const invalid = createExternalServiceClient(
      'https://worker.test',
      vi.fn<typeof fetch>(async () => Response.json({ arbitrary: true })),
    )

    await expect(unavailable.nearbyStops(54.7, 25.3)).rejects.toThrow(
      'External service unavailable',
    )
    await expect(invalid.nearbyStops(54.7, 25.3)).rejects.toThrow(
      'External service unavailable',
    )
  })

  it('normalizes network failures and malformed route segments as unavailable', async () => {
    const network = createExternalServiceClient(
      'https://worker.test',
      vi.fn<typeof fetch>(async () => {
        throw new TypeError('offline')
      }),
    )
    const invalidRoute = createExternalServiceClient(
      'https://worker.test',
      vi.fn<typeof fetch>(async () =>
        Response.json([
          {
            durationSeconds: 60,
            startTime: '2026-09-07T07:59:00+03:00',
            endTime: '2026-09-07T08:00:00+03:00',
            segments: [{ mode: 7 }],
          },
        ]),
      ),
    )

    await expect(network.nearbyStops(54.7, 25.3)).rejects.toThrow(
      'External service unavailable',
    )
    await expect(
      invalidRoute.searchRoutes(
        { latitude: 54.7, longitude: 25.3 },
        { latitude: 54.71, longitude: 25.31 },
        '2026-09-07T08:00:00+03:00',
      ),
    ).rejects.toThrow('External service unavailable')
  })
})
