import { describe, expect, it } from 'vitest'
import { effectivePlotFacts } from './plot-facts'

describe('Effective Plot Facts', () => {
  it('uses confirmed Registered Parcel Facts where they are present', () => {
    expect(
      effectivePlotFacts({
        areaAres: 10,
        purposeText: 'Household purpose',
        registeredParcelMatch: 'confirmed',
        registeredParcelAreaAres: 12.5,
        registeredParcelPurposeText: 'Registry purpose',
      }),
    ).toEqual({
      areaAres: 12.5,
      areaSource: 'registry',
      purposeText: 'Registry purpose',
      purposeSource: 'registry',
    })
  })

  it('keeps household facts for provisional or absent Registered Parcel Facts', () => {
    expect(
      effectivePlotFacts({
        areaAres: 10,
        purposeText: 'Household purpose',
        registeredParcelMatch: 'provisional',
        registeredParcelAreaAres: 12.5,
        registeredParcelPurposeText: 'Registry purpose',
      }),
    ).toMatchObject({ areaAres: 10, areaSource: 'household', purposeSource: 'household' })
  })
})
