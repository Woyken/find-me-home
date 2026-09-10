import { Show, action, affects, createEffect, createMemo, createSignal, isPending } from 'solid-js'
import { useHousehold } from '../households/context'
import type { RegisteredParcelPreview } from '../location-resolution'
import { parseRegiaMapLink, regiaMapLinkMessage } from '../regia-link'
import { candidatePlotName } from '../source-listings/map'
import { findAlreadyMarkedArea } from '../source-listings/mark-area'
import type { SourceListingDetail } from '../source-listings/model'
import { Modal } from './Modal'

export function MarkAreaDialog(props: {
  open: boolean
  onClose: () => void
  listing: () => SourceListingDetail | undefined
  onMarkByHand: () => Promise<void>
  onMarkFromRegia: (input: {
    latitude: number
    longitude: number
    parcelNumber: string | null
  }) => Promise<void>
  onShowExisting: (plotId: string) => void
}) {
  const household = useHousehold()
  const [link, setLink] = createSignal('')
  const [preview, setPreview] = createSignal<RegisteredParcelPreview | null>()
  const [lookingUp, setLookingUp] = createSignal(false)
  const [submitError, setSubmitError] = createSignal('')
  let request = 0
  const parsed = createMemo(() => (link().trim() ? parseRegiaMapLink(link()) : undefined))
  const parsedPoint = createMemo(() => {
    const result = parsed()
    return result?.ok ? result : undefined
  })
  const parseFailure = createMemo(() => {
    const result = parsed()
    return result && !result.ok ? result.reason : undefined
  })
  const duplicate = createMemo(() => {
    const current = props.listing()
    const point = parsed()
    if (!current || !point?.ok || lookingUp()) return undefined
    return findAlreadyMarkedArea(current, {
      parcelNumber: preview()?.uniqueNumber ?? null,
      latitude: point.latitude,
      longitude: point.longitude,
    })
  })
  const ready = () => parsedPoint() !== undefined && !lookingUp()

  createEffect(
    () => props.open,
    (open) => {
      if (!open) return
      request += 1
      setLink('')
      setPreview(undefined)
      setLookingUp(false)
      setSubmitError('')
    },
  )

  const lookUp = (value: string) => {
    setLink(value)
    setSubmitError('')
    const point = value.trim() ? parseRegiaMapLink(value) : undefined
    const currentRequest = ++request
    setPreview(undefined)
    if (!point?.ok) {
      setLookingUp(false)
      return
    }
    setLookingUp(true)
    void household
      .previewRegisteredParcel(point.latitude, point.longitude)
      .then((result) => {
        if (currentRequest !== request) return
        setPreview(result)
      })
      .catch(() => {
        if (currentRequest !== request) return
        setPreview(null)
      })
      .finally(() => {
        if (currentRequest === request) setLookingUp(false)
      })
  }

  const markFromRegia = action(function* () {
    affects(props.listing)
    const point = parsed()
    if (!point?.ok || !ready() || duplicate()) return
    setSubmitError('')
    try {
      yield props.onMarkFromRegia({
        latitude: point.latitude,
        longitude: point.longitude,
        parcelNumber: preview()?.uniqueNumber ?? null,
      })
      props.onClose()
    } catch (caught) {
      setSubmitError(errorMessage(caught))
      throw caught
    }
  })
  const markByHand = action(function* () {
    affects(props.listing)
    setSubmitError('')
    try {
      yield props.onMarkByHand()
      props.onClose()
    } catch (caught) {
      setSubmitError(errorMessage(caught))
      throw caught
    }
  })
  const pending = () => isPending(props.listing)

  return (
    <Modal open={props.open} onClose={props.onClose} label="Mark another area">
      <h2>Mark another area</h2>
      <p>Paste a Regia link to mark the exact parcel, or start by hand.</p>
      <label class="f">
        Regia link
        <input
          type="url"
          inputmode="url"
          placeholder="https://regia.lt/map/regia2?x=…&y=…"
          value={link()}
          onInput={(event) => lookUp(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || !ready() || duplicate() || pending()) return
            event.preventDefault()
            void markFromRegia().catch(() => undefined)
          }}
        />
      </label>
      <p class="small muted">In Regia, click the parcel, then Share → copy the link.</p>
      <Show when={parseFailure()}>
        <p class="small bad" role="alert">
          {regiaMapLinkMessage[parseFailure()!]}
        </p>
      </Show>
      <Show when={parsedPoint()}>
        <div class="panel blue" data-testid="regia-preview">
          <Show
            when={lookingUp()}
            fallback={<Preview preview={preview()} point={parsedPoint()!} />}
          >
            Looking up the parcel…
          </Show>
        </div>
      </Show>
      <Show
        when={duplicate()}
        fallback={
          <>
            <button
              class="btn"
              type="button"
              disabled={!ready() || pending()}
              onClick={() => void markFromRegia().catch(() => undefined)}
            >
              Mark this area
            </button>
            <Show when={submitError()}>
              <p class="small bad" role="alert">
                {submitError()}
              </p>
            </Show>
          </>
        }
      >
        {(existing) => (
          <>
            <p class="small bad" role="alert">
              You've already marked this area (
              {candidatePlotName(
                existing(),
                props.listing()!.candidatePlots.findIndex((plot) => plot.id === existing().id),
                props.listing()!.candidatePlots.length,
              )}
              )
            </p>
            <button
              class="btn ghost"
              type="button"
              onClick={() => {
                props.onShowExisting(existing().id)
                props.onClose()
              }}
            >
              Show it
            </button>
          </>
        )}
      </Show>
      <div class="or">
        <span>or</span>
      </div>
      <button
        class="btn ghost"
        type="button"
        disabled={pending()}
        onClick={() => void markByHand().catch(() => undefined)}
      >
        Mark by hand
      </button>
      <p class="small muted">
        Copies the price, area and purpose from the advert so you only change what differs.
      </p>
    </Modal>
  )
}

function Preview(props: {
  preview: RegisteredParcelPreview | null | undefined
  point: { ok: true; latitude: number; longitude: number }
}) {
  const coordinates = () => `Coordinates ${props.point.latitude}, ${props.point.longitude}`
  return (
    <Show
      when={props.preview}
      fallback={
        <>
          <b>No registered parcel here</b>
          <p>We'll mark the exact point only.</p>
          <p class="small muted">{coordinates()}</p>
        </>
      }
    >
      {(parcel) => (
        <>
          <b>Parcel {parcel().uniqueNumber ?? 'unknown'}</b>
          <p>
            {formatArea(parcel().areaAres)} · {parcel().purposeText ?? 'purpose unknown'}
          </p>
          <p class="small muted">{coordinates()}</p>
        </>
      )}
    </Show>
  )
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))
const formatArea = (areaAres: number | null) =>
  areaAres === null ? 'area unknown' : `${areaAres.toLocaleString('lt-LT')} a`
