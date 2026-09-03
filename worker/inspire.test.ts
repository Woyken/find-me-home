import { describe, expect, it, vi } from 'vitest'
import { handleWorkerRequest } from './index'
import protectedFixture from '../src/test-fixtures/inspire-protected-area.json'
import noResultFixture from '../src/test-fixtures/inspire-no-result.json'

const request = (path: string) =>
  new Request(`https://worker.test${path}`, {
    headers: { Origin: 'https://woyken.github.io' },
  })

const options = (fetcher: typeof fetch) => ({
  productionOrigin: 'https://woyken.github.io',
  fetch: fetcher,
})

describe('INSPIRE Worker operations', () => {
  it('queries every fixed protected-area layer with EPSG:4258 axis order', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(protectedFixture),
    )
    const response = await handleWorkerRequest(
      request('/inspire/protected-area?latitude=54.7&longitude=25.3'),
      options(fetcher),
    )

    expect(await response.json()).toEqual({
      flag: true,
      detail: 'inside protected area: Neries regioninis parkas',
    })
    expect(fetcher).toHaveBeenCalledTimes(3)
    for (const [input] of fetcher.mock.calls) {
      const url = decodeURIComponent(String(input))
      expect(url).toContain('inspire-geoportal.lt/geoserver/ps/wfs?')
      expect(url.replaceAll('+', ' ')).toContain(
        'INTERSECTS(geometry,POINT(54.7 25.3))',
      )
    }
  })

  it('normalizes flood no-result and upstream failure independently', async () => {
    const noResult = await handleWorkerRequest(
      request('/inspire/flood?latitude=54.7&longitude=25.3'),
      options(vi.fn<typeof fetch>(async () => Response.json(noResultFixture))),
    )
    const unavailable = await handleWorkerRequest(
      request('/inspire/flood?latitude=54.7&longitude=25.3'),
      options(
        vi.fn<typeof fetch>(
          async () => new Response('failure', { status: 503 }),
        ),
      ),
    )
    expect(await noResult.json()).toEqual({
      flag: false,
      detail: 'not inside a mapped flood-hazard zone',
    })
    expect(unavailable.status).toBe(502)
    expect(await unavailable.json()).toEqual({ error: 'INSPIRE unavailable' })
  })

  it('rejects invalid coordinates without calling an upstream', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const response = await handleWorkerRequest(
      request('/inspire/flood?latitude=200&longitude=25.3'),
      options(fetcher),
    )
    expect(response.status).toBe(400)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects missing coordinates without calling an upstream', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const response = await handleWorkerRequest(
      request('/inspire/flood?longitude=25.3'),
      options(fetcher),
    )
    expect(response.status).toBe(400)
    expect(fetcher).not.toHaveBeenCalled()
  })
})
