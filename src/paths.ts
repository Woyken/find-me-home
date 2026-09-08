import { e2eNamespace } from './e2e/selector'

const base = import.meta.env.BASE_URL.replace(/\/$/, '')
const e2e = typeof window === 'undefined' ? undefined : e2eNamespace(window.location.search)
const query = e2e ? `?e2e=${e2e}` : ''

/**
 * Router-relative paths, for `navigate()` and `<A>`: the router is created
 * with `base`, so it prepends BASE_URL itself.
 */
export const routes = {
  home: '/',
  visitPlan: '/visit-plan',
  importInbox: '/import-inbox',
  sourceListing: (id: string | number) => `/source-listings/${encodeURIComponent(id)}`,
} as const

/** Full hrefs, for plain `<a href>` and `window.location`. */
export const paths = {
  home: `${base}${routes.home}${query}`,
  visitPlan: `${base}${routes.visitPlan}${query}`,
  importInbox: `${base}${routes.importInbox}${query}`,
  sourceListing: (id: string | number) => `${base}${routes.sourceListing(id)}${query}`,
} as const
