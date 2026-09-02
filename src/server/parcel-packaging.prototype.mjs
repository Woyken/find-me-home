/**
 * THROWAWAY PROTOTYPE: measure browser-oriented RC parcel packaging.
 *
 * Run with:
 *   node --expose-gc src/server/parcel-packaging.prototype.mjs prototype-data/*.json
 */
import { createReadStream, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { createInterface } from 'node:readline'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import { performance } from 'node:perf_hooks'

const GRID_METRES = 5_000
const outputRoot = 'prototype-data/generated'
const globalNumberShards = new Map()

function featureFromLine(line) {
  const value = line.trim().replace(/,$/, '')
  return value.startsWith('{ "type": "Feature"') ? JSON.parse(value) : null
}

function bbox(rings) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const ring of rings) {
    for (const [x, y] of ring) {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  return [minX, minY, maxX, maxY]
}

function pointInRing(px, py, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function pointInPolygon(px, py, rings) {
  return pointInRing(px, py, rings[0]) && !rings.slice(1).some((ring) => pointInRing(px, py, ring))
}

function ringArea(ring) {
  let sum = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1])
  }
  return sum / 2
}

function compactRecord(feature, id) {
  const properties = feature.properties
  const rings = feature.geometry.coordinates.map((ring) =>
    ring.map(([x, y]) => [Math.round(x * 10_000) / 10_000, Math.round(y * 10_000) / 10_000]),
  )
  return [
    id,
    properties.kadastro_nr ?? null,
    properties.unikalus_nr == null ? null : String(properties.unikalus_nr),
    properties.skl_plotas == null ? null : Number(properties.skl_plotas),
    properties.pask_tipas ?? null,
    bbox(rings),
    rings,
  ]
}

function gridKeys([minX, minY, maxX, maxY]) {
  const keys = []
  for (let x = Math.floor(minX / GRID_METRES); x <= Math.floor(maxX / GRID_METRES); x++) {
    for (let y = Math.floor(minY / GRID_METRES); y <= Math.floor(maxY / GRID_METRES); y++) {
      keys.push(`${x}-${y}`)
    }
  }
  return keys
}

