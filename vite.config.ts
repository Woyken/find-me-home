import { defineConfig, transformWithEsbuild } from 'vite'
import tailwindcss from '@tailwindcss/vite'

import { tanstackStart } from '@tanstack/solid-start/plugin/vite'

import solidPlugin from 'vite-plugin-solid'
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
    const result = await transformWithEsbuild(
      fs.readFileSync(fileName, 'utf8'),
      fileName,
      {
        loader: 'ts',
        minify: true,
        target: 'es2022',
        format: 'iife',
      },
    )
    return `export const bookmarkletSource = ${JSON.stringify(result.code)}`
  },
})

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    bookmarkletPlugin(),
    tailwindcss(),
    tanstackStart({
      spa: {
        enabled: true,
      },
    }),
    solidPlugin({ ssr: true }),
  ],
})
