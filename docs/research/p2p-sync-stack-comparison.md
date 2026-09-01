# P2P sync stack comparison for find-me-home

Issue: [#24](https://github.com/Woyken/find-me-home/issues/24)  
Date: 2026-09-01

## Recommendation

Use **Trystero with its default Nostr strategy**, plus a tiny application-level last-write-wins (LWW) state protocol that stamps every record with `updatedAt` and represents deletes with `deletedAt` tombstones.

Why: the project preference is **least code to own**. Trystero's first-party API is a room plus typed actions (`joinRoom`, `room.makeAction`, `action.send`, `action.onMessage`) and its README explicitly says the default package uses Nostr, can swap to BitTorrent/MQTT/etc. by changing imports, handles serialization/chunking, and needs no accounts or deployed infrastructure. That lets find-me-home own roughly one small sync module rather than porting where-to-eat's ~1,599 lines of custom PeerJS/TanStack DB/localforage/service-worker glue.

Use **Yjs + y-webrtc + y-indexeddb** instead only if the follow-up decision decides that true concurrent/offline CRDT merge is worth the extra model complexity. Avoid PeerJS Cloud as the default because it is centralized; avoid Automerge for this no-backend browser P2P use case because Automerge Repo has official Solid and IndexedDB adapters but only WebSocket/MessageChannel/BroadcastChannel network adapters, not a first-party WebRTC public-signaling adapter.

## Decision table

| Criterion | where-to-eat: PeerJS + custom protocol + TanStack DB + localforage | Trystero, default Nostr | Yjs + y-webrtc + y-indexeddb | Automerge / Automerge Repo |
|---|---|---|---|---|
| Least code to own | **Poor.** Local source is ~1,599 LoC across `peer2peerSharing.tsx` (1,051), `peerCollectionOptions.ts` (338), and `peerjsLocalForageCollection.ts` (210), before counting service-worker message files. | **Best.** Trystero exposes `joinRoom` and `makeAction`; app owns room lifecycle, full-state-on-join, patch send, persistence, LWW merge. | **Good.** Small setup, but app must model data as Y shared types and bridge them into Solid state. | **Mixed.** CRDT is rich and there is a Solid primitive package, but browser network choices in Automerge Repo are WebSocket or same-browser channels. |
| Free public signaling reliability | **Weak.** PeerJS default uses PeerServer for metadata/candidate signaling and docs present self-hosting as the escape hatch if you do not like the cloud. Single public service is a SPOF. | **Best fit.** Trystero default uses Nostr; `relayConfig.urls` and `relayConfig.redundancy` support multiple Nostr relays. Torrent import is an alternate public tracker strategy. | **Okay.** y-webrtc ships public signaling defaults and connects to all configured signaling servers concurrently, but they are best-effort public servers; self-hosting is a small Node script. | **Poor for no-backend P2P.** No first-party WebRTC/public-relay adapter in Automerge Repo. |
| SolidJS fit | Already Solid code, but heavily coupled to where-to-eat settings/service-worker/TanStack DB shapes. | Framework-agnostic callback API maps directly to Solid signals/stores. | Framework-agnostic observers (`Y.Map.observe`, `ydoc.on('update')`) can update Solid stores. | Official `automerge-repo-solid-primitives` exists, but networking still pushes toward a sync server. |
| Co-online-only household sync | Works, but much more machinery than needed. | **Excellent.** Send full state to a peer on join; broadcast patches while online. | Excellent, and also handles offline edits when combined with y-indexeddb. | Excellent CRDT core, but transport is the issue. |
| Conflict handling | App-specific LWW/custom behavior; not a CRDT. Tombstones exist for deletes. | App-specific LWW; sufficient if simultaneous same-record edits are rare. | **Best.** Yjs shared types are CRDTs and merge concurrent changes without merge conflicts. | **Best.** Rich CRDT/history model. |
| QR/link join | Works but needs PeerJS peer IDs plus the app's connection IDs/known-peer exchange. | **Simple.** Share `roomId` plus optional password in URL/QR. | **Simple.** Share room name plus optional password in URL/QR. | Custom. |
| `last change X ago` | Need to add `updatedAt`; only delete tombstones carry timestamps today. | **Trivial.** LWW requires `updatedAt`; display it. | Store `updatedAt` in each map value or track a global timestamp from `ydoc.on('update')`. | History can expose timestamps, but it is more ceremony than storing `updatedAt`. |
| Best use here | Do not port wholesale; reuse only the tombstone idea. | **Recommended default.** | Upgrade path if true CRDT merge matters. | Not recommended for no-backend GitHub Pages P2P. |

## Candidate notes

### where-to-eat PeerJS approach

The local checkout shows substantial owned infrastructure:

- `peer2peerSharing.tsx` has BroadcastChannel leader election and message relay (`LEADER_CHANNEL_NAME`, heartbeat/claim/leader messages) around lines 29-236.
- PeerJS is initialized with optional `VITE_PEER_HOST`/`VITE_PEER_PORT`/`VITE_PEER_PATH` overrides around lines 428-438, indicating the implementation already needs a custom PeerServer escape hatch.
- The custom protocol includes connection-id exchange and request/storage messages around lines 509-685 and follow-up request-storage handling around 685-1030.
- `peerjsLocalForageCollection.ts` stores localforage data, listens to service-worker messages, and implements tombstone deletes (`type Tombstone = { deletedAt: number }`, `makeTombstone`, `sendMessageToSW`) around lines 10-179.
- `peerCollectionOptions.ts` wraps TanStack DB mutation handlers, serializes every collection to localforage, and creates per-item `versionKey` UUIDs around lines 195-328.

This is proven code, but it is the highest ownership burden. It solves multi-tab leadership, PeerJS reconnection, peer discovery within app-level connection IDs, tombstones, and TanStack DB persistence. find-me-home does not need most of that if co-online-only sync and simple household conflict behavior are acceptable.

### Trystero

Primary-source facts from the Trystero README/npm page:

- Trystero says it builds multiplayer web apps with no server, no accounts, and no deployed infrastructure.
- Its supported discovery strategies include BitTorrent, Nostr, MQTT, Supabase, Firebase, IPFS, and self-hosted WebSocket relay.
- The default package uses the Nostr network; other strategies are selected by imports such as `@trystero-p2p/torrent` or `@trystero-p2p/mqtt`.
- WebRTC requires a signaling channel for SDP exchange, but Trystero keeps app data off the strategy medium after peer discovery; data is sent peer-to-peer.
- The API is small: `joinRoom(config, roomId)`, `room.onPeerJoin`, `room.onPeerLeave`, `room.makeAction(...)`, `action.send(...)`, and `action.onMessage = (...) => ...`.
- Actions handle serialization/deserialization, chunking/throttling, progress events, and promises.
- SDP/session descriptions are encrypted by default with a key derived from app ID and room ID; a shared `password` can be supplied for a stronger secret.
- The `relayConfig.urls` option is available for Nostr/Torrent/MQTT; `relayConfig.redundancy` controls how many default relay endpoints to connect to simultaneously.

Minimal shape for find-me-home:

```ts
import { joinRoom } from 'trystero'

const room = joinRoom(
  { appId: 'woyken-find-me-home-v1', password },
  householdRoomId,
)

const state = room.makeAction<SyncState>('state')
const patch = room.makeAction<SyncedPlace>('patch')

room.onPeerJoin = (peerId) => state.send(currentState(), { target: peerId })
state.onMessage = (remote) => mergeStateLww(remote)
patch.onMessage = (remotePlace) => mergePlaceLww(remotePlace)

function upsertPlace(place: Place) {
  const synced = { ...place, updatedAt: Date.now() }
  mergePlaceLww(synced)
  patch.send(synced)
}
```

The only sync policy the app owns is LWW: records with greater `updatedAt` win; deletes are records with `deletedAt`. For a 2-5 person household, that is usually enough and makes the timestamp requirement free.

### Yjs + y-webrtc + y-indexeddb

Primary-source facts:

- Yjs describes itself as a CRDT framework whose shared types (`Map`, `Array`, `Text`, etc.) automatically distribute and merge changes without merge conflicts.
- y-webrtc propagates Yjs document updates peer-to-peer using WebRTC and says no setup is required because public signaling servers are available.
- y-webrtc defaults include `signaling: ['wss://signaling.yjs.dev', 'wss://y-webrtc-signaling-eu.herokuapp.com', 'wss://y-webrtc-signaling-us.herokuapp.com']`, connects to every configured signaling server concurrently, and supports an optional `password` so no sensitive WebRTC connection info or shared data is exposed to untrusted signaling servers.
- y-webrtc uses BroadcastChannel for tabs in the same browser by default (`filterBcConns: true`).
- y-indexeddb persists a Yjs document in IndexedDB so changes remain after reload and offline editing becomes possible.

Minimal shape:

```ts
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { IndexeddbPersistence } from 'y-indexeddb'

const ydoc = new Y.Doc()
new IndexeddbPersistence(householdRoomId, ydoc)
new WebrtcProvider(householdRoomId, ydoc, { password })

const places = ydoc.getMap<SyncedPlace>('places')
places.observe(() => setPlaces(Object.fromEntries(places.entries())))
```

Yjs is the safer conflict story, but it requires committing the domain model to Y shared types and accepting y-webrtc's public signaling defaults or self-hosting the small signaling server.

### Automerge / Automerge Repo

Primary-source facts:

- Automerge is a CRDT library with persistence and a sync protocol; the core Rust implementation is exposed to JavaScript/WASM.
- Automerge Repo provides pluggable networking/storage and lists `automerge-repo-solid-primitives` for Solid, `automerge-repo-storage-indexeddb` for browser persistence, and network adapters for WebSocket client/server, MessageChannel, and BroadcastChannel.
- The listed network adapters do not include a first-party WebRTC adapter with public signaling. The WebSocket adapter points to client/server sync, which conflicts with GitHub Pages/no-backend as the default deployment target.

Automerge is credible if a sync server is allowed later, but it is not the minimal-code no-backend answer.

## Follow-up decision

Issue [#27](https://github.com/Woyken/find-me-home/issues/27) should decide whether the product accepts Trystero + LWW now, with Yjs as the explicit upgrade path if concurrent editing/offline-first becomes important.

## Sources

- Local source: `D:\Projects\Github\Personal\where-to-eat\src\utils\peer2peerSharing.tsx`.
- Local source: `D:\Projects\Github\Personal\where-to-eat\src\utils\peerCollectionOptions.ts`.
- Local source: `D:\Projects\Github\Personal\where-to-eat\src\utils\peerjsLocalForageCollection.ts`.
- PeerJS client docs: <https://peerjs.com/client/getting-started>.
- Trystero README: <https://github.com/dmotz/trystero/blob/master/README.md>.
- Trystero npm README: <https://www.npmjs.com/package/trystero>.
- y-webrtc README: <https://github.com/yjs/y-webrtc/blob/master/README.md>.
- Yjs README: <https://github.com/yjs/yjs/blob/main/README.md>.
- y-indexeddb README: <https://github.com/yjs/y-indexeddb/blob/master/README.md>.
- Automerge README: <https://github.com/automerge/automerge/blob/main/README.md>.
- Automerge Repo README: <https://github.com/automerge/automerge-repo/blob/main/README.md>.
