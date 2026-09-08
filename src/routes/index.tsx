import { For, Show, createMemo, createSignal } from 'solid-js'
import { paths } from '../paths'
import { HouseholdHeader } from '../components/HouseholdHeader'
import { CheckStrip, CheckSummaryText } from '../components/CheckStrip'
import { FannedStack } from '../components/FannedStack'
import { GoSeeButton } from '../components/GoSeeButton'
import { MiniMap, miniMapCaption } from '../components/MiniMap'
import { PlotsMap } from '../components/PlotsMap'
import { CheckIcon } from '../components/icons'
import { openAddPlotDialog } from '../components/AddPlotDialog'
import { useHousehold } from '../households/context'
import type { SourceListingDetail } from '../source-listings/model'
import { sourceListingLocationState, sourceListingMapItems } from '../source-listings/map'
import { checkCells, checkTroubleScore } from '../check-summary'
import { candidatePlotRegiaUrl } from '../location-resolution'
import { formatAgo, formatAres, formatDateShort, formatEur, formatPerAre, orDash } from '../format'

export const preloadHome = () => undefined

type SortKey = 'new' | 'cheap' | 'big' | 'clean'

const SORTS: Array<[SortKey, string]> = [
  ['new', 'Latest change'],
  ['cheap', 'Cheapest'],
  ['big', 'Biggest'],
  ['clean', 'Fewest problems'],
]

const primaryPlot = (listing: SourceListingDetail) =>
  listing.candidatePlots[0] as SourceListingDetail['candidatePlots'][number] | undefined

export const sortListings = (listings: Array<SourceListingDetail>, sort: SortKey) => {
  const sorted = [...listings]
  const price = (listing: SourceListingDetail) =>
    primaryPlot(listing)?.priceEur ?? Number.POSITIVE_INFINITY
  const area = (listing: SourceListingDetail) => primaryPlot(listing)?.areaAres ?? 0
  const trouble = (listing: SourceListingDetail) =>
    checkTroubleScore(checkCells(primaryPlot(listing)?.automaticChecks))
  switch (sort) {
    case 'cheap':
      return sorted.sort((a, b) => price(a) - price(b))
    case 'big':
      return sorted.sort((a, b) => area(b) - area(a))
    case 'clean':
      return sorted.sort((a, b) => trouble(a) - trouble(b))
    default:
      return sorted.sort((a, b) => b.updatedAt - a.updatedAt)
  }
}

export default function Home() {
  const household = useHousehold()
  const [sort, setSort] = createSignal<SortKey>('new')
  const [unvisitedOnly, setUnvisitedOnly] = createSignal(false)
  const [view, setView] = createSignal<'list' | 'map'>('list')
  const allListings = createMemo(() => household.listSourceListings())
  const listings = createMemo(() =>
    sortListings(
      unvisitedOnly()
        ? allListings().filter((listing) => listing.visitedAt === null)
        : allListings(),
      sort(),
    ),
  )
  const plannedIds = createMemo(() => household.getVisitPlan().sourceListingIds)
  const plannedCount = () => plannedIds().length

  return (
    <main class="wrap">
      <HouseholdHeader active="plots" />

      <div class="legend">
        <span>
          <b>Each plot:</b> a map of where it is, its 13 automatic checks, and whether we're going
          to see it.
        </span>
        <span>
          <span class="strip key" aria-hidden="true">
            <i class="pass" />
            <i class="warning" />
            <i class="fail" />
            <i />
          </span>{' '}
          &nbsp;passed · look · problem · not checked
        </span>
      </div>

      <Show
        when={allListings().length > 0}
        fallback={
          <section class="panel empty">
            <h2>No plots yet</h2>
            <p>
              Save land adverts from Aruodas with the Find Me Home bookmark and they'll line up
              here, each with a map and its automatic checks.
            </p>
            <button class="btn" type="button" onClick={openAddPlotDialog}>
              + Add a plot
            </button>
          </section>
        }
      >
        <div class="tools">
          <div class="sort" role="group" aria-label="Sort and filter plots">
            <For each={SORTS}>
              {([key, label]) => (
                <button
                  type="button"
                  aria-pressed={sort() === key ? 'true' : 'false'}
                  onClick={() => setSort(key)}
                >
                  {label}
                </button>
              )}
            </For>
            <button
              type="button"
              aria-pressed={unvisitedOnly() ? 'true' : 'false'}
              onClick={() => setUnvisitedOnly((value) => !value)}
            >
              Not visited
            </button>
          </div>
          <div class="rowline tight">
            <span class="small muted">
              {listings().length} {listings().length === 1 ? 'plot' : 'plots'} · {plannedCount()}{' '}
              going to see
            </span>
            <div class="seg" role="group" aria-label="View">
              <button
                type="button"
                aria-pressed={view() === 'list' ? 'true' : 'false'}
                onClick={() => setView('list')}
              >
                List
              </button>
              <button
                type="button"
                aria-pressed={view() === 'map' ? 'true' : 'false'}
                onClick={() => setView('map')}
              >
                Map
              </button>
            </div>
          </div>
        </div>

        <Show
          when={listings().length > 0}
          fallback={<section class="panel empty">No unvisited plots</section>}
        >
          <Show
            when={view() === 'list'}
            fallback={<PlotsMap sourceListings={listings()} goingIds={plannedIds()} />}
          >
            <section class="list" aria-label="Saved plots">
              <For each={listings()}>{(listing) => <ListingRow listing={listing} />}</For>
            </section>
          </Show>
        </Show>
      </Show>
      <FannedStack />
    </main>
  )
}

