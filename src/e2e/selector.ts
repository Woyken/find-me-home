export const e2eStorageKey = 'find-me-home-e2e-enabled'

/** E2E is test tooling, not an access-control boundary. */
export const shouldBootE2e = (mode: string, storage: Storage = sessionStorage) =>
  mode === 'e2e' || storage.getItem(e2eStorageKey) === 'true'

export const e2eInitializerPath = () =>
  `${import.meta.env.BASE_URL.replace(/\/$/, '')}/initialize-e2e-storage`

export const e2eReturnPath = (value: string | null) => {
  const base = new URL(import.meta.env.BASE_URL, location.origin)
  const basePath = base.pathname.replace(/\/$/, '') || '/'
  if (!value?.startsWith('/')) return base.pathname
  const target = new URL(value, location.origin)
  const withinBase =
    basePath === '/' || target.pathname === basePath || target.pathname.startsWith(`${basePath}/`)
  return target.origin === location.origin && withinBase
    ? `${target.pathname}${target.search}${target.hash}`
    : base.pathname
}
