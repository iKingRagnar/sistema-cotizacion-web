/* ════════════════════════════════════════════════════════════════════════
 * MEGA FEATURES 2026 — Command Palette, Theme Switcher, Particles, Lottie
 * IIFE, vanilla JS, sin dependencias hard (libs CDN async)
 * ════════════════════════════════════════════════════════════════════════ */
;(function () {
  'use strict';

  var REDUCED = window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Failed: ' + src)); };
      document.head.appendChild(s);
    });
  }

  /* ════════════════════════════════════════════════════════════════
   * 1. COMMAND PALETTE (Cmd+K / Ctrl+K)
   * ════════════════════════════════════════════════════════════════ */
  var CMDK = {
    open: false,
    items: [],
    filtered: [],
    activeIdx: 0,
    el: null,
  };

  function buildCommands() {
    /* Comandos navegación: usa los tabs existentes del DOM */
    var commands = [];
    var tabs = document.querySelectorAll('[data-tab]');
    tabs.forEach(function (tab) {
      var id = tab.getAttribute('data-tab');
      var label = (tab.textContent || '').trim();
      if (!id || !label) return;
      var iconEl = tab.querySelector('i');
      var iconClass = iconEl ? iconEl.className : 'fa fa-folder';
      commands.push({
        id: 'goto-' + id,
        title: label,
        desc: 'Ir a ' + label,
        icon: '<i class="' + iconClass + '"></i>',
        group: 'Navegación',
        keywords: id + ' ' + label,
        action: function () { try { tab.click(); } catch (_) {} },
      });
    });

    /* Acciones rápidas */
    commands.push({
      id: 'davai-open',
      title: 'Abrir DavAI',
      desc: 'Asistente de inteligencia artificial',
      icon: '<i class="fas fa-robot"></i>',
      group: 'Acciones',
      keywords: 'ai ia chat asistente davai inteligencia',
      shortcut: '/',
      action: function () {
        var fab = document.getElementById('davai-fab-toggle');
        if (fab) fab.click();
      },
    });
    commands.push({
      id: 'theme-toggle',
      title: 'Cambiar tema',
      desc: 'Alternar entre claro/oscuro',
      icon: '<i class="fas fa-moon"></i>',
      group: 'Acciones',
      keywords: 'tema theme dark light oscuro claro',
      shortcut: '⇧T',
      action: function () { THEME.toggle(); },
    });
    commands.push({
      id: 'reload',
      title: 'Recargar página',
      desc: 'Refresca todos los datos',
      icon: '<i class="fas fa-sync-alt"></i>',
      group: 'Acciones',
      keywords: 'reload refresh recargar',
      shortcut: '⇧R',
      action: function () { location.reload(); },
    });
    commands.push({
      id: 'logout',
      title: 'Cerrar sesión',
      desc: 'Salir del sistema',
      icon: '<i class="fas fa-sign-out-alt"></i>',
      group: 'Acciones',
      keywords: 'logout salir cerrar sesion exit',
      action: function () {
        var btn = document.getElementById('profile-menu-logout') || document.getElementById('btn-logout');
        if (btn) btn.click();
      },
    });
    commands.push({
      id: 'help',
      title: 'Atajos de teclado',
      desc: 'Ver todos los shortcuts disponibles',
      icon: '<i class="fas fa-keyboard"></i>',
      group: 'Ayuda',
      keywords: 'help ayuda shortcuts atajos teclado',
      shortcut: '?',
      action: function () {
        var btn = document.getElementById('btn-shortcuts');
        if (btn) btn.click();
        else alert('Atajos: Ctrl+K (paleta), / (DavAI), ⇧T (tema), ⇧R (recargar), Esc (cerrar)');
      },
    });

    return commands;
  }

  function buildCmdkUI() {
    var existing = document.getElementById('cmdk');
    if (existing) return existing;
    var wrap = document.createElement('div');
    wrap.id = 'cmdk';
    wrap.className = 'cmdk';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'Paleta de comandos');
    wrap.innerHTML =
      '<div class="cmdk__panel" role="combobox" aria-expanded="true">' +
        '<div class="cmdk__input-wrap">' +
          '<i class="fas fa-search cmdk__input-icon" aria-hidden="true"></i>' +
          '<input type="text" class="cmdk__input" id="cmdk-input" placeholder="Buscar comando, panel, acción..." autocomplete="off" spellcheck="false">' +
          '<span class="cmdk__shortcut-hint">ESC</span>' +
        '</div>' +
        '<div class="cmdk__list" id="cmdk-list" role="listbox"></div>' +
        '<div class="cmdk__footer">' +
          '<div class="cmdk__footer-shortcuts">' +
            '<span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>' +
            '<span><kbd>↵</kbd> seleccionar</span>' +
            '<span><kbd>esc</kbd> cerrar</span>' +
          '</div>' +
          '<span>powered by <strong>DavAI</strong></span>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    return wrap;
  }

  function fuzzyScore(text, query) {
    if (!query) return 1;
    var t = text.toLowerCase();
    var q = query.toLowerCase();
    if (t.indexOf(q) !== -1) return 100 - t.indexOf(q); /* match exacto: alto */
    /* match por caracteres en orden */
    var ti = 0, qi = 0, score = 0;
    while (ti < t.length && qi < q.length) {
      if (t[ti] === q[qi]) { score++; qi++; }
      ti++;
    }
    return qi === q.length ? score : 0;
  }

  function renderCmdkList() {
    var listEl = document.getElementById('cmdk-list');
    if (!listEl) return;
    var input = document.getElementById('cmdk-input');
    var query = (input && input.value || '').trim();

    /* Score y filtro */
    var scored = CMDK.items.map(function (it) {
      var score = Math.max(
        fuzzyScore(it.title, query),
        fuzzyScore(it.keywords || '', query) * 0.7
      );
      return { item: it, score: score };
    }).filter(function (s) { return query ? s.score > 0 : true; });

    scored.sort(function (a, b) { return b.score - a.score; });
    CMDK.filtered = scored.map(function (s) { return s.item; });
    CMDK.activeIdx = 0;

    if (CMDK.filtered.length === 0) {
      listEl.innerHTML =
        '<div class="cmdk__empty">' +
          '<div class="cmdk__empty-icon">🔎</div>' +
          '<div class="cmdk__empty-text">Sin resultados para "' + escapeHtml(query) + '"</div>' +
        '</div>';
      return;
    }

    /* Group by group */
    var groups = {};
    CMDK.filtered.forEach(function (it) {
      var g = it.group || 'Otros';
      if (!groups[g]) groups[g] = [];
      groups[g].push(it);
    });

    var html = '';
    var idx = 0;
    Object.keys(groups).forEach(function (groupName) {
      html += '<div class="cmdk__group-label">' + escapeHtml(groupName) + '</div>';
      groups[groupName].forEach(function (it) {
        var activeClass = idx === CMDK.activeIdx ? ' is-active' : '';
        html += '<div class="cmdk__item' + activeClass + '" data-idx="' + idx + '" role="option">' +
          '<div class="cmdk__item-icon">' + (it.icon || '<i class="fas fa-bolt"></i>') + '</div>' +
          '<div class="cmdk__item-content">' +
            '<div class="cmdk__item-title">' + escapeHtml(it.title) + '</div>' +
            '<div class="cmdk__item-desc">' + escapeHtml(it.desc || '') + '</div>' +
          '</div>' +
          (it.shortcut ? '<span class="cmdk__item-shortcut">' + escapeHtml(it.shortcut) + '</span>' : '') +
        '</div>';
        idx++;
      });
    });
    listEl.innerHTML = html;

    /* Bind clicks */
    listEl.querySelectorAll('.cmdk__item').forEach(function (el) {
      el.addEventListener('click', function () {
        var i = parseInt(el.getAttribute('data-idx'), 10);
        executeCmdk(i);
      });
      el.addEventListener('mouseenter', function () {
        CMDK.activeIdx = parseInt(el.getAttribute('data-idx'), 10);
        updateActiveItem();
      });
    });
  }

  function updateActiveItem() {
    var listEl = document.getElementById('cmdk-list');
    if (!listEl) return;
    listEl.querySelectorAll('.cmdk__item').forEach(function (el, i) {
      el.classList.toggle('is-active', i === CMDK.activeIdx);
      if (i === CMDK.activeIdx) {
        try { el.scrollIntoView({ block: 'nearest' }); } catch (_) {}
      }
    });
  }

  function executeCmdk(i) {
    var item = CMDK.filtered[i];
    closeCmdk();
    if (item && typeof item.action === 'function') {
      setTimeout(function () { item.action(); }, 50);
    }
  }

  function openCmdk() {
    if (!CMDK.el) CMDK.el = buildCmdkUI();
    CMDK.items = buildCommands();
    CMDK.el.classList.add('is-open');
    CMDK.open = true;
    var input = document.getElementById('cmdk-input');
    if (input) {
      input.value = '';
      setTimeout(function () { try { input.focus(); } catch (_) {} }, 50);
    }
    renderCmdkList();
  }

  function closeCmdk() {
    if (CMDK.el) CMDK.el.classList.remove('is-open');
    CMDK.open = false;
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  function bindCmdkEvents() {
    document.addEventListener('keydown', function (e) {
      /* Cmd+K / Ctrl+K abre */
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (CMDK.open) closeCmdk(); else openCmdk();
        return;
      }
      /* Shortcut: / abre DavAI (cuando NO estás en input) */
      var inField = e.target.matches && e.target.matches('input, textarea, [contenteditable]');
      if (!inField && e.key === '/' && !CMDK.open) {
        e.preventDefault();
        var fab = document.getElementById('davai-fab-toggle');
        if (fab) fab.click();
        return;
      }
      /* Shift+T toggle theme (cuando NO estás en input) */
      if (!inField && e.shiftKey && e.key.toLowerCase() === 't' && !CMDK.open) {
        e.preventDefault();
        THEME.toggle();
        return;
      }
      if (!CMDK.open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeCmdk();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        CMDK.activeIdx = Math.min(CMDK.activeIdx + 1, CMDK.filtered.length - 1);
        updateActiveItem();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        CMDK.activeIdx = Math.max(CMDK.activeIdx - 1, 0);
        updateActiveItem();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        executeCmdk(CMDK.activeIdx);
      }
    });

    /* Re-render al teclear */
    document.addEventListener('input', function (e) {
      if (e.target && e.target.id === 'cmdk-input') {
        renderCmdkList();
      }
    });

    /* Click fuera del panel cierra */
    document.addEventListener('click', function (e) {
      if (CMDK.open && CMDK.el && e.target === CMDK.el) closeCmdk();
    });
  }

  /* ════════════════════════════════════════════════════════════════
   * 2. THEME SWITCHER (sol/luna)
   * ════════════════════════════════════════════════════════════════ */
  var THEME = {
    KEY: 'cotizacion-theme-pref',

    init: function () {
      /* Load preferencia: localStorage > prefers-color-scheme > dark default */
      var stored;
      try { stored = localStorage.getItem(THEME.KEY); } catch (_) {}
      var pref = stored || (window.matchMedia &&
                            window.matchMedia('(prefers-color-scheme: light)').matches
                            ? 'light' : 'dark');
      THEME.apply(pref, true);
      THEME.injectButton();
    },

    apply: function (pref, instant) {
      if (instant) document.body.classList.add('no-theme-transition');
      if (pref === 'light') {
        document.body.classList.remove('dark-theme', 'theme-light');
        document.body.classList.add('theme-industrial', 'appearance-light');
      } else {
        document.body.classList.remove('theme-light', 'appearance-light');
        document.body.classList.add('dark-theme', 'theme-industrial');
      }
      try { localStorage.setItem(THEME.KEY, pref); } catch (_) {}
      if (instant) {
        setTimeout(function () { document.body.classList.remove('no-theme-transition'); }, 50);
      }
    },

    toggle: function () {
      var current = document.body.classList.contains('appearance-light') ? 'light' : 'dark';
      THEME.apply(current === 'light' ? 'dark' : 'light', false);
    },

    injectButton: function () {
      if (document.querySelector('.theme-switcher')) return;
      var btn = document.createElement('button');
      btn.className = 'theme-switcher';
      btn.type = 'button';
      btn.title = 'Cambiar tema (⇧T)';
      btn.setAttribute('aria-label', 'Cambiar tema');
      btn.innerHTML =
        '<span class="theme-switcher__thumb" aria-hidden="true"></span>' +
        '<i class="fas fa-sun theme-switcher__icon-sun" aria-hidden="true"></i>' +
        '<i class="fas fa-moon theme-switcher__icon-moon" aria-hidden="true"></i>';
      btn.addEventListener('click', THEME.toggle);

      /* Insert en el header, antes del avatar de profile */
      var header = document.querySelector('.header-inner, .app-header, header');
      var profile = document.getElementById('header-profile') ||
                    document.querySelector('.header-profile');
      if (profile && profile.parentNode) {
        profile.parentNode.insertBefore(btn, profile);
      } else if (header) {
        header.appendChild(btn);
      }
    },
  };
  window.MegaTheme = THEME;

  /* ════════════════════════════════════════════════════════════════
   * 3. PARTICLES BACKGROUND (tsParticles)
   * ════════════════════════════════════════════════════════════════ */
  function initParticles() {
    if (REDUCED) return;
    if (window.innerWidth < 768) return; /* perf en mobile */

    var div = document.createElement('div');
    div.id = 'mega-particles-bg';
    document.body.appendChild(div);

    loadScript('https://cdn.jsdelivr.net/npm/@tsparticles/web@3/tsparticles.web.bundle.min.js')
      .then(function () {
        if (!window.tsParticles) return;
        window.tsParticles.load({
          id: 'mega-particles-bg',
          options: {
            background: { color: { value: 'transparent' } },
            fpsLimit: 30,
            interactivity: {
              events: {
                onHover: { enable: false },
                onClick: { enable: false },
              },
            },
            particles: {
              number: { value: 35, density: { enable: true, area: 1200 } },
              color: { value: ['#3b82f6', '#8b5cf6', '#06b6d4'] },
              shape: { type: 'circle' },
              opacity: { value: { min: 0.1, max: 0.4 }, animation: { enable: true, speed: 0.4 } },
              size: { value: { min: 1, max: 2.5 } },
              links: {
                enable: true,
                distance: 140,
                color: '#3b82f6',
                opacity: 0.12,
                width: 1,
              },
              move: {
                enable: true,
                speed: 0.4,
                direction: 'none',
                random: true,
                straight: false,
                outModes: { default: 'bounce' },
              },
            },
            detectRetina: true,
          },
        });
      })
      .catch(function () { /* silencioso */ });
  }

  /* ════════════════════════════════════════════════════════════════
   * 4. LOTTIE — animaciones para empty/loading
   * ════════════════════════════════════════════════════════════════ */
  var LOTTIE_LIB_LOADED = false;
  function ensureLottie() {
    if (LOTTIE_LIB_LOADED) return Promise.resolve();
    return loadScript('https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie_light.min.js')
      .then(function () { LOTTIE_LIB_LOADED = true; });
  }

  /* Auto-aplica lottie a empty states cuando aparecen */
  function autoLottieEmpty() {
    var nodes = document.querySelectorAll('tr.empty-row td:not([data-lottie-applied]), tr.no-data td:not([data-lottie-applied])');
    if (!nodes.length) return;
    nodes.forEach(function (n) { n.setAttribute('data-lottie-applied', '1'); });
    /* Por ahora solo añadimos el icono CSS, lottie completo opcional. */
  }

  function initLottie() {
    if (REDUCED) return;
    /* Lottie es opt-in via window.MegaLottie.play(...) */
    var obs = new MutationObserver(function () {
      clearTimeout(window.__lottieDebounce);
      window.__lottieDebounce = setTimeout(autoLottieEmpty, 500);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  window.MegaLottie = {
    load: ensureLottie,
    play: function (container, animationData, options) {
      return ensureLottie().then(function () {
        if (!window.lottie) return null;
        return window.lottie.loadAnimation(Object.assign({
          container: container,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          animationData: animationData,
        }, options || {}));
      });
    },
  };

  /* ════════════════════════════════════════════════════════════════
   * BOOT
   * ════════════════════════════════════════════════════════════════ */
  function boot() {
    THEME.init();
    bindCmdkEvents();
    initLottie();
    /* Particles diferidos para no impactar primer paint */
    if (window.requestIdleCallback) {
      window.requestIdleCallback(initParticles, { timeout: 2000 });
    } else {
      setTimeout(initParticles, 1500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.MegaCmdk = {
    open: openCmdk,
    close: closeCmdk,
  };
})();
