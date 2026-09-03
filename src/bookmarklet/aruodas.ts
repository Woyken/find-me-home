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
url.search = ''
url.hash = ''

if (
  !url.pathname.startsWith('/sklypai') ||
  !/-(\d{1,3}-\d+)\/?$/.test(url.pathname)
) {
  fail('Open an individual Aruodas land advertisement before importing.')
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
  const text = JSON.stringify({ version: 1, payload })
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
