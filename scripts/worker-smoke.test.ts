import { describe, expect, it, vi } from 'vitest'
import { smokeWorker } from './worker-smoke'

const endpoint =
  'https://find-me-home-operations.karolis-uzkuraitis.workers.dev'
const productionOrigin = 'https://woyken.github.io'

describe('production Worker smoke checks', () => {
  it('rejects a bare or non-HTTPS endpoint before making requests', async () => {
    const fetcher = vi.fn<typeof fetch>()
    await expect(
      smokeWorker({
        endpoint: 'find-me-home-operations.example.workers.dev',
        productionOrigin,
        fetch: fetcher,
      }),
    ).rejects.toThrow('production Worker HTTPS')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('verifies CORS, input validation, fixed routing, and a live operation', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input))
      const origin = new Headers(init?.headers).get('Origin')

      if (url.pathname === '/trafi/route-search' && init?.method === 'OPTIONS')
        return new Response(null, {
          status: origin === productionOrigin ? 204 : 403,
          headers:
            origin === productionOrigin
              ? {
                  'Access-Control-Allow-Origin': productionOrigin,
                  'Access-Control-Allow-Methods': 'POST, OPTIONS',
                }
              : undefined,
        })
      if (url.pathname === '/crime/density')
        return Response.json(
          { error: 'Invalid coordinates' },
          { status: 400, headers: { 'Access-Control-Allow-Origin': origin! } },
        )
      if (url.pathname === '/proxy')
        return new Response('Not found', { status: 404 })
      if (url.pathname === '/trafi/route-search')
        return Response.json(
          { error: 'Trafi unavailable' },
          { status: 502, headers: { 'Access-Control-Allow-Origin': origin! } },
        )
      return Response.json([], {
        headers: { 'Access-Control-Allow-Origin': origin! },
      })
    })

    await expect(
      smokeWorker({ endpoint, productionOrigin, fetch: fetcher }),
    ).resolves.toEqual([
      'allowed-origin preflight',
      'foreign-origin rejection',
      'valid operation',
      'invalid-input rejection',
      'fixed-upstream enforcement',
      'upstream-failure mapping',
    ])
  })

  it('fails when the deployed boundary grants a foreign origin', async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      const origin = new Headers(init?.headers).get('Origin')
      return new Response(null, {
        status: origin === productionOrigin ? 204 : 200,
        headers: {
          'Access-Control-Allow-Origin': origin ?? '',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
        },
      })
    })
    await expect(
      smokeWorker({
        endpoint,
        productionOrigin,
        fetch: fetcher,
      }),
    ).rejects.toThrow('foreign-origin rejection')
  })
})
