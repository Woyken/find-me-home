/**
 * The bookmarklet users save is a tiny loader: it injects a script tag for the
 * scraper that Pages serves as `aruodas-bookmarklet.js`. Keeping the saved URL
 * short avoids browsers truncating it when pasted as a bookmark, and lets the
 * scraper update without users re-saving the bookmark.
 *
 * Verified on aruodas.lt (no CSP): script tag, fetch+eval and import() all work.
 * A fetch+eval fallback covers a failed script element.
 */
export const aruodasBookmarkletScriptName = 'aruodas-bookmarklet.js'

export const createAruodasBookmarklet = (appUrl: string) => {
  const url = new URL(appUrl)
  const e2e = url.searchParams.get('e2e')
  url.hash = ''
  // Preserve the browser-local E2E selector across the source-page round trip.
  url.search = e2e && /^[A-Za-z0-9_-]{1,80}$/.test(e2e) ? `?e2e=${e2e}` : ''
  const base = JSON.stringify(url.toString())
  const code = [
    '(function(){',
    `var a=${base};`,
    'window.__fmhAppUrl=a;',
    'var s=document.createElement("script");',
    `s.src=new URL("${aruodasBookmarkletScriptName}?t="+Date.now(),a).href;`,
    's.onerror=function(){',
    'fetch(s.src).then(function(r){return r.text()}).then(function(t){(0,eval)(t)})',
    '.catch(function(e){alert("Find Me Home: could not load the import script ("+e+"). Check your connection and try again.")})',
    '};',
    'document.head.appendChild(s)',
    '})()',
  ].join('')
  return `javascript:${code}`
}
