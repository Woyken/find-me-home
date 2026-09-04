import { For, Show } from 'solid-js'
import type { AutomaticCheck } from '../automatic-checks'
import { checkCells, summarizeChecks } from '../check-summary'

const describe = (checks: Array<AutomaticCheck> | null | undefined) => {
  const summary = summarizeChecks(checkCells(checks))
  return summary.lead ? `${summary.lead}: ${summary.text}` : summary.text
}

/**
 * The 13-cell strip: one coloured cell per automatic check in canonical
 * order, each with a "Label: value" tooltip. `large` stretches it to full
 * width for the detail page.
 */
export function CheckStrip(props: {
  checks: Array<AutomaticCheck> | null | undefined
  large?: boolean
}) {
  return (
    <span
      class={`strip ${props.large ? 'lg' : ''}`}
      role="img"
      aria-label={`Automatic checks: ${describe(props.checks)}`}
    >
      <For each={checkCells(props.checks)}>
        {(cell) => (
          <i class={cell.status} title={`${cell.label}: ${cell.value}`} />
        )}
      </For>
    </span>
  )
}

/** One-line summary: "2 problems: land purpose, noise" / "3 to look at" / … */
export function CheckSummaryText(props: {
  checks: Array<AutomaticCheck> | null | undefined
  block?: boolean
}) {
  const summary = () => summarizeChecks(checkCells(props.checks))
  return (
    <span class={`strip-sum ${props.block ? 'block' : ''}`}>
      <Show when={summary().lead}>
        {(lead) => (
          <>
            <b>{lead()}</b>:{' '}
          </>
        )}
      </Show>
      <Show when={summary().kind === 'look'} fallback={summary().text}>
        <span class="w">{summary().text}</span>
      </Show>
    </span>
  )
}
