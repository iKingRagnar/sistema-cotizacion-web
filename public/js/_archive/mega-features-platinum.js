/* ════════════════════════════════════════════════════════════════════════
 * MEGA FEATURES PLATINUM — Map View, Notifications Center, Goal Tracker,
 * Voice Notes, AI Summarizer, Quick Polls
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

  /* ════════════════════════════════════════════════════════════════
   * 1. MAP VIEW de clientes (Leaflet con clustering)
   * ════════════════════════════════════════════════════════════════ */
  var ClientMap = {
    inject: async function () {
      var panel = document.getElementById('panel-clientes');
      if (!panel || !panel.classList.contains('active')) return;
      if (panel.dataset.clientMapInjected) return;
      panel.dataset.clientMapInjected = '1';

      /* Toggle buttons */
      var existing = panel.querySelector('.mega-clientmap-toggle');
      if (existing) return;
      var toggle = document.createElement('div');
      toggle.className = 'mega-clientmap-toggle';
      toggle.innerHTML =
        '<button class="mega-view-btn is-active" data-view="default">' +
          '<i class="fas fa-table"></i> Tabla</button>' +
        '<button class="mega-view-btn" data-view="map">' +
          '<i class="fas fa-map-marker-alt"></i> Mapa</button>';
      panel.insertBefore(toggle, panel.firstChild);

      var mapWrap = document.createElement('div');
      mapWrap.className = 'mega-clientmap';
      mapWrap.id = 'mega-clientmap';
      mapWrap.style.display = 'none';
      mapWrap.innerHTML = '<div class="mega-clientmap__canvas" id="mega-clientmap-canvas"></div>';
      panel.appendChild(mapWrap);

      var mapInstance = null;
      toggle.addEventListener('click', async function (e) {
        var btn = e.target.closest('.mega-view-btn');
        if (!btn) return;
        toggle.querySelectorAll('.mega-view-btn').forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        var defaultPanels = panel.querySelectorAll(':scope > *:not(.mega-clientmap-toggle):not(.mega-clientmap):not(.section-header):not(.mega-saved-views):not(.mega-quick-chips)');
        if (btn.getAttribute('data-view') === 'map') {
          defaultPanels.forEach(function (n) { n.style.display = 'none'; });
          mapWrap.style.display = 'block';
          if (!mapInstance) await ClientMap.render();
          else setTimeout(function () { try { mapInstance.invalidateSize(); } catch (_) {} }, 100);
        } else {
          defaultPanels.forEach(function (n) { n.style.display = ''; });
          mapWrap.style.display = 'none';
        }
      });

      ClientMap.render = async function () {
        if (typeof window.L === 'undefined') {
          /* Leaflet ya viene de prospección — esperar */
          var tries = 0;
          while (typeof window.L === 'undefined' && tries < 30) {
            await new Promise(function (r) { setTimeout(r, 200); });
            tries++;
          }
          if (typeof window.L === 'undefined') {
            mapWrap.innerHTML = '<div class="mega-clientmap__error">Leaflet no disponible. Visita Prospección primero para cargar el mapa.</div>';
            return;
          }
        }
        var L = window.L;
        var canvas = document.getElementById('mega-clientmap-canvas');
        if (!canvas || canvas._leaflet_id) return;

        try {
          var clientes = await fetchJson('/api/clientes');
          var withCoords = clientes.filter(function (c) {
            return isFinite(Number(c.lat)) && isFinite(Number(c.lng));
          });

          mapInstance = L.map(canvas).setView([23.6, -102.5], 5);
          var _light = document.body && document.body.classList.contains('appearance-light');
          L.tileLayer(
            _light
              ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
              : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
            {
              attribution: '&copy; OpenStreetMap &copy; CARTO',
              subdomains: 'abcd',
              maxZoom: 20,
            }
          ).addTo(mapInstance);

          if (!withCoords.length) {
            mapWrap.innerHTML += '<div class="mega-clientmap__overlay">' +
              '<i class="fas fa-info-circle"></i> Ningún cliente tiene coordenadas (lat/lng) registradas.<br>' +
              'Agrega coordenadas en sus fichas para verlos aquí.</div>';
            return;
          }

          var bounds = [];
          withCoords.forEach(function (c) {
            var lat = Number(c.lat), lng = Number(c.lng);
            var initials = (c.nombre || '?').split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
            var icon = L.divIcon({
              className: 'mega-clientmap__pin',
              html: '<div class="mega-clientmap__pin-bubble">' + escapeHtml(initials) + '</div><div class="mega-clientmap__pin-tail"></div>',
              iconSize: [40, 50],
              iconAnchor: [20, 50],
            });
            var marker = L.marker([lat, lng], { icon: icon }).addTo(mapInstance);
            marker.bindPopup(
              '<div style="font-family:Inter,sans-serif;min-width:180px">' +
                '<strong style="color:#0f172a;font-size:0.92rem">' + escapeHtml(c.nombre || '') + '</strong><br>' +
                (c.rfc ? '<span style="color:#64748b;font-size:0.75rem">RFC: ' + escapeHtml(c.rfc) + '</span><br>' : '') +
                (c.ciudad ? '<span style="color:#64748b;font-size:0.75rem">📍 ' + escapeHtml(c.ciudad) + '</span><br>' : '') +
                (c.telefono ? '<span style="color:#64748b;font-size:0.75rem">☎ ' + escapeHtml(c.telefono) + '</span>' : '') +
              '</div>'
            );
            bounds.push([lat, lng]);
          });
          if (bounds.length) mapInstance.fitBounds(bounds, { padding: [40, 40] });

          var legend = document.createElement('div');
          legend.className = 'mega-clientmap__legend';
          legend.innerHTML = '<i class="fas fa-map-marker-alt"></i> ' + withCoords.length + ' de ' + clientes.length + ' clientes con coordenadas';
          mapWrap.appendChild(legend);
        } catch (e) {
          mapWrap.innerHTML += '<div class="mega-clientmap__error">Error: ' + e.message + '</div>';
        }
      };
    },

    init: function () {
      var setup = function () { ClientMap.inject(); };
      setTimeout(setup, 1500);
      var panel = document.getElementById('panel-clientes');
      if (panel) {
        var obs = new MutationObserver(setup);
        obs.observe(panel, { attributes: true, attributeFilter: ['class'] });
      }
    },
  };
  window.MegaClientMap = ClientMap;

  /* ════════════════════════════════════════════════════════════════
   * 2. NOTIFICATIONS CENTER (drawer histórico completo)
   * ════════════════════════════════════════════════════════════════ */
  var Notifications = {
    KEY: 'cotizacion-notif-history',
    list: function () {
      try { return JSON.parse(localStorage.getItem(Notifications.KEY) || '[]'); }
      catch (_) { return []; }
    },
    save: function (l) {
      try { localStorage.setItem(Notifications.KEY, JSON.stringify(l.slice(0, 100))); } catch (_) {}
    },
    add: function (entry) {
      var l = Notifications.list();
      l.unshift(Object.assign({ id: 'n' + Date.now() + Math.random(), ts: Date.now(), read: false }, entry));
      Notifications.save(l);
      Notifications.updateBadge();
    },
    markAllRead: function () {
      var l = Notifications.list();
      l.forEach(function (n) { n.read = true; });
      Notifications.save(l);
      Notifications.updateBadge();
    },
    clear: function () {
      Notifications.save([]);
      Notifications.updateBadge();
    },

    /* Hook MegaToast.show para guardar en historial */
    hook: function () {
      if (!window.MegaToast || window.MegaToast.__notifHooked) return;
      window.MegaToast.__notifHooked = true;
      var origShow = window.MegaToast.show;
      window.MegaToast.show = function (msg, kind, opts) {
        try {
          /* Solo guardar success/warning/error (no info dummy) */
          if (kind && ['success', 'error', 'warning', 'info'].indexOf(kind) !== -1) {
            Notifications.add({
              kind: kind,
              text: String(msg).slice(0, 200),
              title: opts && opts.title ? String(opts.title) : null,
            });
          }
        } catch (_) {}
        return origShow.apply(this, arguments);
      };
    },

    updateBadge: function () {
      var btn = document.querySelector('.mega-notif-btn');
      if (!btn) return;
      var unread = Notifications.list().filter(function (n) { return !n.read; }).length;
      var b = btn.querySelector('.mega-notif-btn__count');
      if (unread > 0) {
        b.textContent = unread > 99 ? '99+' : unread;
        b.style.display = '';
      } else {
        b.style.display = 'none';
      }
    },

    showDrawer: function () {
      var existing = document.getElementById('mega-notif-drawer');
      if (existing) {
        existing.classList.toggle('is-open');
        if (!existing.classList.contains('is-open')) {
          setTimeout(function () { existing.remove(); }, 300);
        }
        Notifications.markAllRead();
        return;
      }
      var l = Notifications.list();
      var drawer = document.createElement('aside');
      drawer.id = 'mega-notif-drawer';
      drawer.className = 'mega-notif-drawer';
      var icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
      var colors = { success: '#22c55e', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
      drawer.innerHTML =
        '<div class="mega-notif-drawer__header">' +
          '<h3><i class="fas fa-inbox"></i> Notificaciones</h3>' +
          '<button class="mega-notif-drawer__close">×</button>' +
        '</div>' +
        '<div class="mega-notif-drawer__body">' +
          (l.length === 0 ? '<div class="mega-notif-drawer__empty">' +
            '<i class="fas fa-bell-slash" style="font-size:2.4rem;opacity:0.3;margin-bottom:10px;display:block"></i>' +
            'Sin notificaciones todavía. Las acciones del sistema aparecerán aquí.' +
          '</div>' :
            l.map(function (n) {
              var time = window.MegaTime ? window.MegaTime.relative(n.ts) : new Date(n.ts).toLocaleTimeString('es-MX');
              return '<div class="mega-notif-item ' + (n.read ? '' : 'is-unread') + '" data-id="' + n.id + '" style="--notif-color:' + (colors[n.kind] || colors.info) + '">' +
                '<i class="fas ' + (icons[n.kind] || icons.info) + ' mega-notif-item__icon"></i>' +
                '<div class="mega-notif-item__body">' +
                  (n.title ? '<div class="mega-notif-item__title">' + escapeHtml(n.title) + '</div>' : '') +
                  '<div class="mega-notif-item__text">' + escapeHtml(n.text) + '</div>' +
                  '<div class="mega-notif-item__time">' + time + '</div>' +
                '</div>' +
              '</div>';
            }).join('')) +
        '</div>' +
        '<div class="mega-notif-drawer__footer">' +
          '<button class="mega-notif-drawer__btn" data-act="clear"><i class="fas fa-trash"></i> Limpiar todo</button>' +
        '</div>';
      document.body.appendChild(drawer);
      requestAnimationFrame(function () { drawer.classList.add('is-open'); });
      drawer.querySelector('.mega-notif-drawer__close').addEventListener('click', function () {
        drawer.classList.remove('is-open');
        setTimeout(function () { try { drawer.remove(); } catch (_) {} }, 300);
        Notifications.markAllRead();
      });
      drawer.querySelector('[data-act="clear"]').addEventListener('click', function () {
        if (confirm('¿Eliminar TODAS las notificaciones del historial?')) {
          Notifications.clear();
          drawer.querySelector('.mega-notif-drawer__body').innerHTML =
            '<div class="mega-notif-drawer__empty">' +
              '<i class="fas fa-bell-slash" style="font-size:2.4rem;opacity:0.3;margin-bottom:10px;display:block"></i>' +
              'Sin notificaciones todavía.' +
            '</div>';
        }
      });
    },

    injectButton: function () {
      if (document.querySelector('.mega-notif-btn')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mega-notif-btn';
      btn.title = 'Centro de notificaciones';
      btn.innerHTML = '<i class="fas fa-inbox"></i><span class="mega-notif-btn__count" style="display:none">0</span>';
      btn.addEventListener('click', Notifications.showDrawer);
      var ref = document.querySelector('.mega-reminders-btn') ||
                document.querySelector('.mega-pomo-btn') ||
                document.querySelector('.theme-switcher');
      if (ref && ref.parentNode) ref.parentNode.insertBefore(btn, ref);
      else (document.querySelector('.header-inner') || document.body).appendChild(btn);
      Notifications.updateBadge();
    },

    init: function () {
      Notifications.hook();
      Notifications.injectButton();
      setInterval(Notifications.updateBadge, 5000);
    },
  };
  window.MegaNotifications = Notifications;

  /* ════════════════════════════════════════════════════════════════
   * 3. GOAL TRACKER mensual con progress
   * ════════════════════════════════════════════════════════════════ */
  var Goals = {
    KEY: 'cotizacion-goals',
    DEFAULT_GOAL: 100000, /* $100,000 MXN/mes default */

    state: function () {
      try { return JSON.parse(localStorage.getItem(Goals.KEY) || '{}'); }
      catch (_) { return {}; }
    },

    save: function (s) {
      try { localStorage.setItem(Goals.KEY, JSON.stringify(s)); } catch (_) {}
    },

    setMonthly: function (amount) {
      var s = Goals.state();
      var key = new Date().toISOString().slice(0, 7);
      s[key] = { goal: amount };
      Goals.save(s);
      toast('Meta mensual: $' + Number(amount).toLocaleString('es-MX'), 'success');
      Goals.refresh();
    },

    getCurrentGoal: function () {
      var s = Goals.state();
      var key = new Date().toISOString().slice(0, 7);
      return (s[key] && s[key].goal) || Goals.DEFAULT_GOAL;
    },

    inject: async function () {
      var dashboard = document.getElementById('panel-dashboards');
      if (!dashboard || !dashboard.classList.contains('active')) return;
      if (dashboard.dataset.goalsInjected) return;
      dashboard.dataset.goalsInjected = '1';

      var section = document.createElement('section');
      section.className = 'mega-goals-section';
      section.id = 'mega-goals-section';
      section.innerHTML = '<div class="mega-goals-loading">Calculando progreso...</div>';
      dashboard.insertBefore(section, dashboard.firstChild ? dashboard.firstChild.nextSibling : null);

      Goals.refresh();
    },

    refresh: async function () {
      var section = document.getElementById('mega-goals-section');
      if (!section) return;
      try {
        var cot = await fetchJson('/api/cotizaciones').catch(function () { return []; });
        var monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        var monthCot = cot.filter(function (c) {
          return new Date(c.fecha).getTime() >= monthStart.getTime();
        });
        var totalThisMonth = monthCot.reduce(function (s, c) { return s + (Number(c.total) || 0); }, 0);
        var goal = Goals.getCurrentGoal();
        var pct = Math.min(100, (totalThisMonth / goal) * 100);
        var daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
        var dayOfMonth = new Date().getDate();
        var expectedPct = (dayOfMonth / daysInMonth) * 100;
        var status = pct >= expectedPct ? 'is-ahead' : 'is-behind';
        var diff = pct - expectedPct;

        section.innerHTML =
          '<div class="mega-goals__header">' +
            '<h3><i class="fas fa-bullseye"></i> Meta mensual <span style="color:#94a3b8;font-size:0.78rem;font-weight:400">(' + new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }) + ')</span></h3>' +
            '<button class="mega-goals__edit"><i class="fas fa-pencil-alt"></i> Editar meta</button>' +
          '</div>' +
          '<div class="mega-goals__main">' +
            '<div class="mega-goals__numbers">' +
              '<div class="mega-goals__current">$' + Math.round(totalThisMonth).toLocaleString('es-MX') + '</div>' +
              '<div class="mega-goals__target">de $' + Math.round(goal).toLocaleString('es-MX') + ' MXN</div>' +
            '</div>' +
            '<div class="mega-goals__pct ' + status + '">' +
              (status === 'is-ahead' ? '↑' : '↓') + ' ' + Math.abs(diff).toFixed(0) + '% ' +
              (status === 'is-ahead' ? 'adelante' : 'atrás') + ' de lo esperado' +
            '</div>' +
          '</div>' +
          '<div class="mega-goals__bar-wrap">' +
            '<div class="mega-goals__bar">' +
              '<div class="mega-goals__bar-fill ' + status + '" style="width:' + pct + '%"></div>' +
              '<div class="mega-goals__bar-marker" style="left:' + expectedPct + '%" title="Esperado al día ' + dayOfMonth + ': ' + expectedPct.toFixed(0) + '%">' +
                '<div class="mega-goals__bar-marker-dot"></div>' +
              '</div>' +
            '</div>' +
            '<div class="mega-goals__pct-label">' + pct.toFixed(1) + '%</div>' +
          '</div>' +
          '<div class="mega-goals__stats">' +
            '<span><i class="fas fa-calendar"></i> Día ' + dayOfMonth + ' de ' + daysInMonth + '</span>' +
            '<span><i class="fas fa-file-invoice"></i> ' + monthCot.length + ' cotizaciones</span>' +
            '<span><i class="fas fa-chart-line"></i> Promedio diario: $' + Math.round(totalThisMonth / dayOfMonth).toLocaleString('es-MX') + '</span>' +
          '</div>';

        section.querySelector('.mega-goals__edit').addEventListener('click', function () {
          var v = window.prompt('Meta mensual (MXN):', goal);
          if (v && !isNaN(parseFloat(v))) Goals.setMonthly(parseFloat(v));
        });
      } catch (e) {
        section.innerHTML = '<div class="mega-goals-loading">Error: ' + e.message + '</div>';
      }
    },

    init: function () {
      var setup = function () { Goals.inject(); };
      setTimeout(setup, 2000);
      var dashboard = document.getElementById('panel-dashboards');
      if (dashboard) {
        var obs = new MutationObserver(setup);
        obs.observe(dashboard, { attributes: true, attributeFilter: ['class'] });
      }
    },
  };
  window.MegaGoals = Goals;

  /* ════════════════════════════════════════════════════════════════
   * 4. VOICE NOTES recorder en formularios (MediaRecorder API)
   * ════════════════════════════════════════════════════════════════ */
  var VoiceNotes = {
    KEY: 'cotizacion-voice-notes',
    activeRecorder: null,

    list: function () {
      try { return JSON.parse(localStorage.getItem(VoiceNotes.KEY) || '[]'); }
      catch (_) { return []; }
    },

    save: function (l) {
      try { localStorage.setItem(VoiceNotes.KEY, JSON.stringify(l.slice(0, 30))); } catch (_) {}
    },

    showRecorder: function () {
      var existing = document.getElementById('mega-voice-modal');
      if (existing) { existing.remove(); return; }
      var l = VoiceNotes.list();
      var modal = document.createElement('div');
      modal.id = 'mega-voice-modal';
      modal.className = 'mega-voice-modal';
      modal.innerHTML =
        '<div class="mega-voice-modal__panel">' +
          '<button class="mega-voice-modal__close">×</button>' +
          '<h3 class="mega-voice-modal__title"><i class="fas fa-microphone"></i> Notas de voz</h3>' +
          '<div class="mega-voice-modal__recorder">' +
            '<button class="mega-voice-modal__record" id="mega-voice-record">' +
              '<i class="fas fa-microphone"></i> Grabar' +
            '</button>' +
            '<div class="mega-voice-modal__timer" id="mega-voice-timer">00:00</div>' +
          '</div>' +
          '<div class="mega-voice-modal__list">' +
            (l.length === 0 ?
              '<div class="mega-voice-modal__empty">Sin notas grabadas. Click el botón rojo para empezar.</div>' :
              l.map(function (n) {
                return '<div class="mega-voice-note" data-id="' + n.id + '">' +
                  '<audio controls src="' + n.dataUrl + '" style="flex:1;height:36px"></audio>' +
                  '<div class="mega-voice-note__meta">' +
                    '<div class="mega-voice-note__time">' + new Date(n.ts).toLocaleString('es-MX') + '</div>' +
                    '<div class="mega-voice-note__dur">' + n.duration + 's</div>' +
                  '</div>' +
                  '<button class="mega-voice-note__del" data-id="' + n.id + '">×</button>' +
                '</div>';
              }).join('')) +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
      requestAnimationFrame(function () { modal.classList.add('is-open'); });

      var close = function () {
        if (VoiceNotes.activeRecorder && VoiceNotes.activeRecorder.state === 'recording') {
          VoiceNotes.activeRecorder.stop();
        }
        modal.classList.remove('is-open');
        setTimeout(function () { try { modal.remove(); } catch (_) {} }, 220);
      };
      modal.querySelector('.mega-voice-modal__close').addEventListener('click', close);
      modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
      modal.querySelectorAll('.mega-voice-note__del').forEach(function (b) {
        b.addEventListener('click', function () {
          VoiceNotes.save(VoiceNotes.list().filter(function (n) { return n.id !== b.getAttribute('data-id'); }));
          close();
          setTimeout(VoiceNotes.showRecorder, 250);
        });
      });

      var recordBtn = modal.querySelector('#mega-voice-record');
      var timer = modal.querySelector('#mega-voice-timer');
      var startTime = 0;
      var timerInterval = null;

      recordBtn.addEventListener('click', async function () {
        if (VoiceNotes.activeRecorder && VoiceNotes.activeRecorder.state === 'recording') {
          VoiceNotes.activeRecorder.stop();
          return;
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          toast('Grabación no disponible en este navegador', 'error');
          return;
        }
        try {
          var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          var rec = new MediaRecorder(stream);
          var chunks = [];
          rec.ondataavailable = function (e) { chunks.push(e.data); };
          rec.onstop = function () {
            stream.getTracks().forEach(function (t) { t.stop(); });
            var blob = new Blob(chunks, { type: 'audio/webm' });
            var reader = new FileReader();
            reader.onloadend = function () {
              var dur = Math.round((Date.now() - startTime) / 1000);
              var l2 = VoiceNotes.list();
              l2.unshift({ id: 'v' + Date.now(), dataUrl: reader.result, ts: Date.now(), duration: dur });
              VoiceNotes.save(l2);
              clearInterval(timerInterval);
              recordBtn.classList.remove('is-recording');
              recordBtn.innerHTML = '<i class="fas fa-microphone"></i> Grabar';
              timer.textContent = '00:00';
              close();
              setTimeout(VoiceNotes.showRecorder, 200);
              toast('Nota guardada (' + dur + 's)', 'success');
            };
            reader.readAsDataURL(blob);
          };
          rec.start();
          VoiceNotes.activeRecorder = rec;
          startTime = Date.now();
          recordBtn.classList.add('is-recording');
          recordBtn.innerHTML = '<i class="fas fa-stop"></i> Detener';
          timerInterval = setInterval(function () {
            var elapsed = Math.floor((Date.now() - startTime) / 1000);
            var m = Math.floor(elapsed / 60);
            var s = elapsed % 60;
            timer.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
            if (elapsed >= 120) rec.stop(); /* Max 2 min */
          }, 200);
        } catch (e) {
          toast('Permiso denegado o error: ' + e.message, 'error');
        }
      });
    },

    injectButton: function () {
      if (document.querySelector('.mega-voice-btn-header')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mega-voice-btn-header';
      btn.title = 'Notas de voz';
      btn.innerHTML = '<i class="fas fa-microphone"></i>';
      btn.addEventListener('click', VoiceNotes.showRecorder);
      var ref = document.querySelector('.mega-notif-btn') ||
                document.querySelector('.mega-reminders-btn') ||
                document.querySelector('.theme-switcher');
      if (ref && ref.parentNode) ref.parentNode.insertBefore(btn, ref);
    },

    init: function () { VoiceNotes.injectButton(); },
  };
  window.MegaVoiceNotes = VoiceNotes;

  /* ════════════════════════════════════════════════════════════════
   * 5. AI SUMMARIZER (DavAI resume cotizaciones largas)
   * ════════════════════════════════════════════════════════════════ */
  var Summarizer = {
    summarize: async function (text) {
      if (!text || text.length < 100) {
        toast('El texto es muy corto para resumir', 'warning');
        return null;
      }
      try {
        var resp = await fetch('/api/davai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
          body: JSON.stringify({
            message: 'Resume el siguiente texto en máximo 3 viñetas concisas (responde SOLO con las viñetas, sin introducción): "' + text + '"',
          }),
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var reader = resp.body.getReader();
        var dec = new TextDecoder();
        var buf = '', summary = '';
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
                if (p.text) summary += p.text;
              } catch (_) {}
            }
          }
        }
        return summary.trim();
      } catch (e) {
        toast('Error al resumir: ' + e.message, 'error');
        return null;
      }
    },

    show: function (text, title) {
      var modal = document.createElement('div');
      modal.id = 'mega-summary-modal';
      modal.className = 'mega-summary-modal';
      modal.innerHTML =
        '<div class="mega-summary-modal__panel">' +
          '<button class="mega-summary-modal__close">×</button>' +
          '<h3 class="mega-summary-modal__title"><i class="fas fa-magic"></i> Resumen IA</h3>' +
          '<div class="mega-summary-modal__loading"><div class="mega-spinner"></div> DavAI está resumiendo...</div>' +
        '</div>';
      document.body.appendChild(modal);
      requestAnimationFrame(function () { modal.classList.add('is-open'); });
      var close = function () {
        modal.classList.remove('is-open');
        setTimeout(function () { try { modal.remove(); } catch (_) {} }, 220);
      };
      modal.querySelector('.mega-summary-modal__close').addEventListener('click', close);
      modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
      Summarizer.summarize(text).then(function (summary) {
        if (!summary) { close(); return; }
        var loading = modal.querySelector('.mega-summary-modal__loading');
        loading.outerHTML =
          (title ? '<div class="mega-summary-modal__source">📄 ' + escapeHtml(title) + '</div>' : '') +
          '<div class="mega-summary-modal__content">' +
            summary.split('\n').map(function (line) {
              return '<div class="mega-summary-modal__line">' + escapeHtml(line) + '</div>';
            }).join('') +
          '</div>' +
          '<div class="mega-summary-modal__footer">' +
            '<button class="mega-summary-modal__copy"><i class="fas fa-copy"></i> Copiar resumen</button>' +
          '</div>';
        modal.querySelector('.mega-summary-modal__copy').addEventListener('click', function () {
          if (navigator.clipboard) navigator.clipboard.writeText(summary).then(function () {
            toast('Resumen copiado', 'success');
          });
        });
      });
    },

    init: function () {
      /* Auto-inject botón "Resumir IA" en textareas largas */
      var attach = function () {
        document.querySelectorAll('textarea').forEach(function (ta) {
          if (ta.dataset.summAttached) return;
          if (ta.closest('.davai-fab__form, #davai-form')) return;
          ta.dataset.summAttached = '1';
          ta.addEventListener('blur', function () {
            if (ta.value.length > 200) {
              if (ta.parentNode.querySelector('.mega-summarize-btn')) return;
              var btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'mega-summarize-btn';
              btn.innerHTML = '<i class="fas fa-magic"></i> Resumir con DavAI';
              btn.addEventListener('click', function (e) {
                e.preventDefault();
                Summarizer.show(ta.value, ta.name || 'Texto');
              });
              ta.parentNode.appendChild(btn);
            }
          });
        });
      };
      attach();
      var obs = new MutationObserver(function () {
        clearTimeout(window.__sumDebounce);
        window.__sumDebounce = setTimeout(attach, 600);
      });
      obs.observe(document.body, { childList: true, subtree: true });
    },
  };
  window.MegaSummarizer = Summarizer;

  /* ════════════════════════════════════════════════════════════════
   * 6. QUICK POLLS (encuesta rápida del equipo)
   * ════════════════════════════════════════════════════════════════ */
  var Polls = {
    KEY: 'cotizacion-polls',

    all: function () {
      try { return JSON.parse(localStorage.getItem(Polls.KEY) || '[]'); }
      catch (_) { return []; }
    },

    save: function (l) {
      try { localStorage.setItem(Polls.KEY, JSON.stringify(l)); } catch (_) {}
    },

    create: function (question, options) {
      var l = Polls.all();
      l.unshift({
        id: 'p' + Date.now(),
        question: question,
        options: options.map(function (o) { return { text: o, votes: 0 }; }),
        ts: Date.now(),
        voted: false,
      });
      Polls.save(l);
      return l[0];
    },

    vote: function (pollId, optIdx) {
      var l = Polls.all();
      var p = l.find(function (x) { return x.id === pollId; });
      if (!p || p.voted) return;
      p.options[optIdx].votes++;
      p.voted = true;
      Polls.save(l);
      toast('Voto registrado', 'success');
    },

    showModal: function () {
      var existing = document.getElementById('mega-polls-modal');
      if (existing) { existing.remove(); return; }
      var l = Polls.all();
      var modal = document.createElement('div');
      modal.id = 'mega-polls-modal';
      modal.className = 'mega-polls-modal';
      modal.innerHTML =
        '<div class="mega-polls-modal__panel">' +
          '<button class="mega-polls-modal__close">×</button>' +
          '<h3 class="mega-polls-modal__title"><i class="fas fa-poll"></i> Encuestas rápidas</h3>' +
          '<div class="mega-polls-modal__create">' +
            '<input type="text" id="mega-poll-q" placeholder="¿Cuál es la pregunta?" maxlength="120">' +
            '<input type="text" id="mega-poll-opts" placeholder="Opciones separadas por coma (ej: Sí, No, Tal vez)">' +
            '<button class="mega-polls-modal__create-btn"><i class="fas fa-plus"></i> Crear encuesta</button>' +
          '</div>' +
          '<div class="mega-polls-modal__list">' +
            (l.length === 0 ?
              '<div class="mega-polls-modal__empty">Sin encuestas creadas. Las que crees serán visibles aquí.</div>' :
              l.map(function (p) {
                var total = p.options.reduce(function (s, o) { return s + o.votes; }, 0);
                return '<div class="mega-poll" data-id="' + p.id + '">' +
                  '<div class="mega-poll__q">' + escapeHtml(p.question) + '</div>' +
                  '<div class="mega-poll__opts">' +
                    p.options.map(function (o, i) {
                      var pct = total > 0 ? (o.votes / total) * 100 : 0;
                      return '<button class="mega-poll__opt ' + (p.voted ? 'is-disabled' : '') + '" data-i="' + i + '">' +
                        '<div class="mega-poll__opt-fill" style="width:' + pct + '%"></div>' +
                        '<span class="mega-poll__opt-text">' + escapeHtml(o.text) + '</span>' +
                        (p.voted ? '<span class="mega-poll__opt-pct">' + pct.toFixed(0) + '% · ' + o.votes + '</span>' : '') +
                      '</button>';
                    }).join('') +
                  '</div>' +
                  '<div class="mega-poll__meta">' + total + ' votos · ' + new Date(p.ts).toLocaleDateString('es-MX') + '</div>' +
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
      modal.querySelector('.mega-polls-modal__close').addEventListener('click', close);
      modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
      modal.querySelector('.mega-polls-modal__create-btn').addEventListener('click', function () {
        var q = modal.querySelector('#mega-poll-q').value.trim();
        var opts = modal.querySelector('#mega-poll-opts').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        if (!q || opts.length < 2) { toast('Pregunta + 2+ opciones requeridas', 'warning'); return; }
        Polls.create(q, opts);
        close();
        setTimeout(Polls.showModal, 250);
      });
      modal.querySelectorAll('.mega-poll__opt').forEach(function (b) {
        if (b.classList.contains('is-disabled')) return;
        b.addEventListener('click', function () {
          var pollEl = b.closest('.mega-poll');
          var pollId = pollEl.getAttribute('data-id');
          var idx = parseInt(b.getAttribute('data-i'), 10);
          Polls.vote(pollId, idx);
          close();
          setTimeout(Polls.showModal, 250);
        });
      });
    },
  };
  window.MegaPolls = Polls;

  /* ════════════════════════════════════════════════════════════════
   * BOOT
   * ════════════════════════════════════════════════════════════════ */
  function boot() {
    ClientMap.init();
    Notifications.init();
    Goals.init();
    VoiceNotes.init();
    Summarizer.init();
    /* Polls solo via API */
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
