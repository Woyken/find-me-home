import { handleRequest } from './regia'
import { handleInspireRequest } from './inspire'

interface Env {
  PRODUCTION_ORIGIN: string
}

export const handleWorkerRequest = (
  request: Request,
  options: { productionOrigin: string; fetch?: typeof fetch },
) =>
  new URL(request.url).pathname.startsWith('/inspire/')
    ? handleInspireRequest(request, options)
    : handleRequest(request, options)

export default {
  fetch(request: Request, env: Env) {
    return handleWorkerRequest(request, {
      productionOrigin: env.PRODUCTION_ORIGIN,
    })
  },
}
