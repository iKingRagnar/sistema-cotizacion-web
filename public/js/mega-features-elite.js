/* ════════════════════════════════════════════════════════════════════════
 * MEGA FEATURES ELITE — Focus mode, Saved views, Inline edit,
 * Activity drawer, Smart undo, Keyboard nav tablas
 * ════════════════════════════════════════════════════════════════════════ */
;(function () {
  'use strict';

  function getToken() {
    return localStorage.getItem('cotizacion-auth-token') ||
           localStorage.getItem('token') || '';
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  function toast(msg, kind, opts) {
    if (window.MegaToast && window.MegaToast.show) {
      return window.MegaToast.show(msg, kind, opts);
    }
    if (window.showToast) return window.showToast(msg, kind);
  }

  /* ════════════════════════════════════════════════════════════════
   * 1. FOCUS MODE — F toggle, oculta sidebar y header
   * ════════════════════════════════════════════════════════════════ */
  var Focus = {
    KEY: 'cotizacion-focus-mode',
    active: false,

    init: function () {
      try { Focus.active = localStorage.getItem(Focus.KEY) === '1'; } catch (_) {}
      if (Focus.active) document.body.classList.add('focus-mode');
      Focus.injectButton();
    },

    toggle: function () {
      Focus.active = !Focus.active;
      document.body.classList.toggle('focus-mode', Focus.active);
      try { localStorage.setItem(Focus.KEY, Focus.active ? '1' : '0'); } catch (_) {}
      toast(Focus.active ? 'Modo enfoque activado (F para salir)' : 'Modo enfoque desactivado',
            Focus.active ? 'success' : 'info');
    },

    injectButton: function () {
      if (document.querySelector('.focus-mode-toggle')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'focus-mode-toggle';
      btn.title = 'Modo enfoque (F)';
      btn.setAttribute('aria-label', 'Activar modo enfoque');
      btn.innerHTML = '<i class="fas fa-expand-arrows-alt"></i>';
      btn.addEventListener('click', Focus.toggle);

      var density = document.querySelector('.density-toggle');
      var theme = document.querySelector('.theme-switcher');
      var ref = density || theme;
      if (ref && ref.parentNode) {
        ref.parentNode.insertBefore(btn, ref);
        return;
      }
      var header = document.querySelector('.header-inner') ||
                   document.querySelector('header');
      if (header) header.appendChild(btn);
    },

    bindKey: function () {
      document.addEventListener('keydown', function (e) {
        var inField = e.target.matches && e.target.matches('input, textarea, [contenteditable]');
        if (inField) return;
        if (e.key === 'f' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          Focus.toggle();
        }
      });
    },
  };
  window.MegaFocus = Focus;

  /* ════════════════════════════════════════════════════════════════
   * 2. SAVED VIEWS — guardar filtros por tabla con nombre
   * ════════════════════════════════════════════════════════════════ */
  var SavedViews = {
    KEY_PREFIX: 'cotizacion-saved-view-',

    list: function (tableId) {
      try {
        var raw = localStorage.getItem(SavedViews.KEY_PREFIX + tableId);
        return raw ? JSON.parse(raw) : [];
      } catch (_) { return []; }
    },

    save: function (tableId, name, filters) {
      var views = SavedViews.list(tableId);
      var existing = views.findIndex(function (v) { return v.name === name; });
      var entry = { name: name, filters: filters, ts: Date.now() };
      if (existing >= 0) views[existing] = entry; else views.push(entry);
      try { localStorage.setItem(SavedViews.KEY_PREFIX + tableId, JSON.stringify(views)); } catch (_) {}
      SavedViews.renderUI(tableId);
    },

    remove: function (tableId, name) {
      var views = SavedViews.list(tableId).filter(function (v) { return v.name !== name; });
      try { localStorage.setItem(SavedViews.KEY_PREFIX + tableId, JSON.stringify(views)); } catch (_) {}
      SavedViews.renderUI(tableId);
    },

    apply: function (tableId, view) {
      var inputs = document.querySelectorAll('#' + tableId + ' input.filter-input');
      inputs.forEach(function (inp) {
        var key = inp.getAttribute('data-key');
        var v = view.filters[key] || '';
        inp.value = v;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      });
    },

    captureCurrent: function (tableId) {
      var filters = {};
      document.querySelectorAll('#' + tableId + ' input.filter-input').forEach(function (inp) {
        var key = inp.getAttribute('data-key');
        if (key && inp.value) filters[key] = inp.value;
      });
      return filters;
    },

    promptSave: function (tableId) {
      var current = SavedViews.captureCurrent(tableId);
      if (Object.keys(current).length === 0) {
        toast('No hay filtros activos para guardar', 'warning');
        return;
      }
      var name = window.prompt('Nombre de la vista:');
      if (!name || !name.trim()) return;
      SavedViews.save(tableId, name.trim(), current);
      toast('Vista "' + name + '" guardada', 'success');
    },

    renderUI: function (tableId) {
      var table = document.getElementById(tableId);
      if (!table) return;
      var wrap = table.closest('.table-wrap');
      if (!wrap) return;
      var existing = wrap.parentNode.querySelector('.mega-saved-views[data-for="' + tableId + '"]');
      if (existing) existing.remove();

      var views = SavedViews.list(tableId);
      var container = document.createElement('div');
      container.className = 'mega-saved-views';
      container.setAttribute('data-for', tableId);

      var html = '<i class="fas fa-bookmark mega-saved-views__icon"></i>' +
        '<span class="mega-saved-views__label">Vistas:</span>';
      if (views.length === 0) {
        html += '<span class="mega-saved-views__empty">ninguna guardada</span>';
      } else {
        views.forEach(function (v, i) {
          html += '<button class="mega-saved-view-chip" data-i="' + i + '">' +
            '<i class="fas fa-bookmark"></i> ' + escapeHtml(v.name) +
            '<span class="mega-saved-view-chip__close" data-i="' + i + '" title="Eliminar">×</span>' +
          '</button>';
        });
      }
      html += '<button class="mega-saved-view-add" title="Guardar vista actual">' +
        '<i class="fas fa-plus"></i> Guardar vista</button>';
      container.innerHTML = html;

      var insertBefore = wrap.parentNode.querySelector('.mega-quick-chips') || wrap;
      wrap.parentNode.insertBefore(container, insertBefore);

      container.querySelectorAll('.mega-saved-view-chip').forEach(function (b) {
        b.addEventListener('click', function (e) {
          if (e.target.classList.contains('mega-saved-view-chip__close')) return;
          var i = parseInt(b.getAttribute('data-i'), 10);
          var v = views[i];
          SavedViews.apply(tableId, v);
          toast('Vista "' + v.name + '" aplicada', 'info');
        });
      });
      container.querySelectorAll('.mega-saved-view-chip__close').forEach(function (x) {
        x.addEventListener('click', function (e) {
          e.stopPropagation();
          var i = parseInt(x.getAttribute('data-i'), 10);
          if (window.confirm('¿Eliminar vista "' + views[i].name + '"?')) {
            SavedViews.remove(tableId, views[i].name);
          }
        });
      });
      container.querySelector('.mega-saved-view-add').addEventListener('click', function () {
        SavedViews.promptSave(tableId);
      });
    },

    init: function () {
      var setup = function () {
        document.querySelectorAll('table.data-table').forEach(function (t) {
          if (t.id && !t.dataset.viewsInjected) {
            t.dataset.viewsInjected = '1';
            SavedViews.renderUI(t.id);
          }
        });
      };
      setup();
      var obs = new MutationObserver(function () {
        clearTimeout(window.__viewsDebounce);
        window.__viewsDebounce = setTimeout(setup, 800);
      });
      obs.observe(document.body, { childList: true, subtree: true });
    },
  };
  window.MegaSavedViews = SavedViews;

  /* ════════════════════════════════════════════════════════════════
   * 3. INLINE QUICK EDIT — doble-click en celda
   * ════════════════════════════════════════════════════════════════ */
  var InlineEdit = {
    EDITABLE_COLS: {
      /* tableId → array de data-key permitidos para inline edit */
      'tabla-clientes': ['nombre', 'rfc', 'email', 'telefono', 'ciudad'],
      'tabla-prospectos': ['empresa', 'estado', 'industria'],
    },
    API_PATCH_BASE: '/api/',

    init: function () {
      document.addEventListener('dblclick', function (e) {
        var td = e.target.closest('td');
        if (!td) return;
        var tr = td.closest('tr');
        var table = td.closest('table.data-table');
        if (!table || !table.id) return;
        if (td.classList.contains('actions') || td.classList.contains('th-actions')) return;
        if (td.classList.contains('bulk-check-td')) return;
        if (td.querySelector('.mega-inline-edit')) return;
        if (tr && (tr.classList.contains('empty-row') || tr.classList.contains('no-data'))) return;
        InlineEdit.activate(td, table.id, tr);
      });
    },

    activate: function (td, tableId, tr) {
      var original = td.textContent.trim();
      var input = document.createElement('input');
      input.className = 'mega-inline-edit';
      input.type = 'text';
      input.value = original;
      td.innerHTML = '';
      td.appendChild(input);
      input.focus();
      input.select();

      var save = function () {
        var newVal = input.value.trim();
        if (newVal === original) {
          td.textContent = original;
          return;
        }
        td.textContent = newVal;
        td.classList.add('mega-inline-saved');
        toast('Cambio local aplicado. (Recarga del API requiere endpoint específico)', 'info');
        setTimeout(function () { td.classList.remove('mega-inline-saved'); }, 1500);
      };
      var cancel = function () { td.textContent = original; };

      input.addEventListener('blur', save);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { cancel(); input.removeEventListener('blur', save); }
      });
    },
  };
  window.MegaInlineEdit = InlineEdit;

  /* ════════════════════════════════════════════════════════════════
   * 4. ACTIVITY DRAWER — feed lateral derecho
   * ════════════════════════════════════════════════════════════════ */
  var Activity = {
    feed: [],
    drawer: null,

    init: function () {
      Activity.injectButton();
      Activity.hookFetch();
    },

    hookFetch: function () {
      var origFetch = window.fetch;
      window.fetch = function (input, init) {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var method = (init && init.method || (input && input.method) || 'GET').toUpperCase();
        var p = origFetch.apply(this, arguments);
        if (['POST', 'PUT', 'DELETE', 'PATCH'].indexOf(method) !== -1 && url.indexOf('/api/') !== -1) {
          p.then(function (r) {
            Activity.log({
              method: method,
              url: url.replace(/^https?:\/\/[^/]+/, '').slice(0, 80),
              ok: r && r.ok,
              status: r && r.status,
              ts: Date.now(),
            });
          }).catch(function () {
            Activity.log({ method: method, url: url, ok: false, ts: Date.now() });
          });
        }
        return p;
      };
    },

    log: function (entry) {
      Activity.feed.unshift(entry);
      if (Activity.feed.length > 50) Activity.feed = Activity.feed.slice(0, 50);
      var btn = document.querySelector('.activity-drawer-btn');
      if (btn) {
        var badge = btn.querySelector('.activity-drawer-btn__badge');
        if (badge) {
          badge.textContent = Activity.feed.length;
          badge.style.display = 'flex';
        }
      }
      Activity.renderFeed();
    },

    injectButton: function () {
      if (document.querySelector('.activity-drawer-btn')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'activity-drawer-btn';
      btn.title = 'Actividad reciente';
      btn.setAttribute('aria-label', 'Abrir actividad reciente');
      btn.innerHTML = '<i class="fas fa-history"></i>' +
        '<span class="activity-drawer-btn__badge" style="display:none">0</span>';
      btn.addEventListener('click', Activity.toggle);

      var ref = document.querySelector('.focus-mode-toggle') ||
                document.querySelector('.density-toggle') ||
                document.querySelector('.theme-switcher');
      if (ref && ref.parentNode) {
        ref.parentNode.insertBefore(btn, ref);
        return;
      }
      var header = document.querySelector('.header-inner') ||
                   document.querySelector('header');
      if (header) header.appendChild(btn);
    },

    toggle: function () {
      if (!Activity.drawer) Activity.build();
      Activity.drawer.classList.toggle('is-open');
      Activity.renderFeed();
    },

    build: function () {
      var d = document.createElement('aside');
      d.className = 'activity-drawer';
      d.innerHTML =
        '<div class="activity-drawer__header">' +
          '<h3><i class="fas fa-history"></i> Actividad reciente</h3>' +
          '<button class="activity-drawer__close" aria-label="Cerrar">×</button>' +
        '</div>' +
        '<div class="activity-drawer__feed"></div>' +
        '<div class="activity-drawer__footer">' +
          '<button class="activity-drawer__clear">Limpiar feed</button>' +
        '</div>';
      document.body.appendChild(d);
      Activity.drawer = d;
      d.querySelector('.activity-drawer__close').addEventListener('click', Activity.toggle);
      d.querySelector('.activity-drawer__clear').addEventListener('click', function () {
        Activity.feed = [];
        Activity.renderFeed();
        var badge = document.querySelector('.activity-drawer-btn__badge');
        if (badge) badge.style.display = 'none';
      });
    },

    renderFeed: function () {
      if (!Activity.drawer) return;
      var feed = Activity.drawer.querySelector('.activity-drawer__feed');
      if (Activity.feed.length === 0) {
        feed.innerHTML = '<div class="activity-drawer__empty">' +
          '<i class="fas fa-clock"></i><br>Sin actividad aún. ' +
          'Las acciones (crear, editar, borrar) aparecerán aquí.</div>';
        return;
      }
      feed.innerHTML = Activity.feed.map(function (e) {
        var icons = { GET: 'fa-eye', POST: 'fa-plus', PUT: 'fa-edit', PATCH: 'fa-edit', DELETE: 'fa-trash' };
        var colors = { POST: '#22c55e', PUT: '#3b82f6', PATCH: '#3b82f6', DELETE: '#ef4444' };
        var color = colors[e.method] || '#94a3b8';
        var time = new Date(e.ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        return '<div class="activity-drawer__item ' + (e.ok ? 'is-ok' : 'is-fail') + '">' +
          '<i class="fas ' + (icons[e.method] || 'fa-circle') + '" style="color:' + color + '"></i>' +
          '<div class="activity-drawer__item-body">' +
            '<div class="activity-drawer__item-title">' + e.method + ' <code>' + escapeHtml(e.url) + '</code></div>' +
            '<div class="activity-drawer__item-meta">' + time + (e.status ? ' · ' + e.status : '') + (e.ok ? ' · OK' : ' · falló') + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    },
  };
  window.MegaActivity = Activity;

  /* ════════════════════════════════════════════════════════════════
   * 5. SMART UNDO TOAST — después de DELETE
   * ════════════════════════════════════════════════════════════════ */
  var Undo = {
    pendingActions: new Map(),

    init: function () {
      var origFetch = window.fetch;
      window.fetch = function (input, init) {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var method = (init && init.method || (input && input.method) || 'GET').toUpperCase();
        var p = origFetch.apply(this, arguments);
        if (method === 'DELETE' && url.indexOf('/api/') !== -1) {
          p.then(function (r) {
            if (r && r.ok) {
              setTimeout(function () { Undo.showUndo(url); }, 200);
            }
          }).catch(function () {});
        }
        return p;
      };
    },

    showUndo: function (url) {
      var match = url.match(/\/api\/([^/?]+)\/(\d+)/);
      var resource = match ? match[1] : 'recurso';
      var id = match ? match[2] : '?';
      var resourceLabels = {
        'clientes': 'cliente',
        'cotizaciones': 'cotización',
        'prospectos': 'prospecto',
        'incidentes': 'incidente',
        'garantias': 'garantía',
        'refacciones': 'refacción',
        'maquinas': 'máquina',
      };
      var label = resourceLabels[resource] || resource;
      if (!window.MegaToast) return;
      var t = window.MegaToast.show(
        'El ' + label + ' #' + id + ' fue eliminado.',
        'warning',
        { title: 'Eliminado', duration: 8000 }
      );
      /* Inyectar botón "Deshacer" en el toast */
      setTimeout(function () {
        var toasts = document.querySelectorAll('.mega-toast--warning');
        var lastToast = toasts[toasts.length - 1];
        if (!lastToast) return;
        var body = lastToast.querySelector('.mega-toast__body');
        if (body && !body.querySelector('.mega-undo-btn')) {
          var btn = document.createElement('button');
          btn.className = 'mega-undo-btn';
          btn.innerHTML = '<i class="fas fa-undo"></i> Deshacer';
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            toast('Deshacer requiere endpoint /restore en el servidor (no disponible).', 'info');
            t.dismiss();
          });
          body.appendChild(btn);
        }
      }, 50);
    },
  };
  window.MegaUndo = Undo;

  /* ════════════════════════════════════════════════════════════════
   * 6. KEYBOARD NAVIGATION en tablas (arrow keys)
   * ════════════════════════════════════════════════════════════════ */
  var KeyNav = {
    activeTable: null,
    activeRow: null,

    init: function () {
      document.addEventListener('keydown', function (e) {
        var inField = e.target.matches && e.target.matches('input, textarea, [contenteditable]');
        if (inField) return;

        /* Solo si estamos en un panel con tabla activa */
        var activePanel = document.querySelector('.panel.active');
        if (!activePanel) return;
        var table = activePanel.querySelector('table.data-table');
        if (!table) return;

        var rows = Array.from(table.querySelectorAll('tbody tr')).filter(function (tr) {
          return !tr.classList.contains('empty-row') && !tr.classList.contains('no-data');
        });
        if (!rows.length) return;

        var currentIdx = rows.findIndex(function (r) { return r.classList.contains('is-keynav-active'); });

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          var next = Math.min(currentIdx + 1, rows.length - 1);
          KeyNav.setActive(rows, next);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          var prev = Math.max(currentIdx - 1, 0);
          KeyNav.setActive(rows, prev);
        } else if (e.key === 'Home') {
          e.preventDefault();
          KeyNav.setActive(rows, 0);
        } else if (e.key === 'End') {
          e.preventDefault();
          KeyNav.setActive(rows, rows.length - 1);
        } else if (e.key === 'Enter' && currentIdx >= 0) {
          e.preventDefault();
          /* Click en el primer botón de la fila activa */
          var firstAction = rows[currentIdx].querySelector('td.actions button, td.th-actions button');
          if (firstAction) firstAction.click();
        } else if (e.key === ' ' && currentIdx >= 0) {
          /* Spacebar toggle el checkbox bulk si existe */
          var cb = rows[currentIdx].querySelector('.bulk-check');
          if (cb) {
            e.preventDefault();
            cb.checked = !cb.checked;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      });
    },

    setActive: function (rows, idx) {
      rows.forEach(function (r) { r.classList.remove('is-keynav-active'); });
      if (rows[idx]) {
        rows[idx].classList.add('is-keynav-active');
        try { rows[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) {}
      }
    },
  };
  window.MegaKeyNav = KeyNav;

  /* ════════════════════════════════════════════════════════════════
   * BOOT
   * ════════════════════════════════════════════════════════════════ */
  function boot() {
    Focus.init();
    Focus.bindKey();
    SavedViews.init();
    InlineEdit.init();
    Activity.init();
    Undo.init();
    KeyNav.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
