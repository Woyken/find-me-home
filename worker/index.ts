import { handleRequest } from './regia'
import { handleInspireRequest } from './inspire'
import { handleTrafiRequest } from './trafi'
import { handleCrimeRequest } from './crime'
import type { WorkerOptions } from './request'

interface Env {
  PRODUCTION_ORIGIN: string
}

export const handleWorkerRequest = (
  request: Request,
  options: WorkerOptions,
) => {
  const pathname = new URL(request.url).pathname
  if (pathname.startsWith('/inspire/'))
    return handleInspireRequest(request, options)
  if (pathname.startsWith('/trafi/'))
    return handleTrafiRequest(request, options)
  if (pathname.startsWith('/crime/'))
    return handleCrimeRequest(request, options)
  return handleRequest(request, options)
}

export default {
  fetch(request: Request, env: Env) {
    return handleWorkerRequest(request, {
      productionOrigin: env.PRODUCTION_ORIGIN,
    })
  },
}
