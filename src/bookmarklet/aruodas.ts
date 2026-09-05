const appUrl = '__FMH_APP_URL__'

const clean = (value: string | null | undefined) =>
  value?.replace(/\s+/g, ' ').trim() || undefined

const numberFrom = (value: string | null | undefined) => {
  const matched = clean(value)?.match(/[\d\s]+(?:[,.]\d+)?/)
  return matched
    ? Number(matched[0].replace(/\s/g, '').replace(',', '.'))
    : undefined
}

const definition = (label: string) => {
  const term = [...document.querySelectorAll('dt')].find((node) =>
    clean(node.textContent)?.includes(label),
  )
  return clean(term?.nextElementSibling?.textContent)
}

const elementText = (selector: string) =>
  clean(document.querySelector(selector)?.textContent)

const mapCoordinates = () => {
  const streetView = document.querySelector<HTMLAnchorElement>(
    'a[href*="viewpoint="]',
  )?.href
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
  [
    ...document.querySelectorAll<HTMLScriptElement>(
      'script[type="application/ld+json"]',
    ),
  ]
    .map((node) => {
      try {
        return JSON.parse(node.textContent || '') as Record<string, unknown>
      } catch {
        return undefined
      }
    })
    .filter((item): item is Record<string, unknown> => Boolean(item))

const fail = (message: string) => window.alert(`Find Me Home: ${message}`)
const allowedPhoto = (source: string) => {
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
/**
 * Land adverts live under `/sklypai-…-11-123/` on www.aruodas.lt, while
 * m.aruodas.lt links to them as a bare `/11-123/` (category 11 is land).
 */
const isLandAdvertPath = (pathname: string) => {
  const id = pathname.match(/(?:-|^\/)(\d{1,3}-\d+)\/?$/)?.[1]
  if (!id) return false
  return pathname.startsWith('/sklypai') || id.startsWith('11-')
}
const returnTo =
  url.hash === '#find-me-home-return=import-inbox' ? 'import-inbox' : undefined
url.search = ''
url.hash = ''

if (url.pathname.startsWith('/isiminti-skelbimai')) {
  // www.aruodas.lt and m.aruodas.lt render the favourites page with
  // different markup; every selector below lists the desktop one first and
  // the mobile one second.
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
  const seen = new Set<string>()
  const items = [
    ...document.querySelectorAll<HTMLElement>(
      '.list-row-container, .result-item-big-thumb',
    ),
  ].flatMap((card) => {
    const id =
      card.id.match(/^objectRow(\d{1,3}-\d+)$/)?.[1] ??
      card
        .querySelector<HTMLAnchorElement>('a[href]')
        ?.href.match(/(?:-|\/)(\d{1,3}-\d+)\/?(?:[?#]|$)/)?.[1]
    if (!id) {
      unreadable += 1
      return []
    }
    if (!id.startsWith('11-')) {
      skippedNonLand += 1
      return []
    }
    if (
      card.classList.contains('inactive-saved') ||
      card.querySelector('.advert-is-passive, .list-sold-lt')
    ) {
      skippedInactive += 1
      return []
    }
    if (seen.has(id)) return []
    seen.add(id)
    const image = card.querySelector<HTMLImageElement>(
      '.list-img img, .object-image-link-big_thumbs img',
    )
    const thumbnail =
      image?.currentSrc || image?.src || image?.dataset.src || undefined
    const details = [...card.querySelectorAll('.desc-img-txt')]
      .map((node) => clean(node.textContent))
      .filter(Boolean)
      .join(', ')
    return [
      {
        sourceId: id,
        title: firstText(card, 'h3 a', '.item-address-v4'),
        description: firstText(card, '.description') ?? clean(details),
        priceEur: numberFrom(
          firstText(card, '.rememb-item-price', '.price-main'),
        ),
        areaAres: numberFrom(
          firstText(card, '.description', '.desc-AreaOverall .desc-img-txt'),
        ),
        thumbnail: thumbnail && allowedPhoto(thumbnail) ? thumbnail : undefined,
      },
    ]
  })
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
    const encoded = btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    window.location.href = `${appUrl}import-inbox#import=${encoded}`
  }
} else if (!isLandAdvertPath(url.pathname)) {
  fail(
    'Open an individual Aruodas land advertisement or your favorites page before importing.',
  )
} else {
  const structured = jsonLd()
  const offer = structured
    .map((item) => item.offers ?? item.Offers)
    .find(Boolean) as { price?: string | number } | undefined
  const description =
    clean(
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute('content'),
    ) ||
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
    pattern.test(`${description} ${featureText.join(' ')}`)
      ? 'mentioned by Aruodas'
      : undefined
  const listedCoordinates = clean(definition('Koordinatės'))?.match(
    /(5[3-6](?:\.\d+)?)\D+(2[3-7](?:\.\d+)?)/,
  )
  const coordinates = listedCoordinates ?? mapCoordinates()
  const listedAddress =
    definition('Adresas') ??
    definition('Gyvenvietė') ??
    elementText('.obj-header-text-address')
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
    priceEur:
      numberFrom(String(offer?.price ?? '')) ?? numberFrom(definition('Kaina')),
    areaAres: numberFrom(definition('Plotas')),
    purposeText: definition('Paskirtis'),
    uniqueRegistryNumber: definition('Unikalus numeris'),
    lat: coordinates ? Number(coordinates[1]) : undefined,
    lng: coordinates ? Number(coordinates[2]) : undefined,
    locationConfidence: coordinates
      ? hasExactMapPoint()
        ? 'exact'
        : 'approx'
      : 'unknown',
    description,
    photos: [...document.images]
      .map((image) => image.currentSrc || image.src)
      .filter(allowedPhoto)
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
    const encoded = btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    window.location.href = `${appUrl}#import=${encoded}`
  }
}
