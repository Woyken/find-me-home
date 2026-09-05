/* PROTOTYPE - throwaway. Hosted script loaded by the bookmarklet-loader probe.
   Works as a classic script, a module, an eval'd string, and inside a worker.
   Only block comments here: a javascript: URL strips newlines. */
(function () {
  var info = {
    probeVersion: 1,
    loadedAt: Date.now(),
    context:
      typeof window === 'undefined'
        ? 'worker'
        : window === window.top
          ? 'top'
          : 'frame',
  };
  if (typeof window === 'undefined') {
    self.postMessage({ type: 'fmh-probe', via: 'worker', info: info });
    return;
  }
  info.currentScript =
    typeof document !== 'undefined' && document.currentScript
      ? document.currentScript.src
      : null;
  var hook = null;
  try {
    hook = window.__fmhProbe;
  } catch (_) {
    hook = null;
  }
  if (!hook) {
    try {
      hook = window.parent && window.parent.__fmhProbe;
    } catch (_) {
      hook = null;
    }
  }
  if (hook && typeof hook.hit === 'function') {
    hook.hit(info);
    return;
  }
  /* Standalone use (one of the minimal per-method bookmarklets): show a toast. */
  var via = window.__fmhVia || 'unknown method';
  var el = document.createElement('div');
  el.textContent =
    'Find Me Home probe loaded via ' +
    via +
    (info.currentScript ? ' (' + info.currentScript + ')' : '');
  el.setAttribute(
    'style',
    'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;background:#0b6b3a;color:#fff;font:14px/1.4 system-ui,sans-serif;padding:12px 14px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.35);word-break:break-all',
  );
  (document.body || document.documentElement).appendChild(el);
  setTimeout(function () {
    el.remove();
  }, 8000);
})();
