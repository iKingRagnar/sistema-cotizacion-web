/**
 * premium-ux.js — UX enhancements premium
 * 1. Cmd+K / Ctrl+K búsqueda global (módulos + registros de tablas visibles)
 * 2. Atajos de teclado + cheat sheet (tecla "?")
 * 3. Skeleton loaders automáticos en tablas vacías
 * 4. Filtros guardados (vistas) con localStorage
 */
(function premiumUX() {
  'use strict';

  const LS_PREFIX = 'prem-ux:';
  const isEditing = (el) => el && el.matches && el.matches('input, textarea, select, [contenteditable="true"]');

  /* ═══════════════════════════════════════════════════════════
     SHARED IDLE WORK QUEUE — UN solo MutationObserver para todos
     los scans periódicos. Evita tener 17 observers compitiendo.
     Cada init() registra una función con premOnDomChange(fn) y se
     llama throttled a ~6 FPS (167ms) usando requestIdleCallback
     o requestAnimationFrame.
     ═══════════════════════════════════════════════════════════ */
  const idleCallbacks = [];
  let idleScheduled = false;
  let lastRunAt = 0;
  const MIN_INTERVAL = 250;

  function runIdleQueue() {
    idleScheduled = false;
    lastRunAt = performance.now();
    for (const fn of idleCallbacks) {
      try { fn(); } catch (e) { /* swallow */ }
    }
  }

  function scheduleIdleWork() {
    if (idleScheduled) return;
    const sinceLast = performance.now() - lastRunAt;
    const delay = Math.max(0, MIN_INTERVAL - sinceLast);
    idleScheduled = true;
    if ('requestIdleCallback' in window) {
      setTimeout(() => requestIdleCallback(runIdleQueue, { timeout: 500 }), delay);
    } else {
      setTimeout(runIdleQueue, delay);
    }
  }

  window.premOnDomChange = function (fn) {
    if (typeof fn === 'function') idleCallbacks.push(fn);
  };
  window.premScheduleIdleWork = scheduleIdleWork;

  // UN único MutationObserver global
  if (typeof MutationObserver !== 'undefined') {
    const globalMo = new MutationObserver(() => scheduleIdleWork());
    if (document.body) {
      globalMo.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        globalMo.observe(document.body, { childList: true, subtree: true });
      });
    }
  }

  /* ═══════════════════════════════════════════════════════════
     1. CMD+K — búsqueda global
     ═══════════════════════════════════════════════════════════ */
  function initCommandK() {
    const modal = document.createElement('div');
    modal.className = 'prem-cmdk';
    modal.innerHTML = `
      <div class="prem-cmdk-backdrop"></div>
      <div class="prem-cmdk-panel" role="dialog" aria-label="Búsqueda global">
        <div class="prem-cmdk-input-wrap">
          <i class="fas fa-search"></i>
          <input type="text" class="prem-cmdk-input" placeholder="Buscar módulo, cliente, folio, refacción..." autocomplete="off" spellcheck="false">
          <kbd class="prem-cmdk-esc">ESC</kbd>
        </div>
        <div class="prem-cmdk-results" role="listbox"></div>
        <div class="prem-cmdk-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
          <span><kbd>↵</kbd> abrir</span>
          <span><kbd>esc</kbd> cerrar</span>
          <span class="prem-cmdk-brand">⌘K · Búsqueda global</span>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const input = modal.querySelector('.prem-cmdk-input');
    const results = modal.querySelector('.prem-cmdk-results');
    const backdrop = modal.querySelector('.prem-cmdk-backdrop');

    let isOpen = false;
    let selectedIdx = 0;
    let currentResults = [];

    function open() {
      isOpen = true;
      modal.classList.add('open');
      input.value = '';
      refresh();
      setTimeout(() => input.focus(), 30);
    }
    function close() {
      isOpen = false;
      modal.classList.remove('open');
    }

    let searchAbort = null;
    let searchDebounce = null;

    async function refresh() {
      const q = input.value.toLowerCase().trim();
      const items = [];
      const seen = new Set();

      // 1. Módulos (tabs del sidebar) — siempre síncrono
      document.querySelectorAll('.tabs.tabs--rail .tab').forEach(tab => {
        if (tab.classList.contains('hidden')) return;
        const text = (tab.textContent || '').trim();
        if (!text) return;
        const key = 'mod:' + text;
        if (seen.has(key)) return;
        if (!q || text.toLowerCase().includes(q)) {
          seen.add(key);
          items.push({
            icon: (tab.querySelector('i')?.className) || 'fas fa-circle',
            title: text,
            subtitle: 'Módulo',
            action: () => { tab.click(); tab.scrollIntoView({ block: 'nearest' }); }
          });
        }
      });

      currentResults = items.slice(0, 30);
      selectedIdx = 0;
      render();

      // 2. Server-side search (debounced) — sólo si hay query ≥2 chars
      if (!q || q.length < 2) return;

      if (searchDebounce) clearTimeout(searchDebounce);
      searchDebounce = setTimeout(async () => {
        if (searchAbort) searchAbort.abort();
        searchAbort = new AbortController();
        try {
          const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
            signal: searchAbort.signal,
            credentials: 'same-origin',
          });
          if (!res.ok) return;
          const data = await res.json();
          if (input.value.toLowerCase().trim() !== q) return; // query cambió
          for (const r of (data.results || [])) {
            items.push({
              icon: r.icon || 'fas fa-file-alt',
              title: r.title,
              subtitle: r.subtitle,
              action: () => {
                // Click en tab del módulo destino (si existe)
                const tab = document.querySelector(`.tabs.tabs--rail .tab[data-tab="${r.tab}"]`);
                if (tab) {
                  tab.click();
                  // Highlight registro en tabla destino
                  setTimeout(() => {
                    const row = document.querySelector(`#tabla-${r.tab} tbody tr[data-id="${r.id}"]`)
                            || [...document.querySelectorAll(`#tabla-${r.tab} tbody tr td:first-child`)]
                                .find(td => td.textContent.trim() === String(r.id))?.parentElement;
                    if (row) {
                      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      row.classList.add('prem-cmdk-highlight');
                      setTimeout(() => row.classList.remove('prem-cmdk-highlight'), 2400);
                    }
                  }, 350);
                }
              }
            });
          }
          currentResults = items.slice(0, 30);
          render();
        } catch (e) { /* abort or network */ }
      }, 180);
    }

    function render() {
      if (!currentResults.length) {
        results.innerHTML = '<div class="prem-cmdk-empty"><i class="fas fa-inbox"></i><span>Sin resultados</span></div>';
        return;
      }
      results.innerHTML = currentResults.map((it, i) => `
        <div class="prem-cmdk-item ${i === selectedIdx ? 'selected' : ''}" data-idx="${i}" role="option">
          <i class="${it.icon}"></i>
          <div class="prem-cmdk-item-text">
            <div class="prem-cmdk-item-title">${escapeText(it.title)}</div>
            <div class="prem-cmdk-item-sub">${escapeText(it.subtitle)}</div>
          </div>
          <i class="fas fa-arrow-right prem-cmdk-item-arrow"></i>
        </div>
      `).join('');

      results.querySelectorAll('.prem-cmdk-item').forEach(el => {
        el.addEventListener('click', () => {
          const idx = parseInt(el.dataset.idx, 10);
          currentResults[idx]?.action();
          close();
        });
      });

      // Scroll seleccionado a la vista
      const sel = results.querySelector('.prem-cmdk-item.selected');
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    }

    function escapeText(s) {
      const d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }

    // Atajo global
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        isOpen ? close() : open();
        return;
      }
      if (!isOpen) return;

      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = Math.min(selectedIdx + 1, currentResults.length - 1); render(); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); selectedIdx = Math.max(selectedIdx - 1, 0); render(); }
      else if (e.key === 'Enter')     { e.preventDefault(); currentResults[selectedIdx]?.action(); close(); }
    });

    input.addEventListener('input', refresh);
    backdrop.addEventListener('click', close);
  }

  /* ═══════════════════════════════════════════════════════════
     2. CHEAT SHEET DE ATAJOS — tecla "?"
     ═══════════════════════════════════════════════════════════ */
  function initShortcutsCheatSheet() {
    const modal = document.createElement('div');
    modal.className = 'prem-shortcuts';
    modal.innerHTML = `
      <div class="prem-shortcuts-backdrop"></div>
      <div class="prem-shortcuts-panel" role="dialog" aria-label="Atajos de teclado">
        <div class="prem-shortcuts-head">
          <h2><i class="fas fa-keyboard"></i> Atajos de teclado</h2>
          <button class="prem-shortcuts-close-x" aria-label="Cerrar"><i class="fas fa-times"></i></button>
        </div>
        <div class="prem-shortcuts-grid">
          <div class="prem-shortcuts-group">
            <h3>Navegación</h3>
            <div class="prem-shortcut"><span>Búsqueda global</span><span class="kbd-group"><kbd>Ctrl</kbd><span>+</span><kbd>K</kbd></span></div>
            <div class="prem-shortcut"><span>Mostrar/cerrar esta guía</span><span class="kbd-group"><kbd>?</kbd></span></div>
            <div class="prem-shortcut"><span>Cerrar modal</span><span class="kbd-group"><kbd>Esc</kbd></span></div>
          </div>
          <div class="prem-shortcuts-group">
            <h3>Módulos</h3>
            <div class="prem-shortcut"><span>Dashboard</span><span class="kbd-group"><kbd>Ctrl</kbd><span>+</span><kbd>1</kbd></span></div>
            <div class="prem-shortcut"><span>Clientes</span><span class="kbd-group"><kbd>Ctrl</kbd><span>+</span><kbd>2</kbd></span></div>
            <div class="prem-shortcut"><span>Refacciones</span><span class="kbd-group"><kbd>Ctrl</kbd><span>+</span><kbd>3</kbd></span></div>
            <div class="prem-shortcut"><span>Cotizaciones</span><span class="kbd-group"><kbd>Ctrl</kbd><span>+</span><kbd>4</kbd></span></div>
          </div>
          <div class="prem-shortcuts-group">
            <h3>Tablas</h3>
            <div class="prem-shortcut"><span>Enviar filtro</span><span class="kbd-group"><kbd>Enter</kbd></span></div>
            <div class="prem-shortcut"><span>Limpiar filtros</span><span class="kbd-group"><kbd>Esc</kbd></span></div>
            <div class="prem-shortcut"><span>Enfocar búsqueda</span><span class="kbd-group"><kbd>/</kbd></span></div>
          </div>
        </div>
        <div class="prem-shortcuts-footer">
          <span>¿Sugerencia? Escríbele al administrador.</span>
          <button class="btn primary prem-shortcuts-close">Entendido</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    function open()  { modal.classList.add('open'); }
    function close() { modal.classList.remove('open'); }

    modal.querySelector('.prem-shortcuts-backdrop').addEventListener('click', close);
    modal.querySelector('.prem-shortcuts-close').addEventListener('click', close);
    modal.querySelector('.prem-shortcuts-close-x').addEventListener('click', close);

    document.addEventListener('keydown', (e) => {
      if (isEditing(e.target)) return;
      if (e.key === '?') { e.preventDefault(); modal.classList.contains('open') ? close() : open(); }
      else if (e.key === 'Escape' && modal.classList.contains('open')) close();
      else if (e.key === '/' && !isEditing(e.target)) {
        const search = document.querySelector('.panel.active input[type="search"], .panel.active .search-input');
        if (search) { e.preventDefault(); search.focus(); }
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════
     3. SKELETON LOADERS automáticos
     Inyecta filas skeleton cuando una tabla .data-table queda con
     tbody vacío > 250ms (señal de que está cargando)
     ═══════════════════════════════════════════════════════════ */
  function initSkeletonLoaders() {
    const markEmpty = (tbody) => {
      if (!tbody || tbody.querySelector('.prem-skel-row')) return;
      const table = tbody.closest('table');
      const cols = table?.querySelector('thead tr:first-child')?.children.length || 5;
      const rows = 6;
      let html = '';
      for (let r = 0; r < rows; r++) {
        html += '<tr class="prem-skel-row">';
        for (let c = 0; c < cols; c++) html += '<td><span class="prem-skel"></span></td>';
        html += '</tr>';
      }
      tbody.innerHTML = html;
    };

    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type !== 'childList') continue;
        const target = m.target;
        if (target.tagName === 'TBODY' && target.children.length === 0) {
          const table = target.closest('table.data-table');
          if (table && !table.classList.contains('no-skel')) {
            setTimeout(() => {
              if (target.children.length === 0) markEmpty(target);
            }, 260);
          }
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // Inicial: tablas que arrancan vacías
    setTimeout(() => {
      document.querySelectorAll('table.data-table tbody').forEach(tb => {
        if (tb.children.length === 0) markEmpty(tb);
      });
    }, 400);
  }

  /* ═══════════════════════════════════════════════════════════
     4. FILTROS GUARDADOS — "Vistas" con localStorage
     Inyecta botón "Vistas" en .prem-filter-bar cada vez que se crea
     ═══════════════════════════════════════════════════════════ */
  function initSavedFilters() {
    function attach(table) {
      if (table._savedFiltersAttached) return;
      const wrap = table.closest('.table-wrap, .md-table-wrap');
      if (!wrap) return;
      const filterRow = table.querySelector('thead .filter-row');
      if (!filterRow) return;
      table._savedFiltersAttached = true;

      // Crear bar container arriba del table-wrap
      const bar = document.createElement('div');
      bar.className = 'prem-views-bar';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'prem-views-btn';
      btn.innerHTML = '<i class="fas fa-bookmark"></i> Vistas';
      btn.title = 'Guardar/cargar filtros';

      const dropdown = document.createElement('div');
      dropdown.className = 'prem-views-dropdown';

      bar.appendChild(btn);
      bar.appendChild(dropdown);
      wrap.insertAdjacentElement('beforebegin', bar);

      const storageKey = LS_PREFIX + 'views:' + (table.id || 'tbl');

      function readViews() {
        try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); }
        catch { return []; }
      }
      function writeViews(list) {
        try { localStorage.setItem(storageKey, JSON.stringify(list)); } catch {}
      }

      function currentValues() {
        const vals = {};
        filterRow.querySelectorAll('input[data-key], select[data-key]').forEach(inp => {
          if (inp.value && inp.value.trim()) vals[inp.dataset.key + ':' + (inp.className.includes('date-input') ? 'date' : '')] = inp.value;
        });
        return vals;
      }

      function applyValues(vals) {
        filterRow.querySelectorAll('input[data-key], select[data-key]').forEach(inp => {
          const k = inp.dataset.key + ':' + (inp.className.includes('date-input') ? 'date' : '');
          inp.value = vals[k] || '';
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }

      function renderDropdown() {
        const views = readViews();
        const current = currentValues();
        const hasCurrent = Object.keys(current).length > 0;
        let html = '';
        if (views.length) {
          html += '<div class="prem-views-section">Mis vistas</div>';
          views.forEach((v, i) => {
            html += `
              <div class="prem-views-item">
                <button class="prem-views-load" data-idx="${i}"><i class="fas fa-filter"></i> ${escapeAttr(v.name)}</button>
                <button class="prem-views-del" data-idx="${i}" title="Eliminar"><i class="fas fa-times"></i></button>
              </div>
            `;
          });
        } else {
          html += '<div class="prem-views-empty">Aún no hay vistas guardadas</div>';
        }
        html += '<div class="prem-views-divider"></div>';
        if (hasCurrent) {
          html += '<button class="prem-views-save"><i class="fas fa-plus"></i> Guardar filtro actual</button>';
        } else {
          html += '<div class="prem-views-hint">Aplica algún filtro para poder guardarlo.</div>';
        }
        if (views.length) {
          html += '<button class="prem-views-clear"><i class="fas fa-eraser"></i> Limpiar filtros aplicados</button>';
        }
        dropdown.innerHTML = html;

        dropdown.querySelectorAll('.prem-views-load').forEach(b => b.addEventListener('click', () => {
          const i = parseInt(b.dataset.idx, 10);
          applyValues(views[i].values);
          closeDropdown();
        }));
        dropdown.querySelectorAll('.prem-views-del').forEach(b => b.addEventListener('click', (e) => {
          e.stopPropagation();
          const i = parseInt(b.dataset.idx, 10);
          views.splice(i, 1);
          writeViews(views);
          renderDropdown();
        }));
        const saveBtn = dropdown.querySelector('.prem-views-save');
        if (saveBtn) saveBtn.addEventListener('click', () => {
          const name = prompt('Nombre para esta vista:');
          if (!name || !name.trim()) return;
          views.push({ name: name.trim().slice(0, 40), values: currentValues() });
          writeViews(views);
          renderDropdown();
        });
        const clearBtn = dropdown.querySelector('.prem-views-clear');
        if (clearBtn) clearBtn.addEventListener('click', () => {
          applyValues({});
          closeDropdown();
        });
      }

      function escapeAttr(s) {
        return String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      }

      function openDropdown()  { renderDropdown(); bar.classList.add('open'); }
      function closeDropdown() { bar.classList.remove('open'); }

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        bar.classList.contains('open') ? closeDropdown() : openDropdown();
      });
      document.addEventListener('click', (e) => {
        if (!bar.contains(e.target)) closeDropdown();
      });
    }

    document.querySelectorAll('table.data-table').forEach(attach);
    const mo = new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches?.('table.data-table')) attach(n);
        n.querySelectorAll?.('table.data-table').forEach(attach);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ═══════════════════════════════════════════════════════════
     5. BULK ACTIONS — modo selección múltiple + barra flotante
     ═══════════════════════════════════════════════════════════ */
  function initBulkActions() {
    let mode = false;
    const selected = new Set();
    let lastClickedRow = null;

    // Floating action bar
    const bar = document.createElement('div');
    bar.className = 'prem-bulk-bar';
    bar.innerHTML = `
      <div class="prem-bulk-info">
        <i class="fas fa-check-square"></i>
        <span class="prem-bulk-count">0 seleccionados</span>
      </div>
      <div class="prem-bulk-actions">
        <button type="button" class="prem-bulk-export" title="Descargar CSV"><i class="fas fa-file-csv"></i> Exportar CSV</button>
        <button type="button" class="prem-bulk-print" title="Imprimir solo lo seleccionado"><i class="fas fa-print"></i> Imprimir</button>
        <button type="button" class="prem-bulk-cancel"><i class="fas fa-times"></i> Cancelar</button>
      </div>
    `;
    document.body.appendChild(bar);

    function updateBar() {
      const n = selected.size;
      bar.classList.toggle('open', n > 0 || mode);
      bar.querySelector('.prem-bulk-count').textContent =
        n === 0 ? 'Modo selección activo · clic en filas' :
        n === 1 ? '1 seleccionado' : `${n} seleccionados`;
    }
    function clearSelection() {
      selected.forEach(tr => tr.classList.remove('prem-row-selected'));
      selected.clear();
      lastClickedRow = null;
      updateBar();
    }
    function toggleMode() {
      mode = !mode;
      document.body.classList.toggle('prem-select-mode', mode);
      if (!mode) clearSelection();
      else updateBar();
    }

    bar.querySelector('.prem-bulk-cancel').addEventListener('click', () => {
      mode = false;
      document.body.classList.remove('prem-select-mode');
      clearSelection();
    });

    bar.querySelector('.prem-bulk-export').addEventListener('click', () => {
      if (!selected.size) return;
      const rows = [...selected];
      const table = rows[0].closest('table');
      if (!table) return;
      const headers = [...table.querySelectorAll('thead tr:first-child th')]
        .filter(th => !th.classList.contains('th-actions'))
        .map(th => th.textContent.trim());
      const csv = [headers.map(csvCell).join(',')];
      rows.forEach(tr => {
        const cells = [...tr.querySelectorAll('td')]
          .filter(td => !td.classList.contains('th-actions'))
          .map(td => csvCell(td.textContent.trim()));
        csv.push(cells.join(','));
      });
      const blob = new Blob(['\uFEFF' + csv.join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.href = url; a.download = `seleccion-${ts}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    bar.querySelector('.prem-bulk-print').addEventListener('click', () => {
      if (!selected.size) return;
      // Marcar selección para que el @media print sólo muestre estas filas
      const allRows = document.querySelectorAll('table.data-table tbody tr');
      allRows.forEach(tr => tr.classList.toggle('prem-print-only', selected.has(tr)));
      document.body.classList.add('prem-print-selection');
      window.print();
      setTimeout(() => {
        document.body.classList.remove('prem-print-selection');
        allRows.forEach(tr => tr.classList.remove('prem-print-only'));
      }, 600);
    });

    function csvCell(v) {
      const s = String(v ?? '');
      return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }

    // Click en fila → toggle selección (sólo en modo selección)
    document.addEventListener('click', (e) => {
      // Atajo: shift+click activa modo + selecciona
      const isShift = e.shiftKey;
      const isCtrl  = e.ctrlKey || e.metaKey;
      if (!mode && !isShift && !isCtrl) return;

      const tr = e.target.closest('table.data-table tbody tr');
      if (!tr) return;
      // Skip rows especiales
      if (tr.classList.contains('empty-row') || tr.classList.contains('prem-skel-row')) return;
      if (tr.querySelector('td[colspan]')) return;
      // Skip clicks en botones/links/inputs
      if (e.target.closest('button, a, input, select, textarea')) return;

      e.preventDefault();
      if ((isShift || isCtrl) && !mode) {
        mode = true;
        document.body.classList.add('prem-select-mode');
      }

      if (e.shiftKey && lastClickedRow && lastClickedRow !== tr) {
        const rows = [...tr.parentElement.children];
        const i1 = rows.indexOf(lastClickedRow);
        const i2 = rows.indexOf(tr);
        const [s, ee] = i1 < i2 ? [i1, i2] : [i2, i1];
        for (let i = s; i <= ee; i++) {
          const r = rows[i];
          if (!r.classList.contains('empty-row') && !r.classList.contains('prem-skel-row')) {
            r.classList.add('prem-row-selected');
            selected.add(r);
          }
        }
      } else {
        if (selected.has(tr)) {
          tr.classList.remove('prem-row-selected');
          selected.delete(tr);
        } else {
          tr.classList.add('prem-row-selected');
          selected.add(tr);
          lastClickedRow = tr;
        }
      }
      updateBar();
    });

    document.addEventListener('keydown', (e) => {
      if (isEditing(e.target)) return;
      if (e.key === 'Escape' && (mode || selected.size > 0)) {
        mode = false;
        document.body.classList.remove('prem-select-mode');
        clearSelection();
      }
    });

    // Expose toggle (para botón en cheat sheet u otros)
    window.premBulkToggle = toggleMode;
  }

  /* ═══════════════════════════════════════════════════════════
     6. TOAST HELPER — window.premToast con Deshacer
     Uso:  premToast('Mensaje', { type:'success', actionLabel:'Deshacer', onAction: ()=>{}, duration: 6000 })
     ═══════════════════════════════════════════════════════════ */
  function initToastHelper() {
    let container = document.getElementById('prem-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'prem-toast-container';
      container.className = 'prem-toast-container';
      document.body.appendChild(container);
    }

    const ICONS = {
      success: 'fa-check-circle',
      error:   'fa-times-circle',
      warning: 'fa-exclamation-triangle',
      info:    'fa-info-circle',
    };

    window.premToast = function (message, opts = {}) {
      const type = opts.type || 'info';
      const duration = Math.max(2000, opts.duration || (opts.actionLabel ? 6000 : 3500));
      const t = document.createElement('div');
      t.className = `prem-toast prem-toast--${type}`;
      t.innerHTML = `
        <i class="fas ${ICONS[type] || ICONS.info} prem-toast-icon"></i>
        <span class="prem-toast-msg"></span>
        ${opts.actionLabel ? '<button class="prem-toast-action"></button>' : ''}
        <button class="prem-toast-close" aria-label="Cerrar"><i class="fas fa-times"></i></button>
        <div class="prem-toast-progress"></div>
      `;
      t.querySelector('.prem-toast-msg').textContent = message;
      const actionBtn = t.querySelector('.prem-toast-action');
      if (actionBtn) {
        actionBtn.textContent = opts.actionLabel;
        actionBtn.addEventListener('click', () => {
          try { opts.onAction && opts.onAction(); } finally { dismiss(); }
        });
      }
      const progress = t.querySelector('.prem-toast-progress');
      progress.style.animationDuration = duration + 'ms';

      const dismiss = () => {
        t.classList.add('prem-toast-leave');
        setTimeout(() => t.remove(), 220);
      };
      t.querySelector('.prem-toast-close').addEventListener('click', dismiss);
      const timer = setTimeout(dismiss, duration);
      t.addEventListener('mouseenter', () => clearTimeout(timer));

      container.appendChild(t);
      return { dismiss };
    };
  }

  /* ═══════════════════════════════════════════════════════════
     7. SPARKLINES DECORATIVOS en dashboard cards
     No usa data real (sería engañoso); añade un acento visual
     animado en gradient debajo del valor para sensación premium.
     ═══════════════════════════════════════════════════════════ */
  function initDashboardSparklines() {
    function attach(card) {
      if (card._sparkDone) return;
      card._sparkDone = true;
      const accent = document.createElement('div');
      accent.className = 'prem-card-accent';
      // Tres gotas animadas dan sensación de live
      accent.innerHTML = '<span></span><span></span><span></span>';
      card.appendChild(accent);
    }

    document.querySelectorAll('.dashboard-card').forEach(attach);
    const mo = new MutationObserver(muts => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.classList?.contains('dashboard-card')) attach(n);
        n.querySelectorAll?.('.dashboard-card').forEach(attach);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ═══════════════════════════════════════════════════════════
     8. DRAG-TO-REORDER columnas — con localStorage persist
     Limitación: no aplica a tablas con la primera columna .th-actions
     (no tendría sentido) y respeta el orden de filter-row para que
     los filtros sigan alineados.
     ═══════════════════════════════════════════════════════════ */
  function initColumnReorder() {
    function attach(table) {
      if (table._reorderInit || !table.id) return;
      table._reorderInit = true;
      const headerRow = table.querySelector('thead tr:first-child');
      if (!headerRow) return;

      const ths = [...headerRow.children];
      ths.forEach((th, i) => {
        if (th.classList.contains('th-actions')) return;
        th.draggable = true;
        th.dataset.colIdx = String(i);
        th.classList.add('prem-draggable-th');
      });

      // Restaurar orden guardado
      const storageKey = LS_PREFIX + 'cols:' + table.id;
      const savedOrder = readJSON(storageKey);
      if (Array.isArray(savedOrder) && savedOrder.length === ths.length) {
        applyOrder(table, savedOrder);
      }

      let dragSrc = null;
      headerRow.addEventListener('dragstart', (e) => {
        const th = e.target.closest('th');
        if (!th || !th.draggable) return;
        dragSrc = th;
        th.classList.add('prem-th-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', th.dataset.colIdx);
      });
      headerRow.addEventListener('dragend', () => {
        dragSrc?.classList.remove('prem-th-dragging');
        headerRow.querySelectorAll('th').forEach(th => th.classList.remove('prem-th-dropzone'));
        dragSrc = null;
      });
      headerRow.addEventListener('dragover', (e) => {
        const th = e.target.closest('th');
        if (!th || !dragSrc || th === dragSrc || th.classList.contains('th-actions')) return;
        e.preventDefault();
        headerRow.querySelectorAll('th').forEach(t => t.classList.remove('prem-th-dropzone'));
        th.classList.add('prem-th-dropzone');
      });
      headerRow.addEventListener('drop', (e) => {
        const th = e.target.closest('th');
        if (!th || !dragSrc || th === dragSrc) return;
        e.preventDefault();
        const fromIdx = currentIndex(headerRow, dragSrc);
        const toIdx   = currentIndex(headerRow, th);
        moveColumn(table, fromIdx, toIdx);
        // Persistir nuevo orden
        const newOrder = [...headerRow.children].map(t => parseInt(t.dataset.colIdx, 10));
        writeJSON(storageKey, newOrder);
      });
    }

    function currentIndex(parent, child) {
      return [...parent.children].indexOf(child);
    }

    function moveColumn(table, fromIdx, toIdx) {
      if (fromIdx === toIdx) return;
      const headerRow = table.querySelector('thead tr:first-child');
      const filterRow = table.querySelector('thead .filter-row');
      const rows = [headerRow, filterRow, ...table.querySelectorAll('tbody tr')].filter(Boolean);
      rows.forEach(r => {
        const cells = [...r.children];
        if (fromIdx >= cells.length || toIdx >= cells.length) return;
        const moved = cells[fromIdx];
        const target = cells[toIdx];
        if (fromIdx < toIdx) target.after(moved);
        else target.before(moved);
      });
    }

    function applyOrder(table, order) {
      const headerRow = table.querySelector('thead tr:first-child');
      const currentOrder = [...headerRow.children].map(t => parseInt(t.dataset.colIdx, 10));
      // Para cada posición destino, mover la columna correcta
      for (let i = 0; i < order.length; i++) {
        const want = order[i];
        const at = currentOrder.indexOf(want);
        if (at >= 0 && at !== i) {
          moveColumn(table, at, i);
          currentOrder.splice(i, 0, currentOrder.splice(at, 1)[0]);
        }
      }
    }

    function readJSON(k) {
      try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; }
    }
    function writeJSON(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
    }

    document.querySelectorAll('table.data-table').forEach(attach);
    const mo = new MutationObserver(muts => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches?.('table.data-table')) attach(n);
        n.querySelectorAll?.('table.data-table').forEach(attach);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ═══════════════════════════════════════════════════════════
     9. ATTACHMENTS — UI genérico para subir/listar archivos.
     Activación: agrega un div con data-prem-attach al modal:
        <div data-prem-attach data-entity-type="incidente" data-entity-id="123"></div>
     premium-ux.js detecta el div y monta el widget completo.
     ═══════════════════════════════════════════════════════════ */
  function initAttachments() {
    function attach(zone) {
      if (zone._attachInit) return;
      const entityType = zone.dataset.entityType;
      const entityId = parseInt(zone.dataset.entityId, 10);
      if (!entityType || !Number.isFinite(entityId) || entityId <= 0) return;
      zone._attachInit = true;

      zone.classList.add('prem-attach-zone');
      zone.innerHTML = `
        <div class="prem-attach-head">
          <i class="fas fa-paperclip"></i>
          <span>Archivos adjuntos</span>
          <button type="button" class="prem-attach-add" title="Agregar archivo">
            <i class="fas fa-plus"></i> Subir
          </button>
        </div>
        <div class="prem-attach-drop">
          <i class="fas fa-cloud-upload-alt"></i>
          <span>Arrastra archivos aquí o usa <strong>Subir</strong> (máx 8 MB)</span>
        </div>
        <input type="file" class="prem-attach-input" multiple style="display:none">
        <div class="prem-attach-list"></div>
      `;
      const fileInput = zone.querySelector('.prem-attach-input');
      const list      = zone.querySelector('.prem-attach-list');
      const drop      = zone.querySelector('.prem-attach-drop');

      async function refresh() {
        list.innerHTML = '<div class="prem-attach-loading">Cargando…</div>';
        try {
          const res = await fetch(`/api/attachments?entity_type=${encodeURIComponent(entityType)}&entity_id=${entityId}`, { credentials: 'same-origin' });
          const data = await res.json();
          if (!Array.isArray(data) || !data.length) {
            list.innerHTML = '<div class="prem-attach-empty">Sin archivos adjuntos</div>';
            return;
          }
          list.innerHTML = data.map(f => `
            <div class="prem-attach-item" data-id="${f.id}">
              <i class="fas ${iconFor(f.mime_type, f.filename)}"></i>
              <div class="prem-attach-meta">
                <a href="/api/attachments/${f.id}/download" target="_blank" rel="noopener" class="prem-attach-name">${escapeText(f.filename)}</a>
                <span class="prem-attach-info">${formatBytes(f.size_bytes)} · ${escapeText(f.uploaded_by_name || 'Sistema')} · ${formatDate(f.created_at)}</span>
              </div>
              <button type="button" class="prem-attach-del" title="Eliminar"><i class="fas fa-trash"></i></button>
            </div>
          `).join('');

          list.querySelectorAll('.prem-attach-del').forEach(b => b.addEventListener('click', async (e) => {
            const id = e.currentTarget.closest('.prem-attach-item').dataset.id;
            if (!confirm('¿Eliminar este archivo adjunto?')) return;
            try {
              await fetch(`/api/attachments/${id}`, { method: 'DELETE', credentials: 'same-origin' });
              if (window.premToast) window.premToast('Archivo eliminado', { type: 'success' });
              refresh();
            } catch (err) {
              if (window.premToast) window.premToast('Error al eliminar', { type: 'error' });
            }
          }));
        } catch (e) {
          list.innerHTML = '<div class="prem-attach-empty">Error al cargar adjuntos</div>';
        }
      }

      async function uploadFile(rawFile) {
        // Comprimir imagen si aplica (>1MB y es image/*)
        const file = window.premCompressImage ? await window.premCompressImage(rawFile) : rawFile;
        if (file.size > 8 * 1024 * 1024) {
          if (window.premToast) window.premToast(`"${file.name}" excede 8 MB`, { type: 'error' });
          return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const res = await fetch('/api/attachments', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({
                entity_type: entityType,
                entity_id: entityId,
                filename: file.name,
                data_url: reader.result,
              }),
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.error || 'Error al subir');
            }
            if (window.premToast) window.premToast(`"${file.name}" subido`, { type: 'success' });
            refresh();
          } catch (e) {
            if (window.premToast) window.premToast(e.message || 'Error al subir', { type: 'error' });
          }
        };
        reader.onerror = () => { if (window.premToast) window.premToast('Error al leer archivo', { type: 'error' }); };
        reader.readAsDataURL(file);
      }

      zone.querySelector('.prem-attach-add').addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => {
        for (const f of fileInput.files) uploadFile(f);
        fileInput.value = '';
      });

      // Drag & drop
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag-over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
      drop.addEventListener('drop', (e) => {
        e.preventDefault();
        drop.classList.remove('drag-over');
        for (const f of e.dataTransfer.files) uploadFile(f);
      });

      refresh();

      function iconFor(mime, name) {
        const m = (mime || '').toLowerCase();
        const ext = (name || '').split('.').pop().toLowerCase();
        if (m.startsWith('image/')) return 'fa-image';
        if (m === 'application/pdf' || ext === 'pdf') return 'fa-file-pdf';
        if (['xls', 'xlsx', 'csv'].includes(ext) || m.includes('spreadsheet')) return 'fa-file-excel';
        if (['doc', 'docx'].includes(ext) || m.includes('word')) return 'fa-file-word';
        if (['zip', 'rar', '7z'].includes(ext)) return 'fa-file-archive';
        if (m.startsWith('video/')) return 'fa-file-video';
        if (m.startsWith('audio/')) return 'fa-file-audio';
        return 'fa-file';
      }
      function formatBytes(b) {
        if (!b || b < 1024) return (b || 0) + ' B';
        if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
        return (b / 1024 / 1024).toFixed(2) + ' MB';
      }
      function formatDate(s) {
        if (!s) return '';
        try { return new Date(s.replace(' ', 'T')).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
        catch { return s; }
      }
      function escapeText(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
    }

    document.querySelectorAll('[data-prem-attach]').forEach(attach);
    const mo = new MutationObserver(muts => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches?.('[data-prem-attach]')) attach(n);
        n.querySelectorAll?.('[data-prem-attach]').forEach(attach);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ═══════════════════════════════════════════════════════════
     10. DASHBOARD WIDGET REORDER — drag para reordenar cards
     Persiste por título (textContent del .dashboard-card-title)
     en localStorage.
     ═══════════════════════════════════════════════════════════ */
  function initDashboardReorder() {
    const STORAGE_KEY = LS_PREFIX + 'dashboard-order';

    function getKey(card) {
      const t = card.querySelector('.dashboard-card-title');
      return (t?.textContent || card.id || '').trim();
    }
    function readOrder() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
      catch { return []; }
    }
    function writeOrder(order) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(order)); } catch {}
    }

    function applyOrder(grid) {
      const order = readOrder();
      if (!order.length) return;
      const cards = [...grid.querySelectorAll('.dashboard-card')];
      const byKey = new Map(cards.map(c => [getKey(c), c]));
      // Para cada key en el orden guardado, mover la card al final del grid en orden
      const moved = new Set();
      for (const key of order) {
        const c = byKey.get(key);
        if (c) { grid.appendChild(c); moved.add(key); }
      }
      // Resto al final
      for (const c of cards) {
        if (!moved.has(getKey(c))) grid.appendChild(c);
      }
    }

    function attach(grid) {
      if (grid._reorderInit) return;
      grid._reorderInit = true;

      function setupCards() {
        grid.querySelectorAll('.dashboard-card').forEach(card => {
          if (card._dragInit) return;
          card._dragInit = true;
          card.draggable = true;
          card.classList.add('prem-draggable-card');

          card.addEventListener('dragstart', (e) => {
            card.classList.add('prem-card-dragging');
            e.dataTransfer.effectAllowed = 'move';
            try { e.dataTransfer.setData('text/plain', getKey(card)); } catch (_) {}
          });
          card.addEventListener('dragend', () => {
            card.classList.remove('prem-card-dragging');
            grid.querySelectorAll('.prem-card-dropzone').forEach(c => c.classList.remove('prem-card-dropzone'));
            const order = [...grid.querySelectorAll('.dashboard-card')].map(getKey);
            writeOrder(order);
          });
        });
      }

      grid.addEventListener('dragover', (e) => {
        e.preventDefault();
        const dragging = grid.querySelector('.prem-card-dragging');
        if (!dragging) return;
        const target = e.target.closest('.dashboard-card');
        if (!target || target === dragging) return;
        grid.querySelectorAll('.prem-card-dropzone').forEach(c => c.classList.remove('prem-card-dropzone'));
        target.classList.add('prem-card-dropzone');
        const rect = target.getBoundingClientRect();
        const after = (e.clientY - rect.top) > rect.height / 2;
        if (after) target.after(dragging); else target.before(dragging);
      });

      setupCards();
      applyOrder(grid);

      // Re-aplicar cuando se agreguen cards dinámicamente
      const inner = new MutationObserver(() => { setupCards(); applyOrder(grid); });
      inner.observe(grid, { childList: true });
    }

    function init() {
      const grid = document.getElementById('dashboard-grid');
      if (grid) attach(grid);
    }
    init();
    // Si el grid se construye más tarde
    const wait = new MutationObserver(() => {
      const g = document.getElementById('dashboard-grid');
      if (g && !g._reorderInit) attach(g);
    });
    wait.observe(document.body, { childList: true, subtree: true });
  }

  /* ═══════════════════════════════════════════════════════════
     11. EXTERNAL FILTER BARS — saca los filtros FUERA de la tabla
     Clona inputs, sincroniza valores bidireccionalmente, oculta el
     filter-row original. app.js sigue encontrando los originales con
     tbl.querySelectorAll('.filter-row .filter-input').
     ═══════════════════════════════════════════════════════════ */
  function initExternalFilters() {
    function attach(table) {
      if (table._extFiltersDone) return;
      const filterRow = table.querySelector('thead .filter-row');
      if (!filterRow) return;
      const wrap = table.closest('.table-wrap, .md-table-wrap');
      if (!wrap) return;
      table._extFiltersDone = true;

      const bar = document.createElement('div');
      bar.className = 'prem-ext-filter-bar';
      bar.innerHTML = `
        <div class="prem-ext-filter-head">
          <i class="fas fa-filter"></i>
          <span>Filtros</span>
          <button type="button" class="prem-ext-filter-clear" title="Limpiar todos los filtros">
            <i class="fas fa-eraser"></i> Limpiar
          </button>
        </div>
        <div class="prem-ext-filter-fields"></div>
      `;
      const fieldsWrap = bar.querySelector('.prem-ext-filter-fields');
      const ths = [...table.querySelectorAll('thead tr:first-child th')];
      const tds = [...filterRow.querySelectorAll('td')];

      // Pares (orig, clone) para sincronización bidireccional
      const pairs = [];

      tds.forEach((td, idx) => {
        if (td.classList.contains('th-actions')) return;
        const inputs = [...td.querySelectorAll('input, select, textarea')];
        if (!inputs.length) return;

        const th = ths[idx];
        const colLabel = th ? (th.textContent || '').trim() : '';

        const field = document.createElement('div');
        field.className = 'prem-ext-filter-field';
        if (colLabel) {
          const lbl = document.createElement('label');
          lbl.className = 'prem-ext-filter-field-label';
          lbl.textContent = colLabel;
          field.appendChild(lbl);
        }

        inputs.forEach(orig => {
          const clone = orig.cloneNode(true);
          clone.removeAttribute('id');
          clone.classList.add('prem-ext-clone');

          clone.addEventListener('input', () => {
            if (orig.value !== clone.value) {
              orig.value = clone.value;
              orig.dispatchEvent(new Event('input', { bubbles: true }));
            }
          });
          clone.addEventListener('change', () => {
            if (orig.value !== clone.value) {
              orig.value = clone.value;
              orig.dispatchEvent(new Event('change', { bubbles: true }));
            }
          });
          // Enter en el clone dispara keydown sobre el original (app.js lo escucha)
          clone.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              orig.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            }
          });

          pairs.push({ orig, clone });
          field.appendChild(clone);
        });

        fieldsWrap.appendChild(field);
      });

      // Botón limpiar — vacía clones + originales + dispara eventos
      bar.querySelector('.prem-ext-filter-clear').addEventListener('click', () => {
        pairs.forEach(({ orig, clone }) => {
          clone.value = '';
          orig.value = '';
          orig.dispatchEvent(new Event('input', { bubbles: true }));
          orig.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });

      // Esconder filter-row original (sigue en DOM para app.js)
      filterRow.classList.add('prem-filter-row-hidden');

      // Insertar barra antes del table-wrap
      wrap.insertAdjacentElement('beforebegin', bar);

      // Sync original → clone (cuando app.js limpia filtros sin disparar evento)
      const syncInterval = setInterval(() => {
        if (!table.isConnected) { clearInterval(syncInterval); return; }
        for (const { orig, clone } of pairs) {
          if (document.activeElement === clone) continue;
          if (clone.value !== orig.value) clone.value = orig.value;
        }
      }, 800);
    }

    document.querySelectorAll('table.data-table').forEach(attach);
    const mo = new MutationObserver(muts => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches?.('table.data-table')) attach(n);
        n.querySelectorAll?.('table.data-table').forEach(attach);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ═══════════════════════════════════════════════════════════
     12. RIPPLE EFFECT — Material-style en todos los botones
     ═══════════════════════════════════════════════════════════ */
  function initRippleEffect() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn, button, .tab');
      if (!btn) return;
      if (btn.disabled) return;
      // No ripples en botones de sidebar collapsed (ya tienen tooltip)
      if (btn.closest('.prem-cmdk, .prem-shortcuts')) return;

      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const ripple = document.createElement('span');
      ripple.className = 'prem-ripple';
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
      ripple.style.top  = (e.clientY - rect.top  - size / 2) + 'px';

      // Si el btn tiene color oscuro, ripple oscuro. Si es claro, ripple blanco.
      const bg = getComputedStyle(btn).backgroundColor;
      const match = bg.match(/\d+/g);
      if (match) {
        const [r, g, b] = match.map(Number);
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        if (lum > 0.7) ripple.style.background = 'rgba(15,23,42,.14)';
      }

      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 650);
    }, true);
  }

  /* ═══════════════════════════════════════════════════════════
     13. SIDEBAR COLLAPSE TOOLTIPS — agrega title si falta
     ═══════════════════════════════════════════════════════════ */
  function initSidebarTooltips() {
    function ensureTitles() {
      document.querySelectorAll('.tabs.tabs--rail .tab').forEach(tab => {
        if (!tab.getAttribute('title')) {
          // Extrae texto del tab (sin el icono)
          const text = [...tab.childNodes]
            .filter(n => n.nodeType === 3)
            .map(n => n.textContent.trim())
            .filter(Boolean)
            .join(' ');
          if (text) tab.setAttribute('title', text);
        }
      });
    }
    ensureTitles();
    const mo = new MutationObserver(ensureTitles);
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ═══════════════════════════════════════════════════════════
     14. PREMIUM TOOLTIPS — migra cualquier [title] a [data-prem-tooltip]
     Excluye sidebar tabs (que ya tienen su propio tooltip CSS)
     ═══════════════════════════════════════════════════════════ */
  function initPremiumTooltips() {
    function migrate(root) {
      const els = (root.querySelectorAll
        ? root.querySelectorAll('[title]:not([data-prem-tooltip])')
        : []);
      els.forEach(el => {
        // Saltar tabs de sidebar (CSS ya maneja su tooltip)
        if (el.closest('.tabs.tabs--rail')) return;
        // Saltar elementos cuyo title está vacío
        const t = el.getAttribute('title');
        if (!t || !t.trim()) return;
        el.setAttribute('data-prem-tooltip', t.trim().slice(0, 120));
        el.removeAttribute('title');
      });
    }
    migrate(document);
    const mo = new MutationObserver(muts => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType === 1) migrate(n);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ═══════════════════════════════════════════════════════════
     15. ARIA AUTO-LABELS + COLOR CLASS por icono detectado
     Mapea icono → label en español + clase prem-action-X que pinta
     el botón con el color semántico (view azul, edit teal, delete rojo)
     ═══════════════════════════════════════════════════════════ */
  function initAriaLabels() {
    /* [iconClass, label, actionClass]  */
    const ICON_MAP = [
      ['fa-eye',          'Ver detalles',   'view'],
      ['fa-eye-slash',    'Ocultar',         'view'],
      ['fa-edit',         'Editar',          'edit'],
      ['fa-pen',          'Editar',          'edit'],
      ['fa-pen-to-square','Editar',          'edit'],
      ['fa-pencil',       'Editar',          'edit'],
      ['fa-pencil-alt',   'Editar',          'edit'],
      ['fa-trash',        'Eliminar',        'delete'],
      ['fa-trash-alt',    'Eliminar',        'delete'],
      ['fa-trash-can',    'Eliminar',        'delete'],
      ['fa-times',        'Cerrar',          'delete'],
      ['fa-xmark',        'Cerrar',          'delete'],
      ['fa-ban',          'Cancelar',        'delete'],
      ['fa-clone',        'Duplicar',        'duplicate'],
      ['fa-copy',         'Copiar',          'duplicate'],
      ['fa-files',        'Duplicar',        'duplicate'],
      ['fa-print',        'Imprimir',        'print'],
      ['fa-file-pdf',     'PDF',             'pdf'],
      ['fa-file-csv',     'Exportar CSV',    'pdf'],
      ['fa-file-excel',   'Exportar Excel',  'pdf'],
      ['fa-download',     'Descargar',       'pdf'],
      ['fa-envelope',     'Enviar correo',   'mail'],
      ['fa-paper-plane',  'Enviar',          'mail'],
      ['fa-check',        'Confirmar',       'check'],
      ['fa-check-circle', 'Confirmar',       'check'],
      ['fa-link',         'Vincular',        'link'],
      ['fa-unlink',       'Desvincular',     'link'],
      ['fa-share',        'Compartir',       'link'],
      ['fa-history',      'Historial',       'view'],
      ['fa-clock-rotate-left', 'Historial',  'view'],
      ['fa-info-circle',  'Información',     'view'],
      ['fa-cog',          'Configurar',      'edit'],
      ['fa-gear',         'Configurar',      'edit'],
      ['fa-plus',         'Agregar',         'check'],
      ['fa-undo',         'Deshacer',        'duplicate'],
      ['fa-sync',         'Actualizar',      'view'],
      ['fa-sync-alt',     'Actualizar',      'view'],
    ];
    function processBtn(btn) {
      if (btn._premLabeled) return;
      const i = btn.querySelector('i');
      if (!i) return;
      for (const [iconCls, label, action] of ICON_MAP) {
        if (i.classList.contains(iconCls)) {
          if (!btn.getAttribute('aria-label') && (btn.textContent || '').trim().length <= 1) {
            btn.setAttribute('aria-label', label);
          }
          if (!btn.getAttribute('data-prem-tooltip') && !btn.getAttribute('title')) {
            btn.setAttribute('data-prem-tooltip', label);
          }
          // Aplicar clase de color semántico (sólo si está en una th-actions)
          if (btn.closest('td.th-actions, .th-actions') && !btn.classList.contains('outline')) {
            btn.classList.add('prem-action-' + action);
          }
          btn._premLabeled = true;
          return;
        }
      }
    }
    function processInput(el) {
      if (el._premLabeled) return;
      if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button') { el._premLabeled = true; return; }
      if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) { el._premLabeled = true; return; }
      if (el.id) {
        const lbl = document.querySelector('label[for="' + el.id + '"]');
        if (lbl && (lbl.textContent || '').trim()) { el._premLabeled = true; return; }
      }
      if (el.closest && el.closest('label')) { el._premLabeled = true; return; }
      const fromAttr = (el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('data-prem-tooltip') || '').trim();
      if (fromAttr) {
        el.setAttribute('aria-label', fromAttr);
        el._premLabeled = true;
      }
    }
    function scan(root) {
      if (!root.querySelectorAll) return;
      root.querySelectorAll('table.data-table td.th-actions button, table.data-table td.th-actions .btn, .th-actions button, .th-actions .btn').forEach(processBtn);
      root.querySelectorAll('input, select, textarea').forEach(processInput);
    }
    scan(document);
    const mo = new MutationObserver(muts => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType === 1) scan(n);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ═══════════════════════════════════════════════════════════
     16. ROW CLICK HIGHLIGHT — pulso azul al click de fila
     ═══════════════════════════════════════════════════════════ */
  function initRowClickHighlight() {
    document.addEventListener('click', (e) => {
      // Skip si está activo modo selección bulk (ya tiene su highlight)
      if (document.body.classList.contains('prem-select-mode')) return;
      const tr = e.target.closest('table.data-table tbody tr');
      if (!tr) return;
      // Skip cuando se hace click en botones/links/inputs (no es un click de fila)
      if (e.target.closest('button, a, input, select, textarea, label')) return;
      tr.classList.remove('prem-row-clicked');
      // Force reflow para reiniciar la animación
      void tr.offsetWidth;
      tr.classList.add('prem-row-clicked');
      setTimeout(() => tr.classList.remove('prem-row-clicked'), 700);
    });
  }

  /* ═══════════════════════════════════════════════════════════
     17. IMAGE COMPRESSION en upload de attachments
     Si el archivo es imagen >1MB, redimensiona a max 1600px y
     re-encoda como JPEG calidad .85 antes de enviar.
     Hook: intercepta FileReader.readAsDataURL en attachments.
     ═══════════════════════════════════════════════════════════ */
  function compressImage(file, maxDim = 1600, quality = 0.85) {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/')) return resolve(file);
      if (file.size < 1024 * 1024 && !/heic|tiff/i.test(file.type)) return resolve(file);

      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (Math.max(width, height) > maxDim) {
            const ratio = maxDim / Math.max(width, height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (!blob) return resolve(file);
            // Si la "comprimida" salió más grande, devolver original
            if (blob.size >= file.size) return resolve(file);
            const out = new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
            resolve(out);
          }, 'image/jpeg', quality);
        };
        img.onerror = () => resolve(file);
        img.src = reader.result;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  }
  // Expone para que initAttachments y otros lo usen
  window.premCompressImage = compressImage;

  /* ═══════════════════════════════════════════════════════════
     18. SKIP-TO-CONTENT LINK (a11y)
     ═══════════════════════════════════════════════════════════ */
  function initSkipLink() {
    if (document.querySelector('.prem-skip-link')) return;
    const link = document.createElement('a');
    link.className = 'prem-skip-link';
    link.href = '#main-content';
    link.textContent = 'Ir al contenido principal';
    document.body.insertBefore(link, document.body.firstChild);
    // Asegurar que existe el target
    const main = document.querySelector('.app-main, main, #app-main');
    if (main && !main.id) main.id = 'main-content';
  }

  /* ═══════════════════════════════════════════════════════════
     19. CONFETTI — celebración inline (sin dependencias)
     window.premConfetti({ duration: 2500, colors: [...], particles: 80 })
     ═══════════════════════════════════════════════════════════ */
  function initConfettiHelper() {
    window.premConfetti = function (opts = {}) {
      const duration = opts.duration ?? 2200;
      const particles = opts.particles ?? 90;
      const colors = opts.colors ?? ['#2563eb', '#0d9488', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981'];
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:10000';
      canvas.width = innerWidth;
      canvas.height = innerHeight;
      document.body.appendChild(canvas);
      const ctx = canvas.getContext('2d');

      const P = Array.from({ length: particles }, () => ({
        x: innerWidth / 2 + (Math.random() - 0.5) * 180,
        y: innerHeight * 0.35 + (Math.random() - 0.5) * 40,
        vx: (Math.random() - 0.5) * 12,
        vy: Math.random() * -14 - 4,
        g: 0.35,
        s: Math.random() * 6 + 3,
        r: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.3,
        c: colors[Math.floor(Math.random() * colors.length)],
        shape: Math.random() < 0.4 ? 'rect' : 'circle',
        alpha: 1,
      }));

      const t0 = performance.now();
      function frame(now) {
        const elapsed = now - t0;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const p of P) {
          p.vy += p.g;
          p.x += p.vx;
          p.y += p.vy;
          p.r += p.vr;
          p.alpha = Math.max(0, 1 - elapsed / duration);
          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.r);
          ctx.fillStyle = p.c;
          if (p.shape === 'rect') ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
          else { ctx.beginPath(); ctx.arc(0, 0, p.s / 2, 0, Math.PI * 2); ctx.fill(); }
          ctx.restore();
        }
        if (elapsed < duration) requestAnimationFrame(frame);
        else canvas.remove();
      }
      requestAnimationFrame(frame);
    };
  }

  /* ═══════════════════════════════════════════════════════════
     20. DASHBOARD VALUE PULSE — pulso visual cuando cambia .dash-value
     ═══════════════════════════════════════════════════════════ */
  function initDashboardPulse() {
    const tracked = new WeakMap();
    function watch(el) {
      if (tracked.has(el)) return;
      tracked.set(el, el.textContent);
      const mo = new MutationObserver(() => {
        const prev = tracked.get(el);
        const now = el.textContent;
        if (prev !== now && now.trim()) {
          el.classList.remove('prem-value-pulse');
          void el.offsetWidth;
          el.classList.add('prem-value-pulse');
          tracked.set(el, now);
        }
      });
      mo.observe(el, { childList: true, characterData: true, subtree: true });
    }
    function scan() {
      document.querySelectorAll('.dash-value, .dashboard-card-value').forEach(watch);
    }
    scan();
    const outer = new MutationObserver(scan);
    outer.observe(document.body, { childList: true, subtree: true });
  }

  /* ═══════════════════════════════════════════════════════════
     21. AVATAR EN HEADER — círculo con inicial del usuario
     Intenta leer window.currentUser o /api/auth/me. Inyecta avatar
     redondo con inicial y color por hash del username.
     ═══════════════════════════════════════════════════════════ */
  function initUserAvatar() {
    async function load() {
      try {
        let name = window.currentUser?.display_name || window.currentUser?.username;
        if (!name) {
          const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
          if (res.ok) {
            const d = await res.json();
            name = d.display_name || d.username || d.user?.username;
          }
        }
        if (!name) return;
        inject(name);
      } catch { /* silencioso */ }
    }
    function colorFromString(s) {
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
      const hue = Math.abs(h) % 360;
      return `hsl(${hue}, 55%, 46%)`;
    }
    function inject(name) {
      if (document.querySelector('.prem-user-avatar')) return;
      const initial = (name.trim()[0] || 'U').toUpperCase();
      const avatar = document.createElement('div');
      avatar.className = 'prem-user-avatar';
      avatar.setAttribute('data-prem-tooltip', name);
      avatar.setAttribute('data-prem-tooltip-pos', 'bottom');
      avatar.style.background = `linear-gradient(135deg, ${colorFromString(name)}, ${colorFromString(name + 'x')})`;
      avatar.textContent = initial;

      const header = document.querySelector('header.header, header.app-header, .app-header, .header');
      if (!header) return;
      header.appendChild(avatar);
    }
    load();
  }

  /* ═══════════════════════════════════════════════════════════
     22. PRINT-PREVIEW BUTTON — botón "Imprimir tabla" en cada tabla
     ═══════════════════════════════════════════════════════════ */
  function initPrintButtons() {
    function attach(wrap) {
      if (wrap._printBtn) return;
      if (!wrap.querySelector('table.data-table')) return;
      wrap._printBtn = true;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'prem-print-btn';
      btn.setAttribute('data-prem-tooltip', 'Imprimir / PDF de esta tabla');
      btn.innerHTML = '<i class="fas fa-print"></i>';

      btn.addEventListener('click', () => {
        document.body.classList.add('prem-printing-table');
        wrap.classList.add('prem-print-target');
        window.print();
        setTimeout(() => {
          document.body.classList.remove('prem-printing-table');
          wrap.classList.remove('prem-print-target');
        }, 600);
      });

      // Insertar en la barra de vistas si existe, si no, flotante arriba-derecha del wrap
      const viewsBar = wrap.previousElementSibling?.classList?.contains('prem-views-bar') ? wrap.previousElementSibling : null;
      if (viewsBar) {
        viewsBar.insertBefore(btn, viewsBar.firstChild);
      } else {
        btn.classList.add('prem-print-btn--floating');
        wrap.style.position = 'relative';
        wrap.appendChild(btn);
      }
    }
    document.querySelectorAll('.table-wrap, .md-table-wrap').forEach(attach);
    const mo = new MutationObserver(muts => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches?.('.table-wrap, .md-table-wrap')) attach(n);
        n.querySelectorAll?.('.table-wrap, .md-table-wrap').forEach(attach);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ═══════════════════════════════════════════════════════════
     23. SWIPE-TO-ACTION en mobile (filas de tabla)
     Swipe left sobre una fila → muestra botones de acción.
     Tap afuera → cierra.
     ═══════════════════════════════════════════════════════════ */
  function initSwipeActions() {
    if (!('ontouchstart' in window)) return;
    let activeRow = null;

    document.addEventListener('touchstart', (e) => {
      const tr = e.target.closest('table.data-table tbody tr');
      if (!tr || tr.classList.contains('prem-skel-row') || tr.classList.contains('empty-row')) return;
      tr._touchStartX = e.touches[0].clientX;
      tr._touchStartY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      const tr = e.target.closest('table.data-table tbody tr');
      if (!tr || tr._touchStartX == null) return;
      const dx = e.touches[0].clientX - tr._touchStartX;
      const dy = Math.abs(e.touches[0].clientY - tr._touchStartY);
      if (dy > 15) return; // scroll vertical
      if (dx < -40) {
        if (activeRow && activeRow !== tr) activeRow.classList.remove('prem-row-swiped');
        tr.classList.add('prem-row-swiped');
        activeRow = tr;
      } else if (dx > 20) {
        tr.classList.remove('prem-row-swiped');
        if (activeRow === tr) activeRow = null;
      }
    }, { passive: true });

    document.addEventListener('touchend', () => {
      document.querySelectorAll('table.data-table tbody tr').forEach(tr => {
        tr._touchStartX = null;
      });
    }, { passive: true });

    document.addEventListener('click', (e) => {
      if (!activeRow) return;
      if (!e.target.closest('table.data-table tbody tr.prem-row-swiped')) {
        activeRow.classList.remove('prem-row-swiped');
        activeRow = null;
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════
     24. AUTO-ATTACH ATTACHMENTS a modales con entity detectable
     Detecta modales que app.js abre con data-entity-id / data-entity-type
     o con un campo oculto "cotizacion_id" / "incidente_id" / etc.
     ═══════════════════════════════════════════════════════════ */
  function initAutoAttachments() {
    const ENTITY_FIELD_MAP = {
      'cotizacion_id': 'cotizacion',
      'incidente_id': 'incidente',
      'cliente_id': 'cliente',
      'maquina_id': 'maquina',
      'reporte_id': 'reporte',
      'garantia_id': 'garantia',
      'mantenimiento_id': 'mantenimiento',
      'refaccion_id': 'refaccion',
    };

    function tryInject(modal) {
      if (modal._attachAttempted) return;
      modal._attachAttempted = true;

      // 1. Si el modal tiene data-entity-type y data-entity-id directamente
      let type = modal.dataset.entityType;
      let id = modal.dataset.entityId;

      // 2. Buscar en hidden inputs por id conocido
      if (!type || !id) {
        for (const [field, t] of Object.entries(ENTITY_FIELD_MAP)) {
          const inp = modal.querySelector(`input[name="${field}"], input#${field}, [data-${field}]`);
          if (inp) {
            const v = inp.value || inp.dataset[field];
            if (v && Number(v) > 0) { type = t; id = v; break; }
          }
        }
      }

      // 3. Buscar en attribute "data-cotizacion-id" o similar
      if (!type || !id) {
        for (const [field, t] of Object.entries(ENTITY_FIELD_MAP)) {
          const dataKey = field.replace('_id', '-id');
          const attr = modal.querySelector(`[data-${dataKey}]`);
          if (attr) {
            const v = attr.getAttribute(`data-${dataKey}`);
            if (v && Number(v) > 0) { type = t; id = v; break; }
          }
        }
      }

      if (!type || !id || Number(id) <= 0) return;
      if (modal.querySelector('[data-prem-attach]')) return;

      const zone = document.createElement('div');
      zone.setAttribute('data-prem-attach', '');
      zone.dataset.entityType = type;
      zone.dataset.entityId = String(id);

      // Insertar al final del modal body si existe, si no al final del modal
      const body = modal.querySelector('.modal-body, .md-modal-body, form');
      (body || modal).appendChild(zone);
    }

    function scan() {
      document.querySelectorAll('.modal-dialog.active, .md-modal-panel.active, .modal.show, [role="dialog"]:not([aria-hidden="true"])')
        .forEach(tryInject);
    }
    scan();
    const mo = new MutationObserver(() => { scan(); });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-hidden'] });
  }

  /* ═══════════════════════════════════════════════════════════
     25. PULL-TO-REFRESH (mobile)
     Gesto down desde top: muestra spinner, dispara click en el botón
     de refresh activo (search por #*-refresh, .btn-refresh, etc.)
     ═══════════════════════════════════════════════════════════ */
  function initPullToRefresh() {
    if (!('ontouchstart' in window)) return;

    const indicator = document.createElement('div');
    indicator.className = 'prem-ptr-indicator';
    indicator.innerHTML = '<i class="fas fa-arrow-down"></i><span>Suelta para actualizar</span>';
    document.body.appendChild(indicator);

    let startY = 0;
    let pulling = false;
    let triggered = false;
    const THRESHOLD = 80;

    document.addEventListener('touchstart', (e) => {
      if (window.scrollY > 8) return;
      const target = e.target.closest('.app-main, .panel, body');
      if (!target) return;
      startY = e.touches[0].clientY;
      pulling = true;
      triggered = false;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (!pulling) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) return;
      if (window.scrollY > 8) { pulling = false; indicator.style.transform = 'translateY(-100%)'; return; }
      const pull = Math.min(dy * 0.5, 120);
      indicator.style.transform = `translateY(${pull - 60}px)`;
      indicator.classList.toggle('prem-ptr-ready', pull >= THRESHOLD);
      if (pull >= THRESHOLD) triggered = true;
    }, { passive: true });

    document.addEventListener('touchend', () => {
      if (!pulling) return;
      pulling = false;
      if (triggered) {
        indicator.classList.add('prem-ptr-loading');
        indicator.querySelector('span').textContent = 'Actualizando…';
        // Buscar botón de refresh del panel activo
        const panel = document.querySelector('.panel.active');
        const refreshBtn = panel?.querySelector('#dashboard-refresh, [id$="-refresh"], .btn-refresh, .btn-actualizar')
          || document.querySelector('#dashboard-refresh');
        if (refreshBtn) refreshBtn.click();
        else location.reload();
        setTimeout(() => {
          indicator.style.transform = 'translateY(-100%)';
          indicator.classList.remove('prem-ptr-loading', 'prem-ptr-ready');
          indicator.querySelector('span').textContent = 'Suelta para actualizar';
        }, 800);
      } else {
        indicator.style.transform = 'translateY(-100%)';
        indicator.classList.remove('prem-ptr-ready');
      }
    }, { passive: true });
  }

  /* ═══════════════════════════════════════════════════════════
     26. PWA INSTALL PROMPT — custom UI con beforeinstallprompt
     ═══════════════════════════════════════════════════════════ */
  function initPWAInstall() {
    let deferredPrompt = null;
    const dismissedKey = LS_PREFIX + 'pwa-install-dismissed';
    if (localStorage.getItem(dismissedKey)) return;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      showBanner();
    });

    function showBanner() {
      if (document.querySelector('.prem-pwa-banner')) return;
      const banner = document.createElement('div');
      banner.className = 'prem-pwa-banner';
      banner.innerHTML = `
        <div class="prem-pwa-icon"><i class="fas fa-mobile-alt"></i></div>
        <div class="prem-pwa-text">
          <strong>Instalar app</strong>
          <span>Acceso rápido y modo offline</span>
        </div>
        <button class="prem-pwa-install">Instalar</button>
        <button class="prem-pwa-dismiss" aria-label="Cerrar"><i class="fas fa-times"></i></button>
      `;
      document.body.appendChild(banner);

      banner.querySelector('.prem-pwa-install').addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted' && window.premToast) window.premToast('App instalada', { type: 'success' });
        deferredPrompt = null;
        banner.remove();
      });
      banner.querySelector('.prem-pwa-dismiss').addEventListener('click', () => {
        try { localStorage.setItem(dismissedKey, '1'); } catch {}
        banner.remove();
      });
    }
  }

  /* ═══════════════════════════════════════════════════════════
     27. AUDIT LOG VIEWER — botón "Historial" en cada fila + modal
     timeline. Usa /api/audit/:type/:id (backend ya existe).
     Activación: row context menu (right-click) o tecla "h" sobre fila.
     ═══════════════════════════════════════════════════════════ */
  function initAuditViewer() {
    // Modal único reusable
    const modal = document.createElement('div');
    modal.className = 'prem-audit-modal';
    modal.innerHTML = `
      <div class="prem-audit-backdrop"></div>
      <div class="prem-audit-panel" role="dialog" aria-label="Historial de cambios">
        <div class="prem-audit-head">
          <h2><i class="fas fa-history"></i> Historial de cambios</h2>
          <button class="prem-audit-close" aria-label="Cerrar"><i class="fas fa-times"></i></button>
        </div>
        <div class="prem-audit-body"><div class="prem-audit-loading">Cargando…</div></div>
      </div>
    `;
    document.body.appendChild(modal);

    function close() { modal.classList.remove('open'); }
    modal.querySelector('.prem-audit-backdrop').addEventListener('click', close);
    modal.querySelector('.prem-audit-close').addEventListener('click', close);

    async function open(entityType, entityId) {
      const body = modal.querySelector('.prem-audit-body');
      body.innerHTML = '<div class="prem-audit-loading"><div class="loading-spinner"></div><span>Cargando historial…</span></div>';
      modal.classList.add('open');
      try {
        const res = await fetch(`/api/audit/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`, { credentials: 'same-origin' });
        const rows = await res.json();
        if (!Array.isArray(rows) || !rows.length) {
          body.innerHTML = '<div class="prem-audit-empty"><i class="fas fa-inbox"></i><span>Sin cambios registrados</span></div>';
          return;
        }
        body.innerHTML = '<div class="prem-audit-timeline">' + rows.map(r => renderEntry(r)).join('') + '</div>';
      } catch (e) {
        body.innerHTML = `<div class="prem-audit-empty"><i class="fas fa-exclamation-triangle"></i><span>Error: ${(e.message || '').slice(0, 80)}</span></div>`;
      }
    }
    window.premAuditOpen = open;

    function renderEntry(r) {
      const icon = { POST: 'fa-plus', PUT: 'fa-pen', PATCH: 'fa-pen', DELETE: 'fa-trash', GET: 'fa-eye' }[r.method] || 'fa-circle';
      const color = { POST: '#10b981', PUT: '#2563eb', PATCH: '#2563eb', DELETE: '#ef4444', GET: '#64748b' }[r.method] || '#64748b';
      const date = formatAuditDate(r.creado_en);
      let diffHtml = '';
      if (r.diff_json) {
        try {
          const diff = JSON.parse(r.diff_json);
          const keys = Object.keys(diff || {});
          if (keys.length) {
            diffHtml = '<ul class="prem-audit-diff">' + keys.map(k => `
              <li><b>${escapeText(k)}:</b>
                <span class="prem-audit-from">${escapeText(String(diff[k].from ?? '∅'))}</span>
                <i class="fas fa-arrow-right"></i>
                <span class="prem-audit-to">${escapeText(String(diff[k].to ?? '∅'))}</span>
              </li>`).join('') + '</ul>';
          }
        } catch {}
      }
      return `
        <div class="prem-audit-entry">
          <div class="prem-audit-dot" style="background:${color}"><i class="fas ${icon}"></i></div>
          <div class="prem-audit-content">
            <div class="prem-audit-meta">
              <strong>${escapeText(r.username || 'sistema')}</strong>
              <span>${escapeText(r.method)} ${escapeText(r.path)}</span>
              <time>${date}</time>
            </div>
            ${r.detail ? `<div class="prem-audit-detail">${escapeText(r.detail.slice(0, 200))}</div>` : ''}
            ${diffHtml}
          </div>
        </div>
      `;
    }

    function formatAuditDate(s) {
      if (!s) return '';
      try { return new Date(s.replace(' ', 'T')).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }); }
      catch { return s; }
    }
    function escapeText(t) { const d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }

    // Right-click en fila → menu con "Historial" si la tabla mapea a un entity_type
    const TABLE_ENTITY_MAP = {
      'tabla-clientes':       'cliente',
      'tabla-cotizaciones':   'cotizacion',
      'tabla-incidentes':     'incidente',
      'tabla-maquinas':       'maquina',
      'tabla-refacciones':    'refaccion',
      'tabla-reportes':       'reporte',
      'tabla-garantias':      'garantia',
      'tabla-mantenimientos': 'mantenimiento',
    };

    document.addEventListener('contextmenu', (e) => {
      const tr = e.target.closest('table.data-table tbody tr');
      if (!tr) return;
      const table = tr.closest('table');
      const type = TABLE_ENTITY_MAP[table?.id];
      if (!type) return;
      // Buscar id en data-id, data-row-id o primera celda numérica
      const id = tr.dataset.id || tr.dataset.rowId
        || (tr.querySelector('td:first-child')?.textContent.trim().match(/^\d+$/) ? tr.querySelector('td:first-child').textContent.trim() : null);
      if (!id) return;
      e.preventDefault();
      open(type, id);
    });

    // Tecla "h" sobre fila → historial
    document.addEventListener('keydown', (e) => {
      if (isEditing(e.target)) return;
      if (e.key !== 'h' && e.key !== 'H') return;
      const tr = document.querySelector('table.data-table tbody tr:hover');
      if (!tr) return;
      const table = tr.closest('table');
      const type = TABLE_ENTITY_MAP[table?.id];
      if (!type) return;
      const id = tr.dataset.id || tr.dataset.rowId
        || (tr.querySelector('td:first-child')?.textContent.trim().match(/^\d+$/) ? tr.querySelector('td:first-child').textContent.trim() : null);
      if (!id) return;
      e.preventDefault();
      open(type, id);
    });
  }

  /* ═══════════════════════════════════════════════════════════
     28. WEBHOOKS MANAGEMENT — modal CRUD accesible via Cmd+K "/webhooks"
     ═══════════════════════════════════════════════════════════ */
  function initWebhooksUI() {
    const EVENTS = [
      ['incidente.creado', 'Nuevo incidente'],
      ['incidente.cerrado', 'Incidente cerrado'],
      ['cotizacion.creada', 'Nueva cotización'],
      ['cotizacion.aprobada', 'Cotización aprobada'],
      ['reporte.creado', 'Nuevo reporte'],
      ['reporte.finalizado', 'Reporte finalizado'],
      ['stock.critico', 'Stock crítico'],
    ];
    const TYPES = [['slack', 'Slack'], ['discord', 'Discord'], ['teams', 'Teams'], ['generic', 'Genérico (JSON)']];

    const modal = document.createElement('div');
    modal.className = 'prem-webhooks-modal';
    modal.innerHTML = `
      <div class="prem-webhooks-backdrop"></div>
      <div class="prem-webhooks-panel" role="dialog" aria-label="Webhooks">
        <div class="prem-webhooks-head">
          <h2><i class="fas fa-bolt"></i> Webhooks · Notificaciones salientes</h2>
          <button class="prem-webhooks-close" aria-label="Cerrar"><i class="fas fa-times"></i></button>
        </div>
        <div class="prem-webhooks-body"></div>
      </div>
    `;
    document.body.appendChild(modal);

    function close() { modal.classList.remove('open'); }
    modal.querySelector('.prem-webhooks-backdrop').addEventListener('click', close);
    modal.querySelector('.prem-webhooks-close').addEventListener('click', close);

    async function refresh() {
      const body = modal.querySelector('.prem-webhooks-body');
      body.innerHTML = '<div class="prem-audit-loading"><div class="loading-spinner"></div></div>';
      try {
        const res = await fetch('/api/webhooks', { credentials: 'same-origin' });
        const list = await res.json();
        body.innerHTML = renderList(list || []) + renderForm();
        wireUp();
      } catch (e) {
        body.innerHTML = `<div class="prem-audit-empty"><i class="fas fa-exclamation-triangle"></i><span>${e.message}</span></div>`;
      }
    }

    function renderList(list) {
      if (!list.length) return '<div class="prem-webhooks-empty"><i class="fas fa-inbox"></i><p>No hay webhooks configurados</p></div>';
      return '<div class="prem-webhooks-list">' + list.map(w => {
        const evts = (() => { try { return JSON.parse(w.eventos || '[]'); } catch { return []; } })();
        const lastStatus = w.ultimo_status ? `<span class="prem-wh-status ${w.ultimo_status >= 200 && w.ultimo_status < 300 ? 'ok' : 'bad'}">HTTP ${w.ultimo_status}</span>` : '';
        return `
          <div class="prem-webhook-card ${w.activo ? '' : 'inactive'}" data-id="${w.id}">
            <div class="prem-webhook-row">
              <div class="prem-webhook-info">
                <strong>${escapeText(w.nombre)}</strong>
                <span class="prem-webhook-type prem-wh-type-${w.tipo}">${w.tipo}</span>
                ${lastStatus}
                ${w.activo ? '<span class="prem-wh-status ok">activo</span>' : '<span class="prem-wh-status off">inactivo</span>'}
              </div>
              <div class="prem-webhook-actions">
                <button class="prem-wh-test" title="Probar"><i class="fas fa-paper-plane"></i></button>
                <button class="prem-wh-toggle" title="${w.activo ? 'Desactivar' : 'Activar'}"><i class="fas fa-${w.activo ? 'pause' : 'play'}"></i></button>
                <button class="prem-wh-del" title="Eliminar"><i class="fas fa-trash"></i></button>
              </div>
            </div>
            <div class="prem-webhook-url">${escapeText(w.url)}</div>
            <div class="prem-webhook-events">${evts.map(e => `<span class="prem-wh-evt">${e}</span>`).join('') || '<i>sin eventos</i>'}</div>
            ${w.ultimo_error ? `<div class="prem-webhook-error"><i class="fas fa-exclamation-circle"></i> ${escapeText(w.ultimo_error)}</div>` : ''}
          </div>
        `;
      }).join('') + '</div>';
    }

    function renderForm() {
      return `
        <form class="prem-webhooks-form">
          <h3><i class="fas fa-plus"></i> Nuevo webhook</h3>
          <div class="prem-wh-form-row">
            <input type="text" name="nombre" placeholder="Nombre (ej: Slack #incidentes)" required>
            <select name="tipo">${TYPES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
          </div>
          <input type="url" name="url" placeholder="URL del webhook (https://hooks.slack.com/...)" required>
          <div class="prem-wh-events">
            <label>Eventos a enviar:</label>
            ${EVENTS.map(([v, l]) => `<label class="prem-wh-evt-chk"><input type="checkbox" name="evt" value="${v}"> ${l}</label>`).join('')}
          </div>
          <button type="submit" class="btn primary"><i class="fas fa-save"></i> Crear webhook</button>
        </form>
      `;
    }

    function wireUp() {
      const body = modal.querySelector('.prem-webhooks-body');
      body.querySelectorAll('.prem-wh-test').forEach(b => b.addEventListener('click', async (e) => {
        const id = e.currentTarget.closest('.prem-webhook-card').dataset.id;
        try {
          const r = await fetch(`/api/webhooks/${id}/test`, { method: 'POST', credentials: 'same-origin' });
          const d = await r.json();
          if (window.premToast) window.premToast(d.ok ? 'Webhook OK' : `Error HTTP ${d.status}`, { type: d.ok ? 'success' : 'error' });
          refresh();
        } catch (e) { if (window.premToast) window.premToast(e.message, { type: 'error' }); }
      }));
      body.querySelectorAll('.prem-wh-toggle').forEach(b => b.addEventListener('click', async (e) => {
        const card = e.currentTarget.closest('.prem-webhook-card');
        const id = card.dataset.id;
        const active = !card.classList.contains('inactive');
        try {
          const cur = await (await fetch('/api/webhooks', { credentials: 'same-origin' })).json();
          const w = (cur || []).find(x => x.id == id);
          if (!w) return;
          await fetch(`/api/webhooks/${id}`, {
            method: 'PUT', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...w, activo: !active, eventos: JSON.parse(w.eventos || '[]') }),
          });
          refresh();
        } catch (e) { if (window.premToast) window.premToast(e.message, { type: 'error' }); }
      }));
      body.querySelectorAll('.prem-wh-del').forEach(b => b.addEventListener('click', async (e) => {
        const id = e.currentTarget.closest('.prem-webhook-card').dataset.id;
        if (!confirm('¿Eliminar este webhook?')) return;
        await fetch(`/api/webhooks/${id}`, { method: 'DELETE', credentials: 'same-origin' });
        refresh();
      }));

      const form = body.querySelector('.prem-webhooks-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = new FormData(form);
        const eventos = [...form.querySelectorAll('input[name="evt"]:checked')].map(i => i.value);
        try {
          const r = await fetch('/api/webhooks', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nombre: data.get('nombre'),
              url: data.get('url'),
              tipo: data.get('tipo'),
              eventos, activo: 1,
            }),
          });
          if (!r.ok) throw new Error('Error al crear');
          if (window.premToast) window.premToast('Webhook creado', { type: 'success' });
          refresh();
        } catch (e) { if (window.premToast) window.premToast(e.message, { type: 'error' }); }
      });
    }

    function escapeText(t) { const d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }

    window.premWebhooksOpen = () => { modal.classList.add('open'); refresh(); };

    // Cmd+K command "/webhooks" o atajo Ctrl+Shift+W
    document.addEventListener('keydown', (e) => {
      if (isEditing(e.target)) return;
      if (e.ctrlKey && e.shiftKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        window.premWebhooksOpen();
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════
     29. CONFETTI HOOK EN premToast
     premToast('Guardado', { type: 'success', confetti: true })
     ═══════════════════════════════════════════════════════════ */
  function initToastConfetti() {
    const orig = window.premToast;
    if (!orig) return;
    window.premToast = function (msg, opts = {}) {
      const handle = orig(msg, opts);
      if (opts.confetti && window.premConfetti) {
        window.premConfetti({ duration: 1600, particles: 60 });
      }
      return handle;
    };
  }

  /* ═══════════════════════════════════════════════════════════
     30. CUSTOM CONFIRM DIALOG — reemplaza window.confirm() feo
     Hooka window.confirm para mostrar modal premium.
     Uso async: const ok = await premConfirm('¿Eliminar?', { danger: true });
     ═══════════════════════════════════════════════════════════ */
  function initConfirmDialog() {
    const modal = document.createElement('div');
    modal.className = 'prem-confirm-modal';
    modal.innerHTML = `
      <div class="prem-confirm-backdrop"></div>
      <div class="prem-confirm-panel" role="alertdialog">
        <div class="prem-confirm-icon"><i class="fas fa-question-circle"></i></div>
        <div class="prem-confirm-title">Confirmar</div>
        <div class="prem-confirm-msg"></div>
        <div class="prem-confirm-actions">
          <button class="prem-confirm-cancel" type="button">Cancelar</button>
          <button class="prem-confirm-ok" type="button">Confirmar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    let resolveFn = null;

    function close(result) {
      modal.classList.remove('open');
      if (resolveFn) { resolveFn(result); resolveFn = null; }
    }
    modal.querySelector('.prem-confirm-backdrop').addEventListener('click', () => close(false));
    modal.querySelector('.prem-confirm-cancel').addEventListener('click', () => close(false));
    modal.querySelector('.prem-confirm-ok').addEventListener('click', () => close(true));
    document.addEventListener('keydown', (e) => {
      if (!modal.classList.contains('open')) return;
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') { e.preventDefault(); close(true); }
    });

    window.premConfirm = function (message, opts = {}) {
      return new Promise((resolve) => {
        resolveFn = resolve;
        const danger = !!opts.danger;
        modal.querySelector('.prem-confirm-title').textContent = opts.title || (danger ? 'Confirmar eliminación' : 'Confirmar');
        modal.querySelector('.prem-confirm-msg').textContent = message;
        modal.querySelector('.prem-confirm-ok').textContent = opts.okText || (danger ? 'Eliminar' : 'Confirmar');
        modal.querySelector('.prem-confirm-cancel').textContent = opts.cancelText || 'Cancelar';
        modal.querySelector('.prem-confirm-icon i').className = 'fas ' + (opts.icon || (danger ? 'fa-exclamation-triangle' : 'fa-question-circle'));
        modal.classList.toggle('prem-confirm-danger', danger);
        modal.classList.add('open');
        setTimeout(() => modal.querySelector(danger ? '.prem-confirm-cancel' : '.prem-confirm-ok').focus(), 60);
      });
    };

    // Hook window.confirm — asíncrono no funciona como sync, así que mostramos el modal
    // pero retornamos true para no bloquear (los callsites ya manejaban el confirm sync).
    // Mejor solución: deja confirm() como está pero recomienda usar premConfirm.
    // Sin tocar app.js, solo exponemos premConfirm para futuras adopciones.
  }

  /* ═══════════════════════════════════════════════════════════
     31. THEME PICKER — 3 presets (navy / teal / sunset)
     Botón flotante con palette icon abre selector. Persiste localStorage.
     ═══════════════════════════════════════════════════════════ */
  function initThemePicker() {
    const THEMES = [
      { id: 'navy',   label: 'Navy',   c1: '#1e3a8a', c2: '#2563eb' },
      { id: 'teal',   label: 'Teal',   c1: '#0f766e', c2: '#0d9488' },
      { id: 'sunset', label: 'Sunset', c1: '#c2410c', c2: '#ea580c' },
      { id: 'royal',  label: 'Royal',  c1: '#6d28d9', c2: '#7c3aed' },
      { id: 'rose',   label: 'Rose',   c1: '#be123c', c2: '#e11d48' },
    ];
    const KEY = LS_PREFIX + 'theme';

    function apply(themeId) {
      const t = THEMES.find(x => x.id === themeId) || THEMES[0];
      const root = document.documentElement;
      root.style.setProperty('--ds-primary', t.c1);
      root.style.setProperty('--ds-primary-2', t.c2);
      root.style.setProperty('--ds-grad', `linear-gradient(135deg, ${t.c1} 0%, ${t.c2} 100%)`);
      try { localStorage.setItem(KEY, themeId); } catch {}
      document.body.dataset.premTheme = themeId;
    }

    const saved = (() => { try { return localStorage.getItem(KEY); } catch { return null; } })();
    if (saved) apply(saved);

    // Botón flotante
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'prem-theme-fab';
    btn.setAttribute('data-prem-tooltip', 'Cambiar tema');
    btn.innerHTML = '<i class="fas fa-palette"></i>';

    const picker = document.createElement('div');
    picker.className = 'prem-theme-picker';
    picker.innerHTML = THEMES.map(t => `
      <button class="prem-theme-opt" data-theme="${t.id}" title="${t.label}">
        <span style="background: linear-gradient(135deg, ${t.c1}, ${t.c2})"></span>
        <small>${t.label}</small>
      </button>
    `).join('');

    document.body.appendChild(btn);
    document.body.appendChild(picker);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      picker.classList.toggle('open');
    });
    picker.addEventListener('click', (e) => {
      const opt = e.target.closest('.prem-theme-opt');
      if (!opt) return;
      apply(opt.dataset.theme);
      if (window.premToast) window.premToast(`Tema "${opt.dataset.theme}" aplicado`, { type: 'info' });
      picker.classList.remove('open');
    });
    document.addEventListener('click', (e) => {
      if (!picker.contains(e.target) && e.target !== btn) picker.classList.remove('open');
    });
  }

  /* ═══════════════════════════════════════════════════════════
     32. SORTABLE COLUMNS — click en th para ordenar
     ═══════════════════════════════════════════════════════════ */
  function initSortableColumns() {
    function attach(table) {
      if (table._sortInit) return;
      table._sortInit = true;
      const headerRow = table.querySelector('thead tr:first-child');
      if (!headerRow) return;

      headerRow.querySelectorAll('th').forEach((th, idx) => {
        if (th.classList.contains('th-actions')) return;
        if (th.classList.contains('no-sort')) return;
        th.classList.add('prem-sortable');
        th.style.cursor = 'pointer';
        th.dataset.sortIdx = String(idx);
        th.addEventListener('click', () => sortBy(table, idx, th));
      });
    }

    function sortBy(table, colIdx, th) {
      const cur = th.dataset.sortDir;
      const dir = cur === 'asc' ? 'desc' : 'asc';
      // Limpiar dirs de otros th
      table.querySelectorAll('thead th[data-sort-dir]').forEach(t => {
        t.removeAttribute('data-sort-dir');
        t.classList.remove('prem-sort-asc', 'prem-sort-desc');
      });
      th.dataset.sortDir = dir;
      th.classList.add('prem-sort-' + dir);

      const tbody = table.querySelector('tbody');
      if (!tbody) return;
      const rows = [...tbody.querySelectorAll('tr')]
        .filter(r => !r.classList.contains('empty-row') && !r.classList.contains('prem-skel-row') && !r.querySelector('td[colspan]'));

      rows.sort((a, b) => {
        const aTxt = (a.children[colIdx]?.textContent || '').trim();
        const bTxt = (b.children[colIdx]?.textContent || '').trim();
        // Intentar comparación numérica primero
        const aNum = parseFloat(aTxt.replace(/[^0-9.\-]/g, ''));
        const bNum = parseFloat(bTxt.replace(/[^0-9.\-]/g, ''));
        const isNum = !isNaN(aNum) && !isNaN(bNum) && aTxt.replace(/[\s,.\-$%]/g, '').match(/^\d/);
        let cmp;
        if (isNum) cmp = aNum - bNum;
        else cmp = aTxt.localeCompare(bTxt, 'es', { numeric: true, sensitivity: 'base' });
        return dir === 'asc' ? cmp : -cmp;
      });

      rows.forEach(r => tbody.appendChild(r));
    }

    document.querySelectorAll('table.data-table').forEach(attach);
    const mo = new MutationObserver(muts => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches?.('table.data-table')) attach(n);
        n.querySelectorAll?.('table.data-table').forEach(attach);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ═══════════════════════════════════════════════════════════
     33. DENSITY TOGGLE — compact / regular / spacious
     ═══════════════════════════════════════════════════════════ */
  function initDensityToggle() {
    const KEY = LS_PREFIX + 'density';
    const MODES = ['compact', 'regular', 'spacious'];
    const ICONS = { compact: 'fa-grip-lines', regular: 'fa-bars', spacious: 'fa-bars-staggered' };

    function apply(mode) {
      MODES.forEach(m => document.body.classList.remove('prem-density-' + m));
      document.body.classList.add('prem-density-' + mode);
      try { localStorage.setItem(KEY, mode); } catch {}
    }
    const saved = (() => { try { return localStorage.getItem(KEY) || 'regular'; } catch { return 'regular'; } })();
    apply(saved);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'prem-density-fab';
    btn.setAttribute('data-prem-tooltip', 'Densidad de tabla');
    btn.innerHTML = `<i class="fas ${ICONS[saved]}"></i>`;
    document.body.appendChild(btn);

    btn.addEventListener('click', () => {
      const cur = MODES.find(m => document.body.classList.contains('prem-density-' + m)) || 'regular';
      const next = MODES[(MODES.indexOf(cur) + 1) % MODES.length];
      apply(next);
      btn.querySelector('i').className = 'fas ' + ICONS[next];
      if (window.premToast) window.premToast(`Densidad: ${next}`, { type: 'info' });
    });
  }

  /* ═══════════════════════════════════════════════════════════
     34. LOADING BUTTON STATE — auto-disable con spinner
     Cualquier <button class="prem-loading"> muestra spinner.
     También se aplica a botones de submit forms cuando se hace click.
     ═══════════════════════════════════════════════════════════ */
  function initLoadingButtons() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-prem-loading-on-click], .btn[data-prem-loading-on-click]');
      if (!btn) return;
      btn.classList.add('prem-loading');
      btn.disabled = true;
      // Auto-restore después de 6s por seguridad si el código no lo limpia
      setTimeout(() => {
        btn.classList.remove('prem-loading');
        btn.disabled = false;
      }, 6000);
    });
    // Helper global
    window.premBtnLoading = function (btn, on) {
      if (!btn) return;
      if (on) { btn.classList.add('prem-loading'); btn.disabled = true; }
      else    { btn.classList.remove('prem-loading'); btn.disabled = false; }
    };
  }

  /* ═══════════════════════════════════════════════════════════
     35. SCROLL-REVEAL — cards aparecen suavemente al entrar viewport
     ═══════════════════════════════════════════════════════════ */
  function initScrollReveal() {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('prem-revealed');
          io.unobserve(e.target);
        }
      }
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

    function watch(el) {
      if (el._revealWatched) return;
      el._revealWatched = true;
      el.classList.add('prem-reveal');
      io.observe(el);
    }
    function scan() {
      document.querySelectorAll('.dashboard-card, .admin-hub-card, .empty-card, .prem-views-bar, .prem-ext-filter-bar').forEach(watch);
    }
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ═══════════════════════════════════════════════════════════
     36. NOTIFICATION BADGE PULSE — anima cuando aparece nuevo
     ═══════════════════════════════════════════════════════════ */
  function initBadgePulse() {
    function watch(badge) {
      if (badge._pulseWatched) return;
      badge._pulseWatched = true;
      const mo = new MutationObserver(() => {
        const n = parseInt((badge.textContent || '0').trim(), 10);
        if (n > 0) {
          badge.classList.add('prem-badge-active');
        } else {
          badge.classList.remove('prem-badge-active');
        }
      });
      mo.observe(badge, { childList: true, characterData: true, subtree: true });
      // Init
      const n = parseInt((badge.textContent || '0').trim(), 10);
      if (n > 0) badge.classList.add('prem-badge-active');
    }
    function scan() { document.querySelectorAll('.tab-badge').forEach(watch); }
    scan();
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  }

  /* ═══════════════════════════════════════════════════════════
     37. ONBOARDING TOUR — guía de 6 pasos para usuarios nuevos
     ═══════════════════════════════════════════════════════════ */
  function initOnboardingTour() {
    const KEY = LS_PREFIX + 'onboarding-done';
    // Siempre exponer la función manual
    window.premOnboarding = startTour;
    // No auto-disparar para evitar bloquear el boot
    return;

    function startTour() {
      const STEPS = [
        {
          target: '.app-header, header.header, .header',
          title: '👋 Bienvenido al Sistema',
          body: 'Esta es tu plataforma de gestión. En unos pasos te muestro lo esencial.',
          pos: 'bottom',
        },
        {
          target: '.sidebar-nav, nav.sidebar-nav',
          title: '📋 Navegación lateral',
          body: 'Todos los módulos están aquí. Click para entrar. Puedes minimizar el sidebar con el botón ☰.',
          pos: 'right',
        },
        {
          target: 'table.data-table, .table-wrap',
          title: '🔍 Tablas y filtros',
          body: 'Click en cualquier columna para ordenar. Usa los filtros arriba de la tabla. Shift+Click selecciona múltiples filas.',
          pos: 'top',
        },
        {
          target: '.prem-theme-fab',
          title: '🎨 Personaliza tu tema',
          body: 'Cambia el color principal del sistema entre 5 presets. Tu elección queda guardada.',
          pos: 'left',
        },
        {
          target: '.prem-density-fab',
          title: '📏 Ajusta la densidad',
          body: 'Compacto, regular o espacioso. Cambia cómo se ven las tablas según tu pantalla.',
          pos: 'left',
        },
        {
          title: '⌨️ Atajos útiles',
          body: '<strong>Ctrl+K</strong> búsqueda global · <strong>?</strong> ver todos los atajos · <strong>Esc</strong> cerrar modales · <strong>h</strong> ver historial de fila.',
          center: true,
        },
      ];

      let step = 0;
      const overlay = document.createElement('div');
      overlay.className = 'prem-tour-overlay';
      overlay.innerHTML = `
        <div class="prem-tour-spotlight"></div>
        <div class="prem-tour-popover">
          <div class="prem-tour-progress"></div>
          <h3 class="prem-tour-title"></h3>
          <div class="prem-tour-body"></div>
          <div class="prem-tour-actions">
            <button class="prem-tour-skip" type="button">Saltar</button>
            <div class="prem-tour-nav">
              <button class="prem-tour-prev" type="button">← Atrás</button>
              <button class="prem-tour-next" type="button">Siguiente →</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const spotlight = overlay.querySelector('.prem-tour-spotlight');
      const popover = overlay.querySelector('.prem-tour-popover');
      const titleEl = overlay.querySelector('.prem-tour-title');
      const bodyEl  = overlay.querySelector('.prem-tour-body');
      const progressEl = overlay.querySelector('.prem-tour-progress');
      const prevBtn = overlay.querySelector('.prem-tour-prev');
      const nextBtn = overlay.querySelector('.prem-tour-next');
      const skipBtn = overlay.querySelector('.prem-tour-skip');

      function render() {
        const s = STEPS[step];
        titleEl.textContent = s.title;
        bodyEl.innerHTML = s.body;
        progressEl.innerHTML = STEPS.map((_, i) =>
          `<span class="${i === step ? 'active' : ''}${i < step ? ' done' : ''}"></span>`
        ).join('');
        prevBtn.style.visibility = step === 0 ? 'hidden' : 'visible';
        nextBtn.textContent = step === STEPS.length - 1 ? '✓ Listo' : 'Siguiente →';

        const target = s.target ? document.querySelector(s.target) : null;
        if (target && !s.center) {
          const rect = target.getBoundingClientRect();
          // Spotlight sobre el target
          spotlight.style.cssText = `
            top: ${rect.top - 8}px;
            left: ${rect.left - 8}px;
            width: ${rect.width + 16}px;
            height: ${rect.height + 16}px;
            display: block;
          `;
          // Posicionar popover según pos
          const pop = popover.getBoundingClientRect();
          const popW = 360, popH = pop.height || 200;
          let top, left;
          if (s.pos === 'right') {
            top = Math.max(20, Math.min(rect.top, innerHeight - popH - 20));
            left = Math.min(rect.right + 16, innerWidth - popW - 20);
          } else if (s.pos === 'left') {
            top = Math.max(20, Math.min(rect.top, innerHeight - popH - 20));
            left = Math.max(20, rect.left - popW - 16);
          } else if (s.pos === 'top') {
            top = Math.max(20, rect.top - popH - 16);
            left = Math.max(20, Math.min(rect.left + rect.width / 2 - popW / 2, innerWidth - popW - 20));
          } else { // bottom default
            top = Math.min(rect.bottom + 16, innerHeight - popH - 20);
            left = Math.max(20, Math.min(rect.left + rect.width / 2 - popW / 2, innerWidth - popW - 20));
          }
          popover.style.cssText = `top: ${top}px; left: ${left}px; transform: none;`;
        } else {
          // Centrado sin spotlight
          spotlight.style.display = 'none';
          popover.style.cssText = 'top: 50%; left: 50%; transform: translate(-50%, -50%);';
        }
      }

      function done() {
        try { localStorage.setItem(KEY, '1'); } catch {}
        overlay.classList.add('closing');
        setTimeout(() => overlay.remove(), 300);
        if (window.premToast) window.premToast('¡Listo! Disfruta el sistema.', { type: 'success', confetti: true });
      }

      prevBtn.addEventListener('click', () => { if (step > 0) { step--; render(); } });
      nextBtn.addEventListener('click', () => {
        if (step < STEPS.length - 1) { step++; render(); }
        else done();
      });
      skipBtn.addEventListener('click', done);

      render();
      setTimeout(() => overlay.classList.add('open'), 30);
      window.addEventListener('resize', render);
    }

    // Inicia tour SOLO cuando la app esté idle (no compite con primer render)
    function tryStart() {
      if (document.querySelector('.login-screen.active, #login-screen:not(.hidden), .login-overlay:not(.hidden)')) return;
      if (!document.querySelector('.sidebar-nav')) return;
      if (document.querySelector('.global-loading:not(.hidden)')) {
        setTimeout(tryStart, 1500);
        return;
      }
      startTour();
    }
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => setTimeout(tryStart, 2500), { timeout: 5000 });
    } else {
      setTimeout(tryStart, 3000);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     38. ANIMATED COUNTERS — versión SAFE (sin MutationObserver
     que cause infinite loop). Sólo anima EN viewport, una vez.
     ═══════════════════════════════════════════════════════════ */
  function initAnimatedCounters() {
    if (!('IntersectionObserver' in window)) return;

    function parseNumber(str) {
      const m = String(str || '').match(/-?\d[\d,.]*/);
      if (!m) return null;
      const n = parseFloat(m[0].replace(/,/g, ''));
      return isNaN(n) ? null : n;
    }
    function formatLike(template, value) {
      const m = String(template || '').match(/-?\d[\d,.]*/);
      if (!m) return value.toString();
      const orig = m[0];
      const hasComma = orig.includes(',');
      const decimals = (orig.split('.')[1] || '').length;
      const formatted = value.toLocaleString('es-MX', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        useGrouping: hasComma,
      });
      return template.replace(orig, formatted);
    }

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target;
        io.unobserve(el);
        if (el._counterAnimated) continue;
        el._counterAnimated = true;
        const finalText = el.textContent;
        const finalVal = parseNumber(finalText);
        if (finalVal === null || finalVal === 0) continue;
        const duration = 700;
        const start = performance.now();
        function step(now) {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          const cur = finalVal * eased;
          el.textContent = formatLike(finalText, cur);
          if (t < 1) requestAnimationFrame(step);
          else el.textContent = finalText; // restaurar exacto
        }
        requestAnimationFrame(step);
      }
    }, { threshold: 0.3 });

    let scanScheduled = false;
    function scheduleScan() {
      if (scanScheduled) return;
      scanScheduled = true;
      requestAnimationFrame(() => {
        scanScheduled = false;
        document.querySelectorAll('.dash-value, .dashboard-card-value').forEach(el => {
          if (!el._counterRegistered) { el._counterRegistered = true; io.observe(el); }
        });
      });
    }
    scheduleScan();
    // Re-scan cuando aparezcan nuevas cards (throttled via rAF)
    if (window.premScheduleIdleWork) window.premScheduleIdleWork(scheduleScan);
  }

  /* ═══════════════════════════════════════════════════════════
     39. QUICK FILTER CHIPS — click en badge dentro de tabla filtra
     ═══════════════════════════════════════════════════════════ */
  function initQuickFilterChips() {
    document.addEventListener('click', (e) => {
      // Detecta click en un badge/pill/semaforo dentro de tbody
      const badge = e.target.closest(
        '.badge, .estatus-pill, .status-pill, .semaforo, [class*="badge-mant-"], [class*="badge-bono-"], [class*="pvc-badge-"]'
      );
      if (!badge) return;
      const td = badge.closest('td');
      const tr = badge.closest('tbody tr');
      const table = badge.closest('table.data-table');
      if (!td || !tr || !table) return;

      const colIdx = [...tr.children].indexOf(td);
      const value = (badge.textContent || '').trim();
      if (!value) return;

      // Buscar input de filtro en .prem-ext-filter-bar correspondiente
      const wrap = table.closest('.table-wrap, .md-table-wrap');
      if (!wrap) return;
      const filterBar = wrap.previousElementSibling?.classList?.contains('prem-ext-filter-bar')
        ? wrap.previousElementSibling
        : wrap.parentElement.querySelector('.prem-ext-filter-bar');
      if (!filterBar) return;

      const fields = filterBar.querySelectorAll('.prem-ext-filter-field');
      const targetField = fields[colIdx - countActionsBefore(table, colIdx)];
      const input = targetField?.querySelector('input, select');
      if (!input) return;

      e.preventDefault();
      e.stopPropagation();
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      if (window.premToast) window.premToast(`Filtrando por "${value}"`, { type: 'info' });
    });

    function countActionsBefore(table, idx) {
      // No hay th-actions antes de columnas normales
      return 0;
    }
  }

  /* ═══════════════════════════════════════════════════════════
     40. SIDEBAR STATS WIDGET — mini KPIs en bottom del sidebar
     ═══════════════════════════════════════════════════════════ */
  function initSidebarStats() {
    setTimeout(() => {
      const sidebar = document.querySelector('.sidebar-nav, nav.sidebar-nav');
      if (!sidebar || sidebar.querySelector('.prem-sidebar-stats')) return;

      const widget = document.createElement('div');
      widget.className = 'prem-sidebar-stats';
      widget.innerHTML = `
        <div class="prem-stats-head">
          <i class="fas fa-bolt"></i>
          <span>Resumen rápido</span>
        </div>
        <div class="prem-stats-grid">
          <div class="prem-stat" data-key="incidentes">
            <span class="prem-stat-num">—</span>
            <span class="prem-stat-lbl">Incidentes</span>
          </div>
          <div class="prem-stat" data-key="cotizaciones">
            <span class="prem-stat-num">—</span>
            <span class="prem-stat-lbl">Cotizaciones</span>
          </div>
        </div>
      `;
      sidebar.appendChild(widget);

      // Carga datos del dashboard / endpoints disponibles
      Promise.all([
        fetch('/api/incidentes', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/cotizaciones', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : []).catch(() => []),
      ]).then(([inc, cot]) => {
        const abiertos = (inc || []).filter(i => i.estatus !== 'cerrado' && i.estatus !== 'cancelado').length;
        const pendientes = (cot || []).filter(c => c.estado === 'pendiente' || c.estado === 'borrador').length;
        const numA = widget.querySelector('[data-key="incidentes"] .prem-stat-num');
        const numB = widget.querySelector('[data-key="cotizaciones"] .prem-stat-num');
        if (numA) numA.textContent = String(abiertos);
        if (numB) numB.textContent = String(pendientes);
      }).catch(() => {});

      // Click → ir al módulo
      widget.querySelector('[data-key="incidentes"]')?.addEventListener('click', () => {
        document.querySelector('.tab[data-tab="incidentes"], .tab[data-tab="reportes"]')?.click();
      });
      widget.querySelector('[data-key="cotizaciones"]')?.addEventListener('click', () => {
        document.querySelector('.tab[data-tab="cotizaciones"]')?.click();
      });
    }, 1200);
  }

  /* ─── Bootstrap ─────────────────────────────────────────── */
  function boot() {
    initSkipLink();
    initExternalFilters();
    initCommandK();
    initShortcutsCheatSheet();
    initSkeletonLoaders();
    initSavedFilters();
    initBulkActions();
    initToastHelper();
    initDashboardSparklines();
    initColumnReorder();
    initAttachments();
    initDashboardReorder();
    initRippleEffect();
    initSidebarTooltips();
    initPremiumTooltips();
    initAriaLabels();
    initRowClickHighlight();
    initConfettiHelper();
    initDashboardPulse();
    initUserAvatar();
    initPrintButtons();
    initSwipeActions();
    initAutoAttachments();
    initPullToRefresh();
    initPWAInstall();
    initAuditViewer();
    initWebhooksUI();
    initToastConfetti();
    initConfirmDialog();
    initThemePicker();
    initSortableColumns();
    initDensityToggle();
    initLoadingButtons();
    initScrollReveal();
    initBadgePulse();
    // initOnboardingTour();  // DESHABILITADO en auto-boot - usar window.premOnboarding() manual
    initAnimatedCounters();
    initQuickFilterChips();
    // initSidebarStats();    // DESHABILITADO temporal — hace 2 fetch al boot que pueden colgar
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
