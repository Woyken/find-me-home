import { For, Show, action, createMemo, createOptimistic, createSignal } from 'solid-js'
import { CheckStrip } from '../components/CheckStrip'
import { FannedStack } from '../components/FannedStack'
import { HouseholdHeader } from '../components/HouseholdHeader'
import { VisitPlanMap } from '../components/VisitPlanMap'
import { CrossIcon, DownIcon, FlagIcon, PinIcon, UpIcon } from '../components/icons'
import { useHousehold } from '../households/context'
import { paths } from '../paths'
import type { SourceListingDetail } from '../source-listings/model'
import { sourceListingMapLocation } from '../source-listings/map'
import { formatAres, formatDateShort, formatEur, orDash } from '../format'

export const preloadVisitPlan = () => undefined

/** Google Maps directions through every located stop, in trip order. */
export const routeUrl = (listings: Array<SourceListingDetail>) => {
  const coordinates = listings.flatMap((listing) => {
    const location = sourceListingMapLocation(listing)
    return location ? [`${location.latitude},${location.longitude}`] : []
  })
  if (coordinates.length === 0) return null
  const destination = coordinates[coordinates.length - 1]
  const waypoints = coordinates.slice(0, -1)
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}${
    waypoints.length ? `&waypoints=${encodeURIComponent(waypoints.join('|'))}` : ''
  }`
}

export default function VisitPlanPage() {
  const household = useHousehold()
  const [busy, setBusy] = createOptimistic(false)
  const [error, setError] = createSignal('')
  const [view, setView] = createSignal<'list' | 'map'>('list')
  const [plan, setPlan] = createOptimistic(() => household.getVisitPlan().sourceListingIds, {
    loadingValue: [],
  })
  const listings = createMemo(() =>
    plan().flatMap((id) => {
      const listing = household.getSourceListing(id)
      return listing ? [listing] : []
    }),
  )
  const replacePlan = action(function* (ids: Array<string>) {
    setBusy(true)
    setError('')
    setPlan(ids)
    try {
      yield household.setVisitPlan(ids)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      throw caught
    }
  })
  const move = (id: string, offset: -1 | 1) => {
    if (busy()) return
    const index = plan().indexOf(id)
    const destination = index + offset
    if (index < 0 || destination < 0 || destination >= plan().length) return
    const ids = [...plan()]
    ;[ids[index], ids[destination]] = [ids[destination], ids[index]]
    void replacePlan(ids).catch(() => undefined)
  }
  const drop = (id: string) => {
    if (busy()) return
    void replacePlan(plan().filter((other) => other !== id)).catch(() => undefined)
  }

  const stop = (listing: SourceListingDetail, index: number, compact: boolean) => {
    const plot = listing.candidatePlots[0] as
      | SourceListingDetail['candidatePlots'][number]
      | undefined
    const title = listing.title ?? `Aruodas advert ${listing.sourceId}`
    return (
      <article class="panel stop going" aria-label={`Stop ${index + 1}: ${title}`}>
        <span class="num" aria-hidden="true">
          {index + 1}
        </span>
        <div>
          <a class="t" href={paths.sourceListing(listing.id)}>
            {title}
          </a>
          <div class="p">{listing.address ?? 'Location not recorded yet'}</div>
          <Show when={!compact}>
            <div class="meta">
              <b>{orDash(formatEur(plot?.priceEur))}</b>
              <span>{orDash(formatAres(plot?.areaAres))}</span>
              <CheckStrip checks={plot?.automaticChecks} />
              <Show when={listing.visitedAt !== null}>
                <span class="tag pass">visited {formatDateShort(listing.visitedAt)}</span>
              </Show>
              <Show when={!sourceListingMapLocation(listing)}>
                <span class="tag warn">not on the map</span>
              </Show>
            </div>
          </Show>
        </div>
        <div class="ctrl">
          <button
            class="iconbtn"
            type="button"
            aria-label={`Move ${title} up`}
            disabled={busy() || index === 0}
            onClick={() => move(listing.id, -1)}
          >
            <UpIcon />
          </button>
          <button
            class="iconbtn"
            type="button"
            aria-label={`Move ${title} down`}
            disabled={busy() || plan().indexOf(listing.id) === plan().length - 1}
            onClick={() => move(listing.id, 1)}
          >
            <DownIcon />
          </button>
          <button
            class="iconbtn x"
            type="button"
            aria-label={`Remove ${title} from the list`}
            disabled={busy()}
            onClick={() => drop(listing.id)}
          >
            <CrossIcon />
          </button>
        </div>
      </article>
    )
  }

  return (
    <main class="wrap">
      <HouseholdHeader active="trip" />
      <div class="trip-head">
        <div>
          <h2>Going to see</h2>
          <p>
            {listings().length
              ? `${listings().length} stop${listings().length === 1 ? '' : 's'}, in the order you'll drive. Use the arrows to reorder.`
              : 'Nothing planned yet.'}
          </p>
        </div>
        <div class="rowline tight">
          <Show when={routeUrl(listings())}>
            {(url) => (
              <a class="btn ghost" href={url()} target="_blank" rel="noreferrer">
                <PinIcon /> Open route in Google Maps
              </a>
            )}
          </Show>
          <Show when={listings().length > 0}>
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
          </Show>
        </div>
      </div>
      <Show when={error()}>
        <p class="alert" role="alert">
          {error()}
        </p>
      </Show>
      <Show
        when={listings().length > 0}
        fallback={
          <div class="panel empty">
            <h2>No visits planned yet</h2>
            <p>
              On the plots page, press "Go see it" on the ones worth a drive. They'll line up here.
            </p>
            <a class="btn stake" href={paths.home}>
              <FlagIcon /> Pick plots to see
            </a>
          </div>
        }
      >
        <Show
          when={view() === 'list'}
          fallback={
            <>
              <VisitPlanMap sourceListings={listings()} />
              <div class="compact">
                <For each={listings()}>{(listing, index) => stop(listing, index(), true)}</For>
              </div>
            </>
          }
        >
          <div class="stops" role="list" aria-label="Visit stops in driving order">
            <For each={listings()}>{(listing, index) => stop(listing, index(), false)}</For>
          </div>
        </Show>
      </Show>
      <FannedStack />
    </main>
  )
}
