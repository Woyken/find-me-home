import { Show } from 'solid-js'
import type { JSX } from '@solidjs/web'

const closeDialog = (element: HTMLDialogElement) => {
  if (typeof element.close === 'function') element.close()
  else {
    element.removeAttribute('open')
    element.dispatchEvent(new Event('close'))
  }
}

/**
 * A native <dialog> shown modally while `open` is true. Escape, a click on
 * the backdrop and the × button all end in `onClose`. Falls back to the
 * `open` attribute where `showModal` is missing (jsdom).
 */
export function Modal(props: {
  open: boolean
  onClose: () => void
  label: string
  children: JSX.Element
}) {
  const mount = (element: HTMLDialogElement) => {
    element.addEventListener('close', () => props.onClose())
    element.addEventListener('click', (event) => {
      if (event.target === element) closeDialog(element)
    })
    // The ref runs before the element is in the document; showModal() needs
    // it connected.
    queueMicrotask(() => {
      if (!element.isConnected) return
      if (typeof element.showModal === 'function') element.showModal()
      else element.setAttribute('open', '')
    })
  }
  return (
    <Show when={props.open}>
      <dialog class="sheet" ref={mount} aria-label={props.label}>
        {props.children}
        <button
          class="close"
          type="button"
          aria-label="Close"
          onClick={(event) => {
            const dialog = event.currentTarget.closest('dialog')
            if (dialog) closeDialog(dialog)
          }}
        >
          ×
        </button>
      </dialog>
    </Show>
  )
}
