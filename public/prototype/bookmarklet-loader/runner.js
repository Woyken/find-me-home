/* PROTOTYPE - throwaway. All loading methods + the report runner.
   Loaded by index.html and by the bootstrap bookmarklet.
   Block comments only; explicit semicolons; no template literals:
   this code is flattened into javascript: URLs. */
/* ------------------------------------------------------------------ */
/* Methods. Each f(u, ok, fail, x):                                   */
/*   u    - unique probe.js URL for this attempt                       */
/*   ok   - call when the probe reported in (the runner also wires     */
/*          window.__fmhProbe.hit and window 'message' events to ok)   */
/*   fail - call with an error                                         */
/*   x    - { html, note(s), skip(reason), bin }                       */
/* ------------------------------------------------------------------ */
var METHODS = [
  {
    id: 'script-head',
    label: 'script tag appended to head',
    f: function (u, ok, fail, x) {
      var s = document.createElement('script');
      s.src = u;
      s.onload = function () {
        x.note('onload');
      };
      s.onerror = function () {
        fail('script error event');
      };
      document.head.appendChild(s);
    },
  },
  {
    id: 'script-body',
    label: 'script tag appended to body',
    f: function (u, ok, fail, x) {
      var s = document.createElement('script');
      s.src = u;
      s.onload = function () {
        x.note('onload');
      };
      s.onerror = function () {
        fail('script error event');
      };
      document.body.appendChild(s);
    },
  },
  {
    id: 'script-documentElement',
    label: 'script tag appended to documentElement',
    f: function (u, ok, fail, x) {
      var s = document.createElement('script');
      s.src = u;
      s.onerror = function () {
        fail('script error event');
      };
      document.documentElement.appendChild(s);
    },
  },
  {
    id: 'script-before-first-script',
    label: 'script tag inserted before first existing script',
    f: function (u, ok, fail, x) {
      var s = document.createElement('script');
      s.src = u;
      s.onerror = function () {
        fail('script error event');
      };
      var first = document.getElementsByTagName('script')[0];
      if (!first) return x.skip('page has no script tags');
      first.parentNode.insertBefore(s, first);
    },
  },
  {
    id: 'script-module',
    label: 'script type=module src',
    f: function (u, ok, fail, x) {
      var s = document.createElement('script');
      s.type = 'module';
      s.src = u;
      s.onerror = function () {
        fail('module script error event');
      };
      document.head.appendChild(s);
    },
  },
  {
    id: 'script-crossorigin',
    label: 'script tag with crossorigin=anonymous',
    f: function (u, ok, fail, x) {
      var s = document.createElement('script');
      s.crossOrigin = 'anonymous';
      s.src = u;
      s.onerror = function () {
        fail('script error event');
      };
      document.head.appendChild(s);
    },
  },
  {
    id: 'script-async-false',
    label: 'script tag with async=false',
    f: function (u, ok, fail, x) {
      var s = document.createElement('script');
      s.async = false;
      s.src = u;
      s.onerror = function () {
        fail('script error event');
      };
      document.head.appendChild(s);
    },
  },
  {
    id: 'script-reuse-nonce',
    label: 'script tag reusing an existing CSP nonce',
    f: function (u, ok, fail, x) {
      var n = null;
      var all = document.getElementsByTagName('script');
      for (var i = 0; i < all.length && !n; i++) n = all[i].nonce || null;
      if (!n) return x.skip('no nonce on page');
      x.note('nonce found');
      var s = document.createElement('script');
      s.nonce = n;
      s.src = u;
      s.onerror = function () {
        fail('script error event');
      };
      document.head.appendChild(s);
    },
  },
  {
    id: 'script-innerHTML-container',
    label: 'div.innerHTML with script tag (should NOT run; control)',
    f: function (u, ok, fail, x) {
      var d = document.createElement('div');
      d.innerHTML = '<script src="' + u + '"><\/script>';
      x.bin.appendChild(d);
      x.note('innerHTML scripts never execute; expected timeout');
    },
  },
  {
    id: 'import-dynamic',
    label: 'dynamic import(url)',
    f: function (u, ok, fail, x) {
      import(u).then(
        function () {
          x.note('import resolved');
        },
        function (e) {
          fail(e);
        },
      );
    },
  },
  {
    id: 'fetch-eval',
    label: 'fetch text then indirect eval',
    f: function (u, ok, fail, x) {
      fetch(u)
        .then(function (r) {
          x.note(
            'http ' +
              r.status +
              ' acao=' +
              r.headers.get('access-control-allow-origin'),
          );
          return r.text();
        })
        .then(function (t) {
          (0, eval)(t);
        })
        .catch(fail);
    },
  },
  {
    id: 'fetch-function',
    label: 'fetch text then new Function',
    f: function (u, ok, fail, x) {
      fetch(u)
        .then(function (r) {
          return r.text();
        })
        .then(function (t) {
          new Function(t)();
        })
        .catch(fail);
    },
  },
  {
    id: 'fetch-inline-script',
    label: 'fetch text then inline script textContent',
    f: function (u, ok, fail, x) {
      fetch(u)
        .then(function (r) {
          return r.text();
        })
        .then(function (t) {
          var s = document.createElement('script');
          s.textContent = t;
          document.head.appendChild(s);
        })
        .catch(fail);
    },
  },
  {
    id: 'fetch-blob-script',
    label: 'fetch text then script src=blob:',
    f: function (u, ok, fail, x) {
      fetch(u)
        .then(function (r) {
          return r.text();
        })
        .then(function (t) {
          var s = document.createElement('script');
          s.src = URL.createObjectURL(
            new Blob([t], { type: 'text/javascript' }),
          );
          s.onerror = function () {
            fail('blob script error event');
          };
          document.head.appendChild(s);
        })
        .catch(fail);
    },
  },
  {
    id: 'fetch-data-script',
    label: 'fetch text then script src=data:',
    f: function (u, ok, fail, x) {
      fetch(u)
        .then(function (r) {
          return r.text();
        })
        .then(function (t) {
          var s = document.createElement('script');
          s.src =
            'data:text/javascript;base64,' +
            btoa(unescape(encodeURIComponent(t)));
          s.onerror = function () {
            fail('data script error event');
          };
          document.head.appendChild(s);
        })
        .catch(fail);
    },
  },
  {
    id: 'fetch-blob-module-import',
    label: 'fetch text then import(blob: module)',
    f: function (u, ok, fail, x) {
      fetch(u)
        .then(function (r) {
          return r.text();
        })
        .then(function (t) {
          return import(
            URL.createObjectURL(new Blob([t], { type: 'text/javascript' }))
          );
        })
        .catch(fail);
    },
  },
  {
    id: 'fetch-location-javascript',
    label: 'fetch text then location.href = javascript:',
    f: function (u, ok, fail, x) {
      fetch(u)
        .then(function (r) {
          return r.text();
        })
        .then(function (t) {
          location.href = 'javascript:' + encodeURIComponent(t);
        })
        .catch(fail);
    },
  },
  {
    id: 'xhr-eval',
    label: 'XMLHttpRequest then indirect eval',
    f: function (u, ok, fail, x) {
      var r = new XMLHttpRequest();
      r.open('GET', u);
      r.onload = function () {
        x.note('http ' + r.status);
        (0, eval)(r.responseText);
      };
      r.onerror = function () {
        fail('xhr error');
      };
      r.send();
    },
  },
  {
    id: 'iframe-srcdoc-script',
    label: 'same-origin iframe srcdoc containing script src',
    f: function (u, ok, fail, x) {
      var f = document.createElement('iframe');
      f.style.display = 'none';
      f.srcdoc = '<script src="' + u + '"><\/script>';
      x.bin.appendChild(f);
    },
  },
  {
    id: 'iframe-blank-script',
    label: 'about:blank iframe, script appended into its document',
    f: function (u, ok, fail, x) {
      var f = document.createElement('iframe');
      f.style.display = 'none';
      x.bin.appendChild(f);
      var d = f.contentDocument;
      var s = d.createElement('script');
      s.src = u;
      s.onerror = function () {
        fail('iframe script error event');
      };
      (d.head || d.documentElement).appendChild(s);
    },
  },
  {
    id: 'iframe-probe-html',
    label: 'cross-origin iframe of probe.html + postMessage',
    f: function (u, ok, fail, x) {
      var f = document.createElement('iframe');
      f.style.display = 'none';
      f.src = x.html;
      f.onload = function () {
        x.note('iframe onload');
      };
      x.bin.appendChild(f);
    },
  },
  {
    id: 'embed-probe-html',
    label: 'embed of probe.html + postMessage',
    f: function (u, ok, fail, x) {
      var e = document.createElement('embed');
      e.type = 'text/html';
      e.src = x.html;
      e.style.cssText = 'width:1px;height:1px;opacity:0';
      x.bin.appendChild(e);
    },
  },
  {
    id: 'object-probe-html',
    label: 'object of probe.html + postMessage',
    f: function (u, ok, fail, x) {
      var o = document.createElement('object');
      o.type = 'text/html';
      o.data = x.html;
      o.style.cssText = 'width:1px;height:1px;opacity:0';
      x.bin.appendChild(o);
    },
  },
  {
    id: 'popup-probe-html',
    label: 'window.open(probe.html) + postMessage (popup)',
    f: function (u, ok, fail, x) {
      var w = window.open(x.html, 'fmhProbe', 'width=200,height=100');
      if (!w) return fail('window.open returned null (popup blocked)');
      x.note('popup opened');
    },
  },
  {
    id: 'worker-importScripts',
    label: 'blob Worker + importScripts(url)',
    f: function (u, ok, fail, x) {
      var w = new Worker(
        URL.createObjectURL(
          new Blob(['importScripts(' + JSON.stringify(u) + ')']),
        ),
      );
      w.onmessage = function (e) {
        ok(e.data);
        w.terminate();
      };
      w.onerror = function (e) {
        fail(e.message || 'worker error');
        w.terminate();
      };
    },
  },
  {
    id: 'worker-module-import',
    label: 'blob module Worker + import(url)',
    f: function (u, ok, fail, x) {
      var w = new Worker(
        URL.createObjectURL(
          new Blob([
            'import(' +
              JSON.stringify(u) +
              ').catch(function(e){postMessage({type:"fmh-probe-error",error:String(e)})})',
          ]),
        ),
        { type: 'module' },
      );
      w.onmessage = function (e) {
        if (e.data && e.data.type === 'fmh-probe-error') fail(e.data.error);
        else ok(e.data);
        w.terminate();
      };
      w.onerror = function (e) {
        fail(e.message || 'worker error');
        w.terminate();
      };
    },
  },
];

