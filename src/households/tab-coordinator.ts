/** Coordinates one P2P room connection between tabs of one browser profile.
 *
 * Browsers without Web Locks cannot coordinate tabs; each tab deliberately
 * becomes a leader in that environment rather than silently disabling sync.
 */
export type LockManager = {
  request: (
    name: string,
    options: { mode: 'exclusive' },
    callback: () => Promise<void>,
  ) => Promise<void>
}

export type TabChannel = {
  postMessage: (message: unknown) => void
  close: () => void
  onmessage?: ((event: { data: unknown }) => void) | null
  addEventListener?: (type: 'message', listener: (event: { data: unknown }) => void) => void
}

export type TabChannelFactory = (name: string) => TabChannel

const deferred = () => {
  let resolve: (() => void) | undefined
  const promise = new Promise<void>((next) => {
    resolve = next
  })
  return { promise, resolve: () => resolve?.() }
}

export const tabCoordinationName = (householdId: string) =>
  `find-me-home:household-sync:${householdId}`

export const createTabCoordinator = (options: {
  householdId: string
  locks?: LockManager
  createChannel: TabChannelFactory
  startLeaderSynchronization: () => Promise<() => Promise<void>>
  onLeaderChange?: (leader: boolean) => void
}) => {
  const channel = options.createChannel(tabCoordinationName(options.householdId))
  let leader = false
  let stopped = false
  let leaderStop: (() => Promise<void>) | undefined
  const release = deferred()
  const runLeader = async () => {
    if (stopped) return
    leader = true
    options.onLeaderChange?.(true)
    try {
      leaderStop = await options.startLeaderSynchronization()
      if (stopped) release.resolve()
      await release.promise
      await leaderStop?.()
    } finally {
      leaderStop = undefined
      if (leader) options.onLeaderChange?.(false)
      leader = false
    }
  }
  // Request immediately: Web Locks keeps every follower queued, including
  // while its current leader is unexpectedly terminated.
  const lockRequest = options.locks
    ? options.locks.request(
        tabCoordinationName(options.householdId),
        { mode: 'exclusive' },
        runLeader,
      )
    : runLeader()
  void lockRequest.catch(() => undefined)
  return {
    channel,
    isLeader: () => leader,
    async stop() {
      if (stopped) return
      stopped = true
      release.resolve()
      if (!leader) return
      // The leader callback owns shutdown, so waiting here also guarantees the
      // room has left before its lock is released.
      await lockRequest
    },
  }
}