function compressedSizes(buffer) {
  return {
    json: buffer.length,
    gzip: gzipSync(buffer, { level: 9 }).length,
    brotli: brotliCompressSync(buffer, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
  }
}

function timedParse(buffer) {
  global.gc?.()
  const before = process.memoryUsage().heapUsed
  const started = performance.now()
  const parsed = JSON.parse(buffer)
  const milliseconds = performance.now() - started
  const heapDelta = process.memoryUsage().heapUsed - before
  return { parsed, milliseconds, heapDelta }
}

function findByPoint(records, x, y) {
  let best = null
  let bestArea = Infinity
  for (const record of records) {
    const box = record[5]
    if (box[0] > x || box[2] < x || box[1] > y || box[3] < y) continue
    if (!pointInPolygon(x, y, record[6])) continue
    const area = Math.abs(ringArea(record[6][0]))
    if (area < bestArea) {
      best = record
      bestArea = area
    }
  }
  return best
}

async function benchmark(sourcePath) {
  const municipality = /_(\d+)\.json$/.exec(sourcePath)?.[1]
  if (!municipality) throw new Error(`Cannot read municipality from ${sourcePath}`)

  const records = []
  const sourceSamples = []
  const lines = createInterface({ input: createReadStream(sourcePath), crlfDelay: Infinity })
  for await (const line of lines) {
    const feature = featureFromLine(line)
    if (!feature?.geometry?.coordinates) continue
    const record = compactRecord(feature, records.length)
    records.push(record)
    if (sourceSamples.length < 100 && records.length % 137 === 0) {
      sourceSamples.push({ feature, record })
    }
  }

  const municipalityDir = join(outputRoot, municipality)
  rmSync(municipalityDir, { recursive: true, force: true })
  mkdirSync(join(municipalityDir, 'cells'), { recursive: true })

  const whole = Buffer.from(JSON.stringify(records))
  writeFileSync(join(municipalityDir, 'whole.json'), whole)
  const wholeMetrics = compressedSizes(whole)
  const wholeParse = timedParse(whole)

  const cells = new Map()
  for (const record of records) {
    const keys = gridKeys(record[5])
    for (const key of keys) {
      const cell = cells.get(key) ?? []
      cell.push(record)
      cells.set(key, cell)
    }
    for (const number of [record[1], record[2]]) {
      const normalized = number?.replace(/\D/g, '')
      if (!normalized) continue
      const prefix = normalized.slice(0, 4)
      const shard = globalNumberShards.get(prefix) ?? []
      shard.push([normalized, municipality, keys[0], record[0]])
      globalNumberShards.set(prefix, shard)
    }
  }

  const shardSizes = []
  let shardJson = 0
  let shardGzip = 0
  let shardBrotli = 0
  for (const [key, cell] of cells) {
    const buffer = Buffer.from(JSON.stringify(cell))
    writeFileSync(join(municipalityDir, 'cells', `${key}.json`), buffer)
    const sizes = compressedSizes(buffer)
    shardJson += sizes.json
    shardGzip += sizes.gzip
    shardBrotli += sizes.brotli
    shardSizes.push(sizes.brotli)
  }
  shardSizes.sort((a, b) => a - b)

  let exactMatches = 0
  let exactSamples = 0
  let pointMatches = 0
  for (const { feature, record } of sourceSamples) {
    const number = record[2] ?? record[1]
    if (number) {
      exactSamples++
      const normalized = String(number).replace(/\D/g, '')
      const indexed = globalNumberShards
        .get(normalized.slice(0, 4))
        ?.some((entry) => entry[0] === normalized && entry[1] === municipality && entry[3] === record[0])
      if (indexed) exactMatches++
    }

    const sourceRing = feature.geometry.coordinates[0]
    const x = sourceRing.reduce((sum, point) => sum + point[0], 0) / sourceRing.length
    const y = sourceRing.reduce((sum, point) => sum + point[1], 0) / sourceRing.length
    const key = `${Math.floor(x / GRID_METRES)}-${Math.floor(y / GRID_METRES)}`
    const found = findByPoint(cells.get(key) ?? [], x, y)
    const sourceContainsPoint = pointInPolygon(x, y, feature.geometry.coordinates)
    if (!sourceContainsPoint || found?.[0] === record[0]) pointMatches++
  }

  const largestCellKey = [...cells.keys()].sort((a, b) => cells.get(b).length - cells.get(a).length)[0]
  const largestCell = readFileSync(join(municipalityDir, 'cells', `${largestCellKey}.json`))
  const shardParse = timedParse(largestCell)
  return {
    municipality,
    source: basename(sourcePath),
    parcels: records.length,
    whole: wholeMetrics,
    wholeParseMs: Math.round(wholeParse.milliseconds),
    wholeHeapMiB: +(wholeParse.heapDelta / 1024 / 1024).toFixed(1),
    shards: cells.size,
    duplicatedRecords: [...cells.values()].reduce((sum, cell) => sum + cell.length, 0) - records.length,
    shardTotal: { json: shardJson, gzip: shardGzip, brotli: shardBrotli },
    shardBrotliMedian: shardSizes[Math.floor(shardSizes.length / 2)],
    shardBrotliMax: shardSizes.at(-1),
    largestShardParseMs: +shardParse.milliseconds.toFixed(1),
    largestShardHeapMiB: +(shardParse.heapDelta / 1024 / 1024).toFixed(1),
    verification: { samples: sourceSamples.length, exactSamples, exactMatches, pointMatches },
  }
}

mkdirSync(outputRoot, { recursive: true })
const results = []
for (const sourcePath of process.argv.slice(2)) results.push(await benchmark(sourcePath))
const numberDir = join(outputRoot, 'numbers')
rmSync(numberDir, { recursive: true, force: true })
mkdirSync(numberDir, { recursive: true })
const globalNumberSizes = []
for (const [prefix, entries] of globalNumberShards) {
  const buffer = Buffer.from(JSON.stringify(entries))
  writeFileSync(join(numberDir, `${prefix}.json`), buffer)
  globalNumberSizes.push(compressedSizes(buffer))
}
const globalNumbers = {
  shards: globalNumberShards.size,
  total: globalNumberSizes.reduce(
    (total, sizes) => ({
      json: total.json + sizes.json,
      gzip: total.gzip + sizes.gzip,
      brotli: total.brotli + sizes.brotli,
    }),
    { json: 0, gzip: 0, brotli: 0 },
  ),
  gzipMax: Math.max(...globalNumberSizes.map((sizes) => sizes.gzip)),
  brotliMax: Math.max(...globalNumberSizes.map((sizes) => sizes.brotli)),
}
const report = { municipalities: results, globalNumbers }
writeFileSync(join(outputRoot, 'results.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
