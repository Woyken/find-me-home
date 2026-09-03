import { describe, expect, it, vi } from 'vitest'
import { createBrowserAutomaticCheckServices } from './automatic-check-services'

describe('browser Automatic Check service contracts', () => {
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
