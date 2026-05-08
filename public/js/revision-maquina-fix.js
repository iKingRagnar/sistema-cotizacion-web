/* ════════════════════════════════════════════════════════════════════════
 * REVISION MAQUINA FIX — Anti-freeze para "Nueva Revisión de Máquina"
 *
 * Problema: al click en .btn-rev-desde-catalogo / #nueva-revision-maq la app
 * se congela varios segundos sin feedback visual y los usuarios creen que
 * el sistema murió.
 *
 * Solución defensiva (no modifica app.js, intercepta en capture-phase):
 *   1. Click en estos botones → toast inmediato "Cargando formulario..."
 *   2. Si el modal #modal no aparece en 8s → toast error + cleanup
 *   3. Detect doble-click consecutivo (lock 1s)
 *   4. Si #modal aparece pero queda invisible (opacity:0) → forzar visibilidad
 *   5. Si la página queda con scroll bloqueado → restaurar
 * ════════════════════════════════════════════════════════════════════════ */
;(function () {
  'use strict';

  var BUSY_LOCK = 0;
  var WATCHDOG_MS = 8000;
  var DOUBLE_LOCK_MS = 1000;

  function $(s) { return document.querySelector(s); }
  function toast(msg, kind) {
    if (window.MegaToast && window.MegaToast.show) return window.MegaToast.show(msg, kind);
    if (window.showToast) return window.showToast(msg, kind);
  }

  function isReviewBtn(el) {
    if (!el) return false;
    return el.classList && (
      el.classList.contains('btn-rev-desde-catalogo') ||
      el.id === 'nueva-revision-maq'
    );
  }

  /* Watchdog: revisa cada 250ms si el modal apareció. Timeout en 8s. */
  function startWatchdog(label) {
    var start = Date.now();
    var modalSeen = false;
    var visible = false;
    var watchdog = setInterval(function () {
      var modal = $('#modal');
      var elapsed = Date.now() - start;

      if (modal && !modal.classList.contains('hidden')) {
        modalSeen = true;
        /* Verificar que sea realmente visible (no opacity:0 trap) */
        var box = modal.querySelector('.modal-box');
        if (box) {
          var cs = getComputedStyle(box);
          if (parseFloat(cs.opacity) < 0.5 || cs.visibility === 'hidden') {
            /* Forzar visibilidad — esto pasa cuando una animación queda atascada */
            try {
              box.style.setProperty('opacity', '1', 'important');
              box.style.setProperty('visibility', 'visible', 'important');
              box.style.setProperty('animation', 'none', 'important');
              box.style.setProperty('transform', 'none', 'important');
              console.warn('[rev-fix] Modal abierto pero invisible — forzando visibilidad');
            } catch (_) {}
          } else {
            visible = true;
          }
        }
      }

      if (visible) {
        clearInterval(watchdog);
        BUSY_LOCK = 0;
        return;
      }

      if (elapsed > WATCHDOG_MS) {
        clearInterval(watchdog);
        BUSY_LOCK = 0;
        if (!modalSeen) {
          toast('El servidor tardó demasiado. Reintenta en unos segundos.', 'error');
          /* Cleanup defensivo */
          try {
            if (window.PRSPRO_safetyNet && window.PRSPRO_safetyNet.closeAllVisible) {
              window.PRSPRO_safetyNet.closeAllVisible();
            }
            document.body.style.removeProperty('overflow');
            document.documentElement.style.removeProperty('overflow');
          } catch (_) {}
        } else {
          toast('Modal cargado pero con demoras. Si no funciona, presiona ESC.', 'warning');
        }
      }
    }, 250);
  }

  /* Capture-phase para correr ANTES del handler original */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.btn-rev-desde-catalogo, #nueva-revision-maq');
    if (!btn) return;

    /* Lock contra doble-click */
    if (BUSY_LOCK && (Date.now() - BUSY_LOCK) < DOUBLE_LOCK_MS) {
      e.stopImmediatePropagation();
      e.preventDefault();
      toast('Ya se está cargando, espera un momento...', 'info');
      return;
    }
    BUSY_LOCK = Date.now();

    /* Feedback inmediato */
    var label = btn.id === 'nueva-revision-maq' ? 'nueva revisión' : 'revisión desde catálogo';
    toast('🔄 Cargando formulario de ' + label + '...', 'info');

    /* Visual: cursor wait + button disabled visualmente */
    document.body.style.cursor = 'wait';
    btn.style.opacity = '0.6';
    btn.style.pointerEvents = 'none';

    /* Watchdog */
    startWatchdog(label);

    /* Restaurar visual después de 8s pase lo que pase */
    setTimeout(function () {
      document.body.style.cursor = '';
      btn.style.opacity = '';
      btn.style.pointerEvents = '';
    }, WATCHDOG_MS);
  }, true /* capture phase */);

  /* También detectar si el modal queda invisible tras cualquier click (no solo Nueva Revisión) */
  var bodyMo;
  function setupModalWatcher() {
    var modal = $('#modal');
    if (!modal) {
      setTimeout(setupModalWatcher, 1000);
      return;
    }
    /* Observa cuando le quitan la clase 'hidden' al modal */
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'attributes' && m.attributeName === 'class') {
          if (!modal.classList.contains('hidden')) {
            /* Modal se abre — verificar visibilidad en próximo frame */
            requestAnimationFrame(function () {
              var box = modal.querySelector('.modal-box');
              if (!box) return;
              var cs = getComputedStyle(box);
              if (parseFloat(cs.opacity) < 0.1 || cs.visibility === 'hidden' || cs.display === 'none') {
                try {
                  box.style.setProperty('opacity', '1', 'important');
                  box.style.setProperty('visibility', 'visible', 'important');
                  box.style.setProperty('display', 'block', 'important');
                  box.style.setProperty('animation', 'none', 'important');
                  box.style.setProperty('transform', 'none', 'important');
                  console.warn('[rev-fix] Modal invisible detectado — visibilidad forzada');
                } catch (_) {}
              }
            });
          }
        }
      }
    });
    mo.observe(modal, { attributes: true, attributeFilter: ['class'] });
  }

  if (document.readyState === 'complete') setTimeout(setupModalWatcher, 800);
  else window.addEventListener('load', function () { setTimeout(setupModalWatcher, 800); });

  /* Atajo de teclado: Ctrl+Alt+M = forzar cierre del modal y unlock */
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.altKey && (e.key === 'm' || e.key === 'M')) {
      BUSY_LOCK = 0;
      document.body.style.cursor = '';
      document.body.style.removeProperty('overflow');
      if (window.PRSPRO_safetyNet) window.PRSPRO_safetyNet.nuclearClose();
      toast('Modal forzado a cerrar (Ctrl+Alt+M)', 'success');
    }
  });

  window.RevisionMaquinaFix = { unlock: function () { BUSY_LOCK = 0; } };
})();
