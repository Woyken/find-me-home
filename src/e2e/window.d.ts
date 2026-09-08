import type { E2eApi } from './support'

declare global {
  interface Window {
    /** Present only when Vite is started or built with `--mode e2e`. */
    __FMH_E2E__: E2eApi
    /** Set by the bookmarklet loader before it injects the scraper. */
    __fmhAppUrl?: string
  }
}

export {}
