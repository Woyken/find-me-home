/* PROTOTYPE — throwaway. Sample data + helpers shared by the five design
   prototypes of the saved-plots page. Nothing here touches real app state. */

/* ---------- sample household ---------- */
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

  // small polygons near Vilnius (lng, lat)
  const poly = (cx, cy, pts) => ({
    type: 'Polygon',
    coordinates: [
      pts.map(([dx, dy]) => [cx + dx * 0.00045, cy + dy * 0.00028]),
    ],
  })

  const checks = (map) =>
    CHECKS.map(([key, label]) => {
      const c = map[key] || ['unknown', 'Not checked', null]
      return { key, label, status: c[0], value: c[1], detail: c[2] }
    })

  const listings = [
    {
      id: 'l1',
      sourceId: '1-3928811',
      title: 'Sklypas Riešėje, prie miško',
      address: 'Riešė, Vilniaus r.',
      priceEur: 39000,
      areaAres: 12.5,
      purpose: 'Residential (namų valda)',
      plots: 2,
      visitedAt: now - 13 * day,
      updatedAt: now - 2 * day,
      location: 'exact',
      lat: 54.7702,
      lng: 25.2415,
      boundary: poly(25.2415, 54.7702, [
        [-1, -1],
        [1.1, -0.9],
        [1.3, 0.8],
        [0.2, 1.2],
        [-1.1, 0.9],
      ]),
      photo: 1,
      ratings: [4, 5, 4],
      checks: checks({
        price: ['pass', '39 000 €'],
        area: ['pass', '12.5 a'],
        radius: ['pass', '14 km'],
        purpose: ['pass', 'Residential'],
        walk_to_stop: ['pass', '6 min'],
        commute: ['warning', '52 min'],
        eso_cost: ['warning', '≈ 2 300 €', 'Group II, 380 m to grid'],
        budget: ['pass', '41 300 €'],
        crime: ['pass', 'Low'],
        legal_flags: ['pass', 'None found'],
        noise: ['pass', 'Quiet'],
        livability: ['pass', 'Shop 1.2 km, school 3 km'],
        water_sewage: ['warning', 'Well + septic'],
      }),
    },
    {
      id: 'l2',
      sourceId: '1-4011209',
      title: 'Namų valdos sklypas Sudervėje',
      address: 'Sudervė, Vilniaus r.',
      priceEur: 52000,
      areaAres: 18,
      purpose: 'Residential',
      plots: 1,
      visitedAt: null,
      updatedAt: now - 5 * 3_600_000,
      location: 'approx',
      lat: 54.7877,
      lng: 25.1099,
      boundary: null,
      photo: 2,
      ratings: [null, null, null],
      checks: checks({
        price: ['pass', '52 000 €'],
        area: ['pass', '18 a'],
        radius: ['pass', '19 km'],
        purpose: ['pass', 'Residential'],
        walk_to_stop: ['warning', '18 min'],
        commute: ['warning', '1 h 05'],
        eso_cost: ['pass', '≈ 900 €'],
        budget: ['pass', '52 900 €'],
        crime: ['pass', 'Low'],
        legal_flags: ['pass', 'None found'],
        noise: ['pass', 'Quiet'],
        livability: ['warning', 'Shop 4 km'],
        water_sewage: ['fail', 'No water source nearby'],
      }),
    },
    {
      id: 'l3',
      sourceId: '1-3871104',
      title: 'Sklypas Avižieniuose su komunikacijomis',
      address: 'Avižieniai, Vilniaus r.',
      priceEur: 68500,
      areaAres: 10,
      purpose: 'Residential',
      plots: 1,
      visitedAt: now - 3 * day,
      updatedAt: now - 3 * day,
      location: 'exact',
      lat: 54.7468,
      lng: 25.2078,
      boundary: poly(25.2078, 54.7468, [
        [-1.2, -0.6],
        [1.2, -0.7],
        [1.2, 0.7],
        [-1.2, 0.6],
      ]),
      photo: 3,
      ratings: [5, 3, 3],
      checks: checks({
        price: ['warning', '68 500 €', 'Above your 60 000 € budget'],
        area: ['pass', '10 a'],
        radius: ['pass', '9 km'],
        purpose: ['pass', 'Residential'],
        walk_to_stop: ['pass', '4 min'],
        commute: ['pass', '38 min'],
        eso_cost: ['pass', 'Connected'],
        budget: ['warning', '68 500 €'],
        crime: ['pass', 'Low'],
        legal_flags: ['pass', 'None found'],
        noise: ['warning', 'Road 200 m'],
        livability: ['pass', 'Shop 600 m, school 1 km'],
        water_sewage: ['pass', 'City water & sewage'],
      }),
    },
    {
      id: 'l4',
      sourceId: '1-4102377',
      title: 'Žemės sklypas Bražuolėje, Trakų r.',
      address: 'Bražuolė, Trakų r.',
      priceEur: 24900,
      areaAres: 25,
      purpose: 'Agricultural',
      plots: 1,
      visitedAt: null,
      updatedAt: now - 9 * day,
      location: 'problem',
      lat: null,
      lng: null,
      boundary: null,
      photo: 4,
      ratings: [null, null, null],
      checks: checks({
        price: ['pass', '24 900 €'],
        area: ['pass', '25 a'],
        purpose: ['fail', 'Agricultural', 'Building a house needs a purpose change'],
      }),
    },
    {
      id: 'l5',
      sourceId: '1-3990542',
      title: 'Sklypas Pagiriuose, ramioje gatvėje',
      address: 'Pagiriai, Vilniaus r.',
      priceEur: 45000,
      areaAres: 8.9,
      purpose: 'Residential',
      plots: 3,
      visitedAt: null,
      updatedAt: now - 1 * day,
      location: 'exact',
      lat: 54.6112,
      lng: 25.2007,
      boundary: poly(25.2007, 54.6112, [
        [-0.8, -1.1],
        [0.9, -1.2],
        [1.0, 0.2],
        [0.3, 1.1],
        [-0.9, 0.6],
      ]),
      photo: 5,
      ratings: [3, 4, 2],
      checks: checks({
        price: ['pass', '45 000 €'],
        area: ['warning', '8.9 a', 'Below your 10 a minimum'],
        radius: ['pass', '11 km'],
        purpose: ['pass', 'Residential'],
        walk_to_stop: ['pass', '7 min'],
        commute: ['pass', '41 min'],
        eso_cost: ['pass', '≈ 600 €'],
        budget: ['pass', '45 600 €'],
        crime: ['warning', 'Medium'],
        legal_flags: ['fail', 'Protected area', 'Inside a landscape reserve'],
        noise: ['warning', 'Railway 400 m'],
        livability: ['pass', 'Shop 900 m'],
        water_sewage: ['pass', 'City water'],
      }),
    },
    {
      id: 'l6',
      sourceId: '1-4120001',
      title: 'Sklypas Nemenčinės pl., miško apsuptyje',
      address: null,
      priceEur: null,
      areaAres: 30,
      purpose: null,
      plots: 1,
      visitedAt: null,
      updatedAt: now - 40 * 60_000,
      location: 'unknown',
      lat: null,
      lng: null,
      boundary: null,
      photo: null,
      ratings: [null, null, null],
      checks: checks({}),
    },
  ]

  const state = {
    household: { name: 'Rūta & Tomas', sync: 'connected', lastChange: now - 4 * 60_000 },
    inbox: 2,
    plan: ['l1', 'l3'],
    listings,
  }

  /* ---------- formatting ---------- */
  const eur = (v) =>
    v === null
      ? null
      : new Intl.NumberFormat('lt-LT', {
          style: 'currency',
          currency: 'EUR',
          maximumFractionDigits: 0,
        }).format(v)
  const ares = (v) => (v === null ? null : `${new Intl.NumberFormat('lt-LT').format(v)} a`)
  const perAre = (l) =>
    l.priceEur === null || l.areaAres === null
      ? null
      : new Intl.NumberFormat('lt-LT', { maximumFractionDigits: 0 }).format(l.priceEur / l.areaAres) + ' €/a'
  const dateShort = (t) =>
    t === null ? null : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(t))
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
  const summary = (l) => {
    const c = { pass: 0, warning: 0, fail: 0, unknown: 0 }
    l.checks.forEach((x) => c[x.status]++)
    return c
  }
  const rating = (l) => {
    const r = l.ratings.filter((x) => x !== null)
    return r.length ? Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 10) / 10 : null
  }

  /* ---------- SVG: parcel silhouette ---------- */
  // Draws the real boundary if we have one; a dashed circle for an
  // approximate location; a dotted frame for unknown / problem.
  const silhouette = (l, size, opts = {}) => {
    const stroke = opts.stroke || 'currentColor'
    const fill = opts.fill || 'none'
    const pad = 6
    if (l.boundary) {
      const ring = l.boundary.coordinates[0]
      const xs = ring.map((p) => p[0])
      const ys = ring.map((p) => p[1])
      const minX = Math.min(...xs), maxX = Math.max(...xs)
      const minY = Math.min(...ys), maxY = Math.max(...ys)
      const sx = (maxX - minX) * 1.6 // lng compressed at 54° N
      const sy = maxY - minY
      const scale = (size - pad * 2) / Math.max(sx, sy)
      const ox = (size - sx * scale) / 2
      const oy = (size - sy * scale) / 2
      const pts = ring
        .map(([x, y]) => `${(ox + (x - minX) * 1.6 * scale).toFixed(1)},${(size - oy - (y - minY) * scale).toFixed(1)}`)
        .join(' ')
      return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-label="Plot outline"><polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${opts.width || 2}" stroke-linejoin="round"/></svg>`
    }
    const c = size / 2
    if (l.location === 'approx') {
      return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-label="Approximate location"><circle cx="${c}" cy="${c}" r="${c - pad}" fill="${fill}" stroke="${stroke}" stroke-width="${opts.width || 2}" stroke-dasharray="5 4"/><circle cx="${c}" cy="${c}" r="2.5" fill="${stroke}"/></svg>`
    }
    const glyph = l.location === 'problem' ? '!' : '?'
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-label="Location not known"><rect x="${pad}" y="${pad}" width="${size - pad * 2}" height="${size - pad * 2}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="2 4" opacity=".6"/><text x="${c}" y="${c + size * 0.13}" text-anchor="middle" font-size="${size * 0.38}" font-weight="700" fill="${stroke}" opacity=".7">${glyph}</text></svg>`
  }

  /* ---------- SVG: landscape placeholder for photos ---------- */
  const scene = (seed, w = 640, h = 480) => {
    if (seed === null) return null
    const skies = [
      ['#dbe9f3', '#f6f3ea'],
      ['#c9d9e8', '#eef0e6'],
      ['#e6eef2', '#f8f1df'],
      ['#cfdde9', '#f3efe4'],
      ['#e2e8ec', '#f0efe7'],
    ]
    const fields = ['#8fae5a', '#a7b86a', '#7f9f52', '#b3b96e', '#98ad5f']
    const trees = ['#2f4d33', '#35553a', '#2a4630', '#3a5a3b', '#2e4a31']
    const [a, b] = skies[seed % skies.length]
    const f = fields[seed % fields.length]
    const t = trees[seed % trees.length]
    const horizon = h * (0.52 + ((seed * 7) % 5) * 0.02)
    let treeline = ''
    for (let x = -20; x < w + 20; x += 34 + ((seed * 13 + x) % 11)) {
      const th = 26 + ((seed * 31 + x) % 30)
      treeline += `<path d="M${x} ${horizon} l17 -${th} l17 ${th}z" fill="${t}"/>`
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#s)"/>${treeline}<rect y="${horizon}" width="${w}" height="${h - horizon}" fill="${f}"/><path d="M0 ${h} Q ${w / 2} ${horizon + 40} ${w} ${h}" fill="${t}" opacity=".08"/></svg>`
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  }

  /* ---------- shared behaviours ---------- */
  const togglePlan = (id) => {
    const i = state.plan.indexOf(id)
    if (i >= 0) state.plan.splice(i, 1)
    else state.plan.push(id)
  }
  const planned = (id) => state.plan.includes(id)

  const bookmarklet = `javascript:(()=>{/* prototype */})()`

  /* ---------- floating prototype switcher ---------- */
  const VARIANTS = [
    ['notebook.html', '1 · Field notebook'],
    ['roadside.html', '2 · Roadside sign'],
    ['ledger.html', '3 · Ledger'],
    ['postcards.html', '4 · Postcards'],
    ['mapdesk.html', '5 · Map desk'],
  ]
  const mountSwitcher = (position = 'bottom') => {
    const file = location.pathname.split('/').pop()
    const idx = VARIANTS.findIndex((v) => v[0] === file)
    if (idx < 0) return
    const prev = VARIANTS[(idx + VARIANTS.length - 1) % VARIANTS.length][0]
    const next = VARIANTS[(idx + 1) % VARIANTS.length][0]
    const bar = document.createElement('div')
    bar.id = 'proto-switcher'
    bar.innerHTML = `
      <a href="${prev}" aria-label="Previous design">&#8249;</a>
      <span>${VARIANTS[idx][1]}</span>
      <a href="${next}" aria-label="Next design">&#8250;</a>
      <a href="index.html" class="all">All designs</a>`
    const style = document.createElement('style')
    style.textContent = `
      #proto-switcher{position:fixed;left:50%;transform:translateX(-50%);${position}:12px;z-index:9999;
        display:flex;align-items:center;gap:6px;padding:6px 8px 6px 6px;border-radius:999px;
        background:#111;color:#fff;font:600 12px/1 ui-sans-serif,system-ui,sans-serif;
        box-shadow:0 6px 24px rgba(0,0,0,.35);letter-spacing:0}
      #proto-switcher a{color:#fff;text-decoration:none;display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#333;font-size:16px}
      #proto-switcher a.all{width:auto;border-radius:999px;padding:0 10px;font-size:11px;background:#444;margin-left:4px}
      #proto-switcher span{padding:0 4px}`
    document.head.appendChild(style)
    document.body.appendChild(bar)
    window.addEventListener('keydown', (e) => {
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowLeft') location.href = prev
      if (e.key === 'ArrowRight') location.href = next
    })
  }

  return {
    state, CHECKS, eur, ares, perAre, dateShort, ago, summary, rating,
    silhouette, scene, togglePlan, planned, bookmarklet, mountSwitcher,
  }
})()
