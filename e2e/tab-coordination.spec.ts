import { expect } from '@playwright/test'
import { initializeE2ePage, test } from './support/test.ts'
import { appUrl } from './support/app-url.ts'
import { E2eSyncRelay } from './support/sync-relay.ts'

test('two tabs share one room peer and hand synchronization to the follower', async ({
  browser,
}) => {
  test.setTimeout(60_000)
  const relay = new E2eSyncRelay()
  const localContext = await browser.newContext()
  const remoteContext = await browser.newContext()
  // Playwright contexts isolate storage but not the browser-wide Web Locks
  // namespace. A physical remote device has its own lock manager, so remove
  // the local test browser's lock from this simulated remote device.
  await remoteContext.addInitScript(() => {
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true })
  })
  await relay.attach(localContext)
  await relay.attach(remoteContext)
  const leader = await localContext.newPage()
  const follower = await localContext.newPage()
  const remote = await remoteContext.newPage()
  try {
    await initializeE2ePage(leader)
    await leader.evaluate(() => window.__FMH_E2E__?.createHousehold('Shared tabs'))
    const invitation = await leader.evaluate(() => window.__FMH_E2E__?.invitationUrl())
    if (!invitation) throw new Error('Invitation is unavailable')
    await initializeE2ePage(follower)
    const remoteInvitation = new URL(invitation)
    await initializeE2ePage(remote, `${remoteInvitation.pathname}${remoteInvitation.hash}`)
    await expect.poll(() => relay.peerCount()).toBe(2)

    await follower.evaluate(() => window.__FMH_E2E__?.captureInbox('700'))
    await leader.goto(appUrl('import-inbox'))
    await remote.goto(appUrl('import-inbox'))
    await expect(leader.getByText('E2E inbox 700')).toBeVisible()
    await expect(remote.getByText('E2E inbox 700')).toBeVisible()

    await leader.close()
    await expect.poll(() => relay.peerCount()).toBe(2)
    await follower.evaluate(() => window.__FMH_E2E__?.captureInbox('701'))
    await remote.goto(appUrl('import-inbox'))
    await expect(remote.getByText('E2E inbox 701')).toBeVisible()
  } finally {
    await localContext.close()
    await remoteContext.close()
  }
})
