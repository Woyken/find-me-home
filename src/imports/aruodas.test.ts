import { describe, expect, it } from 'vitest'
import {
  decodeImportFragment,
  decodeImportTransportFragment,
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

  it('uses the same bookmarklet for adverts and the favorites page', () => {
    expect(bookmarkletSource).toContain('/isiminti-skelbimai')
    expect(bookmarkletSource).toContain('kind: "favorites"')
    expect(bookmarkletSource).not.toContain('fetch(')
  })

  it('captures only active land adverts from the favorites page', () => {
    const transport = runBookmarklet(
      `
        <div class="list-row-container">
          <div class="list-img"><a href="https://www.aruodas.lt/sklypai-vilniaus-r-sav-test-11-1476517/"><img src="https://aruodas-img.dgn.lt/plot.jpg"></a></div>
          <h3><a href="https://www.aruodas.lt/11-1476517/">Piktakoniu k., Misko g.</a></h3>
          <span class="description">19 a, namu valda</span>
          <span class="rememb-item-price">21 500 EUR</span>
        </div>
        <div class="list-row-container"><a href="https://www.aruodas.lt/2-1/">House</a></div>
        <div class="list-row-container inactive-saved"><a href="https://www.aruodas.lt/11-2/">Inactive plot</a></div>
      `,
      'https://www.aruodas.lt/isiminti-skelbimai/',
    )

    expect(transport).toMatchObject({
      kind: 'favorites',
      skippedNonLand: 1,
      skippedInactive: 1,
      items: [
        {
          sourceId: '11-1476517',
          title: 'Piktakoniu k., Misko g.',
          areaAres: 19,
          priceEur: 21_500,
        },
      ],
    })
  })

  it('captures the favorites page of the mobile site (m.aruodas.lt)', () => {
    const transport = runBookmarklet(
      `
        <ul class="search-result-list-big_thumbs" id="objectList">
          <li class=" result-item-big-thumb " data-id="loadobject11-1476517" id="objectRow11-1476517">
            <a class="object-image-link-big_thumbs" href="/11-1476517/?from_saved=1&amp;inMap=0&amp;return_url=%2Fisiminti-skelbimai%2F">
              <picture><img class="impression-log-class lazyload" data-src="https://aruodas-img.dgn.lt/object_67_134641491/misko-g.jpg" src="https://aruodas-img.dgn.lt/object_67_134641491/misko-g.jpg"></picture>
            </a>
            <div class="result-item-info-v4">
              <div class="price-flex"><span class="item-price-main-v4"><span class="price-main">21 500 €</span><span class="price-per">1 132 €/a</span></span></div>
              <div class="item-address-v4"> Vilniaus r. sav., Piktakonių k., Miško g. </div>
              <div class="item-description-v5 twocols">
                <div class="description-item desc-AreaOverall"><div class="desc-img-txt nowrap"> 19 a </div></div>
                <div class="description-item desc-Intendance"><div class="desc-img-txt"> Namų valda </div></div>
              </div>
            </div>
          </li>
          <li class=" result-item-big-thumb inactive-saved " id="objectRow2-1776648">
            <a class="object-image-link-big_thumbs" href="/namai-vilniaus-rajone-2-1776648/?from_saved=1"></a>
            <div class="list-sold-lt"></div>
          </li>
          <li class=" result-item-big-thumb " id="objectRow11-1461928">
            <a class="object-image-link-big_thumbs" href="/11-1461928/?from_saved=1"></a>
            <div class="list-sold-lt"></div>
            <div class="item-address-v4">Sold plot</div>
          </li>
        </ul>
      `,
      'https://m.aruodas.lt/isiminti-skelbimai/?return_url=%2Fsklypai-11-1476669%2F',
    )

    expect(transport).toMatchObject({
      kind: 'favorites',
      skippedNonLand: 1,
      skippedInactive: 1,
      unreadable: 0,
      items: [
        {
          sourceId: '11-1476517',
          title: 'Vilniaus r. sav., Piktakonių k., Miško g.',
          description: '19 a, Namų valda',
          areaAres: 19,
          priceEur: 21_500,
          photos: [
            'https://aruodas-img.dgn.lt/object_67_134641491/misko-g.jpg',
          ],
        },
      ],
    })
  })

  it('accepts a bare mobile land advert URL and still rejects other categories', () => {
    expect(
      runBookmarklet('', 'https://m.aruodas.lt/11-1476517/?from_saved=1'),
    ).toMatchObject({ kind: 'listing', imported: { sourceId: '11-1476517' } })
    expect(() =>
      runBookmarklet('', 'https://m.aruodas.lt/2-1776648/'),
    ).toThrow()
  })

  it('carries the inbox return marker only from the opened advert', () => {
    expect(
      runBookmarklet(
        '',
        'https://www.aruodas.lt/sklypai-test-11-1476517/#find-me-home-return=import-inbox',
      ),
    ).toMatchObject({ kind: 'listing', returnTo: 'import-inbox' })
    expect(runBookmarklet('')).not.toHaveProperty('returnTo')
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
      imported: {
        lat: 54.80511,
        lng: 25.206326,
        locationConfidence: 'exact',
      },
    })
    expect(approximate).toMatchObject({
      imported: {
        lat: 54.649337,
        lng: 25.46104,
        locationConfidence: 'approx',
      },
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

const runBookmarklet = (
  body: string,
  initialUrl = 'https://www.aruodas.lt/sklypai-vilniaus-rajone-zemuju-rusoku-k-bendoriu-kel-sklypas-11-1440520/',
) => {
  document.title = 'Aruodas advert'
  document.body.innerHTML = body
  const location = {
    href: initialUrl,
  }
  const bookmarklet = new Function(
    'window',
    'document',
    bookmarkletSource.replace('__FMH_APP_URL__', 'https://example.test/'),
  )

  bookmarklet({ location, alert: () => undefined }, document)

  const fragment = new URL(location.href).hash.slice('#import='.length)
  return decodeImportTransportFragment(fragment)
}
