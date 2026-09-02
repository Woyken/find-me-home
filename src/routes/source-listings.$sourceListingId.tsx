import { For, Show, createMemo } from 'solid-js'
import { useHousehold } from '../households/context'
import { paths } from '../paths'
import { formatArea, formatPrice } from './index'

export const preloadSourceListing = () => undefined

export default function SourceListingPage(props: {
  params: Record<string, string | undefined>
}) {
  const household = useHousehold()
  const listing = createMemo(() =>
    household.getSourceListing(props.params.sourceListingId ?? ''),
  )
  return (
    <main class="min-h-screen bg-[#f6f4ec] px-5 py-8 text-[#17231d] sm:px-10">
      <Show when={listing()} fallback={<p>Source Listing not found.</p>}>
        {(item) => (
          <div class="mx-auto max-w-5xl">
            <a
              class="text-sm font-bold text-[#315f73] underline"
              href={paths.home}
            >
              Saved Source Listings
            </a>
            <header class="mt-8 border-b border-[#17231d]/20 pb-8">
              <p class="font-mono text-xs font-bold uppercase text-[#315f73]">
                Aruodas · {item().sourceId}
              </p>
              <h1 class="mt-3 font-serif text-4xl sm:text-6xl">
                {item().title ?? 'Untitled Source Listing'}
              </h1>
              <p class="mt-4 text-lg text-[#607067]">
                {item().address ?? 'Location not recorded'}
              </p>
            </header>
            <div class="mt-8 grid gap-8 lg:grid-cols-[1fr_18rem]">
              <section>
                <h2 class="font-serif text-3xl">Candidate Plots</h2>
                <For each={item().candidatePlots}>
                  {(plot, index) => (
                    <article class="mt-5 border border-[#17231d]/20 bg-white p-6">
                      <p class="font-mono text-xs font-bold uppercase text-[#607067]">
                        Candidate Plot {index() + 1}
                      </p>
                      <dl class="mt-5 grid gap-5 sm:grid-cols-2">
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
                        <Detail label="Notes" value={plot.notes ?? 'None'} />
                        <Detail
                          label="Recorded Location Clue"
                          value={
                            plot.parcelNumberClue ??
                            (plot.latitudeClue !== null &&
                            plot.longitudeClue !== null
                              ? `${plot.latitudeClue}, ${plot.longitudeClue}`
                              : plot.addressClue) ??
                            'None'
                          }
                        />
                      </dl>
                    </article>
                  )}
                </For>
              </section>
              <aside>
                <Show when={item().photos[0]}>
                  {(photo) => (
                    <img
                      class="aspect-[4/3] w-full object-cover"
                      src={photo()}
                      alt=""
                    />
                  )}
                </Show>
                <div class="mt-5 bg-[#e7edf0] p-5">
                  <p>{item().description ?? 'No description imported.'}</p>
                  <a
                    class="mt-5 inline-block font-bold text-[#315f73] underline"
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
      <dt class="font-mono text-xs uppercase text-[#607067]">{props.label}</dt>
      <dd class="mt-1 font-bold">{props.value}</dd>
    </div>
  )
}
