const endpoint = '__FMH_ENDPOINT__'
const key = '__FMH_KEY__'

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
  const coordinates =
    clean(definition('Koordinatės'))?.match(
      /(5[3-6](?:\.\d+)?)\D+(2[3-7](?:\.\d+)?)/,
    ) ?? mapCoordinates()
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
    locationConfidence: coordinates ? 'approx' : 'unknown',
    description,
    photos: [...document.images]
      .map((image) => image.currentSrc || image.src)
      .filter(
        (source) =>
          source.startsWith('https://') && /aruodas|dgn\.lt/.test(source),
      )
      .slice(0, 50),
    features: featureText,
    utilities: {
      electricity: utility(/elektr/i),
      water: utility(/vand/i),
      sewage: utility(/kanaliz|nuotek/i),
      gas: utility(/duj/i),
    },
  }
  const payloadText = JSON.stringify(payload)
  let hash = 2166136261
  for (let index = 0; index < payloadText.length; index++) {
    hash ^= payloadText.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  const fingerprint = `${payloadText.length}:${(hash >>> 0).toString(16)}`
  if (endpoint.includes('__FMH_FRAGMENT_RECEIVER__')) {
    const envelope = JSON.stringify({ payload: payloadText, fingerprint })
    const bytes = new TextEncoder().encode(envelope)
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
    }
    const encoded = btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    window.location.href = endpoint.replace(
      '__FMH_FRAGMENT_RECEIVER__',
      encoded,
    )
  } else if (endpoint.includes('__FMH_POSTMESSAGE_RECEIVER__')) {
    const receiver = new URL(endpoint)
    receiver.searchParams.delete('__FMH_POSTMESSAGE_RECEIVER__')
    const delay = Number(receiver.searchParams.get('delay') ?? 0)
    receiver.searchParams.delete('delay')
    const openAndSend = () => {
      const target = window.open(receiver, '_blank')
      if (!target) {
        fail('The browser blocked the app popup.')
        return
      }
      const send = (event: MessageEvent) => {
        if (event.source !== target || event.data !== 'fmh-ready') return
        target.postMessage(
          { type: 'fmh-import', payload: payloadText, fingerprint },
          receiver.origin,
        )
        window.removeEventListener('message', send)
      }
      window.addEventListener('message', send)
    }
    if (delay) window.setTimeout(openAndSend, delay)
    else openAndSend()
  } else {
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = endpoint
    form.target = '_blank'
    for (const [name, value] of Object.entries({ key, payload: payloadText })) {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = name
      input.value = value
      form.append(input)
    }
    document.body.append(form)
    form.submit()
    form.remove()
  }
}
