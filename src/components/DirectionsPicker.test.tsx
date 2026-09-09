// @vitest-environment jsdom

import { render } from '@solidjs/web'
import { createSignal } from 'solid-js'
import { afterEach, expect, it } from 'vitest'
import type { Coordinate } from '../directions'
import { DirectionsPicker } from './DirectionsPicker'

let dispose: (() => void) | undefined

afterEach(() => {
  dispose?.()
  dispose = undefined
  document.body.replaceChildren()
})

const mount = (initialDestination: Coordinate | null = { latitude: 54.7, longitude: 25.3 }) => {
  const container = document.createElement('div')
  document.body.append(container)
  let setDestination: (destination: Coordinate | null) => void = () => undefined
  dispose = render(() => {
    const [destination, set] = createSignal(initialDestination)
    setDestination = set
    return <DirectionsPicker destination={destination} />
  }, container)
  return { button: container.querySelector('button')!, setDestination }
}

it('uses an ordinary-link disclosure with exact Waze and non-navigation Google URLs', async () => {
  const { button } = mount()
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await Promise.resolve()
  const popup = document.querySelector<HTMLDivElement>('.directions-menu')!
  const links = [...popup.querySelectorAll<HTMLAnchorElement>('a')]
  expect(links.map((link) => link.textContent)).toEqual(['Drive with Waze', 'View in Google Maps'])
  expect(links[0].href).toBe('https://waze.com/ul?ll=54.7,25.3&navigate=yes')
  expect(links[1].href).toBe('https://www.google.com/maps/search/?api=1&query=54.7,25.3')
  expect(links[1].href).not.toContain('/dir/')
  expect(popup.getAttribute('role')).toBeNull()
  expect(links[0].getAttribute('role')).toBeNull()
  expect(button.getAttribute('aria-controls')).toBe(popup.id)
  expect(button.getAttribute('aria-expanded')).toBe('true')

  button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await Promise.resolve()
  expect(document.querySelector('.directions-menu')).toBeNull()
  expect(document.activeElement).toBe(button)
})

it('disables without a coordinate and closes permanently when an open destination is removed', async () => {
  const { button, setDestination } = mount()
  button.click()
  await Promise.resolve()
  setDestination(null)
  await Promise.resolve()
  expect(button.disabled).toBe(true)
  expect(button.getAttribute('aria-expanded')).toBe('false')
  expect(document.querySelector('.directions-menu')).toBeNull()

  setDestination({ latitude: 54.8, longitude: 25.4 })
  await Promise.resolve()
  expect(button.disabled).toBe(false)
  expect(button.getAttribute('aria-expanded')).toBe('false')
  expect(document.querySelector('.directions-menu')).toBeNull()
})

it('closes the first disclosure before opening another picker', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  dispose = render(
    () => (
      <>
        <DirectionsPicker destination={() => ({ latitude: 54.7, longitude: 25.3 })} />
        <DirectionsPicker destination={() => ({ latitude: 54.8, longitude: 25.4 })} />
      </>
    ),
    container,
  )
  const buttons = [...container.querySelectorAll<HTMLButtonElement>('button')]
  buttons[0].click()
  await Promise.resolve()
  buttons[1].click()
  await Promise.resolve()
  expect(document.querySelectorAll('.directions-menu')).toHaveLength(1)
  expect(buttons[0].getAttribute('aria-expanded')).toBe('false')
  expect(buttons[1].getAttribute('aria-expanded')).toBe('true')
})
