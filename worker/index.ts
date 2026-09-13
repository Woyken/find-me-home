import { handleRequest } from './regia'
import { handleInspireRequest } from './inspire'
import { handleTrafiRequest } from './trafi'
import { handleCrimeRequest } from './crime'
import { handleGoogleRoutesRequest } from './google-routes'
import type { WorkerOptions } from './request'

interface Env {
  PRODUCTION_ORIGIN: string
  GOOGLE_ROUTES_API_KEY?: string
}

export const handleWorkerRequest = (request: Request, options: WorkerOptions) => {
  const pathname = new URL(request.url).pathname
  if (pathname.startsWith('/inspire/')) return handleInspireRequest(request, options)
  if (pathname.startsWith('/trafi/')) return handleTrafiRequest(request, options)
  if (pathname.startsWith('/crime/')) return handleCrimeRequest(request, options)
  if (pathname.startsWith('/google/')) return handleGoogleRoutesRequest(request, options)
  return handleRequest(request, options)
}

export default {
  fetch(request: Request, env: Env) {
    return handleWorkerRequest(request, {
      productionOrigin: env.PRODUCTION_ORIGIN,
      googleRoutesApiKey: env.GOOGLE_ROUTES_API_KEY,
    })
  },
}
