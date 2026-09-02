// @vitest-environment jsdom

import { render } from '@solidjs/web'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'
import { HouseholdHeader } from './components/HouseholdHeader'
import type { HouseholdRuntime } from './households/runtime'
import type { HouseholdRuntimeState } from './households/model'

let dispose: (() => void) | undefined

afterEach(() => {
  dispose?.()
  document.body.replaceChildren()
})

const mount = (runtime: HouseholdRuntime) => {
  const container = document.createElement('div')
  document.body.append(container)
  dispose = render(
    () => (
      <App runtime={runtime}>
        <HouseholdHeader />
        <p>Existing product flows</p>
      </App>
    ),
    container,
  )
}

const findButton = (name: string) =>
  [...document.querySelectorAll('button')].find(
    (button) => button.textContent.trim() === name,
  )

const waitFor = async (assertion: () => void) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion()
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve))
    }
  }
  assertion()
}

const createTestRuntime = () => {
  let state: HouseholdRuntimeState = { status: 'starting' }
  const listeners = new Set<() => void>()
  const publish = (next: HouseholdRuntimeState) => {
    state = next
    for (const listener of listeners) listener()
  }
  const active = (name: string): HouseholdRuntimeState => ({
    status: 'active',
    household: {
      id: 'record-id',
      name,
      updatedAt: 100,
    },
    access: {
      householdId: 'household-id',
      invitationSecret: 'secret',
      initialized: true,
      lastOpenedAt: 100,
    },
    roomPassword: 'room-password',
  })
  const runtime: HouseholdRuntime = {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    start: async () => publish({ status: 'no-household' }),
    createHousehold: async () => publish(active('Our home search')),
    renameActiveHousehold: async (name) => publish(active(name)),
    dispose: () => listeners.clear(),
  }
  return runtime
}

describe('App Household boundary', () => {
  it('offers create or join before mounting Household content', async () => {
    mount(createTestRuntime())

    await waitFor(() => expect(findButton('Create Household')).toBeTruthy())
    expect(document.body.textContent).toContain('Join Household')
    expect(document.body.textContent).not.toContain('Existing product flows')

    findButton('Create Household')?.click()

    await waitFor(() =>
      expect(document.body.textContent).toContain('Our home search'),
    )
    expect(document.body.textContent).toContain('Existing product flows')
  })

  it('renames the active Household through the runtime', async () => {
    const runtime = createTestRuntime()
    mount(runtime)
    await waitFor(() => expect(findButton('Create Household')).toBeTruthy())
    findButton('Create Household')?.click()
    await waitFor(() => expect(findButton('Rename Household')).toBeTruthy())
    findButton('Rename Household')?.click()
    await waitFor(() => {
      expect(
        document.querySelector('input[aria-label="Household name"]'),
      ).toBeTruthy()
    })
    const householdNameInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="Household name"]',
    )
    if (!householdNameInput) throw new Error('Household name input is missing')
    householdNameInput.value = 'Forest edge search'
    householdNameInput.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await waitFor(() => expect(findButton('Save name')).toBeTruthy())
    findButton('Save name')?.click()

    await waitFor(() =>
      expect(document.body.textContent).toContain('Forest edge search'),
    )
  })
})
