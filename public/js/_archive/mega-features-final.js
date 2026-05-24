/* ════════════════════════════════════════════════════════════════════════
 * MEGA FEATURES FINAL — 30 mejoras sorprendentes
 * ════════════════════════════════════════════════════════════════════════ */
;(function () {
  'use strict';

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }
  function toast(msg, kind, opts) {
    if (window.MegaToast && window.MegaToast.show) return window.MegaToast.show(msg, kind, opts);
    if (window.showToast) return window.showToast(msg, kind);
  }

  /* ═══════════════════ 1. SMART TIMESTAMPS ═══════════════════ */
  var SmartTime = {
    relative: function (date) {
      var d = new Date(date);
      if (isNaN(d.getTime())) return String(date);
      var diff = Date.now() - d.getTime();
      var mins = Math.floor(diff / 60000);
      var hours = Math.floor(mins / 60);
      var days = Math.floor(hours / 24);
      if (mins < 1) return 'ahora';
      if (mins < 60) return 'hace ' + mins + ' min';
      if (hours < 24) return 'hace ' + hours + ' h';
      if (days < 7) return 'hace ' + days + ' día' + (days > 1 ? 's' : '');
      if (days < 30) return 'hace ' + Math.floor(days / 7) + ' sem';
      return d.toLocaleDateString('es-MX');
    },
    /* Convierte fechas en celdas a relativos (con tooltip = original) */
    auto: function () {
      document.querySelectorAll('td').forEach(function (td) {
        if (td.dataset.smartTimeApplied) return;
        var t = td.textContent.trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(t) && !td.querySelector('*')) {
          td.dataset.smartTimeApplied = '1';
          td.dataset.originalDate = t;
          td.title = t;
          td.textContent = SmartTime.relative(t);
        }
      });
    },
  };
  window.MegaTime = SmartTime;

  /* ═══════════════════ 2. CLICK-TO-COPY (Alt+click en celdas) ═══════════════════ */
  document.addEventListener('click', function (e) {
    if (!e.altKey) return;
    var td = e.target.closest('td');
    if (!td) return;
    var text = td.textContent.trim();
    if (!text) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () {
        toast('Copiado: ' + text.slice(0, 40), 'success', { duration: 2000 });
      });
    }
  });

  /* ═══════════════════ 3. BOOKMARK PANELS (favoritos) ═══════════════════ */
  var Bookmarks = {
    KEY: 'cotizacion-bookmarks',
    list: function () {
      try { return JSON.parse(localStorage.getItem(Bookmarks.KEY) || '[]'); }
      catch (_) { return []; }
    },
    toggle: function (id) {
      var l = Bookmarks.list();
      var idx = l.indexOf(id);
      if (idx >= 0) l.splice(idx, 1);
      else l.push(id);
      try { localStorage.setItem(Bookmarks.KEY, JSON.stringify(l)); } catch (_) {}
      Bookmarks.refresh();
      return idx < 0;
    },
    refresh: function () {
      var l = Bookmarks.list();
      document.querySelectorAll('[data-tab]').forEach(function (tab) {
        var id = tab.getAttribute('data-tab');
        var star = tab.querySelector('.mega-bookmark-star');
        if (l.indexOf(id) >= 0) {
          if (!star) {
            var s = document.createElement('span');
            s.className = 'mega-bookmark-star';
            s.innerHTML = '★';
            tab.appendChild(s);
          }
        } else if (star) star.remove();
      });
    },
    init: function () {
      Bookmarks.refresh();
      /* Long-press / right-click toggle */
      document.addEventListener('contextmenu', function (e) {
        var tab = e.target.closest('[data-tab]');
        if (!tab) return;
        e.preventDefault();
        var added = Bookmarks.toggle(tab.getAttribute('data-tab'));
        toast(added ? '⭐ Favorito agregado' : 'Favorito removido', 'info', { duration: 1800 });
      });
    },
  };

  /* ═══════════════════ 4. PRINT MODE (stylesheet propio) ═══════════════════ */
  var printStyle = document.createElement('style');
  printStyle.id = 'mega-print-style';
  printStyle.textContent =
    '@media print {' +
      '.davai-fab, .header-inner > button, .activity-drawer, .mega-toasts, ' +
      '.theme-switcher, .density-toggle, .focus-mode-toggle, .recent-items-btn, ' +
      '.activity-drawer-btn, #cmdk, .mega-pwa-banner, #mega-particles-bg, ' +
      '.sidebar-nav, .tabs.tabs--rail, .filter-row, .toolbar, .panel-toolbar, ' +
      '.mega-quick-chips, .mega-saved-views, .th-actions, td.actions { display: none !important; }' +
      'body { background: white !important; color: black !important; }' +
      '* { color: black !important; background: white !important; box-shadow: none !important; }' +
      'table { border-collapse: collapse !important; }' +
      'th, td { border: 1px solid #ccc !important; padding: 6px 10px !important; }' +
      '.panel.active { display: block !important; }' +
    '}';
  document.head.appendChild(printStyle);

  /* ═══════════════════ 5. QUICK MATH (selecciona números → suma flotante) ═══════════════════ */
  document.addEventListener('mouseup', function (e) {
    setTimeout(function () {
      var sel = window.getSelection();
      var text = sel ? sel.toString().trim() : '';
      if (!text || text.length < 3) { hideMath(); return; }
      var nums = text.match(/-?\d+(\.\d+)?/g);
      if (!nums || nums.length < 2) { hideMath(); return; }
      var values = nums.map(parseFloat).filter(function (n) { return isFinite(n); });
      if (values.length < 2) { hideMath(); return; }
      var sum = values.reduce(function (a, b) { return a + b; }, 0);
      var avg = sum / values.length;
      var max = Math.max.apply(null, values);
      var min = Math.min.apply(null, values);
      showMath(sum, avg, max, min, values.length, e.clientX, e.clientY);
    }, 50);
  });
  function showMath(sum, avg, max, min, n, x, y) {
    hideMath();
    var pop = document.createElement('div');
    pop.id = 'mega-math-pop';
    pop.className = 'mega-math-pop';
    pop.style.cssText = 'top:' + (y + 12) + 'px;left:' + Math.min(x, window.innerWidth - 280) + 'px';
    pop.innerHTML =
      '<div class="mega-math-pop__title"><i class="fas fa-calculator"></i> ' + n + ' valores</div>' +
      '<div class="mega-math-pop__row"><span>Σ Suma</span><strong>' + sum.toLocaleString('es-MX', { maximumFractionDigits: 2 }) + '</strong></div>' +
      '<div class="mega-math-pop__row"><span>x̄ Promedio</span><strong>' + avg.toLocaleString('es-MX', { maximumFractionDigits: 2 }) + '</strong></div>' +
      '<div class="mega-math-pop__row"><span>↑ Máximo</span><strong>' + max.toLocaleString('es-MX', { maximumFractionDigits: 2 }) + '</strong></div>' +
      '<div class="mega-math-pop__row"><span>↓ Mínimo</span><strong>' + min.toLocaleString('es-MX', { maximumFractionDigits: 2 }) + '</strong></div>';
    document.body.appendChild(pop);
  }
  function hideMath() {
    var p = document.getElementById('mega-math-pop');
    if (p) p.remove();
  }
  document.addEventListener('mousedown', function (e) {
    if (!e.target.closest('#mega-math-pop')) hideMath();
  });

  /* ═══════════════════ 6. IMAGE PREVIEW HOVER ═══════════════════ */
  document.addEventListener('mouseover', function (e) {
    var img = e.target;
    if (img.tagName !== 'IMG') return;
    if (img.naturalWidth < 80 || img.naturalHeight < 80) return;
    if (img.dataset.noPreview) return;
    if (img.closest('.mega-img-zoomed')) return;
    showImagePreview(img);
  });
  function showImagePreview(img) {
    hideImagePreview();
    var rect = img.getBoundingClientRect();
    var pop = document.createElement('div');
    pop.id = 'mega-img-preview';
    pop.className = 'mega-img-preview';
    pop.innerHTML = '<img src="' + img.src + '" alt="">';
    document.body.appendChild(pop);
    var pRect = pop.getBoundingClientRect();
    var x = Math.min(rect.right + 10, window.innerWidth - pRect.width - 10);
    var y = Math.max(10, Math.min(rect.top, window.innerHeight - pRect.height - 10));
    pop.style.cssText = 'top:' + y + 'px;left:' + x + 'px';
  }
  function hideImagePreview() {
    var p = document.getElementById('mega-img-preview');
    if (p) p.remove();
  }
  document.addEventListener('mouseout', function (e) {
    if (e.target.tagName === 'IMG') hideImagePreview();
  });

  /* ═══════════════════ 7. AUTO-SAVE INDICATOR ═══════════════════ */
  var AutoSave = {
    show: function (state) {
      var i = document.getElementById('mega-autosave');
      if (!i) {
        i = document.createElement('div');
        i.id = 'mega-autosave';
        i.className = 'mega-autosave';
        document.body.appendChild(i);
      }
      var icons = { saving: '<i class="fas fa-sync-alt fa-spin"></i> Guardando...', saved: '<i class="fas fa-check"></i> Guardado', error: '<i class="fas fa-exclamation-triangle"></i> Error' };
      i.innerHTML = icons[state] || icons.saved;
      i.dataset.state = state;
      i.classList.add('is-visible');
      clearTimeout(i.__timer);
      if (state !== 'saving') {
        i.__timer = setTimeout(function () { i.classList.remove('is-visible'); }, 2500);
      }
    },
  };
  /* Hook fetch para mostrar autosave en POST/PUT/PATCH */
  (function () {
    var orig = window.fetch;
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var method = (init && init.method || (input && input.method) || 'GET').toUpperCase();
      if (['POST', 'PUT', 'PATCH'].indexOf(method) !== -1 && url.indexOf('/api/') !== -1 && url.indexOf('/api/davai') === -1) {
        AutoSave.show('saving');
      }
      var p = orig.apply(this, arguments);
      p.then(function (r) {
        if (['POST', 'PUT', 'PATCH'].indexOf(method) !== -1 && url.indexOf('/api/') !== -1 && url.indexOf('/api/davai') === -1) {
          AutoSave.show(r && r.ok ? 'saved' : 'error');
        }
      }).catch(function () {
        if (['POST', 'PUT', 'PATCH'].indexOf(method) !== -1) AutoSave.show('error');
      });
      return p;
    };
  })();
  window.MegaAutoSave = AutoSave;

  /* ═══════════════════ 8. NETWORK STATUS INDICATOR ═══════════════════ */
  var Network = {
    init: function () {
      var update = function () {
        var dot = document.getElementById('mega-network-dot');
        if (!dot) {
          dot = document.createElement('div');
          dot.id = 'mega-network-dot';
          dot.className = 'mega-network-dot';
          document.body.appendChild(dot);
        }
        if (navigator.onLine) {
          dot.classList.remove('is-offline');
          dot.title = 'En línea';
        } else {
          dot.classList.add('is-offline');
          dot.title = 'Sin conexión';
          toast('⚠️ Sin conexión — los cambios se sincronizarán al volver', 'warning', { duration: 5000 });
        }
      };
      update();
      window.addEventListener('online', function () { update(); toast('✓ Conexión restaurada', 'success'); });
      window.addEventListener('offline', update);
    },
  };

  /* ═══════════════════ 9. RECENT SEARCHES en Cmd+K ═══════════════════ */
  var RecentSearches = {
    KEY: 'cotizacion-recent-searches',
    list: function () {
      try { return JSON.parse(localStorage.getItem(RecentSearches.KEY) || '[]'); }
      catch (_) { return []; }
    },
    add: function (q) {
      if (!q || q.length < 2) return;
      var l = RecentSearches.list().filter(function (x) { return x !== q; });
      l.unshift(q);
      l = l.slice(0, 8);
      try { localStorage.setItem(RecentSearches.KEY, JSON.stringify(l)); } catch (_) {}
    },
    init: function () {
      var debounce;
      document.addEventListener('input', function (e) {
        if (e.target && e.target.id === 'cmdk-input') {
          clearTimeout(debounce);
          debounce = setTimeout(function () {
            RecentSearches.add(e.target.value.trim());
          }, 1500);
        }
      });
    },
  };
  RecentSearches.init();
  window.MegaRecentSearches = RecentSearches;

  /* ═══════════════════ 10. TRENDING INDICATOR (↑↓ en KPIs) ═══════════════════ */
  var Trending = {
    PREV_KEY: 'cotizacion-kpi-prev',
    snapshot: function () {
      var values = {};
      document.querySelectorAll('.scorecard__value, .kpi-value, .stat-value').forEach(function (el, i) {
        var t = el.textContent.trim();
        var n = parseFloat(t.replace(/[^\d.-]/g, ''));
        if (isFinite(n)) values['kpi_' + i] = n;
      });
      try { localStorage.setItem(Trending.PREV_KEY, JSON.stringify(values)); } catch (_) {}
    },
    apply: function () {
      var prev;
      try { prev = JSON.parse(localStorage.getItem(Trending.PREV_KEY) || '{}'); }
      catch (_) { prev = {}; }
      document.querySelectorAll('.scorecard__value, .kpi-value, .stat-value').forEach(function (el, i) {
        if (el.querySelector('.mega-trend')) return;
        var t = el.textContent.trim();
        var n = parseFloat(t.replace(/[^\d.-]/g, ''));
        if (!isFinite(n)) return;
        var p = prev['kpi_' + i];
        if (p == null || p === n) return;
        var diff = n - p;
        var pct = p !== 0 ? ((diff / Math.abs(p)) * 100).toFixed(1) : '0';
        var trend = document.createElement('span');
        trend.className = 'mega-trend ' + (diff > 0 ? 'mega-trend--up' : 'mega-trend--down');
        trend.innerHTML = (diff > 0 ? '↑' : '↓') + ' ' + Math.abs(pct) + '%';
        trend.title = 'Anterior: ' + p.toLocaleString('es-MX');
        el.appendChild(trend);
      });
    },
    init: function () {
      setTimeout(Trending.apply, 2500);
      setInterval(Trending.snapshot, 5 * 60 * 1000); /* snapshot cada 5 min */
    },
  };

  /* ═══════════════════ 11. STREAK TRACKER ═══════════════════ */
  var Streak = {
    KEY: 'cotizacion-streak',
    get: function () {
      try { return JSON.parse(localStorage.getItem(Streak.KEY) || '{"days":0,"last":""}'); }
      catch (_) { return { days: 0, last: '' }; }
    },
    bump: function () {
      var s = Streak.get();
      var today = new Date().toISOString().slice(0, 10);
      if (s.last === today) return;
      var yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      s.days = s.last === yesterday ? s.days + 1 : 1;
      s.last = today;
      try { localStorage.setItem(Streak.KEY, JSON.stringify(s)); } catch (_) {}
      if (s.days >= 3) {
        toast('🔥 ¡Racha de ' + s.days + ' días! Sigue así.', 'success', { duration: 4000, title: 'Streak' });
      }
    },
    init: function () { Streak.bump(); },
  };

  /* ═══════════════════ 12. SOUND EFFECTS opt-in ═══════════════════ */
  var Sounds = {
    KEY: 'cotizacion-sounds',
    enabled: function () {
      try { return localStorage.getItem(Sounds.KEY) === '1'; } catch (_) { return false; }
    },
    play: function (kind) {
      if (!Sounds.enabled()) return;
      try {
        var ctx = Sounds.ctx || (Sounds.ctx = new (window.AudioContext || window.webkitAudioContext)());
        var o = ctx.createOscillator();
        var g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        var freqs = { click: 800, success: 660, error: 220, info: 440 };
        o.frequency.value = freqs[kind] || 440;
        o.type = 'sine';
        g.gain.value = 0.04;
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
        o.start();
        o.stop(ctx.currentTime + 0.18);
      } catch (_) {}
    },
  };
  window.MegaSounds = Sounds;

  /* ═══════════════════ 13. STARRED FILTER en tablas ═══════════════════ */
  var Starred = {
    KEY: 'cotizacion-starred',
    get: function (resource) {
      try { return JSON.parse(localStorage.getItem(Starred.KEY + ':' + resource) || '[]'); }
      catch (_) { return []; }
    },
    toggle: function (resource, id) {
      var l = Starred.get(resource);
      var idx = l.indexOf(id);
      if (idx >= 0) l.splice(idx, 1); else l.push(id);
      try { localStorage.setItem(Starred.KEY + ':' + resource, JSON.stringify(l)); } catch (_) {}
      return idx < 0;
    },
  };
  window.MegaStarred = Starred;

  /* ═══════════════════ 14. CUSTOMIZABLE THEME COLOR ═══════════════════ */
  var ThemeColor = {
    KEY: 'cotizacion-theme-color',
    apply: function (hex) {
      document.documentElement.style.setProperty('--mega-primary', hex);
      var s = document.getElementById('mega-theme-color-style');
      if (!s) {
        s = document.createElement('style');
        s.id = 'mega-theme-color-style';
        document.head.appendChild(s);
      }
      s.textContent =
        ':root { --mega-primary: ' + hex + ' !important; }' +
        '.btn.primary, .btn-primary, .mega-cmdk__item.is-active::before, ' +
        '.davai-fab__send, .focus-mode-toggle:hover { background: ' + hex + ' !important; }';
      try { localStorage.setItem(ThemeColor.KEY, hex); } catch (_) {}
    },
    init: function () {
      try { var v = localStorage.getItem(ThemeColor.KEY); if (v) ThemeColor.apply(v); } catch (_) {}
    },
  };
  window.MegaThemeColor = ThemeColor;

  /* ═══════════════════ 15. TOAST QUEUE LIMIT (max 3 visibles) ═══════════════════ */
  setInterval(function () {
    var toasts = document.querySelectorAll('.mega-toast:not(.is-leaving)');
    if (toasts.length > 3) {
      for (var i = 0; i < toasts.length - 3; i++) {
        toasts[i].classList.add('is-leaving');
        setTimeout((function (t) { return function () { try { t.remove(); } catch (_) {} }; })(toasts[i]), 260);
      }
    }
  }, 500);

  /* ═══════════════════ 16. EMPTY STATE SVG ILUSTRADO ═══════════════════ */
  var EMPTY_SVG = '<svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.4;margin:0 auto;display:block">' +
    '<rect x="8" y="14" width="48" height="38" rx="4"/>' +
    '<line x1="8" y1="22" x2="56" y2="22"/>' +
    '<circle cx="16" cy="18" r="1.5"/><circle cx="22" cy="18" r="1.5"/><circle cx="28" cy="18" r="1.5"/>' +
    '<line x1="20" y1="32" x2="44" y2="32" stroke-dasharray="4 4"/>' +
    '<line x1="20" y1="40" x2="36" y2="40" stroke-dasharray="4 4"/>' +
  '</svg>';
  function enhanceEmptyStates() {
    document.querySelectorAll('tr.empty-row td, tr.no-data td').forEach(function (td) {
      if (td.dataset.svgEnhanced) return;
      td.dataset.svgEnhanced = '1';
      var orig = td.innerHTML;
      td.innerHTML = '<div style="text-align:center;padding:30px 10px">' + EMPTY_SVG +
        '<div style="margin-top:10px;color:#94a3b8">' + orig + '</div></div>';
    });
  }

  /* ═══════════════════ 17. NUMERICAL PULSE on update ═══════════════════ */
  var lastValues = {};
  setInterval(function () {
    document.querySelectorAll('.scorecard__value, .kpi-value, .stat-value').forEach(function (el, i) {
      var key = 'pulse_' + i;
      var t = el.textContent.trim();
      if (lastValues[key] !== undefined && lastValues[key] !== t) {
        el.classList.add('mega-num-pulse');
        setTimeout(function () { el.classList.remove('mega-num-pulse'); }, 1000);
      }
      lastValues[key] = t;
    });
  }, 2000);

  /* ═══════════════════ 18. PERMISSION BADGE en avatares ═══════════════════ */
  function applyPermissionBadges() {
    var role = (function () {
      try { return JSON.parse(localStorage.getItem('cotizacion-auth-user') || '{}').role; }
      catch (_) { return null; }
    })();
    if (!role) return;
    var badges = { admin: { icon: '★', color: '#f59e0b', label: 'Admin' }, operador: { icon: '✓', color: '#22c55e', label: 'Op' }, consulta: { icon: '👁', color: '#94a3b8', label: 'View' } };
    var b = badges[role];
    if (!b) return;
    var wrap = document.querySelector('.header-profile');
    if (!wrap || wrap.querySelector('.mega-perm-badge')) return;
    var span = document.createElement('span');
    span.className = 'mega-perm-badge';
    span.style.cssText = 'background:' + b.color + ';color:#fff';
    span.textContent = b.icon;
    span.title = b.label;
    wrap.appendChild(span);
  }

  /* ═══════════════════ 19. BATTERY-AWARE LITE MODE ═══════════════════ */
  if (navigator.getBattery) {
    navigator.getBattery().then(function (battery) {
      function check() {
        if (battery.level < 0.20 && !battery.charging) {
          document.body.classList.add('mega-lite-mode');
          /* Avisa una vez */
          if (!sessionStorage.getItem('lite-warned')) {
            sessionStorage.setItem('lite-warned', '1');
            toast('🔋 Batería baja — modo lite activado (animaciones reducidas)', 'warning', { duration: 4000 });
          }
        } else {
          document.body.classList.remove('mega-lite-mode');
        }
      }
      check();
      battery.addEventListener('levelchange', check);
      battery.addEventListener('chargingchange', check);
    }).catch(function () {});
  }

  /* ═══════════════════ 20. CELL TOOLTIP on truncated ═══════════════════ */
  document.addEventListener('mouseover', function (e) {
    var td = e.target.closest('td');
    if (!td) return;
    if (td.scrollWidth > td.clientWidth + 2) {
      td.title = td.textContent.trim();
    }
  });

  /* ═══════════════════ 21. FILTER UNDO ═══════════════════ */
  var FilterHistory = {
    history: [],
    snapshot: function (tableId) {
      var inputs = document.querySelectorAll('#' + tableId + ' input.filter-input');
      var snap = {};
      inputs.forEach(function (inp) { snap[inp.getAttribute('data-key')] = inp.value; });
      FilterHistory.history.push({ tableId: tableId, snap: snap, ts: Date.now() });
      if (FilterHistory.history.length > 20) FilterHistory.history.shift();
    },
    undo: function () {
      if (FilterHistory.history.length < 2) return;
      FilterHistory.history.pop(); /* discard current */
      var prev = FilterHistory.history[FilterHistory.history.length - 1];
      if (!prev) return;
      var inputs = document.querySelectorAll('#' + prev.tableId + ' input.filter-input');
      inputs.forEach(function (inp) {
        inp.value = prev.snap[inp.getAttribute('data-key')] || '';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      });
      toast('↶ Filtro restaurado', 'info', { duration: 2000 });
    },
    init: function () {
      document.addEventListener('input', function (e) {
        if (!e.target.matches('input.filter-input')) return;
        var table = e.target.closest('table');
        if (table && table.id) {
          clearTimeout(FilterHistory.__t);
          FilterHistory.__t = setTimeout(function () { FilterHistory.snapshot(table.id); }, 1500);
        }
      });
      document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' &&
            !e.target.matches('input, textarea, [contenteditable]')) {
          e.preventDefault();
          FilterHistory.undo();
        }
      });
    },
  };

  /* ═══════════════════ 22. ANIMATED LOADERS DIVERSOS ═══════════════════ */
  window.MegaLoaders = {
    spinner: '<div class="mega-spinner"></div>',
    dots: '<div class="mega-dots"><span></span><span></span><span></span></div>',
    bar: '<div class="mega-loader-bar"><div></div></div>',
  };

  /* ═══════════════════ 23. CURRENCY CONVERTER INLINE (USD/MXN) ═══════════════════ */
  var Currency = {
    rate: 17.20, /* fallback */
    init: async function () {
      try {
        var r = await fetch('/api/tipo-cambio');
        if (r.ok) {
          var d = await r.json();
          if (d && d.rate) Currency.rate = Number(d.rate);
        }
      } catch (_) {}
    },
    /* Hover sobre cualquier celda con $... muestra USD equivalente */
    bind: function () {
      document.addEventListener('mouseover', function (e) {
        var td = e.target.closest('td');
        if (!td || td.dataset.currTip) return;
        var t = td.textContent.trim();
        var match = t.match(/\$\s*([\d,]+\.?\d*)/);
        if (!match) return;
        var mxn = parseFloat(match[1].replace(/,/g, ''));
        if (!isFinite(mxn) || mxn === 0) return;
        var usd = (mxn / Currency.rate).toFixed(2);
        td.title = (td.title || '') + '\nUSD: $' + usd;
        td.dataset.currTip = '1';
      });
    },
  };
  Currency.init();
  Currency.bind();

  /* ═══════════════════ 24. QUICK SHARE (URL con filtros aplicados) ═══════════════════ */
  window.MegaShare = {
    capture: function () {
      var active = document.querySelector('.panel.active');
      var tabId = active && active.id ? active.id.replace('panel-', '') : '';
      var filters = {};
      var inputs = active ? active.querySelectorAll('input.filter-input') : [];
      inputs.forEach(function (inp) {
        var v = inp.value;
        if (v) filters[inp.getAttribute('data-key')] = v;
      });
      var url = window.location.origin + window.location.pathname +
        '?panel=' + encodeURIComponent(tabId) +
        (Object.keys(filters).length ? '&filters=' + encodeURIComponent(JSON.stringify(filters)) : '');
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () {
          toast('🔗 Link copiado al clipboard', 'success', { duration: 2500 });
        });
      } else {
        window.prompt('Copia el link:', url);
      }
    },
    /* Auto-aplica filtros al cargar si hay query params */
    autoApply: function () {
      var params = new URLSearchParams(window.location.search);
      var panel = params.get('panel');
      var filters = params.get('filters');
      if (panel) {
        setTimeout(function () {
          var btn = document.querySelector('[data-tab="' + panel + '"]');
          if (btn) btn.click();
          if (filters) {
            try {
              var f = JSON.parse(filters);
              setTimeout(function () {
                Object.keys(f).forEach(function (k) {
                  var inp = document.querySelector('#panel-' + panel + ' input[data-key="' + k + '"]');
                  if (inp) {
                    inp.value = f[k];
                    inp.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                });
              }, 600);
            } catch (_) {}
          }
        }, 1000);
      }
    },
  };
  window.MegaShare.autoApply();

  /* ═══════════════════ 25. KEYBOARD SHORTCUTS hints en hover ═══════════════════ */
  var SHORTCUT_HINTS = {
    '#cmdk-input': 'Ctrl+K',
    '#davai-fab-toggle': '/',
    '.theme-switcher': 'Shift+T',
    '.focus-mode-toggle': 'F',
  };
  Object.keys(SHORTCUT_HINTS).forEach(function (sel) {
    setTimeout(function () {
      var el = document.querySelector(sel);
      if (el && !el.querySelector('.mega-kbd-hint')) {
        var hint = document.createElement('span');
        hint.className = 'mega-kbd-hint';
        hint.textContent = SHORTCUT_HINTS[sel];
        el.appendChild(hint);
      }
    }, 1500);
  });

  /* ═══════════════════ 26. DOUBLE-CLICK header to sort ═══════════════════ */
  document.addEventListener('dblclick', function (e) {
    var th = e.target.closest('th');
    if (!th) return;
    var table = th.closest('table.data-table');
    if (!table) return;
    var thIndex = Array.from(th.parentNode.children).indexOf(th);
    var tbody = table.querySelector('tbody');
    if (!tbody) return;
    var rows = Array.from(tbody.querySelectorAll('tr')).filter(function (tr) {
      return !tr.classList.contains('empty-row') && !tr.classList.contains('no-data');
    });
    var asc = !th.classList.contains('sorted-asc');
    table.querySelectorAll('th').forEach(function (h) { h.classList.remove('sorted-asc', 'sorted-desc'); });
    th.classList.add(asc ? 'sorted-asc' : 'sorted-desc');
    rows.sort(function (a, b) {
      var av = (a.children[thIndex] || {}).textContent || '';
      var bv = (b.children[thIndex] || {}).textContent || '';
      var an = parseFloat(av.replace(/[^\d.-]/g, ''));
      var bn = parseFloat(bv.replace(/[^\d.-]/g, ''));
      if (isFinite(an) && isFinite(bn)) return asc ? an - bn : bn - an;
      return asc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    rows.forEach(function (r) { tbody.appendChild(r); });
  });

  /* ═══════════════════ 27. SCROLL-TO-TOP button ═══════════════════ */
  var stt = document.createElement('button');
  stt.id = 'mega-scroll-top';
  stt.className = 'mega-scroll-top';
  stt.title = 'Ir arriba';
  stt.innerHTML = '<i class="fas fa-arrow-up"></i>';
  stt.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    var main = document.querySelector('main, .app-main');
    if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
  });
  document.body.appendChild(stt);
  function checkScroll() {
    var scrollTop = window.scrollY ||
      (document.querySelector('main, .app-main') || {}).scrollTop || 0;
    stt.classList.toggle('is-visible', scrollTop > 300);
  }
  window.addEventListener('scroll', checkScroll, { passive: true });
  setInterval(checkScroll, 1000);

  /* ═══════════════════ 28. CAPSLOCK detection en password inputs ═══════════════════ */
  document.addEventListener('keydown', function (e) {
    var el = e.target;
    if (el.type !== 'password') return;
    var caps = e.getModifierState && e.getModifierState('CapsLock');
    var existing = el.parentNode.querySelector('.mega-caps-warn');
    if (caps && !existing) {
      var w = document.createElement('span');
      w.className = 'mega-caps-warn';
      w.innerHTML = '<i class="fas fa-arrow-up"></i> Caps Lock';
      el.parentNode.appendChild(w);
    } else if (!caps && existing) {
      existing.remove();
    }
  });

  /* ═══════════════════ 29. AUTO-COMPLETE BACKED-UP (vuelve a llenar form si f5) ═══════════════════ */
  var FormBackup = {
    KEY: 'cotizacion-form-backup',
    save: function (form) {
      var data = {};
      form.querySelectorAll('input, textarea, select').forEach(function (el) {
        if (el.name && el.value && el.type !== 'password') data[el.name] = el.value;
      });
      try { sessionStorage.setItem(FormBackup.KEY + ':' + form.id, JSON.stringify(data)); } catch (_) {}
    },
    restore: function (form) {
      try {
        var data = JSON.parse(sessionStorage.getItem(FormBackup.KEY + ':' + form.id) || '{}');
        form.querySelectorAll('input, textarea, select').forEach(function (el) {
          if (data[el.name] && !el.value) el.value = data[el.name];
        });
      } catch (_) {}
    },
    init: function () {
      document.addEventListener('input', function (e) {
        var form = e.target.closest('form[id]');
        if (form) FormBackup.save(form);
      });
      setTimeout(function () {
        document.querySelectorAll('form[id]').forEach(FormBackup.restore);
      }, 1500);
      document.addEventListener('submit', function (e) {
        var form = e.target.closest('form[id]');
        if (form) {
          try { sessionStorage.removeItem(FormBackup.KEY + ':' + form.id); } catch (_) {}
        }
      });
    },
  };

  /* ═══════════════════ 30. WEEKLY SUMMARY toast on monday ═══════════════════ */
  var WeeklySummary = {
    KEY: 'cotizacion-last-summary',
    check: function () {
      var today = new Date();
      if (today.getDay() !== 1) return; /* solo lunes */
      var todayStr = today.toISOString().slice(0, 10);
      try {
        if (localStorage.getItem(WeeklySummary.KEY) === todayStr) return;
        localStorage.setItem(WeeklySummary.KEY, todayStr);
      } catch (_) { return; }
      setTimeout(function () {
        toast('📊 ¡Buen lunes! Revisa el dashboard para ver tu resumen semanal.',
              'info', { duration: 5000, title: 'Nueva semana' });
      }, 5000);
    },
  };

  /* ════════════════════ BOOT ════════════════════ */
  function boot() {
    Bookmarks.init();
    Network.init();
    Trending.init();
    Streak.init();
    ThemeColor.init();
    FilterHistory.init();
    FormBackup.init();
    WeeklySummary.check();
    setTimeout(applyPermissionBadges, 1500);
    setTimeout(SmartTime.auto, 1500);
    setTimeout(enhanceEmptyStates, 2000);
    /* Re-aplica en cambios de DOM */
    var obs = new MutationObserver(function () {
      clearTimeout(window.__megaFinalDebounce);
      window.__megaFinalDebounce = setTimeout(function () {
        SmartTime.auto();
        enhanceEmptyStates();
      }, 800);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
