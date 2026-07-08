import { createFileRoute } from '@tanstack/solid-router'
import {
  For,
  Show,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
} from 'solid-js'
import {
  addAruodasPaste,
  fetchListings,
  geocodeListingAddress,
  resolveListingBoundaries,
  resolveListingLocationFn,
  startEvaluation,
  startScan,
  updateListing,
} from '../server-functions/listings'
import type { ListingRow } from '../server/scan'
import type { EvaluationRow } from '../server/evaluators'
import { ListingsMap } from '../components/ListingsMap'
import type { FocusRequest } from '../components/ListingsMap'

export const Route = createFileRoute('/')({
  component: Dsh,
})

function Dsh() {
  return (
    <Show when={typeof window !== 'undefined'} fallback={<div>Loading...</div>}>
      <Dashboard />
    </Show>
  )
}

const SOURCE_COLORS: Record<string, string> = {
  kampas: 'bg-emerald-100 text-emerald-800',
  domoplius: 'bg-sky-100 text-sky-800',
  skelbiu: 'bg-amber-100 text-amber-800',
  alio: 'bg-violet-100 text-violet-800',
  'aruodas-manual': 'bg-rose-100 text-rose-800',
}

const STATUS_STYLES: Record<string, string> = {
  pass: 'bg-emerald-500 text-white',
  fail: 'bg-red-500 text-white',
  warn: 'bg-amber-400 text-black',
  unknown: 'bg-gray-200 text-gray-500',
}

