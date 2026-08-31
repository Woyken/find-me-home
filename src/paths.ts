export const paths = {
  home: '/',
  visitPlan: '/visit-plan',
  sourceListing: (id: number) => `/source-listings/${id}`,
  importDraft: (token: string) => `/imports/${encodeURIComponent(token)}`,
} as const
