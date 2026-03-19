(function () {
  const API = '/api';
  let clientesCache = [];
  let refaccionesCache = [];
  let maquinasCache = [];
  let cotizacionesCache = [];
  let incidentesCache = [];
  let bitacorasCache = [];
  let chartDonut = null;
  let chartBars = null;

  function qs(s) { return document.querySelector(s); }
  function qsAll(s) { return document.querySelectorAll(s); }

  function showToast(message, type) {
    type = type === 'error' ? 'error' : 'success';
    const container = qs('#toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast toast-' + type;
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
    el.innerHTML = `<i class="fas ${icon} toast-icon"></i><span class="toast-msg">${escapeHtml(message)}</span>`;
    container.appendChild(el);
    function dismiss() {
      el.classList.add('toast-out');
      setTimeout(function () { el.remove(); }, 320);
    }
    const t = setTimeout(dismiss, type === 'error' ? 6000 : 4000);
    el.addEventListener('click', function () { clearTimeout(t); dismiss(); });
  }

  function showLoading() {
    const el = qs('#global-loading');
    const main = qs('#main-content');
    if (el) el.classList.remove('hidden');
    if (main) main.classList.add('content-loading');
  }
  function hideLoading() {
    const el = qs('#global-loading');
    const main = qs('#main-content');
    if (el) el.classList.add('hidden');
    if (main) main.classList.remove('content-loading');
  }

  function parseApiError(e) {
    let msg = e && e.message ? String(e.message) : 'Error al procesar';
    try {
      const o = JSON.parse(msg);
      if (o && o.error) return o.error;
    } catch (_) {}
    return msg;
  }

  function showPanel(id) {
    qsAll('.panel').forEach(p => p.classList.remove('active'));
    qsAll('.tab').forEach(t => t.classList.remove('active'));
    const panel = document.getElementById('panel-' + id);
    const tab = document.querySelector('.tab[data-tab="' + id + '"]');
    if (panel) panel.classList.add('active');
    if (tab) tab.classList.add('active');
    if (id === 'dashboards') loadDashboard();
    if (id === 'clientes') loadClientes();
    if (id === 'refacciones') loadRefacciones();
    if (id === 'maquinas') loadMaquinas();
    if (id === 'cotizaciones') loadCotizaciones();
    if (id === 'incidentes') loadIncidentes();
    if (id === 'bitacoras') loadBitacoras();
    if (id === 'demo') loadSeedStatus();
  }

  qsAll('.tab').forEach(t => {
    t.addEventListener('click', () => showPanel(t.dataset.tab));
  });

  async function fetchJson(url, opts = {}) {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
    const text = await r.text();
    if (!r.ok) throw new Error(text || r.statusText);
    if (!text.trim()) return {};
    try { return JSON.parse(text); } catch (_) { throw new Error(text); }
  }

  function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function confirmar(msg) {
    return confirm(msg || '¿Eliminar este registro?');
  }

  const IVA_PORCENTAJE = 0.16;

  function clearInvalidMarks() {
    qsAll('.field-invalid').forEach(el => el.classList.remove('field-invalid'));
    qsAll('.form-group.field-invalid').forEach(el => el.classList.remove('field-invalid'));
  }
  function markInvalid(inputIdOrEl, message) {
    const el = typeof inputIdOrEl === 'string' ? qs('#' + inputIdOrEl) : inputIdOrEl;
    if (!el) return;
    el.classList.add('field-invalid');
    el.focus();
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const formGroup = el.closest('.form-group');
    if (formGroup) formGroup.classList.add('field-invalid');
    return message;
  }
  function validateRequired(value, label) {
    if (value == null || String(value).trim() === '') return label || 'Este campo es obligatorio';
    return null;
  }
  function validateRFC(val) {
    if (!val || !val.trim()) return null;
    const v = val.trim().toUpperCase().replace(/\s/g, '');
    if (v.length < 12 || v.length > 13) return 'RFC debe tener 12 o 13 caracteres';
    if (!/^[A-Z0-9]+$/.test(v)) return 'RFC solo permite letras y números';
    return null;
  }
  function validateCURP(val) {
    if (!val || !val.trim()) return null;
    const v = val.trim().toUpperCase();
    if (v.length !== 18) return 'CURP debe tener 18 caracteres';
    if (!/^[A-Z0-9]+$/.test(v)) return 'CURP solo permite letras y números';
    return null;
  }
  function validateEmail(val) {
    if (!val || !val.trim()) return null;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(val.trim())) return 'Email no válido';
    return null;
  }
  function onlyNumbers(el) {
    if (!el) return;
    el.addEventListener('input', function () {
      this.value = this.value.replace(/[^0-9+\-\s()]/g, '');
    });
  }

  function debounce(fn, ms) {
    let t;
    return function () { clearTimeout(t); t = setTimeout(() => fn.apply(this, arguments), ms); };
  }

  function parseNumberFilter(str) {
    if (!str || !String(str).trim()) return null;
    str = String(str).trim().replace(/,/g, '');
    const n = parseFloat(str.replace(/[^\d.-]/g, ''));
    if (str.startsWith('>=')) return { op: 'gte', value: n };
    if (str.startsWith('<=')) return { op: 'lte', value: n };
    if (str.startsWith('>')) return { op: 'gt', value: n };
    if (str.startsWith('<')) return { op: 'lt', value: n };
    const between = str.match(/^([\d.]+)\s*-\s*([\d.]+)$/) || str.match(/^between\s+([\d.]+)\s+and\s+([\d.]+)$/i);
    if (between) return { op: 'between', value: parseFloat(between[1]), value2: parseFloat(between[2]) };
    // Número solo (ej. "3"): mostrar valores cuya parte entera sea ese número (3.7, 3.2, 3). Con decimal (ej. "3.5"): igualdad exacta.
    if (!isNaN(n)) return { op: str.includes('.') ? 'eq' : 'int', value: n };
    return null;
  }

  function getDateRange(selectVal, dateInputVal) {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    if (dateInputVal && dateInputVal.length >= 10) return { start: dateInputVal.slice(0, 10), end: dateInputVal.slice(0, 10) };
    switch (selectVal) {
      case 'hoy': return { start: today, end: today };
      case 'esta_semana': {
        const d = new Date(now); d.setDate(d.getDate() - d.getDay()); return { start: d.toISOString().slice(0, 10), end: today };
      }
      case 'este_mes': return { start: today.slice(0, 7) + '-01', end: today };
      case 'mes_pasado': {
        const y = now.getFullYear(), m = now.getMonth(); const start = new Date(y, m - 1, 1), end = new Date(y, m, 0);
        return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
      }
      case 'este_año': return { start: today.slice(0, 4) + '-01-01', end: today };
      default: return null;
    }
  }

  /** Normaliza texto para búsqueda: minúsculas y sin acentos (manómetro === manometro). */
  function normalizeForSearch(str) {
    if (str == null || str === '') return '';
    return String(str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function getFilterValues(tableEl) {
    const tbl = typeof tableEl === 'string' ? qs(tableEl) : tableEl;
    if (!tbl) return {};
    const out = {};
    tbl.querySelectorAll('.filter-input, .filter-date-select').forEach(inp => {
      const key = inp.dataset.key;
      if (!key) return;
      if (inp.classList.contains('filter-date-select')) {
        out[key + '_dateSelect'] = inp.value;
        const dateInp = tbl.querySelector('.filter-date-input[data-key="' + key + '"]');
        out[key + '_dateInput'] = dateInp ? dateInp.value : '';
        return;
      }
      out[key] = inp.value.trim();
    });
    return out;
  }

  function applyFilters(data, filterValues, tableId) {
    if (!data || !Array.isArray(data)) return [];
    let out = data;
    const tbl = qs('#' + tableId);
    if (!tbl) return out;
    tbl.querySelectorAll('.filter-row .filter-input[data-key]:not(.filter-date-input), .filter-row .filter-date-select[data-key]').forEach(inp => {
      const key = inp.dataset.key;
      const type = inp.classList.contains('filter-date-select') ? 'date' : (inp.dataset.type || 'text');
      let val;
      if (type === 'date' && inp.classList.contains('filter-date-select')) {
        const range = getDateRange(inp.value, filterValues[key + '_dateInput']);
        if (!range) return;
        out = out.filter(row => {
          const d = (row[key] || '').toString().slice(0, 10);
          return d >= range.start && d <= range.end;
        });
        return;
      }
      if (inp.classList.contains('filter-date-input')) {
        const v = inp.value ? inp.value.slice(0, 10) : '';
        if (!v) return;
        out = out.filter(row => (row[key] || '').toString().slice(0, 10) === v);
        return;
      }
      val = filterValues[key];
      if (val === undefined || val === '') return;
      if (type === 'number') {
        const cond = parseNumberFilter(val);
        if (!cond) return;
        out = out.filter(row => {
          const num = parseFloat(row[key]);
          if (isNaN(num)) return false;
          if (cond.op === 'int') return Math.floor(num) === cond.value; // "3" → 3, 3.7, 3.2
          if (cond.op === 'eq') return num === cond.value;
          if (cond.op === 'gt') return num > cond.value;
          if (cond.op === 'gte') return num >= cond.value;
          if (cond.op === 'lt') return num < cond.value;
          if (cond.op === 'lte') return num <= cond.value;
          if (cond.op === 'between') return num >= cond.value && num <= cond.value2;
          return true;
        });
      } else {
        const norm = normalizeForSearch(val);
        out = out.filter(row => normalizeForSearch(row[key]).includes(norm));
      }
    });
    return out;
  }

  function bindTableFilters(tableId, onFilter) {
    const tbl = qs('#' + tableId);
    if (!tbl || !onFilter) return;
    const run = debounce(onFilter, 220);
    tbl.querySelectorAll('.filter-row .filter-input').forEach(inp => {
      inp.addEventListener('input', run);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); onFilter(); } });
    });
    tbl.querySelectorAll('.filter-row .filter-date-select, .filter-row .filter-date-input').forEach(inp => {
      inp.addEventListener('change', onFilter);
    });
  }

  function escapeCsv(val) {
    if (val == null) return '';
    const s = String(val).replace(/"/g, '""');
    return /[,"\n\r]/.test(s) ? '"' + s + '"' : s;
  }
  function getTableKeysAndHeaders(tableId) {
    const tbl = qs('#' + tableId);
    if (!tbl) return { keys: [], headers: [] };
    const ths = Array.from(tbl.querySelectorAll('thead tr:first-child th:not(.th-actions)'));
    const tds = tbl.querySelectorAll('.filter-row td:not(.th-actions)');
    const keys = [], headers = [];
    ths.forEach((th, i) => {
      const td = tds[i];
      const inp = td ? td.querySelector('[data-key]') : null;
      if (inp && inp.dataset.key) { keys.push(inp.dataset.key); headers.push(th.textContent.trim()); }
    });
    return { keys, headers };
  }

  // Semáforos tipo ITIL v4: SLA por prioridad (días objetivo de resolución)
  const SLA_DAYS_BY_PRIORITY = { critica: 1, alta: 2, media: 5, baja: 10 };
  const SLA_WARNING_PCT = 0.8;
  function parseDate(s) {
    if (!s) return null;
    const str = String(s).trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }
  function daysBetween(from, to) {
    if (!from || !to) return 0;
    const a = from instanceof Date ? from : new Date(from);
    const b = to instanceof Date ? to : new Date(to);
    return Math.floor((b - a) / (24 * 60 * 60 * 1000));
  }
  function getSlaSemaphore(inc) {
    const priority = (inc.prioridad || 'media').toLowerCase();
    const targetDays = SLA_DAYS_BY_PRIORITY[priority] ?? 5;
    const fechaReporte = parseDate(inc.fecha_reporte);
    const fechaCerrado = parseDate(inc.fecha_cerrado);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const estatus = (inc.estatus || '').toLowerCase();
    if (estatus === 'cerrado' && fechaCerrado && fechaReporte) {
      const resolutionDays = daysBetween(fechaReporte, fechaCerrado);
      if (resolutionDays <= targetDays) return { color: 'green', label: 'Dentro de SLA', icon: 'fa-circle-check' };
      return { color: 'red', label: 'Fuera de SLA', icon: 'fa-circle-xmark' };
    }
    if (!fechaReporte) return { color: 'green', label: '—', icon: 'fa-circle-minus' };
    const daysOpen = daysBetween(fechaReporte, today);
    if (daysOpen > targetDays) return { color: 'red', label: 'Fuera de SLA', icon: 'fa-circle-xmark' };
    if (daysOpen >= Math.ceil(targetDays * SLA_WARNING_PCT)) return { color: 'yellow', label: 'Atención', icon: 'fa-circle-exclamation' };
    return { color: 'green', label: 'Dentro de SLA', icon: 'fa-circle-check' };
  }
  function getVigenciaSemaphore(cot) {
    const fecha = parseDate(cot.fecha);
    if (!fecha) return { color: 'green', label: '—', icon: 'fa-circle-minus' };
    const days = daysBetween(fecha, new Date());
    if (days <= 15) return { color: 'green', label: 'Reciente', icon: 'fa-circle-check' };
    if (days <= 30) return { color: 'yellow', label: 'Por vencer', icon: 'fa-circle-exclamation' };
    return { color: 'red', label: 'Vencida', icon: 'fa-circle-xmark' };
  }
  function getEstadoRegistroSemaphore(bit) {
    const fecha = parseDate(bit.fecha);
    if (!fecha) return { color: 'green', label: '—', icon: 'fa-circle-minus' };
    const days = daysBetween(fecha, new Date());
    if (days <= 7) return { color: 'green', label: 'Reciente', icon: 'fa-circle-check' };
    if (days <= 30) return { color: 'yellow', label: 'Antiguo', icon: 'fa-circle-exclamation' };
    return { color: 'red', label: 'Muy antiguo', icon: 'fa-circle-xmark' };
  }
  function enrichIncidentesForExport(data) {
    return (data || []).map(i => ({ ...i, sla_estado: getSlaSemaphore(i).label }));
  }
  function enrichCotizacionesForExport(data) {
    return (data || []).map(c => ({ ...c, vigencia_estado: getVigenciaSemaphore(c).label }));
  }
  function enrichBitacorasForExport(data) {
    return (data || []).map(b => ({ ...b, estado_registro: getEstadoRegistroSemaphore(b).label }));
  }
  function exportToCsv(data, tableId, filenameLabel) {
    const tbl = qs('#' + tableId);
    if (!tbl || !data || !data.length) { showToast('No hay datos para exportar.', 'error'); return; }
    showToast('Exportando…', 'success');
    const { keys, headers } = getTableKeysAndHeaders(tableId);
    const rows = [headers.join(','), ...data.map(row => keys.map(k => escapeCsv(row[k])).join(','))];
    const csv = '\uFEFF' + rows.join('\r\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = (filenameLabel || 'export') + '_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    showToast('CSV descargado correctamente.', 'success');
  }
  function detectExcelColumnFormat(header, key, sampleValues) {
    const headerLower = (header || '').toLowerCase();
    const keyLower = (key || '').toLowerCase();
    const samples = sampleValues.filter(v => v != null && v !== '');
    const looksCurrency = /^(total|monto|precio|subtotal|iva|valor|costo|importe|unit\.?|unitario)$/.test(keyLower) ||
      /\b(total|monto|precio|subtotal|iva|valor)\b/.test(headerLower);
    const looksDate = /^(fecha|date|fecha_reporte|fecha_cerrado)$/.test(keyLower) ||
      /fecha|date/i.test(headerLower);
    const looksInteger = /^(id|cliente_id|maquina_id|incidente_id|cotizacion_id)$/.test(keyLower) ||
      /^\s*id\s*$/i.test(headerLower);
    const looksNumber = /^(tiempo_horas|horas|precio_unitario|subtotal|iva|total|tiempo)$/.test(keyLower) ||
      /\b(horas|precio|total|subtotal|iva)\b/.test(headerLower);
    const looksPercentage = /porcentaje|%|percent/i.test(headerLower) || keyLower.includes('porcentaje');
    if (looksPercentage && samples.length) {
      const allNum = samples.every(v => !isNaN(parseFloat(String(v).replace('%', ''))));
      if (allNum) return { type: 'percentage', numFmt: '0.00%' };
    }
    if (looksCurrency && samples.length) {
      const allNum = samples.every(v => !isNaN(parseFloat(String(v).replace(/[$,]\s*/g, ''))));
      if (allNum) return { type: 'currency', numFmt: '"$"#,##0.00' };
    }
    if (looksDate && samples.length) {
      const iso = /^\d{4}-\d{2}-\d{2}/;
      const allDate = samples.every(v => iso.test(String(v).trim()) || !isNaN(Date.parse(String(v))));
      if (allDate) return { type: 'date', numFmt: 'yyyy-mm-dd' };
    }
    if (looksInteger && samples.length) {
      const allInt = samples.every(v => Number.isInteger(Number(v)) || /^\d+$/.test(String(v).trim()));
      if (allInt) return { type: 'integer', numFmt: '#,##0' };
    }
    if (looksNumber && samples.length) {
      const allNum = samples.every(v => !isNaN(parseFloat(String(v))));
      if (allNum) return { type: 'number', numFmt: '#,##0.00' };
    }
    return { type: 'text', numFmt: '@' };
  }
  async function exportToExcel(data, tableId, filenameLabel) {
    const tbl = qs('#' + tableId);
    if (!tbl || !data || !data.length) { showToast('No hay datos para exportar.', 'error'); return; }
    if (typeof ExcelJS === 'undefined') { showToast('La exportación a Excel no está disponible. Recarga la página.', 'error'); return; }
    showToast('Exportando a Excel…', 'success');
    const { keys, headers } = getTableKeysAndHeaders(tableId);
    const sampleSize = Math.min(20, data.length);
    const columnFormats = keys.map((k, i) => detectExcelColumnFormat(
      headers[i],
      k,
      data.slice(0, sampleSize).map(row => row[k])
    ));
    function cellValue(val, fmt) {
      if (val == null || val === '') return '';
      const s = String(val).trim();
      if (fmt.type === 'currency' || fmt.type === 'number' || fmt.type === 'percentage') {
        const n = fmt.type === 'percentage' ? parseFloat(s.replace('%', '')) / 100 : parseFloat(s.replace(/[$,]\s*/g, ''));
        if (!isNaN(n)) return n;
      }
      if (fmt.type === 'integer') {
        const n = parseInt(s, 10);
        if (!isNaN(n)) return n;
      }
      if (fmt.type === 'date') {
        const d = s.match(/^\d{4}-\d{2}-\d{2}/) ? new Date(s.slice(0, 10)) : new Date(s);
        if (!isNaN(d.getTime())) return d;
      }
      return s;
    }
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Sistema de Cotización';
      const sheet = workbook.addWorksheet('Datos', { views: [{ state: 'frozen', ySplit: 1 }] });
      const headerRow = sheet.addRow(headers);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e3a5f' } };
      headerRow.alignment = { horizontal: 'left', vertical: 'middle' };
      headerRow.height = 22;
      data.forEach((row, i) => {
        const rowValues = keys.map((k, colIndex) => cellValue(row[k], columnFormats[colIndex]));
        const r = sheet.addRow(rowValues);
        r.eachCell((cell, colNumber) => {
          const fmt = columnFormats[colNumber - 1];
          if (fmt && fmt.numFmt && cell.value !== '') cell.numFmt = fmt.numFmt;
        });
        if (i % 2 === 1) r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8fafc' } };
        r.alignment = { vertical: 'middle', wrapText: true };
      });
      sheet.columns = headers.map((_, i) => ({ width: Math.min(Math.max(String(headers[i]).length + 2, 10), 40) }));
      sheet.getRow(1).eachCell((cell, colNumber) => {
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });
      for (let row = 2; row <= data.length + 1; row++) {
        sheet.getRow(row).eachCell((cell) => {
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });
      }
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (filenameLabel || 'export') + '_' + new Date().toISOString().slice(0, 10) + '.xlsx';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Excel descargado correctamente.', 'success');
    } catch (e) {
      console.error(e);
      showToast('No se pudo generar el Excel. Intenta de nuevo.', 'error');
    }
  }
  function updateTableFooter(tableId, showing, total, clearAndRefresh) {
    const footer = qs('#footer-' + tableId);
    if (!footer) return;
    if (total === 0) { footer.innerHTML = ''; return; }
    const hasFilters = tbl => {
      let has = false;
      qs('#' + tbl).querySelectorAll('.filter-row .filter-input, .filter-row .filter-date-select, .filter-row .filter-date-input').forEach(inp => { if (inp.value && inp.value.trim()) has = true; });
      return has;
    };
    const showClear = hasFilters(tableId);
    footer.innerHTML = `<span>Mostrando <strong>${showing}</strong> de <strong>${total}</strong> registros</span>${showClear ? ' <button type="button" class="clear-filters">Limpiar filtros</button>' : ''}`;
    const clearBtn = footer.querySelector('.clear-filters');
    if (clearBtn && clearAndRefresh) clearBtn.addEventListener('click', clearAndRefresh);
  }
  function clearTableFiltersAndRefresh(tableId, searchId, onRefresh) {
    const tbl = qs('#' + tableId);
    if (tbl) tbl.querySelectorAll('.filter-row .filter-input, .filter-row .filter-date-select, .filter-row .filter-date-input').forEach(inp => { inp.value = ''; });
    if (searchId) { const s = qs(searchId); if (s) s.value = ''; }
    if (onRefresh) onRefresh();
  }

  // ----- CLIENTES -----
  function renderClientes(data) {
    const tbody = qs('#tabla-clientes tbody');
    tbody.innerHTML = '';
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty">No hay clientes. Carga datos demo o agrega uno nuevo.</td></tr>';
      return;
    }
    data.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.id}</td>
        <td>${escapeHtml(c.codigo || '')}</td>
        <td>${escapeHtml(c.nombre || '')}</td>
        <td>${escapeHtml(c.rfc || '')}</td>
        <td>${escapeHtml(c.contacto || '')}</td>
        <td>${escapeHtml(c.telefono || '')}</td>
        <td>${escapeHtml(c.ciudad || '')}</td>
        <td class="th-actions">
          <button type="button" class="btn small primary btn-edit-cliente" data-id="${c.id}"><i class="fas fa-edit"></i></button>
          <button type="button" class="btn small danger btn-delete-cliente" data-id="${c.id}"><i class="fas fa-trash"></i></button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    updateTableFooter('tabla-clientes', data.length, clientesCache.length, () => clearTableFiltersAndRefresh('tabla-clientes', '#buscar-clientes', applyClientesFiltersAndRender));
    tbody.querySelectorAll('.btn-edit-cliente').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const c = data.find(x => x.id == btn.dataset.id); if (c) openModalCliente(c); });
    });
    tbody.querySelectorAll('.btn-delete-cliente').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); if (confirmar('¿Eliminar este cliente?')) deleteCliente(btn.dataset.id); });
    });
  }

  async function deleteCliente(id) {
    try {
      await fetchJson(API + '/clientes/' + id, { method: 'DELETE' });
      showToast('Cliente eliminado correctamente.', 'success');
      loadClientes();
    } catch (e) { showToast(parseApiError(e) || 'No se pudo eliminar.', 'error'); }
  }

  async function loadClientes() {
    showLoading();
    try {
      const data = await fetchJson(API + '/clientes');
      clientesCache = data;
      const q = (qs('#buscar-clientes') && qs('#buscar-clientes').value || '').trim();
      let filtered = applyFilters(clientesCache, getFilterValues('#tabla-clientes'), 'tabla-clientes');
      if (q) filtered = filtered.filter(c => [c.nombre, c.codigo, c.rfc].some(v => normalizeForSearch(v).includes(normalizeForSearch(q))));
      renderClientes(filtered);
    } catch (e) { renderClientes([]); console.error(e); }
    finally { hideLoading(); }
  }

  // ----- REFACCIONES -----
  function renderRefacciones(data) {
    const tbody = qs('#tabla-refacciones tbody');
    tbody.innerHTML = '';
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty">No hay refacciones. Carga datos demo o agrega una nueva.</td></tr>';
      return;
    }
    data.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.id}</td>
        <td>${escapeHtml(r.codigo || '')}</td>
        <td>${escapeHtml(r.descripcion || '')}</td>
        <td>${escapeHtml(r.marca || '')}</td>
        <td>${escapeHtml(r.origen || '')}</td>
        <td>${typeof r.precio_unitario === 'number' ? '$' + r.precio_unitario.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : ''}</td>
        <td>${escapeHtml(r.unidad || 'PZA')}</td>
        <td class="th-actions">
          <button type="button" class="btn small primary btn-edit-ref" data-id="${r.id}"><i class="fas fa-edit"></i></button>
          <button type="button" class="btn small danger btn-delete-ref" data-id="${r.id}"><i class="fas fa-trash"></i></button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    updateTableFooter('tabla-refacciones', data.length, refaccionesCache.length, () => clearTableFiltersAndRefresh('tabla-refacciones', '#buscar-refacciones', applyRefaccionesFiltersAndRender));
    tbody.querySelectorAll('.btn-edit-ref').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const r = data.find(x => x.id == btn.dataset.id); if (r) openModalRefaccion(r); });
    });
    tbody.querySelectorAll('.btn-delete-ref').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); if (confirmar('¿Eliminar esta refacción?')) deleteRefaccion(btn.dataset.id); });
    });
  }

  async function deleteRefaccion(id) {
    try {
      await fetchJson(API + '/refacciones/' + id, { method: 'DELETE' });
      showToast('Refacción eliminada correctamente.', 'success');
      loadRefacciones();
    } catch (e) { showToast(parseApiError(e) || 'No se pudo eliminar.', 'error'); }
  }

  async function loadRefacciones() {
    showLoading();
    try {
      const data = await fetchJson(API + '/refacciones');
      refaccionesCache = data;
      const q = (qs('#buscar-refacciones') && qs('#buscar-refacciones').value || '').trim();
      let filtered = applyFilters(refaccionesCache, getFilterValues('#tabla-refacciones'), 'tabla-refacciones');
      if (q) filtered = filtered.filter(r => [r.codigo, r.descripcion, r.marca].some(v => normalizeForSearch(v).includes(normalizeForSearch(q))));
      renderRefacciones(filtered);
    } catch (e) { renderRefacciones([]); console.error(e); }
    finally { hideLoading(); }
  }

  // ----- MÁQUINAS -----
  function renderMaquinas(data) {
    const tbody = qs('#tabla-maquinas tbody');
    tbody.innerHTML = '';
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty">No hay máquinas. Carga datos demo o agrega una nueva.</td></tr>';
      return;
    }
    data.forEach(m => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${m.id}</td>
        <td>${escapeHtml(m.nombre || '')}</td>
        <td>${escapeHtml(m.cliente_nombre || '')}</td>
        <td>${escapeHtml(m.marca || '')}</td>
        <td>${escapeHtml(m.modelo || '')}</td>
        <td>${escapeHtml(m.numero_serie || '')}</td>
        <td>${escapeHtml(m.ubicacion || '')}</td>
        <td class="th-actions">
          <button type="button" class="btn small primary btn-edit-maq" data-id="${m.id}"><i class="fas fa-edit"></i></button>
          <button type="button" class="btn small danger btn-delete-maq" data-id="${m.id}"><i class="fas fa-trash"></i></button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    updateTableFooter('tabla-maquinas', data.length, maquinasCache.length, () => clearTableFiltersAndRefresh('tabla-maquinas', null, applyMaquinasFiltersAndRender));
    tbody.querySelectorAll('.btn-edit-maq').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const m = data.find(x => x.id == btn.dataset.id); if (m) openModalMaquina(m); });
    });
    tbody.querySelectorAll('.btn-delete-maq').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); if (confirmar('¿Eliminar esta máquina?')) deleteMaquina(btn.dataset.id); });
    });
  }

  async function deleteMaquina(id) {
    try {
      await fetchJson(API + '/maquinas/' + id, { method: 'DELETE' });
      showToast('Máquina eliminada correctamente.', 'success');
      loadMaquinas();
    } catch (e) { showToast(parseApiError(e) || 'No se pudo eliminar.', 'error'); }
  }

  async function loadMaquinas() {
    showLoading();
    const clienteId = qs('#filtro-cliente-maq') && qs('#filtro-cliente-maq').value;
    const url = clienteId ? `${API}/maquinas?cliente_id=${clienteId}` : `${API}/maquinas`;
    try {
      const data = await fetchJson(url);
      maquinasCache = data;
      const filtered = applyFilters(maquinasCache, getFilterValues('#tabla-maquinas'), 'tabla-maquinas');
      renderMaquinas(filtered);
    } catch (e) { renderMaquinas([]); console.error(e); }
    finally { hideLoading(); }
  }

  // ----- COTIZACIONES -----
  function renderCotizaciones(data, totalInSystem) {
    const emptyEl = qs('#cotizaciones-empty');
    const listEl = qs('#cotizaciones-list');
    const tbody = qs('#tabla-cotizaciones tbody');
    tbody.innerHTML = '';
    const hasFilteredResults = data && data.length > 0;
    const hasAnyInSystem = totalInSystem != null ? totalInSystem > 0 : (data && data.length > 0);
    if (!hasAnyInSystem) {
      emptyEl.classList.remove('hidden');
      listEl.classList.add('hidden');
      return;
    }
    emptyEl.classList.add('hidden');
    listEl.classList.remove('hidden');
    updateTableFooter('tabla-cotizaciones', (data && data.length) || 0, cotizacionesCache.length, () => clearTableFiltersAndRefresh('tabla-cotizaciones', null, applyCotizacionesFiltersAndRender));
    if (!hasFilteredResults) {
      const cols = 7;
      tbody.innerHTML = `<tr><td colspan="${cols}" class="empty filter-empty"><span>No hay resultados con los filtros aplicados.</span> <button type="button" class="btn small primary clear-filters-inline">Quitar filtros</button></td></tr>`;
      tbody.querySelector('.clear-filters-inline').addEventListener('click', () => clearTableFiltersAndRefresh('tabla-cotizaciones', null, applyCotizacionesFiltersAndRender));
      return;
    }
    data.forEach(c => {
      const vig = getVigenciaSemaphore(c);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(c.folio || '')}</td>
        <td>${escapeHtml(c.cliente_nombre || '')}</td>
        <td>${escapeHtml(c.tipo || '')}</td>
        <td>${escapeHtml(c.fecha || '')}</td>
        <td>${typeof c.total === 'number' ? '$' + c.total.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : ''}</td>
        <td class="sla-cell"><span class="semaforo semaforo-${vig.color}" title="${escapeHtml(vig.label)}"><i class="fas ${vig.icon}"></i> ${escapeHtml(vig.label)}</span></td>
        <td class="th-actions">
          <button type="button" class="btn small primary btn-edit-cot" data-id="${c.id}"><i class="fas fa-edit"></i></button>
          <button type="button" class="btn small danger btn-delete-cot" data-id="${c.id}"><i class="fas fa-trash"></i></button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.btn-edit-cot').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); editCotizacion(btn.dataset.id); });
    });
    tbody.querySelectorAll('.btn-delete-cot').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); if (confirmar('¿Eliminar esta cotización?')) deleteCotizacion(btn.dataset.id); });
    });
  }

  async function loadCotizaciones() {
    showLoading();
    try {
      const data = await fetchJson(API + '/cotizaciones');
      cotizacionesCache = Array.isArray(data) ? data : [];
      const filtered = applyFilters(cotizacionesCache, getFilterValues('#tabla-cotizaciones'), 'tabla-cotizaciones');
      renderCotizaciones(filtered, cotizacionesCache.length);
    } catch (e) { renderCotizaciones([]); }
    finally { hideLoading(); }
  }

  async function deleteCotizacion(id) {
    try {
      await fetchJson(API + '/cotizaciones/' + id, { method: 'DELETE' });
      showToast('Cotización eliminada correctamente.', 'success');
      loadCotizaciones();
    } catch (e) { showToast(parseApiError(e) || 'No se pudo eliminar.', 'error'); }
  }

  // ----- INCIDENTES -----
  function renderIncidentes(data, totalInSystem) {
    const emptyEl = qs('#incidentes-empty');
    const listEl = qs('#incidentes-list');
    const tbody = qs('#tabla-incidentes tbody');
    tbody.innerHTML = '';
    const hasFilteredResults = data && data.length > 0;
    const hasAnyInSystem = totalInSystem != null ? totalInSystem > 0 : (data && data.length > 0);
    if (!hasAnyInSystem) {
      emptyEl.classList.remove('hidden');
      listEl.classList.add('hidden');
      return;
    }
    emptyEl.classList.add('hidden');
    listEl.classList.remove('hidden');
    updateTableFooter('tabla-incidentes', (data && data.length) || 0, incidentesCache.length, () => clearTableFiltersAndRefresh('tabla-incidentes', null, applyIncidentesFiltersAndRender));
    if (!hasFilteredResults) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty filter-empty"><span>No hay resultados con los filtros aplicados.</span> <button type="button" class="btn small primary clear-filters-inline">Quitar filtros</button></td></tr>';
      tbody.querySelector('.clear-filters-inline').addEventListener('click', () => clearTableFiltersAndRefresh('tabla-incidentes', null, applyIncidentesFiltersAndRender));
      return;
    }
    data.forEach(i => {
      const sla = getSlaSemaphore(i);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(i.folio || '')}</td>
        <td>${escapeHtml(i.cliente_nombre || '')}</td>
        <td>${escapeHtml(i.maquina_nombre || '')}</td>
        <td>${escapeHtml((i.descripcion || '').slice(0, 45))}${(i.descripcion && i.descripcion.length > 45) ? '…' : ''}</td>
        <td>${(i.fecha_reporte || '').toString().slice(0, 10) || '—'}</td>
        <td>${(i.fecha_cerrado || '').toString().slice(0, 10) || '—'}</td>
        <td>${escapeHtml(i.prioridad || '')}</td>
        <td>${escapeHtml(i.estatus || '')}</td>
        <td class="sla-cell"><span class="semaforo semaforo-${sla.color}" title="${escapeHtml(sla.label)}"><i class="fas ${sla.icon}"></i> ${escapeHtml(sla.label)}</span></td>
        <td class="th-actions">
          <button type="button" class="btn small primary btn-edit-inc" data-id="${i.id}"><i class="fas fa-edit"></i></button>
          <button type="button" class="btn small danger btn-delete-inc" data-id="${i.id}"><i class="fas fa-trash"></i></button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.btn-edit-inc').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); editIncidente(btn.dataset.id); });
    });
    tbody.querySelectorAll('.btn-delete-inc').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); if (confirmar('¿Eliminar este incidente?')) deleteIncidente(btn.dataset.id); });
    });
  }

  async function loadIncidentes() {
    showLoading();
    try {
      const data = await fetchJson(API + '/incidentes');
      incidentesCache = Array.isArray(data) ? data : [];
      const filtered = applyFilters(incidentesCache, getFilterValues('#tabla-incidentes'), 'tabla-incidentes');
      renderIncidentes(filtered, incidentesCache.length);
    } catch (e) { renderIncidentes([]); }
    finally { hideLoading(); }
  }

  async function deleteIncidente(id) {
    try {
      await fetchJson(API + '/incidentes/' + id, { method: 'DELETE' });
      showToast('Incidente eliminado correctamente.', 'success');
      loadIncidentes();
    } catch (e) { showToast(parseApiError(e) || 'No se pudo eliminar.', 'error'); }
  }

  // ----- BITÁCORAS -----
  function renderBitacoras(data, totalInSystem) {
    const emptyEl = qs('#bitacoras-empty');
    const listEl = qs('#bitacoras-list');
    const tbody = qs('#tabla-bitacoras tbody');
    tbody.innerHTML = '';
    const hasFilteredResults = data && data.length > 0;
    const hasAnyInSystem = totalInSystem != null ? totalInSystem > 0 : (data && data.length > 0);
    if (!hasAnyInSystem) {
      emptyEl.classList.remove('hidden');
      listEl.classList.add('hidden');
      return;
    }
    emptyEl.classList.add('hidden');
    listEl.classList.remove('hidden');
    updateTableFooter('tabla-bitacoras', (data && data.length) || 0, bitacorasCache.length, () => clearTableFiltersAndRefresh('tabla-bitacoras', null, applyBitacorasFiltersAndRender));
    if (!hasFilteredResults) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty filter-empty"><span>No hay resultados con los filtros aplicados.</span> <button type="button" class="btn small primary clear-filters-inline">Quitar filtros</button></td></tr>';
      tbody.querySelector('.clear-filters-inline').addEventListener('click', () => clearTableFiltersAndRefresh('tabla-bitacoras', null, applyBitacorasFiltersAndRender));
      return;
    }
    data.forEach(b => {
      const est = getEstadoRegistroSemaphore(b);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(b.fecha || '')}</td>
        <td>${escapeHtml(b.incidente_folio || '—')}</td>
        <td>${escapeHtml(b.cotizacion_folio || '—')}</td>
        <td>${escapeHtml(b.tecnico || '')}</td>
        <td>${escapeHtml((b.actividades || '').slice(0, 35))}${(b.actividades && b.actividades.length > 35) ? '…' : ''}</td>
        <td>${b.tiempo_horas != null ? b.tiempo_horas : '—'}</td>
        <td>${escapeHtml((b.materiales_usados || '').slice(0, 25))}${(b.materiales_usados && b.materiales_usados.length > 25) ? '…' : ''}</td>
        <td class="sla-cell"><span class="semaforo semaforo-${est.color}" title="${escapeHtml(est.label)}"><i class="fas ${est.icon}"></i> ${escapeHtml(est.label)}</span></td>
        <td class="th-actions">
          <button type="button" class="btn small primary btn-edit-bit" data-id="${b.id}"><i class="fas fa-edit"></i></button>
          <button type="button" class="btn small danger btn-delete-bit" data-id="${b.id}"><i class="fas fa-trash"></i></button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.btn-edit-bit').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); editBitacora(btn.dataset.id); });
    });
    tbody.querySelectorAll('.btn-delete-bit').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); if (confirmar('¿Eliminar este registro de bitácora?')) deleteBitacora(btn.dataset.id); });
    });
  }

  async function loadBitacoras() {
    showLoading();
    try {
      const data = await fetchJson(API + '/bitacoras');
      bitacorasCache = Array.isArray(data) ? data : [];
      const filtered = applyFilters(bitacorasCache, getFilterValues('#tabla-bitacoras'), 'tabla-bitacoras');
      renderBitacoras(filtered, bitacorasCache.length);
    } catch (e) { renderBitacoras([]); }
    finally { hideLoading(); }
  }

  async function deleteBitacora(id) {
    try {
      await fetchJson(API + '/bitacoras/' + id, { method: 'DELETE' });
      showToast('Registro de bitácora eliminado correctamente.', 'success');
      loadBitacoras();
    } catch (e) { showToast(parseApiError(e) || 'No se pudo eliminar.', 'error'); }
  }

  // ----- MODAL GENÉRICO ----- Focus trap, foco al abrir/cerrar, Escape cierra
  function openModal(title, bodyHtml, onClose) {
    const modal = qs('#modal');
    const previousFocus = document.activeElement;
    qs('#modal-title').textContent = title;
    qs('#modal-body').innerHTML = bodyHtml;
    modal.classList.remove('hidden');
    clearInvalidMarks();
    const focusables = () => modal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
    const firstFocusable = () => focusables()[0];
    const lastFocusable = () => { const f = focusables(); return f[f.length - 1]; };
    const handleKey = (e) => {
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab') return;
      const fs = focusables();
      if (fs.length === 0) return;
      if (e.shiftKey) {
        if (document.activeElement === firstFocusable()) { e.preventDefault(); lastFocusable().focus(); }
      } else {
        if (document.activeElement === lastFocusable()) { e.preventDefault(); firstFocusable().focus(); }
      }
    };
    const close = () => {
      modal.classList.add('hidden');
      modal.removeEventListener('keydown', handleKey);
      clearInvalidMarks();
      if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
      if (onClose) onClose();
    };
    modal.addEventListener('keydown', handleKey);
    qs('#modal .close').onclick = close;
    const cancelBtn = qs('#modal-body #modal-btn-cancel');
    if (cancelBtn) cancelBtn.onclick = close;
    setTimeout(() => { const el = firstFocusable(); if (el) el.focus(); }, 50);
    return close;
  }

  // ----- MODAL CLIENTE -----
  function openModalCliente(cliente) {
    const isNew = !cliente || !cliente.id;
    const body = `
      <div class="client-upload-area">
        <label class="upload-label"><i class="fas fa-file-image"></i> Constancia o datos fiscales (imagen)</label>
        <p class="upload-hint">Sube una foto o captura (JPG, PNG) para detectar nombre, RFC, dirección, etc. automáticamente.</p>
        <input type="file" id="m-file-fiscal" accept="image/jpeg,image/png,image/gif,image/webp" class="input-file">
        <div id="m-upload-status" class="upload-status hidden"></div>
        <div id="m-extract-hints" class="extract-hints hidden"></div>
      </div>
      <div class="form-group"><label>Código</label><input type="text" id="m-codigo" maxlength="20" value="${escapeHtml(cliente && cliente.codigo) || ''}" placeholder="Opcional"></div>
      <div class="form-group"><label>Nombre *</label><input type="text" id="m-nombre" maxlength="200" value="${escapeHtml(cliente && cliente.nombre) || ''}" placeholder="Razón social o nombre completo" required></div>
      <div class="form-group"><label>RFC</label><input type="text" id="m-rfc" maxlength="13" value="${escapeHtml(cliente && cliente.rfc) || ''}" placeholder="12 o 13 caracteres alfanuméricos" pattern="[A-Za-z0-9]{12,13}" title="12 o 13 caracteres"></div>
      <div class="form-group"><label>Contacto</label><input type="text" id="m-contacto" maxlength="100" value="${escapeHtml(cliente && cliente.contacto) || ''}"></div>
      <div class="form-group"><label>Teléfono</label><input type="tel" id="m-telefono" maxlength="20" value="${escapeHtml(cliente && cliente.telefono) || ''}" placeholder="Solo números, +, -, espacios" inputmode="tel"></div>
      <div class="form-group"><label>Email</label><input type="email" id="m-email" maxlength="100" value="${escapeHtml(cliente && cliente.email) || ''}"></div>
      <div class="form-group"><label>Dirección</label><input type="text" id="m-direccion" maxlength="250" value="${escapeHtml(cliente && cliente.direccion) || ''}"></div>
      <div class="form-group"><label>Ciudad</label><input type="text" id="m-ciudad" maxlength="80" value="${escapeHtml(cliente && cliente.ciudad) || ''}"></div>
      <div class="form-actions">
        <button type="button" class="btn primary" id="m-save"><i class="fas fa-save"></i> Guardar</button>
        <button type="button" class="btn" id="modal-btn-cancel">Cancelar</button>
      </div>
    `;
    openModal(isNew ? 'Nuevo cliente' : 'Editar cliente', body);
    onlyNumbers(qs('#m-telefono'));
    qs('#m-rfc').addEventListener('input', function () { this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 13); });
    const fileInput = qs('#m-file-fiscal');
    const statusEl = qs('#m-upload-status');
    const hintsEl = qs('#m-extract-hints');
    if (fileInput && statusEl && hintsEl) {
      fileInput.addEventListener('change', async function () {
        const file = this.files && this.files[0];
        if (!file) return;
        const mime = file.type || 'image/jpeg';
        if (!/^image\/(jpeg|png|gif|webp)$/.test(mime)) {
          statusEl.textContent = 'Solo imágenes JPG, PNG, GIF o WebP.';
          statusEl.classList.remove('hidden', 'upload-ok');
          statusEl.classList.add('upload-error');
          return;
        }
        statusEl.textContent = 'Analizando imagen…';
        statusEl.classList.remove('hidden', 'upload-ok', 'upload-error');
        statusEl.classList.add('upload-loading');
        hintsEl.classList.add('hidden');
        hintsEl.innerHTML = '';
        try {
          const base64 = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => {
              const s = r.result;
              resolve(s && s.indexOf('base64,') !== -1 ? s.split('base64,')[1] : s);
            };
            r.onerror = reject;
            r.readAsDataURL(file);
          });
          const data = await fetchJson(API + '/ai/extract-client', { method: 'POST', body: JSON.stringify({ fileBase64: base64, mimeType: mime }) });
          const d = data.data || {};
          if (d.nombre) qs('#m-nombre').value = d.nombre;
          if (d.rfc) qs('#m-rfc').value = d.rfc;
          if (d.direccion) qs('#m-direccion').value = d.direccion;
          if (d.ciudad) qs('#m-ciudad').value = d.ciudad;
          if (d.email) qs('#m-email').value = d.email;
          if (d.telefono) qs('#m-telefono').value = d.telefono;
          statusEl.textContent = 'Datos detectados correctamente.';
          statusEl.classList.remove('upload-loading', 'upload-error');
          statusEl.classList.add('upload-ok');
          const missing = data.missing || [];
          if (missing.length) {
            const labels = { nombre: 'Nombre', rfc: 'RFC', direccion: 'Dirección', ciudad: 'Ciudad', email: 'Email', telefono: 'Teléfono', codigoPostal: 'C.P.', regimenFiscal: 'Régimen fiscal' };
            hintsEl.innerHTML = '<span class="hint-title"><i class="fas fa-info-circle"></i> Revisa o completa:</span> ' + missing.map(m => labels[m] || m).join(', ');
            hintsEl.classList.remove('hidden');
          }
        } catch (e) {
          let msg = e.message;
          try { const o = JSON.parse(msg); if (o.error) msg = o.error; if (o.hint) msg += ' ' + o.hint; } catch (_) {}
          statusEl.textContent = msg;
          statusEl.classList.remove('upload-loading', 'upload-ok');
          statusEl.classList.add('upload-error');
        }
      });
    }
    qs('#m-save').onclick = async () => {
      clearInvalidMarks();
      const nombre = qs('#m-nombre').value.trim();
      const rfc = qs('#m-rfc').value.trim() || null;
      const email = qs('#m-email').value.trim() || null;
      let err = validateRequired(nombre, 'Nombre es obligatorio');
      if (err) { markInvalid('m-nombre', err); return; }
      err = validateRFC(rfc);
      if (err) { markInvalid('m-rfc', err); return; }
      err = validateEmail(email);
      if (err) { markInvalid('m-email', err); return; }
      const payload = {
        codigo: qs('#m-codigo').value.trim() || null,
        nombre,
        rfc,
        contacto: qs('#m-contacto').value.trim() || null,
        telefono: qs('#m-telefono').value.trim() || null,
        email: email || null,
        direccion: qs('#m-direccion').value.trim() || null,
        ciudad: qs('#m-ciudad').value.trim() || null,
      };
      const btn = qs('#m-save');
      const origText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';
      try {
        if (isNew) await fetchJson(API + '/clientes', { method: 'POST', body: JSON.stringify(payload) });
        else await fetchJson(API + '/clientes/' + cliente.id, { method: 'PUT', body: JSON.stringify(payload) });
        qs('#modal').classList.add('hidden');
        showToast(isNew ? 'Cliente guardado correctamente.' : 'Cliente actualizado correctamente.', 'success');
        loadClientes();
        fillClientesSelect();
      } catch (e) { showToast(parseApiError(e) || 'No se pudo guardar. Revisa los datos e intenta de nuevo.', 'error'); }
      finally { btn.disabled = false; btn.innerHTML = origText; }
    };
  }

  // ----- MODAL REFACCIÓN -----
  function openModalRefaccion(refaccion) {
    const isNew = !refaccion || !refaccion.id;
    const body = `
      <div class="form-group"><label>Código *</label><input type="text" id="m-codigo" maxlength="50" value="${escapeHtml(refaccion && refaccion.codigo) || ''}" required placeholder="Identificador único"></div>
      <div class="form-group"><label>Descripción *</label><input type="text" id="m-descripcion" maxlength="250" value="${escapeHtml(refaccion && refaccion.descripcion) || ''}" required></div>
      <div class="form-row">
        <div class="form-group"><label>Marca</label><input type="text" id="m-marca" maxlength="80" value="${escapeHtml(refaccion && refaccion.marca) || ''}"></div>
        <div class="form-group"><label>Origen</label><input type="text" id="m-origen" maxlength="80" value="${escapeHtml(refaccion && refaccion.origen) || ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Precio unitario</label><input type="number" id="m-precio" step="0.01" min="0" value="${refaccion && refaccion.precio_unitario != null ? refaccion.precio_unitario : ''}" placeholder="0"></div>
        <div class="form-group"><label>Unidad</label><input type="text" id="m-unidad" maxlength="20" value="${escapeHtml(refaccion && refaccion.unidad) || 'PZA'}"></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn primary" id="m-save"><i class="fas fa-save"></i> Guardar</button>
        <button type="button" class="btn" id="modal-btn-cancel">Cancelar</button>
      </div>
    `;
    openModal(isNew ? 'Nueva refacción' : 'Editar refacción', body);
    qs('#m-save').onclick = async () => {
      clearInvalidMarks();
      const codigo = qs('#m-codigo').value.trim();
      const descripcion = qs('#m-descripcion').value.trim();
      const precio = parseFloat(qs('#m-precio').value);
      let err = validateRequired(codigo, 'Código es obligatorio');
      if (err) { markInvalid('m-codigo', err); return; }
      err = validateRequired(descripcion, 'Descripción es obligatoria');
      if (err) { markInvalid('m-descripcion', err); return; }
      if (isNaN(precio) || precio < 0) { markInvalid('m-precio', 'El precio debe ser mayor o igual a 0'); return; }
      const payload = {
        codigo,
        descripcion,
        marca: qs('#m-marca').value.trim() || null,
        origen: qs('#m-origen').value.trim() || null,
        precio_unitario: precio,
        unidad: qs('#m-unidad').value.trim() || 'PZA',
      };
      const btn = qs('#m-save');
      const origText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';
      try {
        if (isNew) await fetchJson(API + '/refacciones', { method: 'POST', body: JSON.stringify(payload) });
        else await fetchJson(API + '/refacciones/' + refaccion.id, { method: 'PUT', body: JSON.stringify(payload) });
        qs('#modal').classList.add('hidden');
        showToast(isNew ? 'Refacción guardada correctamente.' : 'Refacción actualizada correctamente.', 'success');
        loadRefacciones();
        if (typeof fillRefaccionesSelect === 'function') fillRefaccionesSelect();
      } catch (e) { showToast(parseApiError(e) || 'No se pudo guardar. Revisa los datos.', 'error'); }
      finally { btn.disabled = false; btn.innerHTML = origText; }
    };
  }

  // ----- MODAL MÁQUINA -----
  async function openModalMaquina(maquina) {
    const isNew = !maquina || !maquina.id;
    const clientes = await fetchJson(API + '/clientes').catch(() => []);
    const options = clientes.map(c => `<option value="${c.id}" ${maquina && maquina.cliente_id == c.id ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('');
    const body = `
      <div class="form-group"><label>Cliente *</label><select id="m-cliente_id">${options}</select></div>
      <div class="form-group"><label>Nombre *</label><input type="text" id="m-nombre" maxlength="150" value="${escapeHtml(maquina && maquina.nombre) || ''}" required placeholder="Nombre o identificador de la máquina"></div>
      <div class="form-row">
        <div class="form-group"><label>Marca</label><input type="text" id="m-marca" maxlength="80" value="${escapeHtml(maquina && maquina.marca) || ''}"></div>
        <div class="form-group"><label>Modelo</label><input type="text" id="m-modelo" maxlength="80" value="${escapeHtml(maquina && maquina.modelo) || ''}"></div>
      </div>
      <div class="form-group"><label>Nº Serie</label><input type="text" id="m-numero_serie" maxlength="80" value="${escapeHtml(maquina && maquina.numero_serie) || ''}"></div>
      <div class="form-group"><label>Ubicación</label><input type="text" id="m-ubicacion" maxlength="150" value="${escapeHtml(maquina && maquina.ubicacion) || ''}"></div>
      <div class="form-actions">
        <button type="button" class="btn primary" id="m-save"><i class="fas fa-save"></i> Guardar</button>
        <button type="button" class="btn" id="modal-btn-cancel">Cancelar</button>
      </div>
    `;
    openModal(isNew ? 'Nueva máquina' : 'Editar máquina', body);
    qs('#m-save').onclick = async () => {
      clearInvalidMarks();
      const nombre = qs('#m-nombre').value.trim();
      let err = validateRequired(nombre, 'Nombre de la máquina es obligatorio');
      if (err) { markInvalid('m-nombre', err); return; }
      const payload = {
        cliente_id: parseInt(qs('#m-cliente_id').value, 10),
        nombre,
        marca: qs('#m-marca').value.trim() || null,
        modelo: qs('#m-modelo').value.trim() || null,
        numero_serie: qs('#m-numero_serie').value.trim() || null,
        ubicacion: qs('#m-ubicacion').value.trim() || null,
      };
      const btn = qs('#m-save');
      const origText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';
      try {
        if (isNew) await fetchJson(API + '/maquinas', { method: 'POST', body: JSON.stringify(payload) });
        else await fetchJson(API + '/maquinas/' + maquina.id, { method: 'PUT', body: JSON.stringify(payload) });
        qs('#modal').classList.add('hidden');
        showToast(isNew ? 'Máquina guardada correctamente.' : 'Máquina actualizada correctamente.', 'success');
        loadMaquinas();
      } catch (e) { showToast(parseApiError(e) || 'No se pudo guardar. Revisa los datos.', 'error'); }
      finally { btn.disabled = false; btn.innerHTML = origText; }
    };
  }

  // ----- MODAL COTIZACIÓN -----
  async function openModalCotizacion(cot) {
    const isNew = !cot || !cot.id;
    const clientes = await fetchJson(API + '/clientes').catch(() => []);
    const options = clientes.map(c => `<option value="${c.id}" ${cot && cot.cliente_id == c.id ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('');
    const subtotalVal = cot && cot.subtotal != null ? cot.subtotal : 0;
    const ivaVal = cot && cot.iva != null ? cot.iva : subtotalVal * IVA_PORCENTAJE;
    const totalVal = cot && cot.total != null ? cot.total : subtotalVal + ivaVal;
    const body = `
      <div class="form-group"><label>Cliente *</label><select id="m-cliente_id">${options}</select></div>
      <div class="form-row">
        <div class="form-group"><label>Tipo</label><select id="m-tipo"><option value="refacciones" ${cot && cot.tipo === 'refacciones' ? 'selected' : ''}>Refacciones</option><option value="mano_obra" ${cot && cot.tipo === 'mano_obra' ? 'selected' : ''}>Mano de obra</option></select></div>
        <div class="form-group"><label>Fecha *</label><input type="date" id="m-fecha" value="${cot && cot.fecha ? cot.fecha.slice(0, 10) : new Date().toISOString().slice(0, 10)}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Subtotal</label><input type="number" id="m-subtotal" step="0.01" min="0" value="${subtotalVal}" placeholder="0"></div>
        <div class="form-group"><label>IVA (16%)</label><input type="text" id="m-iva" class="input-readonly" readonly value="${(ivaVal).toFixed(2)}" title="Calculado automáticamente"></div>
        <div class="form-group"><label>Total</label><input type="text" id="m-total" class="input-readonly" readonly value="${(totalVal).toFixed(2)}" title="Calculado automáticamente"></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn primary" id="m-save"><i class="fas fa-save"></i> Guardar</button>
        <button type="button" class="btn" id="modal-btn-cancel">Cancelar</button>
      </div>
    `;
    openModal(isNew ? 'Nueva cotización' : 'Editar cotización', body);
    const updateIvaTotal = () => {
      const st = parseFloat(qs('#m-subtotal').value) || 0;
      const iv = st * IVA_PORCENTAJE;
      const tot = st + iv;
      qs('#m-iva').value = iv.toFixed(2);
      qs('#m-total').value = tot.toFixed(2);
    };
    qs('#m-subtotal').addEventListener('input', updateIvaTotal);
    qs('#m-subtotal').addEventListener('change', updateIvaTotal);
    qs('#m-save').onclick = async () => {
      clearInvalidMarks();
      const st = parseFloat(qs('#m-subtotal').value) || 0;
      const iv = parseFloat(qs('#m-iva').value) || (st * IVA_PORCENTAJE);
      const tot = parseFloat(qs('#m-total').value) || (st + iv);
      const fecha = qs('#m-fecha').value;
      let err = validateRequired(fecha, 'La fecha es obligatoria');
      if (err) { markInvalid('m-fecha', err); return; }
      if (st < 0) { markInvalid('m-subtotal', 'El subtotal debe ser mayor o igual a 0'); return; }
      const payload = {
        cliente_id: parseInt(qs('#m-cliente_id').value, 10),
        tipo: qs('#m-tipo').value,
        fecha,
        subtotal: st,
        iva: Math.round(iv * 100) / 100,
        total: Math.round(tot * 100) / 100,
      };
      const btn = qs('#m-save');
      const origText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';
      try {
        if (isNew) await fetchJson(API + '/cotizaciones', { method: 'POST', body: JSON.stringify(payload) });
        else { payload.folio = cot.folio; await fetchJson(API + '/cotizaciones/' + cot.id, { method: 'PUT', body: JSON.stringify(payload) }); }
        qs('#modal').classList.add('hidden');
        showToast(isNew ? 'Cotización guardada correctamente.' : 'Cotización actualizada correctamente.', 'success');
        loadCotizaciones();
      } catch (e) { showToast(parseApiError(e) || 'No se pudo guardar. Revisa los datos.', 'error'); }
      finally { btn.disabled = false; btn.innerHTML = origText; }
    };
  }

  async function editCotizacion(id) {
    try {
      const cot = await fetchJson(API + '/cotizaciones/' + id);
      openModalCotizacion(cot);
    } catch (e) { showToast(parseApiError(e) || 'No se pudo cargar la cotización.', 'error'); }
  }

  // ----- MODAL INCIDENTE -----
  async function openModalIncidente(inc) {
    const isNew = !inc || !inc.id;
    const [clientes, maquinas] = await Promise.all([fetchJson(API + '/clientes').catch(() => []), fetchJson(API + '/maquinas').catch(() => [])]);
    const clientesOpt = clientes.map(c => `<option value="${c.id}" ${inc && inc.cliente_id == c.id ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('');
    const maquinasOpt = maquinas.map(m => `<option value="${m.id}" ${inc && inc.maquina_id == m.id ? 'selected' : ''}>${escapeHtml(m.nombre)}</option>`).join('');
    const body = `
      <div class="form-group"><label>Cliente *</label><select id="m-cliente_id">${clientesOpt}</select></div>
      <div class="form-group"><label>Máquina</label><select id="m-maquina_id"><option value="">— Ninguna —</option>${maquinasOpt}</select></div>
      <div class="form-group"><label>Descripción *</label><textarea id="m-descripcion" rows="3" maxlength="2000" placeholder="Describe el incidente">${escapeHtml(inc && inc.descripcion) || ''}</textarea></div>
      <div class="form-row">
        <div class="form-group"><label>Prioridad</label><select id="m-prioridad"><option value="baja" ${inc && inc.prioridad === 'baja' ? 'selected' : ''}>Baja</option><option value="media" ${!inc || inc.prioridad === 'media' ? 'selected' : ''}>Media</option><option value="alta" ${inc && inc.prioridad === 'alta' ? 'selected' : ''}>Alta</option><option value="critica" ${inc && inc.prioridad === 'critica' ? 'selected' : ''}>Crítica</option></select></div>
        <div class="form-group"><label>Estatus</label><select id="m-estatus"><option value="abierto" ${!inc || inc.estatus === 'abierto' ? 'selected' : ''}>Abierto</option><option value="en_proceso" ${inc && inc.estatus === 'en_proceso' ? 'selected' : ''}>En proceso</option><option value="cerrado" ${inc && inc.estatus === 'cerrado' ? 'selected' : ''}>Cerrado</option><option value="cancelado" ${inc && inc.estatus === 'cancelado' ? 'selected' : ''}>Cancelado</option></select></div>
        <div class="form-group"><label>Fecha incidente *</label><input type="date" id="m-fecha_reporte" value="${inc && inc.fecha_reporte ? inc.fecha_reporte.slice(0, 10) : new Date().toISOString().slice(0, 10)}"></div>
        <div class="form-group"><label>Fecha cerrado</label><input type="date" id="m-fecha_cerrado" value="${inc && inc.fecha_cerrado ? inc.fecha_cerrado.slice(0, 10) : ''}"></div>
      </div>
      <div class="form-group"><label>Técnico responsable</label><input type="text" id="m-tecnico" maxlength="100" value="${escapeHtml(inc && inc.tecnico_responsable) || ''}"></div>
      <div class="form-actions">
        <button type="button" class="btn primary" id="m-save"><i class="fas fa-save"></i> Guardar</button>
        <button type="button" class="btn" id="modal-btn-cancel">Cancelar</button>
      </div>
    `;
    openModal(isNew ? 'Nuevo incidente' : 'Editar incidente', body);
    qs('#m-save').onclick = async () => {
      clearInvalidMarks();
      const descripcion = qs('#m-descripcion').value.trim();
      const fechaReporte = qs('#m-fecha_reporte').value;
      let err = validateRequired(descripcion, 'La descripción del incidente es obligatoria');
      if (err) { markInvalid('m-descripcion', err); return; }
      err = validateRequired(fechaReporte, 'La fecha de reporte es obligatoria');
      if (err) { markInvalid('m-fecha_reporte', err); return; }
      const fechaCerr = qs('#m-fecha_cerrado').value || null;
      const payload = {
        cliente_id: parseInt(qs('#m-cliente_id').value, 10),
        maquina_id: qs('#m-maquina_id').value ? parseInt(qs('#m-maquina_id').value, 10) : null,
        descripcion,
        prioridad: qs('#m-prioridad').value,
        estatus: qs('#m-estatus').value,
        fecha_reporte: fechaReporte,
        fecha_cerrado: fechaCerr,
        tecnico_responsable: qs('#m-tecnico').value.trim() || null,
      };
      const btn = qs('#m-save');
      const origText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';
      try {
        if (isNew) await fetchJson(API + '/incidentes', { method: 'POST', body: JSON.stringify(payload) });
        else await fetchJson(API + '/incidentes/' + inc.id, { method: 'PUT', body: JSON.stringify(payload) });
        qs('#modal').classList.add('hidden');
        showToast(isNew ? 'Incidente guardado correctamente.' : 'Incidente actualizado correctamente.', 'success');
        loadIncidentes();
      } catch (e) { showToast(parseApiError(e) || 'No se pudo guardar. Revisa los datos o completa los campos obligatorios.', 'error'); }
      finally { btn.disabled = false; btn.innerHTML = origText; }
    };
  }

  async function editIncidente(id) {
    try {
      const inc = await fetchJson(API + '/incidentes/' + id);
      openModalIncidente(inc);
    } catch (e) { showToast(parseApiError(e) || 'No se pudo cargar el incidente.', 'error'); }
  }

  // ----- MODAL BITÁCORA -----
  async function openModalBitacora(bit) {
    const isNew = !bit || !bit.id;
    const [incidentes, cotizaciones] = await Promise.all([fetchJson(API + '/incidentes').catch(() => []), fetchJson(API + '/cotizaciones').catch(() => [])]);
    const incOpt = incidentes.map(i => `<option value="${i.id}" ${bit && bit.incidente_id == i.id ? 'selected' : ''}>${escapeHtml(i.folio || '')} - ${escapeHtml((i.descripcion || '').slice(0, 30))}</option>`).join('');
    const cotOpt = cotizaciones.map(c => `<option value="${c.id}" ${bit && bit.cotizacion_id == c.id ? 'selected' : ''}>${escapeHtml(c.folio || '')}</option>`).join('');
    const body = `
      <div class="form-group"><label>Vincular a incidente</label><select id="m-incidente_id"><option value="">— Ninguno —</option>${incOpt}</select></div>
      <div class="form-group"><label>Vincular a cotización</label><select id="m-cotizacion_id"><option value="">— Ninguna —</option>${cotOpt}</select></div>
      <p class="hint" style="margin-bottom:0.75rem;font-size:0.85rem;color:#64748b">Indica al menos uno: incidente o cotización.</p>
      <div class="form-row">
        <div class="form-group"><label>Fecha *</label><input type="date" id="m-fecha" value="${bit && bit.fecha ? bit.fecha.slice(0, 10) : new Date().toISOString().slice(0, 10)}"></div>
        <div class="form-group"><label>Horas</label><input type="number" id="m-tiempo_horas" step="0.25" min="0" value="${bit && bit.tiempo_horas != null ? bit.tiempo_horas : '0'}"></div>
      </div>
      <div class="form-group"><label>Técnico</label><input type="text" id="m-tecnico" maxlength="100" value="${escapeHtml(bit && bit.tecnico) || ''}"></div>
      <div class="form-group"><label>Actividades realizadas</label><textarea id="m-actividades" rows="3" maxlength="2000">${escapeHtml(bit && bit.actividades) || ''}</textarea></div>
      <div class="form-group"><label>Materiales usados</label><input type="text" id="m-materiales" maxlength="500" value="${escapeHtml(bit && bit.materiales_usados) || ''}"></div>
      <div class="form-actions">
        <button type="button" class="btn primary" id="m-save"><i class="fas fa-save"></i> Guardar</button>
        <button type="button" class="btn" id="modal-btn-cancel">Cancelar</button>
      </div>
    `;
    openModal(isNew ? 'Nueva bitácora (horas)' : 'Editar bitácora', body);
    qs('#m-save').onclick = async () => {
      clearInvalidMarks();
      const incId = qs('#m-incidente_id').value ? parseInt(qs('#m-incidente_id').value, 10) : null;
      const cotId = qs('#m-cotizacion_id').value ? parseInt(qs('#m-cotizacion_id').value, 10) : null;
      const fecha = qs('#m-fecha').value;
      if (!incId && !cotId) { markInvalid('m-incidente_id', 'Indica un incidente o una cotización.'); alert('Indica al menos un incidente o una cotización.'); return; }
      let err = validateRequired(fecha, 'La fecha es obligatoria');
      if (err) { markInvalid('m-fecha', err); return; }
      const payload = {
        incidente_id: incId,
        cotizacion_id: cotId,
        fecha: qs('#m-fecha').value,
        tecnico: qs('#m-tecnico').value.trim() || null,
        actividades: qs('#m-actividades').value.trim() || null,
        tiempo_horas: parseFloat(qs('#m-tiempo_horas').value) || 0,
        materiales_usados: qs('#m-materiales').value.trim() || null,
      };
      const btn = qs('#m-save');
      const origText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';
      try {
        if (isNew) await fetchJson(API + '/bitacoras', { method: 'POST', body: JSON.stringify(payload) });
        else await fetchJson(API + '/bitacoras/' + bit.id, { method: 'PUT', body: JSON.stringify(payload) });
        qs('#modal').classList.add('hidden');
        showToast(isNew ? 'Registro de bitácora guardado correctamente.' : 'Bitácora actualizada correctamente.', 'success');
        loadBitacoras();
      } catch (e) { showToast(parseApiError(e) || 'No se pudo guardar. Indica incidente o cotización y fecha.', 'error'); }
      finally { btn.disabled = false; btn.innerHTML = origText; }
    };
  }

  async function editBitacora(id) {
    try {
      const bit = await fetchJson(API + '/bitacoras/' + id);
      openModalBitacora(bit);
    } catch (e) { showToast(parseApiError(e) || 'No se pudo cargar el registro.', 'error'); }
  }

  // ----- DASHBOARD -----
  function formatMoney(n) {
    if (n == null || isNaN(n)) return '—';
    return '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  async function loadDashboard() {
    const grid = qs('#dashboard-grid');
    if (!grid) return;
    let loading = qs('#dashboard-loading');
    if (!loading) {
      loading = document.createElement('div');
      loading.id = 'dashboard-loading';
      loading.className = 'dashboard-loading';
      loading.innerHTML = '<div class="loading-spinner"></div><span>Cargando indicadores…</span>';
    }
    loading.classList.remove('hidden');
    grid.innerHTML = '';
    grid.appendChild(loading);
    try {
      const [clientes, refacciones, maquinas, cotizaciones, incidentes, bitacoras, dashboardStats] = await Promise.all([
        fetchJson(API + '/clientes').catch(() => []),
        fetchJson(API + '/refacciones').catch(() => []),
        fetchJson(API + '/maquinas').catch(() => []),
        fetchJson(API + '/cotizaciones').catch(() => []),
        fetchJson(API + '/incidentes').catch(() => []),
        fetchJson(API + '/bitacoras').catch(() => []),
        fetchJson(API + '/dashboard-stats').catch(() => null),
      ]);
      if (loading) loading.classList.add('hidden');
      const now = new Date();
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const ciudades = new Set((clientes || []).map(c => (c.ciudad || '').trim()).filter(Boolean)).size;
      const conRfc = (clientes || []).filter(c => (c.rfc || '').trim()).length;
      const valorCatalogo = (refacciones || []).reduce((s, r) => s + (Number(r.precio_unitario) || 0), 0);
      const promPrecio = (refacciones || []).length ? valorCatalogo / refacciones.length : 0;
      const marcas = new Set((refacciones || []).map(r => (r.marca || '').trim()).filter(Boolean)).size;
      const maqPorCliente = {};
      (maquinas || []).forEach(m => {
        const key = m.cliente_nombre || 'Sin cliente';
        maqPorCliente[key] = (maqPorCliente[key] || 0) + 1;
      });
      const topClienteMaq = Object.keys(maqPorCliente).length ? Object.entries(maqPorCliente).sort((a, b) => b[1] - a[1])[0] : null;
      const cotTotal = (cotizaciones || []).reduce((s, c) => s + (Number(c.total) || 0), 0);
      const cotEsteMes = (cotizaciones || []).filter(c => (c.fecha || '').slice(0, 7) === thisMonthStart.slice(0, 7)).length;
      const cotRefacciones = (cotizaciones || []).filter(c => (c.tipo || '') === 'refacciones').length;
      const cotManoObra = (cotizaciones || []).filter(c => (c.tipo || '') === 'mano_obra').length;
      const incAbiertos = (incidentes || []).filter(i => (i.estatus || '') === 'abierto').length;
      const incEnProceso = (incidentes || []).filter(i => (i.estatus || '') === 'en_proceso').length;
      const incAltaCritica = (incidentes || []).filter(i => /^(alta|critica)$/i.test(i.prioridad || '')).length;
      const incCerrados = (incidentes || []).filter(i => (i.estatus || '') === 'cerrado').length;
      const bitHoras = (bitacoras || []).reduce((s, b) => s + (Number(b.tiempo_horas) || 0), 0);
      const tecnicos = new Set((bitacoras || []).map(b => (b.tecnico || '').trim()).filter(Boolean)).size;
      const bitEsteMes = (bitacoras || []).filter(b => (b.fecha || '').slice(0, 7) === thisMonthStart.slice(0, 7)).length;
      const incTotal = (incidentes || []).length;
      const incProgress = incTotal ? Math.round((incCerrados / incTotal) * 100) : 0;
      const cards = [
        { id: 'clientes', icon: 'fa-users', title: 'Clientes', goto: 'clientes', rows: [{ label: 'Total', value: (clientes || []).length, v: 'neutral' }, { label: 'Ciudades', value: ciudades, v: 'neutral' }, { label: 'Con RFC', value: conRfc, v: 'positive' }] },
        { id: 'refacciones', icon: 'fa-cogs', title: 'Refacciones', goto: 'refacciones', rows: [{ label: 'Total', value: (refacciones || []).length, v: 'neutral' }, { label: 'Valor catálogo', value: formatMoney(valorCatalogo), v: 'positive' }, { label: 'Precio promedio', value: formatMoney(promPrecio), v: 'neutral' }, { label: 'Marcas', value: marcas, v: 'neutral' }] },
        { id: 'maquinas', icon: 'fa-industry', title: 'Máquinas', goto: 'maquinas', rows: [{ label: 'Total', value: (maquinas || []).length, v: 'neutral' }, { label: 'Clientes con equipo', value: Object.keys(maqPorCliente).length, v: 'neutral' }, topClienteMaq ? { label: 'Top cliente', value: topClienteMaq[0] + ' (' + topClienteMaq[1] + ')', v: 'neutral', long: true } : null].filter(Boolean) },
        { id: 'cotizaciones', icon: 'fa-file-invoice-dollar', title: 'Cotizaciones', goto: 'cotizaciones', rows: [{ label: 'Total', value: (cotizaciones || []).length, v: 'neutral' }, { label: 'Monto total', value: formatMoney(cotTotal), v: 'positive' }, { label: 'Este mes', value: cotEsteMes, v: 'positive' }, { label: 'Refacciones / Mano obra', value: cotRefacciones + ' / ' + cotManoObra, v: 'neutral' }] },
        { id: 'incidentes', icon: 'fa-exclamation-triangle', title: 'Incidentes', goto: 'incidentes', progress: incProgress, rows: [{ label: 'Total', value: incTotal, v: 'neutral' }, { label: 'Abiertos', value: incAbiertos, v: incAbiertos > 0 ? 'alert' : 'neutral' }, { label: 'En proceso', value: incEnProceso, v: 'neutral' }, { label: 'Alta/Crítica', value: incAltaCritica, v: incAltaCritica > 0 ? 'alert' : 'neutral' }, { label: 'Cerrados', value: incCerrados, v: 'positive' }] },
        { id: 'bitacoras', icon: 'fa-clock', title: 'Bitácora de horas', goto: 'bitacoras', rows: [{ label: 'Registros', value: (bitacoras || []).length, v: 'neutral' }, { label: 'Horas totales', value: bitHoras.toFixed(1), v: 'positive' }, { label: 'Técnicos', value: tecnicos, v: 'neutral' }, { label: 'Este mes', value: bitEsteMes, v: 'positive' }] },
      ];
      grid.innerHTML = '';
      cards.forEach((card) => {
        const el = document.createElement('div');
        el.className = 'dashboard-card';
        el.setAttribute('data-dashboard', card.id);
        const progressHtml = card.progress != null ? `<div class="dashboard-card-progress"><div class="dashboard-progress-bar" style="width:${card.progress}%"></div><span class="dashboard-progress-label">${card.progress}% cerrados</span></div>` : '';
        el.innerHTML = `
          <div class="dashboard-card-header">
            <span class="dashboard-card-icon"><i class="fas ${card.icon}"></i></span>
            <div class="dashboard-card-heading">
              <h3 class="dashboard-card-title">${escapeHtml(card.title)}</h3>
              <span class="dashboard-card-subtitle">Resumen del módulo</span>
            </div>
          </div>
          <dl class="dashboard-card-metrics">
            ${card.rows.map(r => `<div class="dashboard-metric"><dt>${escapeHtml(r.label)}</dt><dd class="dash-value dash-value-${r.v || 'neutral'}${r.long ? ' dash-value-long' : ''}">${escapeHtml(String(r.value))}</dd></div>`).join('')}
          </dl>
          ${progressHtml}
          <button type="button" class="dashboard-card-action" data-goto="${card.goto}">Abrir módulo <i class="fas fa-chevron-right"></i></button>
        `;
        grid.appendChild(el);
      });
      grid.querySelectorAll('.dashboard-card-action').forEach(btn => {
        btn.addEventListener('click', () => showPanel(btn.dataset.goto));
      });

      const dashUpdateEl = qs('#dashboard-last-update');
      if (dashUpdateEl) {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        dashUpdateEl.textContent = 'Última actualización: ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
      }

      // Estadísticas avanzadas: comparativo vs período anterior y pronósticos
      const adv = qs('#dashboard-advanced');
      const compEl = qs('#dashboard-comparativo');
      const pronEl = qs('#dashboard-pronosticos');
      if (adv && compEl && pronEl && dashboardStats && dashboardStats.periodos) {
        adv.style.display = '';
        function diffClass(current, previous) {
          if (previous === 0) return current > 0 ? 'positive' : 'neutral';
          const pct = ((current - previous) / previous) * 100;
          if (pct > 0) return 'positive';
          if (pct < 0) return 'negative';
          return 'neutral';
        }
        function diffText(current, previous, isMoney) {
          if (previous == null || previous === 0) return current > 0 ? (isMoney ? formatMoney(current) : '+' + current) : '—';
          const delta = current - previous;
          const pct = Math.round((delta / previous) * 100);
          const sign = pct >= 0 ? '+' : '';
          return sign + pct + '%';
        }
        const pairs = [
          { key: 'semana_actual', prevKey: 'semana_anterior', titulo: 'Semana actual vs anterior' },
          { key: 'mes_actual', prevKey: 'mes_anterior', titulo: 'Mes actual vs anterior' },
          { key: 'año_actual', prevKey: 'año_anterior', titulo: 'Año actual vs anterior' },
        ];
        compEl.innerHTML = pairs.map(({ key, prevKey, titulo }) => {
          const p = dashboardStats.periodos[key];
          const prev = dashboardStats.periodos[prevKey];
          if (!p || !prev) return '';
          const cot = p.cotizaciones; const cotPrev = prev.cotizaciones;
          const inc = p.incidentes; const incPrev = prev.incidentes;
          const bit = p.bitacoras; const bitPrev = prev.bitacoras;
          return `
            <div class="dashboard-stat-card">
              <h4>${escapeHtml(titulo)}</h4>
              <div class="stat-row"><span class="stat-label">Cotizaciones</span><span><span class="stat-value">${cot.count}</span> <span class="stat-diff ${diffClass(cot.count, cotPrev.count)}">${diffText(cot.count, cotPrev.count)}</span></span></div>
              <div class="stat-row"><span class="stat-label">Monto cotiz.</span><span><span class="stat-value">${formatMoney(cot.monto)}</span> <span class="stat-diff ${diffClass(cot.monto, cotPrev.monto)}">${diffText(cot.monto, cotPrev.monto)}</span></span></div>
              <div class="stat-row"><span class="stat-label">Incidentes</span><span><span class="stat-value">${inc.count}</span> <span class="stat-diff ${diffClass(inc.count, incPrev.count)}">${diffText(inc.count, incPrev.count)}</span></span></div>
              <div class="stat-row"><span class="stat-label">Bitácoras</span><span><span class="stat-value">${bit.count} (${Number(bit.horas).toFixed(1)} h)</span> <span class="stat-diff ${diffClass(bit.count, bitPrev.count)}">${diffText(bit.count, bitPrev.count)}</span></span></div>
            </div>`;
        }).join('');

        const pron = dashboardStats.pronosticos;
        if (pron) {
          const pronCards = [
            { titulo: 'Próxima semana', d: pron.proxima_semana },
            { titulo: 'Próximo mes', d: pron.proximo_mes },
            { titulo: 'Próximo año', d: pron.proximo_año },
          ];
          pronEl.innerHTML = '<p class="dashboard-hint dashboard-forecast-legend">Cada fila: <strong>Cotizaciones</strong> = cantidad y monto estimado; <strong>Incidentes</strong> = cantidad estimada; <strong>Bitácoras</strong> = registros y horas estimadas.</p>' +
            pronCards.map(({ titulo, d }) => `
            <div class="dashboard-forecast-card">
              <h4>${escapeHtml(titulo)}</h4>
              <div class="stat-row"><span class="stat-label">Cotizaciones</span><span class="stat-value">${d.cotizaciones_count} cotiz. · ${formatMoney(d.cotizaciones_monto)}</span></div>
              <div class="stat-row"><span class="stat-label">Incidentes</span><span class="stat-value">${d.incidentes_count} incidentes</span></div>
              <div class="stat-row"><span class="stat-label">Bitácoras</span><span class="stat-value">${d.bitacoras_count} registros · ${Number(d.bitacoras_horas).toFixed(1)} h</span></div>
            </div>`).join('');
        } else {
          pronEl.innerHTML = '<p class="dashboard-hint">No hay datos suficientes para pronósticos.</p>';
        }

        // Gráficos (donut + barras) si Chart.js está disponible
        const chartsEl = qs('#dashboard-charts');
        if (chartsEl && typeof Chart !== 'undefined') {
          chartsEl.style.display = '';
          if (chartDonut) chartDonut.destroy();
          if (chartBars) chartBars.destroy();
          const nCot = (cotizaciones || []).length;
          const nInc = (incidentes || []).length;
          const nBit = (bitacoras || []).length;
          const donutCtx = document.getElementById('chart-donut');
          if (donutCtx && (nCot + nInc + nBit > 0)) {
            chartDonut = new Chart(donutCtx, {
              type: 'doughnut',
              data: {
                labels: ['Cotizaciones', 'Incidentes', 'Bitácoras'],
                datasets: [{ data: [nCot, nInc, nBit], backgroundColor: ['#059669', '#ea580c', '#7c3aed'], borderColor: '#1e293b', borderWidth: 2 }],
              },
              options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { color: '#e2e8f0', font: { size: 12 } } } } },
            });
          }
          const barCtx = document.getElementById('chart-bars');
          if (barCtx && dashboardStats.periodos) {
            const p = dashboardStats.periodos;
            chartBars = new Chart(barCtx, {
              type: 'bar',
              data: {
                labels: ['Semana', 'Mes', 'Año'],
                datasets: [
                  { label: 'Actual', data: [p.semana_actual?.cotizaciones?.count ?? 0, p.mes_actual?.cotizaciones?.count ?? 0, p.año_actual?.cotizaciones?.count ?? 0], backgroundColor: 'rgba(56,189,248,0.8)', borderColor: '#38bdf8', borderWidth: 1 },
                  { label: 'Anterior', data: [p.semana_anterior?.cotizaciones?.count ?? 0, p.mes_anterior?.cotizaciones?.count ?? 0, p.año_anterior?.cotizaciones?.count ?? 0], backgroundColor: 'rgba(148,163,184,0.6)', borderColor: '#94a3b8', borderWidth: 1 },
                ],
              },
              options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' } }, y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' } } },
                plugins: { legend: { position: 'bottom', labels: { color: '#e2e8f0' } } },
              },
            });
          }
        } else if (chartsEl) {
          chartsEl.style.display = 'none';
        }
      } else if (adv) {
        adv.style.display = 'none';
      }
    } catch (e) {
      if (loading) loading.classList.add('hidden');
      grid.innerHTML = '<div class="dashboard-error"><i class="fas fa-exclamation-circle"></i> No se pudo cargar el resumen. Revisa la conexión e intenta de nuevo.</div>';
      console.error(e);
    }
  }

  // ----- SEED STATUS -----
  const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 horas

  function formatLastUpdate(d) {
    const t = d instanceof Date ? d : new Date();
    const day = String(t.getDate()).padStart(2, '0');
    const month = String(t.getMonth() + 1).padStart(2, '0');
    const year = t.getFullYear();
    const h = String(t.getHours()).padStart(2, '0');
    const min = String(t.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year}, ${h}:${min}`;
  }

  async function loadSeedStatus(isAutoRefresh) {
    const el = qs('#seed-status');
    const lastEl = qs('#seed-last-update');
    try {
      const st = await fetchJson(API + '/seed-status');
      el.innerHTML = `Actualmente: <strong>${st.clientes}</strong> clientes, <strong>${st.refacciones}</strong> refacciones, <strong>${st.maquinas}</strong> máquinas, <strong>${st.cotizaciones || 0}</strong> cotizaciones, <strong>${st.incidentes || 0}</strong> incidentes, <strong>${st.bitacoras || 0}</strong> bitácoras.`;
      const now = new Date();
      if (lastEl) lastEl.textContent = 'Última actualización: ' + formatLastUpdate(now);
      if (isAutoRefresh) showToast('Datos actualizados automáticamente (cada 12 h).', 'success');
    } catch (e) {
      el.textContent = 'No se pudo conectar con el servidor.';
      if (lastEl) lastEl.textContent = '';
    }
  }

  async function seedDemo() {
    const btn = qs('#btn-seed-demo');
    btn.disabled = true;
    btn.textContent = 'Cargando…';
    try {
      const data = await fetchJson(API + '/seed-demo', { method: 'POST' });
      qs('#seed-status').innerHTML = `Listo: <strong>${data.clientes}</strong> clientes, <strong>${data.refacciones}</strong> refacciones, <strong>${data.maquinas}</strong> máquinas, <strong>${data.cotizaciones || 0}</strong> cotizaciones, <strong>${data.incidentes || 0}</strong> incidentes, <strong>${data.bitacoras || 0}</strong> bitácoras.`;
      btn.textContent = 'Datos demo cargados';
      loadSeedStatus();
      loadCotizaciones();
      loadIncidentes();
      loadBitacoras();
      loadClientes();
      loadRefacciones();
      loadMaquinas();
      fillClientesSelect();
      if ((data.incidentes || 0) === 0 || (data.bitacoras || 0) === 0) {
        showToast('No se insertaron incidentes o bitácoras: los nombres de cliente/máquina del demo deben coincidir con los de la pestaña Clientes/Máquinas. Revisa seed-demo.json.', 'error');
      } else {
        showPanel('incidentes');
      }
    } catch (e) {
      let msg = e.message;
      try { const o = JSON.parse(msg); if (o.error) msg = o.error; } catch (_) {}
      qs('#seed-status').innerHTML = '<span class="error-msg">Error: ' + escapeHtml(msg) + '</span>';
      btn.textContent = 'Cargar datos demo ahora';
    }
    btn.disabled = false;
  }

  async function fillClientesSelect() {
    try {
      const data = await fetchJson(API + '/clientes');
      const sel = qs('#filtro-cliente-maq');
      const first = '<option value="">Todos los clientes</option>';
      sel.innerHTML = first + data.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
    } catch (_) {}
  }

  function applyClientesFiltersAndRender() {
    const q = (qs('#buscar-clientes') && qs('#buscar-clientes').value || '').trim();
    let filtered = applyFilters(clientesCache, getFilterValues('#tabla-clientes'), 'tabla-clientes');
    if (q) filtered = filtered.filter(c => [c.nombre, c.codigo, c.rfc].some(v => normalizeForSearch(v).includes(normalizeForSearch(q))));
    renderClientes(filtered);
  }
  function applyRefaccionesFiltersAndRender() {
    const q = (qs('#buscar-refacciones') && qs('#buscar-refacciones').value || '').trim();
    let filtered = applyFilters(refaccionesCache, getFilterValues('#tabla-refacciones'), 'tabla-refacciones');
    if (q) filtered = filtered.filter(r => [r.codigo, r.descripcion, r.marca].some(v => normalizeForSearch(v).includes(normalizeForSearch(q))));
    renderRefacciones(filtered);
  }
  function applyMaquinasFiltersAndRender() {
    const filtered = applyFilters(maquinasCache, getFilterValues('#tabla-maquinas'), 'tabla-maquinas');
    renderMaquinas(filtered);
  }
  function applyCotizacionesFiltersAndRender() {
    const filtered = applyFilters(cotizacionesCache, getFilterValues('#tabla-cotizaciones'), 'tabla-cotizaciones');
    renderCotizaciones(filtered, cotizacionesCache.length);
  }
  function applyIncidentesFiltersAndRender() {
    const filtered = applyFilters(incidentesCache, getFilterValues('#tabla-incidentes'), 'tabla-incidentes');
    renderIncidentes(filtered, incidentesCache.length);
  }
  function applyBitacorasFiltersAndRender() {
    const filtered = applyFilters(bitacorasCache, getFilterValues('#tabla-bitacoras'), 'tabla-bitacoras');
    renderBitacoras(filtered, bitacorasCache.length);
  }

  // ----- EVENT LISTENERS -----
  qs('#buscar-clientes').addEventListener('input', debounce(loadClientes, 350));
  qs('#buscar-refacciones').addEventListener('input', debounce(loadRefacciones, 350));
  qs('#filtro-cliente-maq').addEventListener('change', loadMaquinas);
  bindTableFilters('tabla-clientes', applyClientesFiltersAndRender);
  bindTableFilters('tabla-refacciones', applyRefaccionesFiltersAndRender);
  bindTableFilters('tabla-maquinas', applyMaquinasFiltersAndRender);
  bindTableFilters('tabla-cotizaciones', applyCotizacionesFiltersAndRender);
  bindTableFilters('tabla-incidentes', applyIncidentesFiltersAndRender);
  bindTableFilters('tabla-bitacoras', applyBitacorasFiltersAndRender);
  const dashboardRefresh = qs('#dashboard-refresh');
  if (dashboardRefresh) dashboardRefresh.addEventListener('click', () => loadDashboard());
  qs('#nuevo-cliente').addEventListener('click', () => openModalCliente(null));
  qs('#nueva-refaccion').addEventListener('click', () => openModalRefaccion(null));
  qs('#nueva-maquina').addEventListener('click', () => openModalMaquina(null));
  qs('#nueva-cotizacion').addEventListener('click', () => openModalCotizacion(null));
  qs('#nuevo-incidente').addEventListener('click', () => openModalIncidente(null));
  qs('#nueva-bitacora').addEventListener('click', () => openModalBitacora(null));
  qs('.btn-empty-cot').addEventListener('click', () => openModalCotizacion(null));
  qs('.btn-empty-inc').addEventListener('click', () => openModalIncidente(null));
  qs('.btn-empty-bit').addEventListener('click', () => openModalBitacora(null));

  function getFilteredClientes() {
    const q = (qs('#buscar-clientes') && qs('#buscar-clientes').value || '').trim();
    let d = applyFilters(clientesCache, getFilterValues('#tabla-clientes'), 'tabla-clientes');
    if (q) d = d.filter(c => [c.nombre, c.codigo, c.rfc].some(v => normalizeForSearch(v).includes(normalizeForSearch(q))));
    return d;
  }
  function getFilteredRefacciones() {
    const q = (qs('#buscar-refacciones') && qs('#buscar-refacciones').value || '').trim();
    let d = applyFilters(refaccionesCache, getFilterValues('#tabla-refacciones'), 'tabla-refacciones');
    if (q) d = d.filter(r => [r.codigo, r.descripcion, r.marca].some(v => normalizeForSearch(v).includes(normalizeForSearch(q))));
    return d;
  }
  qs('#export-clientes').addEventListener('click', () => exportToCsv(getFilteredClientes(), 'tabla-clientes', 'clientes'));
  qs('#export-excel-clientes').addEventListener('click', () => exportToExcel(getFilteredClientes(), 'tabla-clientes', 'clientes'));
  qs('#export-refacciones').addEventListener('click', () => exportToCsv(getFilteredRefacciones(), 'tabla-refacciones', 'refacciones'));
  qs('#export-excel-refacciones').addEventListener('click', () => exportToExcel(getFilteredRefacciones(), 'tabla-refacciones', 'refacciones'));
  qs('#export-maquinas').addEventListener('click', () => exportToCsv(applyFilters(maquinasCache, getFilterValues('#tabla-maquinas'), 'tabla-maquinas'), 'tabla-maquinas', 'maquinas'));
  qs('#export-excel-maquinas').addEventListener('click', () => exportToExcel(applyFilters(maquinasCache, getFilterValues('#tabla-maquinas'), 'tabla-maquinas'), 'tabla-maquinas', 'maquinas'));
  qs('#export-cotizaciones').addEventListener('click', () => exportToCsv(enrichCotizacionesForExport(applyFilters(cotizacionesCache, getFilterValues('#tabla-cotizaciones'), 'tabla-cotizaciones')), 'tabla-cotizaciones', 'cotizaciones'));
  qs('#export-excel-cotizaciones').addEventListener('click', () => exportToExcel(enrichCotizacionesForExport(applyFilters(cotizacionesCache, getFilterValues('#tabla-cotizaciones'), 'tabla-cotizaciones')), 'tabla-cotizaciones', 'cotizaciones'));
  qs('#export-incidentes').addEventListener('click', () => exportToCsv(enrichIncidentesForExport(applyFilters(incidentesCache, getFilterValues('#tabla-incidentes'), 'tabla-incidentes')), 'tabla-incidentes', 'incidentes'));
  qs('#export-excel-incidentes').addEventListener('click', () => exportToExcel(enrichIncidentesForExport(applyFilters(incidentesCache, getFilterValues('#tabla-incidentes'), 'tabla-incidentes')), 'tabla-incidentes', 'incidentes'));
  qs('#export-bitacoras').addEventListener('click', () => exportToCsv(enrichBitacorasForExport(applyFilters(bitacorasCache, getFilterValues('#tabla-bitacoras'), 'tabla-bitacoras')), 'tabla-bitacoras', 'bitacoras'));
  qs('#export-excel-bitacoras').addEventListener('click', () => exportToExcel(enrichBitacorasForExport(applyFilters(bitacorasCache, getFilterValues('#tabla-bitacoras'), 'tabla-bitacoras')), 'tabla-bitacoras', 'bitacoras'));

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      const modal = qs('#modal');
      if (modal && !modal.classList.contains('hidden')) modal.classList.add('hidden');
    }
    if (e.ctrlKey || e.metaKey) {
      const tab = { '0': 'dashboards', '1': 'clientes', '2': 'refacciones', '3': 'maquinas', '4': 'cotizaciones', '5': 'incidentes', '6': 'bitacoras' }[e.key];
      if (tab) { e.preventDefault(); showPanel(tab); }
    }
  });

  // ----- Asistente IA: minimizable (bolita), tooltip, inactividad, unread, animaciones -----
  (function initAiChat() {
    const wrap = qs('#ai-widget-wrap');
    const widget = qs('#ai-widget');
    const fab = qs('#ai-fab');
    const minimizeBtn = qs('#ai-minimize');
    const unreadBadge = qs('#ai-unread-badge');
    const messagesEl = qs('#ai-messages');
    const inputEl = qs('#ai-input');
    const sendBtn = qs('#ai-send');
    const attachBtn = qs('#ai-attach');
    const fileInput = qs('#ai-file-input');
    if (!wrap || !widget || !messagesEl || !inputEl || !sendBtn) return;

    const chatHistory = [];
    const STORAGE_KEY = 'aiWidgetPos';
    const IDLE_ASK_MS = 2 * 60 * 1000;
    const IDLE_CLOSE_MS = 4 * 60 * 1000;
    let lastUserActivity = 0;
    let idleAskShown = false;
    let idleClosedShown = false;
    let unreadCount = 0;
    let idleCheckTimer = null;
    let pendingFileBase64 = null;
    let pendingFileMime = null;

    function setExpanded(expanded) {
      wrap.classList.toggle('collapsed', !expanded);
      wrap.classList.toggle('expanded', expanded);
      if (expanded) {
        unreadCount = 0;
        updateUnreadBadge();
      }
    }
    function updateUnreadBadge() {
      if (!unreadBadge) return;
      if (unreadCount <= 0) {
        unreadBadge.classList.add('hidden');
        unreadBadge.textContent = '0';
      } else {
        unreadBadge.classList.remove('hidden');
        unreadBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      }
    }
    function resetIdleTimers() {
      lastUserActivity = Date.now();
      idleAskShown = false;
      idleClosedShown = false;
    }
    function scheduleIdleCheck() {
      if (idleCheckTimer) clearInterval(idleCheckTimer);
      idleCheckTimer = setInterval(function () {
        const elapsed = Date.now() - lastUserActivity;
        if (elapsed >= IDLE_CLOSE_MS && idleAskShown && !idleClosedShown) {
          idleClosedShown = true;
          append('Por no haber actividad, cerré esta conversación. Cuando quieras seguir, escribe aquí de nuevo y con gusto te ayudo. ¡Hasta pronto! 👋', false);
          setExpanded(false);
        } else if (elapsed >= IDLE_ASK_MS && !idleAskShown) {
          idleAskShown = true;
          append('¿Necesitas algo más? Estoy aquí cuando quieras. Solo escribe y te ayudo. 😊', false);
          if (wrap.classList.contains('collapsed')) {
            unreadCount++;
            updateUnreadBadge();
          }
        }
      }, 30000);
    }

    if (fab) fab.addEventListener('click', () => setExpanded(true));
    if (minimizeBtn) minimizeBtn.addEventListener('click', () => setExpanded(false));

    function loadPosition() {
      try {
        const s = localStorage.getItem(STORAGE_KEY);
        if (s) {
          const { right, bottom } = JSON.parse(s);
          wrap.style.right = right != null ? right + 'px' : '';
          wrap.style.bottom = bottom != null ? bottom + 'px' : '';
          wrap.style.left = '';
        }
      } catch (_) {}
    }
    function savePosition() {
      const r = parseFloat(wrap.style.right);
      const b = parseFloat(wrap.style.bottom);
      if (!isNaN(r) || !isNaN(b)) localStorage.setItem(STORAGE_KEY, JSON.stringify({ right: isNaN(r) ? 24 : r, bottom: isNaN(b) ? 24 : b }));
    }
    loadPosition();

    const dragHeader = qs('.ai-widget-drag', widget);
    if (dragHeader) {
      let dragging = false, startX, startY, startRight, startBottom;
      dragHeader.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startRight = parseFloat(wrap.style.right) || 24;
        startBottom = parseFloat(wrap.style.bottom) || 24;
      });
      document.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        wrap.style.right = Math.max(0, startRight - dx) + 'px';
        wrap.style.bottom = Math.max(0, startBottom - dy) + 'px';
        wrap.style.left = 'auto';
      });
      document.addEventListener('mouseup', function () {
        if (dragging) { dragging = false; savePosition(); }
      });
    }

    function removeTypingIndicator() {
      const el = messagesEl.querySelector('.ai-typing');
      if (el) el.remove();
    }
    function append(msg, isUser) {
      if (!isUser) removeTypingIndicator();
      const div = document.createElement('div');
      div.className = 'ai-msg ' + (isUser ? 'ai-msg-user' : 'ai-msg-bot');
      div.style.whiteSpace = 'pre-wrap';
      div.textContent = msg;
      messagesEl.appendChild(div);
      messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
      if (!isUser && wrap.classList.contains('collapsed')) {
        unreadCount++;
        updateUnreadBadge();
      }
    }
    async function loadWelcome() {
      try {
        const data = await fetchJson(API + '/ai/welcome');
        if (data.message) append(data.message, false);
      } catch (_) {
        append('¡Hola! Soy tu Agente de Soporte. Puedo ayudarte con clientes, cotizaciones, incidentes y más. ¿En qué te ayudo?', false);
      }
    }
    loadWelcome();
    scheduleIdleCheck();

    qsAll('#ai-suggestions .ai-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const msg = btn.dataset.msg;
        if (msg) { inputEl.value = msg; send(); }
      });
    });

    const allowedMimes = /^image\/(jpeg|png|gif|webp)$|^application\/pdf$|^application\/vnd\.(openxmlformats-officedocument\.(spreadsheetml\.sheet|wordprocessingml\.document)|ms-excel)$|^application\/msword$/;
    if (attachBtn && fileInput) {
      attachBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', function () {
        const file = this.files && this.files[0];
        if (!file) return;
        const mime = file.type || '';
        if (!allowedMimes.test(mime)) {
          showToast('Formatos admitidos: imágenes (JPG, PNG, GIF, WebP), PDF, Excel (.xls, .xlsx) o Word (.doc, .docx).', 'error');
          this.value = '';
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const s = reader.result;
          pendingFileBase64 = s && s.indexOf('base64,') !== -1 ? s.split('base64,')[1] : s;
          pendingFileMime = mime;
          if (/^image\//.test(mime)) showToast('Imagen lista. Escribe algo (ej. "pon esto en nueva cotización") y envía.', 'success');
          else showToast('Documento listo. Escribe un mensaje (ej. "qué dice?" o "ponlo en nueva cotización") y envía.', 'success');
        };
        reader.readAsDataURL(file);
        this.value = '';
      });
    }

    function isPdfExcelOrWord(mime) {
      return mime && /^application\/(pdf|vnd\.(openxmlformats-officedocument\.(spreadsheetml\.sheet|wordprocessingml\.document)|ms-excel)|msword)$/.test(mime);
    }
    async function send() {
      const text = inputEl.value.trim();
      if (!text && !pendingFileBase64) return;
      inputEl.value = '';
      const messageToSend = text || (pendingFileBase64 ? '¿Qué hay en este archivo?' : '');
      const fileLabel = pendingFileMime && isPdfExcelOrWord(pendingFileMime) ? '[Documento adjunto]' : (pendingFileBase64 ? '[Imagen adjunta]' : '');
      append(text || fileLabel, true);
      const suggestionsEl = qs('#ai-suggestions');
      if (suggestionsEl) suggestionsEl.classList.add('hidden');
      resetIdleTimers();
      chatHistory.push({ role: 'user', content: messageToSend });
      sendBtn.disabled = true;
      const typingEl = document.createElement('div');
      typingEl.className = 'ai-msg ai-msg-bot ai-typing';
      typingEl.setAttribute('aria-live', 'polite');
      typingEl.innerHTML = '<span class="ai-typing-dot"></span><span class="ai-typing-dot"></span><span class="ai-typing-dot"></span>';
      messagesEl.appendChild(typingEl);
      messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
      const fileB64 = pendingFileBase64;
      const fileMime = pendingFileMime;
      pendingFileBase64 = null;
      pendingFileMime = null;
      try {
        let data;
        if (fileB64 && isPdfExcelOrWord(fileMime)) {
          data = await fetchJson(API + '/ai/extract-document', { method: 'POST', body: JSON.stringify({ fileBase64: fileB64, mimeType: fileMime, message: messageToSend }) });
          const reply = data.reply || 'Listo.';
          if (data.action === 'open_cotizacion' && data.cotizacion) {
            setExpanded(false);
            await openModalCotizacion(data.cotizacion);
            append(reply, false);
          } else {
            append(reply, false);
          }
          chatHistory.push({ role: 'assistant', content: reply });
          while (chatHistory.length > 20) chatHistory.splice(0, 2);
          sendBtn.disabled = false;
          return;
        }
        if (fileB64 && /pon.*(cotizaci[oó]n|nueva)/i.test(messageToSend)) {
          try {
            data = await fetchJson(API + '/ai/extract-client', { method: 'POST', body: JSON.stringify({ fileBase64: fileB64, mimeType: fileMime }) });
            const d = data.data || {};
            if (d.nombre || d.rfc) {
              append('Encontré datos en la imagen. Abriendo formulario de cliente para que revises y guardes.', false);
              setExpanded(false);
              openModalCliente({ nombre: d.nombre, rfc: d.rfc, direccion: d.direccion, ciudad: d.ciudad, email: d.email, telefono: d.telefono });
              sendBtn.disabled = false;
              return;
            }
          } catch (_) {}
        }
        data = await fetchJson(API + '/ai/chat', {
          method: 'POST',
          body: JSON.stringify({ message: messageToSend, messages: chatHistory }),
        });
        const reply = data.reply || 'Sin respuesta';
        if (data.action === 'open_cotizacion' && data.cotizacion) {
          setExpanded(false);
          await openModalCotizacion(data.cotizacion);
          append(reply, false);
        } else {
          append(reply, false);
        }
        chatHistory.push({ role: 'assistant', content: reply });
        while (chatHistory.length > 20) chatHistory.splice(0, 2);
      } catch (e) {
        let msg = e.message;
        try { const o = JSON.parse(msg); if (o.error) msg = o.error; if (o.hint) msg += '\n\n' + o.hint; } catch (_) {}
        append('⚠️ ' + msg, false);
      }
      sendBtn.disabled = false;
    }
    sendBtn.addEventListener('click', send);
    inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  })();

  qs('#btn-seed-demo').addEventListener('click', seedDemo);
  qs('#btn-seed-extra').addEventListener('click', async () => {
    const btn = qs('#btn-seed-extra');
    btn.disabled = true;
    btn.textContent = 'Cargando…';
    try {
      const data = await fetchJson(API + '/seed-demo-extra', { method: 'POST' });
      qs('#seed-status').innerHTML = `Listo: <strong>${data.incidentes || 0}</strong> incidentes, <strong>${data.bitacoras || 0}</strong> bitácoras, <strong>${data.cotizaciones || 0}</strong> cotizaciones agregados.`;
      loadSeedStatus();
      loadCotizaciones();
      loadIncidentes();
      loadBitacoras();
      if ((data.incidentes || 0) === 0 || (data.bitacoras || 0) === 0) {
        showToast('No se insertaron incidentes ni bitácoras. Los nombres de cliente y máquina en seed-demo.json deben coincidir con los de Clientes y Máquinas. Prueba "Cargar datos demo ahora" si la base estaba vacía.', 'error');
      } else {
        showPanel('incidentes');
      }
    } catch (e) {
      let msg = e.message;
      try { const o = JSON.parse(msg); if (o.error) msg = o.error; } catch (_) {}
      qs('#seed-status').innerHTML = '<span class="error-msg">Error: ' + escapeHtml(msg) + '</span>';
    }
    btn.disabled = false;
    btn.textContent = 'Cargar solo incidentes, bitácoras y cotizaciones demo';
  });

  loadDashboard();
  fillClientesSelect();
  loadSeedStatus();

  // Actualización automática cada 12 horas: estado demo + listas principales y notificación
  setInterval(function () {
    loadSeedStatus(true);
    loadDashboard();
    loadClientes();
    loadRefacciones();
    loadMaquinas();
    loadCotizaciones();
    loadIncidentes();
    loadBitacoras();
  }, REFRESH_INTERVAL_MS);
})();
