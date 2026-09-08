export type AruodasViewport = 'desktop' | 'mobile'
export type AdvertState = 'active' | 'sold' | 'inactive'

export type AdvertScenario = {
  kind: 'advert'
  name: string
  viewport: AruodasViewport
  listingId: string
  land: boolean
  state: AdvertState
  missing?: ReadonlyArray<'address' | 'price' | 'area' | 'coordinates' | 'description'>
  malformed?: 'json-ld' | 'coordinates'
  lazyPhotos?: boolean
  relatedSoldCard?: boolean
}

export type FavoriteCard = {
  id?: string
  land?: boolean
  state?: AdvertState
  duplicateOf?: string
  lazyPhoto?: boolean
}

export type FavoritesScenario = {
  kind: 'favorites'
  name: string
  viewport: AruodasViewport
  cards: ReadonlyArray<FavoriteCard>
}

export type AruodasScenario = AdvertScenario | FavoritesScenario

const baseListingId = '11-424242'

/** Named fixtures deliberately model one scraper concern each. */
export const aruodasScenarios = {
  desktopAdvert: {
    kind: 'advert',
    name: 'desktop-advert',
    viewport: 'desktop',
    listingId: baseListingId,
    land: true,
    state: 'active',
  },
  mobileAdvert: {
    kind: 'advert',
    name: 'mobile-advert',
    viewport: 'mobile',
    listingId: baseListingId,
    land: true,
    state: 'active',
  },
  incompleteAdvert: {
    kind: 'advert',
    name: 'incomplete-advert',
    viewport: 'desktop',
    listingId: baseListingId,
    land: true,
    state: 'active',
    missing: ['address', 'price', 'area', 'coordinates', 'description'],
  },
  malformedAdvert: {
    kind: 'advert',
    name: 'malformed-advert',
    viewport: 'desktop',
    listingId: baseListingId,
    land: true,
    state: 'active',
    malformed: 'json-ld',
  },
  malformedCoordinatesAdvert: {
    kind: 'advert',
    name: 'malformed-coordinates-advert',
    viewport: 'desktop',
    listingId: baseListingId,
    land: true,
    state: 'active',
    malformed: 'coordinates',
  },
  lazyPhotoAdvert: {
    kind: 'advert',
    name: 'lazy-photo-advert',
    viewport: 'desktop',
    listingId: baseListingId,
    land: true,
    state: 'active',
    lazyPhotos: true,
  },
  activeAdvertWithSoldRelatedCard: {
    kind: 'advert',
    name: 'active-advert-with-sold-related-card',
    viewport: 'desktop',
    listingId: baseListingId,
    land: true,
    state: 'active',
    relatedSoldCard: true,
  },
  soldAdvert: {
    kind: 'advert',
    name: 'sold-advert',
    viewport: 'desktop',
    listingId: baseListingId,
    land: true,
    state: 'sold',
  },
  inactiveAdvert: {
    kind: 'advert',
    name: 'inactive-advert',
    viewport: 'desktop',
    listingId: baseListingId,
    land: true,
    state: 'inactive',
  },
  nonLandAdvert: {
    kind: 'advert',
    name: 'non-land-advert',
    viewport: 'desktop',
    listingId: '1-424242',
    land: false,
    state: 'active',
  },
  desktopFavorites: {
    kind: 'favorites',
    name: 'desktop-favorites',
    viewport: 'desktop',
    cards: [
      {},
      { duplicateOf: baseListingId },
      { land: false },
      { state: 'sold' },
      { state: 'inactive' },
      { id: '' },
      { lazyPhoto: true },
    ],
  },
  mobileFavorites: {
    kind: 'favorites',
    name: 'mobile-favorites',
    viewport: 'mobile',
    cards: [{}, { lazyPhoto: true }, { state: 'sold' }],
  },
} as const satisfies Record<string, AruodasScenario>

const html = (strings: TemplateStringsArray, ...values: Array<string>) =>
  strings.reduce((result, string, index) => result + string + (values[index] ?? ''), '')

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

const hasMissing = (
  scenario: AdvertScenario,
  field: NonNullable<AdvertScenario['missing']>[number],
) => scenario.missing?.includes(field) ?? false

const definition = (label: string, value: string | undefined) =>
  value === undefined
    ? ''
    : html`<dt>${label}</dt>
        <dd>${value}</dd>`

