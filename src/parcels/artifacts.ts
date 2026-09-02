import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'

export const PARCEL_MUNICIPALITIES = [13, 41, 42, 62, 79, 85, 86, 89] as const
export const PARCEL_SCHEMA_VERSION = 1
export const PARCEL_GENERATOR_VERSION = 1
export const PARCEL_CELL_SIZE_METRES = 5_000

export type ParcelMunicipalityCode = (typeof PARCEL_MUNICIPALITIES)[number]
export type ParcelPoint = [number, number]
export type ParcelRings = Array<Array<ParcelPoint>>

export interface SourceParcel {
  cadastralNumber: string | null
  uniqueNumber: string | null
  areaM2: number | null
  purposeText: string | null
  rings: ParcelRings
}

export interface ParcelSource {
  municipalityCode: number
  sourceVersion: string
  parcels: Array<SourceParcel>
}

export interface ParcelAsset {
  path: string
  sha256: string
  compressedBytes: number
  parcelCount: number
}

export interface ParcelManifest {
  schemaVersion: number
  generatorVersion: number
  datasetVersion: string
  builtAt: string
  cellSizeMetres: number
  sourceVersions: Record<string, string>
  municipalities: Record<
    string,
    { extent: [number, number, number, number]; parcelCount: number }
  >
  cells: Record<string, ParcelAsset>
  prefixes: Record<string, ParcelAsset>
}

export type SpatialParcelTuple = [
  id: string,
  cadastralNumber: string | null,
  uniqueNumber: string | null,
  areaM2: number | null,
  purposeText: string | null,
  rings: ParcelRings,
  bbox: [number, number, number, number],
]

export interface SpatialShard {
  parcels: Array<SpatialParcelTuple>
}

export type ParcelReference = [
  municipalityCode: number,
  cell: string,
  parcelId: string,
]

export interface PrefixShard {
  references: Array<
    [normalizedNumber: string, references: Array<ParcelReference>]
  >
}

interface BuildOptions {
  builtAt?: string
}

interface ValidationOptions {
  maxTotalBytes?: number
}

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function normalizeNumber(value: string | null): string | null {
  const normalized = value?.replace(/\D/g, '') ?? ''
  return normalized.length >= 4 ? normalized : null
}

function bbox(rings: ParcelRings): [number, number, number, number] {
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
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) {
    throw new Error('Registered Parcel has no valid geometry')
  }
  return [minX, minY, maxX, maxY]
}

function cellsForBbox([minX, minY, maxX, maxY]: [
  number,
  number,
  number,
  number,
]): Array<string> {
  const cells: Array<string> = []
  for (
    let x = Math.floor(minX / PARCEL_CELL_SIZE_METRES);
    x <= Math.floor(maxX / PARCEL_CELL_SIZE_METRES);
    x++
  ) {
    for (
      let y = Math.floor(minY / PARCEL_CELL_SIZE_METRES);
      y <= Math.floor(maxY / PARCEL_CELL_SIZE_METRES);
      y++
    ) {
      cells.push(`${x}_${y}`)
    }
  }
  return cells
}

function assetPath(kind: 'cells' | 'prefixes', key: string): string {
  return `${kind}/${key}.json.gz`
}

function encodeAsset(value: unknown): Uint8Array {
  return gzipSync(JSON.stringify(value), { level: 9 })
}

function calculateDatasetVersion(
  sourceVersions: Record<string, string>,
  cells: Record<string, ParcelAsset>,
  prefixes: Record<string, ParcelAsset>,
): string {
  return sha256(
    JSON.stringify({
      schemaVersion: PARCEL_SCHEMA_VERSION,
      generatorVersion: PARCEL_GENERATOR_VERSION,
      sourceVersions,
      cells: Object.fromEntries(
        Object.entries(cells).map(([key, value]) => [key, value.sha256]),
      ),
      prefixes: Object.fromEntries(
        Object.entries(prefixes).map(([key, value]) => [key, value.sha256]),
      ),
    }),
  ).slice(0, 16)
}

