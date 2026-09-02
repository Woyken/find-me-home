# Parcel Packaging Prototype

Throwaway prototype for [Prototype: choose the parcel dataset packaging](https://github.com/Woyken/find-me-home/issues/30).

## Question

Which generated representation of the Registru centras parcel exports gives the smallest practical transfer size while remaining straightforward to decompress, cache, and query in supported desktop and Android browsers?

## Run

Download and extract representative municipality exports to `prototype-data`, then run:

```sh
node --expose-gc src/server/parcel-packaging.prototype.mjs prototype-data/gis_pub_parcels_13.json prototype-data/gis_pub_parcels_42.json
```

The generated artifacts and `results.json` are written below `prototype-data/generated` and are intentionally ignored by Git.

## Result

Use compact JSON split into 5 km LKS-94 spatial cells and global four-digit number-prefix indexes. Publish explicitly gzip-compressed assets. Cache compressed responses with Cache Storage, decompress them with `DecompressionStream('gzip')`, and parse only the fetched shard. A version manifest inventories every shard and namespaces the cache.

Do not use whole-municipality files, the original RC ZIP at runtime, or a custom binary representation. Whole JSON causes unnecessary mobile transfer and heap pressure; ZIP requires extra parsing and retains irrelevant fields; JSON already meets the measured constraints, so binary complexity is not justified.

### Measurements

Measurements were made on the official 2026-09-01 Vilnius city (code 13) and Elektrenai (code 42) exports. Timings and JS heap are Node 24 measurements on the development device, useful comparatively rather than as browser guarantees.

| Measure | Vilnius city | Elektrenai |
|---|---:|---:|
| Parcels | 81,887 | 24,154 |
| RC ZIP transfer | 16.37 MB | 6.74 MB |
| Extracted source GeoJSON | 97.62 MB | 35.93 MB |
| Whole compact JSON | 25.86 MB | 9.48 MB |
| Whole compact JSON, gzip | 8.31 MB | 3.19 MB |
| Whole parse heap delta | 82.2 MiB | 29.6 MiB |
| Whole parse time | 0.56 s | 0.23 s |
| Spatial shard count | 33 | 38 |
| Spatial shards total, gzip | 8.21 MB | 3.46 MB |
| Largest spatial shard, Brotli | 0.53 MB | 0.22 MB |
| Largest-shard parse heap delta | 8.0 MiB | 4.0 MiB |
| Largest-shard parse time | 0.06 s | 0.02 s |

Across both municipalities, the global four-digit cadastral/unique-number indexes used 31 prefix shards totaling 1.56 MB gzip. The largest was 0.58 MB gzip. The prototype verified 100 exact-number samples and 100 point-in-polygon samples per municipality with no mismatches. Coordinates retain 0.1 mm LKS-94 precision, including polygon holes.

### Reachability

- The manifest lists schema/source versions, municipality extents, every spatial cell, and every available number prefix.
- A point lookup transforms to LKS-94, selects every municipality extent containing the point, and fetches that municipality's computed 5 km cell.
- A parcel whose bounding box intersects multiple cells is included in every one, so grid edges and large parcels cannot hide it.
- A normalized cadastral or unique number selects one global four-digit prefix shard. Its matching entry identifies municipality, spatial cell, and parcel ID; the client then fetches that spatial shard.
- Spatial records retain parcel ID, cadastral number, unique number, area, purpose ID, bounding box, and complete polygon rings. The purpose classifier is a small manifest-adjacent table.
- Number indexes may return multiple references; the client checks the complete normalized number and follows all exact matches rather than assuming uniqueness.
- The manifest is sufficient to enumerate the complete generated dataset, making missing or orphaned records testable during preprocessing.

The GitHub Action should fail before deployment unless every source parcel appears in at least one spatial cell, every non-null number resolves back to its parcel, all manifest assets exist, and sampled source/package lookup behavior agrees. A failed refresh leaves the previous successful Pages deployment intact.
