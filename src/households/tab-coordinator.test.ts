import { describe, expect, it } from 'vitest'
import {
  createTabCoordinator,
  tabCoordinationName,
  type LockManager,
  type TabChannel,
} from './tab-coordinator'

const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve))

class FifoLocks implements LockManager {
  private readonly queues = new Map<string, (() => Promise<void>)[]>()
  private readonly releases = new Map<string, (() => void)[]>()
  private readonly running = new Set<string>()

  private async drain(name: string) {
    this.running.add(name)
    const queue = this.queues.get(name)
    const next = queue?.shift()
    if (!next) {
      this.running.delete(name)
      return
    }
    await next()
    this.running.delete(name)
    void this.drain(name)
  }

  request(name: string, _options: { mode: 'exclusive' }, callback: () => Promise<void>) {
    const queue = this.queues.get(name) ?? []
    this.queues.set(name, queue)
    return new Promise<void>((resolve, reject) => {
      const start = !this.running.has(name)
      queue.push(async () => {
        let forceRelease: (() => void) | undefined
        const crashed = new Promise<void>((next) => {
          forceRelease = next
        })
        const releases = this.releases.get(name) ?? []
        this.releases.set(name, releases)
        releases.push(() => forceRelease?.())
        try {
          await Promise.race([callback(), crashed])
          resolve()
        } catch (error) {
          reject(error)
        } finally {
          releases.shift()
        }
      })
      if (start) void this.drain(name)
    })
  }

  forceRelease(name: string) {
    this.releases.get(name)?.[0]?.()
  }
}

class ChannelHub {
  private readonly channels = new Map<string, Set<MemoryChannel>>()

  create = (name: string): TabChannel => {
    const channel = new MemoryChannel(name, this)
    const channels = this.channels.get(name) ?? new Set<MemoryChannel>()
    this.channels.set(name, channels)
    channels.add(channel)
    return channel
  }

  deliver(sender: MemoryChannel, message: unknown) {
    for (const channel of this.channels.get(sender.name) ?? [])
      if (channel !== sender) channel.receive(message)
  }

  remove(channel: MemoryChannel) {
    this.channels.get(channel.name)?.delete(channel)
  }
}

class MemoryChannel implements TabChannel {
  onmessage: ((event: { data: unknown }) => void) | null = null
  constructor(
    readonly name: string,
    private readonly hub: ChannelHub,
  ) {}
  postMessage(message: unknown) {
    this.hub.deliver(this, structuredClone(message))
  }
  close() {
    this.hub.remove(this)
  }
  receive(data: unknown) {
    this.onmessage?.({ data })
  }
}

describe('tab coordinator', () => {
  it('elects one leader per Household and elects independently for another Household', async () => {
    const locks = new FifoLocks()
    const hub = new ChannelHub()
    const starts: string[] = []
    const create = (householdId: string, tab: string) =>
      createTabCoordinator({
        householdId,
        locks,
        createChannel: hub.create,
        startLeaderSynchronization: async () => {
          starts.push(tab)
          return async () => undefined
        },
      })
    const first = create('home', 'first')
    const second = create('home', 'second')
    const other = create('other-home', 'other')

    await tick()
    expect(starts).toEqual(['first', 'other'])
    expect(first.isLeader()).toBe(true)
    expect(second.isLeader()).toBe(false)
    expect(other.isLeader()).toBe(true)
    await Promise.all([first.stop(), second.stop(), other.stop()])
  })

  it('fans messages to followers and ignores messages after its channel closes', async () => {
    const hub = new ChannelHub()
    const received: unknown[] = []
    const leader = createTabCoordinator({
      householdId: 'home',
      createChannel: hub.create,
      startLeaderSynchronization: async () => async () => undefined,
    })
    const follower = createTabCoordinator({
      householdId: 'home',
      createChannel: hub.create,
      startLeaderSynchronization: async () => async () => undefined,
    })
    follower.channel.onmessage = ({ data }) => received.push(data)
    await tick()
    for (const type of ['leader-status', 'initial-sync-complete', 'committed-local-records'])
      leader.channel.postMessage({ type })
    expect(received).toEqual([
      { type: 'leader-status' },
      { type: 'initial-sync-complete' },
      { type: 'committed-local-records' },
    ])
    await follower.stop()
    leader.channel.postMessage({ type: 'committed-remote-records' })
    expect(received).toHaveLength(3)
    await leader.stop()
  })

  it('hands an orderly shutdown and a forced crash release to the next queued tab', async () => {
    const locks = new FifoLocks()
    const hub = new ChannelHub()
    const starts: string[] = []
    const create = (tab: string) =>
      createTabCoordinator({
        householdId: 'home',
        locks,
        createChannel: hub.create,
        startLeaderSynchronization: async () => {
          starts.push(tab)
          return async () => undefined
        },
      })
    const first = create('first')
    const second = create('second')
    await tick()
    await first.stop()
    await tick()
    expect(starts).toEqual(['first', 'second'])
    const third = create('third')
    locks.forceRelease(tabCoordinationName('home'))
    for (let attempt = 0; attempt < 5 && starts.length < 3; attempt += 1) await tick()
    expect(starts).toEqual(['first', 'second', 'third'])
    await Promise.all([second.stop(), third.stop()])
  })

  it('uses each tab as leader when Web Locks are unavailable', async () => {
    const hub = new ChannelHub()
    const starts: string[] = []
    const coordinators = ['first', 'second'].map((tab) =>
      createTabCoordinator({
        householdId: 'home',
        createChannel: hub.create,
        startLeaderSynchronization: async () => {
          starts.push(tab)
          return async () => undefined
        },
      }),
    )
    await tick()
    expect(starts).toEqual(['first', 'second'])
    expect(coordinators.every((coordinator) => coordinator.isLeader())).toBe(true)
    await Promise.all(coordinators.map((coordinator) => coordinator.stop()))
  })
})
