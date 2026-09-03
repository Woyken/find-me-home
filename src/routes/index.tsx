import { For, Show, createMemo, createSignal } from 'solid-js'
import { paths } from '../paths'
import { HouseholdHeader } from '../components/HouseholdHeader'
import { useHousehold } from '../households/context'
import type { SourceListingDetail } from '../source-listings/model'
import { createAruodasBookmarklet } from '../imports/bookmarklet'

export const preloadHome = () => undefined

export default function Home() {
  const household = useHousehold()
  const listings = createMemo(() => household.listSourceListings())
  const plannedCount = createMemo(
    () => household.getVisitPlan().sourceListingIds.length,
  )
  const inboxCount = createMemo(() => household.listImportInbox().length)
  const [showImport, setShowImport] = createSignal(false)

  return (
    <main class="min-h-screen bg-[#edf0ea] px-4 pb-16 pt-4 text-[#18241e] sm:px-8 sm:pt-8">
      <div class="mx-auto max-w-6xl overflow-hidden border border-[#18241e] bg-[#faf9f4]">
        <header class="flex flex-wrap items-center justify-between gap-3 border-b border-[#18241e] px-4 py-4 sm:px-7">
          <HouseholdHeader />
          <div class="flex items-center gap-3">
            <Show when={inboxCount() > 0}>
              <a
                class="bg-[#c65c35] px-3 py-2 font-mono text-xs font-bold text-white"
                href={paths.importInbox}
              >
                Import Inbox ({inboxCount()})
              </a>
            </Show>
            <a
              class="border-b border-[#204d3a] font-mono text-xs font-bold text-[#204d3a]"
              href={paths.visitPlan}
            >
              Visit Plan ({plannedCount()})
            </a>
            <button
              class="bg-[#204d3a] px-4 py-2 text-sm font-bold text-white"
              onClick={() => setShowImport((shown) => !shown)}
            >
              {showImport() ? 'Close' : '+ Aruodas'}
            </button>
          </div>
        </header>

        <Show when={showImport()}>
          <ImportSetup />
        </Show>

        <Show
          when={listings().length > 0}
          fallback={
            <section class="px-5 py-16 text-center sm:px-8">
              <h2 class="font-serif text-2xl">No Source Listings yet</h2>
              <p class="mt-2 text-sm text-[#647169]">
                Use + Aruodas to set up the import bookmarklet.
              </p>
            </section>
          }
        >
          <div class="hidden grid-cols-[2.1fr_1fr_0.7fr_0.8fr_auto] border-b border-[#18241e]/30 px-7 py-2 font-mono text-[10px] uppercase tracking-wider text-[#647169] sm:grid">
            <span>Source Listing</span>
            <span>Place</span>
            <span>Price</span>
            <span>Area</span>
            <span>Visit Plan</span>
          </div>
          <For each={listings()}>
            {(listing) => <ListingRow listing={listing} />}
          </For>
        </Show>
      </div>
    </main>
  )
}

function ListingRow(props: { listing: SourceListingDetail }) {
  const household = useHousehold()
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal('')
  const plot = (): SourceListingDetail['candidatePlots'][number] | undefined =>
    props.listing.candidatePlots[0]
  const planned = () =>
    household.getVisitPlan().sourceListingIds.includes(props.listing.id)
  const togglePlan = async () => {
    const ids = household.getVisitPlan().sourceListingIds
    setBusy(true)
    setError('')
    try {
      await household.setVisitPlan(
        planned()
          ? ids.filter((id) => id !== props.listing.id)
          : [...ids, props.listing.id],
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <article class="grid gap-3 border-b border-[#18241e]/20 px-4 py-5 last:border-0 sm:grid-cols-[2.1fr_1fr_0.7fr_0.8fr_auto] sm:items-center sm:px-7">
      <div class="min-w-0">
        <p class="font-mono text-[9px] uppercase text-[#68756d]">
          Aruodas {props.listing.sourceId} ·{' '}
          {props.listing.candidatePlots.length}{' '}
          {props.listing.candidatePlots.length === 1 ? 'plot' : 'plots'}
        </p>
        <a
          class="mt-1 block font-serif text-xl leading-tight hover:underline"
          href={paths.sourceListing(props.listing.id)}
        >
          {props.listing.title ?? `Aruodas advert ${props.listing.sourceId}`}
        </a>
        <p class="mt-2 text-sm text-[#647169] sm:hidden">
          {props.listing.address ?? 'Location unknown'}
        </p>
        <Show when={props.listing.visitedAt !== null}>
          <p class="mt-1 text-xs text-[#647169]">
            Last visited {formatDate(props.listing.visitedAt)}
          </p>
        </Show>
      </div>
      <p class="hidden text-sm sm:block">
        {props.listing.address ?? 'Unknown'}
      </p>
      <b>{formatPrice(plot()?.priceEur ?? null)}</b>
      <b>{formatArea(plot()?.areaAres ?? null)}</b>
      <div>
        <button
          class="border border-[#204d3a] px-3 py-2 text-xs font-bold text-[#204d3a] disabled:opacity-50"
          disabled={busy()}
          onClick={() => void togglePlan()}
        >
          {planned() ? 'Remove' : 'Add'}
        </button>
        <Show when={error()}>
          <p class="mt-1 max-w-32 text-xs text-[#a13d22]" role="alert">
            {error()}
          </p>
        </Show>
      </div>
    </article>
  )
}

function ImportSetup() {
  const [bookmarklet, setBookmarklet] = createSignal('')
  const [message, setMessage] = createSignal('')
  const prepare = () => {
    setBookmarklet(
      createAruodasBookmarklet(
        new URL(import.meta.env.BASE_URL, window.location.origin).toString(),
      ),
    )
  }

  return (
    <section class="border-b border-[#18241e] bg-[#e5ece8] px-4 py-5 sm:px-7">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 class="font-serif text-xl">Aruodas bookmarklet</h2>
          <p class="mt-1 text-xs text-[#647169]">
            Run it on an Aruodas land advert or your favorites page.
          </p>
        </div>
        <Show
          when={bookmarklet()}
          fallback={
            <button
              class="border border-[#204d3a] px-4 py-2 text-sm font-bold text-[#204d3a] disabled:opacity-50"
              onClick={prepare}
            >
              Prepare bookmarklet
            </button>
          }
        >
          <div class="flex flex-wrap gap-2">
            <a
              class="bg-[#204d3a] px-4 py-2 text-sm font-bold text-white"
              href={bookmarklet()}
              onClick={(event) => event.preventDefault()}
            >
              Import to Find Me Home
            </a>
            <button
              class="border border-[#204d3a] px-4 py-2 text-sm font-bold text-[#204d3a]"
              onClick={async () => {
                await navigator.clipboard.writeText(bookmarklet())
                setMessage('Copied')
              }}
            >
              Copy
            </button>
          </div>
        </Show>
      </div>
      <Show when={message()}>
        <p class="mt-2 text-right text-xs text-[#204d3a]">{message()}</p>
      </Show>
    </section>
  )
}

export const formatPrice = (value: number | null) =>
  value === null
    ? 'Unknown'
    : new Intl.NumberFormat('lt-LT', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(value)

export const formatArea = (value: number | null) =>
  value === null
    ? 'Unknown'
    : `${new Intl.NumberFormat('lt-LT').format(value)} a`

export const formatDate = (value: number | null) =>
  value === null
    ? 'Not yet'
    : new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
