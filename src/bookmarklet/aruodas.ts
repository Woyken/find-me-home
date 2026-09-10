/* This file is served from Pages as `aruodas-bookmarklet.js` and loaded by the
   tiny bookmarklet in src/imports/bookmarklet.ts, which sets `__fmhAppUrl`
   before loading it. The script tag URL is the fallback. */
const appUrl: string =
  (window as { __fmhAppUrl?: string }).__fmhAppUrl ??
  new URL('.', (document.currentScript as HTMLScriptElement).src).href

const clean = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() || undefined

const numberFrom = (value: string | null | undefined) => {
  const matched = clean(value)?.match(/[\d\s]+(?:[,.]\d+)?/)
  return matched ? Number(matched[0].replace(/\s/g, '').replace(',', '.')) : undefined
}

const definition = (label: string) => {
  const term = [...document.querySelectorAll('dt')].find((node) =>
    clean(node.textContent)?.includes(label),
  )
  return clean(term?.nextElementSibling?.textContent)
}

const elementText = (selector: string) => clean(document.querySelector(selector)?.textContent)

const mapCoordinates = () => {
  const streetView = document.querySelector<HTMLAnchorElement>('a[href*="viewpoint="]')?.href
  const inlineMapSetup = [...document.scripts]
    .map((script) => script.textContent || '')
    .find((source) => /(?:coordinates\s*=|\[lat,\s*lng\]\s*=)/.test(source))
  const source = `${streetView ?? ''} ${inlineMapSetup ?? ''}`
  return source.match(/(5[3-6](?:\.\d+)?)\s*,\s*(2[3-7](?:\.\d+)?)/)
}

const hasExactMapPoint = () =>
  Boolean(document.querySelector('.map_accurate-point')) ||
  [...document.querySelectorAll('.status-bar')].some(
    (node) => clean(node.textContent) === 'Taškas žemėlapyje tikslus',
  )

