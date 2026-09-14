import type { BrowserContext, Page } from '@playwright/test'
import type { E2eRoomEnvelope } from '../../src/e2e/room.ts'

const relayEvent = 'fmh-e2e-room-message'

type E2eSyncRelayOptions = {
  beforeDelivery?: (sequence: number) => Promise<void> | void
  onQueued?: (sequence: number) => void
  onDeliveryStart?: (sequence: number) => void
}

/**
 * Routes serialized, ordered E2E room messages across isolated browser contexts.
 * Install it before creating pages so the application cannot start without it.
 */
export class E2eSyncRelay {
  private readonly pages = new Set<Page>()
  private readonly peers = new Set<string>()
  private deliveries = Promise.resolve()
  private nextDelivery = 0

  constructor(private readonly options: E2eSyncRelayOptions = {}) {}

  peerCount() {
    return this.peers.size
  }

  async attach(context: BrowserContext) {
    await context.exposeBinding('__fmhE2eRelay', async ({ page }, message: E2eRoomEnvelope) => {
      const sequence = ++this.nextDelivery
      this.options.onQueued?.(sequence)
      const delivery = this.deliveries.then(async () => {
        this.options.onDeliveryStart?.(sequence)
        if (message.type === 'join') this.peers.add(message.peerId)
        if (message.type === 'leave') this.peers.delete(message.peerId)
        await this.options.beforeDelivery?.(sequence)
        await Promise.all(
          [...this.pages]
            .filter((candidate) => candidate !== page && !candidate.isClosed())
            .map((candidate) =>
              candidate
                .evaluate(
                  ({ event, value }) =>
                    window.dispatchEvent(new CustomEvent(event, { detail: value })),
                  { event: relayEvent, value: message },
                )
                .catch(() => undefined),
            ),
        )
      })
      this.deliveries = delivery.catch(() => undefined)
      await delivery
    })
    await context.addInitScript(() => {
      window.__FMH_E2E_RELAY__ = {
        post(message) {
          void window.__fmhE2eRelay(message)
        },
      }
    })
    context.on('page', (page) => this.pages.add(page))
    for (const page of context.pages()) this.pages.add(page)
  }
}

declare global {
  interface Window {
    __fmhE2eRelay: (message: E2eRoomEnvelope) => Promise<void>
  }
}
