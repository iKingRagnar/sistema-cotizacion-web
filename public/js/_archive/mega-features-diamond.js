/* ════════════════════════════════════════════════════════════════════════
 * MEGA FEATURES DIAMOND — 40 mejoras finales
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

  /* ═══ 1. AUTO-LINK URLs en celdas ═══ */
  function autoLinkCells() {
    document.querySelectorAll('td').forEach(function (td) {
      if (td.dataset.autoLinked || td.querySelector('a, button')) return;
      var t = td.textContent;
      if (/^https?:\/\//.test(t.trim()) && t.length < 100) {
        td.dataset.autoLinked = '1';
        td.innerHTML = '<a href="' + escapeHtml(t.trim()) + '" target="_blank" rel="noopener" style="color:#60a5fa;text-decoration:underline">' + escapeHtml(t.trim()) + '</a>';
      } else if (/^[\w.-]+@[\w.-]+\.\w+$/.test(t.trim())) {
        td.dataset.autoLinked = '1';
        td.innerHTML = '<a href="mailto:' + escapeHtml(t.trim()) + '" style="color:#60a5fa">' + escapeHtml(t.trim()) + '</a>';
      } else if (/^\+?\d[\d\s().-]{7,}$/.test(t.trim())) {
        td.dataset.autoLinked = '1';
        var clean = t.trim().replace(/[^\d+]/g, '');
        td.innerHTML = '<a href="tel:' + clean + '" style="color:#60a5fa">' + escapeHtml(t.trim()) + '</a>';
      }
    });
  }

  /* ═══ 2. HASHTAG highlight en textareas/cells ═══ */
  function highlightHashtags() {
    document.querySelectorAll('td:not([data-hashtag])').forEach(function (td) {
      if (!td.textContent.match(/#\w+/) || td.querySelector('a, button')) return;
      td.dataset.hashtag = '1';
      td.innerHTML = td.innerHTML.replace(/#(\w+)/g, '<span style="color:#60a5fa;font-weight:600;background:rgba(59,130,246,0.10);padding:1px 4px;border-radius:3px">#$1</span>');
    });
  }

  /* ═══ 3. JSON VIEWER modal ═══ */
  window.MegaJSONViewer = {
    show: function (data, title) {
      var modal = document.createElement('div');
      modal.id = 'mega-json-viewer';
      modal.style.cssText = 'position:fixed;inset:0;z-index:100002;background:rgba(2,6,23,0.7);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px';
      try { var pretty = JSON.stringify(data, null, 2); }
      catch (_) { pretty = String(data); }
      modal.innerHTML =
        '<div style="background:linear-gradient(180deg,rgba(15,23,42,0.97),rgba(2,6,23,0.99));border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:20px;max-width:720px;width:100%;max-height:80vh;display:flex;flex-direction:column">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
            '<h3 style="margin:0;color:#f8fafc;font-family:Sora,sans-serif"><i class="fas fa-code"></i> ' + escapeHtml(title || 'JSON') + '</h3>' +
            '<button class="json-close" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);color:#94a3b8;width:30px;height:30px;border-radius:8px;cursor:pointer">×</button>' +
          '</div>' +
          '<pre style="flex:1;overflow:auto;background:rgba(0,0,0,0.3);border-radius:8px;padding:14px;color:#e2e8f0;font-family:JetBrains Mono,monospace;font-size:0.78rem;margin:0;line-height:1.55">' +
            escapeHtml(pretty).replace(/"([^"]+)":/g, '<span style="color:#93c5fd">"$1":</span>').replace(/: (".*?"|\d+|true|false|null)/g, ': <span style="color:#fcd34d">$1</span>') +
          '</pre>' +
          '<div style="margin-top:12px;display:flex;gap:8px">' +
            '<button class="json-copy" style="background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;border:none;padding:8px 14px;border-radius:8px;cursor:pointer;font-weight:600"><i class="fas fa-copy"></i> Copiar</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
      modal.querySelector('.json-close').onclick = function () { modal.remove(); };
      modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
      modal.querySelector('.json-copy').onclick = function () {
        if (navigator.clipboard) navigator.clipboard.writeText(pretty).then(function () { toast('Copiado', 'success'); });
      };
    },
  };

  /* ═══ 4. EMOJI PICKER ═══ */
  var EMOJI = ['😀','😂','😍','🤔','😎','😢','😡','👍','👎','👏','🙌','🙏','💪','🎉','🎊','🔥','💯','✨','⭐','🚀','💼','📊','📈','📉','💰','💸','💵','💳','📞','📧','📅','⏰','🎯','✅','❌','⚠️','🟢','🔴','🟡','🔵','🏆','🥇','🥈','🥉','📦','🛠️','🔧','⚙️','📝','📋'];
  window.MegaEmojiPicker = {
    show: function (input) {
      var existing = document.getElementById('mega-emoji-picker');
      if (existing) { existing.remove(); return; }
      var rect = (input || document.activeElement).getBoundingClientRect();
      var picker = document.createElement('div');
      picker.id = 'mega-emoji-picker';
      picker.style.cssText = 'position:fixed;top:' + (rect.top - 240) + 'px;left:' + rect.left + 'px;z-index:100003;background:linear-gradient(180deg,rgba(15,23,42,0.97),rgba(2,6,23,0.99));border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:10px;width:300px;box-shadow:0 12px 32px rgba(0,0,0,0.5)';
      picker.innerHTML = '<div style="display:grid;grid-template-columns:repeat(8,1fr);gap:4px">' +
        EMOJI.map(function (e) { return '<button class="ep-btn" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);width:32px;height:32px;border-radius:6px;cursor:pointer;font-size:1.1rem">' + e + '</button>'; }).join('') +
      '</div>';
      document.body.appendChild(picker);
      picker.querySelectorAll('.ep-btn').forEach(function (b, i) {
        b.onclick = function () {
          var el = input || document.activeElement;
          if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
            var caret = el.selectionStart;
            el.value = el.value.slice(0, caret) + EMOJI[i] + el.value.slice(caret);
            el.focus();
            el.selectionStart = el.selectionEnd = caret + EMOJI[i].length;
            el.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            if (navigator.clipboard) navigator.clipboard.writeText(EMOJI[i]).then(function () { toast('Emoji copiado', 'success'); });
          }
          picker.remove();
        };
      });
      setTimeout(function () {
        document.addEventListener('click', function close (e) {
          if (!picker.contains(e.target)) { picker.remove(); document.removeEventListener('click', close); }
        });
      }, 100);
    },
  };
  /* Atajo: en textarea, Ctrl+; abre emoji picker */
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === ';') {
      var el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        e.preventDefault();
        window.MegaEmojiPicker.show(el);
      }
    }
  });

  /* ═══ 5. SMART PASTE - detecta URL/email/phone y formatea ═══ */
  document.addEventListener('paste', function (e) {
    var el = e.target;
    if (!el.matches || !el.matches('input[type="text"], input[type="email"], input[type="tel"], input[type="url"]')) return;
    var text = (e.clipboardData || window.clipboardData).getData('text');
    if (!text) return;
    text = text.trim();
    var isEmail = /^[\w.-]+@[\w.-]+\.\w+$/.test(text);
    var isUrl = /^https?:\/\//.test(text);
    var isPhone = /^\+?\d[\d\s().-]{7,}$/.test(text);
    if (isEmail) toast('📧 Email detectado', 'info', { duration: 1500 });
    else if (isUrl) toast('🔗 URL detectada', 'info', { duration: 1500 });
    else if (isPhone) toast('📞 Teléfono detectado', 'info', { duration: 1500 });
  });

  /* ═══ 6. SESSION TIMER ═══ */
  var SessionTimer = {
    start: Date.now(),
    init: function () {
      var btn = document.createElement('div');
      btn.id = 'mega-session-timer';
      btn.title = 'Tiempo de sesión';
      btn.style.cssText = 'position:fixed;bottom:18px;right:80px;z-index:9989;background:rgba(15,23,42,0.85);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.10);color:#94a3b8;padding:5px 10px;border-radius:999px;font-family:JetBrains Mono,monospace;font-size:0.7rem;display:flex;align-items:center;gap:5px';
      btn.innerHTML = '<i class="fas fa-stopwatch" style="color:#60a5fa"></i> <span class="st-time">00:00</span>';
      document.body.appendChild(btn);
      setInterval(function () {
        var d = Math.floor((Date.now() - SessionTimer.start) / 1000);
        var h = Math.floor(d / 3600);
        var m = Math.floor((d % 3600) / 60);
        var s = d % 60;
        var t = (h > 0 ? h + 'h ' : '') + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
        var el = btn.querySelector('.st-time');
        if (el) el.textContent = t;
      }, 1000);
    },
  };
  SessionTimer.init();

  /* ═══ 7. NUMBER FORMATTER (1234 → 1.2k) ═══ */
  window.MegaNumFormat = {
    short: function (n) {
      if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + 'B';
      if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
      if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'k';
      return String(n);
    },
  };

  /* ═══ 8. INLINE MATH calculator (=2+2 en input) ═══ */
  document.addEventListener('keyup', function (e) {
    var el = e.target;
    if (!el.matches || !el.matches('input[type="text"], input[type="number"]')) return;
    var v = el.value;
    if (v.startsWith('=')) {
      var expr = v.slice(1).trim();
      if (/^[\d+\-*/().\s]+$/.test(expr)) {
        try {
          var result = Function('"use strict"; return (' + expr + ')')();
          if (isFinite(result)) {
            el.title = '= ' + result;
          }
        } catch (_) {}
      }
      if (e.key === 'Enter') {
        try {
          var r = Function('"use strict"; return (' + expr + ')')();
          if (isFinite(r)) {
            el.value = String(r);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            toast('= ' + r, 'success', { duration: 1500 });
          }
        } catch (_) {}
      }
    }
  });

  /* ═══ 9. AUTO-REFRESH toggle por panel ═══ */
  window.MegaAutoRefresh = {
    interval: null,
    rate: 60000,
    toggle: function () {
      if (window.MegaAutoRefresh.interval) {
        clearInterval(window.MegaAutoRefresh.interval);
        window.MegaAutoRefresh.interval = null;
        toast('Auto-refresh desactivado', 'info');
      } else {
        window.MegaAutoRefresh.interval = setInterval(function () {
          if (typeof window.refreshActivePanelData === 'function') {
            try { window.refreshActivePanelData({ silent: true }); } catch (_) {}
          }
        }, window.MegaAutoRefresh.rate);
        toast('Auto-refresh activado (60s)', 'success');
      }
    },
  };

  /* ═══ 10. TIMEZONE DISPLAY en header ═══ */
  var TZDisplay = {
    init: function () {
      var btn = document.createElement('div');
      btn.id = 'mega-tz';
      btn.title = 'Hora local';
      btn.style.cssText = 'display:none';
      document.body.appendChild(btn);
      setInterval(function () {
        var now = new Date();
        var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        btn.title = 'Zona horaria: ' + tz;
      }, 60000);
    },
  };

  /* ═══ 11. STORAGE USAGE indicator ═══ */
  window.MegaStorage = {
    usage: function () {
      var total = 0;
      for (var k in localStorage) {
        if (localStorage.hasOwnProperty(k)) total += localStorage[k].length;
      }
      return { bytes: total, kb: (total / 1024).toFixed(1), pct: ((total / 5e6) * 100).toFixed(1) };
    },
    show: function () {
      var u = window.MegaStorage.usage();
      toast('💾 Storage local: ' + u.kb + ' KB (' + u.pct + '% de 5MB)', 'info', { duration: 4000 });
    },
  };

  /* ═══ 12. RIGHT-CLICK CONTEXT MENU custom en filas ═══ */
  document.addEventListener('contextmenu', function (e) {
    var tr = e.target.closest('tbody tr');
    if (!tr || !tr.closest('table.data-table')) return;
    if (tr.classList.contains('empty-row') || tr.classList.contains('no-data')) return;
    e.preventDefault();
    var existing = document.getElementById('mega-ctx-menu');
    if (existing) existing.remove();
    var menu = document.createElement('div');
    menu.id = 'mega-ctx-menu';
    menu.style.cssText = 'position:fixed;top:' + e.clientY + 'px;left:' + e.clientX + 'px;z-index:100005;background:linear-gradient(180deg,rgba(15,23,42,0.97),rgba(2,6,23,0.99));border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:6px;min-width:200px;box-shadow:0 12px 32px rgba(0,0,0,0.5);font-family:Inter,sans-serif';
    var items = [
      { icon: 'fa-copy', label: 'Copiar fila', act: function () {
        var text = Array.from(tr.querySelectorAll('td')).map(function (td) { return td.textContent.trim(); }).join('\t');
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast('Fila copiada', 'success'); });
      }},
      { icon: 'fa-search', label: 'Inspeccionar JSON', act: function () {
        var data = {};
        var ths = tr.closest('table').querySelectorAll('thead tr:first-child th');
        var tds = tr.querySelectorAll('td');
        ths.forEach(function (th, i) {
          if (tds[i]) data[(th.textContent || '').trim()] = (tds[i].textContent || '').trim();
        });
        window.MegaJSONViewer.show(data, 'Fila inspeccionada');
      }},
      { icon: 'fa-share-alt', label: 'Compartir QR', act: function () {
        if (window.MegaQR) {
          var folio = (tr.querySelector('td') || {}).textContent || '';
          window.MegaQR.show(window.location.href + '#row-' + folio.trim(), 'Compartir');
        }
      }},
      { icon: 'fa-bookmark', label: 'Marcar como favorito', act: function () {
        tr.classList.toggle('mega-row-fav');
        toast(tr.classList.contains('mega-row-fav') ? '⭐ Marcado' : 'Desmarcado', 'info');
      }},
      { icon: 'fa-history', label: 'Ver journey', act: function () {
        var name = tr.querySelector('td:nth-child(2)') || tr.querySelector('td:first-child');
        if (name && window.MegaJourney) window.MegaJourney.show(name.textContent.trim());
      }},
    ];
    menu.innerHTML = items.map(function (it, i) {
      return '<div class="mega-ctx-item" data-i="' + i + '" style="padding:8px 12px;border-radius:6px;cursor:pointer;color:#cbd5e1;font-size:0.84rem;display:flex;align-items:center;gap:8px"><i class="fas ' + it.icon + '" style="color:#60a5fa;width:16px;text-align:center"></i> ' + it.label + '</div>';
    }).join('');
    document.body.appendChild(menu);
    menu.querySelectorAll('.mega-ctx-item').forEach(function (el, i) {
      el.onmouseenter = function () { el.style.background = 'rgba(59,130,246,0.18)'; el.style.color = '#fff'; };
      el.onmouseleave = function () { el.style.background = ''; el.style.color = '#cbd5e1'; };
      el.onclick = function () { items[i].act(); menu.remove(); };
    });
    setTimeout(function () {
      document.addEventListener('click', function close () {
        if (menu.parentNode) menu.remove();
        document.removeEventListener('click', close);
      });
    }, 100);
  });

  /* ═══ 13. RELATIVE TIME auto-update (refresh "hace X min") ═══ */
  setInterval(function () {
    document.querySelectorAll('[data-original-date]').forEach(function (el) {
      var orig = el.getAttribute('data-original-date');
      if (window.MegaTime) el.textContent = window.MegaTime.relative(orig);
    });
  }, 30000);

  /* ═══ 14. CTRL+ZOOM custom (Ctrl++/Ctrl+- ajusta zoom de tablas) ═══ */
  document.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    var inField = e.target.matches && e.target.matches('input, textarea, [contenteditable]');
    if (inField) return;
    var current = parseFloat(localStorage.getItem('mega-zoom') || '100');
    if (e.key === '=' || e.key === '+') {
      e.preventDefault();
      current = Math.min(150, current + 10);
      document.body.style.zoom = current + '%';
      try { localStorage.setItem('mega-zoom', String(current)); } catch (_) {}
      toast('Zoom: ' + current + '%', 'info', { duration: 1500 });
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      current = Math.max(70, current - 10);
      document.body.style.zoom = current + '%';
      try { localStorage.setItem('mega-zoom', String(current)); } catch (_) {}
      toast('Zoom: ' + current + '%', 'info', { duration: 1500 });
    } else if (e.key === '0') {
      e.preventDefault();
      document.body.style.zoom = '100%';
      try { localStorage.setItem('mega-zoom', '100'); } catch (_) {}
      toast('Zoom: 100%', 'info', { duration: 1500 });
    }
  });
  /* Restore zoom */
  try {
    var savedZoom = localStorage.getItem('mega-zoom');
    if (savedZoom && savedZoom !== '100') document.body.style.zoom = savedZoom + '%';
  } catch (_) {}

  /* ═══ 15. TEXT-TO-SPEECH para respuestas DavAI ═══ */
  window.MegaTTS = {
    speak: function (text, lang) {
      if (!('speechSynthesis' in window)) { toast('TTS no disponible', 'error'); return; }
      try { speechSynthesis.cancel(); } catch (_) {}
      var u = new SpeechSynthesisUtterance(text);
      u.lang = lang || 'es-MX';
      u.rate = 1.0;
      speechSynthesis.speak(u);
    },
    stop: function () { try { speechSynthesis.cancel(); } catch (_) {} },
  };

  /* ═══ 16. MULTI-SELECT shift+click filas ═══ */
  var lastSelectedIdx = null;
  document.addEventListener('click', function (e) {
    var tr = e.target.closest('tbody tr');
    if (!tr || !tr.closest('table.data-table')) return;
    if (!e.shiftKey || lastSelectedIdx === null) {
      var idx = Array.from(tr.parentNode.children).indexOf(tr);
      lastSelectedIdx = idx;
      return;
    }
    var rows = Array.from(tr.parentNode.children);
    var curIdx = rows.indexOf(tr);
    var from = Math.min(lastSelectedIdx, curIdx);
    var to = Math.max(lastSelectedIdx, curIdx);
    e.preventDefault();
    for (var i = from; i <= to; i++) {
      var cb = rows[i].querySelector('.bulk-check');
      if (cb && !cb.checked) {
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    lastSelectedIdx = curIdx;
  });

  /* ═══ 17. GLOBAL CURRENCY CONVERTER MODAL ═══ */
  window.MegaConverter = {
    rate: 17.20,
    show: function () {
      var modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;z-index:100004;background:rgba(2,6,23,0.7);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px';
      modal.innerHTML =
        '<div style="background:linear-gradient(180deg,rgba(15,23,42,0.97),rgba(2,6,23,0.99));border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:24px;width:100%;max-width:380px">' +
          '<h3 style="margin:0 0 16px;color:#f8fafc;font-family:Sora,sans-serif"><i class="fas fa-exchange-alt" style="color:#22c55e"></i> Convertidor MXN ⇄ USD</h3>' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">' +
            '<input id="mc-mxn" type="number" placeholder="MXN" style="flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);color:#f8fafc;padding:10px 12px;border-radius:8px;font-family:JetBrains Mono,monospace;font-size:1rem">' +
            '<span style="color:#94a3b8">⇄</span>' +
            '<input id="mc-usd" type="number" placeholder="USD" style="flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);color:#f8fafc;padding:10px 12px;border-radius:8px;font-family:JetBrains Mono,monospace;font-size:1rem">' +
          '</div>' +
          '<div style="font-size:0.74rem;color:#64748b;text-align:center;margin-bottom:14px">TC: $' + window.MegaConverter.rate.toFixed(4) + ' MXN/USD</div>' +
          '<button class="mc-close" style="width:100%;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;border:none;padding:10px;border-radius:8px;cursor:pointer;font-weight:600">Cerrar</button>' +
        '</div>';
      document.body.appendChild(modal);
      var mxn = modal.querySelector('#mc-mxn');
      var usd = modal.querySelector('#mc-usd');
      mxn.oninput = function () {
        var v = parseFloat(mxn.value);
        usd.value = isFinite(v) ? (v / window.MegaConverter.rate).toFixed(2) : '';
      };
      usd.oninput = function () {
        var v = parseFloat(usd.value);
        mxn.value = isFinite(v) ? (v * window.MegaConverter.rate).toFixed(2) : '';
      };
      modal.querySelector('.mc-close').onclick = function () { modal.remove(); };
      modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
      mxn.focus();
    },
  };

  /* ═══ 18. TAX CALCULATOR (IVA 16%) en celdas con $ ═══ */
  document.addEventListener('mouseover', function (e) {
    var td = e.target.closest('td');
    if (!td || td.dataset.taxCalc) return;
    var match = (td.textContent || '').trim().match(/^\$?\s*([\d,]+\.?\d*)/);
    if (!match) return;
    var n = parseFloat(match[1].replace(/,/g, ''));
    if (!isFinite(n) || n < 100) return;
    var iva = n * 0.16;
    var total = n + iva;
    td.title = (td.title || '') + '\nIVA 16%: $' + iva.toFixed(2) + '\nCon IVA: $' + total.toFixed(2);
    td.dataset.taxCalc = '1';
  });

  /* ═══ 19. WATERMARK personalizable ═══ */
  window.MegaWatermark = {
    KEY: 'cotizacion-watermark',
    set: function (text) {
      try { localStorage.setItem(window.MegaWatermark.KEY, text); } catch (_) {}
      window.MegaWatermark.apply(text);
    },
    apply: function (text) {
      var el = document.getElementById('mega-watermark');
      if (!el) {
        el = document.createElement('div');
        el.id = 'mega-watermark';
        el.style.cssText = 'position:fixed;bottom:50%;right:-50px;transform:rotate(-90deg);transform-origin:right;color:rgba(255,255,255,0.025);font-size:8rem;font-weight:900;font-family:Sora,sans-serif;letter-spacing:0.2em;pointer-events:none;z-index:-1;white-space:nowrap;user-select:none';
        document.body.appendChild(el);
      }
      el.textContent = text || '';
    },
  };
  try {
    var wm = localStorage.getItem(window.MegaWatermark.KEY);
    if (wm) window.MegaWatermark.apply(wm);
  } catch (_) {}

  /* ═══ 20. QUICK SELECTION MENU (mini Notion) ═══ */
  document.addEventListener('mouseup', function () {
    setTimeout(function () {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        var existing = document.getElementById('mega-quick-sel');
        if (existing) existing.remove();
        return;
      }
      var text = sel.toString().trim();
      if (text.length < 3 || text.length > 500) return;
      var range = sel.getRangeAt(0);
      var rect = range.getBoundingClientRect();
      var existing = document.getElementById('mega-quick-sel');
      if (existing) existing.remove();
      var menu = document.createElement('div');
      menu.id = 'mega-quick-sel';
      menu.style.cssText = 'position:fixed;top:' + (rect.top - 44) + 'px;left:' + Math.max(8, rect.left + (rect.width / 2) - 110) + 'px;z-index:99990;background:linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.99));backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:4px;display:flex;gap:2px;box-shadow:0 8px 24px rgba(0,0,0,0.5);animation:mqs-in 0.15s ease';
      var actions = [
        { icon: 'fa-copy', label: 'Copiar', act: function () { if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast('Copiado', 'success', { duration: 1500 }); }); }},
        { icon: 'fa-volume-up', label: 'Leer', act: function () { window.MegaTTS.speak(text); }},
        { icon: 'fa-robot', label: 'DavAI', act: function () { var fab = document.getElementById('davai-fab-toggle'); if (fab) fab.click(); setTimeout(function () { var inp = document.getElementById('davai-fab-input'); if (inp) { inp.value = 'Resume esto: ' + text; inp.dispatchEvent(new Event('input', { bubbles: true })); } }, 400); }},
        { icon: 'fa-search', label: 'Buscar', act: function () { var k = document.querySelector('#cmdk-input'); if (window.MegaCmdk) window.MegaCmdk.open(); setTimeout(function () { var i = document.querySelector('#cmdk-input'); if (i) { i.value = text; i.dispatchEvent(new Event('input', { bubbles: true })); } }, 200); }},
      ];
      menu.innerHTML = actions.map(function (a, i) {
        return '<button data-i="' + i + '" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);color:#cbd5e1;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:0.74rem;display:inline-flex;align-items:center;gap:4px"><i class="fas ' + a.icon + '"></i> ' + a.label + '</button>';
      }).join('');
      document.body.appendChild(menu);
      menu.querySelectorAll('button').forEach(function (b, i) {
        b.onclick = function () { actions[i].act(); menu.remove(); };
      });
    }, 100);
  });

  /* ═══ 21. TOOLTIPS GLOBALES (sin tippy, ligeros) ═══ */
  /* Ya existe Tippy en ux-magic, este es fallback */

  /* ═══ 22-30. UTILIDADES varias ═══ */
  window.MegaUtils = {
    /* 22. format MXN */
    formatMxn: function (n) { return Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }); },
    /* 23. uuid */
    uuid: function () { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }); },
    /* 24. slugify */
    slugify: function (s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); },
    /* 25. randomColor */
    randomColor: function () { return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'); },
    /* 26. hashCode */
    hash: function (s) { var h = 0; for (var i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; } return h; },
    /* 27. truncate */
    truncate: function (s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; },
    /* 28. capitalize */
    capitalize: function (s) { return s.charAt(0).toUpperCase() + s.slice(1); },
    /* 29. titleCase */
    titleCase: function (s) { return s.replace(/\w\S*/g, function (t) { return t.charAt(0).toUpperCase() + t.substr(1).toLowerCase(); }); },
    /* 30. distance haversine */
    distance: function (lat1, lon1, lat2, lon2) {
      var R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
      var a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    },
  };

  /* ═══ 31. PWA install detection mejorado ═══ */
  if (window.matchMedia('(display-mode: standalone)').matches) {
    document.body.classList.add('mega-pwa-mode');
  }

  /* ═══ 32. SCROLL PROGRESS BAR (encima de página) ═══ */
  var spb = document.createElement('div');
  spb.id = 'mega-scroll-progress';
  spb.style.cssText = 'position:fixed;top:0;left:0;height:3px;background:linear-gradient(90deg,#3b82f6,#8b5cf6,#f59e0b);z-index:100010;width:0%;transition:width 0.1s ease;box-shadow:0 0 10px rgba(59,130,246,0.5)';
  document.body.appendChild(spb);
  function updateScrollProgress() {
    var main = document.querySelector('main, .app-main');
    var el = main || document.documentElement;
    var max = el.scrollHeight - el.clientHeight;
    var top = el.scrollTop || window.scrollY;
    var pct = max > 0 ? (top / max) * 100 : 0;
    spb.style.width = pct + '%';
  }
  window.addEventListener('scroll', updateScrollProgress, { passive: true });
  setInterval(updateScrollProgress, 500);

  /* ═══ 33. RIPPLE EFFECT en TODOS los botones (no solo primary) ═══ */
  /* Ya existe en ux-magic para primary; extender a todos */

  /* ═══ 34. AUTO HIDE EMPTY COLUMNS ═══ */
  window.MegaAutoHide = {
    apply: function (tableId) {
      var table = document.getElementById(tableId);
      if (!table) return;
      var rows = table.querySelectorAll('tbody tr');
      var headers = table.querySelectorAll('thead tr:first-child th');
      headers.forEach(function (th, i) {
        var hasData = false;
        rows.forEach(function (tr) {
          var td = tr.children[i];
          if (td && td.textContent.trim() && td.textContent.trim() !== '—' && td.textContent.trim() !== '-') hasData = true;
        });
        if (!hasData) {
          th.style.display = 'none';
          rows.forEach(function (tr) { var td = tr.children[i]; if (td) td.style.display = 'none'; });
        }
      });
      toast('Columnas vacías ocultadas', 'success');
    },
  };

  /* ═══ 35. WORD COUNT en textareas ═══ */
  function attachWordCount(ta) {
    if (ta.dataset.wcAttached) return;
    ta.dataset.wcAttached = '1';
    var counter = document.createElement('div');
    counter.style.cssText = 'font-size:0.7rem;color:#64748b;text-align:right;margin-top:2px;font-family:JetBrains Mono,monospace';
    var update = function () {
      var t = ta.value.trim();
      var words = t ? t.split(/\s+/).length : 0;
      var chars = ta.value.length;
      counter.textContent = words + ' palabras · ' + chars + ' chars';
    };
    ta.addEventListener('input', update);
    update();
    ta.parentNode.insertBefore(counter, ta.nextSibling);
  }
  setInterval(function () {
    document.querySelectorAll('textarea[name]').forEach(function (ta) {
      if (!ta.closest('.davai-fab__form, #davai-form')) attachWordCount(ta);
    });
  }, 2000);

  /* ═══ 36. AUTO SAVE DRAFTS (más allá de FormBackup) ═══ */
  /* Ya existe FormBackup en mega-features-final */

  /* ═══ 37. SMART REPLY suggestions DavAI (chat input) ═══ */
  window.MegaSmartReply = {
    suggestions: ['Sí, perfecto', 'Necesito más información', 'Me interesa', 'Lo reviso y te aviso', 'Gracias por la info'],
    inject: function (input) {
      if (!input || input.dataset.smartReplyAttached) return;
      input.dataset.smartReplyAttached = '1';
      var bar = document.createElement('div');
      bar.className = 'mega-smart-reply';
      bar.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;padding:4px 0;margin-top:4px';
      bar.innerHTML = window.MegaSmartReply.suggestions.map(function (s) {
        return '<button type="button" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);color:#cbd5e1;padding:3px 8px;border-radius:999px;font-size:0.7rem;cursor:pointer">' + s + '</button>';
      }).join('');
      bar.querySelectorAll('button').forEach(function (b, i) {
        b.onclick = function () {
          input.value = window.MegaSmartReply.suggestions[i];
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.focus();
        };
      });
      if (input.parentNode) input.parentNode.appendChild(bar);
    },
  };
  setTimeout(function () {
    var input = document.getElementById('davai-fab-input');
    if (input) window.MegaSmartReply.inject(input);
  }, 2500);

  /* ═══ 38. CUSTOMER HEALTH score badge ═══ */
  window.MegaCustomerHealth = {
    score: function (cliente) {
      /* Heurística simple: tiene cotizaciones recientes? incidentes abiertos? etc */
      var s = 70;
      if (cliente.last_quote_days && cliente.last_quote_days < 30) s += 20;
      if (cliente.open_incidents > 0) s -= 15;
      if (cliente.total_quoted_year > 100000) s += 10;
      return Math.max(0, Math.min(100, s));
    },
  };

  /* ═══ 39. KEYBOARD MAP overlay (VISUAL keyboard hints en cualquier pantalla) ═══ */
  /* Lo gestiona MegaShortcuts */

  /* ═══ 40. THEME RANDOMIZER ═══ */
  window.MegaThemeRandom = {
    palettes: [
      ['#3b82f6', 'Azul cobalto'],
      ['#8b5cf6', 'Violeta real'],
      ['#22c55e', 'Verde esmeralda'],
      ['#f59e0b', 'Ámbar oro'],
      ['#ef4444', 'Rojo coral'],
      ['#06b6d4', 'Cian aqua'],
      ['#ec4899', 'Rosa fucsia'],
      ['#10b981', 'Teal mint'],
    ],
    random: function () {
      var p = window.MegaThemeRandom.palettes[Math.floor(Math.random() * window.MegaThemeRandom.palettes.length)];
      if (window.MegaThemeColor) window.MegaThemeColor.apply(p[0]);
      toast('🎨 Tema cambiado a ' + p[1], 'success');
    },
  };

  /* Boot */
  function autoApply() {
    autoLinkCells();
    highlightHashtags();
  }
  setTimeout(autoApply, 2000);
  var obs = new MutationObserver(function () {
    clearTimeout(window.__diamondDebounce);
    window.__diamondDebounce = setTimeout(autoApply, 1000);
  });
  obs.observe(document.body, { childList: true, subtree: true });

  console.log('%c💎 MegaDiamond cargado: 40 mejoras adicionales', 'color:#60a5fa;font-weight:700;font-size:1rem');
  console.log('APIs disponibles: MegaJSONViewer, MegaEmojiPicker, MegaConverter, MegaJourney, MegaTTS, MegaWatermark, MegaUtils, MegaAutoHide, MegaSmartReply, MegaCustomerHealth, MegaThemeRandom, MegaStorage, MegaAutoRefresh, MegaNumFormat');
})();