export function buildParcelAssetsInMemory(
  sources: Array<ParcelSource>,
  options: BuildOptions = {},
): Map<string, Uint8Array> {
  const expected = [...PARCEL_MUNICIPALITIES]
  const actual = sources.map(({ municipalityCode }) => municipalityCode).sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `sources must cover municipality codes ${expected.join(', ')}`,
    )
  }
  if (sources.some(({ sourceVersion }) => !sourceVersion.trim())) {
    throw new Error('every municipality source must have a source version')
  }

  const spatial = new Map<string, Array<SpatialParcelTuple>>()
  const numbers = new Map<string, Array<ParcelReference>>()
  const municipalities: ParcelManifest['municipalities'] = {}
  const sourceVersions: Record<string, string> = {}

  for (const source of sources) {
    sourceVersions[source.municipalityCode] = source.sourceVersion
    let extent: [number, number, number, number] = [
      Infinity,
      Infinity,
      -Infinity,
      -Infinity,
    ]
    source.parcels.forEach((parcel, index) => {
      const parcelId = `${source.municipalityCode}:${index}`
      const parcelBbox = bbox(parcel.rings)
      extent = [
        Math.min(extent[0], parcelBbox[0]),
        Math.min(extent[1], parcelBbox[1]),
        Math.max(extent[2], parcelBbox[2]),
        Math.max(extent[3], parcelBbox[3]),
      ]
      const cells = cellsForBbox(parcelBbox)
      const record: SpatialParcelTuple = [
        parcelId,
        parcel.cadastralNumber,
        parcel.uniqueNumber,
        parcel.areaM2,
        parcel.purposeText,
        parcel.rings,
        parcelBbox,
      ]
      for (const cell of cells) {
        const records = spatial.get(cell) ?? []
        records.push(record)
        spatial.set(cell, records)
      }
      const completeNumbers = new Set(
        [parcel.cadastralNumber, parcel.uniqueNumber]
          .map(normalizeNumber)
          .filter((number): number is string => number !== null),
      )
      if (completeNumbers.size === 0) {
        throw new Error(`orphan parcel ${parcelId} has no complete number`)
      }
      for (const number of completeNumbers) {
        const references = numbers.get(number) ?? []
        references.push(
          ...cells.map((cell): ParcelReference => [
            source.municipalityCode,
            cell,
            parcelId,
          ]),
        )
        numbers.set(number, references)
      }
    })
    if (source.parcels.length === 0) {
      throw new Error(`municipality ${source.municipalityCode} has no parcels`)
    }
    municipalities[source.municipalityCode] = {
      extent,
      parcelCount: source.parcels.length,
    }
  }

  const files = new Map<string, Uint8Array>()
  const cells: Record<string, ParcelAsset> = {}
  for (const [cell, parcels] of [...spatial].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const bytes = encodeAsset({ parcels } satisfies SpatialShard)
    const file = assetPath('cells', cell)
    files.set(file, bytes)
    cells[cell] = {
      path: file,
      sha256: sha256(bytes),
      compressedBytes: bytes.byteLength,
      parcelCount: parcels.length,
    }
  }

  const prefixGroups = new Map<string, PrefixShard['references']>()
  for (const [number, references] of [...numbers].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const prefix = number.slice(0, 4)
    const entries = prefixGroups.get(prefix) ?? []
    entries.push([number, references])
    prefixGroups.set(prefix, entries)
  }
  const prefixes: Record<string, ParcelAsset> = {}
  for (const [prefix, references] of prefixGroups) {
    const bytes = encodeAsset({ references } satisfies PrefixShard)
    const file = assetPath('prefixes', prefix)
    files.set(file, bytes)
    prefixes[prefix] = {
      path: file,
      sha256: sha256(bytes),
      compressedBytes: bytes.byteLength,
      parcelCount: references.length,
    }
  }

  const manifest: ParcelManifest = {
    schemaVersion: PARCEL_SCHEMA_VERSION,
    generatorVersion: PARCEL_GENERATOR_VERSION,
    datasetVersion: calculateDatasetVersion(sourceVersions, cells, prefixes),
    builtAt: options.builtAt ?? new Date().toISOString(),
    cellSizeMetres: PARCEL_CELL_SIZE_METRES,
    sourceVersions,
    municipalities,
    cells,
    prefixes,
  }
  files.set('manifest.json', Buffer.from(JSON.stringify(manifest)))
  return files
}

