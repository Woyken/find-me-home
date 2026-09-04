import { describe, expect, it, vi } from 'vitest'
import { createLivabilityService } from './livability-service'

describe('livability service', () => {
  it('returns nearest amenities and sorted bad neighbours from one query', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        elements: [
          {
            lat: 54.7,
            lon: 25.31,
            tags: { shop: 'supermarket', name: 'Shop' },
          },
          { center: { lat: 54.7, lon: 25.32 }, tags: { amenity: 'school' } },
          { lat: 54.7, lon: 25.301, tags: { landuse: 'industrial' } },
          { lat: 54.7, lon: 25.305, tags: { amenity: 'grave_yard' } },
        ],
      }),
    )

    const result = await createLivabilityService(fetcher)(54.7, 25.3)

    expect(fetcher).toHaveBeenCalledOnce()
    expect(result.shop?.name).toBe('Shop')
    expect(result.school).not.toBeNull()
    expect(result.badNeighbours.map((item) => item.kind)).toEqual([
      'industrial',
      'grave_yard',
    ])
  })

  it('rejects unavailable or malformed responses', async () => {
    await expect(
      createLivabilityService(async () => new Response(null, { status: 429 }))(
        54.7,
        25.3,
      ),
    ).rejects.toThrow('unavailable')
    await expect(
      createLivabilityService(async () => Response.json({}))(54.7, 25.3),
    ).rejects.toThrow('unavailable')
  })
})