function ListingRow(props: { listing: SourceListingDetail }) {
  const household = useHousehold()
  const plot = () => primaryPlot(props.listing)
  const going = () => household.getVisitPlan().sourceListingIds.includes(props.listing.id)
  const title = () => props.listing.title ?? `Aruodas advert ${props.listing.sourceId}`
  const locationState = () => sourceListingLocationState(props.listing)
  const mapItems = () => sourceListingMapItems(props.listing)
  const regiaUrl = () => props.listing.candidatePlots.map(candidatePlotRegiaUrl).find(Boolean)

  return (
    <article class={`panel row ${going() ? 'going' : ''}`}>
      <div>
        <a href={paths.sourceListing(props.listing.id)} aria-label={`Open ${title()}`}>
          <MiniMap items={mapItems()} state={locationState()} going={going()} />
        </a>
        <small class="mini-cap">{miniMapCaption(locationState())}</small>
      </div>
      <div>
        <a class="title" href={paths.sourceListing(props.listing.id)}>
          {title()}
        </a>
        <div class="place">{props.listing.address ?? 'Location not recorded yet'}</div>
        <div class="figs">
          <div class="fig">
            <div class="v">{orDash(formatEur(plot()?.priceEur))}</div>
            <div class="l">price</div>
          </div>
          <div class="fig">
            <div class="v">{orDash(formatAres(plot()?.areaAres))}</div>
            <div class="l">area</div>
          </div>
          <div class="fig">
            <div class="v">{orDash(formatPerAre(plot()?.priceEur, plot()?.areaAres))}</div>
            <div class="l">per are</div>
          </div>
        </div>
        <div class="checks">
          <CheckStrip checks={plot()?.automaticChecks} />
          <CheckSummaryText checks={plot()?.automaticChecks} />
        </div>
        <div class="marks">
          <Show when={props.listing.visitedAt !== null}>
            <span class="tag pass">
              <CheckIcon /> visited {formatDateShort(props.listing.visitedAt)}
            </span>
          </Show>
          <Show when={props.listing.candidatePlots.length > 1}>
            <span class="tag">{props.listing.candidatePlots.length} marked areas</span>
          </Show>
          <Show when={props.listing.photos.length === 0}>
            <span class="tag">no photos</span>
          </Show>
        </div>
      </div>
      <div class="side">
        <GoSeeButton sourceListingId={props.listing.id} />
        <Show when={regiaUrl()}>
          {(url) => (
            <a class="btn ghost sm" href={url()} target="_blank" rel="noopener noreferrer">
              REGIA
            </a>
          )}
        </Show>
        <span class="updated">changed {formatAgo(props.listing.updatedAt)}</span>
      </div>
    </article>
  )
}
