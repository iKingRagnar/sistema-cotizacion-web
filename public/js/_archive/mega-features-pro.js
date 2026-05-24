/* ════════════════════════════════════════════════════════════════════════
 * MEGA FEATURES PRO — Global search, confetti, shortcuts overlay,
 * toasts premium, bulk actions, quick filter chips
 * ════════════════════════════════════════════════════════════════════════ */
;(function () {
  'use strict';

  var REDUCED = window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function getToken() {
    return localStorage.getItem('cotizacion-auth-token') ||
           localStorage.getItem('token') || '';
  }

  function fetchJson(url) {
    return fetch(url, {
      headers: { 'Authorization': 'Bearer ' + getToken() },
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  /* ════════════════════════════════════════════════════════════════
   * 1. TOASTS PREMIUM — sistema rediseñado
   * ════════════════════════════════════════════════════════════════ */
  var Toasts = {
    container: null,
    init: function () {
      if (Toasts.container) return;
      var c = document.createElement('div');
      c.id = 'mega-toasts';
      c.className = 'mega-toasts';
      c.setAttribute('aria-live', 'polite');
      document.body.appendChild(c);
      Toasts.container = c;
    },
    show: function (msg, kind, opts) {
      Toasts.init();
      kind = kind || 'info';
      opts = opts || {};
      var icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle',
      };
      var t = document.createElement('div');
      t.className = 'mega-toast mega-toast--' + kind;
      t.innerHTML =
        '<i class="fas ' + (icons[kind] || icons.info) + ' mega-toast__icon" aria-hidden="true"></i>' +
        '<div class="mega-toast__body">' +
          (opts.title ? '<div class="mega-toast__title">' + escapeHtml(opts.title) + '</div>' : '') +
          '<div class="mega-toast__msg">' + escapeHtml(msg) + '</div>' +
        '</div>' +
        '<button class="mega-toast__close" aria-label="Cerrar">×</button>';
      Toasts.container.appendChild(t);

      var dismiss = function () {
        t.classList.add('is-leaving');
        setTimeout(function () { try { t.remove(); } catch (_) {} }, 260);
      };
      t.querySelector('.mega-toast__close').addEventListener('click', dismiss);
      t.addEventListener('click', function (e) {
        if (e.target.tagName !== 'BUTTON') dismiss();
      });
      if (opts.duration !== 0) {
        setTimeout(dismiss, opts.duration || 4200);
      }
      return { dismiss: dismiss };
    },
  };
  window.MegaToast = Toasts;
  /* Override global showToast para que TODA la app use estos toasts */
  if (typeof window.showToast !== 'function' || !window.showToast.__megaWrapped) {
    var origToast = window.showToast;
    window.showToast = function (msg, kind, opts) {
      try { return Toasts.show(msg, kind, opts); }
      catch (_) { if (origToast) return origToast.apply(this, arguments); }
    };
    window.showToast.__megaWrapped = true;
  }

  /* ════════════════════════════════════════════════════════════════
   * 2. CONFETTI — particles caen al ejecutar acciones positivas
   * ════════════════════════════════════════════════════════════════ */
  var Confetti = {
    fire: function (opts) {
      if (REDUCED) return;
      opts = opts || {};
      var count = opts.count || 80;
      var origin = opts.origin || { x: 0.5, y: 0.4 };
      var colors = opts.colors || ['#3b82f6', '#8b5cf6', '#f59e0b', '#22c55e', '#ec4899'];
      var canvas = Confetti._canvas();
      var ctx = canvas.getContext('2d');
      var W = canvas.width = window.innerWidth;
      var H = canvas.height = window.innerHeight;
      var particles = [];
      for (var i = 0; i < count; i++) {
        particles.push({
          x: origin.x * W,
          y: origin.y * H,
          vx: (Math.random() - 0.5) * 14,
          vy: -(Math.random() * 10 + 8),
          g: 0.45,
          size: Math.random() * 8 + 4,
          color: colors[Math.floor(Math.random() * colors.length)],
          rot: Math.random() * Math.PI * 2,
          vrot: (Math.random() - 0.5) * 0.3,
          alpha: 1,
          shape: Math.random() < 0.5 ? 'rect' : 'circle',
        });
      }
      var startTime = performance.now();
      var duration = 2400;
      function loop(now) {
        var elapsed = now - startTime;
        ctx.clearRect(0, 0, W, H);
        var alive = false;
        particles.forEach(function (p) {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += p.g;
          p.rot += p.vrot;
          p.alpha = Math.max(0, 1 - elapsed / duration);
          if (p.y > H + 20 || p.alpha <= 0) return;
          alive = true;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color;
          if (p.shape === 'rect') {
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          } else {
            ctx.beginPath();
            ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        });
        if (alive && elapsed < duration) {
          requestAnimationFrame(loop);
        } else {
          ctx.clearRect(0, 0, W, H);
        }
      }
      requestAnimationFrame(loop);
    },
    _canvas: function () {
      var c = document.getElementById('mega-confetti-canvas');
      if (c) return c;
      c = document.createElement('canvas');
      c.id = 'mega-confetti-canvas';
      c.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none';
      document.body.appendChild(c);
      return c;
    },
  };
  window.MegaConfetti = Confetti;

  /* Auto-fire confetti en POST exitosos a endpoints de "creación" */
  function hookFetchForConfetti() {
    var origFetch = window.fetch;
    var triggers = [
      /\/api\/clientes(\?|$)/,
      /\/api\/cotizaciones(\?|$)/,
      /\/api\/prospectos(\?|$)/,
      /\/api\/incidentes(\?|$)/,
      /\/api\/garantias(\?|$)/,
    ];
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var method = (init && init.method || (input && input.method) || 'GET').toUpperCase();
      var p = origFetch.apply(this, arguments);
      if (method === 'POST' && triggers.some(function (rx) { return rx.test(url); })) {
        p.then(function (r) {
          if (r && r.ok) {
            setTimeout(function () { Confetti.fire(); }, 100);
          }
        }).catch(function () {});
      }
      return p;
    };
  }

  /* ════════════════════════════════════════════════════════════════
   * 3. KEYBOARD SHORTCUTS OVERLAY (presionar ?)
   * ════════════════════════════════════════════════════════════════ */
  var Shortcuts = {
    list: [
      { keys: ['Ctrl', 'K'], desc: 'Abrir paleta de comandos' },
      { keys: ['/'], desc: 'Abrir DavAI (asistente IA)' },
      { keys: ['Shift', 'T'], desc: 'Cambiar tema (claro/oscuro)' },
      { keys: ['Shift', 'R'], desc: 'Recargar página' },
      { keys: ['?'], desc: 'Mostrar esta ayuda' },
      { keys: ['Esc'], desc: 'Cerrar modales / cancelar' },
      { keys: ['Ctrl', '1-9'], desc: 'Ir al panel N' },
      { keys: ['Ctrl', 'V'], desc: 'Pegar tabla desde Excel (preview)' },
      { keys: ['↑', '↓'], desc: 'Navegar opciones (en Cmd+K)' },
      { keys: ['Enter'], desc: 'Ejecutar opción seleccionada' },
    ],
    show: function () {
      var existing = document.getElementById('mega-shortcuts-modal');
      if (existing) { existing.remove(); return; }
      var wrap = document.createElement('div');
      wrap.id = 'mega-shortcuts-modal';
      wrap.className = 'mega-shortcuts-modal';
      var html =
        '<div class="mega-shortcuts__panel">' +
          '<div class="mega-shortcuts__header">' +
            '<h2><i class="fas fa-keyboard"></i> Atajos de teclado</h2>' +
            '<button class="mega-shortcuts__close" aria-label="Cerrar">×</button>' +
          '</div>' +
          '<ul class="mega-shortcuts__list">' +
            Shortcuts.list.map(function (s) {
              var keys = s.keys.map(function (k) { return '<kbd>' + escapeHtml(k) + '</kbd>'; }).join('<span class="mega-shortcuts__plus">+</span>');
              return '<li><div class="mega-shortcuts__keys">' + keys + '</div>' +
                     '<div class="mega-shortcuts__desc">' + escapeHtml(s.desc) + '</div></li>';
            }).join('') +
          '</ul>' +
          '<div class="mega-shortcuts__footer">' +
            '<span>Presiona <kbd>?</kbd> en cualquier momento para ver esto</span>' +
            '<span>· <kbd>Esc</kbd> para cerrar</span>' +
          '</div>' +
        '</div>';
      wrap.innerHTML = html;
      document.body.appendChild(wrap);
      requestAnimationFrame(function () { wrap.classList.add('is-open'); });
      var close = function () {
        wrap.classList.remove('is-open');
        setTimeout(function () { try { wrap.remove(); } catch (_) {} }, 220);
      };
      wrap.querySelector('.mega-shortcuts__close').addEventListener('click', close);
      wrap.addEventListener('click', function (e) {
        if (e.target === wrap) close();
      });
      document.addEventListener('keydown', function escListen (e) {
        if (e.key === 'Escape') {
          close();
          document.removeEventListener('keydown', escListen);
        }
      });
    },
  };
  window.MegaShortcuts = Shortcuts;

  /* Bind ? para mostrar */
  document.addEventListener('keydown', function (e) {
    var inField = e.target.matches && e.target.matches('input, textarea, [contenteditable]');
    if (!inField && e.key === '?' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      Shortcuts.show();
    }
  });

  /* ════════════════════════════════════════════════════════════════
   * 4. CMD+K GLOBAL SEARCH — extender el palette con búsqueda en datos
   * ════════════════════════════════════════════════════════════════ */
  var GlobalSearch = {
    cache: { clientes: [], cotizaciones: [], prospectos: [] },
    cacheStamp: 0,
    CACHE_TTL: 60000, /* 1 min */

    refresh: function () {
      var now = Date.now();
      if (now - GlobalSearch.cacheStamp < GlobalSearch.CACHE_TTL) return Promise.resolve();
      GlobalSearch.cacheStamp = now;
      var promises = [
        fetchJson('/api/clientes').catch(function () { return []; }),
        fetchJson('/api/cotizaciones').catch(function () { return []; }),
        fetchJson('/api/prospectos').catch(function () { return []; }),
      ];
      return Promise.all(promises).then(function (results) {
        GlobalSearch.cache.clientes = (results[0] || []).slice(0, 200);
        GlobalSearch.cache.cotizaciones = (results[1] || []).slice(0, 200);
        GlobalSearch.cache.prospectos = (results[2] || []).slice(0, 200);
      });
    },

    asCommands: function (query) {
      query = (query || '').toLowerCase().trim();
      if (!query || query.length < 2) return [];
      var results = [];

      /* Clientes */
      GlobalSearch.cache.clientes.forEach(function (c) {
        var hay = ((c.nombre || '') + ' ' + (c.rfc || '') + ' ' + (c.contacto || '')).toLowerCase();
        if (hay.indexOf(query) !== -1) {
          results.push({
            id: 'cli-' + c.id,
            title: c.nombre || 'Cliente #' + c.id,
            desc: 'Cliente · ' + (c.rfc || 'sin RFC') + (c.contacto ? ' · ' + c.contacto : ''),
            icon: '<i class="fas fa-building"></i>',
            group: 'Clientes',
            keywords: hay,
            action: function () {
              var btn = document.querySelector('[data-tab="clientes"]');
              if (btn) btn.click();
              setTimeout(function () {
                var input = document.querySelector('#tabla-clientes input[data-key="nombre"]');
                if (input) { input.value = c.nombre; input.dispatchEvent(new Event('input', { bubbles: true })); }
              }, 400);
            },
          });
        }
      });

      /* Cotizaciones */
      GlobalSearch.cache.cotizaciones.forEach(function (q) {
        var hay = ((q.folio || '') + ' ' + (q.cliente_nombre || '') + ' ' + (q.tipo || '')).toLowerCase();
        if (hay.indexOf(query) !== -1) {
          var total = (q.total || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
          results.push({
            id: 'cot-' + q.id,
            title: q.folio || 'Cotización #' + q.id,
            desc: 'Cotización · ' + (q.cliente_nombre || '') + ' · ' + total,
            icon: '<i class="fas fa-file-invoice-dollar"></i>',
            group: 'Cotizaciones',
            keywords: hay,
            action: function () {
              var btn = document.querySelector('[data-tab="cotizaciones"]');
              if (btn) btn.click();
              setTimeout(function () {
                var input = document.querySelector('#tabla-cotizaciones input[data-key="folio"]');
                if (input) { input.value = q.folio; input.dispatchEvent(new Event('input', { bubbles: true })); }
              }, 400);
            },
          });
        }
      });

      /* Prospectos */
      GlobalSearch.cache.prospectos.forEach(function (p) {
        var hay = ((p.empresa || '') + ' ' + (p.estado || '') + ' ' + (p.industria || '')).toLowerCase();
        if (hay.indexOf(query) !== -1) {
          results.push({
            id: 'pro-' + p.id,
            title: p.empresa || 'Prospecto #' + p.id,
            desc: 'Prospecto · ' + (p.estado || '') + (p.industria ? ' · ' + p.industria : ''),
            icon: '<i class="fas fa-user-tie"></i>',
            group: 'Prospectos',
            keywords: hay,
            action: function () {
              var btn = document.querySelector('[data-tab="prospeccion"]');
              if (btn) btn.click();
            },
          });
        }
      });

      return results.slice(0, 30);
    },
  };
  window.MegaSearch = GlobalSearch;

  /* Hook al render del cmdk: añadir resultados de búsqueda global */
  function patchCmdkSearch() {
    /* Si ya está hookeado, skip */
    if (window.__megaCmdkPatched) return;
    if (!window.MegaCmdk || typeof window.MegaCmdk.open !== 'function') {
      setTimeout(patchCmdkSearch, 500);
      return;
    }
    window.__megaCmdkPatched = true;

    /* Cuando se abre el cmdk, refresca cache (en background) */
    var origOpen = window.MegaCmdk.open;
    window.MegaCmdk.open = function () {
      GlobalSearch.refresh();
      return origOpen.apply(this, arguments);
    };

    /* Hook al input para añadir search results dinámicos */
    document.addEventListener('input', function (e) {
      if (!e.target || e.target.id !== 'cmdk-input') return;
      var query = e.target.value.trim();
      if (query.length < 2) return;
      /* Re-render cmdk con results extra: usamos su propio renderCmdkList vía MutationObserver */
      setTimeout(function () {
        var list = document.getElementById('cmdk-list');
        if (!list || list.querySelector('.cmdk__group-label[data-mega-injected]')) return;
        var extras = GlobalSearch.asCommands(query);
        if (!extras.length) return;
        /* Append section "Resultados" al final */
        var grouped = {};
        extras.forEach(function (it) {
          if (!grouped[it.group]) grouped[it.group] = [];
          grouped[it.group].push(it);
        });
        var existingItemsCount = list.querySelectorAll('.cmdk__item').length;
        var html = '';
        Object.keys(grouped).forEach(function (gn) {
          html += '<div class="cmdk__group-label" data-mega-injected="1"><i class="fas fa-search" style="margin-right:6px;opacity:0.6"></i>' + escapeHtml(gn) + '</div>';
          grouped[gn].forEach(function (it) {
            var idx = existingItemsCount++;
            html += '<div class="cmdk__item" data-idx="' + idx + '" data-mega-search="1" role="option">' +
              '<div class="cmdk__item-icon">' + (it.icon || '<i class="fas fa-search"></i>') + '</div>' +
              '<div class="cmdk__item-content">' +
                '<div class="cmdk__item-title">' + escapeHtml(it.title) + '</div>' +
                '<div class="cmdk__item-desc">' + escapeHtml(it.desc) + '</div>' +
              '</div>' +
            '</div>';
          });
        });
        var div = document.createElement('div');
        div.innerHTML = html;
        while (div.firstChild) list.appendChild(div.firstChild);

        /* Bind click a los nuevos items */
        list.querySelectorAll('.cmdk__item[data-mega-search="1"]:not([data-bound])').forEach(function (el, i) {
          el.setAttribute('data-bound', '1');
          var item = extras[i];
          el.addEventListener('click', function () {
            window.MegaCmdk.close();
            setTimeout(function () { try { item.action(); } catch (_) {} }, 50);
          });
        });
      }, 50);
    });
  }

  /* ════════════════════════════════════════════════════════════════
   * 5. BULK ACTIONS — checkbox de selección + barra flotante
   * ════════════════════════════════════════════════════════════════ */
  var Bulk = {
    selected: new Set(),
    activeTable: null,

    inject: function (table) {
      if (!table || table.dataset.bulkInjected) return;
      if (!table.classList.contains('data-table')) return;
      table.dataset.bulkInjected = '1';

      /* Header checkbox */
      var thead = table.querySelector('thead tr:first-child');
      if (thead && !thead.querySelector('.bulk-check-th')) {
        var th = document.createElement('th');
        th.className = 'bulk-check-th';
        th.innerHTML = '<input type="checkbox" class="bulk-check-all" aria-label="Seleccionar todos">';
        thead.insertBefore(th, thead.firstChild);

        /* Filter row si existe → añadir td vacío al inicio */
        var filterRow = table.querySelector('thead tr.filter-row');
        if (filterRow && !filterRow.querySelector('.bulk-check-td')) {
          var td = document.createElement('td');
          td.className = 'bulk-check-td';
          filterRow.insertBefore(td, filterRow.firstChild);
        }

        th.querySelector('.bulk-check-all').addEventListener('change', function (e) {
          var checked = e.target.checked;
          table.querySelectorAll('tbody tr .bulk-check').forEach(function (cb) {
            cb.checked = checked;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
          });
        });
      }

      /* Body checkboxes — observer para nuevas filas */
      var addRowChecks = function () {
        table.querySelectorAll('tbody tr:not([data-bulk-injected])').forEach(function (tr) {
          if (tr.classList.contains('empty-row') || tr.classList.contains('no-data')) return;
          tr.dataset.bulkInjected = '1';
          var td = document.createElement('td');
          td.className = 'bulk-check-td';
          td.innerHTML = '<input type="checkbox" class="bulk-check" aria-label="Seleccionar fila">';
          tr.insertBefore(td, tr.firstChild);
          td.querySelector('.bulk-check').addEventListener('change', function (e) {
            tr.classList.toggle('is-bulk-selected', e.target.checked);
            Bulk.update(table);
          });
        });
      };
      addRowChecks();
      var bodyObs = new MutationObserver(addRowChecks);
      bodyObs.observe(table.querySelector('tbody') || table, { childList: true });
    },

    update: function (table) {
      var selected = table.querySelectorAll('.bulk-check:checked').length;
      Bulk.activeTable = selected > 0 ? table : null;
      Bulk.renderBar(selected, table);
    },

    renderBar: function (count, table) {
      var bar = document.getElementById('mega-bulk-bar');
      if (count === 0) {
        if (bar) bar.classList.remove('is-open');
        return;
      }
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'mega-bulk-bar';
        bar.className = 'mega-bulk-bar';
        document.body.appendChild(bar);
      }
      var tableId = (table && table.id) || 'tabla';
      bar.innerHTML =
        '<div class="mega-bulk-bar__count">' +
          '<i class="fas fa-check-square"></i> ' +
          '<strong>' + count + '</strong> seleccionados' +
        '</div>' +
        '<div class="mega-bulk-bar__actions">' +
          '<button class="btn outline" data-bulk-action="clear">' +
            '<i class="fas fa-times"></i> Limpiar</button>' +
          '<button class="btn outline" data-bulk-action="export">' +
            '<i class="fas fa-download"></i> Exportar selección</button>' +
        '</div>';
      bar.classList.add('is-open');

      bar.querySelector('[data-bulk-action="clear"]').addEventListener('click', function () {
        if (Bulk.activeTable) {
          Bulk.activeTable.querySelectorAll('.bulk-check').forEach(function (cb) {
            cb.checked = false;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
          });
        }
      });
      bar.querySelector('[data-bulk-action="export"]').addEventListener('click', function () {
        Bulk.exportSelection();
      });
    },

    exportSelection: function () {
      if (!Bulk.activeTable) return;
      var rows = Bulk.activeTable.querySelectorAll('tbody tr.is-bulk-selected');
      if (!rows.length) { Toasts.show('Sin selecciones', 'warning'); return; }
      var headers = Array.from(Bulk.activeTable.querySelectorAll('thead tr:first-child th'))
        .filter(function (th) { return !th.classList.contains('bulk-check-th') && !th.classList.contains('th-actions'); })
        .map(function (th) { return (th.textContent || '').trim(); });
      var data = Array.from(rows).map(function (tr) {
        return Array.from(tr.querySelectorAll('td'))
          .filter(function (td) { return !td.classList.contains('bulk-check-td') && !td.classList.contains('actions') && !td.classList.contains('th-actions'); })
          .map(function (td) { return (td.textContent || '').trim().replace(/"/g, '""'); });
      });
      var csv = headers.join(',') + '\n' + data.map(function (row) {
        return row.map(function (c) { return '"' + c + '"'; }).join(',');
      }).join('\n');
      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'seleccion-' + (Bulk.activeTable.id || 'datos') + '-' + Date.now() + '.csv';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 500);
      Toasts.show('Selección exportada (' + rows.length + ' filas)', 'success');
    },

    init: function () {
      var setup = function () {
        document.querySelectorAll('table.data-table').forEach(Bulk.inject);
      };
      setup();
      var obs = new MutationObserver(function () {
        clearTimeout(window.__bulkDebounce);
        window.__bulkDebounce = setTimeout(setup, 600);
      });
      obs.observe(document.body, { childList: true, subtree: true });
    },
  };
  window.MegaBulk = Bulk;

  /* ════════════════════════════════════════════════════════════════
   * 6. QUICK FILTER CHIPS (botones rápidos sobre tablas relevantes)
   * ════════════════════════════════════════════════════════════════ */
  var QuickFilters = {
    presets: {
      'tabla-cotizaciones': [
        { label: 'Hoy', icon: 'fa-calendar-day', action: function () { QuickFilters.filterDate('tabla-cotizaciones', 'fecha', 0); } },
        { label: 'Esta semana', icon: 'fa-calendar-week', action: function () { QuickFilters.filterDate('tabla-cotizaciones', 'fecha', 7); } },
        { label: 'Este mes', icon: 'fa-calendar-alt', action: function () { QuickFilters.filterDate('tabla-cotizaciones', 'fecha', 30); } },
        { label: 'Limpiar', icon: 'fa-times', action: function () { QuickFilters.clear('tabla-cotizaciones'); } },
      ],
      'tabla-clientes': [
        { label: 'Con RFC', icon: 'fa-id-badge', action: function () { QuickFilters.setFilter('tabla-clientes', 'rfc', '*'); } },
        { label: 'Limpiar', icon: 'fa-times', action: function () { QuickFilters.clear('tabla-clientes'); } },
      ],
      'tabla-incidentes': [
        { label: 'Abiertos', icon: 'fa-folder-open', action: function () { QuickFilters.setFilter('tabla-incidentes', 'estatus', 'abierto'); } },
        { label: 'Críticos', icon: 'fa-exclamation', action: function () { QuickFilters.setFilter('tabla-incidentes', 'prioridad', 'critica'); } },
        { label: 'Limpiar', icon: 'fa-times', action: function () { QuickFilters.clear('tabla-incidentes'); } },
      ],
    },

    setFilter: function (tableId, key, value) {
      var input = document.querySelector('#' + tableId + ' input[data-key="' + key + '"]');
      if (input) {
        input.value = value === '*' ? '' : value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },

    clear: function (tableId) {
      document.querySelectorAll('#' + tableId + ' input.filter-input').forEach(function (i) {
        i.value = '';
        i.dispatchEvent(new Event('input', { bubbles: true }));
      });
    },

    filterDate: function (tableId, key, daysBack) {
      var d = new Date();
      if (daysBack > 0) d.setDate(d.getDate() - daysBack);
      var input = document.querySelector('#' + tableId + ' input[data-key="' + key + '"]');
      if (input) {
        input.value = d.toISOString().slice(0, 10);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },

    inject: function (tableId) {
      var presets = QuickFilters.presets[tableId];
      if (!presets) return;
      var table = document.getElementById(tableId);
      if (!table) return;
      var wrap = table.closest('.table-wrap');
      if (!wrap || wrap.dataset.chipsInjected) return;
      wrap.dataset.chipsInjected = '1';

      var bar = document.createElement('div');
      bar.className = 'mega-quick-chips';
      bar.innerHTML = presets.map(function (p, i) {
        return '<button type="button" class="mega-chip" data-i="' + i + '">' +
          '<i class="fas ' + p.icon + '"></i> ' + escapeHtml(p.label) +
        '</button>';
      }).join('');
      wrap.parentNode.insertBefore(bar, wrap);
      bar.querySelectorAll('.mega-chip').forEach(function (b, i) {
        b.addEventListener('click', function () {
          presets[i].action();
        });
      });
    },

    init: function () {
      var setup = function () {
        Object.keys(QuickFilters.presets).forEach(QuickFilters.inject);
      };
      setup();
      var obs = new MutationObserver(function () {
        clearTimeout(window.__chipsDebounce);
        window.__chipsDebounce = setTimeout(setup, 600);
      });
      obs.observe(document.body, { childList: true, subtree: true });
    },
  };

  /* ════════════════════════════════════════════════════════════════
   * Helpers
   * ════════════════════════════════════════════════════════════════ */
  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  /* ════════════════════════════════════════════════════════════════
   * BOOT
   * ════════════════════════════════════════════════════════════════ */
  function boot() {
    Toasts.init();
    hookFetchForConfetti();
    patchCmdkSearch();
    Bulk.init();
    QuickFilters.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
