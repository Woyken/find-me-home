import { handleRequest } from './regia'

interface Env {
  PRODUCTION_ORIGIN: string
}

export default {
  fetch(request: Request, env: Env) {
    return handleRequest(request, { productionOrigin: env.PRODUCTION_ORIGIN })
  },
}
