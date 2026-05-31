/* ============================================================
 * UX-ENHANCEMENTS.JS  v1-premium-ux
 * Premium micro-interactions & UX features.
 * Loaded AFTER app.js (defer). Non-destructive enhancements.
 *
 * Features:
 *   1. Button ripple effect
 *   2. Modal entry/exit animations
 *   3. Tab panel crossfade
 *   4. Header scroll depth shadow
 *   5. Toast slide-in enhancements
 *   6. Command palette (Ctrl+K)
 *   7. Skeleton loader stagger
 *   8. Smooth number counters
 *   9. Sidebar tooltips on collapsed
 *  10. Status bar (connection, role, sync, version)
 * ============================================================ */

(function () {
  'use strict';

  /* ---- helpers ---- */
  var qs  = function (s) { return document.querySelector(s); };
  var qsa = function (s) { return document.querySelectorAll(s); };

  /** Respect prefers-reduced-motion. */
  var prefersReducedMotion = function () {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };

  /* ============================================================
   * 1. BUTTON RIPPLE EFFECT
   * ============================================================ */

  document.addEventListener('click', function (e) {
    if (prefersReducedMotion()) return;
    var btn = e.target.closest('.btn');
    if (!btn || btn.disabled) return;
    /* Ripple en celdas de tablas dispara mutaciones en tbody → cientos de observers;
       openModal ya ocurrió en este clic; el span extra puede recongelar Chrome. */
    if (btn.closest('table.data-table')) return;

    var rect = btn.getBoundingClientRect();
    var ripple = document.createElement('span');
    ripple.className = 'pm-ripple-circle';
    ripple.style.left = (e.clientX - rect.left) + 'px';
    ripple.style.top  = (e.clientY - rect.top) + 'px';
    /* position/overflow son necesarios SOLO durante la animación. Antes se dejaban
       inline permanentemente y recortaban contenido que sobresale del botón
       (badges, contadores, dropdowns). Guardamos y restauramos al terminar. */
    var _prevPos = btn.style.position;
    var _prevOvf = btn.style.overflow;
    btn.style.position = 'relative';
    btn.style.overflow = 'hidden';
    btn.appendChild(ripple);

    ripple.addEventListener('animationend', function () {
      ripple.remove();
      /* Restaurar solo cuando no quedan ripples activos (clicks rápidos). */
      if (!btn.querySelector('.pm-ripple-circle')) {
        btn.style.position = _prevPos;
        btn.style.overflow = _prevOvf;
      }
    });
  });


  /* ============================================================
   * 2. MODAL ENTRY / EXIT ANIMATIONS
   * ============================================================ */

  /** Observe modals for class changes (hidden toggled). */
  var modalObserver = new MutationObserver(function (mutations) {
    if (prefersReducedMotion()) return;
    mutations.forEach(function (m) {
      if (m.type !== 'attributes' || m.attributeName !== 'class') return;
      var target = m.target;
      if (!target.classList.contains('modal')) return;

      if (!target.classList.contains('hidden')) {
        /* #modal / #modal-stack: app.js fuerza animation:none en .modal-box tras el paint;
           pm-modal-entering choca con eso y añade trabajo/relayout innecesario. */
        if (target.id === 'modal' || target.id === 'modal-stack') return;
        /* Modal just became visible */
        var box = target.querySelector('.modal-box');
        if (box) {
          box.classList.remove('pm-modal-leaving');
          box.classList.add('pm-modal-entering');
          box.addEventListener('animationend', function handler() {
            box.classList.remove('pm-modal-entering');
            box.removeEventListener('animationend', handler);
          });
        }
        /* Overlay fade */
        target.classList.add('pm-overlay-entering');
        target.addEventListener('animationend', function handler2() {
          target.classList.remove('pm-overlay-entering');
          target.removeEventListener('animationend', handler2);
        });
      }
    });
  });

  /* Observe all modals on page */
  qsa('.modal').forEach(function (modal) {
    modalObserver.observe(modal, { attributes: true, attributeFilter: ['class'] });
  });


  /* ============================================================
   * 3. TAB PANEL CROSSFADE
   * ============================================================ */

  var panelObserver = new MutationObserver(function (mutations) {
    if (prefersReducedMotion()) return;
    mutations.forEach(function (m) {
      if (m.type !== 'attributes' || m.attributeName !== 'class') return;
      var panel = m.target;
      if (!panel.classList.contains('panel')) return;

      /* Panel just became active */
      if (panel.classList.contains('active') && !panel.classList.contains('pm-panel-entering')) {
        panel.classList.add('pm-panel-entering');
        panel.addEventListener('animationend', function handler() {
          panel.classList.remove('pm-panel-entering');
          panel.removeEventListener('animationend', handler);
        });

        /* Also stagger skeleton rows inside the newly-visible panel */
        staggerSkeletons(panel);
      }
    });
  });

  qsa('.panel').forEach(function (panel) {
    panelObserver.observe(panel, { attributes: true, attributeFilter: ['class'] });
  });


  /* ============================================================
   * 4. HEADER SCROLL DEPTH SHADOW
   * ============================================================ */

  (function initHeaderScrollDepth() {
    var header = qs('.header');
    if (!header) return;

    var content = qs('.content') || qs('.app-main');
    var scrollThreshold = 10;

    var applyClass = function (scrollTop) {
      header.classList.toggle('header--scrolled', scrollTop > scrollThreshold);
    };

    if (content) {
      content.addEventListener('scroll', function () {
        applyClass(content.scrollTop);
      }, { passive: true });
    }

    window.addEventListener('scroll', function () {
      applyClass(window.scrollY || document.documentElement.scrollTop);
    }, { passive: true });
  })();


  /* ============================================================
   * 5. TOAST SLIDE-IN ENHANCEMENTS
   * ============================================================ */

  (function initToastEnhancements() {
    var toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;

    var toastObserver = new MutationObserver(function (mutations) {
      if (prefersReducedMotion()) return;
      mutations.forEach(function (m) {
        for (var i = 0; i < m.addedNodes.length; i++) {
          var node = m.addedNodes[i];
          if (node.nodeType === 1 && node.classList && node.classList.contains('toast')) {
            node.classList.add('pm-toast-enter');
            node.addEventListener('animationend', function handler() {
              node.classList.remove('pm-toast-enter');
              node.removeEventListener('animationend', handler);
            });
          }
        }
      });
    });

    toastObserver.observe(toastContainer, { childList: true, subtree: true });
  })();


  /* ============================================================
   * 6. COMMAND PALETTE  (Ctrl+K)
   * ============================================================ */

  (function initCommandPalette() {
    var paletteEl = null;
    var inputEl   = null;
    var listEl    = null;
    var isOpen    = false;
    var items     = [];
    var filtered  = [];
    var activeIdx = 0;

    /** Collect modules from sidebar tabs. */
    function collectModules() {
      items = [];
      var tabs = qsa('.tabs--rail .tab[data-tab]');
      tabs.forEach(function (t, idx) {
        if (t.classList.contains('hidden')) return;
        var icon = t.querySelector('i');
        var iconClass = icon ? icon.className : 'fas fa-circle';
        var label = (t.textContent || '').trim();
        var tabId = t.getAttribute('data-tab') || '';
        var shortcut = '';
        var titleAttr = t.getAttribute('title') || '';
        var ctrlMatch = titleAttr.match(/Ctrl\+(\d)/);
        if (ctrlMatch) shortcut = 'Ctrl+' + ctrlMatch[1];

        items.push({
          label: label,
          tabId: tabId,
          iconClass: iconClass,
          shortcut: shortcut,
          index: idx
        });
      });
    }

    /** Build the palette DOM once. */
    function buildPalette() {
      if (paletteEl) return;

      paletteEl = document.createElement('div');
      paletteEl.id = 'pm-command-palette';
      paletteEl.className = 'pm-command-palette hidden';
      paletteEl.setAttribute('role', 'dialog');
      paletteEl.setAttribute('aria-label', 'Paleta de comandos');

      paletteEl.innerHTML =
        '<div class="pm-command-backdrop"></div>' +
        '<div class="pm-command-box">' +
          '<div class="pm-command-search-wrap">' +
            '<i class="fas fa-search pm-command-search-icon"></i>' +
            '<input type="text" class="pm-command-input" placeholder="Buscar modulo..." autocomplete="off" spellcheck="false" />' +
            '<kbd class="pm-command-kbd">Esc</kbd>' +
          '</div>' +
          '<ul class="pm-command-list" role="listbox"></ul>' +
          '<div class="pm-command-footer">' +
            '<span><kbd>&uarr;</kbd><kbd>&darr;</kbd> navegar</span>' +
            '<span><kbd>Enter</kbd> abrir</span>' +
            '<span><kbd>Esc</kbd> cerrar</span>' +
          '</div>' +
        '</div>';

      document.body.appendChild(paletteEl);

      inputEl = paletteEl.querySelector('.pm-command-input');
      listEl  = paletteEl.querySelector('.pm-command-list');

      /* Backdrop click closes */
      paletteEl.querySelector('.pm-command-backdrop').addEventListener('click', closePalette);

      /* Input filtering */
      inputEl.addEventListener('input', function () {
        filterList(inputEl.value);
      });

      /* Keyboard nav inside palette */
      inputEl.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          activeIdx = Math.min(activeIdx + 1, filtered.length - 1);
          highlightItem();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          activeIdx = Math.max(activeIdx - 1, 0);
          highlightItem();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          selectItem(activeIdx);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closePalette();
        }
      });
    }

    /** Highlight text match in label. */
    function highlightMatch(label, query) {
      if (!query) return escapeHtml(label);
      var lower = label.toLowerCase();
      var qLower = query.toLowerCase();
      var idx = lower.indexOf(qLower);
      if (idx === -1) return escapeHtml(label);
      var before = label.substring(0, idx);
      var match  = label.substring(idx, idx + query.length);
      var after  = label.substring(idx + query.length);
      return escapeHtml(before) + '<mark class="pm-command-match">' + escapeHtml(match) + '</mark>' + escapeHtml(after);
    }

    function escapeHtml(s) {
      var div = document.createElement('div');
      div.appendChild(document.createTextNode(s || ''));
      return div.innerHTML;
    }

    /** Filter and render list. */
    function filterList(query) {
      query = (query || '').trim();
      if (!query) {
        filtered = items.slice();
      } else {
        var qLower = query.toLowerCase();
        filtered = items.filter(function (item) {
          return item.label.toLowerCase().indexOf(qLower) !== -1 ||
                 item.tabId.toLowerCase().indexOf(qLower) !== -1;
        });
      }
      activeIdx = 0;
      renderList(query);
    }

    /** Render items into the list. */
    function renderList(query) {
      var html = '';
      filtered.forEach(function (item, idx) {
        var activeClass = idx === activeIdx ? ' pm-command-item--active' : '';
        html +=
          '<li class="pm-command-item' + activeClass + '" role="option" data-idx="' + idx + '">' +
            '<i class="' + item.iconClass + ' pm-command-item-icon"></i>' +
            '<span class="pm-command-item-label">' + highlightMatch(item.label, query) + '</span>' +
            (item.shortcut ? '<kbd class="pm-command-item-shortcut">' + item.shortcut + '</kbd>' : '') +
          '</li>';
      });
      if (!filtered.length) {
        html = '<li class="pm-command-empty">Sin resultados</li>';
      }
      listEl.innerHTML = html;

      /* Click handlers on items */
      var liItems = listEl.querySelectorAll('.pm-command-item[data-idx]');
      liItems.forEach(function (li) {
        li.addEventListener('click', function () {
          selectItem(parseInt(li.getAttribute('data-idx'), 10));
        });
        li.addEventListener('mouseenter', function () {
          activeIdx = parseInt(li.getAttribute('data-idx'), 10);
          highlightItem();
        });
      });
    }

    /** Highlight the active item visually. */
    function highlightItem() {
      var allItems = listEl.querySelectorAll('.pm-command-item[data-idx]');
      allItems.forEach(function (li, i) {
        li.classList.toggle('pm-command-item--active', i === activeIdx);
      });
      /* Scroll into view */
      var active = listEl.querySelector('.pm-command-item--active');
      if (active) {
        active.scrollIntoView({ block: 'nearest' });
      }
    }

    /** Navigate to a module. */
    function selectItem(idx) {
      if (idx < 0 || idx >= filtered.length) return;
      var item = filtered[idx];
      closePalette();

      /* Trigger the tab click programmatically */
      var tabBtn = document.querySelector('.tab[data-tab="' + item.tabId + '"]');
      if (tabBtn) {
        tabBtn.click();
      }
    }

    /** Open the palette. */
    function openPalette() {
      if (isOpen) return;
      buildPalette();
      collectModules();
      filtered = items.slice();
      activeIdx = 0;
      inputEl.value = '';
      renderList('');
      paletteEl.classList.remove('hidden');
      paletteEl.classList.add('pm-command-entering');
      isOpen = true;
      requestAnimationFrame(function () {
        inputEl.focus();
      });
      paletteEl.addEventListener('animationend', function handler() {
        paletteEl.classList.remove('pm-command-entering');
        paletteEl.removeEventListener('animationend', handler);
      });
    }

    /** Close the palette. */
    function closePalette() {
      if (!isOpen || !paletteEl) return;
      isOpen = false;
      paletteEl.classList.add('hidden');
      paletteEl.classList.remove('pm-command-entering');
    }

    /** Global keyboard shortcut: Ctrl+K */
    document.addEventListener('keydown', function (e) {
      /* Do not intercept when inside a modal input or textarea */
      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
        var active = document.activeElement;
        var tag = active ? active.tagName : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
          /* Allow Ctrl+K in text fields only if not the command palette input */
          if (active !== inputEl) return;
        }
        e.preventDefault();
        if (isOpen) {
          closePalette();
        } else {
          openPalette();
        }
      }
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        closePalette();
      }
    });
  })();


  /* ============================================================
   * 7. SKELETON LOADER STAGGER
   * ============================================================ */

  function staggerSkeletons(root) {
    var els = (root || document).querySelectorAll('.skeleton-row, .pm-skeleton, .skeleton, [data-skeleton]');
    els.forEach(function (el, i) {
      el.style.animationDelay = (i * 0.08) + 's';
    });
  }

  /* Initial stagger on load */
  staggerSkeletons(document);


  /* ============================================================
   * 8. SMOOTH NUMBER COUNTERS
   * ============================================================ */

  /**
   * Animate a numeric value inside an element from `start` to `end`.
   * Handles formatted numbers: $, commas, %, decimals.
   */
  function animateValue(el, start, end, duration) {
    if (prefersReducedMotion() || start === end) {
      return;
    }
    duration = duration || 600;
    var startTime = null;

    /* Detect formatting from current text */
    var text = el.textContent || '';
    var hasPrefix = '';
    var hasSuffix = '';
    var decimals = 0;

    if (text.indexOf('$') !== -1) hasPrefix = '$';
    if (text.indexOf('%') !== -1) hasSuffix = '%';
    var dotMatch = String(end).match(/\.(\d+)/);
    if (dotMatch) decimals = dotMatch[1].length;

    var useCommas = text.indexOf(',') !== -1;

    function formatNum(n) {
      var fixed = n.toFixed(decimals);
      if (useCommas) {
        var parts = fixed.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        fixed = parts.join('.');
      }
      return hasPrefix + fixed + hasSuffix;
    }

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var elapsed = timestamp - startTime;
      var progress = Math.min(elapsed / duration, 1);
      /* ease-out curve */
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = start + (end - start) * eased;
      el.textContent = formatNum(current);
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  }

  /** Watch for KPI value changes and animate them. */
  (function initKpiCounters() {
    var kpiSelector = '.kpi-value, .kpi-number, .quick-stat-value, .dashboard-score-value';
    var kpiEls = qsa(kpiSelector);

    var kpiObserver = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        if (m.type !== 'characterData' && m.type !== 'childList') return;
        var target = m.target.nodeType === 3 ? m.target.parentElement : m.target;
        if (!target || !target.matches) return;
        if (!target.matches(kpiSelector)) return;

        var newText = (target.textContent || '').trim();
        var oldText = target.getAttribute('data-pm-prev') || '';

        if (newText === oldText) return;
        target.setAttribute('data-pm-prev', newText);

        var newNum = parseFloat(newText.replace(/[$,%\s]/g, ''));
        var oldNum = parseFloat(oldText.replace(/[$,%\s]/g, ''));

        if (!isNaN(newNum) && !isNaN(oldNum) && newNum !== oldNum) {
          animateValue(target, oldNum, newNum, 600);
        }
      });
    });

    kpiEls.forEach(function (el) {
      el.setAttribute('data-pm-prev', (el.textContent || '').trim());
      kpiObserver.observe(el, { characterData: true, childList: true, subtree: true });
    });
  })();


  /* ============================================================
   * 9. SIDEBAR TOOLTIPS ON COLLAPSED
   * ============================================================ */

  (function initSidebarTooltips() {
    /** Set data-label on each tab for the CSS tooltip to read. */
    function applyLabels() {
      var tabs = qsa('.tabs--rail .tab[data-tab]');
      tabs.forEach(function (t) {
        var text = (t.textContent || '').trim();
        if (text && !t.getAttribute('data-label')) {
          t.setAttribute('data-label', text);
        }
      });
    }

    applyLabels();

    /* Re-apply after DOM mutations (e.g. permission-based show/hide). */
    var sidebarNav = qs('#sidebar-rail-tabs');
    if (sidebarNav) {
      var labelObserver = new MutationObserver(function () {
        applyLabels();
      });
      labelObserver.observe(sidebarNav, { childList: true, subtree: true });
    }
  })();


  /* ============================================================
   * 10. STATUS BAR
   * ============================================================ */

  (function initStatusBar() {
    /* Si la barra estática #app-status-bar ya existe en el HTML, no duplicamos. */
    if (document.getElementById('app-status-bar') || document.getElementById('pm-status-bar')) return;
    var bar = document.createElement('div');
    bar.id = 'pm-status-bar';
    bar.className = 'pm-status-bar';
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-live', 'polite');

    /* Connection indicator */
    var connEl = document.createElement('span');
    connEl.className = 'pm-status-item pm-status-conn';
    connEl.innerHTML = '<i class="fas fa-circle pm-status-dot pm-status-dot--online"></i> En linea';

    /* Role indicator */
    var roleEl = document.createElement('span');
    roleEl.className = 'pm-status-item pm-status-role';
    roleEl.innerHTML = '<i class="fas fa-user-tag"></i> <span class="pm-status-role-text">--</span>';

    /* Last sync */
    var syncEl = document.createElement('span');
    syncEl.className = 'pm-status-item pm-status-sync';
    syncEl.innerHTML = '<i class="fas fa-sync-alt"></i> <span class="pm-status-sync-text">--</span>';

    /* Version */
    var versionEl = document.createElement('span');
    versionEl.className = 'pm-status-item pm-status-version';
    versionEl.innerHTML = 'v1.0 Premium';

    /* Ctrl+K hint */
    var cmdEl = document.createElement('span');
    cmdEl.className = 'pm-status-item pm-status-cmd';
    cmdEl.innerHTML = '<kbd>Ctrl+K</kbd> Buscar';
    cmdEl.style.cursor = 'pointer';
    cmdEl.addEventListener('click', function () {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    });

    bar.appendChild(connEl);
    bar.appendChild(roleEl);
    bar.appendChild(syncEl);
    bar.appendChild(versionEl);
    bar.appendChild(cmdEl);

    document.body.appendChild(bar);

    /* ---- Update connection status ---- */
    function updateConnection() {
      var online = navigator.onLine;
      var dot = connEl.querySelector('.pm-status-dot');
      if (dot) {
        dot.classList.toggle('pm-status-dot--online', online);
        dot.classList.toggle('pm-status-dot--offline', !online);
      }
      connEl.lastChild.textContent = online ? ' En linea' : ' Sin conexion';
    }

    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    updateConnection();

    /* ---- Update role from session ---- */
    function updateRole() {
      try {
        var raw = localStorage.getItem('cotizacion-auth-user');
        var user = raw ? JSON.parse(raw) : null;
        var roleText = roleEl.querySelector('.pm-status-role-text');
        if (user && user.role) {
          var r = String(user.role).trim();
          roleText.textContent = r.charAt(0).toUpperCase() + r.slice(1);
        } else {
          roleText.textContent = 'Invitado';
        }
      } catch (_) {
        var rt = roleEl.querySelector('.pm-status-role-text');
        if (rt) rt.textContent = '--';
      }
    }

    updateRole();
    /* Refresh role when localStorage changes (e.g. login/logout in another tab). */
    window.addEventListener('storage', function (e) {
      if (e.key === 'cotizacion-auth-user') updateRole();
    });
    /* Also poll periodically in same tab (login happens via app.js). */
    setInterval(updateRole, 5000);

    /* ---- Update last sync time ---- */
    function updateSyncTime() {
      var syncText = syncEl.querySelector('.pm-status-sync-text');
      var now = new Date();
      var hh = String(now.getHours()).padStart(2, '0');
      var mm = String(now.getMinutes()).padStart(2, '0');
      syncText.textContent = hh + ':' + mm;
    }

    updateSyncTime();
    setInterval(updateSyncTime, 30000);

    /* Also update on fetch activity (intercept XHR completion). */
    var origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function () {
      this.addEventListener('load', function () {
        updateSyncTime();
      });
      return origOpen.apply(this, arguments);
    };
  })();


  /* ============================================================
   * INLINE CSS  for components created by this file.
   * (Keeps the JS self-contained; classes referenced by
   *  premium-upgrade.css still work as normal.)
   * ============================================================ */

  (function injectStyles() {
    var style = document.createElement('style');
    style.id = 'pm-ux-enhancements-css';
    style.textContent =
      /* ---- 1. Ripple circle ---- */
      '.pm-ripple-circle {' +
        'position: absolute;' +
        'width: 20px; height: 20px;' +
        'border-radius: 50%;' +
        'background: rgba(255,255,255,0.35);' +
        'transform: translate(-50%,-50%) scale(0);' +
        'animation: pm-ripple 0.5s cubic-bezier(0.22,1,0.36,1) forwards;' +
        'pointer-events: none;' +
        'z-index: 10;' +
      '}' +

      /* ---- 2. Modal entry ---- */
      '.pm-modal-entering {' +
        'animation: pm-scale-in 0.28s cubic-bezier(0.22,1,0.36,1) both !important;' +
      '}' +
      '.pm-modal-leaving {' +
        'animation: pm-scale-in 0.2s cubic-bezier(0.22,1,0.36,1) reverse both !important;' +
      '}' +
      '.pm-overlay-entering {' +
        'animation: pm-fade-in 0.22s ease both;' +
      '}' +

      /* ---- 3. Panel crossfade ---- */
      '.pm-panel-entering {' +
        'animation: pm-fade-in-up 0.35s cubic-bezier(0.22,1,0.36,1) both;' +
      '}' +

      /* ---- 4. Header scroll depth ---- */
      '.header {' +
        'transition: box-shadow 0.3s ease, border-color 0.3s ease;' +
      '}' +
      '.header--scrolled {' +
        'box-shadow: 0 2px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06) !important;' +
        'border-bottom-color: var(--nano-border, rgba(0,0,0,0.08)) !important;' +
      '}' +

      /* ---- 5. Toast enter ---- */
      '.pm-toast-enter {' +
        'animation: pm-notification-slide 0.35s cubic-bezier(0.22,1,0.36,1) both;' +
      '}' +

      /* ---- 6. Command Palette ---- */
      '.pm-command-palette {' +
        'position: fixed; inset: 0; z-index: 99999;' +
        'display: flex; align-items: flex-start; justify-content: center;' +
        'padding-top: min(18vh, 160px);' +
      '}' +
      '.pm-command-palette.hidden { display: none; }' +
      '.pm-command-entering .pm-command-box {' +
        'animation: pm-scale-in 0.2s cubic-bezier(0.22,1,0.36,1) both;' +
      '}' +
      '.pm-command-backdrop {' +
        'position: absolute; inset: 0;' +
        'background: rgba(0,0,0,0.45);' +
        'backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);' +
      '}' +
      '.pm-command-box {' +
        'position: relative; z-index: 1;' +
        'width: min(520px, 90vw);' +
        'max-height: 420px;' +
        'background: var(--nano-surface-solid, rgba(15,23,42,0.96));' +
        'border: 1px solid var(--nano-border, rgba(255,255,255,0.1));' +
        'border-radius: 14px;' +
        'box-shadow: 0 25px 60px rgba(0,0,0,0.35);' +
        'display: flex; flex-direction: column;' +
        'overflow: hidden;' +
        'color: var(--nano-text, #e2e8f0);' +
      '}' +
      '.pm-command-search-wrap {' +
        'display: flex; align-items: center; gap: 10px;' +
        'padding: 14px 18px;' +
        'border-bottom: 1px solid var(--nano-border, rgba(255,255,255,0.08));' +
      '}' +
      '.pm-command-search-icon { opacity: 0.5; font-size: 0.95rem; }' +
      '.pm-command-input {' +
        'flex: 1; background: transparent; border: none; outline: none;' +
        'font-size: 1rem; color: inherit;' +
        'font-family: inherit;' +
      '}' +
      '.pm-command-input::placeholder { color: var(--nano-muted, rgba(148,163,184,0.6)); }' +
      '.pm-command-kbd {' +
        'font-size: 0.7rem; padding: 2px 6px;' +
        'border-radius: 4px;' +
        'background: rgba(255,255,255,0.08);' +
        'border: 1px solid rgba(255,255,255,0.12);' +
        'color: var(--nano-muted, #94a3b8);' +
        'font-family: inherit;' +
      '}' +
      '.pm-command-list {' +
        'list-style: none; margin: 0; padding: 6px 0;' +
        'overflow-y: auto; max-height: 300px;' +
        'flex: 1;' +
      '}' +
      '.pm-command-item {' +
        'display: flex; align-items: center; gap: 12px;' +
        'padding: 9px 18px; cursor: pointer;' +
        'transition: background 0.12s ease;' +
        'font-size: 0.9rem;' +
      '}' +
      '.pm-command-item:hover, .pm-command-item--active {' +
        'background: var(--pm-accent, rgba(26,115,232,0.15)) !important;' +
      '}' +
      '.pm-command-item--active {' +
        'background: rgba(26,115,232,0.18) !important;' +
      '}' +
      '.pm-command-item-icon { width: 20px; text-align: center; opacity: 0.7; font-size: 0.85rem; }' +
      '.pm-command-item-label { flex: 1; }' +
      '.pm-command-match { background: rgba(250,204,21,0.25); color: inherit; border-radius: 2px; padding: 0 1px; }' +
      '.pm-command-item-shortcut {' +
        'font-size: 0.68rem; padding: 2px 6px;' +
        'border-radius: 4px;' +
        'background: rgba(255,255,255,0.06);' +
        'border: 1px solid rgba(255,255,255,0.1);' +
        'color: var(--nano-muted, #94a3b8);' +
        'font-family: inherit;' +
      '}' +
      '.pm-command-empty {' +
        'padding: 20px 18px; text-align: center;' +
        'color: var(--nano-muted, #94a3b8); font-size: 0.88rem;' +
      '}' +
      '.pm-command-footer {' +
        'display: flex; gap: 16px; justify-content: center;' +
        'padding: 8px 18px;' +
        'border-top: 1px solid var(--nano-border, rgba(255,255,255,0.08));' +
        'font-size: 0.7rem;' +
        'color: var(--nano-muted, #94a3b8);' +
      '}' +
      '.pm-command-footer kbd {' +
        'font-size: 0.65rem; padding: 1px 4px;' +
        'border-radius: 3px;' +
        'background: rgba(255,255,255,0.06);' +
        'border: 1px solid rgba(255,255,255,0.1);' +
        'font-family: inherit; margin: 0 2px;' +
      '}' +

      /* Sol (light) mode adjustments */
      '.appearance-light .pm-command-box {' +
        'background: rgba(255,255,255,0.97);' +
        'border-color: rgba(0,0,0,0.12);' +
        'color: #1e293b;' +
      '}' +
      '.appearance-light .pm-command-backdrop {' +
        'background: rgba(0,0,0,0.25);' +
      '}' +
      '.appearance-light .pm-command-input { color: #1e293b; }' +
      '.appearance-light .pm-command-item:hover,' +
      '.appearance-light .pm-command-item--active {' +
        'background: rgba(26,115,232,0.08) !important;' +
      '}' +
      '.appearance-light .pm-command-match { background: rgba(250,204,21,0.35); }' +
      '.appearance-light .pm-command-kbd,' +
      '.appearance-light .pm-command-footer kbd,' +
      '.appearance-light .pm-command-item-shortcut {' +
        'background: rgba(0,0,0,0.05);' +
        'border-color: rgba(0,0,0,0.1);' +
        'color: #64748b;' +
      '}' +
      '.appearance-light .pm-command-search-wrap {' +
        'border-bottom-color: rgba(0,0,0,0.08);' +
      '}' +
      '.appearance-light .pm-command-footer {' +
        'border-top-color: rgba(0,0,0,0.08);' +
      '}' +

      /* ---- 10. Status bar ---- */
      '.pm-status-bar {' +
        'position: fixed; bottom: 0; left: 0; right: 0;' +
        'height: 26px; z-index: 9999;' +
        'display: flex; align-items: center; gap: 18px;' +
        'padding: 0 14px; font-size: 0.7rem;' +
        'background: var(--nano-surface-solid, rgba(15,23,42,0.92));' +
        'border-top: 1px solid var(--nano-border, rgba(255,255,255,0.06));' +
        'color: var(--nano-muted, #94a3b8);' +
        'font-family: inherit;' +
        'backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);' +
        'user-select: none;' +
      '}' +
      '.pm-status-item { display: flex; align-items: center; gap: 5px; white-space: nowrap; }' +
      '.pm-status-dot { font-size: 0.5rem; }' +
      '.pm-status-dot--online { color: #10b981; }' +
      '.pm-status-dot--offline { color: #ef4444; }' +
      '.pm-status-version { margin-left: auto; opacity: 0.6; }' +
      '.pm-status-cmd { cursor: pointer; opacity: 0.7; transition: opacity 0.15s ease; }' +
      '.pm-status-cmd:hover { opacity: 1; }' +
      '.pm-status-cmd kbd {' +
        'font-size: 0.62rem; padding: 1px 4px;' +
        'border-radius: 3px;' +
        'background: rgba(255,255,255,0.06);' +
        'border: 1px solid rgba(255,255,255,0.1);' +
        'font-family: inherit;' +
      '}' +

      /* Sol (light) mode status bar */
      '.appearance-light .pm-status-bar {' +
        'background: rgba(255,255,255,0.95);' +
        'border-top-color: rgba(0,0,0,0.08);' +
        'color: #64748b;' +
      '}' +
      '.appearance-light .pm-status-cmd kbd {' +
        'background: rgba(0,0,0,0.05);' +
        'border-color: rgba(0,0,0,0.1);' +
      '}' +

      /* Prevent content from being hidden behind the status bar */
      '.content { padding-bottom: 32px !important; }' +

      /* reduced motion */
      '@media (prefers-reduced-motion: reduce) {' +
        '.pm-ripple-circle, .pm-modal-entering, .pm-modal-leaving,' +
        '.pm-overlay-entering, .pm-panel-entering, .pm-toast-enter,' +
        '.pm-command-entering .pm-command-box { animation: none !important; }' +
      '}';

    document.head.appendChild(style);
  })();

})();
