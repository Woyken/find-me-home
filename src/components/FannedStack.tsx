import { For, Show } from 'solid-js'
import { useHousehold } from '../households/context'
import { paths } from '../paths'

/**
 * Floating fanned stack of the clippings waiting in the inbox, with a count.
 * Hidden when there is nothing to sort. Leads to the deck.
 */
export function FannedStack() {
  const household = useHousehold()
  const items = () => household.listImportInbox()
  const count = () => items().length
  const label = () =>
    `${count()} clipping${count() === 1 ? '' : 's'} from Aruodas waiting to be saved`
  return (
    <Show when={count() > 0}>
      <a
        class="stack-fan"
        href={paths.importInbox}
        aria-label={label()}
        title={`${count()} clippings from Aruodas — open to sort them`}
      >
        <For each={[...items().slice(0, 3)].reverse()}>
          {(item, index) => (
            <span
              class={`fan-card c${Math.min(2, items().length - 1) - index()}`}
            >
              <Show when={item.thumbnail}>
                {(thumbnail) => <img src={thumbnail()} alt="" />}
              </Show>
            </span>
          )}
        </For>
        <span class="fan-n">{count()}</span>
      </a>
    </Show>
  )
}
