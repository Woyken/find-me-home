import { Show, createEffect, createSignal, createUniqueId, onCleanup } from 'solid-js'
import type { Accessor } from 'solid-js'
import { googleMapsLocationUrl, wazeDirectionsUrl } from '../directions'
import type { Coordinate } from '../directions'
import { PinIcon } from './icons'

let closeActivePicker: (() => void) | undefined

export function DirectionsPicker(props: {
  destination: Accessor<Coordinate | null>
  class?: string
}) {
  const [open, setOpen] = createSignal(false)
  const popupId = createUniqueId()
  let root: HTMLDivElement | undefined
  let trigger: HTMLButtonElement | undefined
  const close = (returnFocus = false) => {
    setOpen(false)
    if (closeActivePicker === close) closeActivePicker = undefined
    if (returnFocus) trigger?.focus()
  }
  const openPicker = () => {
    closeActivePicker?.()
    closeActivePicker = close
    setOpen(true)
  }

  const closeOutside = (event: PointerEvent) => {
    if (root && event.target instanceof Node && !root.contains(event.target)) close()
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('pointerdown', closeOutside)
    onCleanup(() => document.removeEventListener('pointerdown', closeOutside))
  }
  onCleanup(() => {
    if (closeActivePicker === close) closeActivePicker = undefined
  })
  createEffect(
    () => props.destination() === null,
    (missing) => {
      if (missing) close()
    },
  )

  return (
    <div class={`directions-picker ${props.class ?? ''}`} ref={root}>
      <button
        ref={trigger}
        class="btn ghost sm"
        type="button"
        aria-expanded={open() ? 'true' : 'false'}
        aria-controls={popupId}
        disabled={props.destination() === null}
        onClick={() => {
          if (open()) close()
          else openPicker()
        }}
        onKeyDown={(event) => event.key === 'Escape' && close(true)}
      >
        <PinIcon /> Directions
      </button>
      <Show when={open() && props.destination()}>
        {(destination) => (
          <div
            id={popupId}
            class="directions-menu"
            onFocusOut={() => {
              queueMicrotask(() => {
                if (root && !root.contains(document.activeElement)) close()
              })
            }}
          >
            <a
              href={wazeDirectionsUrl(destination())}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => close()}
              onKeyDown={(event) => event.key === 'Escape' && close(true)}
            >
              Drive with Waze
            </a>
            <a
              href={googleMapsLocationUrl(destination())}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => close()}
              onKeyDown={(event) => event.key === 'Escape' && close(true)}
            >
              View in Google Maps
            </a>
          </div>
        )}
      </Show>
    </div>
  )
}
