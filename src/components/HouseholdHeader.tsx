import { Show, createSignal } from 'solid-js'
import QRCode from 'qrcode'
import { useHousehold } from '../households/context'

export function HouseholdHeader() {
  const household = useHousehold()
  const [editing, setEditing] = createSignal(false)
  const [name, setName] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal('')
  const [sharing, setSharing] = createSignal(false)
  const [qrCode, setQrCode] = createSignal('')
  const activeName = () => {
    const state = household.state()
    return state.status === 'active' ? state.household.name : ''
  }
  const save = async (event: SubmitEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await household.renameActiveHousehold(name())
      setEditing(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  const syncStatus = () => {
    const state = household.state()
    return state.status === 'active' ? capitalize(state.syncStatus) : ''
  }
  const share = async () => {
    setSharing(true)
    setQrCode(await QRCode.toDataURL(household.getInvitationUrl()))
  }
  return (
    <div>
      <Show
        when={editing()}
        fallback={
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="font-serif text-2xl">{activeName()}</h1>
            <span class="font-mono text-[10px] font-bold uppercase text-[#647169]">
              {syncStatus()}
            </span>
            <span class="font-mono text-[10px] text-[#647169]">
              Last change {formatRelativeTime(household.getLastChangeAt())}
            </span>
            <button
              class="border-b border-[#204d3a] font-mono text-[10px] font-bold uppercase text-[#204d3a]"
              onClick={() => {
                setName(activeName())
                setEditing(true)
              }}
            >
              Rename Household
            </button>
            <button
              class="border-b border-[#204d3a] font-mono text-[10px] font-bold uppercase text-[#204d3a]"
              onClick={() => void share()}
            >
              Share Household
            </button>
          </div>
        }
      >
        <form class="flex flex-wrap items-center gap-2" onSubmit={save}>
          <input
            aria-label="Household name"
            class="min-w-52 border border-[#849087] bg-white px-3 py-2"
            value={name()}
            onInput={(event) => setName(event.currentTarget.value)}
          />
          <button
            class="bg-[#204d3a] px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
            disabled={busy()}
            type="submit"
          >
            Save name
          </button>
          <button
            class="px-2 py-2 text-sm"
            disabled={busy()}
            type="button"
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </form>
      </Show>
      <Show when={error()}>
        <p class="mt-2 text-xs text-red-800" role="alert">
          {error()}
        </p>
      </Show>
      <Show when={sharing()}>
        <section
          class="mt-4 max-w-lg border border-[#849087] bg-white p-4"
          aria-label="Share Household"
        >
          <div class="flex items-center justify-between gap-4">
            <h2 class="font-serif text-xl">Invite another device</h2>
            <button onClick={() => setSharing(false)}>Close</button>
          </div>
          <input
            aria-label="Household invitation link"
            class="mt-3 w-full border border-[#849087] p-2 text-xs"
            readonly
            value={household.getInvitationUrl()}
          />
          <Show when={qrCode()}>
            <img
              class="mt-3 h-44 w-44"
              src={qrCode()}
              alt="Household invitation QR code"
            />
          </Show>
          <p class="mt-3 text-sm text-[#7a2d1d]">
            Anyone with this link can edit the Household. The invitation cannot
            be revoked.
          </p>
        </section>
      </Show>
    </div>
  )
}

const capitalize = (value: string) => value[0].toUpperCase() + value.slice(1)

const formatRelativeTime = (timestamp: number | undefined) => {
  if (timestamp === undefined) return 'unknown'
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1_000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
