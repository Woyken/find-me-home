import { describe, expect, it } from 'vitest'
import { isParcelAreaCompatible } from './boundaries'

describe('isParcelAreaCompatible', () => {
  it('accepts a registered parcel within the 20% area tolerance', () => {
    expect(isParcelAreaCompatible(15, 1_800)).toBe(true)
    expect(isParcelAreaCompatible(15, 1_801)).toBe(false)
  })

  it('rejects a substantially different parcel area', () => {
    expect(isParcelAreaCompatible(15, 8_364)).toBe(false)
  })

  it('does not block resolution when the listing area is unavailable', () => {
    expect(isParcelAreaCompatible(null, 8_364)).toBe(true)
  })
})
