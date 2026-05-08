/* ════════════════════════════════════════════════════════════════════════
 * MEGA FEATURES TITANIUM — AI Insights, Journey Timeline, Pomodoro,
 * QR Generator, Smart Reminders, Sales Funnel
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
  function fetchJson(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'Authorization': 'Bearer ' + getToken() }, opts.headers || {});
    return fetch(url, opts).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
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
   * 1. AI INSIGHTS DAILY — 3 insights generados localmente
   * ════════════════════════════════════════════════════════════════ */
  var Insights = {
    KEY: 'cotizacion-insights-cache',

    generate: async function () {
      try {
        var [cot, cli, pro, inc] = await Promise.all([
          fetchJson('/api/cotizaciones').catch(function () { return []; }),
          fetchJson('/api/clientes').catch(function () { return []; }),
          fetchJson('/api/prospectos').catch(function () { return []; }),
          fetchJson('/api/incidentes').catch(function () { return []; }),
        ]);

        var insights = [];

        /* Insight 1: Top cliente del mes */
        var monthAgo = Date.now() - 30 * 86400000;
        var monthCot = cot.filter(function (c) {
          return new Date(c.fecha).getTime() >= monthAgo;
        });
        if (monthCot.length > 0) {
          var byClient = {};
          monthCot.forEach(function (c) {
            var k = c.cliente_nombre || 'sin';
            byClient[k] = (byClient[k] || 0) + (Number(c.total) || 0);
          });
          var top = Object.entries(byClient).sort(function (a, b) { return b[1] - a[1]; })[0];
          if (top && top[1] > 0) {
            insights.push({
              icon: '🏆',
              color: '#f59e0b',
              title: 'Top cliente del mes',
              body: '<strong>' + escapeHtml(top[0]) + '</strong> generó <strong>$' + Math.round(top[1]).toLocaleString('es-MX') + '</strong> MXN en cotizaciones.',
              cta: { label: 'Ver cliente', tab: 'clientes', filter: { nombre: top[0] } },
            });
          }
        }

        /* Insight 2: Prospectos calientes sin seguimiento */
        var hotProspectos = pro.filter(function (p) {
          return (Number(p.score_ia) || 0) >= 70 &&
                 ['prospecto', 'contactado'].indexOf((p.estado || '').toLowerCase()) >= 0;
        });
        if (hotProspectos.length > 0) {
          insights.push({
            icon: '🔥',
            color: '#ef4444',
            title: hotProspectos.length + ' prospectos calientes',
            body: 'Tienes <strong>' + hotProspectos.length + ' prospectos con score IA ≥70</strong> sin avanzar más allá de "Contactado". Considera proponer.',
            cta: { label: 'Ver pipeline', tab: 'prospeccion' },
          });
        }

        /* Insight 3: Incidentes críticos abiertos */
        var critical = inc.filter(function (i) {
          return (i.prioridad || '').toLowerCase() === 'critica' && (i.estatus || '').toLowerCase() !== 'cerrado';
        });
        if (critical.length > 0) {
          insights.push({
            icon: '⚠️',
            color: '#ef4444',
            title: critical.length + ' incidentes críticos',
            body: 'Hay <strong>' + critical.length + ' incidentes críticos abiertos</strong>. Atiéndelos antes que afecten la satisfacción.',
            cta: { label: 'Ver bitácora', tab: 'bitacoras' },
          });
        }

        /* Insight 4: Tendencia ventas */
        if (cot.length >= 4) {
          var thisMonth = monthCot.reduce(function (s, c) { return s + (Number(c.total) || 0); }, 0);
          var prevMonth = cot.filter(function (c) {
            var t = new Date(c.fecha).getTime();
            return t < monthAgo && t >= (monthAgo - 30 * 86400000);
          }).reduce(function (s, c) { return s + (Number(c.total) || 0); }, 0);
          if (prevMonth > 0) {
            var pct = ((thisMonth - prevMonth) / prevMonth) * 100;
            if (Math.abs(pct) > 5) {
              insights.push({
                icon: pct > 0 ? '📈' : '📉',
                color: pct > 0 ? '#22c55e' : '#ef4444',
                title: 'Ventas vs mes anterior',
                body: 'Este mes vs anterior: <strong>' + (pct > 0 ? '+' : '') + pct.toFixed(1) + '%</strong> ($' + Math.round(thisMonth).toLocaleString('es-MX') + ' vs $' + Math.round(prevMonth).toLocaleString('es-MX') + ').',
                cta: { label: 'Ver dashboard', tab: 'dashboards' },
              });
            }
          }
        }

        /* Insight 5: Clientes nuevos esta semana */
        var weekAgo = Date.now() - 7 * 86400000;
        var newClients = cli.filter(function (c) {
          var t = new Date(c.fecha_alta || c.created_at || 0).getTime();
          return t >= weekAgo;
        });
        if (newClients.length > 0) {
          insights.push({
            icon: '🌟',
            color: '#22c55e',
            title: newClients.length + ' nuevos clientes esta semana',
            body: 'Excelente actividad de captación. <strong>' + newClients.map(function (c) { return c.nombre; }).slice(0, 3).join(', ') + '</strong>' + (newClients.length > 3 ? ' y ' + (newClients.length - 3) + ' más' : '') + '.',
            cta: { label: 'Ver clientes', tab: 'clientes' },
          });
        }

        return insights.slice(0, 3);
      } catch (_) { return []; }
    },

    inject: async function () {
      var dashboard = document.getElementById('panel-dashboards');
      if (!dashboard || !dashboard.classList.contains('active')) return;
      if (dashboard.dataset.insightsInjected) return;
      dashboard.dataset.insightsInjected = '1';

      var section = document.createElement('section');
      section.className = 'mega-insights-section';
      section.innerHTML =
        '<div class="mega-insights-section__header">' +
          '<h3><i class="fas fa-lightbulb"></i> Insights del día <span class="mega-insights-section__badge">DavAI</span></h3>' +
          '<button class="mega-insights-section__refresh" title="Regenerar"><i class="fas fa-sync-alt"></i></button>' +
        '</div>' +
        '<div class="mega-insights-cards" id="mega-insights-cards"><div class="mega-insights-loading">Analizando datos...</div></div>';
      /* Insertar arriba del dashboard */
      dashboard.insertBefore(section, dashboard.firstChild.nextSibling || null);

      var refresh = async function () {
        var box = document.getElementById('mega-insights-cards');
        box.innerHTML = '<div class="mega-insights-loading">Analizando datos...</div>';
        var ins = await Insights.generate();
        if (ins.length === 0) {
          box.innerHTML = '<div class="mega-insights-empty">Sin insights nuevos. Sigue trabajando para generar más datos.</div>';
          return;
        }
        box.innerHTML = ins.map(function (i, idx) {
          return '<div class="mega-insight-card" style="--insight-color:' + i.color + '">' +
            '<div class="mega-insight-card__icon">' + i.icon + '</div>' +
            '<div class="mega-insight-card__body">' +
              '<div class="mega-insight-card__title">' + escapeHtml(i.title) + '</div>' +
              '<div class="mega-insight-card__text">' + i.body + '</div>' +
              (i.cta ? '<button class="mega-insight-card__cta" data-i="' + idx + '">' + escapeHtml(i.cta.label) + ' →</button>' : '') +
            '</div>' +
          '</div>';
        }).join('');
        box.querySelectorAll('.mega-insight-card__cta').forEach(function (b, i) {
          b.addEventListener('click', function () {
            var cta = ins[i].cta;
            if (cta && cta.tab) {
              var tabBtn = document.querySelector('[data-tab="' + cta.tab + '"]');
              if (tabBtn) tabBtn.click();
              if (cta.filter) {
                setTimeout(function () {
                  Object.keys(cta.filter).forEach(function (k) {
                    var inp = document.querySelector('#tabla-' + cta.tab + ' input[data-key="' + k + '"]');
                    if (inp) {
                      inp.value = cta.filter[k];
                      inp.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                  });
                }, 600);
              }
            }
          });
        });
      };
      refresh();
      section.querySelector('.mega-insights-section__refresh').addEventListener('click', refresh);
    },

    init: function () {
      var setup = function () { Insights.inject(); };
      setTimeout(setup, 2000);
      var dashboard = document.getElementById('panel-dashboards');
      if (dashboard) {
        var obs = new MutationObserver(setup);
        obs.observe(dashboard, { attributes: true, attributeFilter: ['class'] });
      }
    },
  };
  window.MegaInsights = Insights;

  /* ════════════════════════════════════════════════════════════════
   * 2. CUSTOMER JOURNEY TIMELINE
   * ════════════════════════════════════════════════════════════════ */
  var Journey = {
    show: async function (clientName) {
      if (!clientName) return;
      var modal = document.createElement('div');
      modal.id = 'mega-journey';
      modal.className = 'mega-journey';
      modal.innerHTML =
        '<div class="mega-journey__panel">' +
          '<button class="mega-journey__close">×</button>' +
          '<div class="mega-journey__header">' +
            '<div class="mega-journey__avatar"></div>' +
            '<div>' +
              '<h2 class="mega-journey__title">' + escapeHtml(clientName) + '</h2>' +
              '<div class="mega-journey__sub">Línea de tiempo del cliente</div>' +
            '</div>' +
          '</div>' +
          '<div class="mega-journey__loading"><div class="mega-spinner"></div> Cargando historial...</div>' +
        '</div>';
      document.body.appendChild(modal);
      requestAnimationFrame(function () { modal.classList.add('is-open'); });

      var close = function () {
        modal.classList.remove('is-open');
        setTimeout(function () { try { modal.remove(); } catch (_) {} }, 220);
      };
      modal.querySelector('.mega-journey__close').addEventListener('click', close);
      modal.addEventListener('click', function (e) { if (e.target === modal) close(); });

      /* Avatar */
      if (window.MegaAvatars) {
        modal.querySelector('.mega-journey__avatar').innerHTML = window.MegaAvatars.render(clientName, 56);
      }

      try {
        var [cot, inc] = await Promise.all([
          fetchJson('/api/cotizaciones').catch(function () { return []; }),
          fetchJson('/api/incidentes').catch(function () { return []; }),
        ]);

        var events = [];
        cot.filter(function (c) { return c.cliente_nombre === clientName; }).forEach(function (c) {
          events.push({
            date: c.fecha, type: 'cotizacion',
            icon: 'fa-file-invoice-dollar', color: '#22c55e',
            title: 'Cotización ' + (c.folio || c.id),
            body: '$' + (Number(c.total) || 0).toLocaleString('es-MX') + ' · ' + (c.tipo || ''),
          });
        });
        inc.filter(function (i) { return i.cliente_nombre === clientName; }).forEach(function (i) {
          events.push({
            date: i.fecha_reporte, type: 'incidente',
            icon: 'fa-exclamation-triangle', color: '#ef4444',
            title: 'Incidente ' + (i.folio || i.id),
            body: (i.descripcion || '').slice(0, 80) + ' · ' + (i.estatus || ''),
          });
        });

        events.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });

        var loadingEl = modal.querySelector('.mega-journey__loading');
        if (events.length === 0) {
          loadingEl.outerHTML = '<div class="mega-journey__empty">Sin actividad registrada para este cliente.</div>';
          return;
        }

        var totalCot = events.filter(function (e) { return e.type === 'cotizacion'; }).length;
        var totalInc = events.filter(function (e) { return e.type === 'incidente'; }).length;
        var firstDate = events[events.length - 1].date;

        loadingEl.outerHTML =
          '<div class="mega-journey__stats">' +
            '<div class="mega-journey__stat"><strong>' + totalCot + '</strong><span>Cotizaciones</span></div>' +
            '<div class="mega-journey__stat"><strong>' + totalInc + '</strong><span>Incidentes</span></div>' +
            '<div class="mega-journey__stat"><strong>' + (firstDate || '').toString().slice(0, 10) + '</strong><span>Primer contacto</span></div>' +
          '</div>' +
          '<div class="mega-journey__timeline">' +
            events.map(function (e) {
              var time = window.MegaTime ? window.MegaTime.relative(e.date) : new Date(e.date).toLocaleDateString('es-MX');
              return '<div class="mega-journey__event">' +
                '<div class="mega-journey__event-dot" style="background:' + e.color + '"><i class="fas ' + e.icon + '"></i></div>' +
                '<div class="mega-journey__event-body">' +
                  '<div class="mega-journey__event-title">' + escapeHtml(e.title) + '</div>' +
                  '<div class="mega-journey__event-desc">' + escapeHtml(e.body) + '</div>' +
                  '<div class="mega-journey__event-time">' + time + '</div>' +
                '</div>' +
              '</div>';
            }).join('') +
          '</div>';
      } catch (e) {
        modal.querySelector('.mega-journey__loading').textContent = 'Error: ' + e.message;
      }
    },

    init: function () {
      /* Doble-click en cualquier celda con nombre de cliente abre journey */
      document.addEventListener('dblclick', function (e) {
        if (!e.shiftKey) return;
        var td = e.target.closest('td');
        if (!td) return;
        var name = td.textContent.trim();
        if (name && name.length > 3 && name !== 'No hay datos') {
          Journey.show(name);
        }
      });
    },
  };
  window.MegaJourney = Journey;

  /* ════════════════════════════════════════════════════════════════
   * 3. POMODORO TIMER
   * ════════════════════════════════════════════════════════════════ */
  var Pomodoro = {
    KEY: 'cotizacion-pomodoro-state',
    WORK: 25 * 60, /* 25 min */
    BREAK: 5 * 60, /* 5 min */
    interval: null,

    state: function () {
      try { return JSON.parse(sessionStorage.getItem(Pomodoro.KEY) || '{}'); }
      catch (_) { return {}; }
    },
    save: function (s) {
      try { sessionStorage.setItem(Pomodoro.KEY, JSON.stringify(s)); } catch (_) {}
    },

    start: function () {
      var s = Pomodoro.state();
      if (s.running) { Pomodoro.stop(); return; }
      s.mode = s.mode || 'work';
      s.remaining = s.remaining || Pomodoro[s.mode === 'work' ? 'WORK' : 'BREAK'];
      s.running = true;
      s.startedAt = Date.now();
      Pomodoro.save(s);
      Pomodoro.tick();
      Pomodoro.interval = setInterval(Pomodoro.tick, 1000);
    },

    stop: function () {
      var s = Pomodoro.state();
      s.running = false;
      Pomodoro.save(s);
      clearInterval(Pomodoro.interval);
      Pomodoro.updateUI();
    },

    reset: function () {
      var s = { mode: 'work', remaining: Pomodoro.WORK, running: false };
      Pomodoro.save(s);
      clearInterval(Pomodoro.interval);
      Pomodoro.updateUI();
    },

    tick: function () {
      var s = Pomodoro.state();
      if (!s.running) return;
      s.remaining = Math.max(0, s.remaining - 1);
      if (s.remaining === 0) {
        clearInterval(Pomodoro.interval);
        s.running = false;
        var nextMode = s.mode === 'work' ? 'break' : 'work';
        toast(s.mode === 'work' ? '☕ ¡Tiempo de descanso! 5 min de break.' : '🎯 ¡Vuelta al trabajo! 25 min de focus.',
              'success', { duration: 5000, title: 'Pomodoro' });
        if (window.MegaPush && window.MegaPush.permission() === 'granted') {
          window.MegaPush.notify('Pomodoro · ' + (s.mode === 'work' ? 'Break time' : 'Work time'), {
            body: s.mode === 'work' ? 'Descansa 5 minutos' : 'Tiempo de trabajar 25 minutos',
          });
        }
        if (window.MegaSounds) window.MegaSounds.play('success');
        s.mode = nextMode;
        s.remaining = Pomodoro[nextMode === 'work' ? 'WORK' : 'BREAK'];
        Pomodoro.save(s);
      } else {
        Pomodoro.save(s);
      }
      Pomodoro.updateUI();
    },

    format: function (sec) {
      var m = Math.floor(sec / 60);
      var s = sec % 60;
      return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    },

    updateUI: function () {
      var btn = document.querySelector('.mega-pomo-btn');
      if (!btn) return;
      var s = Pomodoro.state();
      var label = btn.querySelector('.mega-pomo-btn__time');
      var icon = btn.querySelector('.mega-pomo-btn__icon i');
      var rem = s.remaining != null ? s.remaining : Pomodoro.WORK;
      label.textContent = Pomodoro.format(rem);
      btn.classList.toggle('is-running', !!s.running);
      btn.classList.toggle('is-break', s.mode === 'break');
      icon.className = s.running ? 'fas fa-pause' : 'fas fa-play';
      btn.title = (s.running ? 'Pausar' : 'Iniciar') + ' Pomodoro · ' + (s.mode === 'work' ? 'Trabajo' : 'Descanso');
    },

    showMenu: function (e) {
      e.stopPropagation();
      var existing = document.getElementById('mega-pomo-menu');
      if (existing) { existing.remove(); return; }
      var btn = document.querySelector('.mega-pomo-btn');
      var rect = btn.getBoundingClientRect();
      var menu = document.createElement('div');
      menu.id = 'mega-pomo-menu';
      menu.className = 'mega-pomo-menu';
      menu.style.cssText = 'top:' + (rect.bottom + 8) + 'px;right:' + (window.innerWidth - rect.right) + 'px;';
      var s = Pomodoro.state();
      menu.innerHTML =
        '<div class="mega-pomo-menu__header">' +
          '<span class="mega-pomo-menu__mode">' + (s.mode === 'break' ? '☕ Descanso' : '🎯 Trabajo') + '</span>' +
          '<span class="mega-pomo-menu__time">' + Pomodoro.format(s.remaining || Pomodoro.WORK) + '</span>' +
        '</div>' +
        '<button class="mega-pomo-menu__btn" data-act="' + (s.running ? 'pause' : 'start') + '">' +
          '<i class="fas fa-' + (s.running ? 'pause' : 'play') + '"></i> ' + (s.running ? 'Pausar' : 'Iniciar') +
        '</button>' +
        '<button class="mega-pomo-menu__btn" data-act="reset">' +
          '<i class="fas fa-redo"></i> Reiniciar' +
        '</button>' +
        '<div class="mega-pomo-menu__hint">25 min trabajo · 5 min descanso</div>';
      document.body.appendChild(menu);
      menu.querySelector('[data-act="start"], [data-act="pause"]').addEventListener('click', function () {
        Pomodoro.start();
        menu.remove();
      });
      menu.querySelector('[data-act="reset"]').addEventListener('click', function () {
        Pomodoro.reset();
        menu.remove();
      });
      setTimeout(function () {
        document.addEventListener('click', function close () {
          if (menu.parentNode) menu.remove();
          document.removeEventListener('click', close);
        });
      }, 100);
    },

    injectButton: function () {
      if (document.querySelector('.mega-pomo-btn')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mega-pomo-btn';
      btn.innerHTML =
        '<span class="mega-pomo-btn__icon"><i class="fas fa-play"></i></span>' +
        '<span class="mega-pomo-btn__time">25:00</span>';
      btn.addEventListener('click', Pomodoro.showMenu);

      var ref = document.querySelector('.mega-xp-btn') ||
                document.querySelector('.recent-items-btn') ||
                document.querySelector('.theme-switcher');
      if (ref && ref.parentNode) ref.parentNode.insertBefore(btn, ref);
      else (document.querySelector('.header-inner') || document.body).appendChild(btn);
    },

    init: function () {
      Pomodoro.injectButton();
      Pomodoro.updateUI();
      /* Si estaba corriendo en sesión anterior, retomar */
      var s = Pomodoro.state();
      if (s.running) {
        var elapsed = Math.floor((Date.now() - (s.startedAt || Date.now())) / 1000);
        s.remaining = Math.max(0, (s.remaining || Pomodoro.WORK) - elapsed);
        Pomodoro.save(s);
        if (s.remaining > 0) {
          Pomodoro.interval = setInterval(Pomodoro.tick, 1000);
        }
      }
    },
  };
  window.MegaPomodoro = Pomodoro;

  /* ════════════════════════════════════════════════════════════════
   * 4. QR CODE GENERATOR
   * ════════════════════════════════════════════════════════════════ */
  var QR = {
    show: async function (data, title) {
      try {
        await loadScript('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js');
      } catch (_) { toast('No se pudo cargar generador QR', 'error'); return; }
      if (typeof window.qrcode !== 'function') { toast('QR no disponible', 'error'); return; }
      try {
        var qr = window.qrcode(0, 'M');
        qr.addData(data);
        qr.make();
        var svg = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
      } catch (e) { toast('Error generando QR: ' + e.message, 'error'); return; }

      var modal = document.createElement('div');
      modal.id = 'mega-qr-modal';
      modal.className = 'mega-qr-modal';
      modal.innerHTML =
        '<div class="mega-qr-modal__panel">' +
          '<button class="mega-qr-modal__close">×</button>' +
          '<h3 class="mega-qr-modal__title"><i class="fas fa-qrcode"></i> ' + escapeHtml(title || 'Código QR') + '</h3>' +
          '<div class="mega-qr-modal__svg">' + svg + '</div>' +
          '<div class="mega-qr-modal__data">' + escapeHtml(data.length > 80 ? data.slice(0, 80) + '...' : data) + '</div>' +
          '<div class="mega-qr-modal__actions">' +
            '<button class="mega-qr-modal__btn" data-act="copy"><i class="fas fa-copy"></i> Copiar enlace</button>' +
            '<button class="mega-qr-modal__btn mega-qr-modal__btn--primary" data-act="download"><i class="fas fa-download"></i> Descargar PNG</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
      requestAnimationFrame(function () { modal.classList.add('is-open'); });
      var close = function () {
        modal.classList.remove('is-open');
        setTimeout(function () { try { modal.remove(); } catch (_) {} }, 220);
      };
      modal.querySelector('.mega-qr-modal__close').addEventListener('click', close);
      modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
      modal.querySelector('[data-act="copy"]').addEventListener('click', function () {
        if (navigator.clipboard) navigator.clipboard.writeText(data).then(function () {
          toast('Enlace copiado', 'success');
        });
      });
      modal.querySelector('[data-act="download"]').addEventListener('click', function () {
        try {
          var svgEl = modal.querySelector('.mega-qr-modal__svg svg');
          var serializer = new XMLSerializer();
          var svgStr = serializer.serializeToString(svgEl);
          var canvas = document.createElement('canvas');
          var size = 512;
          canvas.width = size; canvas.height = size;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, size, size);
          var img = new Image();
          img.onload = function () {
            ctx.drawImage(img, 0, 0, size, size);
            var a = document.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = (title || 'qr-code').replace(/[^\w-]/g, '_') + '.png';
            a.click();
            toast('QR descargado', 'success');
          };
          img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));
        } catch (e) { toast('Error descargando: ' + e.message, 'error'); }
      });
    },
  };
  window.MegaQR = QR;

  /* ════════════════════════════════════════════════════════════════
   * 5. SMART REMINDERS
   * ════════════════════════════════════════════════════════════════ */
  var Reminders = {
    KEY: 'cotizacion-reminders',
    list: function () {
      try { return JSON.parse(localStorage.getItem(Reminders.KEY) || '[]'); }
      catch (_) { return []; }
    },
    save: function (l) {
      try { localStorage.setItem(Reminders.KEY, JSON.stringify(l)); } catch (_) {}
    },
    add: function (text, atDate) {
      var l = Reminders.list();
      l.push({ id: 'r' + Date.now(), text: text, at: new Date(atDate).getTime(), done: false });
      Reminders.save(l);
      return l[l.length - 1];
    },
    remove: function (id) {
      Reminders.save(Reminders.list().filter(function (r) { return r.id !== id; }));
    },
    check: function () {
      var now = Date.now();
      var l = Reminders.list();
      var changed = false;
      l.forEach(function (r) {
        if (!r.done && r.at <= now) {
          r.done = true;
          changed = true;
          toast(r.text, 'info', { title: '⏰ Recordatorio', duration: 8000 });
          if (window.MegaPush && window.MegaPush.permission() === 'granted') {
            window.MegaPush.notify('⏰ Recordatorio', { body: r.text });
          }
        }
      });
      if (changed) Reminders.save(l);
    },
    showModal: function () {
      var existing = document.getElementById('mega-reminders-modal');
      if (existing) { existing.remove(); return; }
      var l = Reminders.list().filter(function (r) { return !r.done; }).sort(function (a, b) { return a.at - b.at; });
      var modal = document.createElement('div');
      modal.id = 'mega-reminders-modal';
      modal.className = 'mega-reminders-modal';
      modal.innerHTML =
        '<div class="mega-reminders-modal__panel">' +
          '<button class="mega-reminders-modal__close">×</button>' +
          '<h3 class="mega-reminders-modal__title"><i class="fas fa-bell"></i> Recordatorios</h3>' +
          '<form class="mega-reminders-modal__form" id="mega-reminders-form">' +
            '<input type="text" placeholder="¿Qué quieres recordar?" required name="text">' +
            '<input type="datetime-local" required name="when">' +
            '<button type="submit" class="mega-reminders-modal__add"><i class="fas fa-plus"></i> Agregar</button>' +
          '</form>' +
          '<div class="mega-reminders-modal__list">' +
            (l.length === 0 ? '<div class="mega-reminders-modal__empty">Sin recordatorios pendientes</div>' :
              l.map(function (r) {
                return '<div class="mega-reminders-modal__item" data-id="' + r.id + '">' +
                  '<div class="mega-reminders-modal__item-body">' +
                    '<div class="mega-reminders-modal__item-text">' + escapeHtml(r.text) + '</div>' +
                    '<div class="mega-reminders-modal__item-when">' +
                      '<i class="fas fa-clock"></i> ' + new Date(r.at).toLocaleString('es-MX') +
                    '</div>' +
                  '</div>' +
                  '<button class="mega-reminders-modal__del" data-id="' + r.id + '">×</button>' +
                '</div>';
              }).join('')) +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
      requestAnimationFrame(function () { modal.classList.add('is-open'); });
      var close = function () {
        modal.classList.remove('is-open');
        setTimeout(function () { try { modal.remove(); } catch (_) {} }, 220);
      };
      modal.querySelector('.mega-reminders-modal__close').addEventListener('click', close);
      modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
      modal.querySelector('#mega-reminders-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var fd = new FormData(e.target);
        Reminders.add(fd.get('text'), fd.get('when'));
        toast('Recordatorio agregado', 'success');
        close();
        setTimeout(Reminders.showModal, 250);
      });
      modal.querySelectorAll('.mega-reminders-modal__del').forEach(function (b) {
        b.addEventListener('click', function () {
          Reminders.remove(b.getAttribute('data-id'));
          close();
          setTimeout(Reminders.showModal, 220);
        });
      });
    },
    injectButton: function () {
      if (document.querySelector('.mega-reminders-btn')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mega-reminders-btn';
      btn.title = 'Recordatorios';
      btn.innerHTML = '<i class="fas fa-bell"></i><span class="mega-reminders-btn__count" style="display:none">0</span>';
      btn.addEventListener('click', Reminders.showModal);
      var ref = document.querySelector('.mega-pomo-btn') ||
                document.querySelector('.mega-xp-btn') ||
                document.querySelector('.theme-switcher');
      if (ref && ref.parentNode) ref.parentNode.insertBefore(btn, ref);
      else (document.querySelector('.header-inner') || document.body).appendChild(btn);
      Reminders.updateBadge();
    },
    updateBadge: function () {
      var btn = document.querySelector('.mega-reminders-btn');
      if (!btn) return;
      var n = Reminders.list().filter(function (r) { return !r.done; }).length;
      var b = btn.querySelector('.mega-reminders-btn__count');
      if (n > 0) { b.textContent = n; b.style.display = ''; }
      else b.style.display = 'none';
    },
    init: function () {
      Reminders.injectButton();
      Reminders.check();
      setInterval(function () {
        Reminders.check();
        Reminders.updateBadge();
      }, 30000);
    },
  };
  window.MegaReminders = Reminders;

  /* ════════════════════════════════════════════════════════════════
   * 6. SALES FUNNEL CHART (en dashboard)
   * ════════════════════════════════════════════════════════════════ */
  var Funnel = {
    inject: async function () {
      var dashboard = document.getElementById('panel-dashboards');
      if (!dashboard || !dashboard.classList.contains('active')) return;
      if (dashboard.dataset.funnelInjected) return;
      dashboard.dataset.funnelInjected = '1';

      try {
        var pro = await fetchJson('/api/prospectos').catch(function () { return []; });
        if (!pro.length) return;

        var stages = ['prospecto', 'contactado', 'calificado', 'propuesta', 'negociacion', 'ganado'];
        var labels = ['Prospecto', 'Contactado', 'Calificado', 'Propuesta', 'Negociación', 'Ganado'];
        var counts = stages.map(function (s) {
          return pro.filter(function (p) { return (p.estado || 'prospecto').toLowerCase() === s; }).length;
        });
        var max = Math.max.apply(null, counts.concat([1]));
        var totalUSD = pro.reduce(function (s, p) { return s + (Number(p.potencial_usd) || 0); }, 0);

        var section = document.createElement('section');
        section.className = 'mega-funnel-section';
        section.innerHTML =
          '<div class="mega-funnel-section__header">' +
            '<h3><i class="fas fa-filter"></i> Embudo de ventas</h3>' +
            '<span class="mega-funnel-section__total">$' + Math.round(totalUSD / 1000) + 'k USD pipeline</span>' +
          '</div>' +
          '<div class="mega-funnel">' +
            stages.map(function (s, i) {
              var width = (counts[i] / max) * 100;
              var conversion = i > 0 && counts[i - 1] > 0 ? ((counts[i] / counts[i - 1]) * 100).toFixed(0) + '%' : '';
              var colors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444', '#22c55e'];
              return '<div class="mega-funnel-row">' +
                '<div class="mega-funnel-bar" style="width:' + Math.max(width, 8) + '%; background:linear-gradient(90deg,' + colors[i] + 'aa,' + colors[i] + ')">' +
                  '<span class="mega-funnel-bar__label">' + labels[i] + '</span>' +
                  '<span class="mega-funnel-bar__count">' + counts[i] + '</span>' +
                '</div>' +
                (conversion ? '<span class="mega-funnel-conv">' + conversion + '</span>' : '<span class="mega-funnel-conv"></span>') +
              '</div>';
            }).join('') +
          '</div>';
        dashboard.appendChild(section);
      } catch (_) {}
    },
    init: function () {
      var setup = function () { Funnel.inject(); };
      setTimeout(setup, 2200);
      var dashboard = document.getElementById('panel-dashboards');
      if (dashboard) {
        var obs = new MutationObserver(setup);
        obs.observe(dashboard, { attributes: true, attributeFilter: ['class'] });
      }
    },
  };
  window.MegaFunnel = Funnel;

  /* ════════════════════════════════════════════════════════════════
   * BOOT
   * ════════════════════════════════════════════════════════════════ */
  function boot() {
    Insights.init();
    Journey.init();
    Pomodoro.init();
    Reminders.init();
    Funnel.init();
    /* QR no requiere init, solo API window.MegaQR.show */
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
