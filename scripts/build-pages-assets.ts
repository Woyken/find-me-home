import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const base =
  process.env.GITHUB_ACTIONS === 'true'
    ? `/${process.env.GITHUB_REPOSITORY?.split('/')[1] ?? ''}/`
    : '/'
const outputDirectory = path.resolve('dist/client')
fs.rmSync(path.resolve('dist/server'), { recursive: true, force: true })
const index = fs.readFileSync(path.join(outputDirectory, 'index.html'))
fs.writeFileSync(path.join(outputDirectory, '404.html'), index)

const manifest = {
  name: 'Find Me Home',
  short_name: 'Find Me Home',
  description: 'Plan a home search together, directly from your devices.',
  start_url: base,
  scope: base,
  display: 'standalone',
  theme_color: '#1b2733',
  background_color: '#eef3ec',
  icons: [
    {
      src: 'icon.svg',
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'any maskable',
    },
  ],
}
fs.writeFileSync(
  path.join(outputDirectory, 'manifest.webmanifest'),
  JSON.stringify(manifest, null, 2),
)

const shellFiles = [
  'index.html',
  'manifest.webmanifest',
  'icon.svg',
  ...fs
    .readdirSync(path.join(outputDirectory, 'assets'))
    .filter((file) => /\.(?:css|js)$/.test(file))
    .map((file) => `assets/${file}`),
  ...fs
    .readdirSync(path.join(outputDirectory, 'fonts'))
    .filter((file) => file.endsWith('.woff2'))
    .map((file) => `fonts/${file}`),
]
const shellVersion = createHash('sha256')
  .update(index)
  .update(JSON.stringify(shellFiles))
  .digest('hex')
  .slice(0, 12)
const urls = shellFiles.map((file) => `${base}${file}`)
const serviceWorker = `const CACHE = 'find-me-home-shell-${shellVersion}'
const SHELL = ${JSON.stringify(urls)}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('${base}index.html')))
    return
  }
  const url = new URL(event.request.url)
  if (url.origin === self.location.origin && SHELL.includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)))
  }
})
`
fs.writeFileSync(path.join(outputDirectory, 'service-worker.js'), serviceWorker)
