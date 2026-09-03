import { describe, expect, it, vi } from 'vitest'
import { handleRequest } from './regia'
import successFixture from '../src/test-fixtures/regia-success.json'
import noResultFixture from '../src/test-fixtures/regia-no-result.json'

describe('Regia Worker operation', () => {
  it('bootstraps and initializes each attempt, double-encodes normalized search, and retries once', async () => {
    let bootstrap = 0
    let search = 0
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/regia2')) {
        bootstrap += 1
        return new Response('', {
          headers: { 'Set-Cookie': `JSESSIONID=session-${bootstrap}; Path=/` },
        })
      }
      if (url.includes('/settings?')) return new Response('settings')
      search += 1
      if (search === 1) return Response.json(noResultFixture)
      return Response.json(successFixture)
    })
    const response = await handleRequest(
      new Request(
        'https://worker.test/regia/address-search?query=Up%C4%97s%207-oji%207',
        { headers: { Origin: 'https://woyken.github.io' } },
      ),
      { productionOrigin: 'https://woyken.github.io', fetch: fetcher },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      expect.objectContaining({ address: 'Upės g. 7 - Vilnius' }),
    ])
    expect(bootstrap).toBe(2)
    expect(
      fetcher.mock.calls.filter(([url]) => String(url).includes('/settings?')),
    ).toHaveLength(2)
    expect(
      fetcher.mock.calls.filter(([url]) =>
        String(url).includes('/search/'),
      )[0][0],
    ).toContain('query=Up%25C4%2597s%25207%2520oji%25207')
  })

  it('maps an upstream failure to unavailable instead of no result', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/regia2'))
        return new Response('', {
          headers: { 'Set-Cookie': 'JSESSIONID=session; Path=/' },
        })
      if (url.includes('/settings?')) return new Response('settings')
      return new Response('failure', { status: 503 })
    })
    const response = await handleRequest(
      new Request(
        'https://worker.test/regia/address-search?query=Up%C4%97s%20g.%207',
        { headers: { Origin: 'https://woyken.github.io' } },
      ),
      { productionOrigin: 'https://woyken.github.io', fetch: fetcher },
    )

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'Regia unavailable' })
  })

  it('rejects other origins and arbitrary operations without upstream requests', async () => {
    const fetcher = vi.fn()
    const forbidden = await handleRequest(
      new Request('https://worker.test/regia/address-search?query=test', {
        headers: { Origin: 'https://attacker.test' },
      }),
      { productionOrigin: 'https://woyken.github.io', fetch: fetcher },
    )
    const arbitrary = await handleRequest(
      new Request('https://worker.test/proxy?url=https://example.com', {
        headers: { Origin: 'https://woyken.github.io' },
      }),
      { productionOrigin: 'https://woyken.github.io', fetch: fetcher },
    )
    expect(forbidden.status).toBe(403)
    expect(arbitrary.status).toBe(404)
    expect(fetcher).not.toHaveBeenCalled()
  })
})
