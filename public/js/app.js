(function () {
  const API = '/api';
  let clientesCache = [];
  let refaccionesCache = [];
  let maquinasCache = [];

  function qs(s) { return document.querySelector(s); }
  function qsAll(s) { return document.querySelectorAll(s); }

  function showPanel(id) {
    qsAll('.panel').forEach(p => p.classList.remove('active'));
    qsAll('.tab').forEach(t => t.classList.remove('active'));
    const panel = document.getElementById('panel-' + id);
    const tab = document.querySelector('.tab[data-tab="' + id + '"]');
    if (panel) panel.classList.add('active');
    if (tab) tab.classList.add('active');
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
      loadClientes();
    } catch (e) { alert('Error: ' + e.message); }
  }

  async function loadClientes() {
    const q = qs('#buscar-clientes').value.trim();
    const url = q ? `${API}/clientes?q=${encodeURIComponent(q)}` : `${API}/clientes`;
    try {
      const data = await fetchJson(url);
      clientesCache = data;
      renderClientes(data);
    } catch (e) { renderClientes([]); console.error(e); }
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
      loadRefacciones();
    } catch (e) { alert('Error: ' + e.message); }
  }

  async function loadRefacciones() {
    const q = qs('#buscar-refacciones').value.trim();
    const url = q ? `${API}/refacciones?q=${encodeURIComponent(q)}` : `${API}/refacciones`;
    try {
      const data = await fetchJson(url);
      refaccionesCache = data;
      renderRefacciones(data);
    } catch (e) { renderRefacciones([]); console.error(e); }
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
      loadMaquinas();
    } catch (e) { alert('Error: ' + e.message); }
  }

  async function loadMaquinas() {
    const clienteId = qs('#filtro-cliente-maq').value;
    const url = clienteId ? `${API}/maquinas?cliente_id=${clienteId}` : `${API}/maquinas`;
    try {
      const data = await fetchJson(url);
      maquinasCache = data;
      renderMaquinas(data);
    } catch (e) { renderMaquinas([]); console.error(e); }
  }

  // ----- COTIZACIONES -----
  function renderCotizaciones(data) {
    const emptyEl = qs('#cotizaciones-empty');
    const listEl = qs('#cotizaciones-list');
    const tbody = qs('#tabla-cotizaciones tbody');
    tbody.innerHTML = '';
    if (!data || data.length === 0) {
      emptyEl.classList.remove('hidden');
      listEl.classList.add('hidden');
      return;
    }
    emptyEl.classList.add('hidden');
    listEl.classList.remove('hidden');
    data.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(c.folio || '')}</td>
        <td>${escapeHtml(c.cliente_nombre || '')}</td>
        <td>${escapeHtml(c.tipo || '')}</td>
        <td>${escapeHtml(c.fecha || '')}</td>
        <td>${typeof c.total === 'number' ? '$' + c.total.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : ''}</td>
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
    try {
      const data = await fetchJson(API + '/cotizaciones');
      renderCotizaciones(data);
    } catch (e) { renderCotizaciones([]); }
  }

  async function deleteCotizacion(id) {
    try {
      await fetchJson(API + '/cotizaciones/' + id, { method: 'DELETE' });
      loadCotizaciones();
    } catch (e) { alert('Error: ' + e.message); }
  }

  // ----- INCIDENTES -----
  function renderIncidentes(data) {
    const emptyEl = qs('#incidentes-empty');
    const listEl = qs('#incidentes-list');
    const tbody = qs('#tabla-incidentes tbody');
    tbody.innerHTML = '';
    if (!data || data.length === 0) {
      emptyEl.classList.remove('hidden');
      listEl.classList.add('hidden');
      return;
    }
    emptyEl.classList.add('hidden');
    listEl.classList.remove('hidden');
    data.forEach(i => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(i.folio || '')}</td>
        <td>${escapeHtml(i.cliente_nombre || '')}</td>
        <td>${escapeHtml(i.maquina_nombre || '')}</td>
        <td>${escapeHtml((i.descripcion || '').slice(0, 45))}${(i.descripcion && i.descripcion.length > 45) ? '…' : ''}</td>
        <td>${escapeHtml(i.prioridad || '')}</td>
        <td>${escapeHtml(i.estatus || '')}</td>
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
    try {
      const data = await fetchJson(API + '/incidentes');
      renderIncidentes(data);
    } catch (e) { renderIncidentes([]); }
  }

  async function deleteIncidente(id) {
    try {
      await fetchJson(API + '/incidentes/' + id, { method: 'DELETE' });
      loadIncidentes();
    } catch (e) { alert('Error: ' + e.message); }
  }

  // ----- BITÁCORAS -----
  function renderBitacoras(data) {
    const emptyEl = qs('#bitacoras-empty');
    const listEl = qs('#bitacoras-list');
    const tbody = qs('#tabla-bitacoras tbody');
    tbody.innerHTML = '';
    if (!data || data.length === 0) {
      emptyEl.classList.remove('hidden');
      listEl.classList.add('hidden');
      return;
    }
    emptyEl.classList.add('hidden');
    listEl.classList.remove('hidden');
    data.forEach(b => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(b.fecha || '')}</td>
        <td>${escapeHtml(b.incidente_folio || '—')}</td>
        <td>${escapeHtml(b.cotizacion_folio || '—')}</td>
        <td>${escapeHtml(b.tecnico || '')}</td>
        <td>${escapeHtml((b.actividades || '').slice(0, 35))}${(b.actividades && b.actividades.length > 35) ? '…' : ''}</td>
        <td>${b.tiempo_horas != null ? b.tiempo_horas : '—'}</td>
        <td>${escapeHtml((b.materiales_usados || '').slice(0, 25))}${(b.materiales_usados && b.materiales_usados.length > 25) ? '…' : ''}</td>
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
    try {
      const data = await fetchJson(API + '/bitacoras');
      renderBitacoras(data);
    } catch (e) { renderBitacoras([]); }
  }

  async function deleteBitacora(id) {
    try {
      await fetchJson(API + '/bitacoras/' + id, { method: 'DELETE' });
      loadBitacoras();
    } catch (e) { alert('Error: ' + e.message); }
  }

  // ----- MODAL GENÉRICO ----- (no se cierra al hacer clic fuera; solo con X o Cancelar)
  function openModal(title, bodyHtml, onClose) {
    const modal = qs('#modal');
    qs('#modal-title').textContent = title;
    qs('#modal-body').innerHTML = bodyHtml;
    modal.classList.remove('hidden');
    clearInvalidMarks();
    const close = () => { modal.classList.add('hidden'); clearInvalidMarks(); if (onClose) onClose(); };
    qs('#modal .close').onclick = close;
    const cancelBtn = qs('#modal-body #modal-btn-cancel');
    if (cancelBtn) cancelBtn.onclick = close;
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
      try {
        if (isNew) await fetchJson(API + '/clientes', { method: 'POST', body: JSON.stringify(payload) });
        else await fetchJson(API + '/clientes/' + cliente.id, { method: 'PUT', body: JSON.stringify(payload) });
        loadClientes();
        fillClientesSelect();
        qs('#modal').classList.add('hidden');
      } catch (e) { alert('Error: ' + e.message); }
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
      try {
        if (isNew) await fetchJson(API + '/refacciones', { method: 'POST', body: JSON.stringify(payload) });
        else await fetchJson(API + '/refacciones/' + refaccion.id, { method: 'PUT', body: JSON.stringify(payload) });
        loadRefacciones();
        if (typeof fillRefaccionesSelect === 'function') fillRefaccionesSelect();
        qs('#modal').classList.add('hidden');
      } catch (e) { alert('Error: ' + e.message); }
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
      try {
        if (isNew) await fetchJson(API + '/maquinas', { method: 'POST', body: JSON.stringify(payload) });
        else await fetchJson(API + '/maquinas/' + maquina.id, { method: 'PUT', body: JSON.stringify(payload) });
        loadMaquinas();
        qs('#modal').classList.add('hidden');
      } catch (e) { alert('Error: ' + e.message); }
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
      try {
        if (isNew) await fetchJson(API + '/cotizaciones', { method: 'POST', body: JSON.stringify(payload) });
        else { payload.folio = cot.folio; await fetchJson(API + '/cotizaciones/' + cot.id, { method: 'PUT', body: JSON.stringify(payload) }); }
        loadCotizaciones();
        qs('#modal').classList.add('hidden');
      } catch (e) { alert('Error: ' + e.message); }
    };
  }

  async function editCotizacion(id) {
    try {
      const cot = await fetchJson(API + '/cotizaciones/' + id);
      openModalCotizacion(cot);
    } catch (e) { alert('Error: ' + e.message); }
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
        <div class="form-group"><label>Fecha reporte *</label><input type="date" id="m-fecha_reporte" value="${inc && inc.fecha_reporte ? inc.fecha_reporte.slice(0, 10) : new Date().toISOString().slice(0, 10)}"></div>
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
      const payload = {
        cliente_id: parseInt(qs('#m-cliente_id').value, 10),
        maquina_id: qs('#m-maquina_id').value ? parseInt(qs('#m-maquina_id').value, 10) : null,
        descripcion,
        prioridad: qs('#m-prioridad').value,
        estatus: qs('#m-estatus').value,
        fecha_reporte: fechaReporte,
        tecnico_responsable: qs('#m-tecnico').value.trim() || null,
      };
      try {
        if (isNew) await fetchJson(API + '/incidentes', { method: 'POST', body: JSON.stringify(payload) });
        else await fetchJson(API + '/incidentes/' + inc.id, { method: 'PUT', body: JSON.stringify(payload) });
        loadIncidentes();
        qs('#modal').classList.add('hidden');
      } catch (e) { alert('Error: ' + e.message); }
    };
  }

  async function editIncidente(id) {
    try {
      const inc = await fetchJson(API + '/incidentes/' + id);
      openModalIncidente(inc);
    } catch (e) { alert('Error: ' + e.message); }
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
      try {
        if (isNew) await fetchJson(API + '/bitacoras', { method: 'POST', body: JSON.stringify(payload) });
        else await fetchJson(API + '/bitacoras/' + bit.id, { method: 'PUT', body: JSON.stringify(payload) });
        loadBitacoras();
        qs('#modal').classList.add('hidden');
      } catch (e) { alert('Error: ' + e.message); }
    };
  }

  async function editBitacora(id) {
    try {
      const bit = await fetchJson(API + '/bitacoras/' + id);
      openModalBitacora(bit);
    } catch (e) { alert('Error: ' + e.message); }
  }

  // ----- SEED STATUS -----
  async function loadSeedStatus() {
    const el = qs('#seed-status');
    try {
      const st = await fetchJson(API + '/seed-status');
      el.innerHTML = `Actualmente: <strong>${st.clientes}</strong> clientes, <strong>${st.refacciones}</strong> refacciones, <strong>${st.maquinas}</strong> máquinas, <strong>${st.cotizaciones || 0}</strong> cotizaciones, <strong>${st.incidentes || 0}</strong> incidentes, <strong>${st.bitacoras || 0}</strong> bitácoras.`;
    } catch (e) { el.textContent = 'No se pudo conectar con el servidor.'; }
  }

  async function seedDemo() {
    const btn = qs('#btn-seed-demo');
    btn.disabled = true;
    btn.textContent = 'Cargando…';
    try {
      const data = await fetchJson(API + '/seed-demo', { method: 'POST' });
      qs('#seed-status').innerHTML = `Listo: <strong>${data.clientes}</strong> clientes, <strong>${data.refacciones}</strong> refacciones, <strong>${data.maquinas}</strong> máquinas, <strong>${data.cotizaciones || 0}</strong> cotizaciones, <strong>${data.incidentes || 0}</strong> incidentes, <strong>${data.bitacoras || 0}</strong> bitácoras.`;
      btn.textContent = 'Datos demo cargados';
      loadCotizaciones();
      loadIncidentes();
      loadBitacoras();
      loadClientes();
      loadRefacciones();
      loadMaquinas();
      fillClientesSelect();
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

  function debounce(fn, ms) {
    let t;
    return function () { clearTimeout(t); t = setTimeout(() => fn.apply(this, arguments), ms); };
  }

  // ----- EVENT LISTENERS -----
  qs('#buscar-clientes').addEventListener('input', debounce(loadClientes, 350));
  qs('#buscar-refacciones').addEventListener('input', debounce(loadRefacciones, 350));
  qs('#filtro-cliente-maq').addEventListener('change', loadMaquinas);
  qs('#nuevo-cliente').addEventListener('click', () => openModalCliente(null));
  qs('#nueva-refaccion').addEventListener('click', () => openModalRefaccion(null));
  qs('#nueva-maquina').addEventListener('click', () => openModalMaquina(null));
  qs('#nueva-cotizacion').addEventListener('click', () => openModalCotizacion(null));
  qs('#nuevo-incidente').addEventListener('click', () => openModalIncidente(null));
  qs('#nueva-bitacora').addEventListener('click', () => openModalBitacora(null));
  qs('.btn-empty-cot').addEventListener('click', () => openModalCotizacion(null));
  qs('.btn-empty-inc').addEventListener('click', () => openModalIncidente(null));
  qs('.btn-empty-bit').addEventListener('click', () => openModalBitacora(null));
  // ----- Asistente IA: bienvenida, system prompt en backend, chat amigable -----
  (function initAiChat() {
    const messagesEl = qs('#ai-messages');
    const inputEl = qs('#ai-input');
    const sendBtn = qs('#ai-send');
    if (!messagesEl || !inputEl || !sendBtn) return;
    function append(msg, isUser) {
      const div = document.createElement('div');
      div.className = 'ai-msg ' + (isUser ? 'ai-msg-user' : 'ai-msg-bot');
      div.style.whiteSpace = 'pre-wrap';
      div.textContent = msg;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
    async function loadWelcome() {
      try {
        const data = await fetchJson(API + '/ai/welcome');
        if (data.message) append(data.message, false);
      } catch (_) {
        append('¡Hola! Soy tu asistente. Puedo ayudarte con clientes, cotizaciones, incidentes y más. ¿En qué te ayudo?', false);
      }
    }
    loadWelcome();
    async function send() {
      const text = inputEl.value.trim();
      if (!text) return;
      inputEl.value = '';
      append(text, true);
      sendBtn.disabled = true;
      try {
        const data = await fetchJson(API + '/ai/chat', { method: 'POST', body: JSON.stringify({ message: text }) });
        append(data.reply || 'Sin respuesta', false);
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
      loadCotizaciones();
      loadIncidentes();
      loadBitacoras();
    } catch (e) {
      let msg = e.message;
      try { const o = JSON.parse(msg); if (o.error) msg = o.error; } catch (_) {}
      qs('#seed-status').innerHTML = '<span class="error-msg">Error: ' + escapeHtml(msg) + '</span>';
    }
    btn.disabled = false;
    btn.textContent = 'Cargar solo incidentes, bitácoras y cotizaciones demo';
  });

  loadClientes();
  fillClientesSelect();
  loadSeedStatus();
})();
