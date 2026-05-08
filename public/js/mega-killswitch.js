/* ════════════════════════════════════════════════════════════════════════
 * MEGA KILL-SWITCH — Carga SINCRONA en <head>, antes de todos los demás.
 *
 * Misión: detectar lite mode ANTES de que carguen mega-features-*.
 *   - ?lite=1 en URL
 *   - localStorage 'mega-lite' = '1'
 *   - Auto-detect long tasks > 150ms
 *
 * En lite mode:
 *   - window.__MEGA_LITE__ = true (los demás scripts lo verifican y skip)
 *   - body.mega-lite-mode (CSS oculta UI extras)
 *   - Botón flotante para toggle on/off (siempre visible)
 * ════════════════════════════════════════════════════════════════════════ */
;(function () {
  'use strict';

  /* Detect lite mode */
  var url = new URL(window.location.href);
  var paramLite = url.searchParams.get('lite');
  var stored;
  try { stored = localStorage.getItem('mega-lite'); } catch (_) {}

  if (paramLite === '1') {
    try { localStorage.setItem('mega-lite', '1'); } catch (_) {}
    stored = '1';
  } else if (paramLite === '0') {
    try { localStorage.removeItem('mega-lite'); } catch (_) {}
    stored = null;
  }

  var liteOn = stored === '1';
  window.__MEGA_LITE__ = liteOn;

  /* Apply body class ASAP */
  function applyClass () {
    if (liteOn) document.body && document.body.classList.add('mega-lite-mode');
    else document.body && document.body.classList.remove('mega-lite-mode');
  }
  if (document.body) applyClass();
  else document.addEventListener('DOMContentLoaded', applyClass);

  /* Toggle helpers globales */
  window.MegaLite = {
    isOn: function () { return window.__MEGA_LITE__; },
    enable: function () {
      try { localStorage.setItem('mega-lite', '1'); } catch (_) {}
      window.__MEGA_LITE__ = true;
      window.location.reload();
    },
    disable: function () {
      try { localStorage.removeItem('mega-lite'); } catch (_) {}
      window.__MEGA_LITE__ = false;
      window.location.reload();
    },
    toggle: function () {
      window.__MEGA_LITE__ ? window.MegaLite.disable() : window.MegaLite.enable();
    },
  };

  /* Emergency toggle button (siempre visible) — bottom-right discreto */
  function injectButton () {
    if (document.getElementById('mega-lite-toggle')) return;
    var btn = document.createElement('button');
    btn.id = 'mega-lite-toggle';
    btn.title = liteOn
      ? 'Modo LITE activo — click para volver al modo completo'
      : 'Activar modo LITE (deshabilita features extras si la página va lenta)';
    btn.setAttribute('aria-label', btn.title);
    btn.innerHTML = liteOn ? '⚡' : '🪶';
    btn.style.cssText = [
      'position:fixed',
      'bottom:60px',
      'left:14px',
      'z-index:99987',
      'width:32px',
      'height:32px',
      'border-radius:50%',
      'border:1px solid ' + (liteOn ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.15)'),
      'background:' + (liteOn ? 'linear-gradient(135deg,#f59e0b,#ef4444)' : 'rgba(15,23,42,0.85)'),
      'color:#fff',
      'cursor:pointer',
      'font-size:0.9rem',
      'box-shadow:0 4px 12px rgba(0,0,0,0.4)',
      'opacity:0.65',
      'transition:opacity 0.2s ease,transform 0.18s ease',
    ].join(';');
    btn.addEventListener('mouseenter', function () { btn.style.opacity = '1'; btn.style.transform = 'scale(1.08)'; });
    btn.addEventListener('mouseleave', function () { btn.style.opacity = '0.65'; btn.style.transform = ''; });
    btn.addEventListener('click', window.MegaLite.toggle);
    (document.body || document.documentElement).appendChild(btn);
  }

  /* Atajo Ctrl+Shift+L */
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      window.MegaLite.toggle();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButton);
  } else {
    injectButton();
  }

  /* Auto-detect long tasks → sugerir lite mode una vez */
  if (!liteOn && 'PerformanceObserver' in window) {
    var longTaskCount = 0;
    var suggested = false;
    try {
      var po = new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (entry) {
          if (entry.duration > 200) longTaskCount++;
        });
        if (longTaskCount > 5 && !suggested) {
          suggested = true;
          showSlowBanner();
          po.disconnect();
        }
      });
      po.observe({ entryTypes: ['longtask'] });
    } catch (_) {}
  }

  function showSlowBanner () {
    if (document.getElementById('mega-slow-banner')) return;
    var b = document.createElement('div');
    b.id = 'mega-slow-banner';
    b.style.cssText = [
      'position:fixed',
      'bottom:14px',
      'left:14px',
      'right:14px',
      'max-width:480px',
      'margin:0 auto',
      'z-index:99988',
      'background:linear-gradient(135deg,rgba(245,158,11,0.95),rgba(239,68,68,0.95))',
      'color:#fff',
      'padding:12px 16px',
      'border-radius:12px',
      'box-shadow:0 8px 24px rgba(0,0,0,0.4)',
      'display:flex',
      'align-items:center',
      'gap:10px',
      'font-family:Inter,system-ui,sans-serif',
      'font-size:0.84rem',
      'animation:msb-in 0.4s ease',
    ].join(';');
    b.innerHTML =
      '<span>⚡</span>' +
      '<div style="flex:1"><strong>La página va lenta.</strong> ¿Activar modo lite?</div>' +
      '<button id="msb-yes" style="background:#fff;color:#7c2d12;border:none;padding:6px 12px;border-radius:6px;font-weight:700;cursor:pointer">Sí</button>' +
      '<button id="msb-no" style="background:transparent;border:1px solid rgba(255,255,255,0.5);color:#fff;padding:6px 10px;border-radius:6px;cursor:pointer">No</button>';
    (document.body || document.documentElement).appendChild(b);
    document.getElementById('msb-yes').onclick = window.MegaLite.enable;
    document.getElementById('msb-no').onclick = function () { b.remove(); };
    setTimeout(function () { var x = document.getElementById('mega-slow-banner'); if (x) x.remove(); }, 12000);
  }

  /* En lite mode: bloquear ejecución de mega-features-* */
  if (liteOn) {
    /* Sobrescribimos document.createElement para interceptar <script> que intenten cargar
       mega-features-*.js o sus CDNs (lottie, NProgress, tippy, sortable, html2pdf, xlsx, qr, dayjs, popper, apexcharts, tsParticles) */
    var BLOCKED = /(mega-features-|lottie-web|nprogress|tippy|popper|sortablejs|html2pdf|xlsx|qrcode-generator|dayjs|apexcharts|tsparticles|leaflet)/i;
    var origCreate = document.createElement.bind(document);
    document.createElement = function (tag) {
      var el = origCreate(tag);
      if (String(tag).toLowerCase() === 'script') {
        try {
          Object.defineProperty(el, 'src', {
            set: function (v) {
              if (v && BLOCKED.test(v)) {
                /* Bloqueado en lite */
                return;
              }
              el.setAttribute('src', v);
            },
            get: function () { return el.getAttribute('src'); },
            configurable: true,
          });
        } catch (_) {}
      }
      return el;
    };

    /* Marcar visualmente */
    if (document.documentElement) document.documentElement.style.setProperty('--mega-lite', '1');

    /* Mensaje suave en consola */
    console.log('%c🪶 MODO LITE ACTIVO. Mega-features deshabilitados. Ctrl+Shift+L para volver.',
      'color:#f59e0b;font-weight:700;background:#1e293b;padding:6px 10px;border-radius:6px');
  }

  /* Pause MutationObservers cuando la pestaña está en background */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      document.body && document.body.classList.add('mega-paused');
    } else {
      document.body && document.body.classList.remove('mega-paused');
    }
  });

  /* Limpiar URL si vino con ?lite=1 */
  if (paramLite !== null) {
    var clean = new URL(window.location.href);
    clean.searchParams.delete('lite');
    try { history.replaceState({}, '', clean.toString()); } catch (_) {}
  }
})();
