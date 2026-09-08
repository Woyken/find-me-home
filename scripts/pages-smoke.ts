const [pagesArgument, workerArgument] = process.argv.slice(2)
export {}

if (!pagesArgument || !workerArgument) {
  throw new Error('Usage: pnpm smoke:pages <pages-url> <worker-url>')
}

const pagesUrl = new URL(pagesArgument)
if (!pagesUrl.pathname.endsWith('/')) pagesUrl.pathname += '/'
const workerUrl = new URL(workerArgument)

async function expectOk(url: URL): Promise<Response> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} returned ${response.status}`)
  return response
}

const [
  home,
  directRoute,
  invitation,
  imported,
  manifestResponse,
  serviceWorker,
  parcels,
  bookmarkletScript,
] = await Promise.all([
  expectOk(new URL('.', pagesUrl)),
  fetch(new URL('visit-plan', pagesUrl)),
  fetch(
    new URL('#household=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', pagesUrl),
  ),
  fetch(new URL('#import=invalid', pagesUrl)),
  expectOk(new URL('manifest.webmanifest', pagesUrl)),
  expectOk(new URL('service-worker.js', pagesUrl)),
  expectOk(new URL('parcels/manifest.json', pagesUrl)),
  expectOk(new URL('aruodas-bookmarklet.js', pagesUrl)),
])

const [
  homeHtml,
  directRouteHtml,
  invitationHtml,
  importedHtml,
  manifest,
  serviceWorkerText,
  parcelManifest,
  bookmarkletScriptText,
] = await Promise.all([
  home.text(),
  directRoute.text(),
  invitation.text(),
  imported.text(),
  manifestResponse.json() as Promise<{ name?: string; scope?: string }>,
  serviceWorker.text(),
  parcels.json() as Promise<{
    datasetVersion?: string
    cells?: Record<string, { path: string }>
  }>,
  bookmarkletScript.text(),
])

if (
  bookmarkletScript.headers.get('access-control-allow-origin') !== '*' ||
  !bookmarkletScriptText.includes('#import=')
) {
  throw new Error(
    'Pages does not serve the Aruodas bookmarklet script for cross-origin loading',
  )
}

if (!homeHtml.includes('<title>Find Me Home</title>')) {
  throw new Error('Pages home does not contain the Find Me Home shell')
}
if (!directRouteHtml.includes('<title>Find Me Home</title>')) {
  throw new Error('Direct route reload does not return the application shell')
}
if (invitationHtml !== homeHtml || importedHtml !== homeHtml) {
  throw new Error('Invitation or import fragments do not retain the app shell')
}
if (manifest.name !== 'Find Me Home' || manifest.scope !== pagesUrl.pathname) {
  throw new Error(
    'Production manifest is not scoped to the Pages repository path',
  )
}
if (!serviceWorkerText.includes('find-me-home-shell-')) {
  throw new Error(
    'Production service worker does not contain a versioned shell',
  )
}
if (!parcelManifest.datasetVersion) {
  throw new Error('Production parcel manifest has no dataset version')
}
const firstParcelAsset = Object.values(parcelManifest.cells ?? {}).at(0)
if (firstParcelAsset === undefined)
  throw new Error('Production parcel manifest has no shards')
await expectOk(new URL(`parcels/${firstParcelAsset.path}`, pagesUrl))

const cors = await fetch(workerUrl, {
  method: 'OPTIONS',
  headers: {
    Origin: pagesUrl.origin,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type',
  },
})
if (cors.headers.get('access-control-allow-origin') !== pagesUrl.origin) {
  throw new Error('Production Worker does not allow the Pages origin')
}

const operation = await fetch(
  new URL('/trafi/nearby-stops?latitude=54.6872&longitude=25.2797', workerUrl),
  { headers: { Origin: pagesUrl.origin } },
)
if (
  !operation.ok ||
  operation.headers.get('access-control-allow-origin') !== pagesUrl.origin
) {
  throw new Error('Production Worker operation failed from the Pages origin')
}

console.log(
  `Verified ${pagesUrl}: routes, fragments, PWA shell, parcel ${parcelManifest.datasetVersion}, and Worker operation.`,
)
