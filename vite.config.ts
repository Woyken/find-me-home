import { defineConfig, transformWithOxc } from 'vite'
import type { Plugin } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import solid from '@solidjs/vite-plugin'
import fs from 'node:fs'
import path from 'node:path'

const bookmarkletModuleId = 'virtual:aruodas-bookmarklet'
const resolvedBookmarkletModuleId = `\0${bookmarkletModuleId}`
const bookmarkletFileName = 'aruodas-bookmarklet.js'
const bookmarkletSourceFile = path.resolve('src/bookmarklet/aruodas.ts')

/** The scraper compiled to plain JS, wrapped so it can be loaded as a classic
 * script tag repeatedly without leaking or redeclaring globals. */
const compileBookmarklet = async () => {
  const result = await transformWithOxc(
    fs.readFileSync(bookmarkletSourceFile, 'utf8'),
    bookmarkletSourceFile,
    { lang: 'ts' },
  )
  return `(() => {\n${result.code}\n})()\n`
}

const bookmarkletPlugin = (): Plugin => ({
  name: 'aruodas-bookmarklet',
  resolveId(id) {
    return id === bookmarkletModuleId ? resolvedBookmarkletModuleId : undefined
  },
  async load(id) {
    if (id !== resolvedBookmarkletModuleId) return undefined
    return `export const bookmarkletSource = ${JSON.stringify(await compileBookmarklet())}`
  },
  async generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: bookmarkletFileName,
      source: await compileBookmarklet(),
    })
  },
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const pathname = request.url?.split('?')[0]
      if (pathname !== `${server.config.base}${bookmarkletFileName}`) {
        return next()
      }
      response.setHeader('Content-Type', 'text/javascript; charset=utf-8')
      response.setHeader('Access-Control-Allow-Origin', '*')
      response.end(await compileBookmarklet())
    })
  },
})

export default defineConfig({
  base:
    process.env.GITHUB_ACTIONS === 'true'
      ? `/${process.env.GITHUB_REPOSITORY?.split('/')[1] ?? ''}/`
      : '/',
  resolve: { tsconfigPaths: true },
  plugins: [bookmarkletPlugin(), tailwindcss(), solid()],
  build: { outDir: 'dist/client' },
  server: { port: 3000 },
})
