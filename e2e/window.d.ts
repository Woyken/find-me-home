import type { E2eApi } from '../src/e2e/support'

declare global {
  interface Window {
    /** Present only with local E2E mode or an explicit valid `?e2e=` namespace. */
    __FMH_E2E__?: E2eApi
    /** Set by the bookmarklet loader before it injects the scraper. */
    __fmhAppUrl?: string
  }
}

export {}
