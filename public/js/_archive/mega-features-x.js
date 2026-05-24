/* ════════════════════════════════════════════════════════════════════════
 * MEGA FEATURES X — Avatar generator, Sparklines, Heatmap calendar,
 * PWA install banner, Recent items, Quick add (Cmd+N)
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
    if (window.MegaToast && window.MegaToast.show) return window.MegaToast.show(msg, kind, opts);
    if (window.showToast) return window.showToast(msg, kind);
  }

  /* ════════════════════════════════════════════════════════════════
   * 1. AVATAR GENERATOR — iniciales + color hash determinístico
   * ════════════════════════════════════════════════════════════════ */
  var Avatars = {
    /* Paleta de colores premium (gradientes) */
    PALETTE: [
      ['#3b82f6', '#1d4ed8'], ['#8b5cf6', '#6d28d9'], ['#f59e0b', '#d97706'],
      ['#22c55e', '#15803d'], ['#ec4899', '#be185d'], ['#06b6d4', '#0e7490'],
      ['#ef4444', '#b91c1c'], ['#10b981', '#047857'], ['#f97316', '#c2410c'],
      ['#a855f7', '#7e22ce'], ['#14b8a6', '#0f766e'], ['#eab308', '#a16207'],
    ],

    initials: function (name) {
      if (!name) return '?';
      var clean = String(name).trim().replace(/^(SA DE CV|S\.A\. DE C\.V\.|S\.A\.|SA|LLC|INC)$/gi, '').trim();
      var words = clean.split(/\s+/).filter(Boolean);
      if (words.length === 0) return '?';
      if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    },

    hashColor: function (str) {
      if (!str) return Avatars.PALETTE[0];
      var h = 0;
      for (var i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h |= 0;
      }
      var idx = Math.abs(h) % Avatars.PALETTE.length;
      return Avatars.PALETTE[idx];
    },

    render: function (name, size) {
      size = size || 32;
      var initials = Avatars.initials(name);
      var colors = Avatars.hashColor(name || '?');
      return '<span class="mega-avatar" style="' +
        'width:' + size + 'px;height:' + size + 'px;' +
        'background:linear-gradient(135deg,' + colors[0] + ',' + colors[1] + ');' +
        'font-size:' + Math.round(size * 0.40) + 'px;' +
      '" title="' + escapeHtml(name || '') + '">' + escapeHtml(initials) + '</span>';
    },

    /* Auto-inject avatar antes del primer texto en celdas de "nombre/empresa/razón_social/cliente" */
    autoInject: function () {
      var selectors = [
        '#tabla-clientes tbody td:nth-child(2)',
        '#tabla-prospectos tbody td:nth-child(1)',
        '#tabla-usuarios tbody td:nth-child(1)',
      ];
      selectors.forEach(function (sel) {
        document.querySelectorAll(sel).forEach(function (td) {
          if (td.dataset.avatarInjected) return;
          if (td.classList.contains('bulk-check-td')) return;
          var name = td.textContent.trim();
          if (!name || name === '—' || name === '-') return;
          td.dataset.avatarInjected = '1';
          td.style.display = 'flex';
          td.style.alignItems = 'center';
          td.style.gap = '10px';
          var origText = td.innerHTML;
          td.innerHTML = Avatars.render(name, 32) + '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">' + origText + '</span>';
        });
      });
    },

    init: function () {
      Avatars.autoInject();
      var obs = new MutationObserver(function () {
        clearTimeout(window.__avatarDebounce);
        window.__avatarDebounce = setTimeout(Avatars.autoInject, 600);
      });
      obs.observe(document.body, { childList: true, subtree: true });
    },
  };
  window.MegaAvatars = Avatars;

  /* ════════════════════════════════════════════════════════════════
   * 2. SPARKLINES — mini SVG charts en tablas
   * ════════════════════════════════════════════════════════════════ */
  var Sparklines = {
    render: function (data, opts) {
      opts = opts || {};
      var w = opts.width || 80;
      var h = opts.height || 24;
      var color = opts.color || '#60a5fa';
      var fill = opts.fill || 'rgba(96,165,250,0.15)';
      if (!data || !data.length) return '';
      var max = Math.max.apply(null, data);
      var min = Math.min.apply(null, data);
      var range = max - min || 1;
      var step = w / Math.max(1, data.length - 1);
      var points = data.map(function (v, i) {
        var x = i * step;
        var y = h - ((v - min) / range) * (h - 4) - 2;
        return x.toFixed(1) + ',' + y.toFixed(1);
      }).join(' ');
      var area = '0,' + h + ' ' + points + ' ' + w + ',' + h;
      return '<svg class="mega-sparkline" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
        '<polygon points="' + area + '" fill="' + fill + '"/>' +
        '<polyline points="' + points + '" fill="none" stroke="' + color + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>' +
        '<circle cx="' + (data.length - 1) * step + '" cy="' + (h - ((data[data.length - 1] - min) / range) * (h - 4) - 2) + '" r="2.5" fill="' + color + '"/>' +
      '</svg>';
    },

    /* Auto-inject sparkline en tabla cotizaciones (columna nueva al final antes de actions) */
    autoInjectCotizaciones: async function () {
      var table = document.getElementById('tabla-cotizaciones');
      if (!table || table.dataset.sparkInjected) return;
      var thead = table.querySelector('thead tr:first-child');
      if (!thead) return;
      var actionsTh = thead.querySelector('.th-actions');
      if (!actionsTh) return;
      table.dataset.sparkInjected = '1';

      /* Header nuevo */
      var th = document.createElement('th');
      th.textContent = 'Trend';
      th.style.minWidth = '100px';
      thead.insertBefore(th, actionsTh);

      /* Filter row td vacío */
      var filterRow = table.querySelector('thead tr.filter-row');
      if (filterRow) {
        var actionsTdInFilter = filterRow.querySelector('.th-actions');
        if (actionsTdInFilter) {
          var emptyTd = document.createElement('td');
          filterRow.insertBefore(emptyTd, actionsTdInFilter);
        }
      }

      /* Cargar últimas cotizaciones para extraer histórico simulado por cliente */
      try {
        var resp = await fetch('/api/cotizaciones', {
          headers: { 'Authorization': 'Bearer ' + getToken() },
        });
        if (!resp.ok) return;
        var rows = await resp.json();
        var byClient = {};
        rows.forEach(function (r) {
          var k = r.cliente_nombre || 'sin';
          if (!byClient[k]) byClient[k] = [];
          byClient[k].push(Number(r.total) || 0);
        });

        /* Inject sparkline cell por fila */
        var addSparkRow = function () {
          table.querySelectorAll('tbody tr:not([data-spark-injected])').forEach(function (tr) {
            if (tr.classList.contains('empty-row') || tr.classList.contains('no-data')) return;
            var actionsTd = tr.querySelector('td.actions, td.th-actions');
            if (!actionsTd) return;
            tr.dataset.sparkInjected = '1';
            /* Buscar el cliente en alguna celda */
            var clientCell = Array.from(tr.querySelectorAll('td')).find(function (td) {
              var t = td.textContent.trim();
              return byClient[t] && byClient[t].length > 1;
            });
            var data = clientCell ? byClient[clientCell.textContent.trim()] : [10, 15, 12, 18, 22, 19, 25];
            if (data.length < 3) data = data.concat([data[0] || 10, data[0] || 12]);
            var td = document.createElement('td');
            td.style.padding = '6px 12px';
            td.innerHTML = Sparklines.render(data.slice(-10), {
              width: 80, height: 24,
              color: '#60a5fa',
            });
            tr.insertBefore(td, actionsTd);
          });
        };
        addSparkRow();
        var bodyObs = new MutationObserver(addSparkRow);
        var tbody = table.querySelector('tbody');
        if (tbody) bodyObs.observe(tbody, { childList: true });
      } catch (_) {}
    },

    init: function () {
      var setup = function () {
        if (document.getElementById('tabla-cotizaciones')) {
          Sparklines.autoInjectCotizaciones();
        }
      };
      setup();
      var obs = new MutationObserver(function () {
        clearTimeout(window.__sparkDebounce);
        window.__sparkDebounce = setTimeout(setup, 800);
      });
      obs.observe(document.body, { childList: true, subtree: true });
    },
  };
  window.MegaSparklines = Sparklines;

  /* ════════════════════════════════════════════════════════════════
   * 3. HEATMAP CALENDAR (estilo GitHub) — vista de actividad por día
   * ════════════════════════════════════════════════════════════════ */
  var Heatmap = {
    render: function (data) {
      /* data: { 'YYYY-MM-DD': count, ... } */
      var weeks = 26; /* últimas 26 semanas = ~6 meses */
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      var start = new Date(today);
      start.setDate(start.getDate() - weeks * 7);
      /* Alinear a domingo */
      while (start.getDay() !== 0) start.setDate(start.getDate() - 1);

      var max = Math.max.apply(null, Object.values(data).concat([1]));

      var html = '<div class="mega-heatmap">';
      html += '<div class="mega-heatmap__grid">';
      var d = new Date(start);
      var weekColumns = [];
      var currentWeek = [];
      while (d <= today) {
        if (d.getDay() === 0 && currentWeek.length) {
          weekColumns.push(currentWeek);
          currentWeek = [];
        }
        var key = d.toISOString().slice(0, 10);
        var count = data[key] || 0;
        var level = count === 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4));
        currentWeek.push({
          date: key,
          count: count,
          level: level,
          dow: d.getDay(),
        });
        d.setDate(d.getDate() + 1);
      }
      if (currentWeek.length) weekColumns.push(currentWeek);

      weekColumns.forEach(function (week) {
        html += '<div class="mega-heatmap__week">';
        for (var i = 0; i < 7; i++) {
          var cell = week[i];
          if (!cell) {
            html += '<div class="mega-heatmap__cell mega-heatmap__cell--empty"></div>';
          } else {
            html += '<div class="mega-heatmap__cell" data-level="' + cell.level + '" ' +
              'title="' + cell.date + ': ' + cell.count + ' eventos"></div>';
          }
        }
        html += '</div>';
      });
      html += '</div>';
      html += '<div class="mega-heatmap__legend">' +
        '<span class="mega-heatmap__legend-label">Menos</span>' +
        '<div class="mega-heatmap__cell" data-level="0"></div>' +
        '<div class="mega-heatmap__cell" data-level="1"></div>' +
        '<div class="mega-heatmap__cell" data-level="2"></div>' +
        '<div class="mega-heatmap__cell" data-level="3"></div>' +
        '<div class="mega-heatmap__cell" data-level="4"></div>' +
        '<span class="mega-heatmap__legend-label">Más</span>' +
      '</div>';
      html += '</div>';
      return html;
    },

    inject: async function () {
      /* Solo inyectar en el panel dashboards */
      var dashboard = document.getElementById('panel-dashboards');
      if (!dashboard || dashboard.dataset.heatmapInjected) return;

      try {
        var resp = await fetch('/api/cotizaciones', {
          headers: { 'Authorization': 'Bearer ' + getToken() },
        });
        if (!resp.ok) return;
        var rows = await resp.json();
        if (!Array.isArray(rows) || rows.length === 0) return;
        dashboard.dataset.heatmapInjected = '1';

        var byDay = {};
        rows.forEach(function (r) {
          var d = (r.fecha || '').toString().slice(0, 10);
          if (!d) return;
          byDay[d] = (byDay[d] || 0) + 1;
        });

        var section = document.createElement('section');
        section.className = 'mega-heatmap-section';
        section.innerHTML =
          '<div class="mega-heatmap-section__header">' +
            '<h3><i class="fas fa-fire"></i> Actividad de cotizaciones (últimos 6 meses)</h3>' +
            '<span class="mega-heatmap-section__total">' + rows.length + ' cotizaciones</span>' +
          '</div>' +
          Heatmap.render(byDay);
        /* Insert al final del panel */
        dashboard.appendChild(section);
      } catch (_) {}
    },

    init: function () {
      /* Observer para cuando se active el panel dashboards */
      var setup = function () {
        var dashboard = document.getElementById('panel-dashboards');
        if (dashboard && dashboard.classList.contains('active')) {
          Heatmap.inject();
        }
      };
      setTimeout(setup, 1500);
      var obs = new MutationObserver(setup);
      var dashboard = document.getElementById('panel-dashboards');
      if (dashboard) obs.observe(dashboard, { attributes: true, attributeFilter: ['class'] });
    },
  };
  window.MegaHeatmap = Heatmap;

  /* ════════════════════════════════════════════════════════════════
   * 4. PWA INSTALL BANNER premium
   * ════════════════════════════════════════════════════════════════ */
  var PWAInstall = {
    KEY_DISMISSED: 'cotizacion-pwa-dismissed',
    deferredPrompt: null,

    init: function () {
      window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        PWAInstall.deferredPrompt = e;
        if (PWAInstall.wasDismissed()) return;
        if (PWAInstall.isInstalled()) return;
        setTimeout(PWAInstall.show, 8000); /* esperar 8s para no ser intrusivo */
      });
    },

    isInstalled: function () {
      return window.matchMedia('(display-mode: standalone)').matches ||
             window.navigator.standalone === true;
    },

    wasDismissed: function () {
      try {
        var v = localStorage.getItem(PWAInstall.KEY_DISMISSED);
        if (!v) return false;
        var ts = parseInt(v, 10);
        /* Re-mostrar tras 7 días */
        return Date.now() - ts < 7 * 24 * 60 * 60 * 1000;
      } catch (_) { return false; }
    },

    dismiss: function () {
      try { localStorage.setItem(PWAInstall.KEY_DISMISSED, String(Date.now())); } catch (_) {}
      var b = document.getElementById('mega-pwa-banner');
      if (b) {
        b.classList.remove('is-open');
        setTimeout(function () { try { b.remove(); } catch (_) {} }, 300);
      }
    },

    install: async function () {
      if (!PWAInstall.deferredPrompt) {
        toast('Instalación no disponible en este navegador.', 'info');
        return;
      }
      PWAInstall.deferredPrompt.prompt();
      var choice = await PWAInstall.deferredPrompt.userChoice;
      PWAInstall.deferredPrompt = null;
      if (choice.outcome === 'accepted') {
        toast('Instalación iniciada ✓', 'success');
      }
      PWAInstall.dismiss();
    },

    show: function () {
      if (document.getElementById('mega-pwa-banner')) return;
      var b = document.createElement('div');
      b.id = 'mega-pwa-banner';
      b.className = 'mega-pwa-banner';
      b.innerHTML =
        '<div class="mega-pwa-banner__icon"><i class="fas fa-mobile-alt"></i></div>' +
        '<div class="mega-pwa-banner__body">' +
          '<div class="mega-pwa-banner__title">Instala Servicio Técnico</div>' +
          '<div class="mega-pwa-banner__sub">Acceso rápido desde tu escritorio o pantalla de inicio</div>' +
        '</div>' +
        '<div class="mega-pwa-banner__actions">' +
          '<button class="mega-pwa-banner__btn mega-pwa-banner__btn--primary" id="mega-pwa-install">' +
            '<i class="fas fa-download"></i> Instalar</button>' +
          '<button class="mega-pwa-banner__btn" id="mega-pwa-dismiss" aria-label="Descartar">×</button>' +
        '</div>';
      document.body.appendChild(b);
      requestAnimationFrame(function () { b.classList.add('is-open'); });
      document.getElementById('mega-pwa-install').addEventListener('click', PWAInstall.install);
      document.getElementById('mega-pwa-dismiss').addEventListener('click', PWAInstall.dismiss);
    },
  };
  window.MegaPWA = PWAInstall;

  /* ════════════════════════════════════════════════════════════════
   * 5. RECENT ITEMS — últimos 5 paneles abiertos en header
   * ════════════════════════════════════════════════════════════════ */
  var Recent = {
    KEY: 'cotizacion-recent-panels',
    list: [],
    MAX: 5,

    init: function () {
      try { Recent.list = JSON.parse(localStorage.getItem(Recent.KEY) || '[]'); }
      catch (_) { Recent.list = []; }

      Recent.injectButton();

      /* Track clicks en tabs */
      document.addEventListener('click', function (e) {
        var tab = e.target.closest('[data-tab]');
        if (!tab) return;
        var id = tab.getAttribute('data-tab');
        var label = (tab.textContent || '').trim();
        if (!id || !label) return;
        var iconEl = tab.querySelector('i');
        var icon = iconEl ? iconEl.className : 'fa fa-folder';
        Recent.add({ id: id, label: label, icon: icon, ts: Date.now() });
      });
    },

    add: function (entry) {
      Recent.list = Recent.list.filter(function (e) { return e.id !== entry.id; });
      Recent.list.unshift(entry);
      Recent.list = Recent.list.slice(0, Recent.MAX);
      try { localStorage.setItem(Recent.KEY, JSON.stringify(Recent.list)); } catch (_) {}
    },

    injectButton: function () {
      if (document.querySelector('.recent-items-btn')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'recent-items-btn';
      btn.title = 'Vistos recientemente';
      btn.innerHTML = '<i class="fas fa-clock-rotate-left"></i>';
      btn.addEventListener('click', Recent.toggleDropdown);

      var ref = document.querySelector('.activity-drawer-btn') ||
                document.querySelector('.focus-mode-toggle') ||
                document.querySelector('.density-toggle');
      if (ref && ref.parentNode) {
        ref.parentNode.insertBefore(btn, ref);
        return;
      }
      var header = document.querySelector('.header-inner') || document.querySelector('header');
      if (header) header.appendChild(btn);
    },

    toggleDropdown: function (e) {
      e.stopPropagation();
      var existing = document.getElementById('mega-recent-dropdown');
      if (existing) { existing.remove(); return; }
      var btn = document.querySelector('.recent-items-btn');
      var rect = btn.getBoundingClientRect();
      var dropdown = document.createElement('div');
      dropdown.id = 'mega-recent-dropdown';
      dropdown.className = 'mega-recent-dropdown';
      dropdown.style.top = (rect.bottom + 8) + 'px';
      dropdown.style.right = (window.innerWidth - rect.right) + 'px';
      var html = '<div class="mega-recent-dropdown__title"><i class="fas fa-clock-rotate-left"></i> Vistos recientemente</div>';
      if (Recent.list.length === 0) {
        html += '<div class="mega-recent-dropdown__empty">Aún no has visitado paneles.</div>';
      } else {
        html += '<div class="mega-recent-dropdown__list">';
        Recent.list.forEach(function (e, i) {
          var time = new Date(e.ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
          html += '<div class="mega-recent-dropdown__item" data-i="' + i + '" data-tab="' + e.id + '">' +
            '<i class="' + e.icon + '"></i>' +
            '<div class="mega-recent-dropdown__item-body">' +
              '<div class="mega-recent-dropdown__item-label">' + escapeHtml(e.label) + '</div>' +
              '<div class="mega-recent-dropdown__item-time">' + time + '</div>' +
            '</div>' +
          '</div>';
        });
        html += '</div>';
      }
      dropdown.innerHTML = html;
      document.body.appendChild(dropdown);
      requestAnimationFrame(function () { dropdown.classList.add('is-open'); });

      dropdown.querySelectorAll('.mega-recent-dropdown__item').forEach(function (it) {
        it.addEventListener('click', function () {
          var tabId = it.getAttribute('data-tab');
          var tabBtn = document.querySelector('[data-tab="' + tabId + '"]');
          if (tabBtn) tabBtn.click();
          dropdown.remove();
        });
      });

      setTimeout(function () {
        document.addEventListener('click', function close () {
          if (dropdown.parentNode) dropdown.remove();
          document.removeEventListener('click', close);
        });
      }, 100);
    },
  };
  window.MegaRecent = Recent;

  /* ════════════════════════════════════════════════════════════════
   * 6. QUICK ADD (Cmd+N) — modal universal para crear nuevo
   * ════════════════════════════════════════════════════════════════ */
  var QuickAdd = {
    OPTIONS: [
      { id: 'cliente', label: 'Cliente', icon: 'fa-building', color: '#3b82f6',
        action: function () {
          var btn = document.getElementById('btn-nuevo-cliente') ||
                    document.querySelector('[data-tab="clientes"]');
          if (btn) btn.click();
          setTimeout(function () {
            var add = document.getElementById('btn-nuevo-cliente') ||
                      document.querySelector('#panel-clientes button[data-action="nuevo"]') ||
                      document.querySelector('#panel-clientes .btn.primary');
            if (add) add.click();
          }, 400);
        }
      },
      { id: 'cotizacion', label: 'Cotización', icon: 'fa-file-invoice-dollar', color: '#22c55e',
        action: function () {
          var btn = document.querySelector('[data-tab="cotizaciones"]');
          if (btn) btn.click();
          setTimeout(function () {
            var add = document.getElementById('btn-nuevo-cotizacion') ||
                      document.querySelector('#panel-cotizaciones button.btn.primary');
            if (add) add.click();
          }, 400);
        }
      },
      { id: 'prospecto', label: 'Prospecto', icon: 'fa-user-tie', color: '#8b5cf6',
        action: function () {
          var btn = document.querySelector('[data-tab="prospeccion"]');
          if (btn) btn.click();
        }
      },
      { id: 'incidente', label: 'Incidente', icon: 'fa-exclamation-triangle', color: '#ef4444',
        action: function () {
          var btn = document.querySelector('[data-tab="bitacoras"]');
          if (btn) btn.click();
        }
      },
      { id: 'maquina', label: 'Máquina', icon: 'fa-cog', color: '#06b6d4',
        action: function () {
          var btn = document.querySelector('[data-tab="maquinas"]');
          if (btn) btn.click();
          setTimeout(function () {
            var add = document.querySelector('#panel-maquinas button.btn.primary');
            if (add) add.click();
          }, 400);
        }
      },
      { id: 'refaccion', label: 'Refacción', icon: 'fa-cogs', color: '#f59e0b',
        action: function () {
          var btn = document.querySelector('[data-tab="refacciones"]');
          if (btn) btn.click();
          setTimeout(function () {
            var add = document.querySelector('#panel-refacciones button.btn.primary');
            if (add) add.click();
          }, 400);
        }
      },
    ],

    show: function () {
      var existing = document.getElementById('mega-quickadd');
      if (existing) { existing.remove(); return; }
      var wrap = document.createElement('div');
      wrap.id = 'mega-quickadd';
      wrap.className = 'mega-quickadd';
      wrap.innerHTML =
        '<div class="mega-quickadd__panel">' +
          '<div class="mega-quickadd__header">' +
            '<h3><i class="fas fa-bolt"></i> Crear nuevo</h3>' +
            '<span class="mega-quickadd__hint">Esc para cerrar</span>' +
          '</div>' +
          '<div class="mega-quickadd__grid">' +
            QuickAdd.OPTIONS.map(function (opt, i) {
              return '<button class="mega-quickadd__opt" data-i="' + i + '" style="--opt-color:' + opt.color + '">' +
                '<div class="mega-quickadd__opt-icon"><i class="fas ' + opt.icon + '"></i></div>' +
                '<div class="mega-quickadd__opt-label">' + escapeHtml(opt.label) + '</div>' +
              '</button>';
            }).join('') +
          '</div>' +
        '</div>';
      document.body.appendChild(wrap);
      requestAnimationFrame(function () { wrap.classList.add('is-open'); });

      var close = function () {
        wrap.classList.remove('is-open');
        setTimeout(function () { try { wrap.remove(); } catch (_) {} }, 220);
      };
      wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
      document.addEventListener('keydown', function escListen (e) {
        if (e.key === 'Escape') {
          close();
          document.removeEventListener('keydown', escListen);
        }
      });
      wrap.querySelectorAll('.mega-quickadd__opt').forEach(function (b, i) {
        b.addEventListener('click', function () {
          close();
          setTimeout(function () { QuickAdd.OPTIONS[i].action(); }, 100);
        });
      });
    },

    init: function () {
      document.addEventListener('keydown', function (e) {
        var inField = e.target.matches && e.target.matches('input, textarea, [contenteditable]');
        if (inField) return;
        /* Ctrl+N abre quickadd (skip si Cmd+K palette está abierto) */
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
          var cmdkOpen = document.getElementById('cmdk');
          if (cmdkOpen && cmdkOpen.classList.contains('is-open')) return;
          e.preventDefault();
          QuickAdd.show();
        }
      });
    },
  };
  window.MegaQuickAdd = QuickAdd;

  /* ════════════════════════════════════════════════════════════════
   * BOOT
   * ════════════════════════════════════════════════════════════════ */
  function boot() {
    setTimeout(function () { Avatars.init(); }, 1000);
    setTimeout(function () { Sparklines.init(); }, 1500);
    setTimeout(function () { Heatmap.init(); }, 1800);
    PWAInstall.init();
    Recent.init();
    QuickAdd.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
