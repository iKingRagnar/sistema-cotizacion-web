/* ════════════════════════════════════════════════════════════════════════
 * PERF EMERGENCY JS — Mata backdrop-filter via inline styles (wins all !important)
 *
 * Audit detectó 549 elementos con backdrop-filter activos AÚN después de
 * cargar perf-emergency.css con `* !important` — porque las reglas existentes
 * (html body .login-form-panel, etc.) tienen MAYOR especificidad.
 *
 * Inline style siempre gana sobre cualquier CSS rule (incluso !important).
 * Por eso recorremos todos los elementos y aplicamos style.backdropFilter = 'none'.
 *
 * Estrategia:
 *   1. Sweep inicial al DOMContentLoaded
 *   2. MutationObserver suave: cuando se agregan elementos nuevos, los limpiamos
 *   3. Listener requestIdleCallback para no bloquear el main thread
 * ════════════════════════════════════════════════════════════════════════ */
;(function () {
  'use strict';

  /* Whitelist de spinners que SÍ deben seguir animando */
  var SPINNER_RE = /spin|loader|loading|fa-pulse|spinner|hourglass/i;

  function isSpinner(el) {
    var c = (el.className || '') + '';
    if (SPINNER_RE.test(c)) return true;
    var anim = el.style && el.style.animationName;
    if (anim && /spin|loading/i.test(anim)) return true;
    return false;
  }

  function killHeavyOn(el) {
    if (!el || !el.style) return;
    /* Backdrop-filter — DEBE ser !important porque CSS rules existentes son !important
       y el `!important` en CSS gana sobre inline style sin !important. */
    try {
      el.style.setProperty('backdrop-filter', 'none', 'important');
      el.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
    } catch (_) {}
    /* Animations infinitas: cortar excepto spinners */
    if (!isSpinner(el)) {
      try {
        var cs = getComputedStyle(el);
        if (cs.animationIterationCount === 'infinite' && cs.animationName !== 'none') {
          el.style.setProperty('animation-iteration-count', '1', 'important');
        }
      } catch (_) {}
    }
  }

  function sweepAll() {
    var t0 = performance.now();
    var nodes = document.querySelectorAll('*');
    var killed = 0;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var cs;
      try { cs = getComputedStyle(el); } catch (_) { continue; }
      var hasBdf = cs.backdropFilter && cs.backdropFilter !== 'none';
      var hasInfAnim = cs.animationIterationCount === 'infinite' && cs.animationName !== 'none' && !isSpinner(el);
      if (hasBdf || hasInfAnim) {
        killHeavyOn(el);
        killed++;
      }
    }
    var dt = (performance.now() - t0).toFixed(0);
    if (killed > 0) console.log('[perf-emergency] Killed', killed, 'heavy elements in', dt + 'ms');
    return killed;
  }

  /* Sweep inicial cuando el DOM está listo */
  function init() {
    sweepAll();
    /* Sweep otra vez cuando todos los assets cargan */
    if (document.readyState !== 'complete') {
      window.addEventListener('load', function () {
        sweepAll();
        setTimeout(sweepAll, 1000); /* Por si scripts tardíos agregan más */
      }, { once: true });
    } else {
      setTimeout(sweepAll, 500);
    }

    /* MutationObserver para limpiar nuevos elementos sin saturar */
    var pending = new Set();
    var scheduled = false;
    function flushPending() {
      scheduled = false;
      pending.forEach(function (el) {
        if (!el.isConnected) return;
        killHeavyOn(el);
        /* También sus descendientes recientes */
        var descs = el.querySelectorAll ? el.querySelectorAll('*') : [];
        for (var i = 0; i < descs.length; i++) killHeavyOn(descs[i]);
      });
      pending.clear();
    }
    function schedule() {
      if (scheduled) return;
      scheduled = true;
      if (window.requestIdleCallback) {
        window.requestIdleCallback(flushPending, { timeout: 200 });
      } else {
        setTimeout(flushPending, 100);
      }
    }
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type !== 'childList') continue;
        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j];
          if (n.nodeType === 1) pending.add(n);
        }
      }
      if (pending.size > 0) schedule();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.PerfEmergency = { sweepAll: sweepAll, killOn: killHeavyOn };
})();
