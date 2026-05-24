/* ════════════════════════════════════════════════════════════════════════
 * UX-MAGIC.JS — Capa de magia premium sobre el sistema existente
 * Carga libs externas async, aplica counters animados, page transitions,
 * tooltips Tippy, NProgress en fetches, skeleton loaders.
 * ════════════════════════════════════════════════════════════════════════ */
;(function () {
  'use strict';

  /* Respeta reduced-motion: si está activo, todo en static. */
  var REDUCED = window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Helper: cargar script via CDN async ──────────────────────── */
  function loadScript(src, integrity) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      if (integrity) {
        s.integrity = integrity;
        s.crossOrigin = 'anonymous';
      }
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Failed to load: ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadStyle(href) {
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    document.head.appendChild(l);
  }

  /* ════════════════════════════════════════════════════════════════
   * 1. NProgress — barra de progreso top en cada fetch
   * ════════════════════════════════════════════════════════════════ */
  function initNProgress() {
    if (REDUCED) return;
    loadStyle('https://cdn.jsdelivr.net/npm/nprogress@0.2.0/nprogress.css');
    loadScript('https://cdn.jsdelivr.net/npm/nprogress@0.2.0/nprogress.min.js')
      .then(function () {
        if (!window.NProgress) return;
        window.NProgress.configure({ showSpinner: false, trickleSpeed: 200, minimum: 0.15 });

        /* Hook el fetch global para mostrar la barra automáticamente. */
        var origFetch = window.fetch;
        var pendingCount = 0;
        window.fetch = function () {
          pendingCount++;
          if (pendingCount === 1) {
            try { window.NProgress.start(); } catch (_) {}
          }
          var p = origFetch.apply(this, arguments);
          var done = function () {
            pendingCount = Math.max(0, pendingCount - 1);
            if (pendingCount === 0) {
              try { window.NProgress.done(); } catch (_) {}
            }
          };
          p.then(done, done);
          return p;
        };
      })
      .catch(function () { /* silencioso si CDN falla */ });
  }

  /* ════════════════════════════════════════════════════════════════
   * 2. Tippy.js — tooltips premium en todos los elementos con [title]
   * ════════════════════════════════════════════════════════════════ */
  function initTippy() {
    loadScript('https://unpkg.com/@popperjs/core@2/dist/umd/popper.min.js')
      .then(function () {
        return loadScript('https://unpkg.com/tippy.js@6/dist/tippy-bundle.umd.min.js');
      })
      .then(function () {
        if (!window.tippy) return;
        function applyTippy() {
          var nodes = document.querySelectorAll('[title]:not([data-tippy-applied])');
          nodes.forEach(function (n) {
            var t = n.getAttribute('title');
            if (!t || t.length < 2) return;
            n.setAttribute('data-tippy-content', t);
            n.removeAttribute('title');
            n.setAttribute('data-tippy-applied', '1');
          });
          window.tippy('[data-tippy-applied]', {
            theme: 'davai',
            animation: REDUCED ? 'none' : 'shift-away',
            duration: REDUCED ? 0 : [180, 100],
            delay: [400, 0],
            placement: 'top',
            arrow: true,
            allowHTML: false,
          });
        }
        applyTippy();
        /* Re-apply en mutaciones del DOM (paneles cargados después). */
        var obs = new MutationObserver(function () {
          clearTimeout(window.__tippyDebounce);
          window.__tippyDebounce = setTimeout(applyTippy, 250);
        });
        obs.observe(document.body, { childList: true, subtree: true });
      })
      .catch(function () {});
  }

  /* ════════════════════════════════════════════════════════════════
   * 3. Counter animations — KPIs cuentan de 0 al valor
   * ════════════════════════════════════════════════════════════════ */
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function animateCounter(el, target, duration, formatter) {
    if (REDUCED) {
      el.textContent = formatter ? formatter(target) : String(target);
      return;
    }
    var start = parseFloat(el.dataset.startValue || '0');
    var startTime = performance.now();
    el.classList.add('mega-counter--counting');
    function tick(now) {
      var elapsed = now - startTime;
      var t = Math.min(elapsed / duration, 1);
      var eased = easeOutCubic(t);
      var current = start + (target - start) * eased;
      el.textContent = formatter ? formatter(current) : Math.round(current).toLocaleString('es-MX');
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        el.classList.remove('mega-counter--counting');
        el.dataset.startValue = String(target);
      }
    }
    requestAnimationFrame(tick);
  }

  function autoAnimateCounters() {
    /* Busca elementos con clase scorecard__value, kpi-value, stat-value, etc. */
    var sel = '.scorecard__value, .kpi-value, .stat-value, [data-counter]';
    var nodes = document.querySelectorAll(sel);
    nodes.forEach(function (n) {
      if (n.dataset.counterDone === '1' && n.dataset.counterValue === n.textContent) return;
      var raw = n.textContent.trim();
      var match = raw.match(/^([^\d-]*)([-\d.,]+)(.*)$/);
      if (!match) return;
      var prefix = match[1];
      var numStr = match[2].replace(/,/g, '');
      var suffix = match[3];
      var num = parseFloat(numStr);
      if (!isFinite(num)) return;
      var hasDecimal = numStr.indexOf('.') !== -1;
      var formatter = function (v) {
        var formatted = hasDecimal
          ? v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : Math.round(v).toLocaleString('es-MX');
        return prefix + formatted + suffix;
      };
      n.classList.add('mega-counter');
      n.dataset.counterDone = '1';
      n.dataset.counterValue = raw;
      animateCounter(n, num, 900, formatter);
    });
  }

  /* Intersection observer: animar cuando entran en viewport. */
  function initCounterObserver() {
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          autoAnimateCounters();
        }
      });
    }, { threshold: 0.3 });

    var setup = function () {
      var nodes = document.querySelectorAll('.scorecard__value, .kpi-value, .stat-value, [data-counter]');
      nodes.forEach(function (n) {
        if (n.__megaObserved) return;
        n.__megaObserved = true;
        io.observe(n);
      });
    };
    setup();
    var obs = new MutationObserver(function () {
      clearTimeout(window.__counterDebounce);
      window.__counterDebounce = setTimeout(setup, 300);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  /* ════════════════════════════════════════════════════════════════
   * 4. Page transitions — animar cambio de panel activo
   * ════════════════════════════════════════════════════════════════ */
  function initPageTransitions() {
    if (REDUCED) return;
    /* Ya tenemos la animación CSS en mega-upgrade-2026.css.
       El observer le re-aplica el class para que reinicie. */
    var lastPanel = null;
    var obs = new MutationObserver(function () {
      var active = document.querySelector('.panel.active');
      if (active && active !== lastPanel) {
        active.classList.remove('panel-just-active');
        void active.offsetWidth; /* reflow */
        active.classList.add('panel-just-active');
        lastPanel = active;
      }
    });
    obs.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
  }

  /* ════════════════════════════════════════════════════════════════
   * 5. Smooth scroll behavior
   * ════════════════════════════════════════════════════════════════ */
  function initSmoothScroll() {
    document.documentElement.style.scrollBehavior = REDUCED ? 'auto' : 'smooth';
  }

  /* ════════════════════════════════════════════════════════════════
   * 6. Skeleton loaders — reemplazar "Cargando..." con shimmer
   * ════════════════════════════════════════════════════════════════ */
  function injectSkeletonForTable(tableId, rows) {
    var tbody = document.querySelector('#' + tableId + ' tbody');
    if (!tbody) return;
    var n = rows || 5;
    var html = '';
    for (var i = 0; i < n; i++) {
      html += '<tr class="mega-skeleton-row"><td colspan="20" style="padding:0;"><div class="mega-skeleton mega-skeleton--row"></div></td></tr>';
    }
    tbody.innerHTML = html;
  }
  window.MegaSkeleton = { table: injectSkeletonForTable };

  /* ════════════════════════════════════════════════════════════════
   * 7. Day.js — formateo de fechas (carga ligera, opcional)
   * ════════════════════════════════════════════════════════════════ */
  function initDayjs() {
    loadScript('https://cdn.jsdelivr.net/npm/dayjs@1/dayjs.min.js')
      .then(function () {
        return loadScript('https://cdn.jsdelivr.net/npm/dayjs@1/locale/es.js');
      })
      .then(function () {
        if (window.dayjs) {
          try { window.dayjs.locale('es'); } catch (_) {}
        }
      })
      .catch(function () {});
  }

  /* ════════════════════════════════════════════════════════════════
   * 8. Mejora visual: sparkle hover en botones primary
   * ════════════════════════════════════════════════════════════════ */
  function initButtonSparkle() {
    if (REDUCED) return;
    document.addEventListener('pointerdown', function (e) {
      var btn = e.target.closest('.btn.primary, .btn-primary, .davai-fab__button');
      if (!btn) return;
      var rect = btn.getBoundingClientRect();
      var ripple = document.createElement('span');
      var size = Math.max(rect.width, rect.height) * 1.2;
      ripple.style.cssText =
        'position:absolute;border-radius:50%;background:rgba(255,255,255,0.4);' +
        'pointer-events:none;width:' + size + 'px;height:' + size + 'px;' +
        'left:' + (e.clientX - rect.left - size / 2) + 'px;' +
        'top:' + (e.clientY - rect.top - size / 2) + 'px;' +
        'transform:scale(0);transition:transform 0.6s ease,opacity 0.6s ease;' +
        'opacity:1;z-index:0;';
      var prevPos = getComputedStyle(btn).position;
      if (prevPos === 'static') btn.style.position = 'relative';
      var prevOverflow = getComputedStyle(btn).overflow;
      if (prevOverflow === 'visible') btn.style.overflow = 'hidden';
      btn.appendChild(ripple);
      requestAnimationFrame(function () {
        ripple.style.transform = 'scale(1)';
        ripple.style.opacity = '0';
      });
      setTimeout(function () { try { ripple.remove(); } catch (_) {} }, 700);
    }, { passive: true });
  }

  /* ════════════════════════════════════════════════════════════════
   * Boot
   * ════════════════════════════════════════════════════════════════ */
  function boot() {
    initNProgress();
    initTippy();
    initCounterObserver();
    initPageTransitions();
    initSmoothScroll();
    initDayjs();
    initButtonSparkle();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    /* Diferido un tick para no bloquear el primer render. */
    requestIdleCallback ? requestIdleCallback(boot) : setTimeout(boot, 100);
  }

  window.UXMagic = {
    animateCounter: animateCounter,
    refreshCounters: autoAnimateCounters,
    skeleton: injectSkeletonForTable,
  };
})();
