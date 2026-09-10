const card = (sourceId: string, index: number) => `
  <li class="result-item-v3 small_thumbs saved-adverts-result-item-v3">
    <a class="object-image-link" href="/${sourceId}/?from_saved=1">
      <img src="https://aruodas-img.dgn.lt/fixture/${sourceId}.jpg">
    </a>
    <span class="item-address-v3"><a>Fixture address ${index}</a></span>
    <span class="item-description-v3">${10 + (index % 1_000) / 100} a, namų valda</span>
    <span class="price-price-v3">${20_000 + (index % 1_000) * 100} €</span>
  </li>
`

const page = (cards: string, total: number, next?: string) => `
  <div class="page-title-bar--count-items">(${total})</div>
  <ul class="popup-object-list" id="objectList">${cards}</ul>
  ${next ? `<div class="button-next-v2"><a href="${next}">Kitas</a></div>` : ''}
`

const cards = (count: number, offset: number, category: 2 | 11) =>
  Array.from({ length: count }, (_, index) =>
    card(`${category}-${offset + index}`, offset + index),
  ).join('')

/** Mirrors the supplied unfiltered page: 88 favorites, with 50 cards on page one. */
export const mixedFavoritesPageOne = page(
  cards(28, 1_000_000, 11) + cards(22, 2_000_000, 2),
  88,
  '/isiminti-skelbimai/?Page=2',
)

export const mixedFavoritesPageTwo = page(cards(20, 3_000_000, 11) + cards(18, 4_000_000, 2), 88)

/** Mirrors the supplied land-filtered page: all 42 cards are complete land adverts. */
export const filteredLandFavoritesPage = page(cards(42, 5_000_000, 11), 42)
