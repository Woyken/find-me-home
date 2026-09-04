import { For, createSignal } from 'solid-js'

type Toast = { id: number; message: string }

const [toasts, setToasts] = createSignal<Array<Toast>>([])
let nextId = 1

/** Brief confirmation ("Copied", "Saved"). Disappears on its own. */
export const showToast = (message: string) => {
  const id = nextId++
  setToasts((current) => [...current, { id, message }])
  setTimeout(
    () => setToasts((current) => current.filter((toast) => toast.id !== id)),
    1_800,
  )
}

export function Toasts() {
  return (
    <For each={toasts()}>
      {(toast) => (
        <div class="toast" role="status">
          {toast.message}
        </div>
      )}
    </For>
  )
}
