import { describe, expect, it } from 'vitest'
import { parseAruodasImport } from './aruodas-import'

const LISTING_URL =
  'https://www.aruodas.lt/sklypai-vilniaus-rajone-zemuju-rusoku-k-upes-g-parduodamas-erdvus-aru-namu-valdos-sklypas-11-1472707/?search_pos=1'

describe('parseAruodasImport', () => {
  it('normalizes a user-verified Aruodas land listing', () => {
    const listing = parseAruodasImport({
      url: LISTING_URL,
      title: 'Vilniaus r. sav., Žemųjų Rusokų k., Upės g.',
      priceEur: 85_000,
      areaAres: 15,
      purposeText: 'Namų valda',
      uniqueRegistryNumber: '4174-0100-2219',
      lat: 54.806548,
      lng: 25.213499,
      locationConfidence: 'exact',
      photos: ['https://aruodas-img.dgn.lt/object_62_133921809/plot.jpg'],
      features: ['Elektra', 'Geodeziniai matavimai'],
      utilities: { electricity: 'mentioned by Aruodas' },
    })

    expect(listing).toMatchObject({
      source: 'aruodas',
      sourceId: '11-1472707',
      url: 'https://www.aruodas.lt/sklypai-vilniaus-rajone-zemuju-rusoku-k-upes-g-parduodamas-erdvus-aru-namu-valdos-sklypas-11-1472707/',
      priceEur: 85_000,
      areaAres: 15,
      locationConfidence: 'exact',
    })
    expect(listing.raw).toEqual({
      importedBy: 'aruodas-bookmarklet',
      features: ['Elektra', 'Geodeziniai matavimai'],
    })
  })

  it('rejects a non-listing URL and partial coordinates', () => {
    expect(() =>
      parseAruodasImport({ url: 'https://www.aruodas.lt/sklypai/' }),
    ).toThrow('listing ID')
    expect(() => parseAruodasImport({ url: LISTING_URL, lat: 54.8 })).toThrow(
      'lat and lng',
    )
  })
})
