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
const returnTo =
  url.hash === '#find-me-home-return=import-inbox' ? 'import-inbox' : undefined
url.search = ''
url.hash = ''

if (url.pathname.startsWith('/isiminti-skelbimai')) {
  let skippedNonLand = 0
  let skippedInactive = 0
  let unreadable = 0
  const seen = new Set<string>()
  const items = [
    ...document.querySelectorAll<HTMLElement>('.list-row-container'),
  ].flatMap((card) => {
    const id = card
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
      card.querySelector('.advert-is-passive')
    ) {
      skippedInactive += 1
      return []
    }
    if (seen.has(id)) return []
    seen.add(id)
    const thumbnail = card.querySelector<HTMLImageElement>('.list-img img')?.src
    return [
      {
        sourceId: id,
        title: clean(card.querySelector('h3 a')?.textContent),
        description: clean(card.querySelector('.description')?.textContent),
        priceEur: numberFrom(
          card.querySelector('.rememb-item-price')?.textContent,
        ),
        areaAres: numberFrom(card.querySelector('.description')?.textContent),
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
} else if (
  !url.pathname.startsWith('/sklypai') ||
  !/-(\d{1,3}-\d+)\/?$/.test(url.pathname)
) {
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
