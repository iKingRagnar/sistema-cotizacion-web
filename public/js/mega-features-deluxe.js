/* ════════════════════════════════════════════════════════════════════════
 * MEGA FEATURES DELUXE — Kanban + Gamification + AI Pricing + Onboarding
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
   * 1. KANBAN VIEW para prospectos (drag-drop entre etapas)
   * ════════════════════════════════════════════════════════════════ */
  var Kanban = {
    STAGES: [
      { id: 'prospecto', label: 'Prospecto', color: '#3b82f6' },
      { id: 'contactado', label: 'Contactado', color: '#8b5cf6' },
      { id: 'calificado', label: 'Calificado', color: '#06b6d4' },
      { id: 'propuesta', label: 'Propuesta', color: '#f59e0b' },
      { id: 'negociacion', label: 'Negociación', color: '#ef4444' },
      { id: 'ganado', label: 'Ganado', color: '#22c55e' },
      { id: 'perdido', label: 'Perdido', color: '#64748b' },
    ],

    cache: [],

    inject: async function () {
      var panel = document.getElementById('panel-prospeccion');
      if (!panel || !panel.classList.contains('active')) return;
      if (panel.dataset.kanbanInjected) return;
      panel.dataset.kanbanInjected = '1';

      /* Botón toggle vista */
      var toggle = document.createElement('div');
      toggle.className = 'mega-kanban-toggle';
      toggle.innerHTML =
        '<button class="mega-view-btn is-active" data-view="default">' +
          '<i class="fas fa-table"></i> Tabla</button>' +
        '<button class="mega-view-btn" data-view="kanban">' +
          '<i class="fas fa-columns"></i> Kanban</button>';
      panel.insertBefore(toggle, panel.firstChild);

      /* Kanban container (hidden por default) */
      var board = document.createElement('div');
      board.className = 'mega-kanban';
      board.id = 'mega-kanban-board';
      board.style.display = 'none';
      panel.appendChild(board);

      toggle.addEventListener('click', async function (e) {
        var btn = e.target.closest('.mega-view-btn');
        if (!btn) return;
        toggle.querySelectorAll('.mega-view-btn').forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        var view = btn.getAttribute('data-view');
        var defaultPanel = panel.querySelectorAll(':scope > *:not(.mega-kanban-toggle):not(.mega-kanban):not(.section-header)');
        if (view === 'kanban') {
          defaultPanel.forEach(function (n) { n.style.display = 'none'; });
          board.style.display = 'flex';
          await Kanban.render();
        } else {
          defaultPanel.forEach(function (n) { n.style.display = ''; });
          board.style.display = 'none';
        }
      });
    },

    render: async function () {
      var board = document.getElementById('mega-kanban-board');
      if (!board) return;
      board.innerHTML = '<div class="mega-kanban__loading"><div class="mega-spinner"></div> Cargando prospectos...</div>';
      try {
        Kanban.cache = await fetchJson('/api/prospectos').catch(function () { return []; });
      } catch (_) { Kanban.cache = []; }

      var byStage = {};
      Kanban.STAGES.forEach(function (s) { byStage[s.id] = []; });
      (Kanban.cache || []).forEach(function (p) {
        var stage = (p.estado || 'prospecto').toLowerCase();
        if (!byStage[stage]) byStage[stage] = [];
        byStage[stage].push(p);
      });

      board.innerHTML = '';
      Kanban.STAGES.forEach(function (s) {
        var col = document.createElement('div');
        col.className = 'mega-kanban__col';
        col.dataset.stage = s.id;
        col.style.setProperty('--col-color', s.color);
        var items = byStage[s.id] || [];
        var totalUSD = items.reduce(function (sum, p) { return sum + (Number(p.potencial_usd) || 0); }, 0);
        col.innerHTML =
          '<div class="mega-kanban__col-header" style="border-top:3px solid ' + s.color + '">' +
            '<div class="mega-kanban__col-title">' + escapeHtml(s.label) + '</div>' +
            '<div class="mega-kanban__col-stats">' +
              '<span class="mega-kanban__col-count">' + items.length + '</span>' +
              (totalUSD > 0 ? '<span class="mega-kanban__col-sum">$' + Math.round(totalUSD / 1000) + 'k USD</span>' : '') +
            '</div>' +
          '</div>' +
          '<div class="mega-kanban__col-body" data-drop="' + s.id + '">' +
            items.map(function (p) {
              var initials = (p.empresa || '?').split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
              var score = Math.round(p.score_ia || 0);
              var scoreColor = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#94a3b8';
              return '<div class="mega-kanban__card" draggable="true" data-id="' + p.id + '">' +
                '<div class="mega-kanban__card-header">' +
                  '<div class="mega-kanban__card-avatar" style="background:linear-gradient(135deg,' + s.color + ',' + s.color + 'aa)">' + escapeHtml(initials) + '</div>' +
                  '<div class="mega-kanban__card-title">' + escapeHtml(p.empresa || 'Sin nombre') + '</div>' +
                '</div>' +
                (p.industria ? '<div class="mega-kanban__card-meta"><i class="fas fa-industry"></i> ' + escapeHtml(p.industria) + '</div>' : '') +
                (p.potencial_usd ? '<div class="mega-kanban__card-meta"><i class="fas fa-dollar-sign"></i> $' + Number(p.potencial_usd).toLocaleString('es-MX') + ' USD</div>' : '') +
                '<div class="mega-kanban__card-footer">' +
                  '<div class="mega-kanban__card-score" style="color:' + scoreColor + '" title="Score IA">★ ' + score + '</div>' +
                  '<i class="fas fa-grip-lines mega-kanban__card-grip"></i>' +
                '</div>' +
              '</div>';
            }).join('') +
          '</div>';
        board.appendChild(col);
      });

      Kanban.bindDragDrop(board);
    },

    bindDragDrop: function (board) {
      var dragged = null;
      board.querySelectorAll('.mega-kanban__card').forEach(function (card) {
        card.addEventListener('dragstart', function () {
          dragged = card;
          card.classList.add('is-dragging');
        });
        card.addEventListener('dragend', function () {
          if (dragged) dragged.classList.remove('is-dragging');
          dragged = null;
        });
      });
      board.querySelectorAll('.mega-kanban__col-body').forEach(function (col) {
        col.addEventListener('dragover', function (e) {
          e.preventDefault();
          col.classList.add('is-dragover');
        });
        col.addEventListener('dragleave', function () {
          col.classList.remove('is-dragover');
        });
        col.addEventListener('drop', async function (e) {
          e.preventDefault();
          col.classList.remove('is-dragover');
          if (!dragged) return;
          var newStage = col.getAttribute('data-drop');
          var id = dragged.getAttribute('data-id');
          var oldStage = dragged.parentElement.getAttribute('data-drop');
          if (newStage === oldStage) return;
          col.appendChild(dragged);
          /* Persist al backend */
          try {
            await fetchJson('/api/prospectos/' + id, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ estado: newStage }),
            });
            toast('✓ Movido a ' + newStage, 'success', { duration: 2500 });
            /* Trigger XP */
            if (window.MegaXP) window.MegaXP.award('prospect_move', 5);
            if (newStage === 'ganado') {
              if (window.MegaConfetti) window.MegaConfetti.fire({ count: 120 });
              if (window.MegaXP) window.MegaXP.award('prospect_won', 50);
            }
          } catch (e) {
            toast('Error guardando: ' + e.message, 'error');
            /* Rollback */
            board.querySelector('[data-drop="' + oldStage + '"]').appendChild(dragged);
          }
        });
      });
    },

    init: function () {
      var setup = function () { Kanban.inject(); };
      setTimeout(setup, 1500);
      var panel = document.getElementById('panel-prospeccion');
      if (panel) {
        var obs = new MutationObserver(setup);
        obs.observe(panel, { attributes: true, attributeFilter: ['class'] });
      }
    },
  };
  window.MegaKanban = Kanban;

  /* ════════════════════════════════════════════════════════════════
   * 2. GAMIFICATION XP + BADGES
   * ════════════════════════════════════════════════════════════════ */
  var XP = {
    KEY: 'cotizacion-xp-state',

    BADGES: [
      { id: 'first_client', label: 'Primer cliente', icon: '🎯', xp: 10, condition: function (s) { return s.actions.client_create >= 1; } },
      { id: 'first_quote', label: 'Primera cotización', icon: '💰', xp: 20, condition: function (s) { return s.actions.quote_create >= 1; } },
      { id: 'bronze_seller', label: 'Vendedor Bronce', icon: '🥉', xp: 100, condition: function (s) { return s.actions.quote_create >= 10; } },
      { id: 'silver_seller', label: 'Vendedor Plata', icon: '🥈', xp: 250, condition: function (s) { return s.actions.quote_create >= 50; } },
      { id: 'gold_seller', label: 'Vendedor Oro', icon: '🥇', xp: 500, condition: function (s) { return s.actions.quote_create >= 100; } },
      { id: 'closer', label: 'Closer', icon: '🎉', xp: 200, condition: function (s) { return s.actions.prospect_won >= 5; } },
      { id: 'streak_master', label: 'Streak Master', icon: '🔥', xp: 150, condition: function (s) { return s.streak >= 7; } },
      { id: 'night_owl', label: 'Búho nocturno', icon: '🦉', xp: 50, condition: function (s) { return s.nightActions >= 5; } },
      { id: 'davai_friend', label: 'Amigo de DavAI', icon: '🤖', xp: 30, condition: function (s) { return s.actions.davai_chat >= 10; } },
      { id: 'data_master', label: 'Data Master', icon: '📊', xp: 75, condition: function (s) { return s.actions.export >= 5; } },
    ],

    XP_LEVELS: [0, 50, 150, 300, 500, 800, 1200, 1700, 2300, 3000, 4000, 5500, 7500, 10000, 15000],

    state: function () {
      try {
        var s = JSON.parse(localStorage.getItem(XP.KEY) || '{}');
        s.xp = s.xp || 0;
        s.actions = s.actions || {};
        s.badges = s.badges || [];
        s.streak = s.streak || 0;
        s.nightActions = s.nightActions || 0;
        return s;
      } catch (_) { return { xp: 0, actions: {}, badges: [], streak: 0, nightActions: 0 }; }
    },

    save: function (s) {
      try { localStorage.setItem(XP.KEY, JSON.stringify(s)); } catch (_) {}
    },

    level: function (xp) {
      for (var i = XP.XP_LEVELS.length - 1; i >= 0; i--) {
        if (xp >= XP.XP_LEVELS[i]) return { level: i + 1, current: xp - XP.XP_LEVELS[i], next: (XP.XP_LEVELS[i + 1] || (xp + 1)) - XP.XP_LEVELS[i] };
      }
      return { level: 1, current: 0, next: 50 };
    },

    award: function (action, points) {
      points = points || 10;
      var s = XP.state();
      s.xp += points;
      s.actions[action] = (s.actions[action] || 0) + 1;
      var hour = new Date().getHours();
      if (hour >= 21 || hour < 6) s.nightActions++;
      var streak = window.MegaStreak ? window.MegaStreak.get && window.MegaStreak.get().days : 0;
      try { s.streak = JSON.parse(localStorage.getItem('cotizacion-streak') || '{}').days || 0; } catch (_) {}
      /* Check badges nuevos */
      var unlocked = [];
      XP.BADGES.forEach(function (b) {
        if (s.badges.indexOf(b.id) === -1 && b.condition(s)) {
          s.badges.push(b.id);
          s.xp += b.xp;
          unlocked.push(b);
        }
      });
      XP.save(s);
      XP.updateUI();
      unlocked.forEach(function (b) {
        XP.showBadgeUnlock(b);
      });
      /* +XP toast */
      toast('+' + points + ' XP · ' + action, 'info', { duration: 1500 });
    },

    showBadgeUnlock: function (badge) {
      var pop = document.createElement('div');
      pop.className = 'mega-badge-unlock';
      pop.innerHTML =
        '<div class="mega-badge-unlock__bg"></div>' +
        '<div class="mega-badge-unlock__panel">' +
          '<div class="mega-badge-unlock__icon">' + badge.icon + '</div>' +
          '<div class="mega-badge-unlock__title">¡Logro desbloqueado!</div>' +
          '<div class="mega-badge-unlock__name">' + escapeHtml(badge.label) + '</div>' +
          '<div class="mega-badge-unlock__xp">+' + badge.xp + ' XP</div>' +
          '<button class="mega-badge-unlock__close">Continuar</button>' +
        '</div>';
      document.body.appendChild(pop);
      requestAnimationFrame(function () { pop.classList.add('is-open'); });
      var close = function () {
        pop.classList.remove('is-open');
        setTimeout(function () { try { pop.remove(); } catch (_) {} }, 400);
      };
      pop.querySelector('.mega-badge-unlock__close').addEventListener('click', close);
      pop.querySelector('.mega-badge-unlock__bg').addEventListener('click', close);
      setTimeout(close, 5500);
      if (window.MegaConfetti) window.MegaConfetti.fire({ count: 80 });
    },

    injectButton: function () {
      if (document.querySelector('.mega-xp-btn')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mega-xp-btn';
      btn.title = 'Tu progreso';
      btn.innerHTML =
        '<div class="mega-xp-btn__level"><span class="mega-xp-btn__lvl-num">1</span></div>' +
        '<div class="mega-xp-btn__bar"><div class="mega-xp-btn__bar-fill"></div></div>';
      btn.addEventListener('click', XP.showProfile);

      var ref = document.querySelector('.recent-items-btn') ||
                document.querySelector('.activity-drawer-btn') ||
                document.querySelector('.theme-switcher');
      if (ref && ref.parentNode) ref.parentNode.insertBefore(btn, ref);
      else (document.querySelector('.header-inner') || document.body).appendChild(btn);
    },

    updateUI: function () {
      var s = XP.state();
      var lvl = XP.level(s.xp);
      var btn = document.querySelector('.mega-xp-btn');
      if (!btn) return;
      btn.querySelector('.mega-xp-btn__lvl-num').textContent = lvl.level;
      btn.querySelector('.mega-xp-btn__bar-fill').style.width = ((lvl.current / lvl.next) * 100) + '%';
      btn.title = 'Nivel ' + lvl.level + ' · ' + s.xp + ' XP · ' + s.badges.length + ' logros';
    },

    showProfile: function () {
      var s = XP.state();
      var lvl = XP.level(s.xp);
      var existing = document.getElementById('mega-xp-profile');
      if (existing) { existing.remove(); return; }
      var modal = document.createElement('div');
      modal.id = 'mega-xp-profile';
      modal.className = 'mega-xp-profile';
      modal.innerHTML =
        '<div class="mega-xp-profile__panel">' +
          '<div class="mega-xp-profile__header">' +
            '<div class="mega-xp-profile__level-circle">' +
              '<span class="mega-xp-profile__lvl-label">NIVEL</span>' +
              '<span class="mega-xp-profile__lvl-num">' + lvl.level + '</span>' +
            '</div>' +
            '<div class="mega-xp-profile__stats">' +
              '<div class="mega-xp-profile__xp">' + s.xp.toLocaleString('es-MX') + ' XP</div>' +
              '<div class="mega-xp-profile__progress">' +
                '<div class="mega-xp-profile__progress-bar">' +
                  '<div class="mega-xp-profile__progress-fill" style="width:' + ((lvl.current / lvl.next) * 100) + '%"></div>' +
                '</div>' +
                '<div class="mega-xp-profile__progress-text">' + lvl.current + ' / ' + lvl.next + ' XP al siguiente nivel</div>' +
              '</div>' +
            '</div>' +
            '<button class="mega-xp-profile__close">×</button>' +
          '</div>' +
          '<div class="mega-xp-profile__section-title">Logros (' + s.badges.length + '/' + XP.BADGES.length + ')</div>' +
          '<div class="mega-xp-profile__badges">' +
            XP.BADGES.map(function (b) {
              var unlocked = s.badges.indexOf(b.id) >= 0;
              return '<div class="mega-xp-badge ' + (unlocked ? 'is-unlocked' : '') + '" title="' + escapeHtml(b.label) + (unlocked ? ' (+' + b.xp + ' XP)' : ' — bloqueado') + '">' +
                '<div class="mega-xp-badge__icon">' + b.icon + '</div>' +
                '<div class="mega-xp-badge__label">' + escapeHtml(b.label) + '</div>' +
              '</div>';
            }).join('') +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
      requestAnimationFrame(function () { modal.classList.add('is-open'); });
      var close = function () {
        modal.classList.remove('is-open');
        setTimeout(function () { try { modal.remove(); } catch (_) {} }, 220);
      };
      modal.querySelector('.mega-xp-profile__close').addEventListener('click', close);
      modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    },

    hookFetch: function () {
      var orig = window.fetch;
      var actionMap = [
        { rx: /\/api\/clientes(\?|$)/, method: 'POST', action: 'client_create', xp: 10 },
        { rx: /\/api\/cotizaciones(\?|$)/, method: 'POST', action: 'quote_create', xp: 20 },
        { rx: /\/api\/prospectos(\?|$)/, method: 'POST', action: 'prospect_create', xp: 15 },
        { rx: /\/api\/incidentes(\?|$)/, method: 'POST', action: 'incident_create', xp: 10 },
        { rx: /\/api\/davai\/chat/, method: 'POST', action: 'davai_chat', xp: 2 },
      ];
      window.fetch = function (input, init) {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var method = (init && init.method || (input && input.method) || 'GET').toUpperCase();
        var p = orig.apply(this, arguments);
        actionMap.forEach(function (m) {
          if (m.method === method && m.rx.test(url)) {
            p.then(function (r) { if (r && r.ok) XP.award(m.action, m.xp); }).catch(function () {});
          }
        });
        return p;
      };
    },

    init: function () {
      XP.injectButton();
      XP.updateUI();
      XP.hookFetch();
    },
  };
  window.MegaXP = XP;

  /* ════════════════════════════════════════════════════════════════
   * 3. AI QUOTE PRICING PREDICTOR
   * ════════════════════════════════════════════════════════════════ */
  var Predictor = {
    cache: null,

    loadHistory: async function () {
      if (Predictor.cache) return Predictor.cache;
      try {
        Predictor.cache = await fetchJson('/api/cotizaciones').catch(function () { return []; });
      } catch (_) { Predictor.cache = []; }
      return Predictor.cache;
    },

    predict: async function (clienteId, clienteNombre) {
      var rows = await Predictor.loadHistory();
      var match = (rows || []).filter(function (r) {
        return (clienteId && r.cliente_id === clienteId) ||
               (clienteNombre && r.cliente_nombre === clienteNombre);
      });
      if (match.length < 2) return null;
      var totals = match.map(function (r) { return Number(r.total) || 0; }).filter(function (n) { return n > 0; });
      if (totals.length < 2) return null;
      totals.sort(function (a, b) { return a - b; });
      var avg = totals.reduce(function (a, b) { return a + b; }, 0) / totals.length;
      var median = totals[Math.floor(totals.length / 2)];
      var max = Math.max.apply(null, totals);
      var min = Math.min.apply(null, totals);
      var suggested = Math.round((avg + median) / 2);
      return { suggested: suggested, avg: avg, median: median, max: max, min: min, count: totals.length };
    },

    inject: function () {
      /* Detectar inputs de "total" en el form de nueva cotización */
      var input = document.querySelector('#form-cotizacion input[name="total"], #form-cotizacion input#total, [data-cotizacion-form] input[name="total"]');
      if (!input || input.dataset.predictorAttached) return;
      input.dataset.predictorAttached = '1';

      /* Extraer cliente del modal/form */
      var trigger = async function () {
        var form = input.closest('form');
        if (!form) return;
        var clienteSelect = form.querySelector('select[name="cliente_id"], select[name="cliente"]');
        var clienteNombreInput = form.querySelector('input[name="cliente_nombre"]');
        var clienteId = clienteSelect ? clienteSelect.value : null;
        var clienteNombre = clienteNombreInput ? clienteNombreInput.value : (clienteSelect ? clienteSelect.options[clienteSelect.selectedIndex].text : null);
        if (!clienteId && !clienteNombre) return;
        var pred = await Predictor.predict(clienteId, clienteNombre);
        Predictor.show(input, pred);
      };

      var clienteSelect = input.form && input.form.querySelector('select[name="cliente_id"]');
      if (clienteSelect) clienteSelect.addEventListener('change', trigger);
      input.addEventListener('focus', trigger);
    },

    show: function (input, pred) {
      Predictor.hide();
      if (!pred) return;
      var rect = input.getBoundingClientRect();
      var pop = document.createElement('div');
      pop.id = 'mega-predictor';
      pop.className = 'mega-predictor';
      pop.style.cssText = 'top:' + (rect.bottom + 8) + 'px;left:' + rect.left + 'px;width:' + Math.max(rect.width, 320) + 'px';
      pop.innerHTML =
        '<div class="mega-predictor__header">' +
          '<i class="fas fa-robot"></i> DavAI sugiere precio basado en historial' +
        '</div>' +
        '<div class="mega-predictor__main">' +
          '<div class="mega-predictor__suggested" data-value="' + pred.suggested + '">' +
            '$' + pred.suggested.toLocaleString('es-MX') +
          '</div>' +
          '<button class="mega-predictor__apply">Aplicar</button>' +
        '</div>' +
        '<div class="mega-predictor__stats">' +
          '<span>Promedio: $' + Math.round(pred.avg).toLocaleString('es-MX') + '</span>' +
          '<span>Mediana: $' + Math.round(pred.median).toLocaleString('es-MX') + '</span>' +
          '<span>Rango: $' + Math.round(pred.min).toLocaleString('es-MX') + ' – $' + Math.round(pred.max).toLocaleString('es-MX') + '</span>' +
        '</div>' +
        '<div class="mega-predictor__footer">Basado en ' + pred.count + ' cotización' + (pred.count > 1 ? 'es' : '') + ' previas</div>';
      document.body.appendChild(pop);
      pop.querySelector('.mega-predictor__apply').addEventListener('click', function () {
        input.value = pred.suggested;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        Predictor.hide();
        toast('Precio sugerido aplicado', 'success', { duration: 2000 });
      });
      input.addEventListener('blur', function () {
        setTimeout(Predictor.hide, 300);
      }, { once: true });
    },

    hide: function () {
      var p = document.getElementById('mega-predictor');
      if (p) p.remove();
    },

    init: function () {
      var setup = function () { Predictor.inject(); };
      var obs = new MutationObserver(function () {
        clearTimeout(window.__predDebounce);
        window.__predDebounce = setTimeout(setup, 500);
      });
      obs.observe(document.body, { childList: true, subtree: true });
    },
  };
  window.MegaPredictor = Predictor;

  /* ════════════════════════════════════════════════════════════════
   * 4. ONBOARDING TUTORIAL ANIMADO (slideshow visual)
   * ════════════════════════════════════════════════════════════════ */
  var Tutorial = {
    SLIDES: [
      {
        title: 'Captura clientes en segundos',
        body: 'Click en <strong>Clientes → Nuevo</strong> y llena los datos. Los avatares se generan automáticos con color único.',
        anim: 'cliente',
      },
      {
        title: 'Genera cotizaciones inteligentes',
        body: 'Crea cotizaciones de refacciones o mano de obra. <strong>DavAI te sugiere precios</strong> basados en el historial del cliente.',
        anim: 'cotizacion',
      },
      {
        title: 'Pipeline visual de prospectos',
        body: 'En Prospección activa la <strong>vista Kanban</strong> y arrastra prospectos entre etapas (Calificado → Propuesta → Ganado).',
        anim: 'kanban',
      },
      {
        title: 'Habla con DavAI',
        body: 'Click el botón flotante o presiona <strong>/</strong> y pregúntale lo que sea. También funciona con voz (botón mic).',
        anim: 'davai',
      },
      {
        title: 'Comandos rápidos',
        body: 'Presiona <strong>Ctrl+K</strong> para buscar paneles/clientes, <strong>Ctrl+N</strong> para crear nuevos, <strong>?</strong> para ver todos los atajos.',
        anim: 'keys',
      },
    ],
    current: 0,

    show: function () {
      var existing = document.getElementById('mega-tutorial');
      if (existing) { existing.remove(); return; }
      var modal = document.createElement('div');
      modal.id = 'mega-tutorial';
      modal.className = 'mega-tutorial';
      modal.innerHTML =
        '<div class="mega-tutorial__panel">' +
          '<button class="mega-tutorial__close">×</button>' +
          '<div class="mega-tutorial__slide" id="mega-tutorial-slide"></div>' +
          '<div class="mega-tutorial__nav">' +
            '<button class="mega-tutorial__prev">← Atrás</button>' +
            '<div class="mega-tutorial__dots" id="mega-tutorial-dots"></div>' +
            '<button class="mega-tutorial__next">Siguiente →</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
      Tutorial.current = 0;
      Tutorial.render();
      requestAnimationFrame(function () { modal.classList.add('is-open'); });
      var close = function () {
        modal.classList.remove('is-open');
        setTimeout(function () { try { modal.remove(); } catch (_) {} }, 220);
      };
      modal.querySelector('.mega-tutorial__close').addEventListener('click', close);
      modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
      modal.querySelector('.mega-tutorial__prev').addEventListener('click', function () {
        if (Tutorial.current > 0) { Tutorial.current--; Tutorial.render(); }
      });
      modal.querySelector('.mega-tutorial__next').addEventListener('click', function () {
        if (Tutorial.current < Tutorial.SLIDES.length - 1) { Tutorial.current++; Tutorial.render(); }
        else close();
      });
    },

    render: function () {
      var slide = Tutorial.SLIDES[Tutorial.current];
      var slideEl = document.getElementById('mega-tutorial-slide');
      var dots = document.getElementById('mega-tutorial-dots');
      slideEl.innerHTML =
        '<div class="mega-tutorial__anim" data-anim="' + slide.anim + '">' + Tutorial.animFor(slide.anim) + '</div>' +
        '<h2 class="mega-tutorial__title">' + escapeHtml(slide.title) + '</h2>' +
        '<p class="mega-tutorial__body">' + slide.body + '</p>';
      dots.innerHTML = Tutorial.SLIDES.map(function (_, i) {
        return '<span class="mega-tutorial__dot ' + (i === Tutorial.current ? 'is-active' : '') + '"></span>';
      }).join('');
      var prev = document.querySelector('.mega-tutorial__prev');
      var next = document.querySelector('.mega-tutorial__next');
      if (prev) prev.style.visibility = Tutorial.current === 0 ? 'hidden' : 'visible';
      if (next) next.textContent = Tutorial.current === Tutorial.SLIDES.length - 1 ? '✓ Terminar' : 'Siguiente →';
    },

    animFor: function (kind) {
      /* SVG animados ligeros por slide */
      if (kind === 'cliente') {
        return '<svg viewBox="0 0 200 120" width="100%" height="160">' +
          '<rect x="20" y="20" width="160" height="80" rx="10" fill="rgba(59,130,246,0.1)" stroke="rgba(59,130,246,0.4)" stroke-width="1.5"/>' +
          '<circle cx="50" cy="50" r="14" fill="url(#cli-grad)"><animate attributeName="r" values="14;16;14" dur="2s" repeatCount="indefinite"/></circle>' +
          '<text x="50" y="55" text-anchor="middle" fill="#fff" font-weight="700" font-size="13">JD</text>' +
          '<rect x="78" y="42" width="80" height="6" rx="3" fill="rgba(255,255,255,0.15)"/>' +
          '<rect x="78" y="54" width="55" height="5" rx="2.5" fill="rgba(255,255,255,0.10)"/>' +
          '<rect x="20" y="80" width="160" height="20" rx="8" fill="rgba(34,197,94,0.15)"><animate attributeName="opacity" values="0;1" dur="1.6s" repeatCount="indefinite"/></rect>' +
          '<text x="100" y="93" text-anchor="middle" fill="#4ade80" font-size="10" font-weight="700">✓ CLIENTE GUARDADO</text>' +
          '<defs><linearGradient id="cli-grad"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#8b5cf6"/></linearGradient></defs>' +
        '</svg>';
      }
      if (kind === 'cotizacion') {
        return '<svg viewBox="0 0 200 120" width="100%" height="160">' +
          '<rect x="40" y="15" width="120" height="90" rx="8" fill="rgba(34,197,94,0.08)" stroke="rgba(34,197,94,0.4)"/>' +
          '<text x="100" y="38" text-anchor="middle" fill="#cbd5e1" font-size="9" font-weight="700">COT-2026-001</text>' +
          '<rect x="55" y="48" width="90" height="4" rx="2" fill="rgba(255,255,255,0.10)"/>' +
          '<rect x="55" y="58" width="70" height="4" rx="2" fill="rgba(255,255,255,0.10)"/>' +
          '<text x="100" y="85" text-anchor="middle" fill="#22c55e" font-size="18" font-weight="800">$15,200<animate attributeName="opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite"/></text>' +
          '<text x="100" y="98" text-anchor="middle" fill="#94a3b8" font-size="7">SUGERIDO POR DAVAI</text>' +
        '</svg>';
      }
      if (kind === 'kanban') {
        return '<svg viewBox="0 0 240 120" width="100%" height="160">' +
          '<g><rect x="10" y="10" width="55" height="100" rx="6" fill="rgba(59,130,246,0.06)" stroke="rgba(59,130,246,0.3)"/>' +
          '<text x="37.5" y="22" text-anchor="middle" fill="#60a5fa" font-size="7" font-weight="700">PROSPECTO</text>' +
          '<rect x="15" y="30" width="45" height="14" rx="3" fill="rgba(59,130,246,0.2)"/></g>' +
          '<g><rect x="75" y="10" width="55" height="100" rx="6" fill="rgba(245,158,11,0.06)" stroke="rgba(245,158,11,0.3)"/>' +
          '<text x="102.5" y="22" text-anchor="middle" fill="#fcd34d" font-size="7" font-weight="700">PROPUESTA</text>' +
          '<rect x="80" y="30" width="45" height="14" rx="3" fill="rgba(245,158,11,0.2)"><animate attributeName="x" values="80;90;80" dur="3s" repeatCount="indefinite"/></rect></g>' +
          '<g><rect x="140" y="10" width="55" height="100" rx="6" fill="rgba(34,197,94,0.06)" stroke="rgba(34,197,94,0.3)"/>' +
          '<text x="167.5" y="22" text-anchor="middle" fill="#4ade80" font-size="7" font-weight="700">GANADO 🎉</text>' +
          '<rect x="145" y="30" width="45" height="14" rx="3" fill="rgba(34,197,94,0.2)"/></g>' +
          '<text x="120" y="55" text-anchor="middle" font-size="20">→</text>' +
        '</svg>';
      }
      if (kind === 'davai') {
        return '<svg viewBox="0 0 200 120" width="100%" height="160">' +
          '<circle cx="160" cy="90" r="22" fill="url(#davai-grad-tut)"><animate attributeName="r" values="22;24;22" dur="2s" repeatCount="indefinite"/></circle>' +
          '<text x="160" y="96" text-anchor="middle" fill="#fff" font-size="20">🤖</text>' +
          '<rect x="20" y="30" width="100" height="40" rx="8" fill="rgba(139,92,246,0.12)" stroke="rgba(139,92,246,0.4)"/>' +
          '<text x="70" y="48" text-anchor="middle" fill="#cbd5e1" font-size="8">¿Cuántos clientes</text>' +
          '<text x="70" y="60" text-anchor="middle" fill="#cbd5e1" font-size="8">tengo este mes?</text>' +
          '<defs><linearGradient id="davai-grad-tut"><stop offset="0%" stop-color="#3b82f6"/><stop offset="50%" stop-color="#8b5cf6"/><stop offset="100%" stop-color="#f59e0b"/></linearGradient></defs>' +
        '</svg>';
      }
      if (kind === 'keys') {
        return '<svg viewBox="0 0 240 100" width="100%" height="160">' +
          '<g><rect x="10" y="40" width="50" height="30" rx="6" fill="rgba(15,23,42,0.6)" stroke="rgba(255,255,255,0.2)"/>' +
          '<text x="35" y="60" text-anchor="middle" fill="#cbd5e1" font-family="monospace" font-size="11" font-weight="700">Ctrl</text></g>' +
          '<text x="68" y="60" fill="#94a3b8" font-size="14">+</text>' +
          '<g><rect x="80" y="40" width="40" height="30" rx="6" fill="rgba(59,130,246,0.4)" stroke="#3b82f6"><animate attributeName="opacity" values="1;0.6;1" dur="1.5s" repeatCount="indefinite"/></rect>' +
          '<text x="100" y="60" text-anchor="middle" fill="#fff" font-family="monospace" font-size="12" font-weight="700">K</text></g>' +
          '<text x="180" y="35" text-anchor="middle" fill="#cbd5e1" font-size="10">Abre paleta de comandos</text>' +
          '<text x="180" y="80" text-anchor="middle" fill="#94a3b8" font-size="9">Buscar clientes, paneles,</text>' +
          '<text x="180" y="92" text-anchor="middle" fill="#94a3b8" font-size="9">acciones rápidas, etc.</text>' +
        '</svg>';
      }
      return '';
    },

    injectButton: function () {
      var menu = document.querySelector('.header-profile-menu');
      if (!menu || menu.querySelector('#mega-tutorial-trigger')) return;
      var item = document.createElement('button');
      item.id = 'mega-tutorial-trigger';
      item.type = 'button';
      item.className = 'header-profile-menu-item';
      item.setAttribute('role', 'menuitem');
      item.innerHTML = '<i class="fas fa-graduation-cap"></i><span>Ver tutorial</span>';
      item.addEventListener('click', Tutorial.show);
      menu.appendChild(item);
    },

    init: function () {
      var obs = new MutationObserver(function () {
        Tutorial.injectButton();
      });
      obs.observe(document.body, { childList: true, subtree: true });
    },
  };
  window.MegaTutorial = Tutorial;

  /* ════════════════════════════════════════════════════════════════
   * BOOT
   * ════════════════════════════════════════════════════════════════ */
  function boot() {
    Kanban.init();
    XP.init();
    Predictor.init();
    Tutorial.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
