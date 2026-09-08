import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const root = process.cwd()
const clientDirectory = path.join(root, 'dist/client')

beforeAll(() => {
  execFileSync('pnpm', ['build'], {
    cwd: root,
    env: {
      ...process.env,
      GITHUB_ACTIONS: 'true',
      GITHUB_REPOSITORY: 'Woyken/find-me-home',
      VITE_WORKER_URL: 'https://find-me-home-operations.karolis-uzkuraitis.workers.dev',
    },
    stdio: 'pipe',
  })
}, 120_000)

describe('production Pages artifact', () => {
  it('is an installable repository-scoped Find Me Home app', () => {
    const index = readFileSync(path.join(clientDirectory, 'index.html'), 'utf8')
    const manifest = JSON.parse(
      readFileSync(path.join(clientDirectory, 'manifest.webmanifest'), 'utf8'),
    ) as {
      name: string
      short_name: string
      start_url: string
      scope: string
      icons: Array<{ src: string; purpose?: string }>
    }

    expect(index).toContain('href="/find-me-home/manifest.webmanifest"')
    expect(index).toContain('name="theme-color"')
    expect(manifest).toMatchObject({
      name: 'Find Me Home',
      short_name: 'Find Me Home',
      start_url: '/find-me-home/',
      scope: '/find-me-home/',
    })
    expect(manifest.icons.some(({ purpose }) => purpose === 'any maskable')).toBe(true)
    for (const icon of manifest.icons) {
      expect(readFileSync(path.join(clientDirectory, icon.src))).not.toHaveLength(0)
    }
  })

  it('reloads history routes and retains invitation or import fragments', () => {
    const index = readFileSync(path.join(clientDirectory, 'index.html'), 'utf8')
    const fallback = readFileSync(path.join(clientDirectory, '404.html'), 'utf8')

    expect(fallback).toBe(index)
    expect(fallback).not.toContain('location.hash =')
    expect(fallback).not.toContain('location.replace(')
  })

  it('precaches only the versioned app shell and serves navigation offline', () => {
    const serviceWorker = readFileSync(path.join(clientDirectory, 'service-worker.js'), 'utf8')

    expect(serviceWorker).toMatch(/find-me-home-shell-[a-f0-9]+/)
    expect(serviceWorker).toContain("caches.match('/find-me-home/index.html')")
    expect(serviceWorker).toContain('/find-me-home/manifest.webmanifest')
    expect(serviceWorker).not.toContain('/find-me-home/parcels/')
    expect(serviceWorker).not.toContain('tile.openstreetmap.org')
    expect(serviceWorker).not.toContain('workers.dev')
  })

  it('keeps the normal entry fail-closed while shipping a lazy gated E2E chunk', () => {
    const index = readFileSync(path.join(clientDirectory, 'index.html'), 'utf8')
    const serviceWorker = readFileSync(path.join(clientDirectory, 'service-worker.js'), 'utf8')
    const bookmarklet = readFileSync(path.join(clientDirectory, 'aruodas-bookmarklet.js'), 'utf8')
    const appAssetFiles = readdirSync(path.join(clientDirectory, 'assets')).filter((file) =>
      file.endsWith('.js'),
    )
    const appAssetContents = appAssetFiles.map((file) =>
      readFileSync(path.join(clientDirectory, 'assets', file), 'utf8'),
    )

    expect(index).toContain('/find-me-home/assets/')
    expect(index).not.toContain('__FMH_E2E__')
    expect(appAssetContents.filter((asset) => asset.includes('__FMH_E2E__'))).toHaveLength(1)
    expect(appAssetContents.some((asset) => /import\(`\.\/bootstrap-/.test(asset))).toBe(true)
    expect(appAssetContents.some((asset) => asset.includes('find-me-home-e2e-device-'))).toBe(true)
    expect(appAssetContents.some((asset) => asset.includes('find-me-home-e2e-shared-'))).toBe(true)
    expect(appAssetContents.some((asset) => asset.includes('find-me-home-device'))).toBe(true)
    expect(serviceWorker).toContain('/find-me-home/index.html')
    expect(serviceWorker).not.toContain('__FMH_E2E__')
    expect(bookmarklet).toContain('__fmhAppUrl')
    expect(bookmarklet).not.toContain('__FMH_E2E__')
  })

  it('contains no application server or SQLite runtime', () => {
    expect(() => readdirSync(path.join(root, 'dist/server'))).toThrow()

    const packageJson = readFileSync(path.join(root, 'package.json'), 'utf8')
    const workspace = readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8')
    expect(packageJson).not.toContain('better-sqlite3')
    expect(workspace).not.toContain('better-sqlite3')
    expect(packageJson).not.toContain('@solidjs/start')
  })
})
