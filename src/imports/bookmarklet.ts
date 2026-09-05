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
  url.hash = ''
  url.search = ''
  const base = JSON.stringify(url.toString())
  const code = [
    '(function(){',
    `var a=${base};`,
    'window.__fmhAppUrl=a;',
    'var s=document.createElement("script");',
    `s.src=a+"${aruodasBookmarkletScriptName}?t="+Date.now();`,
    's.onerror=function(){',
    'fetch(s.src).then(function(r){return r.text()}).then(function(t){(0,eval)(t)})',
    '.catch(function(e){alert("Find Me Home: could not load the import script ("+e+"). Check your connection and try again.")})',
    '};',
    'document.head.appendChild(s)',
    '})()',
  ].join('')
  return `javascript:${code}`
}
