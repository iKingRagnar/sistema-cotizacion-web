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

      async function uploadFile(file) {
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

  /* ─── Bootstrap ─────────────────────────────────────────── */
  function boot() {
    initExternalFilters();   // PRIMERO: saca filtros antes de medir layout
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
