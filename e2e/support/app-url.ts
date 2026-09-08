const port = Number(process.env.PLAYWRIGHT_WEB_SERVER_PORT ?? 3000)
const configuredBaseURL =
  process.env.PLAYWRIGHT_BASE_URL ??
  new URL(process.env.E2E_BASE_PATH ?? '/', `http://127.0.0.1:${port}`).href

export const appBaseUrl = new URL(
  configuredBaseURL.endsWith('/') ? configuredBaseURL : `${configuredBaseURL}/`,
)

/** Resolves a route or asset inside the application deployment's base path. */
export const appUrl = (path = '') => new URL(path.replace(/^\//, ''), appBaseUrl).href

export const appOrigin = appBaseUrl.origin
export const appPath = (path = '') => new URL(appUrl(path)).pathname

export const appPathPattern = (path = '') => {
  const pathname = appPath(path).replace(/\/$/, '')
  return new RegExp(`${pathname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$`)
}
