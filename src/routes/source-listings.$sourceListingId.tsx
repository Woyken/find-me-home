import { Link, createFileRoute, useRouter } from '@tanstack/solid-router'
import { For, Show, createSignal } from 'solid-js'
import {
  fetchSourceListing,
  updateVisitPlan,
} from '../server-functions/source-listings'
import { formatArea, formatDate, formatPrice } from './index'

export const Route = createFileRoute('/source-listings/$sourceListingId')({
  loader: ({ params }) =>
    fetchSourceListing({ data: { id: Number(params.sourceListingId) } }),
  component: SourceListingPage,
})

function SourceListingPage() {
  const listing = () => Route.useLoaderData()()
  const router = useRouter()
  const [busy, setBusy] = createSignal(false)
  const toggle = async () => {
    const current = listing()
    if (!current) return
    setBusy(true)
    try {
      await updateVisitPlan({
        data: { id: current.id, included: current.visitPlanPosition === null },
      })
      await router.invalidate({ sync: true })
    } finally {
      setBusy(false)
    }
  }
  return (
    <main class="min-h-screen bg-[#f6f4ec] px-5 py-8 text-[#17231d] sm:px-10">
      <Show when={listing()} fallback={<p>Source Listing not found.</p>}>
        {(item) => (
          <div class="mx-auto max-w-5xl">
            <Link class="text-sm font-bold text-[#315f73] underline" to="/">
              ← Saved Source Listings
            </Link>
            <header class="mt-8 border-b border-[#17231d]/20 pb-8">
              <div class="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
                <div>
                  <p class="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#315f73]">
                    Aruodas · {item().sourceId}
                  </p>
                  <h1 class="mt-3 max-w-3xl font-serif text-4xl leading-tight sm:text-6xl">
                    {item().title ?? 'Untitled Source Listing'}
                  </h1>
                  <p class="mt-4 text-lg text-[#607067]">
                    {item().address ?? 'Location not recorded'}
                  </p>
                </div>
                <button
                  class="border border-[#24483a] px-5 py-3 font-bold text-[#24483a] hover:bg-[#24483a] hover:text-white disabled:opacity-50"
                  disabled={busy()}
                  onClick={toggle}
                >
                  {item().visitPlanPosition === null
                    ? 'Add to Visit Plan'
                    : 'Remove from plan'}
                </button>
              </div>
            </header>
            <div class="mt-8 grid gap-8 lg:grid-cols-[1fr_18rem]">
              <section>
                <h2 class="font-serif text-3xl">Candidate Plots</h2>
                <div class="mt-5 space-y-4">
                  <For each={item().candidatePlots}>
                    {(plot, index) => (
                      <article class="border-l-4 border-[#d96a45] bg-white p-6">
                        <p class="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#607067]">
                          Candidate Plot {index() + 1}
                        </p>
                        <h3 class="mt-2 font-serif text-2xl">
                          {plot.name ?? 'Candidate Plot'}
                        </h3>
                        <div class="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                          <Detail
                            label="Price"
                            value={formatPrice(plot.priceEur)}
                          />
                          <Detail
                            label="Area"
                            value={formatArea(plot.areaAres)}
                          />
                          <Detail
                            label="Purpose"
                            value={plot.purposeText ?? 'Unknown'}
                          />
                          <div>
                            <Detail
                              label={
                                plot.coordinateCluePrecision === 'approx'
                                  ? 'Approximate location'
                                  : 'Location clue'
                              }
                              value={
                                plot.parcelNumberClue ??
                                plot.addressClue ??
                                (plot.latitudeClue !== null
                                  ? `${plot.latitudeClue}, ${plot.longitudeClue}`
                                  : 'Unknown')
                              }
                            />
                            <Show
                              when={
                                plot.latitudeClue !== null &&
                                plot.longitudeClue !== null
                              }
                            >
                              <a
                                class="mt-2 inline-block text-xs font-bold text-[#315f73] underline"
                                href={`https://www.google.com/maps/dir/?api=1&destination=${plot.latitudeClue},${plot.longitudeClue}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Directions
                              </a>
                            </Show>
                          </div>
                        </div>
                        <Show when={plot.notes}>
                          <p class="mt-5 border-t border-[#17231d]/10 pt-4 text-sm text-[#526058]">
                            {plot.notes}
                          </p>
                        </Show>
                      </article>
                    )}
                  </For>
                </div>
              </section>
              <aside class="space-y-5">
                <Show when={item().photoUrl}>
                  {(photo) => (
                    <img
                      class="aspect-[4/3] w-full object-cover"
                      src={photo()}
                      alt=""
                    />
                  )}
                </Show>
                <div class="bg-[#e7edf0] p-5">
                  <Detail
                    label="Candidate Plots"
                    value={String(item().candidatePlotCount)}
                  />
                  <div class="mt-4">
                    <Detail
                      label="Last visited"
                      value={formatDate(item().visitedAt)}
                    />
                  </div>
                  <a
                    class="mt-5 inline-block text-sm font-bold text-[#315f73] underline"
                    href={item().url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open original advert
                  </a>
                </div>
              </aside>
            </div>
          </div>
        )}
      </Show>
    </main>
  )
}

function Detail(props: { label: string; value: string }) {
  return (
    <div>
      <p class="font-mono text-[10px] uppercase tracking-[0.12em] text-[#748078]">
        {props.label}
      </p>
      <p class="mt-1 font-bold">{props.value}</p>
    </div>
  )
}
