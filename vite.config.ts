import { defineConfig, transformWithOxc } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import solid from '@solidjs/vite-plugin'
import fs from 'node:fs'
import path from 'node:path'

const bookmarkletModuleId = 'virtual:aruodas-bookmarklet'
const resolvedBookmarkletModuleId = `\0${bookmarkletModuleId}`

const bookmarkletPlugin = () => ({
  name: 'aruodas-bookmarklet',
  resolveId(id: string) {
    return id === bookmarkletModuleId ? resolvedBookmarkletModuleId : undefined
  },
  async load(id: string) {
    if (id !== resolvedBookmarkletModuleId) return undefined
    const fileName = path.resolve('src/bookmarklet/aruodas.ts')
    const result = await transformWithOxc(
      fs.readFileSync(fileName, 'utf8'),
      fileName,
      {
        lang: 'ts',
      },
    )
    return `export const bookmarkletSource = ${JSON.stringify(result.code)}`
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
