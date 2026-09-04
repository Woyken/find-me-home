import { For, Show, createEffect, createSignal } from 'solid-js'
import QRCode from 'qrcode'
import { useHousehold } from '../households/context'
import { Modal } from './Modal'
import { showToast } from './Toast'

/**
 * "Our search" settings: rename, invite another device, and switch or remove
 * the searches kept on this device.
 */
export function SearchSettingsDialog(props: {
  open: boolean
  onClose: () => void
}) {
  const household = useHousehold()
  const activeName = () => {
    const state = household.state()
    return state.status === 'active' ? state.household.name : ''
  }
  const activeId = () => {
    const state = household.state()
    return state.status === 'active' ? state.access.householdId : ''
  }
  const [name, setName] = createSignal(activeName())
  // Start from the current name each time the dialog opens.
  createEffect(
    () => props.open,
    (open) => {
      if (open) setName(activeName())
    },
  )
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal('')
  const invitationUrl = () => household.getInvitationUrl()
  const [qrCode, setQrCode] = createSignal('')
  createEffect(
    () => (props.open ? invitationUrl() : ''),
    (url) => {
      if (!url) return
      void QRCode.toDataURL(url, { margin: 1, width: 320 }).then(setQrCode)
    },
  )

  const run = async (action: () => Promise<void>, done?: string) => {
    setBusy(true)
    setError('')
    try {
      await action()
      if (done) showToast(done)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  const rename = (event: SubmitEvent) => {
    event.preventDefault()
    void run(async () => {
      await household.renameActiveHousehold(name())
      props.onClose()
    }, 'Name saved')
  }
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(invitationUrl())
      showToast('Link copied')
    } catch {
      setError('Could not copy — select the link and copy it by hand.')
    }
  }
  const remove = () => {
    if (
      !window.confirm(
        'Remove this search from this device? It stays on other devices.',
      )
    )
      return
    void run(async () => {
      await household.removeHousehold(activeId())
      props.onClose()
    })
  }

  return (
    <Modal open={props.open} onClose={props.onClose} label="Our search">
      <h2>Our search</h2>
      <p>Everyone in this search sees the same plots, on every device.</p>

      <h3>Name</h3>
      <form class="rowline" onSubmit={rename}>
        <input
          class="grow"
          aria-label="Search name"
          value={name()}
          onInput={(event) => setName(event.currentTarget.value)}
        />
        <button class="btn" type="submit" disabled={busy()}>
          Save
        </button>
      </form>

      <h3>Invite someone</h3>
      <p>
        Show this to your partner or open the link on another device. Anyone
        with it can edit — it can't be taken back.
      </p>
      <Show when={qrCode()}>
        {(source) => <img class="qr" src={source()} alt="Invitation QR code" />}
      </Show>
      <div class="rowline">
        <input
          class="grow"
          readonly
          aria-label="Invitation link"
          value={invitationUrl()}
          onFocus={(event) => event.currentTarget.select()}
        />
        <button class="btn ghost" type="button" onClick={() => void copyLink()}>
          Copy
        </button>
      </div>

      <h3>Searches on this device</h3>
      <For each={household.listHouseholds()}>
        {(local) => (
          <div class="device">
            <span>{local.name}</span>
            <Show
              when={local.householdId === activeId()}
              fallback={
                <button
                  class="linkbtn"
                  type="button"
                  disabled={busy()}
                  onClick={() =>
                    void run(async () => {
                      await household.switchHousehold(local.householdId)
                      props.onClose()
                    })
                  }
                >
                  Switch
                </button>
              }
            >
              <span class="tag solid">This one</span>
            </Show>
          </div>
        )}
      </For>
      <div class="rowline">
        <button
          class="btn danger"
          type="button"
          disabled={busy()}
          onClick={remove}
        >
          Remove this search from this device
        </button>
      </div>
      <p>It stays on other devices.</p>
      <Show when={error()}>
        <p class="alert" role="alert">
          {error()}
        </p>
      </Show>
    </Modal>
  )
}
