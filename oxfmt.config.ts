import { defineConfig } from 'oxfmt'

export default defineConfig({
  semi: false,
  singleQuote: true,
  trailingComma: 'all',
  ignorePatterns: [
    '.agents/',
    '.cta.json',
    'AGENTS.md',
    'dist/',
    'public/parcels/',
    'pnpm-lock.yaml',
    'test-results/',
  ],
})
