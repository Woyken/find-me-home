const base = import.meta.env.BASE_URL.replace(/\/$/, '')

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
  home: `${base}${routes.home}`,
  visitPlan: `${base}${routes.visitPlan}`,
  importInbox: `${base}${routes.importInbox}`,
  sourceListing: (id: string | number) => `${base}${routes.sourceListing(id)}`,
} as const
