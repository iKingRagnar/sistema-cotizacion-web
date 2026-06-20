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
    var INLINE_PROPS = ['background','background-color','background-image','color','border-color'];
    function neutralize(t) {
      var touched = false;
      for (var k = 0; k < INLINE_PROPS.length; k++) {
        if (t.style.getPropertyValue(INLINE_PROPS[k])) { t.style.removeProperty(INLINE_PROPS[k]); touched = true; }
      }
      return touched;
    }
    function neutralizeAll() { allTabs.forEach(neutralize); }
    neutralizeAll();

    var mo = new MutationObserver(function (muts) {
      var needRefresh = false;
      muts.forEach(function (m) {
        if (m.attributeName === 'style' && m.target && m.target.classList.contains('tab')) neutralize(m.target);
        if (m.attributeName === 'class') needRefresh = true;
      });
      if (needRefresh && !search.value.trim()) { refreshGroupVisibility(); neutralizeAll(); }
    });
    allTabs.forEach(function (t) { mo.observe(t, { attributes:true, attributeFilter:['class','style'] }); });

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

  function boot() {
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
