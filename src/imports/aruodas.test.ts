import { describe, expect, it, vi } from 'vitest'
import {
  decodeImportFragment,
  decodeImportTransportFragment,
  encodeImportFragment,
  parseAruodasImport,
  restoreImportTransport,
} from './aruodas'
import { createAruodasBookmarklet } from './bookmarklet'
import { bookmarkletSource } from 'virtual:aruodas-bookmarklet'
import {
  filteredLandFavoritesPage,
  mixedFavoritesPageOne,
  mixedFavoritesPageTwo,
} from './test-fixtures/aruodas-favorites'

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
  it('generates a short loader bookmarklet for the deployed app base URL', () => {
    const bookmarklet = createAruodasBookmarklet('https://woyken.github.io/find-me-home/?x=1#y')

    expect(bookmarklet.startsWith('javascript:')).toBe(true)
    expect(bookmarklet).toContain('var a="https://woyken.github.io/find-me-home/"')
    expect(bookmarklet).toContain('__fmhAppUrl=a')
    expect(bookmarklet).toContain('new URL("aruodas-bookmarklet.js?t="+Date.now(),a).href')
    expect(bookmarklet).toContain('document.createElement("script")')
    // Short enough that browsers do not truncate it when pasted as a bookmark.
    expect(bookmarklet.length).toBeLessThan(600)
    expect(bookmarklet).not.toMatch(/[\r\n]/)
    expect(() => new Function(bookmarklet.slice('javascript:'.length))).not.toThrow()
  })

  it('removes query parameters from the loader URL', () => {
    expect(createAruodasBookmarklet('https://example.test/find-me-home/?e2e=run_42&x=1')).toContain(
      'var a="https://example.test/find-me-home/"',
    )
    expect(createAruodasBookmarklet('https://example.test/find-me-home/?x=1')).toContain(
      'var a="https://example.test/find-me-home/"',
    )
  })

  it('serves a scraper that navigates the same tab with the import fragment', () => {
    expect(bookmarkletSource).toContain('#import=${encoded}')
    expect(bookmarkletSource).toContain('window.location.href')
    expect(bookmarkletSource).not.toContain('form.submit')
    expect(bookmarkletSource).toContain('__fmhAppUrl')
  })

  it('uses the same bookmarklet for adverts and the favorites page', () => {
    expect(bookmarkletSource).toContain('/isiminti-skelbimai')
    expect(bookmarkletSource).toContain('kind: "favorites"')
    expect(bookmarkletSource).toContain('fetch(')
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
          photos: ['https://aruodas-img.dgn.lt/object_67_134641491/misko-g.jpg'],
        },
      ],
    })
  })

  it('captures the current small-thumbnail mobile favorites page', () => {
    const transport = runBookmarklet(
      `
        <ul class="popup-object-list" id="objectList">
          <li class="result-item-v3 small_thumbs saved-adverts-result-item-v3">
            <a class="object-image-link" href="/11-1387357/?from_saved=1">
              <img src="https://aruodas-img.dgn.lt/object_66_120291899/plot.jpg">
            </a>
            <span class="item-address-v3"><a>Vilniaus r. sav., Rudaminos mstl., Lenkų g.</a></span>
            <span class="item-description-v3">14.06 a, namų valda</span>
            <span class="price-price-v3">49 900 €</span>
          </li>
          <li class="result-item-v3 small_thumbs saved-adverts-result-item-v3">
            <a class="object-image-link" href="/2-1799247/?from_saved=1">House</a>
          </li>
        </ul>
      `,
      'https://m.aruodas.lt/isiminti-skelbimai/',
    )

    expect(transport).toMatchObject({
      kind: 'favorites',
      skippedNonLand: 1,
      unreadable: 0,
      items: [
        {
          sourceId: '11-1387357',
          title: 'Vilniaus r. sav., Rudaminos mstl., Lenkų g.',
          description: '14.06 a, namų valda',
          areaAres: 14.06,
          priceEur: 49_900,
          photos: ['https://aruodas-img.dgn.lt/object_66_120291899/plot.jpg'],
        },
      ],
    })
  })

  it('captures every page of a paginated favorites list', async () => {
    const fetchPage = vi.fn().mockResolvedValue(
      new Response(`
        <ul id="objectList">
          <li class="result-item-v3">
            <a href="/11-1387357/?from_saved=1">Duplicate from page 1</a>
          </li>
          <li class="result-item-v3">
            <a href="/11-1476811/?from_saved=1">Plot on page 2</a>
            <span class="item-address-v3">Page two plot</span>
          </li>
        </ul>
      `),
    )
    vi.stubGlobal('fetch', fetchPage)
    try {
      const transport = await runBookmarkletAsync(
        `
          <ul id="objectList">
            <li class="result-item-v3">
              <a href="/11-1387357/?from_saved=1">Plot on page 1</a>
              <span class="item-address-v3">Page one plot</span>
            </li>
          </ul>
          <div class="button-next-v2"><a href="/isiminti-skelbimai/?Page=2">Next</a></div>
        `,
        'https://m.aruodas.lt/isiminti-skelbimai/',
      )

      expect(fetchPage).toHaveBeenCalledWith('https://m.aruodas.lt/isiminti-skelbimai/?Page=2', {
        credentials: 'same-origin',
      })
      expect(transport).toMatchObject({
        kind: 'favorites',
        items: [
          { sourceId: '11-1387357', title: 'Page one plot' },
          { sourceId: '11-1476811', title: 'Page two plot' },
        ],
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('does not silently import a partial favorites list', () => {
    document.body.innerHTML = `
      <div class="page-title-bar--count-items">(42)</div>
      <ul id="objectList">
        <li class="result-item-v3"><a href="/11-1387357/">Only visible plot</a></li>
      </ul>
    `
    const location = { href: 'https://m.aruodas.lt/isiminti-skelbimai/' }
    new Function('window', 'document', bookmarkletSource.replace(/[\r\n\t]/g, ''))(
      { location, alert: () => undefined, __fmhAppUrl: 'https://example.test/' },
      document,
    )

    expect(location.href).toBe('https://m.aruodas.lt/isiminti-skelbimai/')
    expect(document.querySelector('textarea')?.value).toContain(
      'Aruodas shows 42 favorites, but only 1 were read',
    )
  })

  it('does not let overlapping pages hide a partial favorites list', async () => {
    const fetchPage = vi.fn().mockResolvedValue(
      new Response(`
        <ul id="objectList">
          <li class="result-item-v3"><a href="/11-1387357/">Duplicate plot</a></li>
        </ul>
      `),
    )
    vi.stubGlobal('fetch', fetchPage)
    try {
      document.body.innerHTML = `
        <div class="page-title-bar--count-items">(2)</div>
        <ul id="objectList">
          <li class="result-item-v3"><a href="/11-1387357/">First plot</a></li>
        </ul>
        <div class="button-next-v2"><a href="/isiminti-skelbimai/?Page=2">Next</a></div>
      `
      const location = { href: 'https://m.aruodas.lt/isiminti-skelbimai/' }
      new Function('window', 'document', bookmarkletSource.replace(/[\r\n\t]/g, ''))(
        { location, alert: () => undefined, __fmhAppUrl: 'https://example.test/' },
        document,
      )
      await vi.waitFor(() =>
        expect(document.querySelector('textarea')?.value).toContain(
          'Aruodas shows 2 favorites, but only 1 were read',
        ),
      )
      expect(location.href).toBe('https://m.aruodas.lt/isiminti-skelbimai/')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('rejects pagination outside the Aruodas favorites page', () => {
    document.body.innerHTML = `
      <ul id="objectList">
        <li class="result-item-v3"><a href="/11-1387357/">Plot</a></li>
      </ul>
      <div class="button-next-v2"><a href="https://example.org/next">Next</a></div>
    `
    const location = { href: 'https://m.aruodas.lt/isiminti-skelbimai/' }
    new Function('window', 'document', bookmarkletSource.replace(/[\r\n\t]/g, ''))(
      { location, alert: () => undefined, __fmhAppUrl: 'https://example.test/' },
      document,
    )

    expect(document.querySelector('textarea')?.value).toContain(
      'pagination pointed outside the favorites page',
    )
    expect(location.href).toBe('https://m.aruodas.lt/isiminti-skelbimai/')
  })

  it('imports the supplied 88-item mixed favorites page across both pages', async () => {
    const fetchPage = vi.fn().mockResolvedValue(new Response(mixedFavoritesPageTwo))
    vi.stubGlobal('fetch', fetchPage)
    try {
      const transport = await runBookmarkletAsync(
        mixedFavoritesPageOne,
        'https://m.aruodas.lt/isiminti-skelbimai/',
      )

      expect(transport).toMatchObject({
        kind: 'favorites',
        skippedNonLand: 40,
        skippedInactive: 0,
        unreadable: 0,
      })
      expect(transport.kind === 'favorites' && transport.items).toHaveLength(48)
      expect(
        transport.kind === 'favorites' && new Set(transport.items.map((item) => item.sourceId)),
      ).toHaveLength(48)
      expect(fetchPage).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('imports all 42 plots from the supplied filtered land favorites page', () => {
    const transport = runBookmarklet(
      filteredLandFavoritesPage,
      'https://m.aruodas.lt/isiminti-skelbimai/?object_type=11&advert_status_saved=0',
    )

    expect(transport).toMatchObject({
      kind: 'favorites',
      skippedNonLand: 0,
      skippedInactive: 0,
      unreadable: 0,
    })
    expect(transport.kind === 'favorites' && transport.items).toHaveLength(42)
    if (transport.kind !== 'favorites') throw new Error('Expected favorites transport')
    expect(new Set(transport.items.map((item) => item.sourceId))).toHaveLength(42)
    expect(
      transport.items.every(
        (item) =>
          item.title &&
          item.description &&
          item.priceEur !== undefined &&
          item.areaAres !== undefined &&
          item.photos.length === 1,
      ),
    ).toBe(true)
  })

  it('accepts a bare mobile land advert URL and still rejects other categories', () => {
    expect(runBookmarklet('', 'https://m.aruodas.lt/11-1476517/?from_saved=1')).toMatchObject({
      kind: 'listing',
      imported: { sourceId: '11-1476517' },
    })
    expect(() => runBookmarklet('', 'https://m.aruodas.lt/2-1776648/')).toThrow()
  })

  it('rejects sold or inactive markers in the individual advert header', () => {
    expect(() =>
      runBookmarklet(
        '<section class="action-bar-advert-always-sticky"><span class="list-sold-lt">Parduotas</span></section>',
      ),
    ).toThrow()
    expect(() =>
      runBookmarklet(
        '<section class="action-bar-advert-always-sticky"><span class="advert-is-passive">Neaktyvus</span></section>',
      ),
    ).toThrow()
  })

  it('does not reject an active advert because a related card is sold', () => {
    expect(
      runBookmarklet('<aside class="related"><span class="list-sold-lt">Parduotas</span></aside>'),
    ).toMatchObject({ kind: 'listing' })
  })

  it('shows a heartbeat before running and a copyable crash report when it fails', () => {
    let heartbeatSeen: boolean | undefined
    const broken = new Proxy(document, {
      get(target, key) {
        if (key === 'querySelectorAll') {
          return () => {
            heartbeatSeen ??= document.body.textContent.includes('Find Me Home: working…')
            throw new Error('boom from the page')
          }
        }
        const value = Reflect.get(target, key)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const location = { href: 'https://m.aruodas.lt/isiminti-skelbimai/' }
    document.body.innerHTML = ''
    new Function('window', 'document', bookmarkletSource.replace(/[\r\n\t]/g, ''))(
      {
        location,
        alert: () => undefined,
        __fmhAppUrl: 'https://example.test/',
      },
      broken,
    )

    expect(heartbeatSeen).toBe(true)
    expect(location.href).toBe('https://m.aruodas.lt/isiminti-skelbimai/')
    const report = document.querySelector('textarea')?.value ?? ''
    expect(report).toContain('Error: boom from the page')
    expect(report).toContain('https://m.aruodas.lt/isiminti-skelbimai/')
    expect(document.body.textContent).toContain('Find Me Home could not import this page')
    expect(document.body.textContent).toContain('Copy details')
    expect(document.body.textContent).not.toContain('Find Me Home: working…')
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

  it('revalidates saved drafts through the canonical import parser', () => {
    const imported = parseAruodasImport(payload)

    expect(
      restoreImportTransport({ kind: 'listing', imported, returnTo: 'import-inbox' }),
    ).toMatchObject({
      kind: 'listing',
      returnTo: 'import-inbox',
      imported: {
        sourceId: '11-1472707',
        url: 'https://www.aruodas.lt/sklypai-vilniaus-rajone-zemuju-rusoku-k-upes-g-sklypas-11-1472707/',
      },
    })
    expect(() =>
      restoreImportTransport({
        kind: 'listing',
        imported: { ...imported, url: 'https://example.test/not-aruodas-11-1472707/' },
      }),
    ).toThrow()
    expect(() =>
      restoreImportTransport({
        kind: 'listing',
        imported: { ...imported, photos: ['https://example.test/plot.jpg'] },
      }),
    ).toThrow()
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

  it('imports a lazy-loaded advert photo', () => {
    expect(
      runBookmarklet('<img data-src="https://aruodas-img.dgn.lt/object_67_lazy/plot.jpg">'),
    ).toMatchObject({
      imported: {
        photos: ['https://aruodas-img.dgn.lt/object_67_lazy/plot.jpg'],
      },
    })
  })

  it('rejects invalid envelopes and payload text over 100,000 characters', () => {
    expect(() => decodeImportFragment('not-base64url!')).toThrow('Invalid import')
    expect(() => encodeImportFragment({ ...payload, description: 'x'.repeat(100_001) })).toThrow(
      '100,000',
    )
  })

  it('accepts at most 50 HTTPS Aruodas or dgn.lt photos', () => {
    const photos = Array.from({ length: 50 }, (_, index) => `https://img.aruodas.lt/${index}.jpg`)
    expect(parseAruodasImport({ ...payload, photos }).photos).toHaveLength(50)
    expect(() => parseAruodasImport({ ...payload, photos: [...photos, photos[0]] })).toThrow(
      'photos',
    )
    expect(() =>
      parseAruodasImport({
        ...payload,
        photos: ['http://img.aruodas.lt/a.jpg'],
      }),
    ).toThrow('photos')
    expect(() => parseAruodasImport({ ...payload, photos: ['https://example.com/a.jpg'] })).toThrow(
      'photos',
    )
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
    // The scraper is served as a classic script; keep it robust to newline
    // stripping in case it is ever inlined into a javascript: URL again.
    bookmarkletSource.replace(/[\r\n\t]/g, ''),
  )

  bookmarklet({ location, alert: () => undefined, __fmhAppUrl: 'https://example.test/' }, document)

  const fragment = new URL(location.href).hash.slice('#import='.length)
  return decodeImportTransportFragment(fragment)
}

const runBookmarkletAsync = async (body: string, initialUrl: string) => {
  document.title = 'Aruodas favorites'
  document.body.innerHTML = body
  const location = { href: initialUrl }
  new Function('window', 'document', bookmarkletSource.replace(/[\r\n\t]/g, ''))(
    { location, alert: () => undefined, __fmhAppUrl: 'https://example.test/' },
    document,
  )
  await vi.waitFor(() => expect(location.href).toContain('#import='))
  return decodeImportTransportFragment(new URL(location.href).hash.slice('#import='.length))
}
