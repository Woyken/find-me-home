import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import {
  appendFile,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGzip, createInflateRaw } from 'node:zlib'
import {
  PARCEL_CELL_SIZE_METRES,
  PARCEL_GENERATOR_VERSION,
  PARCEL_MUNICIPALITIES,
  PARCEL_SCHEMA_VERSION,
  validateParcelAssets,
} from '../src/parcels/artifacts.ts'
import type {
  ParcelAsset,
  ParcelManifest,
  ParcelReference,
  ParcelRings,
  PrefixShard,
  SpatialParcelTuple,
} from '../src/parcels/artifacts.ts'

const RC_BASE_URL = 'https://www.registrucentras.lt/aduomenys/'
const outputDirectory = path.resolve(process.argv[2] ?? 'dist/parcels')
const SPOOL_BATCH_SIZE = 500

interface RcFeature {
  type: unknown
  properties: RcProperties
  geometry: { type: 'Polygon'; coordinates: ParcelRings } | null
}

interface RcProperties {
  kadastro_nr?: string | null
  unikalus_nr?: string | number | null
  pask_tipas?: string | number | null
  skl_plotas?: string | number | null
}

async function download(url: string, destination: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'find-me-home parcel generator' },
  })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  if (!response.body) throw new Error(`${url}: empty response`)
  await pipeline(
    Readable.from(response.body as AsyncIterable<Uint8Array>),
    createWriteStream(destination),
  )
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(destination)) hash.update(chunk)
  return hash.digest('hex')
}

async function zipEntry(
  zipPath: string,
): Promise<{ start: number; size: number }> {
  const file = await open(zipPath, 'r')
  try {
    const header = Buffer.alloc(30)
    await file.read(header, 0, header.length, 0)
    if (header.readUInt32LE(0) !== 0x04034b50) throw new Error('invalid RC ZIP')
    if (header.readUInt16LE(8) !== 8 || header.readUInt16LE(6) & 0x08) {
      throw new Error('unsupported RC ZIP structure')
    }
    return {
      start: 30 + header.readUInt16LE(26) + header.readUInt16LE(28),
      size: header.readUInt32LE(18),
    }
  } finally {
    await file.close()
  }
}

