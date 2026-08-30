# Research: one-action listing capture for Aruodas and Domoplius

- **Issue**: [Choose reliable one-action listing capture](https://github.com/Woyken/find-me-home/issues/3)
- **Date**: 2026-08-30
- **Status**: Decision-ready research; no application implementation.

## Question

> Which technically viable mechanism best satisfies one-action partial import from
> Aruodas and Domoplius: server-side URL extraction, bookmarklet, userscript/browser
> extension, browser share action, pasted page snapshot, or a combination?

**Acceptance boundary** (from the issue/task): from an open listing, one action brings
ordinary advertisement details into the wizard; the user may correct values, split
Candidate Plots, and supply missing parcel clues, but must not retype the whole
advertisement. Both Aruodas and Domoplius are required.

## TL;DR recommendation

**Use an in-page bookmarklet for both sites: it reads the DOM the user is already
looking at and submits a normalized, untrusted draft to the wizard.** This extends the
pattern the codebase already ships for Aruodas, but should not reuse its long-lived
embedded import key or immediate durable upsert: code running in the marketplace page's
main JavaScript world cannot keep a bearer secret from that page, and capture should
only populate a reviewable draft. Layer a
second, independent mechanism underneath it only where the site's own defenses make it
safe: Domoplius tolerates plain server-side fetches today, so a **paste-URL / "Import by
link" fallback that fetches server-side** is technically viable for Domoplius only,
subject to an explicit policy decision because Domoplius's terms prohibit automated
collection.
Aruodas cannot use that fallback — its listing pages are gated by a PerimeterX
"Press & Hold" interactive challenge that a bare server fetch cannot pass (evidence
below) — so Aruodas's only safety net below the bookmarklet is **manual paste of
copied text/photo URLs into the wizard**. A userscript (Tampermonkey) is a viable
*optional* power-user distribution of the same DOM-reading code, not a different
mechanism. A browser extension is over-engineering for this: it buys packaging/update
convenience at a large maintenance and review-process cost, for a capability
(reading the open tab's DOM) the existing bookmarklet already has. The Web Share
Target API only ever delivers a URL/title/text triad — never price, photos, or seller
data — so it is not a capture mechanism on its own; it's at best a "hand the URL to the
app" nicety that still needs one of the above to do the actual extraction.

Fallback ladder, in order of preference, identical for both sites at the top:

1. **Bookmarklet** run from the open listing → parses the live, already-rendered DOM →
   `POST`s a validated JSON payload to an unprivileged draft endpoint (evolving the
   pattern in `src/routes/api/aruodas-import.ts` and
   `src/server/aruodas-import.ts`).
2. **Domoplius only** — "Import by link": paste the listing URL into the wizard, server
   fetches and parses it (this is what `src/server/scrapers/domoplius.ts` already does in
   bulk-scan mode). This rung is technically viable but requires an explicit policy
   decision because Domoplius's terms prohibit automated collection.
3. **Manual paste-and-correct**: user pastes copied title/description/price text and
   photo URLs into a snapshot box whose parser pre-fills whatever it recognizes; this
   always works and is the floor every other rung degrades to when markup changes break
   parsing.
4. **Userscript** distribution of the bookmarklet's own script body, for power users
   who prefer a browser menu command or keyboard shortcut — same extraction code,
   different packaging. Do not auto-import on page load.

## Why: what actually differs between the two sites

### robots.txt (fetched directly, 2026-08-30)

**`https://aruodas.lt/robots.txt`** declares a blanket block for any user agent not
explicitly named:

```
User-Agent: *
Disallow: /
```

Named bots (Googlebot, Bingbot, msnbot, etc.) get narrower `Disallow` lists limited to
`/dalintis-skelbimu/`, `/blogas-skelbimas/`, `/sklypai-mieste/`, `/sklypai-kaime/`,
`/u/`, `/m/` — i.e. even the bots aruodas.lt chooses to name are only allowed on parts of
the site, and everyone else is disallowed everywhere. Several crawlers (`LCC`,
`SeekportBot`, `MegaIndex.ru/2.0`, `SputnikBot`, `Yandexbot`) are blocked outright.
Source: <https://aruodas.lt/robots.txt>.

**`https://domoplius.lt/robots.txt`** takes the opposite stance: `User-agent: *` has no
blanket `Disallow`, only parameter/duplicate-content and account/auth paths are blocked
(`/prisijungti`, `/paskyra/`, `/api/`, `/listing/`, etc.), and it explicitly names
`Sitemap: https://domoplius.lt/sitemap-listings.xml`. It even carries an explicit
allow-list for AI/LLM crawlers (`GPTBot`, `ClaudeBot`, `PerplexityBot`, `CCBot`, …).
Source: <https://domoplius.lt/robots.txt>.

This asymmetry already explains why the repo's own scraper roster
(`src/server/scan.ts`, phase 1-2 commit) includes a full background scraper for
`domoplius` (`src/server/scrapers/domoplius.ts`, fetches
`https://domoplius.lt/sitemap-listings.xml` then each listing page) but **no** background
scraper for `aruodas` at all — only the bookmarklet-based single-listing importer in
`src/server/aruodas-import.ts` / `src/routes/api/aruodas-import.ts`.

### Live probes (responsible: GET requests only, no auth bypass, no CAPTCHA solving attempted)

All probes below were run directly from this research session on 2026-08-30 against
public listing pages, using either this tool's own `web_fetch`/`web_search` or a single
`curl`/`Invoke-WebRequest` GET with a standard desktop Chrome User-Agent string. No
credentials, proxies, or automation frameworks were used, and no CAPTCHA was attempted.

**Aruodas — sitemap.xml, with a browser User-Agent:**

```
HTTP/1.1 403 Forbidden
Server: cloudflare
<title>Attention Required! | Cloudflare</title>
<h1>Sorry, you have been blocked</h1>
<h2>You are unable to access aruodas.lt</h2>
```

**Aruodas — a real listing detail page** (URL discovered from the site's own `/sklypai/`
search-results HTML, which *did* load), fetched the same way:

```
Access to this page has been denied
window._pxAppId = 'PXqLRSnBjb';
... "Before we continue... Press & Hold to confirm you are human (and not a bot)."
```

The `_pxAppId`, `pxCaptchaSrc`, and "Press & Hold" strings are PerimeterX/HUMAN Security
markers — this repo's own `web_fetch` tool independently hit the same 403 on the identical
URL (`https://www.aruodas.lt/sklypai-trakuose-lentvario-k-sellolt-nt-ekspertai-be-procentu-sveiki-11-1474919/`).
The earlier 403 on `/sitemap.xml` also set a `_pxhd` cookie even on a request that
otherwise looked like a normal browser GET. By contrast, the **search-results** page
`https://www.aruodas.lt/sklypai/` returned `200 OK` for the same client. So aruodas.lt's
defenses gate the *listing detail* page (and sitemap) specifically — exactly the page a
one-action capture needs to read — behind an interactive challenge that a plain HTTP
client cannot pass. This is a direct repro, not a secondhand claim.

**Domoplius — a real listing detail page**, fetched the same way
(`https://domoplius.lt/skelbimai/parduodamas-sklypas-vilniuje-traku-voke-8783797.html`,
URL discovered from the site's own `sitemap-listings.xml`, which is itself allowed by
Domoplius's robots.txt):

```
HTTP/1.1 200 OK
Server: cloudflare
```

No PerimeterX cookies, no CAPTCHA, no `Attention Required` page. The page is a
server-rendered Inertia.js app: the HTML contains a `data-page="…"` attribute holding the
full page props as JSON — the same shape `src/server/scrapers/domoplius.ts` already
parses (`/data-page="([^"]+)"/`). Fetching and decoding it in this session surfaced these
top-level `props.property` keys: `id, type, title, description, metaDescription, slug,
price, location, images, video, details, contact, stats, isLiked, status, isActive,
raiseUnits, isMine, developerProjectId, isReserved, isSeen`. Notably `contact` — **not**
currently mapped by `domoplius.ts`'s `DomoProperty` interface — carries full seller
data in the public, unauthenticated payload:

```json
{
  "name": "Vlasta Maslinskienė",
  "phone": "37063386858",
  "email": "vlasta.maslinskiene@capital.lt",
  "entity": "broker",
  "agency_name": "Capital Experts",
  "agency_website": "www.capital.lt",
  "display_name": "Vlasta Maslinskienė",
  "display_phone": "37063386858"
}
```

`props.auth` was empty (no session/login used), confirming this is served to anonymous
visitors. **Practical implication**: on Domoplius, "seller" extraction is free and
complete either from the DOM or from a server-side fetch; the current scraper simply
doesn't map it into `ScrapedListing` yet — a schema gap independent of which capture
mechanism is chosen.

**Aruodas seller/phone**: the phone shown on an Aruodas listing is a masked, per-listing
virtual number that Aruodas forwards to the real advertiser (confirmed by Aruodas's own
support page, cited via web search: <https://www.aruodas.lt/telefono-numerio-apsauga/>
— "Aruodas.lt automatiškai priskiria kiekvienam skelbimui virtualų (tarpinį) Aruodas.lt
numerį... skambutis yra peradresuojamas į tikrąjį skelbimo autoriaus numerį"). Because
this is what an ordinary buyer sees and would use anyway, capturing that visible number
verbatim (which is all a DOM read/bookmarklet can do) is both sufficient and
privacy-appropriate — there is no "real" seller number to additionally protect.

### CSP / response headers (fetched directly)

Neither `www.aruodas.lt` nor `domoplius.lt` currently send a `Content-Security-Policy`
response header on the pages probed above (only `x-frame-options: SAMEORIGIN`,
`strict-transport-security`, and Cloudflare/PerimeterX cookies were present). This means
today, on both sites, an in-page bookmarklet's own inline script execution, DOM reads,
and outbound `<form>` submission to this app's own origin are **not** blocked by any
page-declared policy. This is a currently-true fact, not a guarantee — see "Fragility"
below for what happens if either site adds a CSP later.

Independent of the current absence of CSP, it's worth recording the general web platform
behavior for when a site *does* ship a CSP, because it explains why the existing
bookmarklet uses a real `<form>` submission instead of `fetch()`:

- A CSP's `connect-src` directive governs script-driven requests (`fetch`, `XHR`,
  `WebSocket`) — MDN:
  <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src>.
- A CSP's `form-action` directive separately governs where `<form>` elements may submit —
  MDN: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/form-action>.
  These are independent allow-lists; being allowed in one does not imply the other.
- The W3C CSP Level 3 non-normative guidance states policy enforcement "should not
  interfere with the operation of user-agent features like add-ons, extensions, or
  bookmarklets" (spec: <https://www.w3.org/TR/CSP3/>). Because that guidance is
  non-normative, support must still be verified in the household's target browsers.

Because `src/server/aruodas-import.ts`'s `createAruodasBookmarklet()` builds a hidden
`<form method="POST">` and calls `.submit()` (a full navigation) rather than `fetch()`,
it is governed by `form-action` (currently unset → effectively unrestricted) rather than
`connect-src`, and is the more CSP-resilient choice of the two if either site adds a
restrictive policy later.

### Terms of Service (fetched directly)

Both sites' terms explicitly prohibit automated collection, independent of what their
technical defenses currently allow:

- **Aruodas** — `https://www.aruodas.lt/dalyvio-taisykles/`, clause 8.2.3: "nenaudoti
  automatizuotų priemonių, įskaitant interneto robotais (bots), duomenų nuskaitymo
  (scraping), indeksavimo ar bet kokio kito tipo kompiuterinėmis programomis, skirtomis
  kopijuoti, apdoroti, analizuoti, saugoti ar perkelti Svetainių turinį" — i.e. no
  automated tools, bots, scraping, or indexing software to copy/process/analyze/store/
  transfer the site's content. Clause 6.8 separately reserves Aruodas's own right to use
  site data for AI/text-and-data-mining while forbidding the same to users without
  written consent.
- **Domoplius** — `https://domoplius.lt/informacija/taisykles`, clause 2.3: "Draudžiama
  naudoti automatizuotas sistemas (robotus, programas) Svetainės turinio rinkimui,
  dekompiliuoti, išardyti ar kitais būdais bandyti gauti Svetainės programinio kodo ar
  struktūros informaciją…" — prohibits automated systems/robots/programs for collecting
  site content, and reverse-engineering.

Neither clause is limited to bulk/commercial use; both are broad prohibitions on
"automated" collection tooling. **This is a genuine gray area for any mechanism that
runs code against these pages, including a bookmarklet**, and this document does not
resolve it — it is a policy/legal judgment call for the project owner, not a technical
one. What the research *can* establish is a meaningful, defensible distinction to weigh:
a bookmarklet is triggered manually, once per listing, by the same human who is already
voluntarily viewing that exact page in their own authenticated browser session — it reads
only what is already rendered for that person, and produces no incremental request to
either site (no navigation, no fetch to aruodas.lt/domoplius.lt at all — only a POST to
this app's own origin). That is categorically closer to "the user copy-pastes what they
see" than to a "robot/bot/scraper/indexer" that autonomously crawls many pages
unattended — which is squarely what both clauses name. A background scraper that walks a
sitemap and fetches many pages unattended (as `src/server/scrapers/domoplius.ts` already
does) sits much closer to the prohibited conduct as literally written, and its existing
presence in the codebase should itself be treated as a known compliance question for the
project owner, separate from this one-action-capture question.

## Mechanism-by-mechanism comparison

| Mechanism | URL/title/desc/price/area | Photos | Seller | Location | Bot protection exposure | Auth | CORS/CSP | Security | Maintenance / markup drift | Aruodas viable? | Domoplius viable? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Bookmarklet** (existing pattern) | Full — reads live rendered DOM the user is looking at | Yes, via `<img>`/`<a href>` selectors already visible | Yes (masked number on Aruodas; public contact data on Domoplius) | Yes, via map-link `origin=lat,lng` (Aruodas) or Inertia `location.coordinates` (Domoplius) | **None** — runs after the human's browser has already passed any challenge; no separate request to the target site | Reuses the user's marketplace session; app-side durable save must happen after the import navigation | Cross-origin form submit is governed by `form-action` (currently unset on both sites); `fetch` would also face CORS and `connect-src` | Main-world code and embedded values are visible to the marketplace page. Never embed a durable app credential; treat all fields as hostile input and show a confirmation step | Low-medium, but selectors drift silently. Add required-field/coverage checks and fail visibly into manual paste | **Yes — already shipped, with security changes advised** | **Yes** |
| **Server-side URL extraction** (paste URL, server fetches) | Full, if the fetch succeeds | Yes | Yes (Domoplius `contact` object confirmed public) | Yes (Domoplius `location.coordinates` confirmed public) | **Blocking on Aruodas** — PerimeterX "Press & Hold" gates listing pages; **works technically on Domoplius today** | None needed for public Domoplius pages; bypassing Aruodas's challenge is out of scope | N/A (server-to-server; CORS does not apply) | Strong SSRF controls: allow-list exact hosts and URL shapes, reject redirects off-host/private IPs, cap response size/time, and never execute page scripts | Low for Domoplius by reusing its parser, but Inertia shape changes can break it; policy burden is higher because the site's terms prohibit automation | **No** | **Yes technically; policy approval required** |
| **Userscript** (Tampermonkey/Greasemonkey) | Same as bookmarklet | Same | Same | Same | Same (runs in-browser, post-challenge) | Same | Manager-specific sandbox and request APIs reduce some page-CSP friction | A sandbox can isolate script variables better than a bookmarklet, but installation grants powerful host access and depends on the manager's permission model | Medium: manager dependency plus the same selector drift. Use an explicit menu command/shortcut, not auto-run | Yes, optional packaging | Yes, optional packaging |
| **Browser extension** | Same ceiling as bookmarklet, plus a toolbar button and isolated content-script world | Same | Same | Same | Content scripts can read the shared DOM while running in an **isolated world**, per Chrome's docs: <https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts> | Same | Extension CSP is separate from page CSP | Best isolation from page scripts, but requests broad host permissions and introduces a signed update/store supply chain | High: store review, permissions justification, release channel, and cross-browser manifests; selector drift remains | Technically yes, but disproportionate for a private household tool | Technically yes, same caveat |
| **Browser share action** (Web Share Target API, receiving side) | **URL/title/text only** — never price/photos/seller as structured fields; spec: <https://w3c.github.io/web-share-target/> and manifest reference: <https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target> | No | No | No | None by itself; extraction after handoff still hits the source-specific constraints | Needs this app installed as a PWA | N/A | Small attack surface if shared input is treated as untrusted; still requires URL allow-listing | Low, but delivers little alone | **No, alone** | Partial URL-handoff convenience |
| **Pasted page snapshot** (user copies visible text/links, pastes into a wizard textarea the app parses) | Variable; parser can pre-fill price/area/purpose/cadastral clues from copied text | Only if copied HTML contains image links or the user separately supplies them | Only if visible and pasted | Rarely (map coordinates are not normally copied) | None | None | N/A | Safest source interaction; pasted HTML must be sanitized and never executed | Low and degrades gracefully rather than fully breaking | **Yes — universal fallback** | **Yes — universal fallback** |

## Recommended architecture

Given the constraint "both Aruodas and Domoplius required" and the acceptance boundary
("one action... must not retype the whole advertisement"), the shape that satisfies both
sites with one mental model for the user is:

1. **One bookmarklet-launcher UI, two site-specific bookmarklet bodies.** Extend the
   existing `createAruodasBookmarklet()` pattern in `src/server/aruodas-import.ts` with a
   sibling `createDomopliusBookmarklet()` that reads Domoplius's own `data-page` JSON
   directly from the DOM (`document.querySelector('[data-page]')`) instead of scraping
   visible text — Domoplius's structured payload is materially higher-fidelity than
   Aruodas's (it's the same JSON the server-side scraper already parses), so the
   Domoplius bookmarklet can be simpler and less brittle than the Aruodas one. Both
   `POST` to a shared capture endpoint, reusing the existing
   `parseAruodasImport`-style validation (allow-list host/path, canonical URL + stable
   `sourceId`, bounded string/array lengths, HTTPS-only photo URLs). The endpoint should
   render an ephemeral, reviewable wizard draft rather than immediately mutate durable
   listings. **Do not embed the current long-lived `import_secrets` bearer key in the
   bookmarklet**: the HTML Standard evaluates a `javascript:` URL using the active
   document's settings object
   (<https://html.spec.whatwg.org/multipage/browsing-the-web.html#the-javascript:-url-special-case>),
   unlike an extension's isolated world, so page scripts can observe shared DOM effects
   or monkey-patch submission APIs. An intentionally
   unprivileged capture endpoint needs payload limits, rate limiting, short draft TTL,
   `Cache-Control: no-store`, and a confirmation/authentication step before saving.
2. **Domoplius-only "Import by link" fallback**, exposed as a small text input in the
   wizard: paste the URL, a server function reuses `scrapeListingPage()` from
   `src/server/scrapers/domoplius.ts` to fetch and parse it without requiring the
   bookmarklet. Gate this rung on the owner's explicit policy acceptance because
   Domoplius's terms prohibit automated collection. Apply SSRF protections: exact
   hostname/path allow-list, redirect validation, DNS/IP checks, response byte/time
   limits, and no script execution. This does **not** get offered for Aruodas
   URLs — attempting it would just reproduce the PerimeterX 403/CAPTCHA observed above,
   and offering a fallback that reliably fails is worse UX than not offering it.
3. **Universal manual-paste fallback**, always available regardless of source: a
   "paste description text" box plus individual photo-URL inputs, parsed with the same
   regex helpers already in `src/server/scrapers/common.ts`
   (`parseAreaAres`, `extractCadastralNumber`). This is what a user reaches when the
   bookmarklet breaks (site redesign) and — for Aruodas — when they'd rather not
   reinstall/re-copy a bookmarklet at all.
4. **Optional userscript packaging** of the same extractor for power users who prefer
   an explicit userscript menu command or keyboard shortcut. Do not auto-import on page
   load: that would create accidental captures and violate the intended user-controlled
   one-action boundary. Generate both packages from one extraction implementation.
5. **Do not build a browser extension** for this. It adds a store-review release
   channel, per-browser manifest maintenance, and a stricter extension-side CSP, for a
   capability (reading the open tab's DOM and POSTing to this app) the bookmarklet
   already provides with a one-line edit-and-recopy update path.
6. **Treat the Web Share Target API as a nice-to-have URL-intake shortcut only**, layered
   in front of step 2 for Domoplius (share the link from the phone's browser instead of
   copy-pasting it) — never as a data-extraction mechanism, since the spec only transmits
   `title`/`text`/`url`.
7. **Make parser degradation visible.** Return per-field extraction provenance and a
   coverage result; if URL plus at least title and one of price/area/description are not
   present, open the same wizard with a clear "site layout changed" warning and the
   pasted-snapshot fallback focused. Never silently create a nearly empty listing.

## Coverage summary against the acceptance boundary

- **"one action brings ordinary advertisement details into the wizard"** — met by the
  bookmarklet for both sites (title, description, price, area, purpose, cadastral
  number where present, photos, coordinates, seller contact).
- **"user may correct values"** — already the model: both bookmarklet payloads land in
  the same `ScrapedListing`-shaped record the manual-edit UI already edits per
  `dedd9eb`'s "manual listing edit with overrides" commit.
- **"split Candidate Plots, supply missing parcel clues"** — orthogonal to capture
  mechanism; not addressed by this research, since it's a wizard/domain-model concern
  once a `ScrapedListing` exists, not an extraction concern.
- **"must not retype the whole advertisement"** — satisfied for the common case
  (bookmarklet) on both sites; the manual-paste floor never asks for a full retype, only
  copy-paste of specific fields, which is the same UX contract as today's manual-edit
  panel.

## Fragility / maintenance risks, ranked

1. **DOM/markup drift** (both sites, bookmarklet and userscript): the Aruodas
   bookmarklet already hard-codes brittle heuristics (`definition()` label lookups,
   regex over `<li>` text, `a[href*="aruodas-img"]` selectors) — a redesign silently
   degrades field coverage rather than failing loudly. Mitigate by keeping the
   manual-paste floor always visible/reachable, and by asserting in CI (already present:
   `aruodas-import.test.ts`) against a fixture snapshot of the parser's *input* shape —
   note this only tests the payload parser, not the in-page DOM-scraping half, which has
   no test coverage today and cannot easily get any without a fixture of the live page.
2. **Aruodas PerimeterX changes**: if Aruodas's challenge logic changes to also gate the
   `/sklypai/` search page or tightens further, the bookmarklet keeps working (it never
   makes a request to aruodas.lt), but any future temptation to add server-side
   fallback for Aruodas should be re-probed first, not assumed.
3. **CSP addition by either site**: currently a non-issue (no CSP header observed on
   either domain today), but if either site ships a `connect-src`/`form-action` policy
   later, re-verify the bookmarklet's `<form>`-submit approach still passes `form-action`
   for this app's own origin — it isn't automatically covered by an origin's `'self'`
   default since the POST target is a different origin (this app), so the destination
   would need to be added by the *listing site*, which they'd have no reason to do. In
   the worst case, the safety net (manual paste) still works because it makes no network
   requests to either site.
4. **Credential exposure in the current bookmarklet design**: the generated JavaScript
   contains the persistent `import_secrets` value and runs in the listing page's main
   world. The endpoint also immediately upserts and starts evaluations. A marketplace
   page can potentially observe the key or tamper with patched DOM/submission methods,
   and a leaked key authorizes forged imports. Replace this with the unprivileged,
   ephemeral draft handoff described above; an extension/userscript isolated world is
   the heavier alternative if a secret-bearing protocol ever becomes necessary.
5. **ToS enforcement**: both sites' terms name automated tools broadly (see above); a
   noticeable spike in bookmarklet traffic from a small set of accounts, or the existing
   background Domoplius scraper, could draw attention independent of how "automated"
   a single bookmarklet click is judged to be. This is a standing policy decision for the
   project owner, not something this document resolves.
6. **Seller field not yet in the schema**: `ScrapedListing` (`src/server/scrapers/common.ts`)
   has no `seller`/`contact` field at all; Domoplius's `contact` object is fetched into
   `raw.property` today but dropped before mapping. Any bookmarklet or server-fetch path
   that wants to surface seller info to the wizard needs this schema extension
   regardless of which capture mechanism is chosen.

## Gaps and things not verified

- Did not attempt to solve or bypass the Aruodas PerimeterX "Press & Hold" challenge —
  by design (probing responsibly), so it's confirmed *that* it blocks a plain HTTP
  client, not precisely *how* far a real, fully-scripted browser session would have to
  go before being trusted (e.g., whether a single cold session always gets challenged, or
  only after a threshold of proxy/IP reputation signals). This doesn't change the
  recommendation, since the bookmarklet sidesteps the question entirely.
- Did not fetch or inspect Domoplius's `/api/` endpoints (disallowed by their robots.txt
  and out of scope) to check for an unofficial JSON API beyond the server-rendered
  `data-page` payload already used.
- Did not find or confirm an official partner/data API for either site; a web search
  paraphrase suggested contacting Aruodas's administration for official data access, but
  no such page was directly fetched/verified — treat "ask for an API" as an unconfirmed
  suggestion, not a documented option.
- Did not verify whether Aruodas's or Domoplius's own "Dalintis" (Share) buttons call
  `navigator.share()` under the hood (their JS bundles are Vue/Inertia SPA code not
  easily statically inspected without executing it); this doesn't affect the
  recommendation since the OS-level "share current tab" affordance in mobile browsers
  works independent of the site's own share button, and either way only ever carries a
  URL/title/text per the Web Share Target spec cited above.
- Full MDN pages for `Content-Security-Policy` overview and `Web Share API` render via
  client-side JS and returned only page titles/meta descriptions to this session's
  fetch tool; the specific claims attributed to MDN above were confirmed either via the
  page's static `<meta name="description">` (share_target) or via the static W3C spec
  mirror (`w3c.github.io/web-share-target`, `w3c.github.io/webappsec-csp`) instead.
