import { expect, test } from '@playwright/test'
import { E2eSyncRelay } from './support/sync-relay.ts'

const deferred = () => {
  let resolve: (() => void) | undefined
  const promise = new Promise<void>((next) => {
    resolve = next
  })
  return { promise, resolve: () => resolve?.() }
}

test('delivers queued relay messages in send order', async ({ browser }) => {
  const firstDelivery = deferred()
  const secondQueued = deferred()
  const releaseFirst = deferred()
  const started: number[] = []
  const relay = new E2eSyncRelay({
    beforeDelivery(sequence) {
      if (sequence === 1) {
        firstDelivery.resolve()
        return releaseFirst.promise
      }
    },
    onQueued(sequence) {
      if (sequence === 2) secondQueued.resolve()
    },
    onDeliveryStart(sequence) {
      started.push(sequence)
    },
  })
  const senderContext = await browser.newContext()
  const receiverContext = await browser.newContext()
  await relay.attach(senderContext)
  await relay.attach(receiverContext)
  const sender = await senderContext.newPage()
  const receiver = await receiverContext.newPage()
  try {
    await receiver.evaluate(() => {
      window.addEventListener('fmh-e2e-room-message', (event) => {
        if (
          !(event instanceof CustomEvent) ||
          typeof event.detail !== 'object' ||
          event.detail === null ||
          !('peerId' in event.detail) ||
          typeof event.detail.peerId !== 'string'
        )
          throw new Error('Relay delivered an invalid message')
        const messages = (window.__fmhRelayMessages ??= [])
        messages.push(event.detail.peerId)
      })
    })
    await sender.evaluate(() => {
      const transport = window.__FMH_E2E_RELAY__
      if (!transport) throw new Error('E2E relay is unavailable')
      transport.post({ type: 'join', peerId: 'first' })
      transport.post({ type: 'join', peerId: 'second' })
    })
    await firstDelivery.promise
    await secondQueued.promise
    await new Promise((resolve) => setImmediate(resolve))
    expect(started).toEqual([1])
    expect(await receiver.evaluate(() => window.__fmhRelayMessages ?? [])).toEqual([])

    releaseFirst.resolve()
    await expect
      .poll(() => receiver.evaluate(() => window.__fmhRelayMessages))
      .toEqual(['first', 'second'])
  } finally {
    await senderContext.close()
    await receiverContext.close()
  }
})

declare global {
  interface Window {
    __fmhRelayMessages?: string[]
  }
}