function parseFeature(line: string): RcFeature | null {
  const trimmed = line.trim().replace(/,$/, '')
  if (!trimmed.startsWith('{ "type": "Feature"')) return null
  const feature = JSON.parse(trimmed) as {
    type?: unknown
    properties?: RcProperties | null
    geometry?: RcFeature['geometry']
  }
  if (
    feature.type !== 'Feature' ||
    !feature.properties ||
    !('kadastro_nr' in feature.properties) ||
    !('unikalus_nr' in feature.properties) ||
    !('skl_plotas' in feature.properties)
  ) {
    throw new Error('RC source/package schema mismatch')
  }
  return {
    type: feature.type,
    properties: feature.properties,
    geometry: feature.geometry ?? null,
  }
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

function normalizeNumber(value: string | null): string | null {
  const normalized = value?.replace(/\D/g, '') ?? ''
  return normalized.length >= 4 ? normalized : null
}

async function flushSpool(
  directory: string,
  batches: Map<string, Array<string>>,
): Promise<void> {
  for (const [key, lines] of batches) {
    await appendFile(path.join(directory, key), `${lines.join('\n')}\n`)
  }
  batches.clear()
}

function batchLine(
  batches: Map<string, Array<string>>,
  key: string,
  line: string,
): void {
  const lines = batches.get(key) ?? []
  lines.push(line)
  batches.set(key, lines)
}

async function spoolMunicipality(
  zipPath: string,
  municipalityCode: number,
  purposes: Map<number, string>,
  cellsDirectory: string,
  prefixesDirectory: string,
): Promise<{ extent: [number, number, number, number]; parcelCount: number }> {
  const entry = await zipEntry(zipPath)
  const lines = createInterface({
    input: createReadStream(zipPath, {
      start: entry.start,
      end: entry.start + entry.size - 1,
    }).pipe(createInflateRaw()),
    crlfDelay: Infinity,
  })
  const cellBatches = new Map<string, Array<string>>()
  const prefixBatches = new Map<string, Array<string>>()
  let extent: [number, number, number, number] = [
    Infinity,
    Infinity,
    -Infinity,
    -Infinity,
  ]
  let parcelCount = 0
  for await (const line of lines) {
    const feature = parseFeature(line)
    if (!feature?.geometry) continue
    const areaHa =
      feature.properties.skl_plotas === null ||
      feature.properties.skl_plotas === undefined
        ? null
        : Number(feature.properties.skl_plotas)
    const purposeId = Number(feature.properties.pask_tipas)
    const cadastralNumber = feature.properties.kadastro_nr ?? null
    const uniqueNumber =
      feature.properties.unikalus_nr === null ||
      feature.properties.unikalus_nr === undefined
        ? null
        : String(feature.properties.unikalus_nr)
    const parcelBbox = bbox(feature.geometry.coordinates)
    extent = [
      Math.min(extent[0], parcelBbox[0]),
      Math.min(extent[1], parcelBbox[1]),
      Math.max(extent[2], parcelBbox[2]),
      Math.max(extent[3], parcelBbox[3]),
    ]
    const parcelId = `${municipalityCode}:${parcelCount}`
    const cells = cellsForBbox(parcelBbox)
    const tuple: SpatialParcelTuple = [
      parcelId,
      cadastralNumber,
      uniqueNumber,
      areaHa !== null && Number.isFinite(areaHa)
        ? Math.round(areaHa * 10_000)
        : null,
      purposes.get(purposeId) ?? null,
      feature.geometry.coordinates,
      parcelBbox,
    ]
    const tupleLine = JSON.stringify(tuple)
    for (const cell of cells) batchLine(cellBatches, cell, tupleLine)

    const completeNumbers = new Set(
      [cadastralNumber, uniqueNumber]
        .map(normalizeNumber)
        .filter((number): number is string => number !== null),
    )
    if (completeNumbers.size === 0) {
      throw new Error(`orphan parcel ${parcelId} has no complete number`)
    }
    for (const number of completeNumbers) {
      const references = cells.map((cell): ParcelReference => [
        municipalityCode,
        cell,
        parcelId,
      ])
      batchLine(
        prefixBatches,
        number.slice(0, 4),
        JSON.stringify([number, references]),
      )
    }
    parcelCount++
    if (parcelCount % SPOOL_BATCH_SIZE === 0) {
      await Promise.all([
        flushSpool(cellsDirectory, cellBatches),
        flushSpool(prefixesDirectory, prefixBatches),
      ])
    }
  }
  await Promise.all([
    flushSpool(cellsDirectory, cellBatches),
    flushSpool(prefixesDirectory, prefixBatches),
  ])
  if (parcelCount === 0) {
    throw new Error(`municipality ${municipalityCode} has no parcels`)
  }
  return { extent, parcelCount }
}

function parsePurposes(csv: string): Map<number, string> {
  const purposes = new Map<number, string>()
  const lines = csv.split(/\r?\n/)
  const header = lines[0]?.split('|') ?? []
  if (header.length < 6) throw new Error('purpose classifier schema mismatch')
  for (const line of lines.slice(1)) {
    const columns = line.split('|')
    const id = Number(columns[0])
    const text = columns[5] || columns[2]
    if (Number.isFinite(id) && text) purposes.set(id, text)
  }
  if (purposes.size === 0) throw new Error('purpose classifier is empty')
  return purposes
}

async function writeCompressedJson(
  destination: string,
  chunks: AsyncIterable<string> | Iterable<string>,
): Promise<ParcelAsset> {
  await mkdir(path.dirname(destination), { recursive: true })
  await pipeline(
    Readable.from(chunks),
    createGzip({ level: 9 }),
    createWriteStream(destination),
  )
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(destination)) hash.update(chunk)
  return {
    path: '',
    sha256: hash.digest('hex'),
    compressedBytes: (await stat(destination)).size,
    parcelCount: 0,
  }
}

async function* spatialJson(
  spoolPath: string,
  onParcel: () => void,
): AsyncGenerator<string> {
  yield '{"parcels":['
  let first = true
  for await (const line of createInterface({
    input: createReadStream(spoolPath),
    crlfDelay: Infinity,
  })) {
    if (!line) continue
    yield `${first ? '' : ','}${line}`
    onParcel()
    first = false
  }
  yield ']}'
}

async function readPrefixSpool(
  spoolPath: string,
): Promise<PrefixShard['references']> {
  const grouped = new Map<string, Array<ParcelReference>>()
  for await (const line of createInterface({
    input: createReadStream(spoolPath),
    crlfDelay: Infinity,
  })) {
    if (!line) continue
    const [number, references] = JSON.parse(line) as [
      string,
      Array<ParcelReference>,
    ]
    const existing = grouped.get(number) ?? []
    existing.push(...references)
    grouped.set(number, existing)
  }
  return [...grouped].sort(([a], [b]) => a.localeCompare(b))
}

function calculateDatasetVersion(
  sourceVersions: Record<string, string>,
  cells: Record<string, ParcelAsset>,
  prefixes: Record<string, ParcelAsset>,
): string {
  return createHash('sha256')
    .update(
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
    )
    .digest('hex')
    .slice(0, 16)
}

