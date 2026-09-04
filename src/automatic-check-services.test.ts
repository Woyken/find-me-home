import { describe, expect, it, vi } from 'vitest'
import { createBrowserAutomaticCheckServices } from './automatic-check-services'

describe('browser Automatic Check service contracts', () => {
  it('routes to the configured city-centre coordinates', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith('/trafi/route-search'))
        return Response.json([])
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

  it('queries heritage points within 100 m and territories by intersection', async () => {
    const previousFetch = globalThis.fetch
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.includes('/inspire/'))
        return Response.json({ flag: false, detail: 'not mapped' })
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