const jsonLd = () =>
  [...document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')]
    .map((node) => {
      try {
        return JSON.parse(node.textContent || '') as Record<string, unknown>
      } catch {
        return undefined
      }
    })
    .filter((item): item is Record<string, unknown> => Boolean(item))

const fail = (message: string) => window.alert(`Find Me Home: ${message}`)
const allowedPhoto = (source: string | undefined): source is string => {
  if (!source) return false
  try {
    const photo = new URL(source)
    return (
      photo.protocol === 'https:' &&
      (photo.hostname === 'aruodas.lt' ||
        photo.hostname.endsWith('.aruodas.lt') ||
        photo.hostname === 'dgn.lt' ||
        photo.hostname.endsWith('.dgn.lt'))
    )
  } catch {
    return false
  }
}
const url = new URL(window.location.href)
const appDestination = (pathname: string, fragment: string) => {
  const destination = new URL(pathname, appUrl)
  destination.search = new URL(appUrl).search
  destination.hash = fragment
  return destination.href
}
/**
 * Land adverts live under `/sklypai-…-11-123/` on www.aruodas.lt, while
 * m.aruodas.lt links to them as a bare `/11-123/` (category 11 is land).
 */
const isLandAdvertPath = (pathname: string) => {
  const id = pathname.match(/(?:-|^\/)(\d{1,3}-\d+)\/?$/)?.[1]
  if (!id) return false
  return pathname.startsWith('/sklypai') || id.startsWith('11-')
}
const returnTo = url.hash === '#find-me-home-return=import-inbox' ? 'import-inbox' : undefined
url.search = ''
url.hash = ''

const panelStyle =
  'position:fixed;left:12px;right:12px;z-index:2147483647;font:14px/1.4 system-ui,sans-serif;color:#111;background:#fff;border:2px solid #111;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.35);padding:12px'

/**
 * Heartbeat: shown before anything else runs, so "no toast" means the browser
 * never executed the bookmark, while "toast, then nothing" means it crashed
 * (and the crash overlay below explains why).
 */
const showHeartbeat = () => {
  const toast = document.createElement('div')
  toast.setAttribute('style', `${panelStyle};top:12px;text-align:center`)
  toast.textContent = 'Find Me Home: working…'
  document.body.append(toast)
  setTimeout(() => toast.remove(), 6_000)
  return toast
}

const showCrash = (error: unknown) => {
  const attempt = (read: () => string) => {
    try {
      return read()
    } catch {
      return 'unavailable'
    }
  }
  const details = [
    `Find Me Home bookmark failed on ${attempt(() => window.location.href)}`,
    `When: ${new Date().toISOString()}`,
    `Browser: ${attempt(() => navigator.userAgent)}`,
    `Cards on page: ${attempt(() => String(document.querySelectorAll('.list-row-container, .result-item-big-thumb, #objectList > .result-item-v3').length))}`,
    '',
    error instanceof Error
      ? `${error.name}: ${error.message}\n${error.stack ?? ''}`
      : String(error),
  ].join('\n')
  const panel = document.createElement('div')
  panel.setAttribute('style', `${panelStyle};top:12px;max-height:80vh;overflow:auto`)
  const heading = document.createElement('div')
  heading.setAttribute('style', 'font-weight:700;margin-bottom:8px')
  heading.textContent = 'Find Me Home could not import this page'
  const text = document.createElement('textarea')
  text.readOnly = true
  text.value = details
  text.setAttribute(
    'style',
    'display:block;width:100%;height:40vh;box-sizing:border-box;font:12px/1.4 monospace;white-space:pre;margin-bottom:8px',
  )
  const copy = document.createElement('button')
  copy.type = 'button'
  copy.textContent = 'Copy details'
  copy.setAttribute('style', 'font:inherit;padding:8px 12px;margin-right:8px')
  copy.onclick = () => {
    text.select()
    const done = () => {
      copy.textContent = 'Copied'
    }
    const legacyCopy = () => {
      if (document.execCommand('copy')) done()
    }
    try {
      navigator.clipboard.writeText(details).then(done, legacyCopy)
    } catch {
      legacyCopy()
    }
  }
  const close = document.createElement('button')
  close.type = 'button'
  close.textContent = 'Close'
  close.setAttribute('style', 'font:inherit;padding:8px 12px')
  close.onclick = () => panel.remove()
  panel.append(heading, text, copy, close)
  document.body.append(panel)
}

const run = () => {
  if (url.pathname.startsWith('/isiminti-skelbimai')) {
    /*
     * www.aruodas.lt and m.aruodas.lt render the favourites page with
     * different markup; every selector below lists the desktop one first and
     * the mobile one second.
     *
     * Only block comments in this file: browsers strip newlines from a
     * javascript: URL, so a line comment would swallow the rest of the script.
     */
    const firstText = (card: HTMLElement, ...selectors: Array<string>) => {
      for (const selector of selectors) {
        const text = clean(card.querySelector(selector)?.textContent)
        if (text) return text
      }
      return undefined
    }
    let skippedNonLand = 0
    let skippedInactive = 0
    let unreadable = 0
    const expectedTotal = numberFrom(
      document.querySelector('.page-title-bar--count-items')?.textContent,
    )
    const seenCards = new Set<string>()
    const seen = new Set<string>()
    const items: Array<{
      sourceId: string
      title?: string
      description?: string
      priceEur?: number
      areaAres?: number
      thumbnail?: string
    }> = []
    const readPage = (page: Document) => {
      const cards = page.querySelectorAll<HTMLElement>(
        '.list-row-container, .result-item-big-thumb, #objectList > .result-item-v3',
      )
      for (const card of cards) {
        const link = card.querySelector<HTMLAnchorElement>('a[href]')
        const id =
          card.id.match(/^objectRow(\d{1,3}-\d+)$/)?.[1] ??
          link?.getAttribute('href')?.match(/(?:-|\/)(\d{1,3}-\d+)\/?(?:[?#]|$)/)?.[1]
        if (!id) {
          unreadable += 1
          continue
        }
        if (seenCards.has(id)) continue
        seenCards.add(id)
        if (!id.startsWith('11-')) {
          skippedNonLand += 1
          continue
        }
        if (
          card.classList.contains('inactive-saved') ||
          card.querySelector('.advert-is-passive, .list-sold-lt')
        ) {
          skippedInactive += 1
          continue
        }
        if (seen.has(id)) continue
        seen.add(id)
        const image = card.querySelector<HTMLImageElement>(
          '.list-img img, .object-image-link-big_thumbs img, .object-image-link img',
        )
        const thumbnail = image?.currentSrc || image?.src || image?.dataset.src || undefined
        const details = [...card.querySelectorAll('.desc-img-txt')]
          .map((node) => clean(node.textContent))
          .filter(Boolean)
          .join(', ')
        items.push({
          sourceId: id,
          title: firstText(card, 'h3 a', '.item-address-v4', '.item-address-v3'),
          description: firstText(card, '.description', '.item-description-v3') ?? clean(details),
          priceEur: numberFrom(
            firstText(card, '.rememb-item-price', '.price-main', '.price-price-v3'),
          ),
          areaAres: numberFrom(
            firstText(
              card,
              '.description',
              '.desc-AreaOverall .desc-img-txt',
              '.item-description-v3',
            ),
          ),
          thumbnail: thumbnail && allowedPhoto(thumbnail) ? thumbnail : undefined,
        })
      }
    }
    const finish = () => {
      const cardsRead = seenCards.size + unreadable
      if (expectedTotal !== undefined && cardsRead !== expectedTotal) {
        throw new Error(`Aruodas shows ${expectedTotal} favorites, but only ${cardsRead} were read`)
      }
      const text = JSON.stringify({
        version: 2,
        kind: 'favorites',
        payload: { items, skippedNonLand, skippedInactive, unreadable },
      })
      if (text.length > 100_000) {
        fail('Your favorites list is too large to import.')
      } else {
        const bytes = new TextEncoder().encode(text)
        let binary = ''
        for (const byte of bytes) binary += String.fromCharCode(byte)
        const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
        window.location.href = appDestination('import-inbox', `import=${encoded}`)
      }
    }
    const paginationUrl = (link: HTMLAnchorElement, base: URL | string) => {
      const next = new URL(link.getAttribute('href') || '', base)
      if (next.origin !== url.origin || !next.pathname.startsWith('/isiminti-skelbimai')) {
        throw new Error('Aruodas favorites pagination pointed outside the favorites page')
      }
      return next.href
    }
    readPage(document)
    const firstNextLink = document.querySelector<HTMLAnchorElement>('.button-next-v2 a[href]')
    const firstNext = firstNextLink ? paginationUrl(firstNextLink, url) : undefined
    if (!firstNext) return finish()
    return (async () => {
      const fetchedPages = new Set<string>()
      let next: string | undefined = firstNext
      while (next) {
        if (fetchedPages.has(next)) throw new Error('Aruodas favorites pagination repeated a page')
        fetchedPages.add(next)
        const response = await fetch(next, { credentials: 'same-origin' })
        if (!response.ok) throw new Error(`Could not load favorites page (${response.status})`)
        const page = new DOMParser().parseFromString(await response.text(), 'text/html')
        readPage(page)
        const following = page.querySelector<HTMLAnchorElement>('.button-next-v2 a[href]')
        next = following ? paginationUrl(following, next) : undefined
      }
      finish()
    })()
  } else if (!isLandAdvertPath(url.pathname)) {
    fail('Open an individual Aruodas land advertisement or your favorites page before importing.')
  } else if (
    document.querySelector(
      '.action-bar-advert-always-sticky .advert-is-passive, .obj-header .advert-is-passive, .advert-is-passive[data-advert-status], .action-bar-advert-always-sticky .list-sold-lt, .obj-header .list-sold-lt, .list-sold-lt[data-advert-status]',
    )
  ) {
    fail('This Aruodas advertisement is no longer active.')
  } else {
    const structured = jsonLd()
    const offer = structured.map((item) => item.offers ?? item.Offers).find(Boolean) as
      | { price?: string | number }
      | undefined
    const description =
      clean(document.querySelector('meta[name="description"]')?.getAttribute('content')) ||
      [...document.querySelectorAll('div, p')]
        .map((node) => clean(node.textContent))
        .filter((text): text is string =>
          Boolean(text && text.length > 100 && text.length < 20_000),
        )
        .sort((left, right) => left.length - right.length)[0]
    const featureText = [...document.querySelectorAll('li')]
      .map((node) => clean(node.textContent))
      .filter((text): text is string =>
        Boolean(
          text &&
          text.length < 500 &&
          /elektr|vand|kanaliz|nuotek|duj|statyb|geodezin|privažiav/i.test(text),
        ),
      )
    const utility = (pattern: RegExp) =>
      pattern.test(`${description} ${featureText.join(' ')}`) ? 'mentioned by Aruodas' : undefined
    const listedCoordinates = clean(definition('Koordinatės'))?.match(
      /(5[3-6](?:\.\d+)?)\D+(2[3-7](?:\.\d+)?)/,
    )
    const coordinates = listedCoordinates ?? mapCoordinates()
    const listedAddress =
      definition('Adresas') ?? definition('Gyvenvietė') ?? elementText('.obj-header-text-address')
    const plotNumber = definition('Sklypo numeris')
    const address =
      listedAddress && plotNumber && !/\d/.test(listedAddress)
        ? `${listedAddress} ${plotNumber}`
        : listedAddress
    const payload = {
      url: url.toString(),
      title:
        elementText('.action-bar-advert-always-sticky--title-line') ??
        elementText('.obj-header-text-details') ??
        document.title,
      address,
      priceEur: numberFrom(String(offer?.price ?? '')) ?? numberFrom(definition('Kaina')),
      areaAres: numberFrom(definition('Plotas')),
      purposeText: definition('Paskirtis'),
      uniqueRegistryNumber: definition('Unikalus numeris'),
      lat: coordinates ? Number(coordinates[1]) : undefined,
      lng: coordinates ? Number(coordinates[2]) : undefined,
      locationConfidence: coordinates ? (hasExactMapPoint() ? 'exact' : 'approx') : 'unknown',
      description,
      photos: [...document.images]
        .map((image) => image.currentSrc || image.src || image.dataset.src)
        .filter((source): source is string => typeof source === 'string' && allowedPhoto(source))
        .slice(0, 50),
      features: featureText,
      utilities: {
        electricity: utility(/elektr/i),
        water: utility(/vand/i),
        sewage: utility(/kanaliz|nuotek/i),
        gas: utility(/duj/i),
      },
    }
    const text = JSON.stringify({
      version: 2,
      kind: 'listing',
      payload,
      ...(returnTo ? { returnTo } : {}),
    })
    if (text.length > 100_000) {
      fail('This advertisement is too large to import.')
    } else {
      const bytes = new TextEncoder().encode(text)
      let binary = ''
      for (const byte of bytes) binary += String.fromCharCode(byte)
      const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      window.location.href = `${appUrl}#import=${encoded}`
    }
  }
}

const heartbeat = showHeartbeat()
try {
  const result = run()
  if (result instanceof Promise)
    void result.catch((error) => {
      heartbeat.remove()
      showCrash(error)
    })
} catch (error) {
  heartbeat.remove()
  showCrash(error)
}
