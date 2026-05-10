/* ════════════════════════════════════════════════════════════════════════
 * MEGA ESSENTIALS — Las features valiosas, consolidadas en UN archivo.
 *
 * Diseño:
 *   - SIN MutationObserver(body, {subtree:true}) — eso fue lo que mataba la página.
 *   - Boot diferido tras window.load + 800ms (no compite con primer paint).
 *   - Hooks ligeros, NO interceptamos window.fetch global.
 *   - Cada feature es opt-out via localStorage 'mega-disable-<feature>'='1'.
 *
 * Features incluidas (las que tenían REAL valor):
 *   1. Cmd+K Command Palette (navegación rápida + acciones)
 *   2. Theme Switcher (sol/luna en header)
 *   3. Toasts premium con queue
 *   4. Keyboard shortcuts overlay (?)
 *   5. Click-to-copy con Alt+click en celdas
 *   6. Avatar generator en celdas (clientes/usuarios)
 *   7. Smart timestamps (fechas → "hace 5 min")
 *   8. Auto-link URLs/emails/teléfonos
 *   9. Scroll-to-top FAB
 *  10. Network status dot (online/offline)
 * ════════════════════════════════════════════════════════════════════════ */
;(function () {
  'use strict';

  function $(s, ctx) { return (ctx || document).querySelector(s); }
  function $$(s, ctx) { return Array.from((ctx || document).querySelectorAll(s)); }
  function escapeHtml(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
  function isDisabled(feature) {
    try { return localStorage.getItem('mega-disable-' + feature) === '1'; }
    catch (_) { return false; }
  }
  function getToken() {
    return localStorage.getItem('cotizacion-auth-token') || localStorage.getItem('token') || '';
  }

  /* ────────────────────────────────────────────────
   * 1. TOASTS premium (compartido por otras features)
   * ──────────────────────────────────────────────── */
  var Toasts = {
    container: null,
    init: function () {
      if (Toasts.container) return;
      var c = document.createElement('div');
      c.id = 'mega-toasts';
      c.className = 'mega-toasts';
      document.body.appendChild(c);
      Toasts.container = c;
    },
    show: function (msg, kind, opts) {
      Toasts.init();
      kind = kind || 'info';
      opts = opts || {};
      /* Limit max 3 toasts */
      var existing = Toasts.container.querySelectorAll('.mega-toast');
      while (existing.length >= 3) { existing[0].remove(); existing = Toasts.container.querySelectorAll('.mega-toast'); }
      var icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
      var t = document.createElement('div');
      t.className = 'mega-toast mega-toast--' + kind;
      t.innerHTML =
        '<i class="fas ' + icons[kind] + ' mega-toast__icon"></i>' +
        '<div class="mega-toast__body">' +
          (opts.title ? '<div class="mega-toast__title">' + escapeHtml(opts.title) + '</div>' : '') +
          '<div class="mega-toast__msg">' + escapeHtml(msg) + '</div>' +
        '</div>' +
        '<button class="mega-toast__close" aria-label="Cerrar">×</button>';
      Toasts.container.appendChild(t);
      var dismiss = function () {
        t.classList.add('is-leaving');
        setTimeout(function () { try { t.remove(); } catch (_) {} }, 240);
      };
      t.querySelector('.mega-toast__close').addEventListener('click', dismiss);
      if (opts.duration !== 0) setTimeout(dismiss, opts.duration || 4000);
      return { dismiss: dismiss };
    },
  };
  window.MegaToast = Toasts;
  /* Compatibilidad: window.showToast usa este sistema */
  if (!window.showToast || !window.showToast.__megaWrapped) {
    var orig = window.showToast;
    window.showToast = function (msg, kind, opts) {
      try { return Toasts.show(msg, kind, opts); }
      catch (_) { if (orig) return orig.apply(this, arguments); }
    };
    window.showToast.__megaWrapped = true;
  }

  /* ────────────────────────────────────────────────
   * 2. THEME SWITCHER
   * ──────────────────────────────────────────────── */
  var Theme = {
    KEY: 'cotizacion-theme-pref',
    init: function () {
      if (isDisabled('theme')) return;
      var pref;
      try { pref = localStorage.getItem(Theme.KEY); } catch (_) {}
      if (!pref) pref = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      Theme.apply(pref, true);
      Theme.injectButton();
    },
    apply: function (pref, instant) {
      if (instant) document.body.classList.add('no-theme-transition');
      if (pref === 'light') {
        /* Mantener theme-industrial: el layout Mapa/shell depende de él; solo activar apariencia clara */
        document.body.classList.remove('dark-theme', 'theme-light');
        document.body.classList.add('theme-industrial', 'appearance-light');
      } else {
        document.body.classList.remove('theme-light', 'appearance-light');
        document.body.classList.add('dark-theme', 'theme-industrial');
      }
      try {
        document.documentElement.classList.toggle('appearance-light', pref === 'light');
      } catch (_) {}
      try { localStorage.setItem(Theme.KEY, pref); } catch (_) {}
      if (instant) setTimeout(function () { document.body.classList.remove('no-theme-transition'); }, 60);
    },
    toggle: function () {
      Theme.apply(document.body.classList.contains('appearance-light') ? 'dark' : 'light', false);
    },
    injectButton: function () {
      if ($('.theme-switcher')) return;
      var btn = document.createElement('button');
      btn.className = 'theme-switcher';
      btn.type = 'button';
      btn.title = 'Cambiar tema (Shift+T)';
      btn.innerHTML =
        '<i class="fas fa-sun theme-switcher__icon-sun"></i>' +
        '<i class="fas fa-moon theme-switcher__icon-moon"></i>' +
        '<span class="theme-switcher__thumb"></span>';
      btn.addEventListener('click', Theme.toggle);
      var profile = $('#header-profile') || $('.header-profile');
      if (profile && profile.parentNode) profile.parentNode.insertBefore(btn, profile);
      else { var h = $('.header-inner'); if (h) h.appendChild(btn); }
    },
  };
  window.MegaTheme = Theme;

  /* ────────────────────────────────────────────────
   * 3. CMD+K COMMAND PALETTE
   * ──────────────────────────────────────────────── */
  var Cmdk = {
    open: false, items: [], filtered: [], activeIdx: 0, el: null,
    build: function () {
      var commands = [];
      $$('[data-tab]').forEach(function (tab) {
        var id = tab.getAttribute('data-tab');
        var label = (tab.textContent || '').trim();
        if (!id || !label) return;
        var iconEl = tab.querySelector('i');
        commands.push({
          title: label, desc: 'Ir a ' + label,
          icon: '<i class="' + (iconEl ? iconEl.className : 'fa fa-folder') + '"></i>',
          group: 'Navegación', keywords: id + ' ' + label,
          action: function () { try { tab.click(); } catch (_) {} },
        });
      });
      commands.push({
        title: 'Cambiar tema', desc: 'Claro/oscuro',
        icon: '<i class="fas fa-moon"></i>', group: 'Acciones',
        keywords: 'tema theme dark light', action: Theme.toggle,
      });
      commands.push({
        title: 'Atajos de teclado', desc: 'Ver shortcuts',
        icon: '<i class="fas fa-keyboard"></i>', group: 'Ayuda',
        keywords: 'help ayuda atajos', action: Shortcuts.show,
      });
      commands.push({
        title: 'Cerrar sesión', desc: 'Salir del sistema',
        icon: '<i class="fas fa-sign-out-alt"></i>', group: 'Acciones',
        keywords: 'logout salir', action: function () {
          var b = $('#profile-menu-logout') || $('#btn-logout'); if (b) b.click();
        },
      });
      return commands;
    },
    score: function (text, q) {
      if (!q) return 1;
      var t = text.toLowerCase(), qq = q.toLowerCase();
      var i = t.indexOf(qq); if (i !== -1) return 100 - i;
      var ti = 0, qi = 0, sc = 0;
      while (ti < t.length && qi < qq.length) { if (t[ti] === qq[qi]) { sc++; qi++; } ti++; }
      return qi === qq.length ? sc : 0;
    },
    render: function () {
      var list = $('#cmdk-list'); var input = $('#cmdk-input'); if (!list) return;
      var q = (input && input.value || '').trim();
      var scored = Cmdk.items.map(function (it) {
        return { item: it, score: Math.max(Cmdk.score(it.title, q), Cmdk.score(it.keywords || '', q) * 0.7) };
      }).filter(function (s) { return q ? s.score > 0 : true; });
      scored.sort(function (a, b) { return b.score - a.score; });
      Cmdk.filtered = scored.map(function (s) { return s.item; });
      Cmdk.activeIdx = 0;
      if (!Cmdk.filtered.length) {
        list.innerHTML = '<div class="cmdk__empty">Sin resultados para "' + escapeHtml(q) + '"</div>';
        return;
      }
      var groups = {};
      Cmdk.filtered.forEach(function (it) {
        var g = it.group || 'Otros';
        if (!groups[g]) groups[g] = [];
        groups[g].push(it);
      });
      var html = '', idx = 0;
      Object.keys(groups).forEach(function (gn) {
        html += '<div class="cmdk__group-label">' + escapeHtml(gn) + '</div>';
        groups[gn].forEach(function (it) {
          html += '<div class="cmdk__item' + (idx === Cmdk.activeIdx ? ' is-active' : '') + '" data-idx="' + idx + '">' +
            '<div class="cmdk__item-icon">' + (it.icon || '') + '</div>' +
            '<div class="cmdk__item-content">' +
              '<div class="cmdk__item-title">' + escapeHtml(it.title) + '</div>' +
              '<div class="cmdk__item-desc">' + escapeHtml(it.desc || '') + '</div>' +
            '</div>' +
          '</div>';
          idx++;
        });
      });
      list.innerHTML = html;
      list.querySelectorAll('.cmdk__item').forEach(function (el) {
        el.addEventListener('click', function () { Cmdk.exec(parseInt(el.getAttribute('data-idx'), 10)); });
        el.addEventListener('mouseenter', function () { Cmdk.activeIdx = parseInt(el.getAttribute('data-idx'), 10); Cmdk.updateActive(); });
      });
    },
    updateActive: function () {
      $$('.cmdk__item').forEach(function (el, i) {
        el.classList.toggle('is-active', i === Cmdk.activeIdx);
        if (i === Cmdk.activeIdx) try { el.scrollIntoView({ block: 'nearest' }); } catch (_) {}
      });
    },
    exec: function (i) {
      var it = Cmdk.filtered[i]; Cmdk.close();
      if (it && it.action) setTimeout(function () { it.action(); }, 30);
    },
    buildUI: function () {
      var w = document.createElement('div');
      w.id = 'cmdk'; w.className = 'cmdk';
      w.innerHTML =
        '<div class="cmdk__panel">' +
          '<div class="cmdk__input-wrap">' +
            '<i class="fas fa-search cmdk__input-icon"></i>' +
            '<input type="text" class="cmdk__input" id="cmdk-input" placeholder="Buscar paneles, acciones…">' +
            '<span class="cmdk__shortcut-hint">ESC</span>' +
          '</div>' +
          '<div class="cmdk__list" id="cmdk-list"></div>' +
        '</div>';
      document.body.appendChild(w);
      Cmdk.el = w;
    },
    openIt: function () {
      if (!Cmdk.el) Cmdk.buildUI();
      Cmdk.items = Cmdk.build();
      Cmdk.el.classList.add('is-open');
      Cmdk.open = true;
      var inp = $('#cmdk-input');
      if (inp) { inp.value = ''; setTimeout(function () { inp.focus(); }, 50); }
      Cmdk.render();
    },
    close: function () { if (Cmdk.el) Cmdk.el.classList.remove('is-open'); Cmdk.open = false; },
    init: function () {
      if (isDisabled('cmdk')) return;
      document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault(); Cmdk.open ? Cmdk.close() : Cmdk.openIt(); return;
        }
        var inField = e.target.matches && e.target.matches('input, textarea, [contenteditable]');
        if (!inField && !Cmdk.open) {
          if (e.shiftKey && e.key.toLowerCase() === 't') { e.preventDefault(); Theme.toggle(); }
          if (e.key === '?') { e.preventDefault(); Shortcuts.show(); }
        }
        if (!Cmdk.open) return;
        if (e.key === 'Escape') { e.preventDefault(); Cmdk.close(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); Cmdk.activeIdx = Math.min(Cmdk.activeIdx + 1, Cmdk.filtered.length - 1); Cmdk.updateActive(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); Cmdk.activeIdx = Math.max(Cmdk.activeIdx - 1, 0); Cmdk.updateActive(); }
        else if (e.key === 'Enter') { e.preventDefault(); Cmdk.exec(Cmdk.activeIdx); }
      });
      document.addEventListener('input', function (e) {
        if (e.target && e.target.id === 'cmdk-input') Cmdk.render();
      });
      document.addEventListener('click', function (e) {
        if (Cmdk.open && Cmdk.el && e.target === Cmdk.el) Cmdk.close();
      });
    },
  };
  window.MegaCmdk = Cmdk;

  /* ────────────────────────────────────────────────
   * 4. SHORTCUTS OVERLAY (?)
   * ──────────────────────────────────────────────── */
  var Shortcuts = {
    list: [
      { keys: ['Ctrl','K'], desc: 'Abrir paleta de comandos' },
      { keys: ['Shift','T'], desc: 'Cambiar tema' },
      { keys: ['Alt','click'], desc: 'Copiar celda al portapapeles' },
      { keys: ['?'], desc: 'Mostrar esta ayuda' },
      { keys: ['Esc'], desc: 'Cerrar modales' },
      { keys: ['↑','↓'], desc: 'Navegar opciones' },
    ],
    show: function () {
      var ex = $('#mega-shortcuts-modal');
      if (ex) { ex.remove(); return; }
      var w = document.createElement('div');
      w.id = 'mega-shortcuts-modal';
      w.className = 'mega-shortcuts-modal';
      w.innerHTML =
        '<div class="mega-shortcuts__panel">' +
          '<div class="mega-shortcuts__header">' +
            '<h2><i class="fas fa-keyboard"></i> Atajos de teclado</h2>' +
            '<button class="mega-shortcuts__close">×</button>' +
          '</div>' +
          '<ul class="mega-shortcuts__list">' +
            Shortcuts.list.map(function (s) {
              return '<li><div class="mega-shortcuts__keys">' +
                s.keys.map(function (k) { return '<kbd>' + escapeHtml(k) + '</kbd>'; }).join('<span class="mega-shortcuts__plus">+</span>') +
              '</div><div class="mega-shortcuts__desc">' + escapeHtml(s.desc) + '</div></li>';
            }).join('') +
          '</ul>' +
        '</div>';
      document.body.appendChild(w);
      requestAnimationFrame(function () { w.classList.add('is-open'); });
      var close = function () { w.classList.remove('is-open'); setTimeout(function () { try { w.remove(); } catch (_) {} }, 200); };
      w.querySelector('.mega-shortcuts__close').addEventListener('click', close);
      w.addEventListener('click', function (e) { if (e.target === w) close(); });
    },
  };
  window.MegaShortcuts = Shortcuts;

  /* ────────────────────────────────────────────────
   * 5. ALT+CLICK to copy cell
   * ──────────────────────────────────────────────── */
  if (!isDisabled('alt-copy')) {
    document.addEventListener('click', function (e) {
      if (!e.altKey) return;
      var td = e.target.closest('td');
      if (!td) return;
      var t = td.textContent.trim();
      if (!t) return;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(t).then(function () {
          Toasts.show('Copiado: ' + t.slice(0, 40), 'success', { duration: 1500 });
        });
      }
    });
  }

  /* ────────────────────────────────────────────────
   * 6. AVATARS en celdas (clientes/usuarios)
   * ──────────────────────────────────────────────── */
  var Avatars = {
    PALETTE: [
      ['#3b82f6','#1d4ed8'],['#8b5cf6','#6d28d9'],['#f59e0b','#d97706'],
      ['#22c55e','#15803d'],['#ec4899','#be185d'],['#06b6d4','#0e7490'],
      ['#ef4444','#b91c1c'],['#10b981','#047857'],['#f97316','#c2410c'],
      ['#a855f7','#7e22ce'],['#14b8a6','#0f766e'],['#eab308','#a16207'],
    ],
    initials: function (name) {
      if (!name) return '?';
      var c = String(name).trim().replace(/\s*(SA DE CV|S\.A\. DE C\.V\.|S\.A\.|SA|LLC|INC)$/gi, '').trim();
      var w = c.split(/\s+/).filter(Boolean);
      if (!w.length) return '?';
      if (w.length === 1) return w[0].slice(0, 2).toUpperCase();
      return (w[0][0] + w[w.length - 1][0]).toUpperCase();
    },
    color: function (s) {
      var h = 0; for (var i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
      return Avatars.PALETTE[Math.abs(h) % Avatars.PALETTE.length];
    },
    render: function (name, size) {
      size = size || 28;
      var c = Avatars.color(name || '?');
      return '<span class="mega-avatar" style="width:' + size + 'px;height:' + size + 'px;background:linear-gradient(135deg,' + c[0] + ',' + c[1] + ');font-size:' + Math.round(size * 0.4) + 'px" title="' + escapeHtml(name) + '">' + escapeHtml(Avatars.initials(name)) + '</span>';
    },
    apply: function () {
      /* En lugar de MutationObserver global, escaneamos UNA VEZ tras window.load
         y reescaneamos solo cuando un panel se hace .active (event delegation).
         Más eficiente que observer permanente. */
      var sels = [
        '#tabla-clientes tbody td:nth-child(2):not([data-mega-avatar])',
        '#tabla-prospectos tbody td:nth-child(1):not([data-mega-avatar])',
      ];
      sels.forEach(function (sel) {
        $$(sel).forEach(function (td) {
          var name = td.textContent.trim();
          if (!name || name === '—' || name === '-' || td.querySelector('.mega-avatar')) return;
          td.dataset.megaAvatar = '1';
          td.style.display = 'flex';
          td.style.alignItems = 'center';
          td.style.gap = '8px';
          var orig = td.innerHTML;
          td.innerHTML = Avatars.render(name, 28) + '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">' + orig + '</span>';
        });
      });
    },
    init: function () {
      if (isDisabled('avatars')) return;
      Avatars.apply();
      /* Re-aplicar cuando cambia el panel activo (sin observer global). */
      document.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('[data-tab]')) {
          setTimeout(Avatars.apply, 600);
        }
      });
    },
  };
  window.MegaAvatars = Avatars;

  /* ────────────────────────────────────────────────
   * 7. SMART TIMESTAMPS
   * ──────────────────────────────────────────────── */
  var SmartTime = {
    relative: function (date) {
      var d = new Date(date); if (isNaN(d.getTime())) return String(date);
      var diff = Date.now() - d.getTime();
      var m = Math.floor(diff / 60000), h = Math.floor(m / 60), days = Math.floor(h / 24);
      if (m < 1) return 'ahora';
      if (m < 60) return 'hace ' + m + ' min';
      if (h < 24) return 'hace ' + h + ' h';
      if (days < 7) return 'hace ' + days + ' día' + (days > 1 ? 's' : '');
      return d.toLocaleDateString('es-MX');
    },
    apply: function () {
      $$('td').forEach(function (td) {
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
    init: function () {
      if (isDisabled('smart-time')) return;
      SmartTime.apply();
      document.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('[data-tab]')) {
          setTimeout(SmartTime.apply, 600);
        }
      });
    },
  };
  window.MegaTime = SmartTime;

  /* ────────────────────────────────────────────────
   * 8. AUTO-LINK URLs/emails/teléfonos
   * ──────────────────────────────────────────────── */
  var AutoLink = {
    apply: function () {
      $$('td').forEach(function (td) {
        if (td.dataset.autoLinked || td.querySelector('a, button, .mega-avatar')) return;
        var t = td.textContent.trim();
        if (/^https?:\/\//.test(t) && t.length < 100) {
          td.dataset.autoLinked = '1';
          td.innerHTML = '<a href="' + escapeHtml(t) + '" target="_blank" rel="noopener" style="color:#60a5fa">' + escapeHtml(t) + '</a>';
        } else if (/^[\w.-]+@[\w.-]+\.\w+$/.test(t)) {
          td.dataset.autoLinked = '1';
          td.innerHTML = '<a href="mailto:' + escapeHtml(t) + '" style="color:#60a5fa">' + escapeHtml(t) + '</a>';
        } else if (/^\+?\d[\d\s().-]{7,}$/.test(t)) {
          td.dataset.autoLinked = '1';
          var clean = t.replace(/[^\d+]/g, '');
          td.innerHTML = '<a href="tel:' + clean + '" style="color:#60a5fa">' + escapeHtml(t) + '</a>';
        }
      });
    },
    init: function () {
      if (isDisabled('autolink')) return;
      AutoLink.apply();
      document.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('[data-tab]')) {
          setTimeout(AutoLink.apply, 600);
        }
      });
    },
  };

  /* ────────────────────────────────────────────────
   * 9. SCROLL TO TOP FAB
   * ──────────────────────────────────────────────── */
  var Scroll2Top = {
    init: function () {
      if (isDisabled('scroll-top')) return;
      var btn = document.createElement('button');
      btn.id = 'mega-scroll-top';
      btn.title = 'Ir arriba';
      btn.innerHTML = '<i class="fas fa-arrow-up"></i>';
      btn.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        var m = $('main, .app-main'); if (m) m.scrollTo({ top: 0, behavior: 'smooth' });
      });
      document.body.appendChild(btn);
      var check = function () {
        var top = window.scrollY || ($('main, .app-main') || {}).scrollTop || 0;
        btn.classList.toggle('is-visible', top > 300);
      };
      window.addEventListener('scroll', check, { passive: true });
      var m = $('main, .app-main'); if (m) m.addEventListener('scroll', check, { passive: true });
    },
  };

  /* ────────────────────────────────────────────────
   * 10. NETWORK STATUS
   * ──────────────────────────────────────────────── */
  var Network = {
    init: function () {
      if (isDisabled('network-dot')) return;
      var dot = document.createElement('div');
      dot.id = 'mega-network-dot';
      dot.title = 'En línea';
      document.body.appendChild(dot);
      var update = function () {
        if (navigator.onLine) {
          dot.classList.remove('is-offline');
          dot.title = 'En línea';
        } else {
          dot.classList.add('is-offline');
          dot.title = 'Sin conexión';
          Toasts.show('⚠️ Sin conexión', 'warning', { duration: 5000 });
        }
      };
      update();
      window.addEventListener('online', function () { update(); Toasts.show('✓ Conexión restaurada', 'success'); });
      window.addEventListener('offline', update);
    },
  };

  /* ────────────────────────────────────────────────
   * BOOT — diferido, sin MutationObserver global
   * ──────────────────────────────────────────────── */
  function boot() {
    Theme.init();
    Cmdk.init();
    Avatars.init();
    SmartTime.init();
    AutoLink.init();
    Scroll2Top.init();
    Network.init();
    console.log('%c✨ Mega Essentials cargado (10 features esenciales)',
      'color:#60a5fa;font-weight:700;background:#1e293b;padding:6px 10px;border-radius:6px');
  }

  /* Espera window.load + 800ms para no competir con primer paint */
  if (document.readyState === 'complete') {
    setTimeout(boot, 800);
  } else {
    window.addEventListener('load', function () { setTimeout(boot, 800); });
  }
})();
