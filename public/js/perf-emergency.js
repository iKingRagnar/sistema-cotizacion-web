/* ════════════════════════════════════════════════════════════════════════
 * PERF EMERGENCY JS v3 — NO-OP
 *
 * Razón: Performance trace en producción confirmó que sweepAll() de v1/v2
 * causaba 372ms de FORCED REFLOW por hacer getComputedStyle + setProperty
 * en loop sobre TODOS los elementos del DOM (layout thrashing clásico).
 *
 * El "fix" se convirtió en EL problema. Por eso este archivo ahora es NO-OP.
 * Toda la lógica fue migrada a perf-emergency.css con `body#app *` selector
 * (ID-level specificity vence a `html body .x !important` legacy rules).
 *
 * Conservamos una utilidad pública para emergency-kill manual desde DevTools:
 *   window.PerfEmergency.killOn(element)
 * ════════════════════════════════════════════════════════════════════════ */
;(function () {
  'use strict';

  /* Solo expone util manual, NO ejecuta nada al cargar */
  function killHeavyOn(el) {
    if (!el || !el.style) return;
    try {
      el.style.setProperty('backdrop-filter', 'none', 'important');
      el.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
      el.style.setProperty('animation-iteration-count', '1', 'important');
    } catch (_) {}
  }

  window.PerfEmergency = { killOn: killHeavyOn };
})();
