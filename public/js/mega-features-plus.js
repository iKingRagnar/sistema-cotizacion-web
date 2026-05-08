/* ════════════════════════════════════════════════════════════════════════
 * MEGA FEATURES PLUS — Voice / Density / PDF / ApexCharts / Push / Paste / Resize
 * ════════════════════════════════════════════════════════════════════════ */
;(function () {
  'use strict';

  var REDUCED = window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) { resolve(); return; }
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Failed: ' + src)); };
      document.head.appendChild(s);
    });
  }

  function toast(msg, kind) {
    if (typeof window.showToast === 'function') {
      try { window.showToast(msg, kind || 'info'); return; } catch (_) {}
    }
    /* Fallback */
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
      'background:rgba(15,23,42,0.95);color:#f8fafc;padding:12px 20px;border-radius:10px;' +
      'border:1px solid rgba(255,255,255,0.12);z-index:100001;font-size:0.88rem;' +
      'box-shadow:0 8px 24px rgba(0,0,0,0.4);backdrop-filter:blur(12px);';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s ease'; }, 2500);
    setTimeout(function () { try { t.remove(); } catch (_) {} }, 3000);
  }

  /* ════════════════════════════════════════════════════════════════
   * 1. VOICE INPUT para DavAI (Web Speech API nativa)
   * ════════════════════════════════════════════════════════════════ */
  var Voice = {
    recognition: null,
    listening: false,

    isSupported: function () {
      return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    },

    init: function () {
      if (!Voice.isSupported()) return;
      var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      Voice.recognition = new SR();
      Voice.recognition.lang = 'es-MX';
      Voice.recognition.continuous = false;
      Voice.recognition.interimResults = true;
    },

    start: function (targetInput, onFinal) {
      if (!Voice.recognition) Voice.init();
      if (!Voice.recognition) {
        toast('Tu navegador no soporta dictado de voz.', 'error');
        return;
      }
      if (Voice.listening) { Voice.stop(); return; }

      Voice.listening = true;
      var btn = document.querySelector('.davai-voice-btn');
      if (btn) btn.classList.add('is-listening');

      Voice.recognition.onresult = function (e) {
        var transcript = '';
        for (var i = 0; i < e.results.length; i++) {
          transcript += e.results[i][0].transcript;
        }
        if (targetInput) targetInput.value = transcript;
        if (e.results[e.results.length - 1].isFinal && typeof onFinal === 'function') {
          onFinal(transcript.trim());
        }
      };
      Voice.recognition.onerror = function (e) {
        toast('Error de voz: ' + e.error, 'error');
        Voice.stop();
      };
      Voice.recognition.onend = function () { Voice.stop(); };
      try { Voice.recognition.start(); } catch (e) { Voice.stop(); }
    },

    stop: function () {
      Voice.listening = false;
      var btn = document.querySelector('.davai-voice-btn');
      if (btn) btn.classList.remove('is-listening');
      if (Voice.recognition) {
        try { Voice.recognition.stop(); } catch (_) {}
      }
    },
  };

  /* Inyecta botón voice en el FAB del chat */
  function injectVoiceButton() {
    if (!Voice.isSupported()) return;
    var form = document.getElementById('davai-fab-form');
    if (!form || form.querySelector('.davai-voice-btn')) return;
    var input = document.getElementById('davai-fab-input');
    var send = document.getElementById('davai-fab-send');
    if (!input || !send) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'davai-fab__voice-btn davai-voice-btn';
    btn.title = 'Dictado de voz';
    btn.setAttribute('aria-label', 'Dictado de voz');
    btn.innerHTML = '<i class="fas fa-microphone"></i>';
    form.insertBefore(btn, send);

    btn.addEventListener('click', function () {
      Voice.start(input, function (finalText) {
        if (finalText && finalText.length > 1) {
          /* Auto-envío al terminar el dictado */
          input.value = finalText;
          var ev = new Event('input', { bubbles: true });
          input.dispatchEvent(ev);
          /* Trigger submit */
          var submit = new Event('submit', { bubbles: true, cancelable: true });
          form.dispatchEvent(submit);
        }
      });
    });
  }

  /* ════════════════════════════════════════════════════════════════
   * 2. DENSITY TOGGLE (compact / comfortable / spacious)
   * ════════════════════════════════════════════════════════════════ */
  var Density = {
    KEY: 'cotizacion-density-pref',
    LEVELS: ['compact', 'comfortable', 'spacious'],
    LABELS: { compact: 'Compacta', comfortable: 'Cómoda', spacious: 'Espaciosa' },
    ICONS: { compact: 'fa-compress', comfortable: 'fa-grip-horizontal', spacious: 'fa-expand' },

    current: function () {
      try {
        var v = localStorage.getItem(Density.KEY);
        if (Density.LEVELS.indexOf(v) !== -1) return v;
      } catch (_) {}
      return 'comfortable';
    },

    apply: function (level) {
      if (Density.LEVELS.indexOf(level) === -1) return;
      document.body.classList.remove('density-compact', 'density-comfortable', 'density-spacious');
      document.body.classList.add('density-' + level);
      try { localStorage.setItem(Density.KEY, level); } catch (_) {}
      var btn = document.querySelector('.density-toggle');
      if (btn) {
        btn.title = 'Densidad: ' + Density.LABELS[level] + ' (clic para cambiar)';
        var icon = btn.querySelector('i');
        if (icon) icon.className = 'fas ' + Density.ICONS[level];
      }
    },

    next: function () {
      var cur = Density.current();
      var idx = Density.LEVELS.indexOf(cur);
      var next = Density.LEVELS[(idx + 1) % Density.LEVELS.length];
      Density.apply(next);
      toast('Densidad: ' + Density.LABELS[next], 'success');
    },

    init: function () {
      Density.apply(Density.current());
      Density.injectButton();
    },

    injectButton: function () {
      if (document.querySelector('.density-toggle')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'density-toggle';
      btn.setAttribute('aria-label', 'Cambiar densidad');
      var cur = Density.current();
      btn.title = 'Densidad: ' + Density.LABELS[cur];
      btn.innerHTML = '<i class="fas ' + Density.ICONS[cur] + '"></i>';
      btn.addEventListener('click', Density.next);

      /* Insertar antes del theme switcher si existe */
      var themeBtn = document.querySelector('.theme-switcher');
      if (themeBtn && themeBtn.parentNode) {
        themeBtn.parentNode.insertBefore(btn, themeBtn);
        return;
      }
      var header = document.querySelector('.header-inner') ||
                   document.querySelector('.app-header') ||
                   document.querySelector('header');
      var profile = document.getElementById('header-profile') ||
                    document.querySelector('.header-profile');
      if (profile && profile.parentNode) {
        profile.parentNode.insertBefore(btn, profile);
      } else if (header) {
        header.appendChild(btn);
      }
    },
  };
  window.MegaDensity = Density;

  /* ════════════════════════════════════════════════════════════════
   * 3. EXPORT PDF de tablas (html2pdf CDN)
   * ════════════════════════════════════════════════════════════════ */
  var html2pdfLoaded = false;
  function ensureHtml2pdf() {
    if (html2pdfLoaded) return Promise.resolve();
    return loadScript('https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js')
      .then(function () { html2pdfLoaded = true; });
  }

  function exportTablePDF(tableId, opts) {
    opts = opts || {};
    var table = document.getElementById(tableId) ||
                document.querySelector('#' + tableId + ' table');
    if (!table) { toast('Tabla no encontrada: ' + tableId, 'error'); return; }
    toast('Generando PDF...', 'info');
    ensureHtml2pdf().then(function () {
      if (!window.html2pdf) { toast('html2pdf no disponible', 'error'); return; }
      /* Clone para no afectar la UI */
      var clone = table.cloneNode(true);
      /* Limpiar columna de acciones del clon */
      clone.querySelectorAll('.th-actions, td.actions, .filter-row').forEach(function (n) { n.remove(); });
      /* Wrapper con título */
      var wrap = document.createElement('div');
      wrap.style.cssText = 'padding:24px;font-family:Inter,sans-serif;background:#fff;color:#0f172a';
      var title = opts.title || 'Reporte ' + tableId;
      wrap.innerHTML =
        '<h1 style="font-size:1.4rem;margin:0 0 8px;color:#0f172a">' + title + '</h1>' +
        '<p style="font-size:0.78rem;color:#64748b;margin:0 0 16px">' +
          'Generado: ' + new Date().toLocaleString('es-MX') +
        '</p>';
      /* Estilo PDF-friendly */
      clone.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.78rem';
      clone.querySelectorAll('th, td').forEach(function (c) {
        c.style.cssText = 'border:1px solid #cbd5e1;padding:6px 10px;text-align:left;color:#0f172a;background:transparent';
      });
      clone.querySelectorAll('th').forEach(function (c) {
        c.style.background = '#f1f5f9';
        c.style.fontWeight = '700';
      });
      wrap.appendChild(clone);

      window.html2pdf().set({
        margin: 10,
        filename: (opts.filename || 'reporte-' + tableId) + '-' + Date.now() + '.pdf',
        html2canvas: { scale: 2, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
      }).from(wrap).save().then(function () {
        toast('PDF descargado', 'success');
      }).catch(function (e) {
        toast('Error PDF: ' + e.message, 'error');
      });
    }).catch(function () { toast('No se pudo cargar html2pdf', 'error'); });
  }
  window.MegaPDF = { exportTable: exportTablePDF };

  /* Auto-inject botón "PDF" en cada .table-wrap que no lo tenga */
  function injectPDFButtons() {
    document.querySelectorAll('.table-wrap > table').forEach(function (table) {
      if (!table.id) return;
      var wrap = table.closest('.table-wrap');
      if (!wrap || wrap.querySelector('.mega-pdf-btn')) return;
      /* Buscar toolbar cercano (siblings o panel toolbar) */
      var section = wrap.closest('section, .panel');
      if (!section) return;
      var toolbar = section.querySelector('.toolbar, .panel-toolbar, .section-header .toolbar');
      if (!toolbar) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn outline mega-pdf-btn';
      btn.title = 'Exportar tabla a PDF';
      btn.innerHTML = '<i class="fas fa-file-pdf"></i> PDF';
      btn.addEventListener('click', function () {
        var title = (section.querySelector('h2, h3') || {}).textContent || table.id;
        exportTablePDF(table.id, { title: title.trim(), filename: table.id });
      });
      toolbar.appendChild(btn);
    });
  }

  /* ════════════════════════════════════════════════════════════════
   * 4. APEXCHARTS — carga lazy + helper API
   * ════════════════════════════════════════════════════════════════ */
  var apexLoaded = false;
  function ensureApex() {
    if (apexLoaded) return Promise.resolve();
    return loadScript('https://cdn.jsdelivr.net/npm/apexcharts@3.49.0/dist/apexcharts.min.js')
      .then(function () { apexLoaded = true; });
  }
  window.MegaCharts = {
    ensure: ensureApex,
    /* helper rápido: render donut/line con tema dark */
    render: function (selectorOrEl, options) {
      return ensureApex().then(function () {
        if (!window.ApexCharts) return null;
        var el = typeof selectorOrEl === 'string'
          ? document.querySelector(selectorOrEl)
          : selectorOrEl;
        if (!el) return null;
        /* Theme dark default */
        options = Object.assign({
          theme: { mode: 'dark', palette: 'palette4' },
          chart: Object.assign({
            background: 'transparent',
            foreColor: '#cbd5e1',
            fontFamily: 'Inter, sans-serif',
            toolbar: { show: false },
          }, options.chart || {}),
        }, options);
        var ch = new window.ApexCharts(el, options);
        ch.render();
        return ch;
      });
    },
  };

  /* ════════════════════════════════════════════════════════════════
   * 5. PUSH NOTIFICATIONS PWA
   * ════════════════════════════════════════════════════════════════ */
  var Push = {
    isSupported: function () {
      return ('Notification' in window) && ('serviceWorker' in navigator);
    },
    permission: function () {
      return Push.isSupported() ? Notification.permission : 'unsupported';
    },
    request: async function () {
      if (!Push.isSupported()) {
        toast('Tu navegador no soporta notificaciones.', 'error');
        return false;
      }
      if (Notification.permission === 'granted') {
        toast('Notificaciones ya activadas', 'info');
        return true;
      }
      if (Notification.permission === 'denied') {
        toast('Las notificaciones están bloqueadas. Actívalas desde ajustes del navegador.', 'error');
        return false;
      }
      var perm = await Notification.requestPermission();
      if (perm === 'granted') {
        toast('Notificaciones activadas ✓', 'success');
        Push.notify('DavAI', { body: 'Recibirás notificaciones del sistema aquí.' });
        return true;
      }
      return false;
    },
    notify: function (title, options) {
      if (Push.permission() !== 'granted') return;
      try {
        var n = new Notification(title, Object.assign({
          icon: '/favicon.svg',
          badge: '/favicon.svg',
          silent: false,
        }, options || {}));
        if (options && options.onclick) n.onclick = options.onclick;
        return n;
      } catch (_) {}
    },
  };
  window.MegaPush = Push;

  /* ════════════════════════════════════════════════════════════════
   * 6. EXCEL PASTE — pegar TSV/CSV desde Excel en cualquier tabla
   * ════════════════════════════════════════════════════════════════ */
  function parseTSV(text) {
    /* Excel copia con tab-separated. CSV también soportado. */
    var lines = text.replace(/\r\n/g, '\n').split('\n').filter(function (l) { return l.trim(); });
    var sep = lines[0].indexOf('\t') !== -1 ? '\t' : ',';
    return lines.map(function (line) {
      return line.split(sep).map(function (c) { return c.trim().replace(/^"|"$/g, ''); });
    });
  }

  function showPastePreview(rows, sourceTableId) {
    var wrap = document.createElement('div');
    wrap.id = 'mega-paste-preview';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:100002;background:rgba(2,6,23,0.7);' +
      'backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px';
    var headers = rows[0] || [];
    var data = rows.slice(1);
    var html =
      '<div style="background:linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98));' +
        'border:1px solid rgba(255,255,255,0.12);border-radius:16px;padding:20px;max-width:90vw;' +
        'max-height:80vh;overflow:auto;color:#f8fafc;font-family:Inter,sans-serif;width:800px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
          '<h3 style="margin:0;font-size:1.1rem">Vista previa: ' + rows.length + ' filas detectadas</h3>' +
          '<button id="mega-paste-close" style="background:transparent;border:1px solid rgba(255,255,255,0.2);' +
            'color:#fff;width:32px;height:32px;border-radius:8px;cursor:pointer">×</button>' +
        '</div>' +
        '<p style="font-size:0.78rem;color:#94a3b8;margin:0 0 12px">' +
          'Tabla destino: <code>' + sourceTableId + '</code>. ' +
          '<strong>Atención:</strong> esta vista es read-only; el import requiere endpoint backend específico ' +
          'por tabla (no implementado para todas).' +
        '</p>' +
        '<table style="width:100%;border-collapse:collapse;font-size:0.78rem">' +
          '<thead style="background:rgba(59,130,246,0.18)"><tr>' +
            headers.map(function (h) { return '<th style="padding:6px 10px;text-align:left;border:1px solid rgba(255,255,255,0.1)">' + escapeHtml(h) + '</th>'; }).join('') +
          '</tr></thead>' +
          '<tbody>' +
            data.slice(0, 20).map(function (row) {
              return '<tr>' + row.map(function (c) {
                return '<td style="padding:5px 10px;border:1px solid rgba(255,255,255,0.06)">' + escapeHtml(c) + '</td>';
              }).join('') + '</tr>';
            }).join('') +
          '</tbody>' +
        '</table>' +
        (data.length > 20 ? '<p style="font-size:0.74rem;color:#64748b;margin-top:8px">+ ' + (data.length - 20) + ' filas más...</p>' : '') +
      '</div>';
    wrap.innerHTML = html;
    document.body.appendChild(wrap);
    function close () { try { wrap.remove(); } catch (_) {} }
    document.getElementById('mega-paste-close').addEventListener('click', close);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  function bindExcelPaste() {
    document.addEventListener('paste', function (e) {
      /* Solo si NO estamos en input/textarea editable */
      if (e.target.matches && e.target.matches('input, textarea, [contenteditable]')) return;
      var text = (e.clipboardData || window.clipboardData).getData('text');
      if (!text || text.length < 4) return;
      /* Heurística: ¿parece una tabla? (tab o coma + newline) */
      if (!(text.indexOf('\t') !== -1 || (text.indexOf(',') !== -1 && text.indexOf('\n') !== -1))) return;
      /* Buscar tabla más cercana al focus / al elemento target */
      var nearTable = (e.target.closest && e.target.closest('table')) ||
                      document.querySelector('.panel.active table.data-table') ||
                      document.querySelector('table.data-table');
      var tableId = nearTable ? nearTable.id : 'desconocido';
      var rows = parseTSV(text);
      if (rows.length < 2) return;
      e.preventDefault();
      showPastePreview(rows, tableId);
    });
  }

  /* ════════════════════════════════════════════════════════════════
   * 7. COLUMN RESIZE en tablas
   * ════════════════════════════════════════════════════════════════ */
  function attachColumnResize(table) {
    if (!table || table.dataset.resizeAttached) return;
    table.dataset.resizeAttached = '1';
    var headers = table.querySelectorAll('thead tr:first-child th');
    headers.forEach(function (th, idx) {
      if (idx === headers.length - 1) return; /* última col no se resize */
      var handle = document.createElement('span');
      handle.className = 'mega-col-resize-handle';
      handle.style.cssText = 'position:absolute;top:0;right:0;width:6px;height:100%;' +
        'cursor:col-resize;user-select:none;z-index:10';
      th.style.position = th.style.position || 'sticky';
      th.appendChild(handle);

      var startX = 0, startW = 0, isDragging = false;
      handle.addEventListener('mousedown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        startX = e.clientX;
        startW = th.offsetWidth;
        isDragging = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      });
      document.addEventListener('mousemove', function (e) {
        if (!isDragging) return;
        var dx = e.clientX - startX;
        var newW = Math.max(60, startW + dx);
        th.style.width = newW + 'px';
        th.style.minWidth = newW + 'px';
      });
      document.addEventListener('mouseup', function () {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      });
    });
  }

  function initColumnResize() {
    function setup() {
      document.querySelectorAll('table.data-table, .md-table').forEach(attachColumnResize);
    }
    setup();
    var obs = new MutationObserver(function () {
      clearTimeout(window.__resizeDebounce);
      window.__resizeDebounce = setTimeout(setup, 500);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  /* ════════════════════════════════════════════════════════════════
   * BOOT
   * ════════════════════════════════════════════════════════════════ */
  function boot() {
    Density.init();
    /* Esperar a que el DavAI FAB exista para inyectar voice */
    var voiceTries = 0;
    var voiceTimer = setInterval(function () {
      voiceTries++;
      if (document.getElementById('davai-fab-form') || voiceTries > 20) {
        clearInterval(voiceTimer);
        injectVoiceButton();
      }
    }, 300);

    /* PDF buttons inject + re-aplicar en mutaciones */
    injectPDFButtons();
    var obs = new MutationObserver(function () {
      clearTimeout(window.__pdfDebounce);
      window.__pdfDebounce = setTimeout(injectPDFButtons, 500);
    });
    obs.observe(document.body, { childList: true, subtree: true });

    bindExcelPaste();

    /* Column resize después de un delay para que las tablas existan */
    setTimeout(initColumnResize, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
