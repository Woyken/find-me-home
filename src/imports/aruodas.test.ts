import { describe, expect, it } from 'vitest'
import {
  decodeImportFragment,
  encodeImportFragment,
  parseAruodasImport,
} from './aruodas'
import { createAruodasBookmarklet } from './bookmarklet'
import { bookmarkletSource } from 'virtual:aruodas-bookmarklet'

const payload = {
  url: 'https://www.aruodas.lt/sklypai-vilniaus-rajone-zemuju-rusoku-k-upes-g-sklypas-11-1472707/?search_pos=1',
  title: 'Vilniaus r. sav., Žemųjų Rusokų k., Upės g.',
  address: 'Žemųjų Rusokų k., Upės g. 7',
  priceEur: 85_000,
  areaAres: 15,
  purposeText: 'Namų valda',
  uniqueRegistryNumber: '4174-0100-2219',
  lat: 54.806548,
  lng: 25.213499,
  locationConfidence: 'exact' as const,
  description: 'Erdvus sklypas šalia upės.',
  photos: ['https://aruodas-img.dgn.lt/object_62_133921809/plot.jpg'],
  features: ['Elektra', 'Geodeziniai matavimai'],
  utilities: { electricity: 'mentioned by Aruodas' },
}

describe('Aruodas import fragment', () => {
  it('generates a same-tab bookmarklet for the deployed app base URL', () => {
    const bookmarklet = createAruodasBookmarklet(
      'https://woyken.github.io/find-me-home/',
    )

    expect(bookmarklet).toContain(
      'const appUrl = "https://woyken.github.io/find-me-home/"',
    )
    expect(bookmarklet).toContain('#import=${encoded}')
    expect(bookmarklet).toContain('window.location.href')
    expect(bookmarklet).not.toContain('form.submit')
    expect(bookmarklet).not.toContain('__FMH_APP_URL__')
  })

  it('round-trips a UTF-8 payload and normalizes the Source Listing identity', () => {
    const fragment = encodeImportFragment(payload)

    expect(decodeImportFragment(fragment)).toMatchObject({
      source: 'aruodas',
      sourceId: '11-1472707',
      title: payload.title,
      description: payload.description,
      url: 'https://www.aruodas.lt/sklypai-vilniaus-rajone-zemuju-rusoku-k-upes-g-sklypas-11-1472707/',
    })
  })

  it('imports Aruodas coordinates with the precision of their source', () => {
    const exact = runBookmarklet(`
      <span class="map_accurate-point" title="Taškas žemėlapyje tikslus"></span>
      <script>const coordinates = '54.80511,25.206326'</script>
    `)
    const approximate = runBookmarklet(`
      <span class="map_inaccurate-point" title="Taškas žemėlapyje netikslus"></span>
      <script>const coordinates = '54.649337,25.461040'</script>
    `)

    expect(exact).toMatchObject({
      lat: 54.80511,
      lng: 25.206326,
      locationConfidence: 'exact',
    })
    expect(approximate).toMatchObject({
      lat: 54.649337,
      lng: 25.46104,
      locationConfidence: 'approx',
    })
  })

  it('rejects invalid envelopes and payload text over 100,000 characters', () => {
    expect(() => decodeImportFragment('not-base64url!')).toThrow(
      'Invalid import',
    )
    expect(() =>
      encodeImportFragment({ ...payload, description: 'x'.repeat(100_001) }),
    ).toThrow('100,000')
  })

  it('accepts at most 50 HTTPS Aruodas or dgn.lt photos', () => {
    const photos = Array.from(
      { length: 50 },
      (_, index) => `https://img.aruodas.lt/${index}.jpg`,
    )
    expect(parseAruodasImport({ ...payload, photos }).photos).toHaveLength(50)
    expect(() =>
      parseAruodasImport({ ...payload, photos: [...photos, photos[0]] }),
    ).toThrow('photos')
    expect(() =>
      parseAruodasImport({
        ...payload,
        photos: ['http://img.aruodas.lt/a.jpg'],
      }),
    ).toThrow('photos')
    expect(() =>
      parseAruodasImport({ ...payload, photos: ['https://example.com/a.jpg'] }),
    ).toThrow('photos')
  })
})

const runBookmarklet = (body: string) => {
  document.title = 'Aruodas advert'
  document.body.innerHTML = body
  const location = {
    href: 'https://www.aruodas.lt/sklypai-vilniaus-rajone-zemuju-rusoku-k-bendoriu-kel-sklypas-11-1440520/',
  }
  const bookmarklet = new Function(
    'window',
    'document',
    bookmarkletSource.replace('__FMH_APP_URL__', 'https://example.test/'),
  )

  bookmarklet({ location, alert: () => undefined }, document)

  const fragment = new URL(location.href).hash.slice('#import='.length)
  return decodeImportFragment(fragment)
}