const advertHtml = (scenario: AdvertScenario) => {
  const coordinates = hasMissing(scenario, 'coordinates')
    ? undefined
    : scenario.malformed === 'coordinates'
      ? 'somewhere nearby'
      : '54.898521, 23.903597'
  const photo = scenario.lazyPhotos
    ? '<img data-src="https://img.aruodas.lt/fixture-lazy.jpg" alt="lazy photo">'
    : '<img src="https://img.aruodas.lt/fixture.jpg" alt="plot photo">'
  const jsonLd =
    scenario.malformed === 'json-ld'
      ? '{ definitely not JSON'
      : '{"@type":"Offer","offers":{"price":"125 000"}}'
  return html`<!doctype html>
    <html>
      <head>
        <title>Fixture plot ${scenario.listingId}</title>
        ${hasMissing(scenario, 'description') ? '' : '<meta name="description" content="Elektra, vanduo, dujos ir kanalizacija prie sklypo.">'}
        <script type="application/ld+json">
          ${jsonLd}
        </script>
      </head>
      <body data-fixture="${scenario.name}">
        <h1
          class="${scenario.viewport === 'desktop' ? 'action-bar-advert-always-sticky--title-line' : 'obj-header-text-details'}"
        >
          Kauno r. sav., Fixture g.
        </h1>
        <dl>
          ${definition('Adresas', hasMissing(scenario, 'address') ? undefined : 'Kauno r. sav., Fixture g. 1')}
          ${definition('Kaina', hasMissing(scenario, 'price') ? undefined : '125 000 EUR')}
          ${definition('Plotas', hasMissing(scenario, 'area') ? undefined : '12,5 a')}
          ${definition('Paskirtis', 'Namų valda')}
          ${definition('Unikalus numeris', '1234-5678-9012')}
          ${definition('Koordinatės', coordinates)}
        </dl>
        <a
          href="https://maps.example.test/?viewpoint=${scenario.malformed === 'coordinates' ? 'somewhere-nearby' : '54.898521,23.903597'}"
          >map</a
        >
        <span class="status-bar">Taškas žemėlapyje tikslus</span>
        <section class="action-bar-advert-always-sticky">
          ${scenario.state === 'sold' ? '<span class="list-sold-lt">Parduotas</span>' : ''}
          ${scenario.state === 'inactive' ? '<span class="advert-is-passive">Neaktyvus</span>' : ''}
        </section>
        ${scenario.relatedSoldCard ? '<aside class="related"><span class="list-sold-lt">Parduotas related advert</span></aside>' : ''}
        ${photo}
      </body>
    </html>`
}

const favoriteCardHtml = (card: FavoriteCard, index: number, viewport: AruodasViewport) => {
  const id = card.duplicateOf ?? card.id ?? `${card.land === false ? '1' : '11'}-${424242 + index}`
  const state = card.state ?? 'active'
  const image = card.lazyPhoto
    ? '<img data-src="https://img.aruodas.lt/favorite-lazy.jpg" alt="lazy">'
    : '<img src="https://img.aruodas.lt/favorite.jpg" alt="favorite">'
  const desktop = viewport === 'desktop'
  const container = desktop ? 'list-row-container' : 'result-item-big-thumb'
  const title = desktop ? '<h3><a' : '<a class="item-address-v4"'
  const titleEnd = desktop ? '>Fixture address</a></h3>' : '>Fixture address</a>'
  return html`<article
    id="${escapeHtml(id ? `objectRow${id}` : '')}"
    class="${container} ${state === 'inactive' ? 'inactive-saved' : ''}"
  >
    ${title} href="/${id}/"${titleEnd}
    <div class="${desktop ? 'description' : 'desc-AreaOverall'}">12,5 a</div>
    <div class="${desktop ? 'rememb-item-price' : 'price-main'}">125 000 EUR</div>
    <a class="${desktop ? 'list-img' : 'object-image-link-big_thumbs'}">${image}</a>
    ${state === 'sold' ? '<span class="list-sold-lt">Parduotas</span>' : ''}
  </article>`
}

const favoritesHtml = (scenario: FavoritesScenario) =>
  html`<!doctype html>
    <html>
      <head>
        <title>Saved fixtures</title>
      </head>
      <body data-fixture="${scenario.name}">
        ${scenario.cards
          .map((card, index) => favoriteCardHtml(card, index, scenario.viewport))
          .join('')}
      </body>
    </html>`

export const renderAruodasScenario = (scenario: AruodasScenario) =>
  scenario.kind === 'advert' ? advertHtml(scenario) : favoritesHtml(scenario)

export const scenarioPath = (scenario: AruodasScenario) =>
  scenario.kind === 'favorites'
    ? '/isiminti-skelbimai/'
    : scenario.land
      ? `/sklypai-kauno-r-rajone-${scenario.listingId}/`
      : `/butai-kaune-${scenario.listingId}/`
