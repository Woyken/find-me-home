import { describe, expect, it, vi } from 'vitest'
import { createBrowserAutomaticCheckServices } from './automatic-check-services'

describe('browser Automatic Check service contracts', () => {
  it('routes to the configured city-centre coordinates', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith('/trafi/route-search')) return Response.json([])
      return Response.json({ features: [] })
    })
    const services = createBrowserAutomaticCheckServices({
      workerUrl: 'https://worker.example',
      fetcher,
      now: () => new Date('2026-09-04T10:00:00Z'),
    })

    await services.cityCentreCommute!(54.7, 25.3)

    const routeCall = fetcher.mock.calls.find(([input]) =>
      String(input).endsWith('/trafi/route-search'),
    )
    expect(JSON.parse(String(routeCall?.[1]?.body))).toMatchObject({
      start: { latitude: 54.7, longitude: 25.3 },
      end: { latitude: 54.6856478, longitude: 25.2869905 },
      arriveBy: '2026-09-07T08:00:00+03:00',
    })
  })

  it('returns the quickest city and regional options with their actual boarding walks', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      if (!String(input).endsWith('/trafi/route-search')) return Response.json({ features: [] })
      return Response.json([
        {
          durationSeconds: 2_400,
          startTime: '2026-09-07T07:20:00+03:00',
          endTime: '2026-09-07T08:00:00+03:00',
          segments: [
            {
              mode: 'WALKING',
              durationSeconds: 300,
              startName: 'Plot',
              endName: 'City stop',
            },
            {
              mode: 'TRANSIT',
              name: '4G',
              startName: 'City stop',
              transportGroup: 'city',
              transportType: 'bus',
            },
          ],
        },
        {
          durationSeconds: 2_100,
          startTime: '2026-09-07T07:25:00+03:00',
          endTime: '2026-09-07T08:00:00+03:00',
          segments: [
            {
              mode: 'WALKING',
              durationSeconds: 720,
              endName: 'Regional stop',
            },
            {
              mode: 'TRANSIT',
              name: '101',
              startName: 'Regional stop',
              transportGroup: 'suburban',
              transportType: 'districtbus',
            },
          ],
        },
        {
          durationSeconds: 1_800,
          startTime: '2026-09-07T07:30:00+03:00',
          endTime: '2026-09-07T08:00:00+03:00',
          segments: [
            {
              mode: 'WALKING',
              durationSeconds: 60,
              endName: 'City feeder stop',
            },
            {
              mode: 'TRANSIT',
              name: '49',
              startName: 'City feeder stop',
              transportGroup: 'city',
              transportType: 'bus',
            },
            {
              mode: 'TRANSIT',
              name: '101',
              startName: 'Regional transfer stop',
              transportGroup: 'suburban',
              transportType: 'districtbus',
            },
          ],
        },
      ])
    })
    const services = createBrowserAutomaticCheckServices({
      workerUrl: 'https://worker.example',
      fetcher,
      now: () => new Date('2026-09-04T10:00:00Z'),
    })

    const result = await services.cityCentreCommute!(54.7, 25.3)

    expect(result.options).toEqual([
      {
        service: 'city',
        durationSeconds: 2_400,
        walkDurationSeconds: 300,
        stopName: 'City stop',
        summary: 'walk → 4G',
      },
      {
        service: 'regional',
        durationSeconds: 2_100,
        walkDurationSeconds: 720,
        stopName: 'Regional stop',
        summary: 'walk → 101',
      },
    ])
  })

  it('queries heritage points within 100 m and territories by intersection', async () => {
    const previousFetch = globalThis.fetch
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.includes('/inspire/')) return Response.json({ flag: false, detail: 'not mapped' })
      return Response.json({ features: [] })
    })
    globalThis.fetch = fetcher
    try {
      await createBrowserAutomaticCheckServices().legalFlags(54.7, 25.3)
      const urls = fetcher.mock.calls.map(([input]) => String(input))
      const pointUrl = urls.find((url) => url.includes(`${'/0/query'}?`))
      const territoryUrl = urls.find((url) => url.includes(`${'/1/query'}?`))
      expect(pointUrl).toContain('distance=100')
      expect(pointUrl).toContain('units=esriSRUnit_Meter')
      expect(territoryUrl).not.toContain('distance=')
    } finally {
      globalThis.fetch = previousFetch
    }
  })
})
