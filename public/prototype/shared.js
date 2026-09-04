/* PROTOTYPE — throwaway. Example data + helpers shared by the "Field notebook"
   prototype pages. Nothing here touches real app state. State is kept in
   sessionStorage only so that actions carry between prototype pages. */

window.PROTO = (() => {
  const now = Date.now()
  const day = 86_400_000
  const CHECKS = [
    ['price', 'Price'],
    ['area', 'Area'],
    ['radius', 'Distance from Vilnius'],
    ['purpose', 'Land purpose'],
    ['walk_to_stop', 'Walk to bus stop'],
    ['commute', 'Bus to city centre'],
    ['eso_cost', 'Electricity hookup'],
    ['budget', 'Plot + hookup budget'],
    ['crime', 'Crime nearby'],
    ['legal_flags', 'Legal restrictions'],
    ['noise', 'Noise'],
    ['livability', 'Shops & schools'],
    ['water_sewage', 'Water & sewage'],
  ]
  const poly = (cx, cy, pts) => ({
    type: 'Polygon',
    coordinates: [pts.map(([dx, dy]) => [cx + dx * 0.00045, cy + dy * 0.00028])],
  })
  const checks = (map) =>
    CHECKS.map(([key, label]) => {
      const c = map[key] || ['unknown', 'Not checked', null]
      return { key, label, status: c[0], value: c[1], detail: c[2] }
    })
  // an "area" = a Candidate Plot in the app's vocabulary
  const area = (o) => ({
    name: null, priceEur: null, areaAres: null, purpose: null, notes: null,
    clue: { kind: 'address', parcel: '', lat: null, lng: null, precision: 'approx', address: '' },
    resolved: { state: 'missing', lat: null, lng: null, address: null, parcel: null, cadastral: null, boundary: null, precision: null, dataset: null, diagnostic: null },
    ratings: { road: null, feeling: null, view: null },
    checks: checks({}), ...o,
  })

  const seed = () => ({
    household: { name: 'Rūta & Tomas', sync: 'connected', lastChange: now - 4 * 60_000 },
    plan: ['l1', 'l3'],
    inbox: [
      { id: 'i1', sourceId: '1-4130044', title: 'Sklypas Skaidiškėse', description: 'Namų valdos sklypas ramioje vietoje, šalia miško. Elektra prie sklypo.', priceEur: 36500, areaAres: 11.2, photo: 2 },
      { id: 'i2', sourceId: '1-4128870', title: null, description: null, priceEur: 58000, areaAres: 15, photo: null },
      { id: 'i3', sourceId: '1-4131502', title: 'Sklypas Didžiojoje Riešėje', description: 'Lygus sklypas, greta naujų namų kvartalo. Miesto vandentiekis ir nuotekos gatvėje.', priceEur: 47900, areaAres: 9.6, photo: 8 },
      { id: 'i4', sourceId: '1-4127711', title: 'Namų valda Kalvelėse', description: 'Sklypas su vaizdu į slėnį. Privažiavimas žvyrkeliu.', priceEur: 29000, areaAres: 20, photo: 6 },
      { id: 'i5', sourceId: '1-4132009', title: 'Sklypas Zujūnuose', description: null, priceEur: 74000, areaAres: 12, photo: 7 },
    ],
    listings: [
      {
        id: 'l1', sourceId: '1-3928811', url: 'https://www.aruodas.lt/1-3928811/',
        title: 'Sklypas Riešėje, prie miško', address: 'Riešė, Vilniaus r.',
        description: 'Parduodamas 12,5 a namų valdos sklypas Riešėje. Ramus kvartalas, asfaltuotas privažiavimas, elektra ir vandentiekis šalia. Iki Vilniaus centro – 14 km.',
        photos: [1, 6, 7], visitedAt: now - 13 * day, updatedAt: now - 2 * day,
        utilities: { electricity: 'nearby', water: 'city', sewage: 'none' },
        areas: [
          area({
            id: 'a1', name: 'Whole plot', priceEur: 39000, areaAres: 12.5, purpose: 'Residential (namų valda)',
            notes: 'Neighbour on the north side is building. Ask about the drainage ditch.',
            clue: { kind: 'parcel', parcel: '4400-1234-5678', lat: null, lng: null, precision: 'exact', address: 'Riešė, Vilniaus r.' },
            resolved: { state: 'resolved', lat: 54.7702, lng: 25.2415, address: 'Miško g. 14, Riešė', parcel: '4400-1234-5678', cadastral: '4170/0400:123', precision: 'exact', dataset: '2026-08 registry', diagnostic: null,
              boundary: poly(25.2415, 54.7702, [[-1, -1], [1.1, -0.9], [1.3, 0.8], [0.2, 1.2], [-1.1, 0.9]]) },
            ratings: { road: 4, feeling: 5, view: 4 },
            checks: checks({
              price: ['pass', '39 000 €'], area: ['pass', '12.5 a'], radius: ['pass', '14 km'], purpose: ['pass', 'Residential'],
              walk_to_stop: ['pass', '6 min', 'Stop "Riešės mokykla"'], commute: ['warning', '52 min', 'Bus 43 → centre, arriving 08:30'],
              eso_cost: ['warning', '≈ 2 300 €', 'Group II, 380 m to the grid'], budget: ['pass', '41 300 €'], crime: ['pass', 'Low'],
              legal_flags: ['pass', 'None found'], noise: ['pass', 'Quiet'], livability: ['pass', 'Shop 1.2 km, school 3 km'],
              water_sewage: ['warning', 'Well + septic'],
            }),
          }),
          area({
            id: 'a1b', name: 'Eastern half only', priceEur: 21000, areaAres: 6.2, purpose: 'Residential',
            notes: 'Seller might split. Asked on 20 Aug.',
            clue: { kind: 'coordinates', parcel: '', lat: 54.7703, lng: 25.2421, precision: 'approx', address: '' },
            resolved: { state: 'resolved', lat: 54.7703, lng: 25.2421, address: 'Miško g., Riešė', parcel: null, cadastral: null, precision: 'approx', dataset: '2026-08 registry', boundary: null, diagnostic: null },
            ratings: { road: 3, feeling: 5, view: 5 },
            checks: checks({ price: ['pass', '21 000 €'], area: ['fail', '6.2 a', 'Below your 10 a minimum'], radius: ['pass', '14 km'], purpose: ['pass', 'Residential'], walk_to_stop: ['pass', '6 min'], commute: ['warning', '52 min'], eso_cost: ['warning', '≈ 2 300 €'], budget: ['pass', '23 300 €'], crime: ['pass', 'Low'], legal_flags: ['pass', 'None found'], noise: ['pass', 'Quiet'], livability: ['pass', 'Shop 1.2 km'], water_sewage: ['warning', 'Well + septic'] }),
          }),
        ],
      },
      {
        id: 'l2', sourceId: '1-4011209', url: 'https://www.aruodas.lt/1-4011209/',
        title: 'Namų valdos sklypas Sudervėje', address: 'Sudervė, Vilniaus r.',
        description: 'Sklypas su miško vaizdu. Kelias žvyruotas. Galima statyti gyvenamą namą.',
        photos: [2], visitedAt: null, updatedAt: now - 5 * 3_600_000, utilities: { electricity: 'none', water: 'none' },
        areas: [
          area({
            id: 'a2', priceEur: 52000, areaAres: 18, purpose: 'Residential',
            clue: { kind: 'address', parcel: '', lat: null, lng: null, precision: 'approx', address: 'Sudervė, Vilniaus r.' },
            resolved: { state: 'resolved', lat: 54.7877, lng: 25.1099, address: 'Sudervė', parcel: null, cadastral: null, precision: 'approx', dataset: null, boundary: null, diagnostic: null },
            checks: checks({ price: ['pass', '52 000 €'], area: ['pass', '18 a'], radius: ['pass', '19 km'], purpose: ['pass', 'Residential'], walk_to_stop: ['warning', '18 min'], commute: ['warning', '1 h 05'], eso_cost: ['pass', '≈ 900 €'], budget: ['pass', '52 900 €'], crime: ['pass', 'Low'], legal_flags: ['pass', 'None found'], noise: ['pass', 'Quiet'], livability: ['warning', 'Shop 4 km'], water_sewage: ['fail', 'No water source nearby', 'No city water within 2 km; well depth unknown'] }),
          }),
        ],
      },
      {
        id: 'l3', sourceId: '1-3871104', url: 'https://www.aruodas.lt/1-3871104/',
        title: 'Sklypas Avižieniuose su komunikacijomis', address: 'Avižieniai, Vilniaus r.',
        description: 'Visos komunikacijos: elektra, miesto vanduo, nuotekos. Asfaltas iki sklypo.',
        photos: [3, 8], visitedAt: now - 3 * day, updatedAt: now - 3 * day, utilities: { electricity: 'connected', water: 'city', sewage: 'city' },
        areas: [
          area({
            id: 'a3', priceEur: 68500, areaAres: 10, purpose: 'Residential', notes: 'Loved the street. Road noise noticeable at 17:00.',
            clue: { kind: 'parcel', parcel: '4400-2222-3333', lat: null, lng: null, precision: 'exact', address: '' },
            resolved: { state: 'resolved', lat: 54.7468, lng: 25.2078, address: 'Lauko g. 3, Avižieniai', parcel: '4400-2222-3333', cadastral: '4103/0200:88', precision: 'exact', dataset: '2026-08 registry', diagnostic: null,
              boundary: poly(25.2078, 54.7468, [[-1.2, -0.6], [1.2, -0.7], [1.2, 0.7], [-1.2, 0.6]]) },
            ratings: { road: 5, feeling: 3, view: 3 },
            checks: checks({ price: ['warning', '68 500 €', 'Above your 60 000 € budget'], area: ['pass', '10 a'], radius: ['pass', '9 km'], purpose: ['pass', 'Residential'], walk_to_stop: ['pass', '4 min'], commute: ['pass', '38 min'], eso_cost: ['pass', 'Connected'], budget: ['warning', '68 500 €'], crime: ['pass', 'Low'], legal_flags: ['pass', 'None found'], noise: ['warning', 'Road 200 m'], livability: ['pass', 'Shop 600 m, school 1 km'], water_sewage: ['pass', 'City water & sewage'] }),
          }),
        ],
      },
      {
        id: 'l4', sourceId: '1-4102377', url: 'https://www.aruodas.lt/1-4102377/',
        title: 'Žemės sklypas Bražuolėje, Trakų r.', address: 'Bražuolė, Trakų r.',
        description: 'Žemės ūkio paskirties sklypas prie Bražuolės upelio.',
        photos: [4], visitedAt: null, updatedAt: now - 9 * day, utilities: {},
        areas: [
          area({
            id: 'a4', priceEur: 24900, areaAres: 25, purpose: 'Agricultural',
            clue: { kind: 'address', parcel: '', lat: null, lng: null, precision: 'approx', address: 'Bražuolė, Trakų r.' },
            resolved: { state: 'no-result', lat: null, lng: null, address: null, parcel: null, cadastral: null, precision: null, dataset: null, boundary: null,
              diagnostic: 'Address search: "Bražuolė, Trakų r." → 0 results (Regia, 2026-09-03 10:14)\nParcel dataset: not attempted (no parcel number)' },
            checks: checks({ price: ['pass', '24 900 €'], area: ['pass', '25 a'], purpose: ['fail', 'Agricultural', 'Building a house needs a purpose change'] }),
          }),
        ],
      },
      {
        id: 'l5', sourceId: '1-3990542', url: 'https://www.aruodas.lt/1-3990542/',
        title: 'Sklypas Pagiriuose, ramioje gatvėje', address: 'Pagiriai, Vilniaus r.',
        description: 'Trys gretimi sklypai, galima pirkti atskirai arba kartu.',
        photos: [5], visitedAt: null, updatedAt: now - 1 * day, utilities: { electricity: 'nearby', water: 'city' },
        areas: [
          area({
            id: 'a5', name: 'Plot A (corner)', priceEur: 45000, areaAres: 8.9, purpose: 'Residential',
            clue: { kind: 'parcel', parcel: '4400-5555-0001', lat: null, lng: null, precision: 'exact', address: '' },
            resolved: { state: 'resolved', lat: 54.6112, lng: 25.2007, address: 'Ramioji g. 1, Pagiriai', parcel: '4400-5555-0001', cadastral: '4167/0100:11', precision: 'exact', dataset: '2026-08 registry', diagnostic: null,
              boundary: poly(25.2007, 54.6112, [[-0.8, -1.1], [0.9, -1.2], [1.0, 0.2], [0.3, 1.1], [-0.9, 0.6]]) },
            ratings: { road: 3, feeling: 4, view: 2 },
            checks: checks({ price: ['pass', '45 000 €'], area: ['warning', '8.9 a', 'Below your 10 a minimum'], radius: ['pass', '11 km'], purpose: ['pass', 'Residential'], walk_to_stop: ['pass', '7 min'], commute: ['pass', '41 min'], eso_cost: ['pass', '≈ 600 €'], budget: ['pass', '45 600 €'], crime: ['warning', 'Medium'], legal_flags: ['fail', 'Protected area', 'Inside a landscape reserve (INSPIRE)'], noise: ['warning', 'Railway 400 m'], livability: ['pass', 'Shop 900 m'], water_sewage: ['pass', 'City water'] }),
          }),
          area({ id: 'a5b', name: 'Plot B (middle)', priceEur: 42000, areaAres: 9.1, purpose: 'Residential',
            clue: { kind: 'parcel', parcel: '4400-5555-0002', lat: null, lng: null, precision: 'exact', address: '' },
            resolved: { state: 'resolved', lat: 54.6112, lng: 25.2016, address: 'Ramioji g. 3, Pagiriai', parcel: '4400-5555-0002', cadastral: '4167/0100:12', precision: 'exact', dataset: '2026-08 registry', diagnostic: null,
              boundary: poly(25.2016, 54.6112, [[-0.9, -1.1], [0.9, -1.1], [0.9, 1.0], [-0.9, 1.0]]) },
            checks: checks({ price: ['pass', '42 000 €'], area: ['warning', '9.1 a'], radius: ['pass', '11 km'], purpose: ['pass', 'Residential'], walk_to_stop: ['pass', '7 min'], commute: ['pass', '41 min'], eso_cost: ['pass', '≈ 700 €'], budget: ['pass', '42 700 €'], crime: ['warning', 'Medium'], legal_flags: ['fail', 'Protected area'], noise: ['warning', 'Railway 400 m'], livability: ['pass', 'Shop 900 m'], water_sewage: ['pass', 'City water'] }) }),
          area({ id: 'a5c', name: 'A + B together', priceEur: 84000, areaAres: 18, purpose: 'Residential', notes: 'Seller offers 3 000 € off if both.',
            clue: { kind: 'parcel', parcel: '4400-5555-0001', lat: null, lng: null, precision: 'exact', address: '' },
            resolved: { state: 'unavailable', lat: null, lng: null, address: null, parcel: null, cadastral: null, precision: null, dataset: null, boundary: null, diagnostic: 'Parcel dataset shard 4167 could not be fetched (offline?)' },
          }),
        ],
      },
      {
        id: 'l6', sourceId: '1-4120001', url: 'https://www.aruodas.lt/1-4120001/',
        title: 'Sklypas Nemenčinės pl., miško apsuptyje', address: null, description: null,
        photos: [], visitedAt: null, updatedAt: now - 40 * 60_000, utilities: {},
        areas: [area({ id: 'a6', areaAres: 30, clue: { kind: 'address', parcel: '', lat: null, lng: null, precision: 'approx', address: '' } })],
      },
    ],
  })

  /* ---------- state (sessionStorage so actions carry across pages) ---------- */
  const KEY = 'fmh-proto-state-v2'
  let state
  try { state = JSON.parse(sessionStorage.getItem(KEY)) } catch (e) { state = null }
  if (!state || !state.listings) state = seed()
  const save = () => sessionStorage.setItem(KEY, JSON.stringify(state))
  const reset = () => { sessionStorage.removeItem(KEY); location.reload() }

  /* ---------- formatting ---------- */
  const eur = (v) => (v === null || v === undefined ? null : new Intl.NumberFormat('lt-LT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v))
  const ares = (v) => (v === null || v === undefined ? null : `${new Intl.NumberFormat('lt-LT').format(v)} a`)
  const perAre = (p, a) => (p && a ? new Intl.NumberFormat('lt-LT', { maximumFractionDigits: 0 }).format(p / a) + ' €/a' : null)
  const dateShort = (t) => (t === null ? null : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(t)))
  const dateLong = (t) => (t === null ? 'Not yet' : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(t)))
  const ago = (t) => {
    const s = Math.floor((Date.now() - t) / 1000)
    if (s < 60) return 'just now'
    const m = Math.floor(s / 60)
    if (m < 60) return `${m} min ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h} h ago`
    const d = Math.floor(h / 24)
    return d === 1 ? 'yesterday' : `${d} days ago`
  }
  const summary = (cs) => { const c = { pass: 0, warning: 0, fail: 0, unknown: 0 }; cs.forEach((x) => c[x.status]++); return c }
  const primary = (l) => l.areas[0]
  const locState = (a) => (a.resolved.state === 'resolved' ? a.resolved.precision : a.resolved.state === 'missing' ? 'unknown' : 'problem')
  const listing = (id) => state.listings.find((l) => l.id === id)
  const planned = (id) => state.plan.includes(id)
  const togglePlan = (id) => { const i = state.plan.indexOf(id); if (i >= 0) state.plan.splice(i, 1); else state.plan.push(id); save() }

  /* ---------- html bits ---------- */
  const strip = (cs, large) => `<span class="strip ${large ? 'lg' : ''}">${cs.map((x) => `<i class="${x.status}" title="${x.label}: ${x.value}"></i>`).join('')}</span>`
  const stripSum = (cs) => {
    const c = summary(cs)
    if (c.pass + c.warning + c.fail === 0) return `<span class="strip-sum">not checked yet</span>`
    if (c.fail) return `<span class="strip-sum"><b>${c.fail} problem${c.fail > 1 ? 's' : ''}</b>: ${cs.filter((x) => x.status === 'fail').map((x) => x.label.toLowerCase()).join(', ')}</span>`
    if (c.warning) return `<span class="strip-sum"><span class="w">${c.warning} to look at</span></span>`
    return `<span class="strip-sum">all ${c.pass} fine</span>`
  }
  const FLAG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>`
  const CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>`
  const PIN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 22s7-7.5 7-12.5A7 7 0 0 0 5 9.5C5 14.5 12 22 12 22z"/><circle cx="12" cy="9.5" r="2.5"/></svg>`
  const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

  /* ---------- landscape placeholder photos ---------- */
  const scene = (seedN, w = 640, h = 480) => {
    if (seedN === null || seedN === undefined) return null
    const skies = [['#dbe9f3', '#f6f3ea'], ['#c9d9e8', '#eef0e6'], ['#e6eef2', '#f8f1df'], ['#cfdde9', '#f3efe4'], ['#e2e8ec', '#f0efe7']]
    const fields = ['#8fae5a', '#a7b86a', '#7f9f52', '#b3b96e', '#98ad5f']
    const trees = ['#2f4d33', '#35553a', '#2a4630', '#3a5a3b', '#2e4a31']
    const [a, b] = skies[seedN % 5], f = fields[seedN % 5], t = trees[seedN % 5]
    const horizon = h * (0.52 + ((seedN * 7) % 5) * 0.02)
    let tl = ''
    for (let x = -20; x < w + 20; x += 34 + ((seedN * 13 + x) % 11)) { const th = 26 + ((seedN * 31 + x) % 30); tl += `<path d="M${x} ${horizon} l17 -${th} l17 ${th}z" fill="${t}"/>` }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#s)"/>${tl}<rect y="${horizon}" width="${w}" height="${h - horizon}" fill="${f}"/></svg>`
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  }

  /* ---------- maps (Leaflet from CDN) ---------- */
  const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
  const shapeLayer = (a, color, selected) => {
    const style = { color, weight: selected ? 4 : 2.5, fillColor: color, fillOpacity: selected ? 0.35 : 0.18 }
    if (a.resolved.boundary) return L.geoJSON({ type: 'Feature', geometry: a.resolved.boundary }, { style })
    return L.circle([a.resolved.lat, a.resolved.lng], { radius: a.resolved.precision === 'approx' ? 80 : 24, dashArray: '6 5', ...style })
  }
  const located = (l) => l.areas.filter((a) => a.resolved.lat !== null)
  // Small non-interactive map: the plot highlighted with its surroundings.
  const miniMap = (el, l, color) => {
    const areas = located(l)
    if (!areas.length) return
    const map = L.map(el, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, tap: false })
    L.tileLayer(TILES).addTo(map)
    const g = L.featureGroup(areas.map((a) => shapeLayer(a, color, false))).addTo(map)
    map.fitBounds(g.getBounds().pad(2.2), { maxZoom: 16 })
  }
  const bigMap = (el, items, opts = {}) => {
    const map = L.map(el, { zoomControl: true })
    L.tileLayer(TILES, { attribution: '© OpenStreetMap' }).addTo(map)
    const layer = L.featureGroup().addTo(map)
    const draw = (selectedId) => {
      layer.clearLayers()
      items.forEach((it) => {
        const sel = it.id === selectedId
        const s = shapeLayer(it.area, it.color || (sel ? '#e8641b' : '#2a5d9f'), sel)
        if (it.label) s.bindTooltip(it.label, { permanent: true, direction: it.stop ? 'center' : 'top', className: it.stop ? 'fmh-stop' : `fmh-label ${sel ? 'sel' : ''}` })
        if (opts.onSelect) s.on('click', () => opts.onSelect(it.id))
        s.addTo(layer)
      })
    }
    draw(opts.selectedId)
    if (items.length) map.fitBounds(layer.getBounds().pad(0.3), { maxZoom: 17 })
    return { map, draw, focus: (id) => { const it = items.find((x) => x.id === id); if (it) map.flyTo([it.area.resolved.lat, it.area.resolved.lng], Math.max(map.getZoom(), 16), { duration: 0.5 }) } }
  }

  /* ---------- shared chrome ---------- */
  const syncText = { connected: 'Both devices connected', syncing: 'Syncing…', alone: 'Only this device' }
  const header = (active) => `
    <header class="top">
      <div>
        <h1 id="hh-name">${escape(state.household.name)}</h1>
        <div class="sub">
          <span class="dot ${state.household.sync}"></span>
          <span>${syncText[state.household.sync]}</span>
          <span>·</span><span>Last change ${ago(state.household.lastChange)}</span>
          <button class="linkbtn" onclick="document.getElementById('hh').showModal()">Our search settings</button>
        </div>
      </div>
      <nav class="nav">
        <a class="pill" href="plots.html" ${active === 'plots' ? 'aria-current="page"' : ''}>Plots <span class="n">${state.listings.length}</span></a>
        <a class="pill blue ${state.inbox.length ? '' : 'hidden'}" href="inbox.html" ${active === 'inbox' ? 'aria-current="page"' : ''}>Clippings <span class="n">${state.inbox.length}</span></a>
        <a class="pill stake" href="trip.html" ${active === 'trip' ? 'aria-current="page"' : ''}>Going to see <span class="n">${state.plan.length}</span></a>
        <button class="pill primary" onclick="document.getElementById('imp').showModal()">+ Add a plot</button>
      </nav>
    </header>`

  const dialogs = () => `
    <dialog id="hh">
      <button class="close" aria-label="Close" onclick="this.closest('dialog').close()">×</button>
      <h2>Our search</h2>
      <p>Everyone in this search sees the same plots, on every device.</p>
      <h3>Name</h3>
      <div class="rowline"><input id="hh-input" value="${escape(state.household.name)}" aria-label="Search name" style="flex:1;width:auto" /><button class="btn" onclick="PROTO.rename()">Save</button></div>
      <h3>Invite someone</h3>
      <p>Show this to your partner or open the link on another device. Anyone with it can edit — it can't be taken back.</p>
      <div class="qr" role="img" aria-label="QR code placeholder"></div>
      <div class="rowline"><input readonly value="https://woyken.github.io/find-me-home/#household=…" aria-label="Invitation link" style="flex:1;width:auto" /><button class="btn ghost" onclick="PROTO.toast('Link copied')">Copy</button></div>
      <h3>Searches on this device</h3>
      <div class="device"><span>${escape(state.household.name)}</span><span class="tag">This one</span></div>
      <div class="device"><span>Sodyba prie ežero</span><button class="linkbtn" onclick="PROTO.toast('Switched (prototype)')">Switch</button></div>
      <div class="rowline"><button class="btn danger" onclick="if(confirm('Remove this search from this device? It stays on other devices.'))PROTO.toast('Removed (prototype)')">Remove this search from this device</button></div>
      <p>It stays on other devices.</p>
    </dialog>
    <dialog id="imp">
      <button class="close" aria-label="Close" onclick="this.closest('dialog').close()">×</button>
      <h2>Add a plot from Aruodas</h2>
      <p>Set this up once; after that it's one click per plot.</p>
      <ol class="steps">
        <li><div>Drag this button to your browser's bookmarks bar.<br /><a class="drag" href="javascript:void(0)" onclick="return false">Save to Find Me Home</a><br /><small>On a phone: <button class="linkbtn" onclick="PROTO.toast('Bookmark link copied')">copy the link</button> and add it as a bookmark by hand.</small></div></li>
        <li><div>Open a land advert on aruodas.lt — or your favourites page to add many at once.</div></li>
        <li><div>Click the bookmark. The plot appears here, ready to review.</div></li>
      </ol>
      <p style="margin-top:14px">Try it: <a href="review.html">see what the review step looks like</a>.</p>
    </dialog>`

  const rename = () => { state.household.name = document.getElementById('hh-input').value; save(); const h = document.getElementById('hh-name'); if (h) h.textContent = state.household.name; document.getElementById('hh').close(); toast('Name saved') }
  const toast = (msg) => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 1800) }

  const PAGES = [
    ['plots.html', 'Plots'], ['plot.html', 'Plot detail'], ['trip.html', 'Going to see'],
    ['inbox.html', 'Clippings deck'], ['review.html', 'Review import'], ['start.html', 'First run'],
  ]
  const mountSwitcher = () => {
    const file = location.pathname.split('/').pop()
    const idx = PAGES.findIndex((v) => v[0] === file)
    if (idx < 0) return
    const prev = PAGES[(idx + PAGES.length - 1) % PAGES.length][0]
    const next = PAGES[(idx + 1) % PAGES.length][0]
    const bar = document.createElement('div')
    bar.id = 'proto-switcher'
    bar.innerHTML = `<a href="${prev}" aria-label="Previous page">&#8249;</a><span>${idx + 1}/${PAGES.length} · ${PAGES[idx][1]}</span><a href="${next}" aria-label="Next page">&#8250;</a><a href="index.html" class="all">All pages</a><a href="#" class="all" onclick="PROTO.reset();return false" title="Undo your prototype clicks">Reset data</a>`
    document.body.appendChild(bar)
    window.addEventListener('keydown', (e) => {
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.key === 'ArrowLeft') location.href = prev
      if (e.key === 'ArrowRight') location.href = next
    })
  }
  const mount = (active) => {
    document.body.insertAdjacentHTML('beforeend', dialogs())
    const slot = document.getElementById('header')
    if (slot) slot.outerHTML = header(active)
    mountSwitcher()
  }
  const refreshHeader = (active) => { const h = document.querySelector('header.top'); if (h) h.outerHTML = header(active) }

  return {
    refreshHeader,
    state, save, reset, CHECKS, eur, ares, perAre, dateShort, dateLong, ago, summary, primary, locState, listing, planned, togglePlan,
    strip, stripSum, FLAG, CHECK, PIN, escape, scene, miniMap, bigMap, located, shapeLayer, mount, rename, toast,
  }
})()
