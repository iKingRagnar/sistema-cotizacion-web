/* ════════════════════════════════════════════════════════════════════════
 * MEGA FEATURES OMEGA — Sync, Onboarding, Charts, Calendar, AI autocomplete,
 * Mentions, Tags, Excel export, Import wizard, Widgets drag, Diff, Workflow
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
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) { resolve(); return; }
      var s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = resolve; s.onerror = function () { reject(new Error('Failed: ' + src)); };
      document.head.appendChild(s);
    });
  }

  /* ════════════════════════════════════════════════════════════════
   * 1. SYNC ENTRE TABS (BroadcastChannel — no requiere servidor)
   * ════════════════════════════════════════════════════════════════ */
  var Sync = {
    channel: null,
    init: function () {
      if (!('BroadcastChannel' in window)) return;
      Sync.channel = new BroadcastChannel('cotizacion-sync');
      Sync.channel.onmessage = function (e) {
        var data = e.data || {};
        if (data.type === 'mutation') {
          toast('🔄 Otra pestaña actualizó: ' + data.resource, 'info', { duration: 3000 });
          /* Trigger refresh del panel actual */
          var refresher = window.refreshActivePanelData;
          if (typeof refresher === 'function') {
            try { refresher({ silent: true }); } catch (_) {}
          }
        } else if (data.type === 'theme') {
          if (window.MegaTheme) window.MegaTheme.apply(data.value, false);
        }
      };
      /* Hook fetch para broadcast cambios */
      var origFetch = window.fetch;
      window.fetch = function (input, init) {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var method = (init && init.method || (input && input.method) || 'GET').toUpperCase();
        var p = origFetch.apply(this, arguments);
        if (['POST', 'PUT', 'PATCH', 'DELETE'].indexOf(method) !== -1 && url.indexOf('/api/') !== -1) {
          p.then(function (r) {
            if (r && r.ok && Sync.channel) {
              var match = url.match(/\/api\/([^/?]+)/);
              try {
                Sync.channel.postMessage({
                  type: 'mutation',
                  method: method,
                  resource: match ? match[1] : 'datos',
                  ts: Date.now(),
                });
              } catch (_) {}
            }
          }).catch(function () {});
        }
        return p;
      };
    },
  };
  window.MegaSync = Sync;

  /* ════════════════════════════════════════════════════════════════
   * 2. ONBOARDING TOUR INTERACTIVO
   * ════════════════════════════════════════════════════════════════ */
  var Tour = {
    KEY: 'cotizacion-onboarding-done',
    steps: [
      {
        target: '.sidebar-nav, .tabs.tabs--rail',
        title: '🗂️ Navegación',
        body: 'Aquí están todos los módulos: Clientes, Cotizaciones, Refacciones, Prospección y más. Click para entrar.',
        position: 'right',
      },
      {
        target: '#cmdk, .header-inner',
        title: '⌨️ Paleta de comandos (Ctrl+K)',
        body: 'Presiona <kbd>Ctrl+K</kbd> en cualquier momento para buscar paneles, ejecutar acciones o encontrar clientes.',
        position: 'bottom',
      },
      {
        target: '.davai-fab__button',
        title: '🤖 DavAI — tu asistente IA',
        body: 'Pregúntale lo que sea sobre tu negocio. Responde con datos reales del sistema. También funciona con voz (botón mic).',
        position: 'left',
      },
      {
        target: '.theme-switcher',
        title: '🌗 Tema y personalización',
        body: 'Cambia entre claro y oscuro. También tienes <strong>Density</strong> (compact/spacious) y <strong>Focus mode</strong> (F).',
        position: 'bottom',
      },
      {
        target: '.activity-drawer-btn',
        title: '📜 Actividad reciente',
        body: 'Revisa cada acción que se hace en el sistema (crear, editar, borrar) en tiempo real.',
        position: 'bottom',
      },
    ],
    current: 0,

    isDone: function () {
      try { return localStorage.getItem(Tour.KEY) === '1'; } catch (_) { return true; }
    },

    markDone: function () {
      try { localStorage.setItem(Tour.KEY, '1'); } catch (_) {}
    },

    start: function () {
      Tour.current = 0;
      Tour.show(0);
    },

    show: function (idx) {
      Tour.cleanup();
      if (idx >= Tour.steps.length) { Tour.finish(); return; }
      var step = Tour.steps[idx];
      var target = document.querySelector(step.target);
      if (!target) { Tour.show(idx + 1); return; }
      var rect = target.getBoundingClientRect();

      var overlay = document.createElement('div');
      overlay.id = 'mega-tour-overlay';
      overlay.className = 'mega-tour-overlay';

      var spotlight = document.createElement('div');
      spotlight.className = 'mega-tour-spotlight';
      var pad = 10;
      spotlight.style.cssText =
        'top:' + (rect.top - pad) + 'px;' +
        'left:' + (rect.left - pad) + 'px;' +
        'width:' + (rect.width + pad * 2) + 'px;' +
        'height:' + (rect.height + pad * 2) + 'px;';

      var pop = document.createElement('div');
      pop.className = 'mega-tour-pop mega-tour-pop--' + (step.position || 'bottom');
      var popX, popY;
      if (step.position === 'right') {
        popX = rect.right + 24;
        popY = rect.top + rect.height / 2 - 80;
      } else if (step.position === 'left') {
        popX = rect.left - 360;
        popY = rect.top + rect.height / 2 - 80;
      } else if (step.position === 'top') {
        popX = rect.left + rect.width / 2 - 175;
        popY = rect.top - 200;
      } else {
        popX = rect.left + rect.width / 2 - 175;
        popY = rect.bottom + 24;
      }
      popX = Math.max(20, Math.min(window.innerWidth - 360, popX));
      popY = Math.max(20, Math.min(window.innerHeight - 220, popY));
      pop.style.cssText = 'top:' + popY + 'px;left:' + popX + 'px;';

      pop.innerHTML =
        '<div class="mega-tour-pop__step">Paso ' + (idx + 1) + ' de ' + Tour.steps.length + '</div>' +
        '<h3 class="mega-tour-pop__title">' + step.title + '</h3>' +
        '<p class="mega-tour-pop__body">' + step.body + '</p>' +
        '<div class="mega-tour-pop__actions">' +
          '<button class="mega-tour-pop__btn mega-tour-pop__btn--ghost" data-act="skip">Saltar tour</button>' +
          '<div class="mega-tour-pop__actions-right">' +
            (idx > 0 ? '<button class="mega-tour-pop__btn mega-tour-pop__btn--ghost" data-act="prev">← Atrás</button>' : '') +
            '<button class="mega-tour-pop__btn mega-tour-pop__btn--primary" data-act="next">' +
              (idx === Tour.steps.length - 1 ? '✓ Terminar' : 'Siguiente →') +
            '</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);
      document.body.appendChild(spotlight);
      document.body.appendChild(pop);
      requestAnimationFrame(function () {
        overlay.classList.add('is-open');
        spotlight.classList.add('is-open');
        pop.classList.add('is-open');
      });

      pop.querySelector('[data-act="next"]').addEventListener('click', function () {
        Tour.current++;
        Tour.show(Tour.current);
      });
      pop.querySelector('[data-act="skip"]').addEventListener('click', Tour.finish);
      var prev = pop.querySelector('[data-act="prev"]');
      if (prev) prev.addEventListener('click', function () {
        Tour.current--;
        Tour.show(Tour.current);
      });
    },

    cleanup: function () {
      ['mega-tour-overlay', '.mega-tour-spotlight', '.mega-tour-pop'].forEach(function (sel) {
        document.querySelectorAll(sel.startsWith('.') ? sel : '#' + sel).forEach(function (n) { n.remove(); });
      });
    },

    finish: function () {
      Tour.cleanup();
      Tour.markDone();
      toast('¡Tour completado! Presiona ? para ver atajos en cualquier momento.', 'success');
    },

    init: function () {
      if (!Tour.isDone()) {
        setTimeout(function () {
          /* Solo si está logueado (existe el header completo) */
          if (document.querySelector('.davai-fab__button')) Tour.start();
        }, 3000);
      }
    },
  };
  window.MegaTour = Tour;

  /* ════════════════════════════════════════════════════════════════
   * 3. CHARTS APEXCHARTS reales en dashboard
   * ════════════════════════════════════════════════════════════════ */
  var Charts = {
    rendered: false,

    inject: async function () {
      if (Charts.rendered) return;
      var dashboard = document.getElementById('panel-dashboards');
      if (!dashboard || !dashboard.classList.contains('active')) return;
      Charts.rendered = true;

      try {
        var [cotizaciones, clientes] = await Promise.all([
          fetch('/api/cotizaciones', { headers: { Authorization: 'Bearer ' + getToken() } }).then(function (r) { return r.json(); }).catch(function () { return []; }),
          fetch('/api/clientes', { headers: { Authorization: 'Bearer ' + getToken() } }).then(function (r) { return r.json(); }).catch(function () { return []; }),
        ]);

        var section = document.createElement('section');
        section.className = 'mega-charts-section';
        section.innerHTML =
          '<div class="mega-charts-section__header">' +
            '<h3><i class="fas fa-chart-line"></i> Análisis visual</h3>' +
          '</div>' +
          '<div class="mega-charts-grid">' +
            '<div class="mega-chart-card">' +
              '<div class="mega-chart-card__title">Cotizaciones por tipo</div>' +
              '<div id="mega-chart-tipo" style="min-height:240px"></div>' +
            '</div>' +
            '<div class="mega-chart-card">' +
              '<div class="mega-chart-card__title">Ventas por mes</div>' +
              '<div id="mega-chart-monthly" style="min-height:240px"></div>' +
            '</div>' +
            '<div class="mega-chart-card">' +
              '<div class="mega-chart-card__title">Top 5 clientes (monto)</div>' +
              '<div id="mega-chart-topclientes" style="min-height:240px"></div>' +
            '</div>' +
          '</div>';
        dashboard.appendChild(section);

        if (!window.MegaCharts) return;
        await window.MegaCharts.ensure();
        if (!window.ApexCharts) return;

        /* DONUT por tipo */
        var byTipo = {};
        cotizaciones.forEach(function (c) {
          var k = (c.tipo || 'sin tipo').toLowerCase();
          byTipo[k] = (byTipo[k] || 0) + 1;
        });
        new window.ApexCharts(document.getElementById('mega-chart-tipo'), {
          chart: { type: 'donut', height: 240, background: 'transparent', foreColor: '#cbd5e1' },
          series: Object.values(byTipo),
          labels: Object.keys(byTipo).map(function (s) { return s.charAt(0).toUpperCase() + s.slice(1); }),
          colors: ['#3b82f6', '#8b5cf6', '#f59e0b', '#22c55e'],
          legend: { position: 'bottom', labels: { colors: '#cbd5e1' } },
          theme: { mode: 'dark' },
          dataLabels: { style: { fontSize: '12px', fontWeight: 700 } },
          plotOptions: { pie: { donut: { size: '65%', labels: { show: true, total: { show: true, label: 'Total', color: '#94a3b8' } } } } },
        }).render();

        /* LINE por mes */
        var byMonth = {};
        cotizaciones.forEach(function (c) {
          var d = (c.fecha || '').toString().slice(0, 7);
          if (!d) return;
          byMonth[d] = (byMonth[d] || 0) + (Number(c.total) || 0);
        });
        var months = Object.keys(byMonth).sort();
        new window.ApexCharts(document.getElementById('mega-chart-monthly'), {
          chart: { type: 'area', height: 240, background: 'transparent', foreColor: '#cbd5e1', toolbar: { show: false } },
          series: [{ name: 'MXN', data: months.map(function (m) { return byMonth[m]; }) }],
          xaxis: { categories: months, labels: { style: { colors: '#94a3b8', fontSize: '10px' } } },
          yaxis: { labels: { formatter: function (v) { return '$' + (v / 1000).toFixed(0) + 'k'; }, style: { colors: '#94a3b8' } } },
          colors: ['#60a5fa'],
          stroke: { curve: 'smooth', width: 2 },
          fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] } },
          dataLabels: { enabled: false },
          grid: { borderColor: 'rgba(255,255,255,0.06)' },
          theme: { mode: 'dark' },
          tooltip: { theme: 'dark', y: { formatter: function (v) { return '$' + v.toLocaleString('es-MX'); } } },
        }).render();

        /* BAR top clientes */
        var byClient = {};
        cotizaciones.forEach(function (c) {
          var k = c.cliente_nombre || 'sin cliente';
          byClient[k] = (byClient[k] || 0) + (Number(c.total) || 0);
        });
        var top5 = Object.entries(byClient).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
        new window.ApexCharts(document.getElementById('mega-chart-topclientes'), {
          chart: { type: 'bar', height: 240, background: 'transparent', foreColor: '#cbd5e1', toolbar: { show: false } },
          series: [{ name: 'Total MXN', data: top5.map(function (p) { return p[1]; }) }],
          xaxis: { categories: top5.map(function (p) { return p[0].slice(0, 18); }), labels: { style: { colors: '#94a3b8', fontSize: '10px' } } },
          yaxis: { labels: { formatter: function (v) { return '$' + (v / 1000).toFixed(0) + 'k'; }, style: { colors: '#94a3b8' } } },
          colors: ['#8b5cf6'],
          plotOptions: { bar: { borderRadius: 6, horizontal: false, columnWidth: '60%' } },
          dataLabels: { enabled: false },
          grid: { borderColor: 'rgba(255,255,255,0.06)' },
          theme: { mode: 'dark' },
          tooltip: { theme: 'dark', y: { formatter: function (v) { return '$' + v.toLocaleString('es-MX'); } } },
        }).render();
      } catch (_) {}
    },

    init: function () {
      var dashboard = document.getElementById('panel-dashboards');
      if (!dashboard) return;
      var setup = function () {
        if (dashboard.classList.contains('active')) Charts.inject();
      };
      setTimeout(setup, 1800);
      var obs = new MutationObserver(setup);
      obs.observe(dashboard, { attributes: true, attributeFilter: ['class'] });
    },
  };
  window.MegaDashCharts = Charts;

  /* ════════════════════════════════════════════════════════════════
   * 4. CALENDAR VIEW para garantías (vista mensual)
   * ════════════════════════════════════════════════════════════════ */
  var Calendar = {
    inject: async function () {
      var panel = document.getElementById('panel-mantenimiento-garantia') ||
                  document.getElementById('panel-garantias');
      if (!panel || !panel.classList.contains('active')) return;
      if (panel.dataset.calendarInjected) return;
      panel.dataset.calendarInjected = '1';

      var section = document.createElement('section');
      section.className = 'mega-calendar-section';
      section.innerHTML =
        '<div class="mega-calendar-section__header">' +
          '<h3><i class="fas fa-calendar-alt"></i> Calendario de mantenimientos</h3>' +
          '<div class="mega-calendar-nav">' +
            '<button class="mega-calendar-btn" data-nav="prev">←</button>' +
            '<span class="mega-calendar-month" id="mega-calendar-month"></span>' +
            '<button class="mega-calendar-btn" data-nav="next">→</button>' +
            '<button class="mega-calendar-btn" data-nav="today">Hoy</button>' +
          '</div>' +
        '</div>' +
        '<div class="mega-calendar-grid" id="mega-calendar-grid"></div>';
      panel.appendChild(section);

      var current = new Date();
      try {
        var rows = await fetch('/api/garantias', { headers: { Authorization: 'Bearer ' + getToken() } })
          .then(function (r) { return r.json(); }).catch(function () { return []; });
        var events = [];
        (rows || []).forEach(function (g) {
          (g.mantenimientos || []).forEach(function (m) {
            if (m.fecha_programada) {
              events.push({ date: m.fecha_programada.slice(0, 10), label: g.numero_serie || g.modelo_maquina || 'Garantía', status: m.estado });
            }
          });
        });

        var render = function () {
          var year = current.getFullYear();
          var month = current.getMonth();
          var first = new Date(year, month, 1);
          var firstDow = first.getDay();
          var daysInMonth = new Date(year, month + 1, 0).getDate();
          var monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
          document.getElementById('mega-calendar-month').textContent = monthNames[month] + ' ' + year;

          var grid = document.getElementById('mega-calendar-grid');
          var html = '';
          ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].forEach(function (d) {
            html += '<div class="mega-calendar-dow">' + d + '</div>';
          });
          for (var i = 0; i < firstDow; i++) html += '<div class="mega-calendar-day mega-calendar-day--empty"></div>';
          for (var day = 1; day <= daysInMonth; day++) {
            var date = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
            var todayCls = date === new Date().toISOString().slice(0, 10) ? ' is-today' : '';
            var dayEvents = events.filter(function (e) { return e.date === date; });
            html += '<div class="mega-calendar-day' + todayCls + '" data-date="' + date + '">' +
              '<div class="mega-calendar-day__num">' + day + '</div>' +
              dayEvents.slice(0, 3).map(function (e) {
                return '<div class="mega-calendar-event" title="' + escapeHtml(e.label) + '">' + escapeHtml(e.label.slice(0, 14)) + '</div>';
              }).join('') +
              (dayEvents.length > 3 ? '<div class="mega-calendar-more">+' + (dayEvents.length - 3) + ' más</div>' : '') +
            '</div>';
          }
          grid.innerHTML = html;
        };

        render();
        section.querySelectorAll('[data-nav]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var nav = btn.getAttribute('data-nav');
            if (nav === 'prev') current.setMonth(current.getMonth() - 1);
            else if (nav === 'next') current.setMonth(current.getMonth() + 1);
            else current = new Date();
            render();
          });
        });
      } catch (_) {}
    },

    init: function () {
      var setup = function () { Calendar.inject(); };
      setTimeout(setup, 1500);
      var obs = new MutationObserver(setup);
      ['panel-mantenimiento-garantia', 'panel-garantias'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) obs.observe(el, { attributes: true, attributeFilter: ['class'] });
      });
    },
  };
  window.MegaCalendar = Calendar;

  /* ════════════════════════════════════════════════════════════════
   * 5. AI AUTOCOMPLETE INLINE en formularios
   * ════════════════════════════════════════════════════════════════ */
  var AICompletion = {
    debounceTimer: null,
    activeInput: null,

    SUGGESTABLE: 'textarea[name="descripcion"], textarea[name="notas"], textarea[name="observaciones"], textarea[name="actividades"]',

    init: function () {
      document.addEventListener('focusin', function (e) {
        if (!e.target.matches(AICompletion.SUGGESTABLE)) return;
        AICompletion.activeInput = e.target;
        AICompletion.attachListener(e.target);
      });
    },

    attachListener: function (el) {
      if (el.dataset.aiAttached) return;
      el.dataset.aiAttached = '1';
      el.addEventListener('input', function () {
        clearTimeout(AICompletion.debounceTimer);
        var val = el.value;
        if (val.length < 12) { AICompletion.hideSuggestion(); return; }
        AICompletion.debounceTimer = setTimeout(function () {
          AICompletion.suggest(el, val);
        }, 1200);
      });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Tab' && AICompletion.suggestion) {
          e.preventDefault();
          AICompletion.accept();
        }
      });
    },

    suggest: async function (el, text) {
      try {
        var resp = await fetch('/api/davai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
          body: JSON.stringify({
            message: 'Completa este texto profesional en español, máximo 30 palabras adicionales (responde SOLO con la continuación, sin prefijos): "' + text + '"',
          }),
        });
        if (!resp.ok) return;
        var reader = resp.body.getReader();
        var dec = new TextDecoder();
        var buf = '', completion = '';
        while (true) {
          var r = await reader.read();
          if (r.done) break;
          buf += dec.decode(r.value, { stream: true });
          var lines = buf.split('\n');
          buf = lines.pop() || '';
          for (var i = 0; i < lines.length; i++) {
            var ln = lines[i];
            if (ln.startsWith('data: ')) {
              var raw = ln.slice(6);
              if (raw === '[DONE]') break;
              try {
                var p = JSON.parse(raw);
                if (p.text) completion += p.text;
              } catch (_) {}
            }
          }
        }
        completion = completion.trim().replace(/^["']|["']$/g, '');
        if (completion && completion.length < 200) {
          AICompletion.showSuggestion(el, completion);
        }
      } catch (_) {}
    },

    showSuggestion: function (el, text) {
      AICompletion.hideSuggestion();
      AICompletion.suggestion = text;
      var s = document.createElement('div');
      s.id = 'mega-ai-suggestion';
      s.className = 'mega-ai-suggestion';
      var rect = el.getBoundingClientRect();
      s.style.cssText =
        'position:fixed;top:' + (rect.bottom + 6) + 'px;' +
        'left:' + rect.left + 'px;width:' + rect.width + 'px;';
      s.innerHTML =
        '<div class="mega-ai-suggestion__label">' +
          '<i class="fas fa-robot"></i> DavAI sugiere — <kbd>Tab</kbd> para aceptar' +
        '</div>' +
        '<div class="mega-ai-suggestion__text">' + escapeHtml(text) + '</div>';
      document.body.appendChild(s);
    },

    hideSuggestion: function () {
      AICompletion.suggestion = null;
      var s = document.getElementById('mega-ai-suggestion');
      if (s) s.remove();
    },

    accept: function () {
      if (!AICompletion.activeInput || !AICompletion.suggestion) return;
      var el = AICompletion.activeInput;
      var sep = el.value.endsWith(' ') || el.value.endsWith('\n') ? '' : ' ';
      el.value = el.value + sep + AICompletion.suggestion;
      AICompletion.hideSuggestion();
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
  };
  window.MegaAIComp = AICompletion;

  /* ════════════════════════════════════════════════════════════════
   * 6. @MENTIONS en notas / textareas
   * ════════════════════════════════════════════════════════════════ */
  var Mentions = {
    users: [],
    activeInput: null,

    init: function () {
      Mentions.loadUsers();
      document.addEventListener('input', function (e) {
        if (e.target.tagName !== 'TEXTAREA') return;
        var val = e.target.value;
        var caret = e.target.selectionStart;
        var before = val.slice(0, caret);
        var match = before.match(/@(\w*)$/);
        if (match) {
          Mentions.activeInput = e.target;
          Mentions.show(match[1], e.target);
        } else {
          Mentions.hide();
        }
      });
    },

    loadUsers: async function () {
      try {
        var rows = await fetch('/api/clientes', { headers: { Authorization: 'Bearer ' + getToken() } })
          .then(function (r) { return r.json(); }).catch(function () { return []; });
        Mentions.users = (rows || []).slice(0, 50).map(function (c) {
          return { name: c.nombre, kind: 'cliente' };
        });
      } catch (_) {}
    },

    show: function (q, el) {
      Mentions.hide();
      var matches = Mentions.users.filter(function (u) {
        return u.name && u.name.toLowerCase().indexOf(q.toLowerCase()) !== -1;
      }).slice(0, 6);
      if (!matches.length) return;
      var rect = el.getBoundingClientRect();
      var dd = document.createElement('div');
      dd.id = 'mega-mentions';
      dd.className = 'mega-mentions';
      dd.style.cssText = 'position:fixed;top:' + (rect.top - 8 - matches.length * 38) + 'px;left:' + rect.left + 'px;width:260px;';
      dd.innerHTML = matches.map(function (u, i) {
        var initials = (u.name.split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2)).toUpperCase();
        return '<div class="mega-mentions__item" data-i="' + i + '" data-name="' + escapeHtml(u.name) + '">' +
          '<span class="mega-mentions__avatar">' + initials + '</span>' +
          '<span class="mega-mentions__name">' + escapeHtml(u.name) + '</span>' +
          '<span class="mega-mentions__kind">' + u.kind + '</span>' +
        '</div>';
      }).join('');
      document.body.appendChild(dd);
      dd.querySelectorAll('.mega-mentions__item').forEach(function (it) {
        it.addEventListener('click', function () {
          var name = it.getAttribute('data-name');
          Mentions.insert(name);
        });
      });
    },

    insert: function (name) {
      if (!Mentions.activeInput) return;
      var el = Mentions.activeInput;
      var caret = el.selectionStart;
      var before = el.value.slice(0, caret).replace(/@\w*$/, '@' + name + ' ');
      var after = el.value.slice(caret);
      el.value = before + after;
      el.selectionStart = el.selectionEnd = before.length;
      el.focus();
      Mentions.hide();
    },

    hide: function () {
      var d = document.getElementById('mega-mentions');
      if (d) d.remove();
    },
  };
  window.MegaMentions = Mentions;

  /* ════════════════════════════════════════════════════════════════
   * 7. TAG SYSTEM color-coded (persiste en localStorage)
   * ════════════════════════════════════════════════════════════════ */
  var Tags = {
    KEY: 'cotizacion-tags',
    TAG_COLORS: ['#3b82f6', '#8b5cf6', '#f59e0b', '#22c55e', '#ec4899', '#06b6d4', '#ef4444'],

    all: function () {
      try { return JSON.parse(localStorage.getItem(Tags.KEY) || '{}'); }
      catch (_) { return {}; }
    },

    save: function (data) {
      try { localStorage.setItem(Tags.KEY, JSON.stringify(data)); } catch (_) {}
    },

    /* getTagsFor(resource, id) → ['urgente', 'vip'] */
    getFor: function (resource, id) {
      var all = Tags.all();
      var key = resource + ':' + id;
      return (all[key] || []).slice();
    },

    add: function (resource, id, tag) {
      var all = Tags.all();
      var key = resource + ':' + id;
      all[key] = all[key] || [];
      if (all[key].indexOf(tag) === -1) all[key].push(tag);
      Tags.save(all);
    },

    remove: function (resource, id, tag) {
      var all = Tags.all();
      var key = resource + ':' + id;
      if (all[key]) {
        all[key] = all[key].filter(function (t) { return t !== tag; });
      }
      Tags.save(all);
    },

    colorFor: function (tag) {
      var h = 0;
      for (var i = 0; i < tag.length; i++) h = ((h << 5) - h) + tag.charCodeAt(i);
      return Tags.TAG_COLORS[Math.abs(h) % Tags.TAG_COLORS.length];
    },

    renderChip: function (tag) {
      var c = Tags.colorFor(tag);
      return '<span class="mega-tag" style="background:' + c + '20;color:' + c + ';border-color:' + c + '60">' +
        '#' + escapeHtml(tag) + '</span>';
    },
  };
  window.MegaTags = Tags;

  /* ════════════════════════════════════════════════════════════════
   * 8. EXPORT EXCEL formateado (SheetJS xlsx ya está en deps)
   * ════════════════════════════════════════════════════════════════ */
  var Excel = {
    exportTable: async function (tableId, opts) {
      opts = opts || {};
      try { await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'); } catch (_) { return; }
      if (!window.XLSX) { toast('XLSX no disponible', 'error'); return; }
      var table = document.getElementById(tableId);
      if (!table) return;

      /* Extraer headers y rows visibles */
      var headers = Array.from(table.querySelectorAll('thead tr:first-child th'))
        .filter(function (th) { return !th.classList.contains('th-actions') && !th.classList.contains('bulk-check-th'); })
        .map(function (th) { return (th.textContent || '').trim(); });
      var rows = Array.from(table.querySelectorAll('tbody tr'))
        .filter(function (tr) { return !tr.classList.contains('empty-row') && !tr.classList.contains('no-data'); })
        .map(function (tr) {
          return Array.from(tr.querySelectorAll('td'))
            .filter(function (td) { return !td.classList.contains('actions') && !td.classList.contains('th-actions') && !td.classList.contains('bulk-check-td'); })
            .map(function (td) { return (td.textContent || '').trim(); });
        });

      var data = [headers].concat(rows);
      var ws = window.XLSX.utils.aoa_to_sheet(data);

      /* Set column widths */
      ws['!cols'] = headers.map(function () { return { wch: 18 }; });

      /* Estilo headers (bold, bg azul) */
      var range = window.XLSX.utils.decode_range(ws['!ref']);
      for (var c = range.s.c; c <= range.e.c; c++) {
        var cell = ws[window.XLSX.utils.encode_cell({ r: 0, c: c })];
        if (cell) {
          cell.s = {
            fill: { patternType: 'solid', fgColor: { rgb: '3B82F6' } },
            font: { bold: true, color: { rgb: 'FFFFFF' } },
            alignment: { horizontal: 'left', vertical: 'center' },
          };
        }
      }

      var wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, opts.sheetName || 'Datos');
      var fname = (opts.filename || tableId) + '-' + Date.now() + '.xlsx';
      window.XLSX.writeFile(wb, fname);
      toast('Excel descargado: ' + fname, 'success');
    },

    /* Auto-inject botón Excel en toolbars (aprovechando el patrón del PDF) */
    init: function () {
      var setup = function () {
        document.querySelectorAll('.table-wrap > table').forEach(function (table) {
          if (!table.id) return;
          var section = table.closest('section, .panel');
          if (!section) return;
          var toolbar = section.querySelector('.toolbar, .panel-toolbar, .section-header .toolbar');
          if (!toolbar || toolbar.querySelector('.mega-excel-btn')) return;
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn outline mega-excel-btn';
          btn.title = 'Exportar a Excel formateado';
          btn.innerHTML = '<i class="fas fa-file-excel"></i> Excel';
          btn.addEventListener('click', function () {
            Excel.exportTable(table.id, { filename: table.id });
          });
          toolbar.appendChild(btn);
        });
      };
      setup();
      var obs = new MutationObserver(function () {
        clearTimeout(window.__excelDebounce);
        window.__excelDebounce = setTimeout(setup, 700);
      });
      obs.observe(document.body, { childList: true, subtree: true });
    },
  };
  window.MegaExcel = Excel;

  /* ════════════════════════════════════════════════════════════════
   * 9. BULK IMPORT WIZARD (multi-step CSV/Excel)
   * ════════════════════════════════════════════════════════════════ */
  var Wizard = {
    open: function () {
      if (document.getElementById('mega-import-wizard')) return;
      var wrap = document.createElement('div');
      wrap.id = 'mega-import-wizard';
      wrap.className = 'mega-import-wizard';
      wrap.innerHTML =
        '<div class="mega-import-wizard__panel">' +
          '<div class="mega-import-wizard__header">' +
            '<h3><i class="fas fa-file-import"></i> Importar datos</h3>' +
            '<button class="mega-import-wizard__close" aria-label="Cerrar">×</button>' +
          '</div>' +
          '<div class="mega-import-wizard__steps">' +
            '<div class="mega-import-wizard__step is-active">1. Archivo</div>' +
            '<div class="mega-import-wizard__step">2. Mapping</div>' +
            '<div class="mega-import-wizard__step">3. Confirmar</div>' +
          '</div>' +
          '<div class="mega-import-wizard__body">' +
            '<div class="mega-import-wizard__dropzone">' +
              '<i class="fas fa-cloud-upload-alt"></i>' +
              '<div>Arrastra un archivo CSV/Excel aquí o haz click para elegir</div>' +
              '<input type="file" id="mega-import-file" accept=".csv,.xlsx,.xls" style="display:none">' +
              '<button class="btn primary" id="mega-import-pick">Elegir archivo</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      document.body.appendChild(wrap);
      requestAnimationFrame(function () { wrap.classList.add('is-open'); });

      var close = function () {
        wrap.classList.remove('is-open');
        setTimeout(function () { try { wrap.remove(); } catch (_) {} }, 220);
      };
      wrap.querySelector('.mega-import-wizard__close').addEventListener('click', close);
      wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
      wrap.querySelector('#mega-import-pick').addEventListener('click', function () {
        document.getElementById('mega-import-file').click();
      });
      wrap.querySelector('#mega-import-file').addEventListener('change', function (e) {
        if (e.target.files[0]) {
          Wizard.handleFile(e.target.files[0], wrap);
        }
      });
      var dz = wrap.querySelector('.mega-import-wizard__dropzone');
      dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('is-dragging'); });
      dz.addEventListener('dragleave', function () { dz.classList.remove('is-dragging'); });
      dz.addEventListener('drop', function (e) {
        e.preventDefault();
        dz.classList.remove('is-dragging');
        if (e.dataTransfer.files[0]) Wizard.handleFile(e.dataTransfer.files[0], wrap);
      });
    },

    handleFile: async function (file, wrap) {
      try { await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'); } catch (_) {}
      if (!window.XLSX) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        var data = new Uint8Array(e.target.result);
        var wb = window.XLSX.read(data, { type: 'array' });
        var sheet = wb.Sheets[wb.SheetNames[0]];
        var rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
        Wizard.showPreview(rows, wrap);
      };
      reader.readAsArrayBuffer(file);
    },

    showPreview: function (rows, wrap) {
      var headers = rows[0] || [];
      var data = rows.slice(1, 6);
      var body = wrap.querySelector('.mega-import-wizard__body');
      var steps = wrap.querySelectorAll('.mega-import-wizard__step');
      steps[0].classList.remove('is-active');
      steps[1].classList.add('is-active');
      body.innerHTML =
        '<div class="mega-import-wizard__preview">' +
          '<p style="color:#94a3b8;font-size:0.84rem;margin:0 0 12px">' +
            'Detectadas <strong style="color:#f8fafc">' + (rows.length - 1) + ' filas</strong> y <strong style="color:#f8fafc">' + headers.length + ' columnas</strong>.' +
          '</p>' +
          '<div style="overflow:auto;max-height:300px;border:1px solid rgba(255,255,255,0.08);border-radius:8px">' +
            '<table style="width:100%;border-collapse:collapse;font-size:0.78rem">' +
              '<thead><tr>' +
                headers.map(function (h) { return '<th style="padding:6px 10px;text-align:left;background:rgba(59,130,246,0.18);color:#93c5fd;border:1px solid rgba(255,255,255,0.06)">' + escapeHtml(h) + '</th>'; }).join('') +
              '</tr></thead>' +
              '<tbody>' +
                data.map(function (row) {
                  return '<tr>' + headers.map(function (_, i) {
                    return '<td style="padding:5px 10px;border:1px solid rgba(255,255,255,0.04);color:#e2e8f0">' + escapeHtml(row[i] || '') + '</td>';
                  }).join('') + '</tr>';
                }).join('') +
              '</tbody>' +
            '</table>' +
          '</div>' +
          '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">' +
            '<button class="btn outline">Cancelar</button>' +
            '<button class="btn primary" disabled title="Endpoint backend de import requerido">Importar (no disponible)</button>' +
          '</div>' +
          '<p style="color:#94a3b8;font-size:0.74rem;margin-top:8px;text-align:center;font-style:italic">' +
            'El import al backend requiere endpoint /api/import/&lt;tabla&gt; (no implementado por defecto).' +
          '</p>' +
        '</div>';
    },
  };
  window.MegaImportWizard = Wizard;

  /* ════════════════════════════════════════════════════════════════
   * 10. DASHBOARD WIDGETS DRAG-DROP (SortableJS CDN)
   * ════════════════════════════════════════════════════════════════ */
  var WidgetsDrag = {
    KEY: 'cotizacion-widgets-order',

    init: function () {
      var dashboard = document.getElementById('panel-dashboards');
      if (!dashboard) return;
      var setup = function () {
        if (!dashboard.classList.contains('active')) return;
        loadScript('https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js').then(function () {
          if (!window.Sortable) return;
          /* Encontrar grid de scorecards */
          var grids = dashboard.querySelectorAll('.scorecards-grid, .stat-cards-grid, .kpi-grid, .grid-3, .grid-4');
          grids.forEach(function (g) {
            if (g.dataset.sortableInited) return;
            g.dataset.sortableInited = '1';
            window.Sortable.create(g, {
              animation: 250,
              handle: '.scorecard, .stat-card, .kpi-card',
              ghostClass: 'mega-widget-ghost',
              chosenClass: 'mega-widget-chosen',
              onEnd: function () {
                var order = Array.from(g.children).map(function (n, i) { return n.id || ('w-' + i); });
                try { localStorage.setItem(WidgetsDrag.KEY, JSON.stringify(order)); } catch (_) {}
                toast('Orden de widgets guardado', 'success', { duration: 2000 });
              },
            });
            /* Hint visual */
            g.classList.add('mega-widgets-sortable');
          });
        }).catch(function () {});
      };
      setTimeout(setup, 2000);
      var obs = new MutationObserver(setup);
      obs.observe(dashboard, { attributes: true, attributeFilter: ['class'] });
    },
  };
  window.MegaWidgetsDrag = WidgetsDrag;

  /* ════════════════════════════════════════════════════════════════
   * 11. VISUAL DIFF cotizaciones (compara dos versiones)
   * ════════════════════════════════════════════════════════════════ */
  var Diff = {
    /* Diff simple word-level */
    compute: function (a, b) {
      a = String(a || ''); b = String(b || '');
      if (a === b) return [{ type: 'same', text: a }];
      var aw = a.split(/(\s+)/);
      var bw = b.split(/(\s+)/);
      var out = [];
      var i = 0, j = 0;
      while (i < aw.length || j < bw.length) {
        if (aw[i] === bw[j]) {
          out.push({ type: 'same', text: aw[i] || '' });
          i++; j++;
        } else if (j < bw.length && bw.indexOf(aw[i], j + 1) > j) {
          out.push({ type: 'add', text: bw[j] });
          j++;
        } else if (i < aw.length) {
          out.push({ type: 'del', text: aw[i] });
          i++;
        } else {
          out.push({ type: 'add', text: bw[j] });
          j++;
        }
      }
      return out;
    },

    show: function (oldText, newText, title) {
      var diff = Diff.compute(oldText, newText);
      var wrap = document.createElement('div');
      wrap.id = 'mega-diff';
      wrap.className = 'mega-diff';
      wrap.innerHTML =
        '<div class="mega-diff__panel">' +
          '<div class="mega-diff__header">' +
            '<h3><i class="fas fa-code-compare"></i> ' + escapeHtml(title || 'Comparación de versiones') + '</h3>' +
            '<button class="mega-diff__close">×</button>' +
          '</div>' +
          '<div class="mega-diff__body">' +
            diff.map(function (d) {
              if (d.type === 'add') return '<span class="mega-diff__add">' + escapeHtml(d.text) + '</span>';
              if (d.type === 'del') return '<span class="mega-diff__del">' + escapeHtml(d.text) + '</span>';
              return escapeHtml(d.text);
            }).join('') +
          '</div>' +
          '<div class="mega-diff__legend">' +
            '<span><span class="mega-diff__add">verde</span> = agregado</span>' +
            '<span><span class="mega-diff__del">rojo tachado</span> = eliminado</span>' +
          '</div>' +
        '</div>';
      document.body.appendChild(wrap);
      requestAnimationFrame(function () { wrap.classList.add('is-open'); });
      var close = function () {
        wrap.classList.remove('is-open');
        setTimeout(function () { try { wrap.remove(); } catch (_) {} }, 200);
      };
      wrap.querySelector('.mega-diff__close').addEventListener('click', close);
      wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    },
  };
  window.MegaDiff = Diff;

  /* ════════════════════════════════════════════════════════════════
   * 12. WORKFLOW BUILDER (MVP visual con steps)
   * ════════════════════════════════════════════════════════════════ */
  var Workflow = {
    show: function () {
      if (document.getElementById('mega-workflow')) return;
      var wrap = document.createElement('div');
      wrap.id = 'mega-workflow';
      wrap.className = 'mega-workflow';
      wrap.innerHTML =
        '<div class="mega-workflow__panel">' +
          '<div class="mega-workflow__header">' +
            '<h3><i class="fas fa-project-diagram"></i> Constructor de flujos</h3>' +
            '<button class="mega-workflow__close">×</button>' +
          '</div>' +
          '<div class="mega-workflow__body">' +
            '<div class="mega-workflow__canvas" id="mega-workflow-canvas">' +
              '<div class="mega-workflow__node" data-step="trigger">' +
                '<i class="fas fa-bolt"></i><div>Trigger: Nueva cotización</div>' +
              '</div>' +
              '<div class="mega-workflow__arrow">↓</div>' +
              '<div class="mega-workflow__node" data-step="condition">' +
                '<i class="fas fa-question"></i><div>Si total > $10,000</div>' +
              '</div>' +
              '<div class="mega-workflow__arrow">↓</div>' +
              '<div class="mega-workflow__node" data-step="action">' +
                '<i class="fas fa-envelope"></i><div>Notificar a admin por email</div>' +
              '</div>' +
              '<div class="mega-workflow__arrow">↓</div>' +
              '<div class="mega-workflow__node mega-workflow__node--add">' +
                '<i class="fas fa-plus"></i><div>Agregar paso</div>' +
              '</div>' +
            '</div>' +
            '<p style="color:#94a3b8;font-size:0.8rem;text-align:center;margin-top:12px;font-style:italic">' +
              'Workflow MVP visual. Ejecución backend pendiente — usa este lienzo para diseñar tu lógica y compártela con el equipo.' +
            '</p>' +
          '</div>' +
        '</div>';
      document.body.appendChild(wrap);
      requestAnimationFrame(function () { wrap.classList.add('is-open'); });
      var close = function () {
        wrap.classList.remove('is-open');
        setTimeout(function () { try { wrap.remove(); } catch (_) {} }, 200);
      };
      wrap.querySelector('.mega-workflow__close').addEventListener('click', close);
      wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    },
  };
  window.MegaWorkflow = Workflow;

  /* ════════════════════════════════════════════════════════════════
   * BOOT
   * ════════════════════════════════════════════════════════════════ */
  function boot() {
    Sync.init();
    Tour.init();
    Charts.init();
    Calendar.init();
    AICompletion.init();
    Mentions.init();
    Excel.init();
    WidgetsDrag.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
