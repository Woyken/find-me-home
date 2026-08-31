import { Link, createFileRoute, useRouter } from '@tanstack/solid-router'
import { For, Show, createSignal } from 'solid-js'
import {
  fetchSourceListings,
  getAruodasBookmarklet,
  updateVisitPlan,
} from '../server-functions/source-listings'
import type { SourceListingSummary } from '../server/source-listings'

export const Route = createFileRoute('/')({
  loader: () => fetchSourceListings(),
  component: Home,
})

function Home() {
  const listings = () => Route.useLoaderData()()
  const visitCount = () =>
    listings().filter((listing) => listing.visitPlanPosition !== null).length
  const [showImport, setShowImport] = createSignal(false)

  return (
    <main class="min-h-screen bg-[#edf0ea] px-4 pb-16 pt-4 text-[#18241e] sm:px-8 sm:pt-8">
      <div class="mx-auto max-w-6xl overflow-hidden border border-[#18241e] bg-[#faf9f4]">
        <header class="flex flex-wrap items-center justify-between gap-3 border-b border-[#18241e] px-4 py-4 sm:px-7">
          <h1 class="font-serif text-2xl">Find Me Home</h1>
          <div class="flex items-center gap-3">
            <span class="font-mono text-xs">{visitCount()} in Visit Plan</span>
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

function ListingRow(props: { listing: SourceListingSummary }) {
  const router = useRouter()
  const [busy, setBusy] = createSignal(false)
  const toggleVisit = async () => {
    setBusy(true)
    try {
      await updateVisitPlan({
        data: {
          id: props.listing.id,
          included: props.listing.visitPlanPosition === null,
        },
      })
      await router.invalidate({ sync: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <article class="grid gap-3 border-b border-[#18241e]/20 px-4 py-5 last:border-0 sm:grid-cols-[2.1fr_1fr_0.7fr_0.8fr_auto] sm:items-center sm:px-7">
      <div class="min-w-0">
        <p class="font-mono text-[9px] uppercase text-[#68756d]">
          Aruodas {props.listing.sourceId} · {props.listing.candidatePlotCount}{' '}
          {props.listing.candidatePlotCount === 1 ? 'plot' : 'plots'}
        </p>
        <Link
          class="mt-1 block font-serif text-xl leading-tight hover:underline"
          to="/source-listings/$sourceListingId"
          params={{ sourceListingId: String(props.listing.id) }}
        >
          {props.listing.title ?? `Aruodas advert ${props.listing.sourceId}`}
        </Link>
        <p class="mt-2 text-sm text-[#647169] sm:hidden">
          {props.listing.locationLabel ?? 'Location unknown'}
        </p>
      </div>
      <p class="hidden text-sm sm:block">
        {props.listing.locationLabel ?? 'Unknown'}
      </p>
      <b>{formatPrice(props.listing.priceEur)}</b>
      <b>{formatArea(props.listing.areaAres)}</b>
      <button
        class={`min-w-20 border px-3 py-2 text-xs font-bold disabled:opacity-50 ${
          props.listing.visitPlanPosition === null
            ? 'border-[#849087] hover:border-[#204d3a]'
            : 'border-[#204d3a] bg-[#d9e6d8] text-[#204d3a]'
        }`}
        disabled={busy()}
        onClick={toggleVisit}
      >
        {props.listing.visitPlanPosition === null
          ? 'Add'
          : `Visit #${props.listing.visitPlanPosition}`}
      </button>
      <Show when={props.listing.visitedAt}>
        <span class="text-xs text-[#647169] sm:col-start-2 sm:col-end-5">
          Visited {formatDate(props.listing.visitedAt)}
        </span>
      </Show>
    </article>
  )
}

function ImportSetup() {
  const [bookmarklet, setBookmarklet] = createSignal('')
  const [message, setMessage] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const prepare = async () => {
    setBusy(true)
    try {
      const result = await getAruodasBookmarklet({
        data: { origin: window.location.origin },
      })
      setBookmarklet(result.bookmarklet)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section class="border-b border-[#18241e] bg-[#e5ece8] px-4 py-5 sm:px-7">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 class="font-serif text-xl">Aruodas bookmarklet</h2>
          <p class="mt-1 text-xs text-[#647169]">
            Run it on an Aruodas land advert, then review before saving.
          </p>
        </div>
        <Show
          when={bookmarklet()}
          fallback={
            <button
              class="border border-[#204d3a] px-4 py-2 text-sm font-bold text-[#204d3a] disabled:opacity-50"
              disabled={busy()}
              onClick={prepare}
            >
              {busy() ? 'Preparing…' : 'Prepare bookmarklet'}
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

export const formatDate = (value: string | null) =>
  value === null
    ? 'Not yet'
    : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(
        new Date(`${value}Z`),
      )
