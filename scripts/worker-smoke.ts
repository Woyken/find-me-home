import { validateWorkerEndpoint } from './verify-worker-build.ts'

interface SmokeWorkerOptions {
  endpoint: string
  productionOrigin: string
  fetch?: typeof fetch
}

const assertCheck = (condition: boolean, check: string, detail: string) => {
  if (!condition) throw new Error(`${check} failed: ${detail}`)
}

export const smokeWorker = async ({
  endpoint,
  productionOrigin,
  fetch: fetcher = fetch,
}: SmokeWorkerOptions) => {
  const baseUrl = validateWorkerEndpoint(endpoint)
  const checks: string[] = []
  const check = async (
    name: string,
    path: string,
    init: RequestInit,
    verify: (response: Response) => boolean,
  ) => {
    const response = await fetcher(`${baseUrl}${path}`, init)
    assertCheck(verify(response), name, `unexpected HTTP ${response.status}`)
    checks.push(name)
  }

  await check(
    'allowed-origin preflight',
    '/trafi/route-search',
    {
      method: 'OPTIONS',
      headers: {
        Origin: productionOrigin,
        'Access-Control-Request-Method': 'POST',
      },
    },
    (response) =>
      response.status === 204 &&
      response.headers.get('Access-Control-Allow-Origin') ===
        productionOrigin &&
      response.headers.get('Access-Control-Allow-Methods')?.includes('POST') ===
        true,
  )
  await check(
    'foreign-origin rejection',
    '/trafi/route-search',
    {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://attacker.invalid',
        'Access-Control-Request-Method': 'POST',
      },
    },
    (response) =>
      response.status === 403 &&
      !response.headers.has('Access-Control-Allow-Origin'),
  )
  await check(
    'valid operation',
    '/trafi/nearby-stops?latitude=54.6872&longitude=25.2797',
    { headers: { Origin: productionOrigin } },
    (response) =>
      response.status === 200 &&
      response.headers.get('Access-Control-Allow-Origin') === productionOrigin,
  )
  await check(
    'invalid-input rejection',
    '/crime/density?latitude=200&longitude=25.3',
    { headers: { Origin: productionOrigin } },
    (response) => response.status === 400,
  )
  await check(
    'fixed-upstream enforcement',
    '/trafi/nearby-stops?latitude=54.6872&longitude=25.2797&url=https%3A%2F%2Fattacker.invalid',
    { headers: { Origin: productionOrigin } },
    (response) => response.status === 200,
  )
  await check(
    'upstream-failure mapping',
    '/trafi/route-search',
    {
      method: 'POST',
      headers: { Origin: productionOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start: { latitude: 90, longitude: 180 },
        end: { latitude: -90, longitude: -180 },
        arriveBy: '9999-12-31T23:59:59Z',
        url: 'https://attacker.invalid',
      }),
    },
    (response) =>
      response.status === 502 &&
      response.headers.get('Access-Control-Allow-Origin') === productionOrigin,
  )

  return checks
}

const isMain = process.argv[1]?.endsWith('/worker-smoke.ts')
if (isMain) {
  const endpoint = process.argv[2]
  const productionOrigin = process.argv[3] ?? 'https://woyken.github.io'
  if (!endpoint)
    throw new Error('Usage: pnpm smoke:worker -- <endpoint> [origin]')
  const checks = await smokeWorker({ endpoint, productionOrigin })
  for (const check of checks) console.log(`PASS ${check}`)
}
