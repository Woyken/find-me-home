import { describe, expect, it } from 'vitest'
import { chooseImportedLocationClue } from './location-clue'

describe('imported Recorded Location Clues', () => {
  it('preserves every imported clue while choosing the highest-priority one', () => {
    expect(
      chooseImportedLocationClue({
        uniqueRegistryNumber: '4400-1234-5678',
        latitude: 54.8,
        longitude: 25.2,
        address: 'Upės g. 7',
        precision: 'exact',
      }),
    ).toEqual({
      kind: 'registry',
      parcelNumberClue: '4400-1234-5678',
      latitudeClue: 54.8,
      longitudeClue: 25.2,
      coordinateCluePrecision: 'exact',
      addressClue: 'Upės g. 7',
    })
  })
})
