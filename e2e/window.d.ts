import type { E2eApi } from '../src/e2e/support'

declare global {
  interface Window {
    /** Present only with local E2E mode or after the test initializer runs. */
    __FMH_E2E__?: E2eApi
    /** Set by the bookmarklet loader before it injects the scraper. */
    __fmhAppUrl?: string
  }
}

export {}
