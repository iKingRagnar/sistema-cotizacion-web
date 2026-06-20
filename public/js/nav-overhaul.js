/* ============================================================================
   NAV OVERHAUL · agrupa los 24 módulos en categorías colapsables + buscador.
   No rompe el JS existente: los botones .tab siguen siendo descendientes de
   #sidebar-rail-tabs y conservan sus event listeners (se mueve el nodo, no se
   recrea). 2026-06-20.
   ========================================================================== */
(function () {
  'use strict';

  var GROUPS = [
    { id:'intel',   label:'Inteligencia',          icon:'fa-gauge-high',   tabs:['dashboards','davai'] },
    { id:'comercial',label:'Comercial',            icon:'fa-briefcase',    tabs:['cotizaciones','ventas','prospeccion','clientes','tarifas'] },
    { id:'servicio',label:'Servicio & Operaciones', icon:'fa-screwdriver-wrench', tabs:['revision-maquinas','mantenimiento-garantia','reportes','maquinas','tecnicos'] },
    { id:'almacen', label:'Almacén & Logística',   icon:'fa-boxes-stacked',tabs:['almacen','refacciones','embarques'] },
    { id:'garantias',label:'Garantías',            icon:'fa-shield-halved', tabs:['garantias','garantias-sin-cobertura','bonos'] },
    { id:'admin',   label:'Administración',        icon:'fa-user-gear',    tabs:['usuarios','categorias-catalogo','auditoria','demo','acerca'] }
  ];
  var LS_KEY = 'ov-nav-collapsed';

  function loadCollapsed() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (_) { return {}; }
  }
  function saveCollapsed(state) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function build() {
    var nav = document.getElementById('sidebar-rail-tabs');
    if (!nav || nav.getAttribute('data-ov-grouped') === '1') return;

    var allTabs = Array.prototype.slice.call(nav.querySelectorAll('.tab[data-tab]'));
    if (!allTabs.length) return false;

    var byTab = {};
    allTabs.forEach(function (t) { byTab[t.getAttribute('data-tab')] = t; });

    // Buscador
    var searchWrap = document.createElement('div');
    searchWrap.className = 'ov-nav-search-wrap';
    var search = document.createElement('input');
    search.type = 'search';
    search.className = 'ov-nav-search';
    search.placeholder = 'Buscar módulo…';
    search.setAttribute('aria-label', 'Buscar módulo');
    searchWrap.appendChild(search);

    var collapsed = loadCollapsed();
    var frag = document.createDocumentFragment();
    frag.appendChild(searchWrap);

    var used = {};
    GROUPS.forEach(function (g) {
      var present = g.tabs.filter(function (id) { return byTab[id]; });
      if (!present.length) return;

      var group = document.createElement('div');
      group.className = 'ov-nav-group';
      group.setAttribute('data-group', g.id);
      if (collapsed[g.id]) group.classList.add('collapsed');

      var label = document.createElement('button');
      label.type = 'button';
      label.className = 'ov-nav-group-label';
      label.innerHTML = '<i class="fas ' + g.icon + '" aria-hidden="true"></i><span>' + g.label +
                        '</span><i class="fas fa-chevron-down ov-grp-chev" aria-hidden="true"></i>';
      label.addEventListener('click', function () {
        group.classList.toggle('collapsed');
        var st = loadCollapsed();
        st[g.id] = group.classList.contains('collapsed');
        saveCollapsed(st);
      });

      var body = document.createElement('div');
      body.className = 'ov-nav-group-body';
      present.forEach(function (id) { used[id] = 1; body.appendChild(byTab[id]); });

      group.appendChild(label);
      group.appendChild(body);
      frag.appendChild(group);
    });

    // Fallback: módulos no mapeados → grupo "Otros"
    var leftovers = allTabs.filter(function (t) { return !used[t.getAttribute('data-tab')]; });
    if (leftovers.length) {
      var og = document.createElement('div'); og.className = 'ov-nav-group'; og.setAttribute('data-group','otros');
      var ol = document.createElement('button'); ol.type='button'; ol.className='ov-nav-group-label';
      ol.innerHTML = '<i class="fas fa-ellipsis" aria-hidden="true"></i><span>Otros</span><i class="fas fa-chevron-down ov-grp-chev" aria-hidden="true"></i>';
      ol.addEventListener('click', function(){ og.classList.toggle('collapsed'); });
      var ob = document.createElement('div'); ob.className='ov-nav-group-body';
      leftovers.forEach(function(t){ ob.appendChild(t); });
      og.appendChild(ol); og.appendChild(ob); frag.appendChild(og);
    }

    nav.appendChild(frag);
    nav.setAttribute('data-ov-grouped', '1');

    // --- Buscador ---
    search.addEventListener('input', function () {
      var q = search.value.trim().toLowerCase();
      nav.querySelectorAll('.ov-nav-group').forEach(function (grp) {
        var anyVisible = false;
        grp.querySelectorAll('.tab[data-tab]').forEach(function (t) {
          if (t.classList.contains('hidden')) return; // respeta permisos
          var txt = (t.textContent || '').toLowerCase();
          var match = !q || txt.indexOf(q) !== -1;
          t.classList.toggle('ov-nav-hit', !match);
          if (match) anyVisible = true;
        });
        // al buscar, expandir grupos con coincidencias; ocultar grupos sin nada
        if (q) { grp.classList.remove('collapsed'); grp.style.display = anyVisible ? '' : 'none'; }
        else   { grp.style.display = ''; }
      });
    });

    // --- Ocultar etiquetas de grupo sin módulos visibles (permisos admin) ---
    function refreshGroupVisibility() {
      nav.querySelectorAll('.ov-nav-group').forEach(function (grp) {
        var visible = Array.prototype.slice.call(grp.querySelectorAll('.tab[data-tab]'))
          .filter(function (t) { return !t.classList.contains('hidden'); });
        grp.style.display = visible.length ? '' : 'none';
      });
    }
    refreshGroupVisibility();

    // --- Neutralizar estilos inline !important que pintan el amarillo legacy ---
    // La app fija background/color inline en el tab activo; los quitamos para que
    // mande el CSS premium (theme-overhaul.css).
    var INLINE_PROPS = ['background','background-color','background-image','color','border-color','-webkit-text-fill-color','-webkit-background-clip','background-clip'];
    function neutralize(t) {
      var touched = false;
      for (var k = 0; k < INLINE_PROPS.length; k++) {
        if (t.style.getPropertyValue(INLINE_PROPS[k])) { t.style.removeProperty(INLINE_PROPS[k]); touched = true; }
      }
      // El efecto de "texto degradado" (background-clip:text) deja el texto invisible
      // en el item activo. Limpiamos esas props inline en el tab y sus hijos.
      var kids = t.querySelectorAll('*');
      for (var j = 0; j < kids.length; j++) {
        kids[j].style.removeProperty('-webkit-text-fill-color');
        kids[j].style.removeProperty('-webkit-background-clip');
        kids[j].style.removeProperty('background-clip');
      }
      return touched;
    }
    // incluye pills del header (mismo amarillo inline legacy)
    var headerPills = Array.prototype.slice.call(
      document.querySelectorAll('.mapa-header-owner-nav .tab, .mapa-header-owner-nav .mapa-owner-pill'));
    var styled = allTabs.concat(headerPills);
    function neutralizeAll() { styled.forEach(neutralize); }
    neutralizeAll();


    var mo = new MutationObserver(function (muts) {
      var needRefresh = false;
      muts.forEach(function (m) {
        if (m.attributeName === 'style' && m.target && m.target.classList.contains('tab')) neutralize(m.target);
        if (m.attributeName === 'class') needRefresh = true;
      });
      if (needRefresh && !search.value.trim()) { refreshGroupVisibility(); neutralizeAll(); }
    });
    styled.forEach(function (t) { mo.observe(t, { attributes:true, attributeFilter:['class','style'] }); });

    return true;
  }

  /* ---- Limpieza: ocultar toast de debug "already initialized" ---- */
  function hideDebugToasts() {
    var nodes = document.querySelectorAll('body *');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.children.length) continue;
      var txt = (el.textContent || '').trim().toLowerCase();
      if (txt && txt.indexOf('already initialized') !== -1) {
        var box = el.closest('div') || el;
        box.classList.add('ov-hidden-debug');
      }
    }
  }

  function ensureAurora() {
    if (document.getElementById('ov-aurora')) return;
    var a = document.createElement('div');
    a.id = 'ov-aurora';
    a.setAttribute('aria-hidden', 'true');
    var third = document.createElement('div');
    third.className = 'ov-aurora-3';
    a.appendChild(third);
    document.body.insertBefore(a, document.body.firstChild);
  }

  // Neutraliza colores inline !important de los botones de accion de tablas
  // (amarillo/rojo/azul solidos) para que mande el sistema coherente del CSS.
  var ACT_SEL = 'tbody .btn, .table-wrap .btn, [class*="prem-action"], ' +
    '[class*="btn-edit"], [class*="btn-delete"], [class*="btn-preview"], ' +
    '[class*="btn-pdf"], [class*="btn-aplicar"], [class*="btn-convertir"]';
  var ACT_PROPS = ['background','background-color','background-image','color','border-color','box-shadow'];
  function harmonizeActions(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var els = scope.querySelectorAll(ACT_SEL);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      for (var k = 0; k < ACT_PROPS.length; k++) {
        if (el.style.getPropertyValue(ACT_PROPS[k])) el.style.removeProperty(ACT_PROPS[k]);
      }
      var ic = el.querySelector('i, svg');
      if (ic && ic.style) { ic.style.removeProperty('color'); ic.style.removeProperty('background'); }
    }
  }
  // La app deja algunas celdas (td.th-actions, td.sla-cell) en display:flex con
  // !important, lo que descuadra las columnas. Forzamos table-cell inline.
  function fixTableCells(root) {
    var tds = (root && root.querySelectorAll ? root : document).querySelectorAll('table tbody td');
    for (var i = 0; i < tds.length; i++) {
      var d = getComputedStyle(tds[i]).display;
      if (d === 'flex' || d === 'inline-flex') {
        tds[i].style.setProperty('display', 'table-cell', 'important');
        tds[i].style.setProperty('vertical-align', 'middle', 'important');
      }
    }
  }

  function watchActions() {
    var main = document.getElementById('main-content') || document.body;
    harmonizeActions(document);
    fixTableCells(document);
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'attributes' && m.target.matches && m.target.matches(ACT_SEL)) { harmonizeActions(m.target.parentNode || document); }
        else if (m.addedNodes && m.addedNodes.length) { harmonizeActions(document); fixTableCells(document); break; }
      }
    });
    mo.observe(main, { childList:true, subtree:true, attributes:true, attributeFilter:['style'] });
    // pasadas de seguridad
    setTimeout(function(){harmonizeActions(document);fixTableCells(document);}, 800);
    setTimeout(function(){harmonizeActions(document);fixTableCells(document);}, 2500);
  }

  function boot() {
    ensureAurora();
    watchActions();
    var ok = build();
    hideDebugToasts();
    if (!ok) { // la nav puede poblarse asíncronamente; reintentar
      var tries = 0;
      var iv = setInterval(function () {
        tries++;
        if (build() || tries > 40) clearInterval(iv);
      }, 250);
    }
    // re-pasada por si el toast aparece tarde (mapa Leaflet)
    setTimeout(hideDebugToasts, 1500);
    setTimeout(hideDebugToasts, 4000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