async function finalizeAssets(
  spoolDirectory: string,
  publicationDirectory: string,
  sourceVersions: Record<string, string>,
  municipalities: ParcelManifest['municipalities'],
): Promise<ParcelManifest> {
  const cells: Record<string, ParcelAsset> = {}
  const cellSpoolDirectory = path.join(spoolDirectory, 'cells')
  for (const cell of (await readdir(cellSpoolDirectory)).sort((a, b) =>
    a.localeCompare(b),
  )) {
    const relativePath = `cells/${cell}.json.gz`
    let parcelCount = 0
    const asset = await writeCompressedJson(
      path.join(publicationDirectory, relativePath),
      spatialJson(path.join(cellSpoolDirectory, cell), () => parcelCount++),
    )
    cells[cell] = { ...asset, path: relativePath, parcelCount }
  }

  const prefixes: Record<string, ParcelAsset> = {}
  const prefixSpoolDirectory = path.join(spoolDirectory, 'prefixes')
  for (const prefix of (await readdir(prefixSpoolDirectory)).sort((a, b) =>
    a.localeCompare(b),
  )) {
    const references = await readPrefixSpool(
      path.join(prefixSpoolDirectory, prefix),
    )
    const relativePath = `prefixes/${prefix}.json.gz`
    const asset = await writeCompressedJson(
      path.join(publicationDirectory, relativePath),
      [JSON.stringify({ references } satisfies PrefixShard)],
    )
    prefixes[prefix] = {
      ...asset,
      path: relativePath,
      parcelCount: references.length,
    }
  }

  const manifest: ParcelManifest = {
    schemaVersion: PARCEL_SCHEMA_VERSION,
    generatorVersion: PARCEL_GENERATOR_VERSION,
    datasetVersion: calculateDatasetVersion(sourceVersions, cells, prefixes),
    builtAt: new Date().toISOString(),
    cellSizeMetres: PARCEL_CELL_SIZE_METRES,
    sourceVersions,
    municipalities,
    cells,
    prefixes,
  }
  await writeFile(
    path.join(publicationDirectory, 'manifest.json'),
    JSON.stringify(manifest),
  )
  return manifest
}

async function main(): Promise<void> {
  const workingDirectory = await mkdtemp(
    path.join(tmpdir(), 'find-me-home-parcels-'),
  )
  await mkdir(path.dirname(outputDirectory), { recursive: true })
  const publicationDirectory = await mkdtemp(
    path.join(
      path.dirname(outputDirectory),
      `.${path.basename(outputDirectory)}-staging-`,
    ),
  )
  try {
    const purposesPath = path.join(workingDirectory, 'purposes.csv')
    const purposeVersion = await download(
      `${RC_BASE_URL}?byla=klas_NTR_paskirciu_tipai.csv`,
      purposesPath,
    )
    const purposes = parsePurposes(await readFile(purposesPath, 'utf8'))
    const spoolDirectory = path.join(workingDirectory, 'spool')
    const cellsDirectory = path.join(spoolDirectory, 'cells')
    const prefixesDirectory = path.join(spoolDirectory, 'prefixes')
    await Promise.all([
      mkdir(cellsDirectory, { recursive: true }),
      mkdir(prefixesDirectory, { recursive: true }),
    ])
    const sourceVersions: Record<string, string> = {}
    sourceVersions.purposes = purposeVersion
    const municipalities: ParcelManifest['municipalities'] = {}
    for (const municipalityCode of PARCEL_MUNICIPALITIES) {
      const zipPath = path.join(workingDirectory, `${municipalityCode}.zip`)
      sourceVersions[municipalityCode] = await download(
        `${RC_BASE_URL}?byla=gis_pub_parcels_${municipalityCode}.zip`,
        zipPath,
      )
      municipalities[municipalityCode] = await spoolMunicipality(
        zipPath,
        municipalityCode,
        purposes,
        cellsDirectory,
        prefixesDirectory,
      )
    }
    await finalizeAssets(
      spoolDirectory,
      publicationDirectory,
      sourceVersions,
      municipalities,
    )
    const manifest = await validateParcelAssets(publicationDirectory)
    await writeFile(
      path.join(publicationDirectory, 'NOTICE.txt'),
      `Registered Parcel data: Registru centras public GIS exports.\nTransformed by Find Me Home generator v${PARCEL_GENERATOR_VERSION}.\nDataset version: ${manifest.datasetVersion}.\n`,
    )
    await rm(outputDirectory, { recursive: true, force: true })
    await rename(publicationDirectory, outputDirectory)
    console.log(
      `Generated ${Object.keys(manifest.cells).length} cells and ${Object.keys(manifest.prefixes).length} prefixes (${manifest.datasetVersion}).`,
    )
  } finally {
    await rm(workingDirectory, { recursive: true, force: true })
    await rm(publicationDirectory, { recursive: true, force: true })
  }
}

await main()
