/* tooltips.js — Tooltip global y bonito para TODA la app.
   Reutiliza los atributos title="" existentes (en todas las pestañas) y los
   reemplaza por un tooltip estilizado, sin tener que tocar botón por botón.
   Para botones sin title, infiere la etiqueta por el icono (eye/edit/trash...). */
(function () {
  'use strict';
  if (window.__appTooltipInit) return;
  window.__appTooltipInit = true;

  // Etiquetas por icono FontAwesome para botones SIN title (respaldo seguro).
  var ICON_LABELS = {
    'fa-eye': 'Ver / Vista previa',
    'fa-magnifying-glass-plus': 'Ver ampliado',
    'fa-search-plus': 'Ver ampliado',
    'fa-edit': 'Editar',
    'fa-pen': 'Editar',
    'fa-pencil': 'Editar',
    'fa-pencil-alt': 'Editar',
    'fa-pen-to-square': 'Editar',
    'fa-trash': 'Eliminar',
    'fa-trash-alt': 'Eliminar',
    'fa-trash-can': 'Eliminar',
    'fa-print': 'Imprimir / PDF',
    'fa-file-pdf': 'PDF',
    'fa-file-csv': 'Exportar CSV',
    'fa-file-excel': 'Exportar Excel',
    'fa-download': 'Descargar',
    'fa-upload': 'Subir archivo',
    'fa-save': 'Guardar',
    'fa-floppy-disk': 'Guardar',
    'fa-copy': 'Duplicar',
    'fa-clone': 'Duplicar',
    'fa-plus': 'Agregar',
    'fa-sitemap': 'Ver jerarquía / categorías',
    'fa-project-diagram': 'Ver estructura',
    'fa-diagram-project': 'Ver estructura',
    'fa-layer-group': 'Categorías',
    'fa-share-alt': 'Compartir',
    'fa-share-nodes': 'Compartir',
    'fa-paper-plane': 'Enviar',
    'fa-envelope': 'Enviar correo',
    'fa-check': 'Confirmar',
    'fa-check-double': 'Aplicar',
    'fa-ban': 'Cancelar',
    'fa-times': 'Cerrar',
    'fa-xmark': 'Cerrar',
    'fa-list': 'Ver detalle',
    'fa-cog': 'Opciones',
    'fa-gear': 'Opciones',
    'fa-ellipsis-v': 'Más opciones',
    'fa-ellipsis-vertical': 'Más opciones',
    'fa-search': 'Buscar',
    'fa-magnifying-glass': 'Buscar'
  };

  var tip = null;

  function ensureTip() {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.className = 'app-tooltip';
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
    return tip;
  }

  function classStr(el) {
    if (!el || !el.className) return '';
    return (el.className.baseVal != null) ? el.className.baseVal : String(el.className || '');
  }

  // ¿El elemento es un control accionable (botón, enlace, chip, icono clicable)?
  function isActionable(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName;
    if (tag === 'BUTTON' || tag === 'A') return true;
    if (el.getAttribute && (el.getAttribute('role') === 'button' || el.hasAttribute('onclick') || el.hasAttribute('data-id') || el.hasAttribute('data-tab'))) return true;
    return /(^|\s|-)(btn|button|chip|icon-btn|nav-btn|fab)(\s|-|$)/i.test(classStr(el));
  }

  // Sube por el DOM hasta el primer elemento con texto de tooltip o un control
  // accionable del que podamos inferir la etiqueta por su icono.
  function findTarget(el) {
    var depth = 0;
    while (el && el.nodeType === 1 && el !== document.body && depth < 6) {
      if (el.hasAttribute('data-tip') || el.hasAttribute('title') || el.hasAttribute('aria-label')) return el;
      if (isActionable(el) && iconLabel(el)) return el;
      el = el.parentElement;
      depth++;
    }
    return null;
  }

  function iconLabel(el) {
    var icon = (el.matches && el.matches('i[class*="fa-"]')) ? el
      : (el.querySelector && el.querySelector('i[class*="fa-"]'));
    if (!icon) return '';
    var cls = classStr(icon);
    for (var key in ICON_LABELS) {
      if (cls.indexOf(key) !== -1) return ICON_LABELS[key];
    }
    return '';
  }

  function textFor(el) {
    // Mueve title -> data-tip para matar el tooltip nativo (feo y lento), una sola vez.
    if (el.hasAttribute('title')) {
      var t = el.getAttribute('title');
      if (t && t.trim()) el.setAttribute('data-tip', t.trim());
      el.removeAttribute('title');
    }
    var txt = (el.getAttribute('data-tip') || el.getAttribute('aria-label') || '').trim();
    if (!txt) txt = iconLabel(el);
    return txt;
  }

  function position(el) {
    var t = ensureTip();
    var r = el.getBoundingClientRect();
    // Mide ya con el texto puesto.
    var tw = t.offsetWidth, th = t.offsetHeight;
    var gap = 9;
    var left = r.left + r.width / 2 - tw / 2;
    var top = r.top - th - gap;
    var place = 'top';
    if (top < 6) { top = r.bottom + gap; place = 'bottom'; }
    left = Math.max(6, Math.min(left, window.innerWidth - tw - 6));
    var arrowX = r.left + r.width / 2 - left;
    t.style.left = Math.round(left) + 'px';
    t.style.top = Math.round(top) + 'px';
    t.style.setProperty('--tip-arrow', Math.round(arrowX) + 'px');
    t.setAttribute('data-place', place);
  }

  function show(el) {
    var txt = textFor(el);
    if (!txt) return;
    var t = ensureTip();
    t.textContent = txt;
    t.classList.add('show');
    position(el); // posiciona ya medido
  }

  function hide() {
    if (tip) tip.classList.remove('show');
  }

  document.addEventListener('mouseover', function (e) {
    var el = findTarget(e.target);
    if (el) show(el);
  });
  document.addEventListener('mouseout', function (e) {
    if (findTarget(e.target)) hide();
  });
  document.addEventListener('focusin', function (e) {
    var el = findTarget(e.target);
    if (el) show(el);
  });
  document.addEventListener('focusout', hide);
  window.addEventListener('scroll', hide, true);
  document.addEventListener('click', hide, true);
})();
