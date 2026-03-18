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
    if (id === 'demo') loadSeedStatus();
  }

  qsAll('.tab').forEach(t => {
    t.addEventListener('click', () => showPanel(t.dataset.tab));
  });

  async function fetchJson(url, opts) {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  function renderClientes(data) {
    const tbody = qs('#tabla-clientes tbody');
    tbody.innerHTML = '';
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">No hay clientes. Carga los datos demo o agrega uno nuevo.</td></tr>';
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
      `;
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => openModalCliente(c));
      tbody.appendChild(tr);
    });
  }

  function renderRefacciones(data) {
    const tbody = qs('#tabla-refacciones tbody');
    tbody.innerHTML = '';
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">No hay refacciones. Carga los datos demo o agrega una nueva.</td></tr>';
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
      `;
      tbody.appendChild(tr);
    });
  }

  function renderMaquinas(data) {
    const tbody = qs('#tabla-maquinas tbody');
    tbody.innerHTML = '';
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">No hay máquinas. Carga los datos demo o agrega una nueva.</td></tr>';
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
      `;
      tbody.appendChild(tr);
    });
  }

  function renderCotizaciones(data) {
    const tbody = qs('#tabla-cotizaciones tbody');
    tbody.innerHTML = '';
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty">No hay cotizaciones.</td></tr>';
      return;
    }
    data.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(c.folio || '')}</td>
        <td>${escapeHtml(c.cliente_nombre || '')}</td>
        <td>${escapeHtml(c.tipo || '')}</td>
        <td>${escapeHtml(c.fecha || '')}</td>
        <td>${typeof c.total === 'number' ? '$' + c.total.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : ''}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderIncidentes(data) {
    const tbody = qs('#tabla-incidentes tbody');
    tbody.innerHTML = '';
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">No hay incidentes.</td></tr>';
      return;
    }
    data.forEach(i => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(i.folio || '')}</td>
        <td>${escapeHtml(i.cliente_nombre || '')}</td>
        <td>${escapeHtml(i.maquina_nombre || '')}</td>
        <td>${escapeHtml((i.descripcion || '').slice(0, 50))}${(i.descripcion && i.descripcion.length > 50) ? '…' : ''}</td>
        <td>${escapeHtml(i.prioridad || '')}</td>
        <td>${escapeHtml(i.estatus || '')}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  async function loadClientes() {
    const q = qs('#buscar-clientes').value.trim();
    const url = q ? `${API}/clientes?q=${encodeURIComponent(q)}` : `${API}/clientes`;
    try {
      const data = await fetchJson(url);
      clientesCache = data;
      renderClientes(data);
    } catch (e) {
      renderClientes([]);
      console.error(e);
    }
  }

  async function loadRefacciones() {
    const q = qs('#buscar-refacciones').value.trim();
    const url = q ? `${API}/refacciones?q=${encodeURIComponent(q)}` : `${API}/refacciones`;
    try {
      const data = await fetchJson(url);
      refaccionesCache = data;
      renderRefacciones(data);
    } catch (e) {
      renderRefacciones([]);
      console.error(e);
    }
  }

  async function loadMaquinas() {
    const clienteId = qs('#filtro-cliente-maq').value;
    const url = clienteId ? `${API}/maquinas?cliente_id=${clienteId}` : `${API}/maquinas`;
    try {
      const data = await fetchJson(url);
      maquinasCache = data;
      renderMaquinas(data);
    } catch (e) {
      renderMaquinas([]);
      console.error(e);
    }
  }

  async function loadCotizaciones() {
    try {
      const data = await fetchJson(API + '/cotizaciones');
      renderCotizaciones(data);
    } catch (e) {
      renderCotizaciones([]);
    }
  }

  async function loadIncidentes() {
    try {
      const data = await fetchJson(API + '/incidentes');
      renderIncidentes(data);
    } catch (e) {
      renderIncidentes([]);
    }
  }

  async function loadSeedStatus() {
    const el = qs('#seed-status');
    try {
      const st = await fetchJson(API + '/seed-status');
      el.textContent = `Actualmente: ${st.clientes} clientes, ${st.refacciones} refacciones, ${st.maquinas} máquinas.`;
    } catch (e) {
      el.textContent = 'No se pudo conectar con el servidor.';
    }
  }

  async function seedDemo() {
    const btn = qs('#btn-seed-demo');
    btn.disabled = true;
    btn.textContent = 'Cargando…';
    try {
      const r = await fetch(API + '/seed-demo', { method: 'POST' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || r.statusText);
      qs('#seed-status').textContent = `Listo: ${data.clientes} clientes, ${data.refacciones} refacciones, ${data.maquinas} máquinas cargados.`;
      btn.textContent = 'Datos demo cargados';
      loadClientes();
      loadRefacciones();
      loadMaquinas();
    } catch (e) {
      qs('#seed-status').textContent = 'Error: ' + e.message;
      btn.textContent = 'Cargar datos demo ahora';
    }
    btn.disabled = false;
  }

  function openModal(title, bodyHtml, onClose) {
    const modal = qs('#modal');
    qs('#modal-title').textContent = title;
    qs('#modal-body').innerHTML = bodyHtml;
    modal.classList.remove('hidden');
    const close = () => {
      modal.classList.add('hidden');
      if (onClose) onClose();
    };
    qs('#modal .close').onclick = close;
    modal.onclick = e => { if (e.target === modal) close(); };
    return close;
  }

  function openModalCliente(cliente) {
    const isNew = !cliente || !cliente.id;
    const title = isNew ? 'Nuevo cliente' : 'Ver / Editar cliente';
    const body = `
      <div class="form-group"><label>Código</label><input type="text" id="m-codigo" value="${escapeHtml(cliente && cliente.codigo) || ''}"></div>
      <div class="form-group"><label>Nombre</label><input type="text" id="m-nombre" value="${escapeHtml(cliente && cliente.nombre) || ''}" required></div>
      <div class="form-group"><label>RFC</label><input type="text" id="m-rfc" value="${escapeHtml(cliente && cliente.rfc) || ''}"></div>
      <div class="form-group"><label>Contacto</label><input type="text" id="m-contacto" value="${escapeHtml(cliente && cliente.contacto) || ''}"></div>
      <div class="form-group"><label>Teléfono</label><input type="text" id="m-telefono" value="${escapeHtml(cliente && cliente.telefono) || ''}"></div>
      <div class="form-group"><label>Email</label><input type="email" id="m-email" value="${escapeHtml(cliente && cliente.email) || ''}"></div>
      <div class="form-group"><label>Dirección</label><input type="text" id="m-direccion" value="${escapeHtml(cliente && cliente.direccion) || ''}"></div>
      <div class="form-group"><label>Ciudad</label><input type="text" id="m-ciudad" value="${escapeHtml(cliente && cliente.ciudad) || ''}"></div>
      <button type="button" class="btn primary" id="m-save">Guardar</button>
    `;
    openModal(title, body, () => {});
    qs('#m-save').onclick = async () => {
      const payload = {
        codigo: qs('#m-codigo').value.trim() || null,
        nombre: qs('#m-nombre').value.trim(),
        rfc: qs('#m-rfc').value.trim() || null,
        contacto: qs('#m-contacto').value.trim() || null,
        telefono: qs('#m-telefono').value.trim() || null,
        email: qs('#m-email').value.trim() || null,
        direccion: qs('#m-direccion').value.trim() || null,
        ciudad: qs('#m-ciudad').value.trim() || null,
      };
      try {
        if (isNew) await fetchJson(API + '/clientes', { method: 'POST', body: JSON.stringify(payload) });
        else await fetchJson(API + '/clientes/' + cliente.id, { method: 'PUT', body: JSON.stringify(payload) });
        loadClientes();
        qs('#modal').classList.add('hidden');
      } catch (e) {
        alert('Error: ' + e.message);
      }
    };
  }

  qs('#buscar-clientes').addEventListener('input', debounce(loadClientes, 350));
  qs('#buscar-refacciones').addEventListener('input', debounce(loadRefacciones, 350));
  qs('#filtro-cliente-maq').addEventListener('change', loadMaquinas);
  qs('#nuevo-cliente').addEventListener('click', () => openModalCliente(null));
  qs('#btn-seed-demo').addEventListener('click', seedDemo);

  async function fillClientesSelect() {
    try {
      const data = await fetchJson(API + '/clientes');
      const sel = qs('#filtro-cliente-maq');
      const first = sel.innerHTML;
      sel.innerHTML = first + data.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
    } catch (_) {}
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, arguments), ms);
    };
  }

  loadClientes();
  fillClientesSelect();
  loadSeedStatus();
})();
