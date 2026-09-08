import { describe, expect, it } from 'vitest'
import { e2eReturnPath, shouldBootE2e } from './selector'

describe('E2E initializer', () => {
  it('boots local E2E mode or an initialized browser tab only', () => {
    const storage = new Map<string, string>()
    const session = { getItem: (key: string) => storage.get(key) ?? null } as Storage
    expect(shouldBootE2e('e2e', session)).toBe(true)
    expect(shouldBootE2e('production', session)).toBe(false)
    storage.set('find-me-home-e2e-enabled', 'true')
    expect(shouldBootE2e('production', session)).toBe(true)
  })

  it('accepts only same-origin paths inside the application base path', () => {
    expect(e2eReturnPath('/visit-plan')).toBe('/visit-plan')
    expect(e2eReturnPath('https://example.com')).toBe('/')
    expect(e2eReturnPath('//example.com')).toBe('/')
    expect(e2eReturnPath('/outside')).toBe('/outside')
  })
})
