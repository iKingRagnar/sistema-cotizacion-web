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

  /* Force the modal AND modal-box to be fully visible — combate animation atascada */
  function forceModalVisible(modal) {
    if (!modal) return;
    try {
      modal.style.setProperty('opacity', '1', 'important');
      modal.style.setProperty('visibility', 'visible', 'important');
      modal.style.setProperty('animation', 'none', 'important');
      modal.style.setProperty('transition', 'none', 'important');
      modal.style.setProperty('display', 'flex', 'important');
      modal.style.setProperty('pointer-events', 'auto', 'important');
    } catch (_) {}
    var box = modal.querySelector('.modal-box, .modal-content, .md-dialog-surface');
    if (box) {
      try {
        box.style.setProperty('opacity', '1', 'important');
        box.style.setProperty('visibility', 'visible', 'important');
        box.style.setProperty('animation', 'none', 'important');
        box.style.setProperty('transform', 'none', 'important');
        box.style.setProperty('pointer-events', 'auto', 'important');
      } catch (_) {}
    }
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
        /* Verificar que el MODAL (no solo el box) sea realmente visible */
        var modalCs = getComputedStyle(modal);
        var modalInvisible = parseFloat(modalCs.opacity) < 0.5 || modalCs.visibility === 'hidden' || modalCs.display === 'none';
        var box = modal.querySelector('.modal-box, .modal-content');
        var boxInvisible = box && (parseFloat(getComputedStyle(box).opacity) < 0.5 || getComputedStyle(box).visibility === 'hidden');
        if (modalInvisible || boxInvisible) {
          forceModalVisible(modal);
          console.warn('[rev-fix] Modal/box invisible — forzando visibilidad', { modalInvisible: modalInvisible, boxInvisible: boxInvisible });
        } else {
          visible = true;
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

  /* Capture-phase para correr ANTES del handler original
     Cubre: Nueva Revisión Máquina + Calendario Mantenimientos + cualquier botón que abra modal */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest(
      '.btn-rev-desde-catalogo, #nueva-revision-maq, ' +
      '.cal-day--click[data-date], .cal-day[data-date], ' +
      '.btn-mant-gar, .btn-mant-gar-sin, .btn-mant-dia-edit, ' +
      '.btn-edit-mant, .btn-new-mant'
    );
    if (!btn) return;

    /* Lock contra doble-click */
    if (BUSY_LOCK && (Date.now() - BUSY_LOCK) < DOUBLE_LOCK_MS) {
      e.stopImmediatePropagation();
      e.preventDefault();
      toast('Ya se está cargando, espera un momento...', 'info');
      return;
    }
    BUSY_LOCK = Date.now();

    /* Feedback inmediato según tipo de botón */
    var label;
    if (btn.id === 'nueva-revision-maq') label = 'nueva revisión';
    else if (btn.classList.contains('btn-rev-desde-catalogo')) label = 'revisión desde catálogo';
    else if (btn.classList.contains('cal-day--click') || btn.classList.contains('cal-day')) {
      var dt = btn.getAttribute('data-date');
      label = 'mantenimientos del ' + (dt || 'día');
    }
    else if (btn.classList.contains('btn-mant-gar') || btn.classList.contains('btn-mant-gar-sin')) label = 'mantenimientos';
    else if (btn.classList.contains('btn-mant-dia-edit')) label = 'editor de mantenimiento';
    else label = 'formulario';
    toast('🔄 Cargando ' + label + '...', 'info');

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

  /* También detectar si CUALQUIER modal queda invisible tras un click. Cubre #modal, #modal-stack
     y cualquier otro contenedor con clase .modal */
  function setupModalWatcher() {
    var targets = ['#modal', '#modal-stack'];
    var anyFound = false;
    targets.forEach(function (sel) {
      var modal = document.querySelector(sel);
      if (!modal || modal._revFixWatched) return;
      modal._revFixWatched = true;
      anyFound = true;
      var mo = new MutationObserver(function () {
        if (modal.classList.contains('hidden')) return;
        /* Modal se abre — forzar visibilidad TRES veces (por si la animación es lenta) */
        forceModalVisible(modal);
        requestAnimationFrame(function () { forceModalVisible(modal); });
        setTimeout(function () { forceModalVisible(modal); }, 100);
        setTimeout(function () {
          var cs = getComputedStyle(modal);
          if (parseFloat(cs.opacity) < 0.5 || cs.display === 'none') {
            console.warn('[rev-fix] Modal sigue invisible tras 250ms — segundo intento');
            forceModalVisible(modal);
          }
        }, 250);
      });
      mo.observe(modal, { attributes: true, attributeFilter: ['class', 'style'] });
    });
    if (!anyFound) setTimeout(setupModalWatcher, 1000);
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
