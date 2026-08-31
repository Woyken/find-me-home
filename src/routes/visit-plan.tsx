import { Link, createFileRoute, useRouter } from '@tanstack/solid-router'
import { For, Show, createSignal } from 'solid-js'
import {
  fetchVisitPlan,
  reorderVisitPlan,
  updateVisitPlan,
} from '../server-functions/source-listings'
import type { SourceListingSummary } from '../server/source-listings'
import { formatArea, formatDate, formatPrice } from './index'

export const Route = createFileRoute('/visit-plan')({
  loader: () => fetchVisitPlan(),
  component: VisitPlanPage,
})

function VisitPlanPage() {
  const plan = () => Route.useLoaderData()()
  const router = useRouter()
  const [busyId, setBusyId] = createSignal<number | null>(null)

  const move = async (index: number, offset: -1 | 1) => {
    const destination = index + offset
    if (destination < 0 || destination >= plan().length) return
    const ids = plan().map((item) => item.id)
    ;[ids[index], ids[destination]] = [ids[destination], ids[index]]
    setBusyId(ids[destination] ?? null)
    try {
      await reorderVisitPlan({ data: { ids } })
      await router.invalidate({ sync: true })
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (id: number) => {
    setBusyId(id)
    try {
      await updateVisitPlan({ data: { id, included: false } })
      await router.invalidate({ sync: true })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main class="min-h-screen bg-[#edf0ea] px-4 py-6 text-[#18241e] sm:px-8 sm:py-10">
      <div class="mx-auto max-w-5xl">
        <Link class="text-sm font-bold text-[#315f73] underline" to="/">
          ← Saved Source Listings
        </Link>

        <header class="mt-7 border-y border-[#18241e] bg-[#faf9f4] px-5 py-7 sm:flex sm:items-end sm:justify-between sm:px-8">
          <div>
            <p class="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#647169]">
              One ordered list
            </p>
            <h1 class="mt-2 font-serif text-4xl sm:text-5xl">Visit Plan</h1>
          </div>
          <p class="mt-4 font-mono text-xs sm:mt-0">
            {plan().length} {plan().length === 1 ? 'stop' : 'stops'}
          </p>
        </header>

        <Show
          when={plan().length > 0}
          fallback={
            <section class="border-b border-[#18241e] bg-[#faf9f4] px-5 py-14 text-center sm:px-8">
              <h2 class="font-serif text-2xl">No visits planned yet</h2>
              <p class="mx-auto mt-2 max-w-md text-sm text-[#647169]">
                Add Source Listings from your saved collection. The first one
                you add becomes the first stop.
              </p>
              <Link
                class="mt-6 inline-block bg-[#204d3a] px-5 py-3 text-sm font-bold text-white"
                to="/"
              >
                Choose Source Listings
              </Link>
            </section>
          }
        >
          <ol class="border-b border-[#18241e] bg-[#faf9f4]">
            <For each={plan()}>
              {(listing, index) => (
                <VisitPlanEntry
                  listing={listing}
                  index={index()}
                  count={plan().length}
                  busy={busyId() !== null}
                  onMove={(offset) => move(index(), offset)}
                  onRemove={() => remove(listing.id)}
                />
              )}
            </For>
          </ol>
        </Show>
      </div>
    </main>
  )
}

function VisitPlanEntry(props: {
  listing: SourceListingSummary
  index: number
  count: number
  busy: boolean
  onMove: (offset: -1 | 1) => void
  onRemove: () => void
}) {
  const name = () =>
    props.listing.title ?? `Aruodas advert ${props.listing.sourceId}`

  return (
    <li class="grid gap-5 border-b border-[#18241e]/25 px-5 py-6 last:border-0 sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:items-center sm:px-8">
      <div class="flex items-baseline gap-2 sm:block">
        <span class="font-serif text-3xl">{props.index + 1}</span>
        <span class="font-mono text-[9px] uppercase tracking-wider text-[#647169] sm:block">
          Stop
        </span>
      </div>

      <div class="min-w-0">
        <p class="font-mono text-[9px] uppercase tracking-wider text-[#647169]">
          Aruodas {props.listing.sourceId} · {props.listing.candidatePlotCount}{' '}
          {props.listing.candidatePlotCount === 1 ? 'plot' : 'plots'}
        </p>
        <Link
          class="mt-1 block font-serif text-2xl leading-tight hover:underline"
          to="/source-listings/$sourceListingId"
          params={{ sourceListingId: String(props.listing.id) }}
        >
          {name()}
        </Link>
        <p class="mt-2 text-sm text-[#526058]">
          {props.listing.locationLabel ?? 'Location unknown'}
        </p>
        <div class="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <b>{formatPrice(props.listing.priceEur)}</b>
          <b>{formatArea(props.listing.areaAres)}</b>
          <Show when={props.listing.visitedAt}>
            <span class="text-[#647169]">
              Last visited {formatDate(props.listing.visitedAt)}
            </span>
          </Show>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-2 sm:grid-cols-2">
        <button
          aria-label={`Move ${name()} up`}
          class="min-h-11 border border-[#849087] px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-30"
          disabled={props.busy || props.index === 0}
          onClick={() => props.onMove(-1)}
        >
          ↑ <span class="sr-only">Move up</span>
        </button>
        <button
          aria-label={`Move ${name()} down`}
          class="min-h-11 border border-[#849087] px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-30"
          disabled={props.busy || props.index === props.count - 1}
          onClick={() => props.onMove(1)}
        >
          ↓ <span class="sr-only">Move down</span>
        </button>
        <button
          class="min-h-11 border border-[#a84f36] px-3 py-2 text-xs font-bold text-[#8b3f2c] disabled:opacity-50 sm:col-span-2"
          disabled={props.busy}
          onClick={props.onRemove}
        >
          Remove
        </button>
      </div>
    </li>
  )
}
