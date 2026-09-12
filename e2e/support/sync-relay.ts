import type { BrowserContext, Page } from '@playwright/test'
import type { E2eRoomEnvelope } from '../../src/e2e/room.ts'

const relayEvent = 'fmh-e2e-room-message'

/**
 * Routes serialized E2E room messages across isolated browser contexts.
 * Install it before creating pages so the application cannot start without it.
 */
export class E2eSyncRelay {
  private readonly pages = new Set<Page>()
  private readonly peers = new Set<string>()

  peerCount() {
    return this.peers.size
  }

  async attach(context: BrowserContext) {
    await context.exposeBinding('__fmhE2eRelay', async ({ page }, message: E2eRoomEnvelope) => {
      if (message.type === 'join') this.peers.add(message.peerId)
      if (message.type === 'leave') this.peers.delete(message.peerId)
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
