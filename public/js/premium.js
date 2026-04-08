/* ════════════════════════════════════════════════════════════════════
   PREMIUM JS — Sistema Cotización Web
   Ambient effects, counter animations, pointer tracking, chart enhancements
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // Force dark theme always on premium mode
  (function forceDark() {
    document.body.classList.add('dark-theme');
    try { localStorage.setItem('cotizacion-dark', '1'); } catch (_) {}
    var icon = document.getElementById('theme-icon');
    if (icon) { icon.classList.remove('fa-moon'); icon.classList.add('fa-sun'); }
  })();

  // ── Inject ambient layer ──────────────────────────────────────────
  function injectAmbient() {
    if (document.querySelector('.ambient-layer')) return;
    var html = [
      '<div class="ambient-layer" aria-hidden="true">',
      '  <div class="ambient-orb ambient-orb-1"></div>',
      '  <div class="ambient-orb ambient-orb-2"></div>',
      '  <div class="ambient-orb ambient-orb-3"></div>',
      '  <div class="ambient-grid"></div>',
      '  <div class="ambient-grain"></div>',
      '</div>',
    ].join('');
    document.body.insertAdjacentHTML('afterbegin', html);
  }

  // ── Cursor light ─────────────────────────────────────────────────
  function initCursorLight() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var el = document.createElement('div');
    el.className = 'cursor-light';
    document.body.appendChild(el);
    var busy = false;
    document.addEventListener('mousemove', function (e) {
      if (busy) return;
      busy = true;
      window.requestAnimationFrame(function () {
        el.style.left = e.clientX + 'px';
        el.style.top = e.clientY + 'px';
        busy = false;
      });
    }, { passive: true });
  }

  // ── Parallax orbs on mouse ────────────────────────────────────────
  function initParallax() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var orbs = document.querySelectorAll('.ambient-orb');
    var busy = false;
    document.addEventListener('mousemove', function (e) {
      if (busy) return;
      busy = true;
      window.requestAnimationFrame(function () {
        var cx = (e.clientX / window.innerWidth - 0.5) * 2;
        var cy = (e.clientY / window.innerHeight - 0.5) * 2;
        orbs.forEach(function (orb, i) {
          var factor = (i + 1) * 8;
          orb.style.transform = 'translate(' + (cx * factor) + 'px, ' + (cy * factor) + 'px)';
        });
        busy = false;
      });
    }, { passive: true });
  }

  // ── Animated counter ─────────────────────────────────────────────
  function animateCounter(el, target, duration, prefix, suffix) {
    prefix = prefix || '';
    suffix = suffix || '';
    duration = duration || 900;
    var start = null;
    var startVal = 0;
    function step(ts) {
      if (!start) start = ts;
      var elapsed = ts - start;
      var progress = Math.min(elapsed / duration, 1);
      // Ease out expo
      var eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      var current = startVal + (target - startVal) * eased;
      el.textContent = prefix + (Number.isInteger(target) ? Math.round(current) : current.toFixed(2)) + suffix;
      if (progress < 1) window.requestAnimationFrame(step);
      else el.textContent = prefix + target + suffix;
    }
    window.requestAnimationFrame(step);
  }

  // Observe and animate counters on the dashboard KPI tiles
  function initCounters() {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        if (el.dataset.counted) return;
        el.dataset.counted = '1';
        var raw = el.textContent.trim();
        var num = parseFloat(raw.replace(/[$,h\s%]/g, ''));
        if (isNaN(num)) return;
        var prefix = raw.match(/^\$/) ? '$' : '';
        var suffix = raw.match(/h$/) ? 'h' : raw.match(/%$/) ? '%' : '';
        animateCounter(el, num, 900, prefix, suffix);
        observer.unobserve(el);
      });
    }, { threshold: 0.3 });

    function hookCounters() {
      document.querySelectorAll('.tile-value, .scorecard-value, .kpi-num, .dashboard-score-value').forEach(function (el) {
        if (!el.dataset.counted) observer.observe(el);
      });
    }
    hookCounters();
    // Re-hook after dynamic dashboard renders
    var dashObs = new MutationObserver(function () { hookCounters(); });
    var grid = document.getElementById('dashboard-grid');
    if (grid) dashObs.observe(grid, { childList: true, subtree: true });
  }

  // ── Row stagger on panel activate ────────────────────────────────
  function staggerRows(table) {
    if (!table) return;
    var rows = table.querySelectorAll('tbody tr');
    rows.forEach(function (tr, i) {
      tr.style.animationDelay = (i * 0.028) + 's';
    });
  }

  // Hook tab changes to trigger stagger
  function initRowStagger() {
    document.querySelectorAll('.tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = btn.dataset.tab;
        setTimeout(function () {
          var panel = document.getElementById('panel-' + target);
          if (panel) {
            panel.querySelectorAll('.data-table').forEach(staggerRows);
          }
        }, 80);
      });
    });
    // Also stagger tables currently visible
    document.querySelectorAll('.panel.active .data-table').forEach(staggerRows);

    // Observe tbody mutations to stagger newly added rows
    var tableObs = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        if (m.target.tagName === 'TBODY') staggerRows(m.target.closest('.data-table'));
      });
    });
    document.querySelectorAll('.data-table tbody').forEach(function (tbody) {
      tableObs.observe(tbody, { childList: true });
    });
  }

  // ── Magnetic buttons ─────────────────────────────────────────────
  function initMagneticButtons() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    function applyMagnetic(btn) {
      btn.addEventListener('pointermove', function (e) {
        var r = btn.getBoundingClientRect();
        var x = ((e.clientX - r.left) / r.width - 0.5) * 18;
        var y = ((e.clientY - r.top) / r.height - 0.5) * 12;
        btn.style.transform = 'translate(' + x + 'px, ' + y + 'px) translateY(-1px)';
      });
      btn.addEventListener('pointerleave', function () {
        btn.style.transform = '';
      });
    }
    document.querySelectorAll('.btn.primary, .tab.active').forEach(applyMagnetic);
    // Re-apply on new btns
    var observer = new MutationObserver(function () {
      document.querySelectorAll('.btn.primary:not([data-magnetic])').forEach(function (btn) {
        btn.dataset.magnetic = '1';
        applyMagnetic(btn);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ── Enhanced toast style injector ────────────────────────────────
  function patchToasts() {
    var orig = window.showToast;
    if (!orig) return;
    window.showToast = function (msg, type, dur) {
      orig.call(this, msg, type, dur);
      // Add glow effect to newly created toasts
      setTimeout(function () {
        var toasts = document.querySelectorAll('.toast-item, .toast');
        toasts.forEach(function (t) {
          if (!t.dataset.glowed) {
            t.dataset.glowed = '1';
            var c = type === 'success' ? '16,185,129' : type === 'error' ? '244,63,94' : '14,165,233';
            t.style.boxShadow = '0 0 28px rgba(' + c + ',0.2), 0 16px 48px rgba(0,0,0,0.5)';
          }
        });
      }, 60);
    };
  }

  // ── Calendar enhancement: richer event rendering ─────────────────
  function enhanceCalendar() {
    // Observe the cal-wrap for new content and re-style
    var wrap = document.querySelector('#mant-gar-cal-wrap, .mant-gar-cal-wrap');
    if (!wrap) return;
    var obs = new MutationObserver(function () {
      // Add day numbers and better event visibility
      wrap.querySelectorAll('.cal-day:not([data-enhanced])').forEach(function (day) {
        day.dataset.enhanced = '1';
        // Add event count badge if multiple events
        var events = day.querySelectorAll('.cal-event');
        if (events.length > 2) {
          var badge = document.createElement('div');
          badge.style.cssText = 'font-size:0.65rem;color:var(--blue-glow);font-weight:700;text-align:right;margin-top:2px;';
          badge.textContent = '+' + (events.length - 2) + ' más';
          // hide excess
          for (var i = 2; i < events.length; i++) {
            events[i].style.display = 'none';
          }
          day.appendChild(badge);
        }
      });
    });
    obs.observe(wrap, { childList: true, subtree: true });
  }

  // ── Stock number coloring ─────────────────────────────────────────
  function colorStockNumbers() {
    // Watch table mutations and color stock cells
    document.querySelectorAll('#tabla-refacciones tbody').forEach(function (tbody) {
      new MutationObserver(function () {
        tbody.querySelectorAll('tr').forEach(function (tr) {
          var cells = tr.querySelectorAll('td');
          if (cells.length < 5) return;
          var stockCell = cells[4]; // Stock column
          var minCell = cells[5];   // Minimum column
          var stock = parseFloat(stockCell.textContent.trim());
          var min = parseFloat(minCell.textContent.trim());
          if (!isNaN(stock) && !isNaN(min)) {
            if (stock <= min) {
              stockCell.style.color = 'var(--rose)';
              stockCell.style.fontWeight = '700';
              stockCell.style.textShadow = '0 0 10px rgba(244,63,94,0.5)';
            } else if (stock <= min * 2) {
              stockCell.style.color = 'var(--gold)';
              stockCell.style.fontWeight = '700';
            } else {
              stockCell.style.color = 'var(--green)';
              stockCell.style.fontWeight = '600';
            }
          }
        });
      }).observe(tbody, { childList: true });
    });
  }

  // ── Section title icon colors ─────────────────────────────────────
  var iconColors = {
    'clientes': 'var(--blue-glow)',
    'refacciones': 'var(--teal)',
    'maquinas': 'var(--purple)',
    'cotizaciones': 'var(--gold)',
    'ventas': 'var(--green)',
    'reportes': '#fb923c',
    'garantias': '#f43f5e',
    'mantenimiento': 'var(--gold)',
    'bonos': 'var(--purple)',
    'viajes': 'var(--blue-glow)',
    'tecnicos': 'var(--teal)',
    'tarifas': 'var(--green)',
    'revision': '#8b5cf6',
  };

  function colorSectionIcons() {
    document.querySelectorAll('.section-header').forEach(function (hdr) {
      var panel = hdr.closest('.panel');
      if (!panel) return;
      var id = panel.id || '';
      for (var key in iconColors) {
        if (id.toLowerCase().includes(key)) {
          var icon = hdr.querySelector('h2 i');
          if (icon) {
            icon.style.cssText = '-webkit-text-fill-color: ' + iconColors[key] + '; filter: drop-shadow(0 0 8px ' + iconColors[key] + ');';
          }
          break;
        }
      }
    });
  }

  // ── Gradient chart defaults ───────────────────────────────────────
  function patchChartDefaults() {
    if (!window.Chart) return;
    window.Chart.defaults.color = '#94a3b8';
    window.Chart.defaults.borderColor = 'rgba(56,189,248,0.1)';
    window.Chart.defaults.plugins.legend.labels.color = '#94a3b8';
    window.Chart.defaults.plugins.tooltip = window.Chart.defaults.plugins.tooltip || {};
    Object.assign(window.Chart.defaults.plugins.tooltip, {
      backgroundColor: 'rgba(12,21,38,0.95)',
      borderColor: 'rgba(56,189,248,0.3)',
      borderWidth: 1,
      titleColor: '#38bdf8',
      bodyColor: '#e2e8f0',
      padding: 12,
      cornerRadius: 10,
    });
  }

  // ── Page enter transition ─────────────────────────────────────────
  function pageTransition() {
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.4s ease';
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        document.body.style.opacity = '1';
      });
    });
  }

  // ── Floating number badges for KPI bar ───────────────────────────
  function initKpiBarPulse() {
    var kpiBar = document.querySelector('.dashboard-kpi-bar, #dashboard-kpi-bar');
    if (!kpiBar) return;
    var obs = new MutationObserver(function () {
      kpiBar.querySelectorAll('.kpi-val:not([data-anim])').forEach(function (el) {
        el.dataset.anim = '1';
        var num = parseFloat(el.textContent.replace(/[^0-9.]/g, ''));
        if (!isNaN(num) && num > 0) animateCounter(el, num, 800, '', '');
      });
    });
    obs.observe(kpiBar, { childList: true, subtree: true });
  }

  // ── Init ──────────────────────────────────────────────────────────
  function init() {
    injectAmbient();
    initCursorLight();
    initParallax();
    initCounters();
    initRowStagger();
    initMagneticButtons();
    patchToasts();
    enhanceCalendar();
    colorStockNumbers();
    colorSectionIcons();
    patchChartDefaults();
    pageTransition();
    initKpiBarPulse();

    // Re-color icons when panels are activated
    document.querySelectorAll('.tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setTimeout(colorSectionIcons, 100);
      });
    });

    // Re-run chart defaults after charts mount
    setTimeout(patchChartDefaults, 800);
    setTimeout(patchChartDefaults, 2500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Small delay to let main app.js set up first
    setTimeout(init, 30);
  }
})();
