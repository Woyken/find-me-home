import { describe, expect, it, vi } from 'vitest'
import { createNoiseService } from './noise-service'

describe('browser noise service', () => {
  it('uses direct Vilnius noise bands without calling INSPIRE transport noise', async () => {
    const transport = vi.fn()
    const fetcher = vi.fn<typeof fetch>(async (input) =>
      String(input).includes('/9/query?')
        ? Response.json({ features: [{ attributes: { TRIUKSM: '65-69' } }] })
        : Response.json({ features: [] }),
    )

    await expect(
      createNoiseService(transport, fetcher)(54.7, 25.3),
    ).resolves.toEqual({
      mode: 'city-band',
      bands: [{ kind: 'railway', band: '65-69', ldenLow: 65 }],
      ldenLow: 65,
    })
    expect(transport).not.toHaveBeenCalled()
  })

  it('combines outside-city transport distances with the local airport model', async () => {
    const result = await createNoiseService(
      vi.fn(async () => ({
        railwayDistanceMeters: 120,
        majorRoadDistanceMeters: null,
      })),
      vi.fn<typeof fetch>(async () => Response.json({ features: [] })),
    )(55, 25.3)

    expect(result).toEqual({
      mode: 'proxy-warn',
      sources: [{ kind: 'railway', distanceMeters: 120 }],
    })
  })
})
