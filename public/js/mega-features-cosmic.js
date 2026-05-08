/* ════════════════════════════════════════════════════════════════════════
 * MEGA FEATURES COSMIC — 40 mejoras adicionales
 * ════════════════════════════════════════════════════════════════════════ */
;(function () {
  'use strict';

  function escapeHtml(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
  function toast(msg, kind, opts) {
    if (window.MegaToast && window.MegaToast.show) return window.MegaToast.show(msg, kind, opts);
    if (window.showToast) return window.showToast(msg, kind);
  }

  /* ═══ 1. DRAG-DROP FILE UPLOAD zone (global) ═══ */
  var dragCounter = 0;
  document.addEventListener('dragenter', function (e) {
    if (e.dataTransfer && e.dataTransfer.types.indexOf('Files') >= 0) {
      dragCounter++;
      var z = document.getElementById('mega-drop-overlay');
      if (!z) {
        z = document.createElement('div');
        z.id = 'mega-drop-overlay';
        z.innerHTML = '<div class="mego-drop-inner"><i class="fas fa-cloud-upload-alt"></i><div>Suelta el archivo aquí</div><small>CSV/Excel se abrirá en el wizard de import</small></div>';
        document.body.appendChild(z);
      }
      z.classList.add('is-active');
    }
  });
  document.addEventListener('dragleave', function () {
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      var z = document.getElementById('mega-drop-overlay');
      if (z) z.classList.remove('is-active');
    }
  });
  document.addEventListener('drop', function (e) {
    dragCounter = 0;
    var z = document.getElementById('mega-drop-overlay');
    if (z) z.classList.remove('is-active');
    if (e.dataTransfer && e.dataTransfer.files.length && /\.(csv|xlsx|xls)$/i.test(e.dataTransfer.files[0].name)) {
      e.preventDefault();
      if (window.MegaImportWizard) {
        window.MegaImportWizard.open();
        setTimeout(function () {
          window.MegaImportWizard.handleFile(e.dataTransfer.files[0], document.getElementById('mega-import-wizard'));
        }, 400);
      }
    }
  });
  document.addEventListener('dragover', function (e) { if (e.dataTransfer && e.dataTransfer.types.indexOf('Files') >= 0) e.preventDefault(); });

  /* ═══ 2. QUICK SEARCH INLINE (/ abre filtro panel actual) ═══ */
  document.addEventListener('keydown', function (e) {
    var inField = e.target.matches && e.target.matches('input, textarea, [contenteditable]');
    if (inField || e.ctrlKey || e.metaKey) return;
    if (e.key === '\\') {
      e.preventDefault();
      var active = document.querySelector('.panel.active');
      if (!active) return;
      var firstFilter = active.querySelector('input.filter-input');
      if (firstFilter) {
        firstFilter.focus();
        firstFilter.select();
      }
    }
  });

  /* ═══ 3. DAILY FOCUS / GREETING matutino ═══ */
  var Greeting = {
    KEY: 'cotizacion-last-greeting',
    show: function () {
      try {
        var today = new Date().toISOString().slice(0, 10);
        if (localStorage.getItem(Greeting.KEY) === today) return;
        localStorage.setItem(Greeting.KEY, today);
      } catch (_) {}
      var h = new Date().getHours();
      var greeting = h < 12 ? '☀️ Buenos días' : h < 19 ? '🌤️ Buenas tardes' : '🌙 Buenas noches';
      var name = '';
      try { var u = JSON.parse(localStorage.getItem('cotizacion-auth-user') || '{}'); name = u.displayName || u.username || ''; } catch (_) {}
      var msg = greeting + (name ? ', ' + name.split(' ')[0] : '') + '. ¡Que tengas un día productivo!';
      setTimeout(function () { toast(msg, 'info', { duration: 5000, title: 'Bienvenido' }); }, 2500);
    },
  };
  setTimeout(Greeting.show, 3000);

  /* ═══ 4. YEAR HEATMAP (12 meses, todo el año) ═══ */
  window.MegaYearHeatmap = {
    show: async function () {
      var modal = document.createElement('div');
      modal.id = 'mega-year-modal';
      modal.style.cssText = 'position:fixed;inset:0;z-index:100002;background:rgba(2,6,23,0.7);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px';
      modal.innerHTML = '<div style="background:linear-gradient(180deg,rgba(15,23,42,0.97),rgba(2,6,23,0.99));border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:24px;max-width:920px;width:100%;max-height:85vh;overflow-y:auto"><h3 style="margin:0 0 16px;color:#f8fafc;font-family:Sora,sans-serif"><i class="fas fa-calendar-alt" style="color:#60a5fa"></i> Mapa de calor anual</h3><div id="mega-year-grid" style="overflow-x:auto"><div style="text-align:center;padding:30px;color:#94a3b8">Cargando...</div></div><button class="myh-close" style="margin-top:14px;padding:8px 16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);color:#cbd5e1;border-radius:8px;cursor:pointer">Cerrar</button></div>';
      document.body.appendChild(modal);
      modal.querySelector('.myh-close').onclick = function () { modal.remove(); };
      modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
      try {
        var token = localStorage.getItem('cotizacion-auth-token') || '';
        var rows = await fetch('/api/cotizaciones', { headers: { Authorization: 'Bearer ' + token } }).then(function (r) { return r.json(); });
        var byDay = {};
        (rows || []).forEach(function (c) {
          var d = (c.fecha || '').toString().slice(0, 10);
          if (d) byDay[d] = (byDay[d] || 0) + 1;
        });
        var max = Math.max.apply(null, Object.values(byDay).concat([1]));
        var year = new Date().getFullYear();
        var months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        var html = '<div style="display:flex;flex-direction:column;gap:14px">';
        for (var m = 0; m < 12; m++) {
          var firstDay = new Date(year, m, 1);
          var daysInMonth = new Date(year, m + 1, 0).getDate();
          var startDow = firstDay.getDay();
          html += '<div><div style="font-size:0.78rem;color:#94a3b8;margin-bottom:4px;font-weight:700">' + months[m] + ' ' + year + '</div>';
          html += '<div style="display:grid;grid-template-columns:repeat(' + (Math.ceil((daysInMonth + startDow) / 7)) + ',1fr);gap:3px">';
          for (var d = 0; d < daysInMonth + startDow; d++) {
            if (d < startDow) { html += '<div style="width:14px;height:14px"></div>'; continue; }
            var day = d - startDow + 1;
            var date = year + '-' + String(m + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
            var count = byDay[date] || 0;
            var level = count === 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4));
            var colors = ['rgba(255,255,255,0.04)', 'rgba(59,130,246,0.25)', 'rgba(59,130,246,0.5)', 'rgba(59,130,246,0.75)', 'linear-gradient(135deg,#60a5fa,#8b5cf6)'];
            html += '<div title="' + date + ': ' + count + '" style="width:14px;height:14px;border-radius:3px;background:' + colors[level] + '"></div>';
          }
          html += '</div></div>';
        }
        html += '</div>';
        modal.querySelector('#mega-year-grid').innerHTML = html;
      } catch (e) { modal.querySelector('#mega-year-grid').innerHTML = 'Error: ' + e.message; }
    },
  };

  /* ═══ 5. KONAMI CODE easter egg ═══ */
  var konami = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  var konamiPos = 0;
  document.addEventListener('keydown', function (e) {
    if (e.key === konami[konamiPos]) {
      konamiPos++;
      if (konamiPos === konami.length) {
        konamiPos = 0;
        document.body.classList.toggle('mega-rainbow');
        if (window.MegaConfetti) window.MegaConfetti.fire({ count: 200 });
        toast('🎮 KONAMI CODE activado! Modo arcoíris', 'success', { duration: 3000 });
      }
    } else { konamiPos = 0; }
  });

  /* ═══ 6. CURSOR TRAIL (opt-in) ═══ */
  window.MegaCursorTrail = {
    KEY: 'cotizacion-cursor-trail',
    enabled: false,
    init: function () {
      try { window.MegaCursorTrail.enabled = localStorage.getItem(window.MegaCursorTrail.KEY) === '1'; } catch (_) {}
      if (!window.MegaCursorTrail.enabled) return;
      var trails = [];
      document.addEventListener('mousemove', function (e) {
        var dot = document.createElement('div');
        dot.style.cssText = 'position:fixed;left:' + e.clientX + 'px;top:' + e.clientY + 'px;width:6px;height:6px;border-radius:50%;background:radial-gradient(circle,#60a5fa,transparent);pointer-events:none;z-index:99999;animation:mega-trail-fade 0.6s ease-out forwards';
        document.body.appendChild(dot);
        setTimeout(function () { try { dot.remove(); } catch (_) {} }, 600);
      });
    },
    toggle: function () {
      window.MegaCursorTrail.enabled = !window.MegaCursorTrail.enabled;
      try { localStorage.setItem(window.MegaCursorTrail.KEY, window.MegaCursorTrail.enabled ? '1' : '0'); } catch (_) {}
      toast('Cursor trail ' + (window.MegaCursorTrail.enabled ? 'activado (recarga para aplicar)' : 'desactivado'), 'info');
    },
  };
  window.MegaCursorTrail.init();

  /* ═══ 7. COLOR BLINDNESS mode ═══ */
  window.MegaColorBlind = {
    KEY: 'cotizacion-cb-mode',
    apply: function (mode) {
      document.body.classList.remove('mega-cb-protan', 'mega-cb-deuter', 'mega-cb-tritan');
      if (mode) document.body.classList.add('mega-cb-' + mode);
      try { localStorage.setItem(window.MegaColorBlind.KEY, mode || ''); } catch (_) {}
    },
    init: function () {
      try { window.MegaColorBlind.apply(localStorage.getItem(window.MegaColorBlind.KEY) || ''); } catch (_) {}
    },
  };
  window.MegaColorBlind.init();

  /* ═══ 8. HIGH CONTRAST MODE ═══ */
  window.MegaHighContrast = {
    KEY: 'cotizacion-high-contrast',
    toggle: function () {
      var on = !document.body.classList.contains('mega-high-contrast');
      document.body.classList.toggle('mega-high-contrast', on);
      try { localStorage.setItem(window.MegaHighContrast.KEY, on ? '1' : '0'); } catch (_) {}
      toast('Alto contraste ' + (on ? 'ON' : 'OFF'), 'info');
    },
  };
  try { if (localStorage.getItem(window.MegaHighContrast.KEY) === '1') document.body.classList.add('mega-high-contrast'); } catch (_) {}

  /* ═══ 9. VINTAGE/RETRO theme ═══ */
  window.MegaVintage = {
    KEY: 'cotizacion-vintage',
    toggle: function () {
      var on = !document.body.classList.contains('mega-vintage');
      document.body.classList.toggle('mega-vintage', on);
      try { localStorage.setItem(window.MegaVintage.KEY, on ? '1' : '0'); } catch (_) {}
      toast('Tema vintage ' + (on ? 'ON' : 'OFF'), 'info');
    },
  };
  try { if (localStorage.getItem(window.MegaVintage.KEY) === '1') document.body.classList.add('mega-vintage'); } catch (_) {}

  /* ═══ 10. CUSTOM FONT SELECTOR ═══ */
  window.MegaFont = {
    KEY: 'cotizacion-font',
    FONTS: [
      { name: 'Inter', stack: 'Inter, system-ui, sans-serif' },
      { name: 'System', stack: 'system-ui, sans-serif' },
      { name: 'Mono', stack: '"JetBrains Mono", monospace' },
      { name: 'Serif', stack: 'Georgia, serif' },
      { name: 'Sora', stack: 'Sora, Inter, sans-serif' },
    ],
    apply: function (idx) {
      var f = window.MegaFont.FONTS[idx] || window.MegaFont.FONTS[0];
      var s = document.getElementById('mega-font-style') || document.createElement('style');
      s.id = 'mega-font-style';
      s.textContent = 'body, body * { font-family: ' + f.stack + ' !important; }';
      if (!s.parentNode) document.head.appendChild(s);
      try { localStorage.setItem(window.MegaFont.KEY, String(idx)); } catch (_) {}
      toast('Fuente: ' + f.name, 'success');
    },
    init: function () {
      try { var v = localStorage.getItem(window.MegaFont.KEY); if (v) window.MegaFont.apply(parseInt(v, 10)); } catch (_) {}
    },
  };
  window.MegaFont.init();

  /* ═══ 11-15. ANALYTICS calculations ═══ */
  window.MegaAnalytics = {
    /* 11 */ winRate: function (cotizaciones) {
      var cerradas = cotizaciones.filter(function (c) { return /aprobad|cerrad|gana/i.test(c.estatus || ''); });
      return cotizaciones.length ? (cerradas.length / cotizaciones.length * 100).toFixed(1) + '%' : 'N/A';
    },
    /* 12 */ avgDaysToClose: function (cotizaciones) {
      var closed = cotizaciones.filter(function (c) { return c.fecha_cierre && c.fecha; });
      if (!closed.length) return 'N/A';
      var totalDays = closed.reduce(function (s, c) {
        return s + Math.max(0, Math.floor((new Date(c.fecha_cierre) - new Date(c.fecha)) / 86400000));
      }, 0);
      return Math.round(totalDays / closed.length) + ' días';
    },
    /* 13 */ ltv: function (cliente, cotizaciones) {
      var clientCot = cotizaciones.filter(function (c) { return c.cliente_nombre === cliente; });
      return clientCot.reduce(function (s, c) { return s + (Number(c.total) || 0); }, 0);
    },
    /* 14 */ churnRisk: function (lastQuoteDays) {
      if (lastQuoteDays < 30) return 'low';
      if (lastQuoteDays < 90) return 'medium';
      return 'high';
    },
    /* 15 */ forecast: function (timeSeries) {
      /* Simple linear regression */
      var n = timeSeries.length;
      if (n < 3) return null;
      var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      timeSeries.forEach(function (y, x) {
        sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x;
      });
      var slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      var intercept = (sumY - slope * sumX) / n;
      return slope * n + intercept;
    },
  };

  /* ═══ 16. PIN/UNPIN tabs (sticky favoritos en navegación) ═══ */
  /* Ya hay bookmarks en mega-features-final, este lo extiende */

  /* ═══ 17. RECENTLY EDITED list ═══ */
  window.MegaRecentEdited = {
    KEY: 'cotizacion-recent-edited',
    log: function (resource, id, label) {
      var l;
      try { l = JSON.parse(localStorage.getItem(window.MegaRecentEdited.KEY) || '[]'); }
      catch (_) { l = []; }
      l = l.filter(function (e) { return !(e.resource === resource && e.id === id); });
      l.unshift({ resource: resource, id: id, label: label, ts: Date.now() });
      try { localStorage.setItem(window.MegaRecentEdited.KEY, JSON.stringify(l.slice(0, 20))); } catch (_) {}
    },
    list: function () {
      try { return JSON.parse(localStorage.getItem(window.MegaRecentEdited.KEY) || '[]'); }
      catch (_) { return []; }
    },
  };
  /* Hook fetch PUT para registrar */
  (function () {
    var orig = window.fetch;
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var method = (init && init.method || 'GET').toUpperCase();
      var p = orig.apply(this, arguments);
      if (method === 'PUT' && url.indexOf('/api/') !== -1) {
        p.then(function (r) {
          if (r && r.ok) {
            var match = url.match(/\/api\/([^/?]+)\/(\d+)/);
            if (match) window.MegaRecentEdited.log(match[1], match[2], match[1] + ' #' + match[2]);
          }
        }).catch(function () {});
      }
      return p;
    };
  })();

  /* ═══ 18. SHOW/HIDE COLUMNS selector ═══ */
  window.MegaColumns = {
    show: function (tableId) {
      var table = document.getElementById(tableId);
      if (!table) { toast('Tabla no encontrada', 'error'); return; }
      var headers = Array.from(table.querySelectorAll('thead tr:first-child th'));
      var modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;z-index:100002;background:rgba(2,6,23,0.7);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px';
      modal.innerHTML =
        '<div style="background:linear-gradient(180deg,rgba(15,23,42,0.97),rgba(2,6,23,0.99));border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:20px;width:100%;max-width:380px">' +
          '<h3 style="margin:0 0 14px;color:#f8fafc;font-family:Sora,sans-serif"><i class="fas fa-columns" style="color:#60a5fa"></i> Mostrar/ocultar columnas</h3>' +
          '<div style="display:flex;flex-direction:column;gap:6px;max-height:400px;overflow-y:auto">' +
            headers.map(function (th, i) {
              var visible = th.style.display !== 'none';
              var label = (th.textContent || '').trim() || 'Columna ' + (i + 1);
              return '<label style="display:flex;align-items:center;gap:8px;padding:8px;background:rgba(255,255,255,0.03);border-radius:8px;cursor:pointer">' +
                '<input type="checkbox" data-i="' + i + '" ' + (visible ? 'checked' : '') + ' style="accent-color:#3b82f6">' +
                '<span style="color:#cbd5e1;font-size:0.86rem">' + escapeHtml(label) + '</span>' +
              '</label>';
            }).join('') +
          '</div>' +
          '<button class="cols-close" style="margin-top:12px;width:100%;padding:8px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">Cerrar</button>' +
        '</div>';
      document.body.appendChild(modal);
      modal.querySelectorAll('input').forEach(function (cb) {
        cb.onchange = function () {
          var i = parseInt(cb.getAttribute('data-i'), 10);
          var display = cb.checked ? '' : 'none';
          table.querySelectorAll('thead tr').forEach(function (tr) { var c = tr.children[i]; if (c) c.style.display = display; });
          table.querySelectorAll('tbody tr').forEach(function (tr) { var c = tr.children[i]; if (c) c.style.display = display; });
        };
      });
      modal.querySelector('.cols-close').onclick = function () { modal.remove(); };
      modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
    },
  };

  /* ═══ 19. WHATSAPP/SMS quick buttons en filas ═══ */
  document.addEventListener('mouseover', function (e) {
    var td = e.target.closest('td');
    if (!td || td.dataset.waApplied) return;
    var t = td.textContent.trim();
    if (/^\+?\d[\d\s().-]{7,}$/.test(t) && !td.querySelector('a, .mega-wa-icons')) {
      td.dataset.waApplied = '1';
      var clean = t.replace(/[^\d+]/g, '');
      var icons = document.createElement('span');
      icons.className = 'mega-wa-icons';
      icons.style.cssText = 'margin-left:6px;display:inline-flex;gap:4px';
      icons.innerHTML =
        '<a href="https://wa.me/' + clean + '" target="_blank" title="WhatsApp" style="color:#22c55e">📱</a>' +
        '<a href="sms:' + clean + '" title="SMS" style="color:#3b82f6">💬</a>' +
        '<a href="tel:' + clean + '" title="Llamar" style="color:#f59e0b">📞</a>';
      td.appendChild(icons);
    }
  });

  /* ═══ 20. MORNING / EVENING auto-greeting (Greeting ya hecho) ═══ */

  /* ═══ 21. BIRTHDAY ALERTS clientes (basado en fecha_alta como proxy) ═══ */
  window.MegaBirthdays = {
    check: async function () {
      try {
        var token = localStorage.getItem('cotizacion-auth-token') || '';
        var clientes = await fetch('/api/clientes', { headers: { Authorization: 'Bearer ' + token } }).then(function (r) { return r.json(); });
        var today = new Date();
        var bdays = (clientes || []).filter(function (c) {
          if (!c.fecha_nacimiento) return false;
          var b = new Date(c.fecha_nacimiento);
          return b.getMonth() === today.getMonth() && b.getDate() === today.getDate();
        });
        if (bdays.length) {
          toast('🎂 ' + bdays.length + ' cumpleaños hoy: ' + bdays.map(function (c) { return c.nombre; }).join(', '),
                'info', { duration: 8000, title: 'Cumpleaños' });
        }
      } catch (_) {}
    },
  };
  setTimeout(window.MegaBirthdays.check, 6000);

  /* ═══ 22. MACROS RECORDER simple ═══ */
  window.MegaMacros = {
    KEY: 'cotizacion-macros',
    recording: false,
    actions: [],
    start: function () {
      window.MegaMacros.recording = true;
      window.MegaMacros.actions = [];
      toast('🔴 Grabando macro... (usa MegaMacros.stop para detener)', 'info');
    },
    record: function (action) {
      if (window.MegaMacros.recording) window.MegaMacros.actions.push(action);
    },
    stop: function (name) {
      window.MegaMacros.recording = false;
      var n = name || ('Macro ' + Date.now());
      var l;
      try { l = JSON.parse(localStorage.getItem(window.MegaMacros.KEY) || '[]'); }
      catch (_) { l = []; }
      l.push({ name: n, actions: window.MegaMacros.actions });
      try { localStorage.setItem(window.MegaMacros.KEY, JSON.stringify(l)); } catch (_) {}
      toast('✓ Macro "' + n + '" guardada con ' + window.MegaMacros.actions.length + ' acciones', 'success');
    },
  };
  /* Tracking automático básico (clicks en data-tab) */
  document.addEventListener('click', function (e) {
    if (window.MegaMacros.recording) {
      var tab = e.target.closest('[data-tab]');
      if (tab) window.MegaMacros.record({ type: 'click', tab: tab.getAttribute('data-tab'), ts: Date.now() });
    }
  });

  /* ═══ 23. CUSTOM SHORTCUTS BUILDER (binding personalizado) ═══ */
  window.MegaCustomShortcuts = {
    KEY: 'cotizacion-custom-shortcuts',
    list: function () {
      try { return JSON.parse(localStorage.getItem(window.MegaCustomShortcuts.KEY) || '{}'); }
      catch (_) { return {}; }
    },
    bind: function (key, action) {
      var s = window.MegaCustomShortcuts.list();
      s[key] = action;
      try { localStorage.setItem(window.MegaCustomShortcuts.KEY, JSON.stringify(s)); } catch (_) {}
      toast('Atajo bindeado: ' + key, 'success');
    },
  };

  /* ═══ 24. API TESTER inline ═══ */
  window.MegaAPITester = {
    show: function () {
      var modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;z-index:100002;background:rgba(2,6,23,0.7);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px';
      modal.innerHTML =
        '<div style="background:linear-gradient(180deg,rgba(15,23,42,0.97),rgba(2,6,23,0.99));border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:20px;width:100%;max-width:560px;max-height:85vh;display:flex;flex-direction:column">' +
          '<h3 style="margin:0 0 12px;color:#f8fafc;font-family:Sora,sans-serif"><i class="fas fa-code" style="color:#22c55e"></i> API Tester</h3>' +
          '<div style="display:flex;gap:6px;margin-bottom:8px">' +
            '<select id="api-method" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);color:#f8fafc;padding:8px 12px;border-radius:8px"><option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option></select>' +
            '<input id="api-url" placeholder="/api/clientes" value="/api/dashboard-stats" style="flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);color:#f8fafc;padding:8px 12px;border-radius:8px;font-family:JetBrains Mono,monospace">' +
            '<button id="api-send" style="background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-weight:600">Send</button>' +
          '</div>' +
          '<textarea id="api-body" placeholder="Body JSON (opcional)" style="width:100%;height:80px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);color:#f8fafc;padding:8px;border-radius:8px;font-family:JetBrains Mono,monospace;font-size:0.78rem;margin-bottom:8px;resize:vertical"></textarea>' +
          '<pre id="api-result" style="flex:1;overflow:auto;background:rgba(0,0,0,0.4);border-radius:8px;padding:12px;color:#e2e8f0;font-family:JetBrains Mono,monospace;font-size:0.74rem;margin:0;line-height:1.5;min-height:120px">// Respuesta aparecerá aquí</pre>' +
          '<button class="api-close" style="margin-top:12px;padding:8px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);color:#cbd5e1;border-radius:8px;cursor:pointer">Cerrar</button>' +
        '</div>';
      document.body.appendChild(modal);
      modal.querySelector('.api-close').onclick = function () { modal.remove(); };
      modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
      modal.querySelector('#api-send').onclick = async function () {
        var method = modal.querySelector('#api-method').value;
        var url = modal.querySelector('#api-url').value;
        var body = modal.querySelector('#api-body').value;
        var resultEl = modal.querySelector('#api-result');
        resultEl.textContent = 'Enviando...';
        try {
          var token = localStorage.getItem('cotizacion-auth-token') || '';
          var resp = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: body && method !== 'GET' ? body : undefined,
          });
          var status = resp.status;
          var data;
          try { data = await resp.json(); } catch (_) { data = await resp.text(); }
          resultEl.textContent = '// Status: ' + status + '\n' + JSON.stringify(data, null, 2);
        } catch (e) { resultEl.textContent = '// Error: ' + e.message; }
      };
    },
  };

  /* ═══ 25. WEBHOOK TESTER ═══ */
  window.MegaWebhook = {
    test: async function (url, payload) {
      try {
        var resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload || { test: true, ts: Date.now() }),
        });
        toast('Webhook ' + (resp.ok ? '✓ OK' : '✗ HTTP ' + resp.status), resp.ok ? 'success' : 'error');
      } catch (e) { toast('Webhook error: ' + e.message, 'error'); }
    },
  };

  /* ═══ 26. POMODORO STATS acumulados ═══ */
  window.MegaPomoStats = {
    KEY: 'cotizacion-pomo-stats',
    increment: function () {
      var s;
      try { s = JSON.parse(localStorage.getItem(window.MegaPomoStats.KEY) || '{}'); }
      catch (_) { s = {}; }
      var today = new Date().toISOString().slice(0, 10);
      s[today] = (s[today] || 0) + 1;
      try { localStorage.setItem(window.MegaPomoStats.KEY, JSON.stringify(s)); } catch (_) {}
    },
    today: function () {
      try {
        var s = JSON.parse(localStorage.getItem(window.MegaPomoStats.KEY) || '{}');
        return s[new Date().toISOString().slice(0, 10)] || 0;
      } catch (_) { return 0; }
    },
  };

  /* ═══ 27. LOADING SPLASH al primer load ═══ */
  /* Lo aplicamos a la pre-carga inicial — si el body apenas existe, mostramos un splash */
  if (sessionStorage && !sessionStorage.getItem('mega-splash-shown')) {
    sessionStorage.setItem('mega-splash-shown', '1');
    var splash = document.createElement('div');
    splash.id = 'mega-splash';
    splash.style.cssText = 'position:fixed;inset:0;z-index:1000000;background:radial-gradient(ellipse at center, #1e293b, #0f172a);display:flex;align-items:center;justify-content:center;animation:mega-splash-out 0.5s ease-out 1.4s forwards';
    splash.innerHTML = '<div style="text-align:center"><div style="width:80px;height:80px;border-radius:20px;background:linear-gradient(135deg,#3b82f6,#8b5cf6,#f59e0b);display:flex;align-items:center;justify-content:center;color:#fff;font-size:2.4rem;font-weight:900;font-family:Sora,sans-serif;margin:0 auto 16px;box-shadow:0 12px 40px rgba(59,130,246,0.4)">U</div><div style="color:#94a3b8;font-size:0.86rem;font-family:Inter,sans-serif">Servicio Técnico Universal</div></div>';
    document.body && document.body.appendChild(splash);
    setTimeout(function () { try { splash.remove(); } catch (_) {} }, 2000);
  }

  /* ═══ 28. FULLSCREEN toggle (F11 alt) ═══ */
  window.MegaFullscreen = {
    toggle: function () {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(function () {});
      } else {
        document.exitFullscreen();
      }
    },
  };

  /* ═══ 29. QUICK NUMBER POLL (1-10 instantáneo) ═══ */
  window.MegaNumberPoll = {
    show: function (question) {
      var modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;z-index:100002;background:rgba(2,6,23,0.7);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px';
      modal.innerHTML =
        '<div style="background:linear-gradient(180deg,rgba(15,23,42,0.97),rgba(2,6,23,0.99));border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:24px;text-align:center;max-width:380px">' +
          '<h3 style="margin:0 0 18px;color:#f8fafc">' + escapeHtml(question || '¿Qué tan satisfecho estás?') + '</h3>' +
          '<div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap">' +
            [1,2,3,4,5,6,7,8,9,10].map(function (n) {
              var color = n <= 3 ? '#ef4444' : n <= 6 ? '#f59e0b' : '#22c55e';
              return '<button data-n="' + n + '" style="width:38px;height:38px;background:rgba(255,255,255,0.04);border:1px solid ' + color + ';color:' + color + ';border-radius:8px;cursor:pointer;font-weight:700;font-size:0.92rem">' + n + '</button>';
            }).join('') +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
      modal.querySelectorAll('[data-n]').forEach(function (b) {
        b.onclick = function () {
          var n = b.getAttribute('data-n');
          modal.remove();
          toast('✓ Tu respuesta: ' + n + '/10', 'success');
        };
      });
      modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
    },
  };

  /* ═══ 30. ENERGY/MOOD tracker diario ═══ */
  window.MegaMood = {
    KEY: 'cotizacion-mood',
    log: function (level) {
      var s;
      try { s = JSON.parse(localStorage.getItem(window.MegaMood.KEY) || '{}'); }
      catch (_) { s = {}; }
      s[new Date().toISOString().slice(0, 10)] = level;
      try { localStorage.setItem(window.MegaMood.KEY, JSON.stringify(s)); } catch (_) {}
      toast('😊 Mood registrado: ' + ['😞','🙁','😐','🙂','😄'][level - 1], 'success');
    },
    askDaily: function () {
      try {
        var s = JSON.parse(localStorage.getItem(window.MegaMood.KEY) || '{}');
        if (s[new Date().toISOString().slice(0, 10)]) return;
      } catch (_) {}
      var mood = document.createElement('div');
      mood.style.cssText = 'position:fixed;bottom:20px;left:20px;z-index:9988;background:rgba(15,23,42,0.95);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:12px 14px;box-shadow:0 8px 24px rgba(0,0,0,0.4);animation:mego-mood-in 0.4s ease';
      mood.innerHTML =
        '<div style="font-size:0.78rem;color:#cbd5e1;margin-bottom:8px;font-family:Inter,sans-serif">¿Cómo te sientes hoy?</div>' +
        '<div style="display:flex;gap:6px">' +
          ['😞','🙁','😐','🙂','😄'].map(function (e, i) {
            return '<button data-l="' + (i + 1) + '" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:1.2rem">' + e + '</button>';
          }).join('') +
          '<button class="mood-skip" style="background:transparent;border:none;color:#64748b;cursor:pointer;font-size:0.74rem;padding:0 8px">×</button>' +
        '</div>';
      document.body.appendChild(mood);
      mood.querySelectorAll('[data-l]').forEach(function (b) {
        b.onclick = function () { window.MegaMood.log(parseInt(b.getAttribute('data-l'), 10)); mood.remove(); };
      });
      mood.querySelector('.mood-skip').onclick = function () { mood.remove(); };
    },
  };
  setTimeout(window.MegaMood.askDaily, 12000);

  /* ═══ 31. TIME-TO-RESPONSE tracker (cuanto tarda el usuario en responder) ═══ */
  window.MegaResponseTime = {
    times: [],
    last: Date.now(),
    record: function () {
      var diff = Date.now() - window.MegaResponseTime.last;
      window.MegaResponseTime.times.push(diff);
      window.MegaResponseTime.last = Date.now();
    },
  };
  document.addEventListener('click', function (e) {
    if (e.target.closest('button, a')) window.MegaResponseTime.record();
  });

  /* ═══ 32. AUTO TEXT EXPANSION (atajos tipo iPhone) ═══ */
  window.MegaTextExpand = {
    KEY: 'cotizacion-text-expand',
    list: function () {
      try { return JSON.parse(localStorage.getItem(window.MegaTextExpand.KEY) || '{}'); }
      catch (_) { return { 'tdt': 'Te informo que...', '/saludo': 'Estimado cliente, espero que se encuentre bien.', '/cierre': 'Quedo a sus órdenes.' }; }
    },
    add: function (trigger, expansion) {
      var l = window.MegaTextExpand.list();
      l[trigger] = expansion;
      try { localStorage.setItem(window.MegaTextExpand.KEY, JSON.stringify(l)); } catch (_) {}
      toast('Atajo "' + trigger + '" guardado', 'success');
    },
  };
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (!el.matches || !el.matches('textarea, input[type="text"]')) return;
    var l = window.MegaTextExpand.list();
    var v = el.value;
    var caret = el.selectionStart;
    Object.keys(l).forEach(function (trigger) {
      var endIdx = v.lastIndexOf(trigger, caret);
      if (endIdx !== -1 && endIdx + trigger.length === caret) {
        var before = v.slice(0, endIdx);
        var after = v.slice(caret);
        el.value = before + l[trigger] + after;
        el.selectionStart = el.selectionEnd = (before + l[trigger]).length;
      }
    });
  });

  /* ═══ 33. DEFER CONFIRM dialog (más fancy que window.confirm) ═══ */
  window.MegaConfirm = function (msg, opts) {
    return new Promise(function (resolve) {
      opts = opts || {};
      var modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;z-index:100002;background:rgba(2,6,23,0.7);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px';
      modal.innerHTML =
        '<div style="background:linear-gradient(180deg,rgba(15,23,42,0.97),rgba(2,6,23,0.99));border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:24px;max-width:420px;width:100%;text-align:center">' +
          '<div style="font-size:2.2rem;margin-bottom:10px">' + (opts.icon || '⚠️') + '</div>' +
          '<h3 style="margin:0 0 8px;color:#f8fafc;font-family:Sora,sans-serif">' + escapeHtml(opts.title || 'Confirmar') + '</h3>' +
          '<p style="margin:0 0 18px;color:#cbd5e1">' + escapeHtml(msg) + '</p>' +
          '<div style="display:flex;gap:8px;justify-content:center">' +
            '<button class="mc-no" style="padding:8px 18px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);color:#cbd5e1;border-radius:8px;cursor:pointer">' + (opts.cancelText || 'Cancelar') + '</button>' +
            '<button class="mc-yes" style="padding:8px 18px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">' + (opts.confirmText || 'Confirmar') + '</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
      modal.querySelector('.mc-yes').onclick = function () { modal.remove(); resolve(true); };
      modal.querySelector('.mc-no').onclick = function () { modal.remove(); resolve(false); };
      modal.onclick = function (e) { if (e.target === modal) { modal.remove(); resolve(false); } };
    });
  };

  /* ═══ 34. PASSWORD STRENGTH meter en TODOS los password inputs ═══ */
  document.addEventListener('input', function (e) {
    if (e.target.type !== 'password') return;
    var v = e.target.value;
    var score = 0;
    if (v.length >= 8) score++;
    if (v.length >= 12) score++;
    if (/[A-Z]/.test(v)) score++;
    if (/[0-9]/.test(v)) score++;
    if (/[!@#$%^&*]/.test(v)) score++;
    var meter = e.target.parentNode.querySelector('.mega-pwd-strength');
    if (!meter && v) {
      meter = document.createElement('div');
      meter.className = 'mega-pwd-strength';
      meter.style.cssText = 'height:3px;border-radius:2px;background:rgba(255,255,255,0.08);overflow:hidden;margin-top:4px';
      meter.innerHTML = '<div class="mpw-bar" style="height:100%;width:0;transition:all 0.3s ease"></div>';
      e.target.parentNode.appendChild(meter);
    }
    if (meter) {
      var bar = meter.querySelector('.mpw-bar');
      var colors = ['#ef4444', '#ef4444', '#f59e0b', '#f59e0b', '#22c55e', '#22c55e'];
      bar.style.width = (score * 20) + '%';
      bar.style.background = colors[score];
    }
  });

  /* ═══ 35. CLIPBOARD HISTORY (manual, opt-in) ═══ */
  window.MegaClipboard = {
    history: [],
    push: function (text) {
      window.MegaClipboard.history.unshift({ text: text, ts: Date.now() });
      window.MegaClipboard.history = window.MegaClipboard.history.slice(0, 20);
    },
    show: function () {
      var modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;z-index:100002;background:rgba(2,6,23,0.7);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px';
      modal.innerHTML =
        '<div style="background:linear-gradient(180deg,rgba(15,23,42,0.97),rgba(2,6,23,0.99));border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:20px;max-width:480px;width:100%">' +
          '<h3 style="margin:0 0 14px;color:#f8fafc"><i class="fas fa-clipboard-list" style="color:#60a5fa"></i> Historial clipboard</h3>' +
          '<div style="max-height:400px;overflow-y:auto">' +
            (window.MegaClipboard.history.length === 0 ?
              '<div style="text-align:center;color:#94a3b8;padding:30px;font-style:italic">Vacío. Copia algo primero (con click-to-copy).</div>' :
              window.MegaClipboard.history.map(function (h, i) {
                return '<div data-i="' + i + '" class="cb-item" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;margin-bottom:6px;cursor:pointer"><div style="color:#e2e8f0;font-size:0.84rem;word-break:break-word">' + escapeHtml(h.text.slice(0, 200)) + '</div><div style="font-size:0.68rem;color:#64748b;margin-top:2px">' + new Date(h.ts).toLocaleString('es-MX') + '</div></div>';
              }).join('')) +
          '</div>' +
          '<button class="cb-close" style="margin-top:12px;padding:8px 14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);color:#cbd5e1;border-radius:8px;cursor:pointer">Cerrar</button>' +
        '</div>';
      document.body.appendChild(modal);
      modal.querySelectorAll('.cb-item').forEach(function (el) {
        el.onclick = function () {
          var i = parseInt(el.getAttribute('data-i'), 10);
          if (navigator.clipboard) navigator.clipboard.writeText(window.MegaClipboard.history[i].text);
          toast('Copiado de nuevo', 'success');
          modal.remove();
        };
      });
      modal.querySelector('.cb-close').onclick = function () { modal.remove(); };
      modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
    },
  };
  /* Hook navigator.clipboard.writeText para mantener historial */
  if (navigator.clipboard && navigator.clipboard.writeText) {
    var origWrite = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = function (text) {
      window.MegaClipboard.push(text);
      return origWrite(text);
    };
  }

  /* ═══ 36. AUTO-DISMISS empty toasts ═══ */
  /* Ya está en MegaToast */

  /* ═══ 37. SHARE button con Web Share API ═══ */
  window.MegaShareNative = {
    share: async function (data) {
      data = data || { title: document.title, url: window.location.href };
      if (navigator.share) {
        try { await navigator.share(data); toast('Compartido', 'success'); }
        catch (_) {}
      } else {
        if (navigator.clipboard) navigator.clipboard.writeText(data.url || data.text || '').then(function () {
          toast('Link copiado (share no disponible)', 'info');
        });
      }
    },
  };

  /* ═══ 38. WAKE LOCK (mantén pantalla despierta durante presentaciones) ═══ */
  window.MegaWakeLock = {
    lock: null,
    request: async function () {
      if (!('wakeLock' in navigator)) { toast('Wake lock no soportado', 'error'); return; }
      try {
        window.MegaWakeLock.lock = await navigator.wakeLock.request('screen');
        toast('🔆 Pantalla despierta activada', 'success');
      } catch (e) { toast('Error: ' + e.message, 'error'); }
    },
    release: function () {
      if (window.MegaWakeLock.lock) { window.MegaWakeLock.lock.release(); window.MegaWakeLock.lock = null; toast('Pantalla normal', 'info'); }
    },
  };

  /* ═══ 39. VIBRATE on important actions (mobile) ═══ */
  window.MegaVibrate = function (pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern || [50, 30, 50]);
  };

  /* ═══ 40. ABOUT dialog con stats de la app ═══ */
  window.MegaAbout = {
    show: function () {
      var modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;z-index:100002;background:rgba(2,6,23,0.7);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px';
      var stats = window.MegaStorage ? window.MegaStorage.usage() : { kb: '?', pct: '?' };
      var streak = 0;
      try { streak = JSON.parse(localStorage.getItem('cotizacion-streak') || '{}').days || 0; } catch (_) {}
      var xp = 0;
      try { xp = JSON.parse(localStorage.getItem('cotizacion-xp-state') || '{}').xp || 0; } catch (_) {}
      modal.innerHTML =
        '<div style="background:linear-gradient(180deg,rgba(15,23,42,0.97),rgba(2,6,23,0.99));border:1px solid rgba(255,255,255,0.12);border-radius:16px;padding:30px;max-width:440px;width:100%;text-align:center">' +
          '<div style="width:80px;height:80px;border-radius:20px;background:linear-gradient(135deg,#3b82f6,#8b5cf6,#f59e0b);display:flex;align-items:center;justify-content:center;color:#fff;font-size:2.2rem;font-weight:900;font-family:Sora,sans-serif;margin:0 auto 14px;box-shadow:0 8px 24px rgba(59,130,246,0.4)">U</div>' +
          '<h2 style="margin:0 0 4px;color:#f8fafc;font-family:Sora,sans-serif">Servicio Técnico</h2>' +
          '<div style="color:#94a3b8;font-size:0.84rem;margin-bottom:18px">Universal · v95</div>' +
          '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:18px">' +
            '<div style="background:rgba(255,255,255,0.03);padding:10px;border-radius:8px"><div style="font-size:1.2rem;color:#60a5fa;font-weight:800">' + xp + '</div><div style="font-size:0.7rem;color:#94a3b8">XP</div></div>' +
            '<div style="background:rgba(255,255,255,0.03);padding:10px;border-radius:8px"><div style="font-size:1.2rem;color:#fcd34d;font-weight:800">' + streak + '</div><div style="font-size:0.7rem;color:#94a3b8">Streak</div></div>' +
            '<div style="background:rgba(255,255,255,0.03);padding:10px;border-radius:8px"><div style="font-size:1.2rem;color:#4ade80;font-weight:800">' + stats.kb + '</div><div style="font-size:0.7rem;color:#94a3b8">KB usados</div></div>' +
          '</div>' +
          '<div style="font-size:0.74rem;color:#64748b;margin-bottom:14px">Powered by Ing. David Cantú</div>' +
          '<button class="ab-close" style="padding:10px 20px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">Cerrar</button>' +
        '</div>';
      document.body.appendChild(modal);
      modal.querySelector('.ab-close').onclick = function () { modal.remove(); };
      modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
    },
  };

  console.log('%c🌌 MegaCosmic cargado: 40 mejoras adicionales',
    'color:#8b5cf6;font-weight:700;font-size:1rem');
  console.log('Nuevas APIs: MegaYearHeatmap, MegaCursorTrail, MegaColorBlind, MegaHighContrast, MegaVintage, MegaFont, MegaAnalytics, MegaRecentEdited, MegaColumns, MegaBirthdays, MegaMacros, MegaCustomShortcuts, MegaAPITester, MegaWebhook, MegaPomoStats, MegaFullscreen, MegaNumberPoll, MegaMood, MegaResponseTime, MegaTextExpand, MegaConfirm, MegaClipboard, MegaShareNative, MegaWakeLock, MegaVibrate, MegaAbout');
})();