export async function buildParcelAssets(
  sources: Array<ParcelSource>,
  outputDirectory: string,
  options: BuildOptions = {},
): Promise<ParcelManifest> {
  const files = buildParcelAssetsInMemory(sources, options)
  await rm(outputDirectory, { recursive: true, force: true })
  for (const [file, bytes] of files) {
    const destination = path.join(outputDirectory, file)
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, bytes)
  }
  return JSON.parse(
    Buffer.from(files.get('manifest.json')!).toString(),
  ) as ParcelManifest
}

export async function validateParcelAssets(
  outputDirectory: string,
  options: ValidationOptions = {},
): Promise<ParcelManifest> {
  const manifest = JSON.parse(
    await readFile(path.join(outputDirectory, 'manifest.json'), 'utf8'),
  ) as ParcelManifest
  if (
    manifest.schemaVersion !== PARCEL_SCHEMA_VERSION ||
    manifest.generatorVersion !== PARCEL_GENERATOR_VERSION
  ) {
    throw new Error('source/package behavior mismatch')
  }
  if (
    JSON.stringify(Object.keys(manifest.municipalities).map(Number).sort()) !==
    JSON.stringify([...PARCEL_MUNICIPALITIES])
  ) {
    throw new Error('manifest municipality coverage mismatch')
  }

  const knownParcels = new Map<string, Map<string, SpatialParcelTuple>>()
  let totalBytes = (await stat(path.join(outputDirectory, 'manifest.json')))
    .size
  for (const [cell, asset] of Object.entries(manifest.cells)) {
    const bytes = await readFile(path.join(outputDirectory, asset.path)).catch(
      () => {
        throw new Error(`missing asset ${asset.path}`)
      },
    )
    totalBytes += bytes.byteLength
    if (sha256(bytes) !== asset.sha256)
      throw new Error(`checksum mismatch for asset ${asset.path}`)
    let shard: SpatialShard
    try {
      shard = JSON.parse(gunzipSync(bytes).toString()) as SpatialShard
    } catch {
      throw new Error(`corrupt gzip asset ${asset.path}`)
    }
    if (shard.parcels.length !== asset.parcelCount) {
      throw new Error(`parcel count mismatch in ${asset.path}`)
    }
    if (
      new Set(shard.parcels.map(([id]) => id)).size !== shard.parcels.length
    ) {
      throw new Error(`duplicate parcel in ${asset.path}`)
    }
    knownParcels.set(
      cell,
      new Map(shard.parcels.map((parcel) => [parcel[0], parcel])),
    )
  }

  const expectedReferences = new Map<string, Set<string>>()
  const parcelCells = new Map<string, Set<string>>()
  const canonicalParcels = new Map<string, SpatialParcelTuple>()
  for (const [cell, parcels] of knownParcels) {
    for (const [parcelId, parcel] of parcels) {
      const canonical = canonicalParcels.get(parcelId)
      if (canonical && JSON.stringify(canonical) !== JSON.stringify(parcel)) {
        throw new Error(`inconsistent spatial copies for parcel ${parcelId}`)
      }
      canonicalParcels.set(parcelId, parcel)
      const presentCells = parcelCells.get(parcelId) ?? new Set<string>()
      presentCells.add(cell)
      parcelCells.set(parcelId, presentCells)
      const completeNumbers = new Set(
        [parcel[1], parcel[2]]
          .map(normalizeNumber)
          .filter((number): number is string => number !== null),
      )
      for (const number of completeNumbers) {
        const references = expectedReferences.get(number) ?? new Set<string>()
        references.add(`${Number(parcelId.split(':')[0])}/${cell}/${parcelId}`)
        expectedReferences.set(number, references)
      }
    }
  }
  for (const [parcelId, parcel] of canonicalParcels) {
    const expectedCells = new Set(cellsForBbox(parcel[6]))
    const presentCells = parcelCells.get(parcelId)!
    if (
      expectedCells.size !== presentCells.size ||
      [...expectedCells].some((cell) => !presentCells.has(cell))
    ) {
      throw new Error(`incomplete spatial reachability for parcel ${parcelId}`)
    }
  }
  const actualReferences = new Map<string, Set<string>>()
  for (const [prefix, asset] of Object.entries(manifest.prefixes)) {
    const bytes = await readFile(path.join(outputDirectory, asset.path)).catch(
      () => {
        throw new Error(`missing asset ${asset.path}`)
      },
    )
    totalBytes += bytes.byteLength
    if (sha256(bytes) !== asset.sha256)
      throw new Error(`checksum mismatch for asset ${asset.path}`)
    let shard: PrefixShard
    try {
      shard = JSON.parse(gunzipSync(bytes).toString()) as PrefixShard
    } catch {
      throw new Error(`corrupt gzip asset ${asset.path}`)
    }
    for (const [number, references] of shard.references) {
      if (
        number.length < 4 ||
        number.slice(0, 4) !== prefix ||
        references.length === 0
      ) {
        throw new Error(`broken number reference ${number}`)
      }
      const actual = actualReferences.get(number) ?? new Set<string>()
      for (const [municipalityCode, cell, parcelId] of references) {
        const parcel = knownParcels.get(cell)?.get(parcelId)
        const parcelNumbers = parcel
          ? [parcel[1], parcel[2]].map(normalizeNumber)
          : []
        if (
          !parcel ||
          Number(parcelId.split(':')[0]) !== municipalityCode ||
          !parcelNumbers.includes(number)
        ) {
          throw new Error(`broken reference ${number} -> ${cell}/${parcelId}`)
        }
        const reference = `${municipalityCode}/${cell}/${parcelId}`
        if (actual.has(reference)) {
          throw new Error(
            `duplicate reference ${number} -> ${cell}/${parcelId}`,
          )
        }
        actual.add(reference)
      }
      actualReferences.set(number, actual)
    }
  }
  for (const [number, expected] of expectedReferences) {
    const actual = actualReferences.get(number)
    if (
      !actual ||
      actual.size !== expected.size ||
      [...expected].some((reference) => !actual.has(reference))
    ) {
      throw new Error(`incomplete number reachability for ${number}`)
    }
  }
  for (const number of actualReferences.keys()) {
    if (!expectedReferences.has(number)) {
      throw new Error(`unexpected number reference ${number}`)
    }
  }
  if (
    manifest.datasetVersion !==
    calculateDatasetVersion(
      manifest.sourceVersions,
      manifest.cells,
      manifest.prefixes,
    )
  ) {
    throw new Error('dataset version mismatch for source/package manifest')
  }
  if (totalBytes > (options.maxTotalBytes ?? 1_000_000_000)) {
    throw new Error(
      `parcel assets exceed Pages size limit: ${totalBytes} bytes`,
    )
  }

  const files = await readdir(outputDirectory, { recursive: true })
  const expectedPaths = new Set([
    'manifest.json',
    ...Object.values(manifest.cells).map(({ path: file }) => file),
    ...Object.values(manifest.prefixes).map(({ path: file }) => file),
  ])
  for (const expected of expectedPaths) {
    if (!files.includes(expected))
      throw new Error(`missing manifest asset ${expected}`)
  }
  return manifest
}
