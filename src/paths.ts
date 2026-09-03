const base = import.meta.env.BASE_URL.replace(/\/$/, '')

export const paths = {
  home: `${base}/`,
  visitPlan: `${base}/visit-plan`,
  importInbox: `${base}/import-inbox`,
  sourceListing: (id: string | number) =>
    `${base}/source-listings/${encodeURIComponent(id)}`,
} as const