/* ------------------------------------------------------------------ */
/* Runner: runs every method sequentially on the current page, then    */
/* renders a report panel with copy / download / share.                */
/* ------------------------------------------------------------------ */
function runnerMain(M, BASE, META) {
  var W = window;
  var D = document;
  if (W.__fmhRunnerBusy) {
    alert('Find Me Home probe is already running on this page.');
    return;
  }
  W.__fmhRunnerBusy = true;
  var results = [];
  var violations = [];
  var current = null;
  var pending = null;
  var bin = D.createElement('div');
  bin.style.cssText =
    'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden';
  (D.body || D.documentElement).appendChild(bin);
  var onViolation = function (e) {
    violations.push({
      method: current,
      directive: e.violatedDirective,
      blocked: e.blockedURI,
      disposition: e.disposition,
    });
  };
  var onMessage = function (e) {
    if (e.data && e.data.type === 'fmh-probe' && pending) pending.ok(e.data);
  };
  W.addEventListener('securitypolicyviolation', onViolation);
  W.addEventListener('message', onMessage);
  W.__fmhProbe = {
    hit: function (info) {
      if (pending) pending.ok(info);
    },
  };
  var meta = D.querySelector('meta[http-equiv="Content-Security-Policy"]');
  var env = {
    when: new Date().toISOString(),
    pageUrl: location.href,
    userAgent: navigator.userAgent,
    probeBase: BASE,
    bookmarkletLength: META.len,
    bookmarkletEncoding: META.enc,
    cspMeta: meta ? meta.content : null,
    cspHeader: 'not checked',
    cspReportOnlyHeader: null,
    trustedTypesAvailable: !!W.trustedTypes,
    secureContext: W.isSecureContext,
    topFrame: W === W.top,
  };
  var headerCheck = fetch(location.href, {
    method: 'HEAD',
    credentials: 'same-origin',
  })
    .then(function (r) {
      env.cspHeader = r.headers.get('content-security-policy');
      env.cspReportOnlyHeader = r.headers.get(
        'content-security-policy-report-only',
      );
    })
    .catch(function (e) {
      env.cspHeader = 'HEAD request failed: ' + e;
    });
  var TIMEOUT = 8000;
  var status = D.createElement('div');
  status.style.cssText =
    'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;background:#1b2733;color:#fff;font:14px/1.4 system-ui,sans-serif;padding:12px 14px;border-radius:10px';
  (D.body || D.documentElement).appendChild(status);
  var runOne = function (m, index) {
    return new Promise(function (resolve) {
      current = m.id;
      status.textContent =
        'Find Me Home probe: ' +
        (index + 1) +
        '/' +
        M.length +
        ' ' +
        m.id +
        '...';
      var started = Date.now();
      var done = false;
      var notes = [];
      var u = BASE + 'probe.js?via=' + m.id + '&t=' + started;
      var x = {
        html: BASE + 'probe.html?via=' + m.id + '&t=' + started,
        bin: bin,
        note: function (s) {
          notes.push(s);
        },
        skip: function (reason) {
          finish('skipped', reason);
        },
      };
      var timer = null;
      var finish = function (st, error, info) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        var errText = error
          ? String((error && error.message) || error)
          : undefined;
        results.push({
          id: m.id,
          label: m.label,
          status: st,
          ms: Date.now() - started,
          error: errText,
          notes: notes,
          probeContext: info && info.context,
          via: info && info.via,
        });
        pending = null;
        resolve();
      };
      timer = setTimeout(function () {
        finish('timeout');
      }, TIMEOUT);
      pending = {
        ok: function (info) {
          finish('ok', null, info);
        },
      };
      try {
        m.f(
          u,
          pending.ok,
          function (e) {
            finish('fail', e || 'error');
          },
          x,
        );
      } catch (e) {
        finish('throw', e);
      }
    });
  };
  var cleanup = function () {
    W.removeEventListener('securitypolicyviolation', onViolation);
    W.removeEventListener('message', onMessage);
    try {
      delete W.__fmhProbe;
    } catch (_) {}
    status.remove();
    bin.remove();
    W.__fmhRunnerBusy = false;
  };
  var buildMarkdown = function () {
    var lines = ['# Find Me Home bookmarklet loader report', ''];
    Object.keys(env).forEach(function (k) {
      lines.push('- ' + k + ': ' + (env[k] === null ? 'null' : String(env[k])));
    });
    lines.push(
      '',
      '| # | method | status | ms | notes / error |',
      '|---|---|---|---|---|',
    );
    results.forEach(function (r, i) {
      var extra = [];
      if (r.error) extra.push('ERROR: ' + r.error);
      if (r.notes.length) extra.push(r.notes.join('; '));
      if (r.probeContext) extra.push('ctx=' + r.probeContext);
      lines.push(
        '| ' +
          (i + 1) +
          ' | ' +
          r.id +
          ' | ' +
          r.status +
          ' | ' +
          r.ms +
          ' | ' +
          extra.join(' / ').replace(/\|/g, '\\|') +
          ' |',
      );
    });
    lines.push('', '## CSP violations (' + violations.length + ')');
    violations.forEach(function (v) {
      lines.push(
        '- ' + v.method + ': ' + v.directive + ' blocked ' + v.blocked,
      );
    });
    lines.push('', '## JSON', '', '```json');
    lines.push(
      JSON.stringify(
        { env: env, results: results, violations: violations },
        null,
        2,
      ),
    );
    lines.push('```', '');
    return lines.join('\n');
  };
  var render = function () {
    var md = buildMarkdown();
    var panel = D.createElement('div');
    panel.style.cssText =
      'position:fixed;inset:8px;z-index:2147483647;background:#fff;color:#1b2733;font:14px/1.4 system-ui,sans-serif;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.4);display:flex;flex-direction:column;overflow:hidden';
    var bar = D.createElement('div');
    bar.style.cssText =
      'display:flex;gap:8px;flex-wrap:wrap;padding:10px;border-bottom:1px solid #ddd;background:#f3f5f2';
    var mk = function (label, onClick) {
      var b = D.createElement('button');
      b.textContent = label;
      b.style.cssText =
        'padding:8px 12px;border-radius:8px;border:1px solid #999;background:#fff;font:inherit';
      b.onclick = onClick;
      bar.appendChild(b);
      return b;
    };
    var ta = D.createElement('textarea');
    ta.value = md;
    ta.readOnly = true;
    ta.style.cssText =
      'flex:1;width:100%;box-sizing:border-box;border:0;padding:10px;font:12px/1.4 ui-monospace,monospace;resize:none';
    var okCount = results.filter(function (r) {
      return r.status === 'ok';
    }).length;
    var title = D.createElement('div');
    title.style.cssText = 'padding:10px;font-weight:600';
    title.textContent =
      'Find Me Home loader probe: ' +
      okCount +
      '/' +
      results.length +
      ' methods worked';
    var copyBtn = mk('Copy report', function () {
      var doneCopy = function () {
        copyBtn.textContent = 'Copied!';
      };
      var fallback = function () {
        ta.focus();
        ta.select();
        try {
          D.execCommand('copy');
          doneCopy();
        } catch (_) {
          copyBtn.textContent = 'Copy failed - select text manually';
        }
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(md).then(doneCopy, fallback);
      } else fallback();
    });
    mk('Download .md', function () {
      var a = D.createElement('a');
      a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
      a.download = 'fmh-loader-report-' + Date.now() + '.md';
      D.body.appendChild(a);
      a.click();
      a.remove();
    });
    if (navigator.share) {
      mk('Share', function () {
        navigator
          .share({ title: 'FMH loader report', text: md })
          .catch(function () {});
      });
    }
    mk('Close', function () {
      panel.remove();
    });
    panel.appendChild(title);
    panel.appendChild(bar);
    panel.appendChild(ta);
    (D.body || D.documentElement).appendChild(panel);
  };
  M.reduce(function (p, m, i) {
    return p.then(function () {
      return runOne(m, i);
    });
  }, Promise.resolve())
    .then(function () {
      return headerCheck;
    })
    .then(function () {
      cleanup();
      render();
    });
}

window.__fmhRunner = {
  METHODS: METHODS,
  runnerMain: runnerMain,
  run: function (base, meta) {
    runnerMain(METHODS, base, meta);
  },
};
