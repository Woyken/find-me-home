import { describe, expect, it } from 'vitest'
import { e2eNamespace, shouldBootE2e } from './selector'

describe('E2E entry selector', () => {
  it('accepts only an explicit safe namespace', () => {
    expect(e2eNamespace('?e2e=run_42-alpha')).toBe('run_42-alpha')
    expect(e2eNamespace('?e2e=')).toBeUndefined()
    expect(e2eNamespace('?e2e=not%20safe')).toBeUndefined()
    expect(e2eNamespace('?e2e=../../../normal-db')).toBeUndefined()
    expect(e2eNamespace(`?e2e=${'a'.repeat(81)}`)).toBeUndefined()
  })

  it('keeps local e2e mode while production requires the selector', () => {
    expect(shouldBootE2e('e2e', '')).toBe(true)
    expect(shouldBootE2e('production', '?e2e=run-42')).toBe(true)
    expect(shouldBootE2e('production', '')).toBe(false)
    expect(shouldBootE2e('production', '?e2e=not safe')).toBe(false)
  })
})
