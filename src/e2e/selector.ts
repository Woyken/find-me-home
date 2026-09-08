const namespacePattern = /^[A-Za-z0-9_-]{1,80}$/

/** E2E is an explicit, browser-local test selector, never an access control boundary. */
export const e2eNamespace = (search: string): string | undefined => {
  const value = new URLSearchParams(search).get('e2e')
  return value && namespacePattern.test(value) ? value : undefined
}

export const shouldBootE2e = (mode: string, search: string) =>
  mode === 'e2e' || e2eNamespace(search) !== undefined