function Dashboard() {
  const loaderData = createMemo(() => fetchListings())
  const [override, setOverride] = createSignal<ReturnType<
    typeof loaderData
  > | null>(null)
  const data = () => override() ?? loaderData()
  const [scanBusy, setScanBusy] = createSignal(false)
  const [evalBusy, setEvalBusy] = createSignal(false)
  const [boundariesBusy, setBoundariesBusy] = createSignal(false)
  const [showPaste, setShowPaste] = createSignal(false)
  const [editingId, setEditingId] = createSignal<number>()
  const [selectedId, setSelectedId] = createSignal<number>()
  const [focusRequest, setFocusRequest] = createSignal<FocusRequest>()

  let pollTimer: ReturnType<typeof setInterval> | undefined
  const boundaryRefreshTimers: Array<ReturnType<typeof setTimeout>> = []
  const rowRefs = new Map<number, HTMLTableRowElement>()

  const refresh = async () => {
    const fresh = await fetchListings()
    setOverride(fresh)
    if (!fresh.scanRunning && !fresh.evaluating && pollTimer) {
      clearInterval(pollTimer)
      pollTimer = undefined
      setScanBusy(false)
      setEvalBusy(false)
    }
  }

  const startPolling = () => {
    if (pollTimer) return
    pollTimer = setInterval(refresh, 4000)
  }

  onCleanup(() => {
    if (pollTimer) clearInterval(pollTimer)
    for (const t of boundaryRefreshTimers) clearTimeout(t)
  })

  const onScan = async () => {
    setScanBusy(true)
    await startScan()
    startPolling()
  }

  const onEvaluate = async () => {
    setEvalBusy(true)
    await startEvaluation()
    startPolling()
  }

  const onResolveBoundaries = async () => {
    setBoundariesBusy(true)
    await resolveListingBoundaries()
    // Fire-and-forget on the server; there's no busy flag to poll, so refresh
    // a few times on a delay to pick up newly resolved boundary geometry.
    for (const delayMs of [3000, 7000, 12000, 20000]) {
      boundaryRefreshTimers.push(setTimeout(() => void refresh(), delayMs))
    }
    boundaryRefreshTimers.push(
      setTimeout(() => setBoundariesBusy(false), 20000),
    )
  }

  const onEdited = () => {
    setEditingId(undefined)
    setEvalBusy(true)
    void refresh()
    startPolling()
  }

  const onFocusListing = (id: number) => {
    setSelectedId(id)
    setFocusRequest({ id, nonce: Date.now() })
  }

  const onSelectListing = (id: number) => {
    setSelectedId(id)
    rowRefs.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const evalsByListing = createMemo(() => {
    const m = new Map<number, Map<string, EvaluationRow>>()
    for (const e of data().evaluations) {
      let inner = m.get(e.listing_id)
      if (!inner) {
        inner = new Map()
        m.set(e.listing_id, inner)
      }
      inner.set(e.requirement, e)
    }
    return m
  })

  const editingListing = createMemo(() => {
    const e = editingId()
    return data().listings.find((l) => l.id === e)
  })

  const scanStats = () => {
    const raw = data().lastScan?.stats_json
    if (!raw) return null
    try {
      return JSON.parse(raw) as {
        perSource?: Record<
          string,
          { found: number; examined: number; errors: Array<string> }
        >
      }
    } catch {
      return null
    }
  }

  return (
    <main class="mx-auto max-w-7xl p-6">
      <header class="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="text-3xl font-bold tracking-tight">Find Me Home</h1>
          <p class="text-sm text-gray-500">
            Land plots near Vilnius · 8–25 a · ≤ €60k · namų valda
          </p>
        </div>
        <div class="flex items-center gap-3">
          <button
            class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
            onClick={() => setShowPaste((v) => !v)}
          >
            Paste aruodas listing
          </button>
          <button
            class="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            disabled={evalBusy() || data().evaluating}
            onClick={onEvaluate}
          >
            {evalBusy() || data().evaluating ? 'Evaluating…' : 'Evaluate'}
          </button>
          <button
            class="rounded-lg bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
            disabled={boundariesBusy()}
            onClick={onResolveBoundaries}
          >
            {boundariesBusy() ? 'Resolving boundaries…' : 'Resolve boundaries'}
          </button>
          <button
            class="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            disabled={scanBusy() || data().scanRunning}
            onClick={onScan}
          >
            {scanBusy() || data().scanRunning ? 'Scanning…' : 'Scan now'}
          </button>
        </div>
      </header>

      <Show when={showPaste()}>
        <PasteForm
          onDone={() => {
            setShowPaste(false)
            void refresh()
          }}
        />
      </Show>

      <Show when={data().lastScan}>
        {(scan) => (
          <section class="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
            <div class="flex flex-wrap items-center gap-x-6 gap-y-1">
              <span>
                Last scan: <b>{scan().started_at}</b> — {scan().status}
              </span>
              <Show when={scanStats()?.perSource}>
                {(per) => (
                  <For each={Object.entries(per())}>
                    {([source, s]) => (
                      <span
                        class={`rounded px-2 py-0.5 ${SOURCE_COLORS[source] ?? 'bg-gray-100'}`}
                        title={s.errors.join('\n')}
                      >
                        {source}: {s.found} found
                        {s.errors.length > 0 ? ` · ${s.errors.length} err` : ''}
                      </span>
                    )}
                  </For>
                )}
              </Show>
            </div>
          </section>
        )}
      </Show>

      <section class="mb-6">
        <h2 class="mb-3 text-lg font-semibold">Map</h2>
        <ListingsMap
          listings={data().listings}
          requirements={data().requirements}
          evalsByListing={evalsByListing()}
          selectedId={selectedId()}
          onSelect={onSelectListing}
          focusRequest={focusRequest()}
        />
      </section>

      <section>
        <h2 class="mb-3 text-lg font-semibold">
          Listings ({data().listings.length})
        </h2>
        <Show
          when={data().listings.length > 0}
          fallback={
            <p class="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
              No listings yet — press “Scan now”.
            </p>
          }
        >
          <div class="overflow-x-auto rounded-lg border border-gray-200">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th class="px-3 py-2">Title / Address</th>
                  <th class="px-3 py-2">Price</th>
                  <th class="px-3 py-2">Area</th>
                  <th class="px-3 py-2">€/a</th>
                  <th class="px-3 py-2">Purpose</th>
                  <th class="px-3 py-2">Cadastral</th>
                  <th class="px-3 py-2">Coords</th>
                  <th class="px-3 py-2">Requirements</th>
                  <th class="px-3 py-2">Source</th>
                  <th class="px-3 py-2">Edit</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <For each={data().listings}>
                  {(l) => (
                    <ListingTableRow
                      listing={l}
                      requirements={data().requirements}
                      evals={evalsByListing().get(l.id)}
                      editing={editingId() === l.id}
                      selected={selectedId() === l.id}
                      onEdit={() =>
                        setEditingId((cur) => (cur === l.id ? undefined : l.id))
                      }
                      onFocus={() => onFocusListing(l.id)}
                      registerRow={(el) => rowRefs.set(l.id, el)}
                    />
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </section>

      <Show when={editingListing()}>
        <section class="mt-6 rounded-lg border border-amber-300 bg-amber-50/40 p-4">
          <EditPanel
            listing={editingListing()!}
            onCancel={() => setEditingId(undefined)}
            onSaved={onEdited}
          />
        </section>
      </Show>
    </main>
  )
}

function ListingTableRow(props: {
  listing: ListingRow
  requirements: Array<{ requirement: string; label: string; hard: boolean }>
  evals: Map<string, EvaluationRow> | undefined
  editing: boolean
  selected: boolean
  onEdit: () => void
  onFocus: () => void
  registerRow: (el: HTMLTableRowElement) => void
}) {
  const l = props.listing
  const price = l.price_eur
  const area = l.area_ares
  const pricePerAre = () => (price != null && area ? price / area : null)
  const overrideKeys = (): Array<string> => {
    if (!l.overrides_json) return []
    try {
      return Object.keys(
        JSON.parse(l.overrides_json) as Record<string, unknown>,
      )
    } catch {
      return []
    }
  }
  return (
    <tr
      ref={props.registerRow}
      class={
        props.selected
          ? 'bg-blue-50 ring-2 ring-inset ring-blue-400'
          : props.editing
            ? 'bg-amber-100/60'
            : 'hover:bg-blue-50/40'
      }
    >
      <td class="max-w-xs px-3 py-2">
        <a
          href={l.url}
          target="_blank"
          rel="noreferrer"
          class="font-medium text-blue-700 hover:underline"
        >
          {l.title ?? l.address ?? l.url}
        </a>
        <Show when={overrideKeys().length > 0}>
          <span
            class="ml-1 cursor-help text-xs text-amber-600"
            title={`Manually edited: ${overrideKeys().join(', ')}`}
          >
            ✎
          </span>
        </Show>
        <Show when={l.address && l.address !== l.title}>
          <div class="truncate text-xs text-gray-500">{l.address}</div>
        </Show>
      </td>
      <td class="whitespace-nowrap px-3 py-2 font-semibold">
        {price != null ? `€${price.toLocaleString('lt-LT')}` : '—'}
      </td>
      <td class="whitespace-nowrap px-3 py-2">
        {area != null ? `${area.toFixed(1)} a` : '—'}
      </td>
      <td class="whitespace-nowrap px-3 py-2 text-gray-600">
        {pricePerAre() != null ? `€${pricePerAre()!.toFixed(0)}` : '—'}
      </td>
      <td class="max-w-40 truncate px-3 py-2" title={l.purpose_text ?? ''}>
        {l.purpose_text ?? <span class="text-gray-400">unknown</span>}
      </td>
      <td class="whitespace-nowrap px-3 py-2 font-mono text-xs">
        {l.cadastral_number ?? <span class="text-gray-400">—</span>}
      </td>
      <td class="whitespace-nowrap px-3 py-2 text-xs">
        <Show
          when={l.lat != null}
          fallback={<span class="text-gray-400">unknown</span>}
        >
          <a
            class="text-blue-600 hover:underline"
            href={`https://www.google.com/maps?q=${l.lat},${l.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            {l.lat!.toFixed(4)}, {l.lng!.toFixed(4)}
          </a>
          <span class="ml-1 text-gray-400">({l.location_confidence})</span>
          <button
            class="ml-1 rounded border border-gray-300 px-1 text-xs hover:bg-gray-50"
            title="Show on map"
            onClick={props.onFocus}
          >
            📍
          </button>
        </Show>
      </td>
      <td class="px-3 py-2">
        <div class="flex flex-wrap gap-1">
          <For each={props.requirements}>
            {(req) => (
              <RequirementBadge
                meta={req}
                row={props.evals?.get(req.requirement)}
              />
            )}
          </For>
        </div>
      </td>
      <td class="px-3 py-2">
        <span
          class={`rounded px-2 py-0.5 text-xs ${SOURCE_COLORS[l.source] ?? 'bg-gray-100'}`}
        >
          {l.source}
        </span>
      </td>
      <td class="px-3 py-2">
        <button
          class="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
          title="Edit listing"
          onClick={(ev) => {
            console.log(ev)
            // debugger;
            props.onEdit()
          }}
        >
          ✎
        </button>
      </td>
    </tr>
  )
}

const BADGE_ABBREV: Record<string, string> = {
  size: 'Sz',
  price: '€',
  radius: 'Km',
  purpose: 'Pu',
  walk_to_stop: 'Wk',
  commute: 'Cm',
  eso_cost: 'El',
  budget: 'Bd',
  crime: 'Cr',
  trees: 'Tr',
  water_sewage: 'Wa',
  legal_flags: 'Lg',
  noise: 'Ns',
  livability: 'Lv',
}

function RequirementBadge(props: {
  meta: { requirement: string; label: string; hard: boolean }
  row: EvaluationRow | undefined
}) {
  const status = () => props.row?.status ?? 'unknown'
  const tooltip = () => {
    const kind = props.meta.hard ? 'hard' : 'soft'
    if (!props.row) return `${props.meta.label} (${kind}): not evaluated yet`
    let evidence = ''
    try {
      const items = JSON.parse(props.row.evidence_json ?? '[]') as Array<{
        source: string
        detail: string
      }>
      evidence = items.map((i) => `[${i.source}] ${i.detail}`).join('\n')
    } catch {
      /* ignore */
    }
    return `${props.meta.label} (${kind}): ${props.row.status.toUpperCase()}${props.row.value ? ` — ${props.row.value}` : ''}\nconfidence: ${props.row.confidence ?? '?'}\n${evidence}`
  }
  return (
    <span
      class={`cursor-help rounded px-1.5 py-0.5 font-mono text-[10px] ${props.meta.hard ? 'font-bold' : 'font-normal'} ${STATUS_STYLES[status()] ?? STATUS_STYLES.unknown}`}
      title={tooltip()}
    >
      <span class="font-semibold">
        {BADGE_ABBREV[props.meta.requirement] ??
          props.meta.requirement.slice(0, 2)}
      </span>
      <Show when={props.row?.value && status() !== 'unknown'}>
        <span class="ml-1 font-normal">{props.row!.value}</span>
      </Show>
    </span>
  )
}

function EditPanel(props: {
  listing: ListingRow
  onCancel: () => void
  onSaved: () => void
}) {
  console.log('rendering edit panel for listing', props.listing.id)
  const l = untrack(() => props.listing)
  const [address, setAddress] = createSignal(l.address ?? '')
  const [lat, setLat] = createSignal(l.lat != null ? String(l.lat) : '')
  const [lng, setLng] = createSignal(l.lng != null ? String(l.lng) : '')
  const [confidence, setConfidence] = createSignal<'exact' | 'approx'>(
    l.location_confidence === 'exact' ? 'exact' : 'approx',
  )
  const [purpose, setPurpose] = createSignal(l.purpose_text ?? '')
  const [price, setPrice] = createSignal(
    l.price_eur != null ? String(l.price_eur) : '',
  )
  const [area, setArea] = createSignal(
    l.area_ares != null ? String(l.area_ares) : '',
  )
  const [cadastral, setCadastral] = createSignal(l.cadastral_number ?? '')

  const [busy, setBusy] = createSignal(false)
  const [geocoding, setGeocoding] = createSignal(false)
  const [resolving, setResolving] = createSignal(false)
  const [resolveNote, setResolveNote] = createSignal<string | null>(null)
  const [error, setError] = createSignal<string | null>(null)
  const [candidates, setCandidates] = createSignal<
    Array<{
      lat: number
      lng: number
      displayName: string
      source?: 'regia' | 'nominatim'
      confidence?: 'exact' | 'approx'
    }>
  >([])

  const geocode = async () => {
    setGeocoding(true)
    setError(null)
    try {
      const res = await geocodeListingAddress({
        data: { listingId: l.id, address: address() },
      })
      setCandidates(res.candidates)
      if (res.candidates.length === 0) setError('No geocoding results')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setGeocoding(false)
    }
  }

  const pickCandidate = (c: {
    lat: number
    lng: number
    confidence?: 'exact' | 'approx'
  }) => {
    setLat(String(c.lat))
    setLng(String(c.lng))
    setConfidence(c.confidence === 'exact' ? 'exact' : 'approx')
    setCandidates([])
  }

  const resolve = async () => {
    setResolving(true)
    setError(null)
    setResolveNote(null)
    try {
      const summary = await resolveListingLocationFn({
        data: { listingId: l.id },
      })
      if (summary.address !== null) setAddress(summary.address)
      setLat(summary.lat != null ? String(summary.lat) : '')
      setLng(summary.lng != null ? String(summary.lng) : '')
      setConfidence(summary.locationConfidence === 'exact' ? 'exact' : 'approx')
      if (summary.cadastral !== null) setCadastral(summary.cadastral)
      setResolveNote(
        summary.filled.length > 0
          ? `Filled: ${summary.filled.join(', ')}`
          : 'Nothing new resolved',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setResolving(false)
    }
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const fields: {
        lat?: number
        lng?: number
        location_confidence?: 'exact' | 'approx'
        address?: string
        purpose_text?: string
        price_eur?: number
        area_ares?: number
        cadastral_number?: string
      } = {}
      const clear: Array<
        | 'lat'
        | 'lng'
        | 'location_confidence'
        | 'address'
        | 'purpose_text'
        | 'price_eur'
        | 'area_ares'
        | 'cadastral_number'
      > = []

      const latVal = lat().trim()
      if (latVal === '') {
        if (l.lat != null) clear.push('lat')
      } else if (Number(latVal) !== l.lat) {
        fields.lat = Number(latVal)
      }
      const lngVal = lng().trim()
      if (lngVal === '') {
        if (l.lng != null) clear.push('lng')
      } else if (Number(lngVal) !== l.lng) {
        fields.lng = Number(lngVal)
      }
      if (confidence() !== l.location_confidence) {
        fields.location_confidence = confidence()
      }
      if (address().trim() !== (l.address ?? '')) {
        fields.address = address().trim()
      }
      if (purpose().trim() !== (l.purpose_text ?? '')) {
        fields.purpose_text = purpose().trim()
      }
      if (cadastral().trim() !== (l.cadastral_number ?? '')) {
        fields.cadastral_number = cadastral().trim()
      }
      const priceVal = price().trim()
      if (priceVal === '') {
        if (l.price_eur != null) clear.push('price_eur')
      } else if (Number(priceVal) !== l.price_eur) {
        fields.price_eur = Number(priceVal)
      }
      const areaVal = area().trim()
      if (areaVal === '') {
        if (l.area_ares != null) clear.push('area_ares')
      } else if (Number(areaVal) !== l.area_ares) {
        fields.area_ares = Number(areaVal)
      }

      await updateListing({ data: { listingId: l.id, fields, clear } })
      props.onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const inputClass = 'w-full rounded border border-gray-300 px-2 py-1 text-sm'
  const labelClass = 'block text-xs font-medium text-gray-600'

  return (
    <div class="space-y-3">
      <h3 class="text-sm font-semibold">Edit listing #{l.id}</h3>

      <div>
        <label class={labelClass}>Address</label>
        <div class="flex gap-2">
          <input
            class={inputClass}
            value={address()}
            onInput={(e) => setAddress(e.currentTarget.value)}
          />
          <button
            type="button"
            class="whitespace-nowrap rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            disabled={geocoding()}
            onClick={geocode}
          >
            {geocoding() ? 'Geocoding…' : 'Geocode'}
          </button>
          <button
            type="button"
            class="whitespace-nowrap rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            disabled={resolving()}
            onClick={resolve}
          >
            {resolving() ? 'Resolving…' : 'Resolve'}
          </button>
        </div>
        <Show when={resolveNote()}>
          <p class="mt-1 text-xs text-indigo-700">{resolveNote()}</p>
        </Show>
      </div>

      <Show when={candidates().length > 0}>
        <ul class="space-y-1 rounded border border-gray-200 bg-white p-2 text-xs">
          <For each={candidates()}>
            {(c) => (
              <li>
                <button
                  type="button"
                  class="w-full text-left hover:bg-blue-50"
                  onClick={() => pickCandidate(c)}
                >
                  <span
                    class={
                      c.source === 'regia'
                        ? 'mr-1 rounded bg-green-100 px-1 py-0.5 text-[10px] font-semibold text-green-700'
                        : 'mr-1 rounded bg-gray-100 px-1 py-0.5 text-[10px] font-semibold text-gray-600'
                    }
                  >
                    {c.source === 'regia' ? 'regia' : 'OSM'}
                  </span>
                  <span class="font-mono text-blue-700">
                    {c.lat.toFixed(5)}, {c.lng.toFixed(5)}
                  </span>{' '}
                  — {c.displayName}
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <label class={labelClass}>Lat</label>
          <input
            class={inputClass}
            value={lat()}
            onInput={(e) => setLat(e.currentTarget.value)}
          />
        </div>
        <div>
          <label class={labelClass}>Lng</label>
          <input
            class={inputClass}
            value={lng()}
            onInput={(e) => setLng(e.currentTarget.value)}
          />
        </div>
        <div>
          <label class={labelClass}>Confidence</label>
          <select
            class={inputClass}
            value={confidence()}
            onChange={(e) =>
              setConfidence(
                e.currentTarget.value === 'exact' ? 'exact' : 'approx',
              )
            }
          >
            <option value="approx">approx</option>
            <option value="exact">exact</option>
          </select>
        </div>
        <div>
          <label class={labelClass}>Cadastral</label>
          <input
            class={inputClass}
            value={cadastral()}
            onInput={(e) => setCadastral(e.currentTarget.value)}
          />
        </div>
      </div>

      <div>
        <label class={labelClass}>Purpose</label>
        <div class="flex gap-2">
          <input
            class={inputClass}
            value={purpose()}
            onInput={(e) => setPurpose(e.currentTarget.value)}
          />
          <For each={['namų valda', 'sodų', 'žemės ūkio']}>
            {(p) => (
              <button
                type="button"
                class="whitespace-nowrap rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                onClick={() => setPurpose(p)}
              >
                {p}
              </button>
            )}
          </For>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class={labelClass}>Price €</label>
          <input
            class={inputClass}
            value={price()}
            onInput={(e) => setPrice(e.currentTarget.value)}
          />
        </div>
        <div>
          <label class={labelClass}>Area a</label>
          <input
            class={inputClass}
            value={area()}
            onInput={(e) => setArea(e.currentTarget.value)}
          />
        </div>
      </div>

      <Show when={error()}>
        <p class="text-sm text-red-600">{error()}</p>
      </Show>

      <div class="flex gap-2">
        <button
          type="button"
          class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          disabled={busy()}
          onClick={save}
        >
          {busy() ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
          onClick={props.onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function PasteForm(props: { onDone: () => void }) {
  const [url, setUrl] = createSignal('')
  const [pageText, setPageText] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const submit = async (e: Event) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await addAruodasPaste({ data: { url: url(), pageText: pageText() } })
      props.onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      class="mb-6 space-y-3 rounded-lg border border-gray-200 p-4"
      onSubmit={submit}
    >
      <h3 class="font-semibold">Add aruodas.lt listing manually</h3>
      <p class="text-xs text-gray-500">
        Open the listing in your browser, copy the URL and the page text
        (Ctrl+A, Ctrl+C), and paste both below.
      </p>
      <input
        class="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        placeholder="https://www.aruodas.lt/sklypai/..."
        value={url()}
        onInput={(e) => setUrl(e.currentTarget.value)}
      />
      <textarea
        class="h-40 w-full rounded border border-gray-300 px-3 py-2 text-sm"
        placeholder="Paste the full page text here…"
        value={pageText()}
        onInput={(e) => setPageText(e.currentTarget.value)}
      />
      <Show when={error()}>
        <p class="text-sm text-red-600">{error()}</p>
      </Show>
      <button
        type="submit"
        class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        disabled={busy()}
      >
        {busy() ? 'Saving…' : 'Save listing'}
      </button>
    </form>
  )
}
