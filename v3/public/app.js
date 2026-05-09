/* ═══════════════════════════════════════════════════════════════
   Sistema Cotización v3 — App JS único.
   Vanilla JS, sin frameworks. Hash routing simple. Sin SW.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ─────────────── State global ─────────────── */
  const state = {
    user: null,
    currentRoute: null,
  };

  const TOKEN_KEY = 'cot-v3-token';
  const USER_KEY = 'cot-v3-user';

  /* ─────────────── Utils ─────────────── */
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s == null ? '' : String(s);
    return div.innerHTML;
  }

  function fmtMoney(n, currency) {
    if (n == null || isNaN(n)) return '—';
    return new Intl.NumberFormat('es-MX', {
      style: 'currency', currency: currency || 'MXN', minimumFractionDigits: 2,
    }).format(Number(n));
  }

  function fmtDate(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('es-MX'); } catch { return d; }
  }

  function fmtDateTime(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleString('es-MX'); } catch { return d; }
  }

  /* ─────────────── Toast ─────────────── */
  function toast(msg, kind = 'info', duration = 3000) {
    const host = $('#toasts');
    if (!host) return;
    const el = document.createElement('div');
    el.className = `toast toast-${kind}`;
    el.textContent = msg;
    host.appendChild(el);
    if (duration > 0) {
      setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 200);
      }, duration);
    }
  }

  /* ─────────────── Modal ─────────────── */
  function openModal({ title, body, footer, size }) {
    const host = $('#modal-host');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const panel = document.createElement('div');
    panel.className = 'modal-panel' + (size === 'lg' ? ' size-lg' : '');
    panel.innerHTML = `
      <div class="modal-header">
        <h3 class="modal-title">${escapeHtml(title || '')}</h3>
        <button type="button" class="modal-close" aria-label="Cerrar">&times;</button>
      </div>
      <div class="modal-body"></div>
      ${footer ? '<div class="modal-footer"></div>' : ''}
    `;
    overlay.appendChild(panel);
    host.appendChild(overlay);

    const bodyEl = panel.querySelector('.modal-body');
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else if (body instanceof HTMLElement) bodyEl.appendChild(body);

    if (footer) {
      const footerEl = panel.querySelector('.modal-footer');
      if (typeof footer === 'string') footerEl.innerHTML = footer;
      else if (footer instanceof HTMLElement) footerEl.appendChild(footer);
    }

    requestAnimationFrame(() => overlay.classList.add('is-open'));

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      overlay.classList.remove('is-open');
      setTimeout(() => overlay.remove(), 150);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    panel.querySelector('.modal-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);

    return { close, panel };
  }

  function confirmModal(message, opts = {}) {
    return new Promise((resolve) => {
      const { close, panel } = openModal({
        title: opts.title || 'Confirmar',
        body: `<p>${escapeHtml(message)}</p>`,
        footer: `
          <button type="button" class="btn" data-act="cancel">Cancelar</button>
          <button type="button" class="btn ${opts.danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${opts.okText || 'Aceptar'}</button>
        `,
      });
      panel.querySelector('[data-act="cancel"]').addEventListener('click', () => { close(); resolve(false); });
      panel.querySelector('[data-act="ok"]').addEventListener('click', () => { close(); resolve(true); });
    });
  }

  /* ─────────────── API client ─────────────── */
  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  }

  async function api(method, path, body) {
    const headers = { 'Accept': 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    const opts = { method, headers, credentials: 'include' };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    if (res.status === 204) return null;
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : await res.text();
    if (!res.ok) {
      const err = new Error((data && data.error) || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  api.get = (path) => api('GET', path);
  api.post = (path, body) => api('POST', path, body);
  api.put = (path, body) => api('PUT', path, body);
  api.del = (path) => api('DELETE', path);

  /* ─────────────── Auth ─────────────── */
  function saveAuth(token, user) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {}
    state.user = user;
  }

  function clearAuth() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {}
    state.user = null;
  }

  function loadStoredUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (raw) state.user = JSON.parse(raw);
    } catch {}
  }

  /* ─────────────── Router ─────────────── */
  const ROUTES = {
    'login':            { handler: renderLogin, title: 'Iniciar sesión', requiresAuth: false },
    '':                 { handler: renderDashboard, title: 'Dashboard', requiresAuth: true },
    'dashboard':         { handler: renderDashboard, title: 'Dashboard', requiresAuth: true },
    'clientes':          { handler: () => renderCrud('clientes'), title: 'Clientes', requiresAuth: true },
    'categorias':        { handler: () => renderCrud('categorias'), title: 'Categorías', requiresAuth: true },
    'refacciones':       { handler: () => renderCrud('refacciones'), title: 'Refacciones', requiresAuth: true },
    'maquinas':          { handler: () => renderCrud('maquinas'), title: 'Máquinas', requiresAuth: true },
    'cotizaciones':      { handler: renderCotizaciones, title: 'Cotizaciones', requiresAuth: true },
    'ventas':            { handler: () => renderCrud('ventas'), title: 'Ventas', requiresAuth: true },
    'prospectos':        { handler: () => renderCrud('prospectos'), title: 'Prospectos', requiresAuth: true },
    'revision-maquinas': { handler: () => renderCrud('revision-maquinas'), title: 'Revisión Máquinas', requiresAuth: true },
    'garantias':         { handler: () => renderCrud('garantias'), title: 'Garantías', requiresAuth: true },
    'mantenimientos':    { handler: renderMantenimientos, title: 'Mantenimientos', requiresAuth: true },
    'sin-cobertura':     { handler: () => renderCrud('sin-cobertura'), title: 'Sin Cobertura', requiresAuth: true },
    'tarifas':           { handler: renderTarifas, title: 'Tarifas', requiresAuth: true },
    'personal':          { handler: () => renderCrud('personal'), title: 'Personal', requiresAuth: true },
    'bonos':             { handler: () => renderCrud('bonos'), title: 'Bonos', requiresAuth: true },
    'viajes':            { handler: () => renderCrud('viajes'), title: 'Viajes', requiresAuth: true },
    'bitacora':          { handler: () => renderCrud('bitacora'), title: 'Bitácora horas', requiresAuth: true },
    'reportes':          { handler: renderReportes, title: 'Reportes', requiresAuth: true },
    'davai':             { handler: renderDavai, title: 'DavAI', requiresAuth: true },
    'usuarios':          { handler: renderUsuarios, title: 'Usuarios', requiresAuth: true, requiresAdmin: true },
    'audit':             { handler: renderAudit, title: 'Auditoría', requiresAuth: true, requiresAdmin: true },
  };

  function navigate(route) {
    const path = '#/' + route.replace(/^#?\/?/, '');
    if (location.hash === path) handleRoute();
    else location.hash = path;
  }

  function handleRoute() {
    const hash = (location.hash || '#/').replace(/^#?\/?/, '');
    const route = ROUTES[hash] || ROUTES['dashboard'];
    state.currentRoute = hash;

    if (route.requiresAuth && !state.user) {
      navigate('login');
      return;
    }
    if (route.requiresAdmin && state.user?.role !== 'admin') {
      toast('Solo administradores', 'error');
      navigate('dashboard');
      return;
    }

    if (route.requiresAuth) {
      ensureShell();
      $('#topbar-title').textContent = route.title;
      document.title = route.title + ' · Servicio Técnico';
    }

    try {
      route.handler();
    } catch (err) {
      console.error('[route handler]', err);
      toast('Error: ' + err.message, 'error');
    }

    /* Marcar nav activo */
    $$('.nav-item').forEach((n) => {
      n.classList.toggle('active', n.dataset.route === hash);
    });
  }

  /* ─────────────── App Shell ─────────────── */
  let shellRendered = false;

  function ensureShell() {
    const app = $('#app');
    if (shellRendered && $('#main-content')) return;

    const NAV = [
      { group: 'Principal', items: [
        { route: 'dashboard', label: 'Dashboard', icon: '📊' },
      ]},
      { group: 'Catálogos', items: [
        { route: 'clientes', label: 'Clientes', icon: '👥' },
        { route: 'refacciones', label: 'Refacciones', icon: '🔧' },
        { route: 'categorias', label: 'Categorías', icon: '📂' },
        { route: 'maquinas', label: 'Máquinas', icon: '⚙️' },
      ]},
      { group: 'Operaciones', items: [
        { route: 'cotizaciones', label: 'Cotizaciones', icon: '📄' },
        { route: 'ventas', label: 'Ventas', icon: '💰' },
      ]},
      { group: 'Comercial', items: [
        { route: 'prospectos', label: 'Prospectos', icon: '🎯' },
      ]},
      { group: 'Técnico', items: [
        { route: 'revision-maquinas', label: 'Revisión Máq.', icon: '🔍' },
        { route: 'garantias', label: 'Garantías', icon: '🛡' },
        { route: 'mantenimientos', label: 'Mantenimientos', icon: '📅' },
        { route: 'sin-cobertura', label: 'Sin Cobertura', icon: '🚫' },
      ]},
      { group: 'Configuración', items: [
        { route: 'tarifas', label: 'Tarifas', icon: '💵' },
      ]},
      { group: 'Recursos Humanos', items: [
        { route: 'personal', label: 'Personal', icon: '👷' },
        { route: 'bonos', label: 'Bonos', icon: '🎁' },
        { route: 'viajes', label: 'Viajes', icon: '✈️' },
        { route: 'bitacora', label: 'Bitácora horas', icon: '⏱' },
      ]},
      { group: 'Analytics', items: [
        { route: 'reportes', label: 'Reportes', icon: '📈' },
      ]},
      { group: 'Asistente IA', items: [
        { route: 'davai', label: 'DavAI', icon: '🤖' },
      ]},
      { group: 'Administración', items: [
        { route: 'usuarios', label: 'Usuarios', icon: '🔐', adminOnly: true },
        { route: 'audit', label: 'Auditoría', icon: '📋', adminOnly: true },
      ]},
    ];

    const navHtml = NAV.map((g) => {
      const items = g.items.filter((it) => !it.adminOnly || state.user?.role === 'admin');
      if (!items.length) return '';
      return `
        <div class="nav-group-label">${escapeHtml(g.group)}</div>
        ${items.map((it) => `
          <div class="nav-item" data-route="${it.route}">
            <span class="nav-item-icon">${it.icon}</span>
            <span>${escapeHtml(it.label)}</span>
          </div>
        `).join('')}
      `;
    }).join('');

    app.innerHTML = `
      <div class="app-layout">
        <aside class="sidebar">
          <div class="sidebar-header">
            <div class="sidebar-logo">ST</div>
            <div>
              <div class="sidebar-title">Servicio Técnico</div>
              <div class="sidebar-subtitle">v3.0</div>
            </div>
          </div>
          <nav class="sidebar-nav">${navHtml}</nav>
          <div class="sidebar-footer">
            <div>
              <div class="sidebar-user-name">${escapeHtml(state.user?.nombre || state.user?.username || '—')}</div>
              <div class="sidebar-user-role">${escapeHtml(state.user?.role || '')}</div>
            </div>
            <button class="btn btn-icon btn-ghost" id="logout-btn" title="Salir">⏏</button>
          </div>
        </aside>
        <div class="main-area">
          <div class="topbar">
            <div class="topbar-title" id="topbar-title">—</div>
            <div class="topbar-version">v3.0.0</div>
          </div>
          <main class="main-content" id="main-content"></main>
        </div>
      </div>
    `;

    /* Bindings */
    $$('.nav-item').forEach((n) => {
      n.addEventListener('click', () => navigate(n.dataset.route));
    });
    $('#logout-btn')?.addEventListener('click', async () => {
      try { await api.post('/api/auth/logout'); } catch {}
      clearAuth();
      shellRendered = false;
      navigate('login');
    });

    shellRendered = true;
  }

  /* ─────────────── LOGIN ─────────────── */
  function renderLogin() {
    shellRendered = false;
    const app = $('#app');
    app.innerHTML = `
      <div class="login-screen">
        <div class="login-card">
          <div class="login-logo">ST</div>
          <h1 class="login-title">Servicio Técnico</h1>
          <p class="login-subtitle">Inicia sesión para continuar</p>
          <form id="login-form">
            <div class="form-row">
              <label class="label">Usuario</label>
              <input class="input" type="text" name="username" required autofocus autocomplete="username" />
            </div>
            <div class="form-row">
              <label class="label">Contraseña</label>
              <input class="input" type="password" name="password" required autocomplete="current-password" />
            </div>
            <div id="login-error" class="text-danger text-sm hidden mb-3"></div>
            <button type="submit" class="btn btn-primary" style="width:100%">Entrar</button>
          </form>
          <p class="text-xs muted text-center mt-4">v3.0 · Sin Service Worker · Estable</p>
        </div>
      </div>
    `;

    const form = $('#login-form');
    const errEl = $('#login-error');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errEl.classList.add('hidden');
      const fd = new FormData(form);
      const username = fd.get('username').trim();
      const password = fd.get('password');
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Entrando...';
      try {
        const res = await api.post('/api/auth/login', { username, password });
        saveAuth(res.token, res.user);
        navigate('dashboard');
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Entrar';
      }
    });
  }

  /* ─────────────── DASHBOARD ─────────────── */
  async function renderDashboard() {
    const main = $('#main-content');
    main.innerHTML = '<div class="empty"><span class="spinner spinner-lg"></span><p>Cargando...</p></div>';

    try {
      const data = await api.get('/api/dashboard');

      const totalCotMonto = data.cotPorEstado.reduce((s, c) => s + (c.total || 0), 0);
      const totalCotCount = data.cotPorEstado.reduce((s, c) => s + (c.count || 0), 0);

      main.innerHTML = `
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-label">👥 Clientes</div>
            <div class="kpi-value">${data.counts.clientes}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">🔧 Refacciones</div>
            <div class="kpi-value">${data.counts.refacciones}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">⚙️ Máquinas</div>
            <div class="kpi-value">${data.counts.maquinas}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">📄 Cotizaciones</div>
            <div class="kpi-value">${data.counts.cotizaciones}</div>
            <div class="kpi-sub">${fmtMoney(totalCotMonto)} en pipeline</div>
          </div>
        </div>

        <div class="card mb-3">
          <h3 style="margin:0 0 12px;font-size:14px">Cotizaciones por estado</h3>
          ${data.cotPorEstado.length === 0
            ? '<div class="muted text-sm">Sin cotizaciones aún.</div>'
            : data.cotPorEstado.map((c) => `
                <div class="flex justify-between items-center" style="padding:6px 0;border-bottom:1px solid var(--border)">
                  <span style="text-transform:capitalize">${escapeHtml(c.estado)}</span>
                  <span class="font-mono text-sm">
                    <strong>${c.count}</strong> · ${fmtMoney(c.total)}
                  </span>
                </div>
              `).join('')
          }
        </div>

        ${data.stockBajo.length ? `
          <div class="card">
            <h3 style="margin:0 0 12px;font-size:14px">⚠️ Stock bajo</h3>
            ${data.stockBajo.map((r) => `
              <div class="flex justify-between items-center" style="padding:6px 0;border-bottom:1px solid var(--border)">
                <span><strong>${escapeHtml(r.numero_parte)}</strong> · <span class="muted">${escapeHtml(r.descripcion)}</span></span>
                <span class="text-sm font-mono text-danger">${r.stock} / ${r.stock_minimo}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
      `;
    } catch (err) {
      main.innerHTML = `<div class="empty text-danger">Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  /* ─────────────── CRUD GENÉRICO ─────────────── */
  const CRUD_CONFIGS = {
    clientes: {
      title: 'Clientes',
      cols: [
        { key: 'razon_social', label: 'Razón Social', render: (r) => `<strong>${escapeHtml(r.razon_social)}</strong>` },
        { key: 'rfc', label: 'RFC' },
        { key: 'contacto', label: 'Contacto' },
        { key: 'telefono', label: 'Teléfono' },
        { key: 'ciudad', label: 'Ciudad' },
        { key: 'activo', label: 'Activo', class: 'col-center', render: (r) => r.activo ? '<span class="badge badge-success">Sí</span>' : '<span class="badge badge-danger">No</span>' },
      ],
      fields: [
        { name: 'razon_social', label: 'Razón Social *', required: true },
        { name: 'rfc', label: 'RFC' },
        { name: 'contacto', label: 'Contacto' },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'telefono', label: 'Teléfono' },
        { name: 'ciudad', label: 'Ciudad' },
        { name: 'estado', label: 'Estado' },
        { name: 'notas', label: 'Notas', type: 'textarea', full: true },
        { name: 'activo', label: 'Activo', type: 'checkbox', default: true },
      ],
    },
    refacciones: {
      title: 'Refacciones',
      cols: [
        { key: 'numero_parte', label: 'No. Parte', render: (r) => `<strong>${escapeHtml(r.numero_parte)}</strong>` },
        { key: 'descripcion', label: 'Descripción' },
        { key: 'categoria', label: 'Categoría' },
        { key: 'marca', label: 'Marca' },
        { key: 'stock', label: 'Stock', class: 'col-num' },
        { key: 'precio_venta_mxn', label: 'Precio MXN', class: 'col-num', render: (r) => fmtMoney(r.precio_venta_mxn) },
        { key: 'precio_venta_usd', label: 'Precio USD', class: 'col-num', render: (r) => fmtMoney(r.precio_venta_usd, 'USD') },
      ],
      fields: [
        { name: 'numero_parte', label: 'No. Parte *', required: true },
        { name: 'descripcion', label: 'Descripción *', type: 'textarea', required: true, full: true },
        { name: 'categoria', label: 'Categoría' },
        { name: 'marca', label: 'Marca' },
        { name: 'proveedor', label: 'Proveedor' },
        { name: 'precio_compra_usd', label: 'Precio compra USD', type: 'number', step: '0.01' },
        { name: 'precio_venta_usd', label: 'Precio venta USD', type: 'number', step: '0.01' },
        { name: 'precio_venta_mxn', label: 'Precio venta MXN', type: 'number', step: '0.01' },
        { name: 'stock', label: 'Stock actual', type: 'number' },
        { name: 'stock_minimo', label: 'Stock mínimo', type: 'number' },
        { name: 'ubicacion', label: 'Ubicación' },
        { name: 'notas', label: 'Notas', type: 'textarea', full: true },
        { name: 'activo', label: 'Activo', type: 'checkbox', default: true },
      ],
    },
    maquinas: {
      title: 'Máquinas',
      cols: [
        { key: 'modelo', label: 'Modelo', render: (r) => `<strong>${escapeHtml(r.modelo)}</strong>` },
        { key: 'numero_serie', label: 'No. Serie' },
        { key: 'categoria', label: 'Categoría' },
        { key: 'cliente_nombre', label: 'Cliente' },
        { key: 'ubicacion', label: 'Ubicación' },
        { key: 'fecha_instalacion', label: 'Instalación', render: (r) => fmtDate(r.fecha_instalacion) },
      ],
      fields: [
        { name: 'modelo', label: 'Modelo *', required: true },
        { name: 'numero_serie', label: 'No. Serie' },
        { name: 'categoria', label: 'Categoría' },
        { name: 'cliente_nombre', label: 'Cliente (nombre)' },
        { name: 'ubicacion', label: 'Ubicación' },
        { name: 'fecha_instalacion', label: 'Fecha instalación', type: 'date' },
        { name: 'notas', label: 'Notas', type: 'textarea', full: true },
        { name: 'activo', label: 'Activo', type: 'checkbox', default: true },
      ],
    },
    ventas: {
      title: 'Ventas',
      cols: [
        { key: 'fecha_venta', label: 'Fecha', render: (r) => fmtDate(r.fecha_venta) },
        { key: 'folio_factura', label: 'Factura' },
        { key: 'cliente_nombre', label: 'Cliente', render: (r) => `<strong>${escapeHtml(r.cliente_nombre)}</strong>` },
        { key: 'total', label: 'Total', class: 'col-num', render: (r) => fmtMoney(r.total, r.moneda) },
        { key: 'pagado', label: 'Pagado', class: 'col-center', render: (r) => r.pagado ? '<span class="badge badge-success">Sí</span>' : '<span class="badge badge-warning">No</span>' },
      ],
      fields: [
        { name: 'cliente_nombre', label: 'Cliente *', required: true },
        { name: 'fecha_venta', label: 'Fecha venta', type: 'date' },
        { name: 'folio_factura', label: 'Folio factura' },
        { name: 'total', label: 'Total *', type: 'number', step: '0.01', required: true },
        { name: 'moneda', label: 'Moneda', type: 'select', options: [{value:'MXN',label:'MXN'},{value:'USD',label:'USD'}], default: 'MXN' },
        { name: 'pagado', label: 'Pagado', type: 'checkbox' },
        { name: 'fecha_pago', label: 'Fecha pago', type: 'date' },
        { name: 'cotizacion_id', label: 'ID Cotización', type: 'number' },
        { name: 'notas', label: 'Notas', type: 'textarea', full: true },
      ],
    },
    categorias: {
      title: 'Categorías',
      cols: [
        { key: 'nombre', label: 'Nombre', render: (r) => `<strong>${escapeHtml(r.nombre)}</strong>` },
        { key: 'tipo', label: 'Tipo', class: 'col-center' },
        { key: 'parent_id', label: 'Parent', class: 'col-num' },
        { key: 'orden', label: 'Orden', class: 'col-num' },
      ],
      fields: [
        { name: 'nombre', label: 'Nombre *', required: true },
        { name: 'tipo', label: 'Tipo', type: 'select', required: true, options: [
          { value: 'refaccion', label: 'Refacción' }, { value: 'maquina', label: 'Máquina' },
        ]},
        { name: 'parent_id', label: 'ID Padre (opcional)', type: 'number' },
        { name: 'orden', label: 'Orden', type: 'number' },
      ],
    },
    prospectos: {
      title: 'Prospectos',
      cols: [
        { key: 'empresa', label: 'Empresa', render: (r) => `<strong>${escapeHtml(r.empresa)}</strong>` },
        { key: 'contacto', label: 'Contacto' },
        { key: 'industria', label: 'Industria' },
        { key: 'ciudad', label: 'Ciudad' },
        { key: 'estado', label: 'Estado', class: 'col-center', render: (r) => {
          const k = r.estado === 'ganado' ? 'success' : r.estado === 'perdido' ? 'danger' : 'info';
          return `<span class="badge badge-${k}">${escapeHtml(r.estado)}</span>`;
        }},
        { key: 'score_ia', label: 'Score', class: 'col-num', render: (r) => `<strong>${r.score_ia ?? 0}</strong>` },
        { key: 'potencial_usd', label: 'Potencial', class: 'col-num', render: (r) => fmtMoney(r.potencial_usd, 'USD') },
      ],
      fields: [
        { name: 'empresa', label: 'Empresa *', required: true },
        { name: 'contacto', label: 'Contacto' },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'telefono', label: 'Teléfono' },
        { name: 'industria', label: 'Industria' },
        { name: 'ciudad', label: 'Ciudad' },
        { name: 'estado', label: 'Estado', type: 'select', options: [
          { value: 'prospecto', label: 'Prospecto' },
          { value: 'contactado', label: 'Contactado' },
          { value: 'calificado', label: 'Calificado' },
          { value: 'propuesta', label: 'Propuesta' },
          { value: 'negociacion', label: 'Negociación' },
          { value: 'ganado', label: 'Ganado' },
          { value: 'perdido', label: 'Perdido' },
        ]},
        { name: 'potencial_usd', label: 'Potencial USD', type: 'number', step: '0.01' },
        { name: 'score_ia', label: 'Score IA (0-100)', type: 'number' },
        { name: 'ultimo_contacto', label: 'Último contacto', type: 'date' },
        { name: 'ubicacion_lat', label: 'Latitud', type: 'number', step: '0.000001' },
        { name: 'ubicacion_lng', label: 'Longitud', type: 'number', step: '0.000001' },
        { name: 'notas', label: 'Notas', type: 'textarea', full: true },
      ],
    },
    'revision-maquinas': {
      title: 'Revisión Máquinas',
      apiPath: 'revision_maquinas',
      cols: [
        { key: 'modelo', label: 'Modelo', render: (r) => `<strong>${escapeHtml(r.modelo || '—')}</strong>` },
        { key: 'numero_serie', label: 'Serie' },
        { key: 'categoria', label: 'Categoría' },
        { key: 'entregado', label: 'Entregado', class: 'col-center', render: (r) => `<span class="badge ${r.entregado === 'Si' ? 'badge-success' : 'badge-warning'}">${r.entregado}</span>` },
        { key: 'prueba', label: 'Prueba', class: 'col-center', render: (r) => `<span class="badge ${r.prueba === 'Finalizada' ? 'badge-success' : 'badge-info'}">${r.prueba}</span>` },
      ],
      fields: [
        { name: 'maquina_id', label: 'ID Máquina', type: 'number' },
        { name: 'modelo', label: 'Modelo' },
        { name: 'numero_serie', label: 'Número de serie' },
        { name: 'categoria', label: 'Categoría' },
        { name: 'entregado', label: 'Entregado', type: 'select', options: [{value:'No',label:'No'},{value:'Si',label:'Sí'}] },
        { name: 'prueba', label: 'Prueba', type: 'select', options: [{value:'En Proceso',label:'En Proceso'},{value:'Finalizada',label:'Finalizada'}] },
        { name: 'comentarios', label: 'Comentarios', type: 'textarea', full: true },
      ],
    },
    garantias: {
      title: 'Garantías',
      cols: [
        { key: 'razon_social', label: 'Cliente', render: (r) => `<strong>${escapeHtml(r.razon_social)}</strong>` },
        { key: 'modelo_maquina', label: 'Modelo' },
        { key: 'numero_serie', label: 'Serie' },
        { key: 'fecha_inicio', label: 'Inicio', render: (r) => fmtDate(r.fecha_inicio) },
        { key: 'fecha_fin', label: 'Fin', render: (r) => fmtDate(r.fecha_fin) },
        { key: 'activa', label: 'Activa', class: 'col-center', render: (r) => r.activa ? '<span class="badge badge-success">Sí</span>' : '<span class="badge badge-danger">No</span>' },
      ],
      fields: [
        { name: 'razon_social', label: 'Cliente *', required: true },
        { name: 'cliente_id', label: 'ID Cliente', type: 'number' },
        { name: 'modelo_maquina', label: 'Modelo de máquina *', required: true },
        { name: 'numero_serie', label: 'Número de serie' },
        { name: 'maquina_id', label: 'ID Máquina catálogo', type: 'number' },
        { name: 'fecha_inicio', label: 'Fecha inicio *', type: 'date', required: true },
        { name: 'fecha_fin', label: 'Fecha fin', type: 'date' },
        { name: 'activa', label: 'Activa', type: 'checkbox', default: true },
        { name: 'notas', label: 'Notas', type: 'textarea', full: true },
      ],
    },
    'sin-cobertura': {
      title: 'Sin Cobertura',
      apiPath: 'sin_cobertura',
      cols: [
        { key: 'razon_social', label: 'Cliente', render: (r) => `<strong>${escapeHtml(r.razon_social)}</strong>` },
        { key: 'maquina_modelo', label: 'Máquina' },
        { key: 'motivo', label: 'Motivo' },
        { key: 'fecha_solicitud', label: 'Fecha', render: (r) => fmtDate(r.fecha_solicitud) },
        { key: 'estado', label: 'Estado', class: 'col-center', render: (r) => {
          const k = r.estado === 'aprobado' ? 'success' : r.estado === 'rechazado' ? 'danger' : 'warning';
          return `<span class="badge badge-${k}">${escapeHtml(r.estado)}</span>`;
        }},
      ],
      fields: [
        { name: 'razon_social', label: 'Cliente *', required: true },
        { name: 'cliente_id', label: 'ID Cliente', type: 'number' },
        { name: 'maquina_modelo', label: 'Modelo máquina' },
        { name: 'motivo', label: 'Motivo', type: 'textarea' },
        { name: 'estado', label: 'Estado', type: 'select', options: [
          { value: 'pendiente', label: 'Pendiente' },
          { value: 'cotizado', label: 'Cotizado' },
          { value: 'aprobado', label: 'Aprobado' },
          { value: 'rechazado', label: 'Rechazado' },
        ]},
        { name: 'notas', label: 'Notas', type: 'textarea', full: true },
      ],
    },
    personal: {
      title: 'Personal',
      cols: [
        { key: 'nombre', label: 'Nombre', render: (r) => `<strong>${escapeHtml(r.nombre)}</strong>` },
        { key: 'rol', label: 'Rol' },
        { key: 'email', label: 'Email' },
        { key: 'telefono', label: 'Teléfono' },
        { key: 'tarifa_hora_mxn', label: 'Tarifa/h', class: 'col-num', render: (r) => fmtMoney(r.tarifa_hora_mxn) },
        { key: 'activo', label: 'Activo', class: 'col-center', render: (r) => r.activo ? '<span class="badge badge-success">Sí</span>' : '<span class="badge badge-danger">No</span>' },
      ],
      fields: [
        { name: 'nombre', label: 'Nombre *', required: true },
        { name: 'rol', label: 'Rol', type: 'select', required: true, options: [
          { value: 'mecanico', label: 'Mecánico' },
          { value: 'electronico', label: 'Electrónico' },
          { value: 'cnc', label: 'CNC / Programación' },
          { value: 'ayudante', label: 'Ayudante' },
          { value: 'admin', label: 'Admin' },
          { value: 'otro', label: 'Otro' },
        ]},
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'telefono', label: 'Teléfono' },
        { name: 'fecha_ingreso', label: 'Fecha ingreso', type: 'date' },
        { name: 'tarifa_hora_mxn', label: 'Tarifa MXN/hr', type: 'number', step: '0.01' },
        { name: 'activo', label: 'Activo', type: 'checkbox', default: true },
        { name: 'notas', label: 'Notas', type: 'textarea', full: true },
      ],
    },
    bonos: {
      title: 'Bonos',
      cols: [
        { key: 'nombre', label: 'Persona', render: (r) => `<strong>${escapeHtml(r.nombre)}</strong>` },
        { key: 'concepto', label: 'Concepto' },
        { key: 'monto', label: 'Monto', class: 'col-num', render: (r) => fmtMoney(r.monto) },
        { key: 'fecha', label: 'Fecha', render: (r) => fmtDate(r.fecha) },
        { key: 'pagado', label: 'Pagado', class: 'col-center', render: (r) => r.pagado ? '<span class="badge badge-success">Sí</span>' : '<span class="badge badge-warning">No</span>' },
      ],
      fields: [
        { name: 'nombre', label: 'Persona *', required: true },
        { name: 'personal_id', label: 'ID Personal', type: 'number' },
        { name: 'concepto', label: 'Concepto *', required: true },
        { name: 'monto', label: 'Monto MXN *', type: 'number', step: '0.01', required: true },
        { name: 'fecha', label: 'Fecha', type: 'date' },
        { name: 'pagado', label: 'Pagado', type: 'checkbox' },
        { name: 'notas', label: 'Notas', type: 'textarea', full: true },
      ],
    },
    viajes: {
      title: 'Viajes',
      cols: [
        { key: 'destino', label: 'Destino', render: (r) => `<strong>${escapeHtml(r.destino)}</strong>` },
        { key: 'zona', label: 'Zona', class: 'col-center' },
        { key: 'personas_count', label: 'Personas', class: 'col-num' },
        { key: 'dias_count', label: 'Días', class: 'col-num' },
        { key: 'total', label: 'Total', class: 'col-num', render: (r) => fmtMoney(r.total) },
        { key: 'fecha', label: 'Fecha', render: (r) => fmtDate(r.fecha) },
      ],
      fields: [
        { name: 'destino', label: 'Destino *', required: true },
        { name: 'zona', label: 'Zona *', type: 'select', required: true, options: [
          { value: 'A', label: 'A — Local' },
          { value: 'B', label: 'B — Regional' },
          { value: 'C', label: 'C — Nacional' },
        ]},
        { name: 'personas_count', label: 'Personas', type: 'number', default: 1 },
        { name: 'dias_count', label: 'Días', type: 'number', default: 1 },
        { name: 'km', label: 'Km', type: 'number', step: '0.1' },
        { name: 'total_viatico', label: 'Total viático', type: 'number', step: '0.01' },
        { name: 'total_km', label: 'Total km', type: 'number', step: '0.01' },
        { name: 'total', label: 'Total', type: 'number', step: '0.01' },
        { name: 'fecha', label: 'Fecha', type: 'date' },
        { name: 'notas', label: 'Notas', type: 'textarea', full: true },
      ],
    },
    bitacora: {
      title: 'Bitácora horas',
      apiPath: 'bitacora_horas',
      cols: [
        { key: 'fecha', label: 'Fecha', render: (r) => fmtDate(r.fecha) },
        { key: 'horas', label: 'Horas', class: 'col-num' },
        { key: 'hora_inicio', label: 'Inicio' },
        { key: 'hora_fin', label: 'Fin' },
        { key: 'cliente', label: 'Cliente' },
        { key: 'trabajo', label: 'Trabajo' },
      ],
      fields: [
        { name: 'personal_id', label: 'ID Personal *', type: 'number', required: true },
        { name: 'fecha', label: 'Fecha *', type: 'date', required: true },
        { name: 'hora_inicio', label: 'Hora inicio (HH:MM)' },
        { name: 'hora_fin', label: 'Hora fin (HH:MM)' },
        { name: 'horas', label: 'Total horas', type: 'number', step: '0.25' },
        { name: 'cliente', label: 'Cliente' },
        { name: 'trabajo', label: 'Trabajo realizado', type: 'textarea', full: true },
        { name: 'notas', label: 'Notas', type: 'textarea', full: true },
      ],
    },
  };

  async function renderCrud(entity) {
    const cfg = CRUD_CONFIGS[entity];
    if (!cfg) return;
    const apiPath = cfg.apiPath || entity;
    const main = $('#main-content');

    let searchQuery = '';
    let searchTimer;

    main.innerHTML = `
      <div class="page-header">
        <input class="input" id="search-input" type="search" placeholder="Buscar..." style="max-width:320px" />
        <div class="page-actions">
          <button class="btn btn-primary" id="new-btn">+ Nuevo</button>
        </div>
      </div>
      <div id="table-container"></div>
    `;

    const searchInput = $('#search-input');
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        searchQuery = searchInput.value.trim();
        load();
      }, 250);
    });
    $('#new-btn').addEventListener('click', () => openForm(null));

    async function load() {
      const container = $('#table-container');
      container.innerHTML = '<div class="empty"><span class="spinner"></span><p>Cargando...</p></div>';
      try {
        const url = `/api/${apiPath}` + (searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : '');
        const rows = await api.get(url);
        renderTable(container, rows);
      } catch (err) {
        container.innerHTML = `<div class="empty text-danger">Error: ${escapeHtml(err.message)}</div>`;
      }
    }

    function renderTable(container, rows) {
      if (!rows.length) {
        container.innerHTML = `
          <div class="empty">
            <div class="empty-icon">📭</div>
            <p>Sin resultados</p>
          </div>
        `;
        return;
      }
      const headers = cfg.cols.map((c) => `<th class="${c.class || ''}">${escapeHtml(c.label)}</th>`).join('');
      const bodyRows = rows.map((r) => {
        const cells = cfg.cols.map((c) => {
          const val = c.render ? c.render(r) : escapeHtml(r[c.key] != null ? r[c.key] : '—');
          return `<td class="${c.class || ''}">${val}</td>`;
        }).join('');
        return `
          <tr data-id="${r.id}">
            ${cells}
            <td class="text-right">
              <button class="btn btn-ghost btn-sm" data-edit="${r.id}">✎</button>
              ${state.user?.role === 'admin' ? `<button class="btn btn-ghost btn-sm text-danger" data-del="${r.id}">🗑</button>` : ''}
            </td>
          </tr>
        `;
      }).join('');

      container.innerHTML = `
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr>${headers}<th class="text-right">Acciones</th></tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
      `;
      container.querySelectorAll('[data-edit]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.edit;
          try {
            const row = await api.get(`/api/${apiPath}/${id}`);
            openForm(row);
          } catch (err) { toast(err.message, 'error'); }
        });
      });
      container.querySelectorAll('[data-del]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const ok = await confirmModal(`¿Eliminar este ${cfg.title.toLowerCase().slice(0, -1)}?`, { danger: true, okText: 'Eliminar' });
          if (!ok) return;
          try {
            await api.del(`/api/${apiPath}/${btn.dataset.del}`);
            toast('Eliminado', 'success');
            load();
          } catch (err) { toast(err.message, 'error'); }
        });
      });
    }

    function openForm(row) {
      const isEdit = row != null;
      const fields = cfg.fields.map((f) => {
        const val = row ? row[f.name] : (f.default ?? '');
        const required = f.required ? 'required' : '';
        let inputHtml = '';
        if (f.type === 'textarea') {
          inputHtml = `<textarea class="textarea" name="${f.name}" ${required}>${escapeHtml(val)}</textarea>`;
        } else if (f.type === 'checkbox') {
          const checked = (val == null ? f.default : val) ? 'checked' : '';
          inputHtml = `<label style="display:flex;align-items:center;gap:8px;font-weight:normal"><input type="checkbox" name="${f.name}" ${checked} /> Sí</label>`;
        } else {
          const step = f.step ? `step="${f.step}"` : '';
          inputHtml = `<input class="input" type="${f.type || 'text'}" name="${f.name}" value="${escapeHtml(val)}" ${step} ${required} />`;
        }
        return `
          <div class="form-row${f.full ? ' full' : ''}">
            <label class="label">${escapeHtml(f.label)}</label>
            ${inputHtml}
          </div>
        `;
      }).join('');

      const { close, panel } = openModal({
        title: isEdit ? `Editar ${cfg.title.toLowerCase().slice(0, -1)}` : `Nuevo ${cfg.title.toLowerCase().slice(0, -1)}`,
        body: `<form id="crud-form"><div class="form-grid">${fields}</div></form>`,
        footer: `
          <button type="button" class="btn" data-act="cancel">Cancelar</button>
          <button type="submit" form="crud-form" class="btn btn-primary">${isEdit ? 'Guardar' : 'Crear'}</button>
        `,
      });

      panel.querySelector('[data-act="cancel"]').addEventListener('click', close);
      panel.querySelector('#crud-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const data = {};
        cfg.fields.forEach((f) => {
          const el = form.querySelector(`[name="${f.name}"]`);
          if (!el) return;
          if (f.type === 'checkbox') data[f.name] = el.checked;
          else if (f.type === 'number') data[f.name] = el.value === '' ? null : Number(el.value);
          else data[f.name] = el.value;
        });
        const submitBtn = panel.querySelector('button[form="crud-form"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span>';
        try {
          if (isEdit) await api.put(`/api/${apiPath}/${row.id}`, data);
          else await api.post(`/api/${apiPath}`, data);
          toast(isEdit ? 'Actualizado' : 'Creado', 'success');
          close();
          load();
        } catch (err) {
          toast(err.message, 'error');
          submitBtn.disabled = false;
          submitBtn.textContent = isEdit ? 'Guardar' : 'Crear';
        }
      });
    }

    load();
  }

  /* ─────────────── COTIZACIONES ─────────────── */
  async function renderCotizaciones() {
    const main = $('#main-content');
    let searchQuery = '';
    let searchTimer;

    main.innerHTML = `
      <div class="page-header">
        <input class="input" id="search-input" type="search" placeholder="Buscar folio o cliente..." style="max-width:320px" />
        <div class="page-actions">
          <button class="btn btn-primary" id="new-cot-btn">+ Nueva cotización</button>
        </div>
      </div>
      <div id="cot-table"></div>
    `;

    $('#search-input').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { searchQuery = e.target.value.trim(); load(); }, 250);
    });
    $('#new-cot-btn').addEventListener('click', () => openCotForm(null));

    async function load() {
      const container = $('#cot-table');
      container.innerHTML = '<div class="empty"><span class="spinner"></span></div>';
      try {
        const url = '/api/cotizaciones' + (searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : '');
        const rows = await api.get(url);
        if (!rows.length) {
          container.innerHTML = '<div class="empty"><div class="empty-icon">📄</div><p>Sin cotizaciones aún</p></div>';
          return;
        }
        container.innerHTML = `
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th class="col-center">Estado</th>
                  <th class="col-num">Total</th>
                  <th class="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((r) => `
                  <tr>
                    <td><strong>${escapeHtml(r.folio)}</strong></td>
                    <td>${fmtDate(r.fecha)}</td>
                    <td>${escapeHtml(r.cliente_nombre)}</td>
                    <td class="col-center"><span class="badge ${badgeForEstado(r.estado)}">${escapeHtml(r.estado)}</span></td>
                    <td class="col-num">${fmtMoney(r.total, r.moneda)}</td>
                    <td class="text-right">
                      <button class="btn btn-ghost btn-sm" data-edit="${r.id}">✎</button>
                      ${state.user?.role === 'admin' ? `<button class="btn btn-ghost btn-sm text-danger" data-del="${r.id}">🗑</button>` : ''}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
        container.querySelectorAll('[data-edit]').forEach((b) => {
          b.addEventListener('click', async () => {
            try { const cot = await api.get(`/api/cotizaciones/${b.dataset.edit}`); openCotForm(cot); }
            catch (err) { toast(err.message, 'error'); }
          });
        });
        container.querySelectorAll('[data-del]').forEach((b) => {
          b.addEventListener('click', async () => {
            const ok = await confirmModal('¿Eliminar esta cotización?', { danger: true, okText: 'Eliminar' });
            if (!ok) return;
            try { await api.del(`/api/cotizaciones/${b.dataset.del}`); toast('Eliminada', 'success'); load(); }
            catch (err) { toast(err.message, 'error'); }
          });
        });
      } catch (err) {
        container.innerHTML = `<div class="empty text-danger">Error: ${escapeHtml(err.message)}</div>`;
      }
    }

    function badgeForEstado(estado) {
      switch (estado) {
        case 'aprobada': case 'facturada': return 'badge-success';
        case 'rechazada': return 'badge-danger';
        case 'enviada': return 'badge-info';
        default: return 'badge-muted';
      }
    }

    function openCotForm(cot) {
      const isEdit = cot != null;
      const items = (cot?.items?.length ? cot.items : [{ descripcion: '', numero_parte: '', cantidad: 1, precio_unitario: 0 }])
        .map((i) => ({ ...i }));

      const formHtml = `
        <form id="cot-form">
          <div class="form-grid mb-3">
            <div class="form-row full">
              <label class="label">Cliente *</label>
              <input class="input" name="cliente_nombre" required value="${escapeHtml(cot?.cliente_nombre || '')}" />
            </div>
            <div class="form-row">
              <label class="label">Estado</label>
              <select class="select" name="estado">
                ${['borrador','enviada','aprobada','rechazada','facturada'].map((s) =>
                  `<option value="${s}" ${(cot?.estado || 'borrador') === s ? 'selected' : ''}>${s}</option>`
                ).join('')}
              </select>
            </div>
            <div class="form-row">
              <label class="label">Moneda</label>
              <select class="select" name="moneda">
                <option value="MXN" ${cot?.moneda !== 'USD' ? 'selected' : ''}>MXN</option>
                <option value="USD" ${cot?.moneda === 'USD' ? 'selected' : ''}>USD</option>
              </select>
            </div>
            <div class="form-row">
              <label class="label">Tipo de cambio</label>
              <input class="input" type="number" step="0.0001" name="tipo_cambio" value="${cot?.tipo_cambio || 17}" />
            </div>
          </div>

          <div class="flex justify-between items-center mb-3">
            <div class="label" style="margin:0">Items</div>
            <button type="button" class="btn btn-sm" id="add-item">+ Agregar item</button>
          </div>

          <div id="items-container"></div>

          <div class="cot-totals">
            <span class="muted text-sm">Subtotal: <span id="t-sub" class="font-mono">$0.00</span></span>
            <span class="muted text-sm">IVA (16%): <span id="t-iva" class="font-mono">$0.00</span></span>
            <span><strong>Total: <span id="t-tot" class="font-mono">$0.00</span></strong></span>
          </div>

          <div class="form-row mt-4">
            <label class="label">Notas</label>
            <textarea class="textarea" name="notas">${escapeHtml(cot?.notas || '')}</textarea>
          </div>
        </form>
      `;

      const { close, panel } = openModal({
        title: isEdit ? `Editar ${cot.folio}` : 'Nueva cotización',
        body: formHtml,
        size: 'lg',
        footer: `
          <button type="button" class="btn" data-act="cancel">Cancelar</button>
          <button type="submit" form="cot-form" class="btn btn-primary">${isEdit ? 'Guardar' : 'Crear'}</button>
        `,
      });

      const itemsContainer = panel.querySelector('#items-container');

      function renderItems() {
        itemsContainer.innerHTML = `
          <table class="cot-items-table">
            <thead><tr>
              <th style="width:40%">Descripción</th>
              <th style="width:15%">No. Parte</th>
              <th style="width:12%">Cant.</th>
              <th style="width:15%">Precio U.</th>
              <th style="width:13%" class="text-right">Importe</th>
              <th style="width:5%"></th>
            </tr></thead>
            <tbody>
              ${items.map((it, idx) => `
                <tr data-idx="${idx}">
                  <td><input class="input" data-f="descripcion" value="${escapeHtml(it.descripcion || '')}" placeholder="Descripción" /></td>
                  <td><input class="input" data-f="numero_parte" value="${escapeHtml(it.numero_parte || '')}" /></td>
                  <td><input class="input" type="number" step="0.01" data-f="cantidad" value="${it.cantidad || 0}" /></td>
                  <td><input class="input" type="number" step="0.01" data-f="precio_unitario" value="${it.precio_unitario || 0}" /></td>
                  <td class="text-right font-mono"><span data-importe>${fmtMoney((Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0))}</span></td>
                  <td class="text-center"><button type="button" class="btn btn-ghost btn-sm text-danger" data-rm>×</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;

        itemsContainer.querySelectorAll('input[data-f]').forEach((inp) => {
          inp.addEventListener('input', () => {
            const tr = inp.closest('tr');
            const idx = Number(tr.dataset.idx);
            const f = inp.dataset.f;
            items[idx][f] = inp.type === 'number' ? Number(inp.value) || 0 : inp.value;
            tr.querySelector('[data-importe]').textContent = fmtMoney((items[idx].cantidad || 0) * (items[idx].precio_unitario || 0));
            updateTotals();
          });
        });
        itemsContainer.querySelectorAll('[data-rm]').forEach((b) => {
          b.addEventListener('click', () => {
            const idx = Number(b.closest('tr').dataset.idx);
            items.splice(idx, 1);
            if (!items.length) items.push({ descripcion: '', numero_parte: '', cantidad: 1, precio_unitario: 0 });
            renderItems(); updateTotals();
          });
        });
      }

      function updateTotals() {
        const sub = items.reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0), 0);
        const iva = sub * 0.16;
        panel.querySelector('#t-sub').textContent = fmtMoney(sub);
        panel.querySelector('#t-iva').textContent = fmtMoney(iva);
        panel.querySelector('#t-tot').textContent = fmtMoney(sub + iva);
      }

      panel.querySelector('#add-item').addEventListener('click', () => {
        items.push({ descripcion: '', numero_parte: '', cantidad: 1, precio_unitario: 0 });
        renderItems();
      });
      panel.querySelector('[data-act="cancel"]').addEventListener('click', close);

      panel.querySelector('#cot-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const payload = {
          cliente_nombre: fd.get('cliente_nombre'),
          estado: fd.get('estado'),
          moneda: fd.get('moneda'),
          tipo_cambio: Number(fd.get('tipo_cambio')) || 17,
          notas: fd.get('notas'),
          items: items.filter((i) => (i.descripcion || '').trim()),
        };
        const submitBtn = panel.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span>';
        try {
          if (isEdit) await api.put(`/api/cotizaciones/${cot.id}`, payload);
          else await api.post('/api/cotizaciones', payload);
          toast(isEdit ? 'Actualizada' : 'Creada', 'success');
          close();
          load();
        } catch (err) {
          toast(err.message, 'error');
          submitBtn.disabled = false;
          submitBtn.textContent = isEdit ? 'Guardar' : 'Crear';
        }
      });

      renderItems();
      updateTotals();
    }

    load();
  }

  /* ─────────────── USUARIOS ─────────────── */
  async function renderUsuarios() {
    const main = $('#main-content');
    main.innerHTML = `
      <div class="page-header">
        <h2 style="margin:0;font-size:14px" class="muted">Solo administradores pueden gestionar usuarios.</h2>
        <button class="btn btn-primary" id="new-user-btn">+ Nuevo usuario</button>
      </div>
      <div id="users-table"></div>
    `;

    $('#new-user-btn').addEventListener('click', () => openUserForm(null));

    async function load() {
      const c = $('#users-table');
      c.innerHTML = '<div class="empty"><span class="spinner"></span></div>';
      try {
        const rows = await api.get('/api/usuarios');
        c.innerHTML = `
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr><th>Usuario</th><th>Nombre</th><th class="col-center">Rol</th><th class="col-center">Activo</th><th>Último acceso</th><th class="text-right">Acciones</th></tr>
              </thead>
              <tbody>
                ${rows.map((r) => `
                  <tr>
                    <td><strong>${escapeHtml(r.username)}</strong></td>
                    <td>${escapeHtml(r.nombre || '—')}</td>
                    <td class="col-center"><span class="badge ${r.role === 'admin' ? 'badge-danger' : r.role === 'usuario' ? 'badge-info' : 'badge-warning'}">${r.role}</span></td>
                    <td class="col-center">${r.activo ? '<span class="badge badge-success">Sí</span>' : '<span class="badge badge-danger">No</span>'}</td>
                    <td>${fmtDateTime(r.last_login_at)}</td>
                    <td class="text-right">
                      <button class="btn btn-ghost btn-sm" data-edit="${r.id}">✎</button>
                      ${r.id !== state.user.id ? `<button class="btn btn-ghost btn-sm text-danger" data-del="${r.id}">🗑</button>` : ''}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
        c.querySelectorAll('[data-edit]').forEach((b) =>
          b.addEventListener('click', () => openUserForm(rows.find((r) => r.id == b.dataset.edit))));
        c.querySelectorAll('[data-del]').forEach((b) =>
          b.addEventListener('click', async () => {
            const ok = await confirmModal('¿Eliminar este usuario?', { danger: true, okText: 'Eliminar' });
            if (!ok) return;
            try { await api.del(`/api/usuarios/${b.dataset.del}`); toast('Eliminado', 'success'); load(); }
            catch (err) { toast(err.message, 'error'); }
          }));
      } catch (err) {
        c.innerHTML = `<div class="empty text-danger">Error: ${escapeHtml(err.message)}</div>`;
      }
    }

    function openUserForm(user) {
      const isEdit = user != null;
      const { close, panel } = openModal({
        title: isEdit ? `Editar ${user.username}` : 'Nuevo usuario',
        body: `
          <form id="user-form">
            <div class="form-row">
              <label class="label">Usuario *</label>
              <input class="input" name="username" required value="${escapeHtml(user?.username || '')}" />
            </div>
            <div class="form-row">
              <label class="label">Contraseña ${isEdit ? '(dejar vacío para no cambiar)' : '*'}</label>
              <input class="input" type="password" name="password" ${isEdit ? '' : 'required'} minlength="6" />
            </div>
            <div class="form-row">
              <label class="label">Nombre completo</label>
              <input class="input" name="nombre" value="${escapeHtml(user?.nombre || '')}" />
            </div>
            <div class="form-row">
              <label class="label">Rol</label>
              <select class="select" name="role">
                <option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>Admin</option>
                <option value="usuario" ${(user?.role || 'usuario') === 'usuario' ? 'selected' : ''}>Usuario</option>
                <option value="consulta" ${user?.role === 'consulta' ? 'selected' : ''}>Solo consulta</option>
              </select>
            </div>
            ${isEdit ? `
              <div class="form-row">
                <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="activo" ${user.activo ? 'checked' : ''} /> Activo</label>
              </div>
            ` : ''}
          </form>
        `,
        footer: `
          <button type="button" class="btn" data-act="cancel">Cancelar</button>
          <button type="submit" form="user-form" class="btn btn-primary">${isEdit ? 'Guardar' : 'Crear'}</button>
        `,
      });

      panel.querySelector('[data-act="cancel"]').addEventListener('click', close);
      panel.querySelector('#user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = {
          username: fd.get('username'),
          password: fd.get('password') || undefined,
          nombre: fd.get('nombre'),
          role: fd.get('role'),
        };
        if (isEdit) data.activo = fd.get('activo') === 'on';
        if (!data.password) delete data.password;
        try {
          if (isEdit) await api.put(`/api/usuarios/${user.id}`, data);
          else await api.post('/api/usuarios', data);
          toast(isEdit ? 'Actualizado' : 'Creado', 'success');
          close();
          load();
        } catch (err) { toast(err.message, 'error'); }
      });
    }

    load();
  }

  /* ─────────────── MANTENIMIENTOS (calendario) ─────────────── */
  async function renderMantenimientos() {
    const main = $('#main-content');
    const today = new Date();
    let year = today.getFullYear();
    let month = today.getMonth();
    const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const DIAS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

    async function load() {
      const ym = `${year}-${String(month + 1).padStart(2, '0')}`;
      main.innerHTML = `
        <div class="page-header">
          <div class="flex gap-2 items-center">
            <button class="btn btn-sm" id="prev-m">← Anterior</button>
            <h2 style="margin:0;font-size:18px;font-weight:700;min-width:200px;text-align:center">${MESES[month]} ${year}</h2>
            <button class="btn btn-sm" id="next-m">Siguiente →</button>
            <button class="btn btn-sm btn-ghost" id="today-m">Hoy</button>
          </div>
          <div class="muted text-sm" id="event-count">Cargando...</div>
        </div>
        <div id="cal-host" class="empty"><span class="spinner"></span></div>
      `;
      $('#prev-m').addEventListener('click', () => { if (--month < 0) { month = 11; year--; } load(); });
      $('#next-m').addEventListener('click', () => { if (++month > 11) { month = 0; year++; } load(); });
      $('#today-m').addEventListener('click', () => { year = today.getFullYear(); month = today.getMonth(); load(); });

      let events = [];
      try { events = await api.get(`/api/mantenimientos-mes/${ym}`); }
      catch (err) { $('#cal-host').innerHTML = `<div class="text-danger">Error: ${escapeHtml(err.message)}</div>`; return; }

      $('#event-count').textContent = `${events.length} mantenimiento(s)`;
      const eventsByDay = new Map();
      events.forEach((e) => {
        const d = parseInt(e.fecha_programada.slice(8, 10), 10);
        if (!eventsByDay.has(d)) eventsByDay.set(d, []);
        eventsByDay.get(d).push(e);
      });

      const firstDay = new Date(year, month, 1).getDay();
      const lastDate = new Date(year, month + 1, 0).getDate();
      const cells = [];
      for (let i = 0; i < firstDay; i++) cells.push('<div></div>');
      for (let d = 1; d <= lastDate; d++) {
        const evs = eventsByDay.get(d) || [];
        const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
        const dotColor = evs.some((e) => !e.fecha_realizado) ? 'background:var(--warning)' : evs.length ? 'background:var(--success)' : '';
        cells.push(`
          <div class="card" data-day="${d}" style="cursor:pointer;min-height:80px;padding:8px;${isToday ? 'border-color:var(--accent);border-width:2px' : ''}">
            <div class="flex justify-between items-center">
              <span style="font-weight:700;font-family:monospace;${isToday ? 'color:var(--accent)' : ''}">${d}</span>
              ${evs.length ? `<span style="${dotColor};color:#fff;font-size:11px;padding:1px 6px;border-radius:999px;">${evs.length}</span>` : ''}
            </div>
            ${evs.slice(0, 2).map((e) => `<div style="font-size:10px;color:var(--text-muted);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(e.razon_social || '?')}</div>`).join('')}
          </div>
        `);
      }
      $('#cal-host').className = '';
      $('#cal-host').innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-bottom:8px">
          ${DIAS.map((d) => `<div class="muted text-xs" style="text-align:center;font-weight:700;padding:4px">${d}</div>`).join('')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px">${cells.join('')}</div>
      `;

      $$('[data-day]').forEach((cell) => {
        cell.addEventListener('click', () => {
          const d = parseInt(cell.dataset.day, 10);
          const evs = eventsByDay.get(d) || [];
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          openModal({
            title: `Mantenimientos · ${dateStr}`,
            body: evs.length ? `
              <div style="display:flex;flex-direction:column;gap:8px">
                ${evs.map((e) => `
                  <div class="card">
                    <div style="font-weight:700">${escapeHtml(e.razon_social || '—')}</div>
                    <div class="text-sm muted">${escapeHtml(e.modelo_maquina || '')} · ${escapeHtml(e.numero_serie || '')}</div>
                    <div class="text-xs muted mt-2">
                      Mant. #${e.numero}
                      ${e.fecha_realizado ? `· ✓ Realizado ${fmtDate(e.fecha_realizado)}` : '· ⏳ Pendiente'}
                      ${e.pagado ? `· Pagado ${fmtMoney(e.pagado)}` : ''}
                    </div>
                    ${e.notas ? `<div class="text-sm mt-2">${escapeHtml(e.notas)}</div>` : ''}
                  </div>
                `).join('')}
              </div>
            ` : '<p class="empty">Sin mantenimientos este día.</p>',
          });
        });
      });
    }

    load();
  }

  /* ─────────────── TARIFAS (key/value) ─────────────── */
  async function renderTarifas() {
    const main = $('#main-content');
    const DEFAULTS = [
      { key: 'tipo_cambio_banxico', value: '17', categoria: 'tipo_cambio', notas: 'MXN por 1 USD' },
      { key: 'mecanico_mxn', value: '450', categoria: 'mano_obra', notas: 'Tarifa hora mecánico (MXN)' },
      { key: 'mecanico_usd', value: '25', categoria: 'mano_obra', notas: 'Tarifa hora mecánico (USD)' },
      { key: 'electronico_mxn', value: '520', categoria: 'mano_obra', notas: 'Tarifa hora electrónico (MXN)' },
      { key: 'electronico_usd', value: '30', categoria: 'mano_obra', notas: 'Tarifa hora electrónico (USD)' },
      { key: 'cnc_mxn', value: '650', categoria: 'mano_obra', notas: 'Tarifa hora CNC (MXN)' },
      { key: 'cnc_usd', value: '38', categoria: 'mano_obra', notas: 'Tarifa hora CNC (USD)' },
      { key: 'ayudante_mxn', value: '280', categoria: 'mano_obra', notas: 'Tarifa hora ayudante (MXN)' },
      { key: 'ayudante_usd', value: '15', categoria: 'mano_obra', notas: 'Tarifa hora ayudante (USD)' },
      { key: 'comision_refacciones', value: '15', categoria: 'comisiones', notas: '% sobre refacciones' },
      { key: 'comision_servicios', value: '15', categoria: 'comisiones', notas: '% sobre servicios' },
      { key: 'bono_20k', value: '1000', categoria: 'comisiones', notas: 'MXN por cada $20k facturados' },
    ];

    main.innerHTML = `<div class="empty"><span class="spinner"></span></div>`;
    let tarifas = [];
    try { tarifas = await api.get('/api/tarifas'); } catch {}
    const map = new Map(tarifas.map((t) => [t.key, t]));
    DEFAULTS.forEach((d) => { if (!map.has(d.key)) map.set(d.key, d); });
    const items = Array.from(map.values());

    const groups = new Map();
    items.forEach((t) => {
      const c = t.categoria || 'general';
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c).push(t);
    });

    main.innerHTML = `
      <div class="page-header">
        <p class="muted text-sm" style="margin:0">Configuración de tarifas y parámetros del sistema.</p>
        <button class="btn btn-primary" id="save-all">Guardar todo</button>
      </div>
      ${Array.from(groups.entries()).map(([cat, list]) => `
        <div class="card" style="margin-bottom:12px">
          <h3 style="margin:0 0 12px;font-size:14px;text-transform:capitalize">${cat.replace(/_/g, ' ')}</h3>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${list.map((t) => `
              <div style="display:grid;grid-template-columns:200px 1fr 2fr;gap:8px;align-items:center">
                <div class="text-xs font-mono muted">${t.key}</div>
                <input type="text" class="input" data-key="${t.key}" data-cat="${cat}" value="${escapeHtml(t.value)}" />
                <div class="text-xs dim">${escapeHtml(t.notas || '')}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    `;

    $('#save-all').addEventListener('click', async () => {
      const inputs = $$('#main-content input[data-key]');
      const payload = inputs.map((i) => ({ key: i.dataset.key, value: i.value, categoria: i.dataset.cat }));
      try {
        await api.put('/api/tarifas', payload);
        toast(`✓ ${payload.length} tarifas guardadas`, 'success');
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  /* ─────────────── REPORTES (export CSV) ─────────────── */
  async function renderReportes() {
    const main = $('#main-content');
    const ENTITIES = [
      { table: 'clientes', label: 'Clientes', icon: '👥' },
      { table: 'refacciones', label: 'Refacciones', icon: '🔧' },
      { table: 'maquinas', label: 'Máquinas', icon: '⚙️' },
      { table: 'cotizaciones', label: 'Cotizaciones', icon: '📄' },
      { table: 'ventas', label: 'Ventas', icon: '💰' },
      { table: 'prospectos', label: 'Prospectos', icon: '🎯' },
      { table: 'personal', label: 'Personal', icon: '👷' },
      { table: 'garantias', label: 'Garantías', icon: '🛡' },
      { table: 'mantenimientos', label: 'Mantenimientos', icon: '📅' },
      { table: 'bonos', label: 'Bonos', icon: '🎁' },
      { table: 'viajes', label: 'Viajes', icon: '✈️' },
      { table: 'bitacora_horas', label: 'Bitácora horas', icon: '⏱' },
      { table: 'sin_cobertura', label: 'Sin Cobertura', icon: '🚫' },
      { table: 'revision_maquinas', label: 'Revisión Máquinas', icon: '🔍' },
    ];

    main.innerHTML = `
      <p class="muted text-sm" style="margin-bottom:16px">Exporta cualquier tabla a CSV para análisis en Excel/Sheets.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
        ${ENTITIES.map((e) => `
          <button class="card" data-table="${e.table}" style="text-align:left;cursor:pointer;border-color:var(--border)">
            <div style="font-size:24px;margin-bottom:4px">${e.icon}</div>
            <div style="font-weight:700">${e.label}</div>
            <div class="text-xs muted">Click para descargar CSV</div>
          </button>
        `).join('')}
      </div>
    `;

    $$('[data-table]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const table = btn.dataset.table;
        btn.disabled = true;
        try {
          /* Direct download via auth header workaround: usar <a> con cookie/token */
          const token = getToken();
          const resp = await fetch(`/api/export/${table}`, {
            headers: { 'Authorization': 'Bearer ' + token },
            credentials: 'include',
          });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const blob = await resp.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = `${table}.csv`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          toast(`✓ ${table}.csv descargado`, 'success');
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  /* ─────────────── AUDIT LOG (admin) ─────────────── */
  async function renderAudit() {
    const main = $('#main-content');
    main.innerHTML = `
      <p class="muted text-sm" style="margin-bottom:16px">Registro de cambios del sistema. Solo administradores.</p>
      <div id="audit-table"></div>
    `;
    const c = $('#audit-table');
    c.innerHTML = '<div class="empty"><span class="spinner"></span></div>';
    try {
      const rows = await api.get('/api/audit');
      if (!rows.length) {
        c.innerHTML = '<div class="empty"><div class="empty-icon">📋</div><p>Sin entradas de auditoría aún.</p></div>';
        return;
      }
      c.innerHTML = `
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>Fecha</th><th>Usuario</th><th class="col-center">Acción</th><th>Entidad</th><th>ID</th><th>Detalles</th></tr></thead>
            <tbody>
              ${rows.map((r) => `
                <tr>
                  <td class="font-mono text-sm">${fmtDateTime(r.timestamp)}</td>
                  <td>${escapeHtml(r.username || '—')}</td>
                  <td class="col-center"><span class="badge ${r.action === 'create' ? 'badge-success' : r.action === 'delete' ? 'badge-danger' : 'badge-info'}">${escapeHtml(r.action)}</span></td>
                  <td>${escapeHtml(r.entity)}</td>
                  <td class="font-mono">${escapeHtml(r.entity_id || '—')}</td>
                  <td><code class="text-xs">${escapeHtml(r.details || '')}</code></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      c.innerHTML = `<div class="empty text-danger">Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  /* ─────────────── DAVAI (chat con SSE streaming) ─────────────── */
  async function renderDavai() {
    const main = $('#main-content');
    const history = [];

    main.innerHTML = `
      <div class="card" style="display:flex;flex-direction:column;height:calc(100vh - 160px);max-width:900px;margin:0 auto">
        <div class="flex items-center gap-3" style="padding-bottom:12px;border-bottom:1px solid var(--border);margin-bottom:12px">
          <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent-2));display:grid;place-items:center;color:#fff;font-weight:800">D</div>
          <div>
            <div style="font-weight:700">DavAI</div>
            <div class="text-xs text-success">● Asistente IA</div>
          </div>
        </div>
        <div id="messages" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:12px;padding:0 4px">
          <div class="empty">
            <div class="empty-icon">🤖</div>
            <p style="font-weight:700;margin:0 0 4px">¿En qué te ayudo?</p>
            <p class="muted text-sm">Pregúntame sobre prospectos, mensajes comerciales, cotizaciones...</p>
          </div>
        </div>
        <form id="chat-form" style="display:flex;gap:8px;padding-top:12px;border-top:1px solid var(--border)">
          <input id="chat-input" class="input flex-1" placeholder="Escribe tu mensaje..." autocomplete="off" required />
          <button type="submit" class="btn btn-primary" id="send-btn">Enviar</button>
        </form>
      </div>
    `;

    const messagesEl = $('#messages');
    const form = $('#chat-form');
    const input = $('#chat-input');
    const sendBtn = $('#send-btn');

    function addMessage(role, text = '') {
      messagesEl.querySelector('.empty')?.remove();
      const wrap = document.createElement('div');
      wrap.style.cssText = `display:flex;justify-content:${role === 'user' ? 'flex-end' : 'flex-start'}`;
      wrap.innerHTML = `
        <div style="max-width:80%;padding:10px 14px;border-radius:12px;${role === 'user'
          ? 'background:var(--accent);color:#fff'
          : 'background:var(--bg-elevated);border:1px solid var(--border)'}">
          <div class="text-xs" style="opacity:0.7;margin-bottom:4px">${role === 'user' ? 'Tú' : 'DavAI'}</div>
          <div data-content style="white-space:pre-wrap;font-size:13px">${escapeHtml(text)}</div>
        </div>
      `;
      messagesEl.appendChild(wrap);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return wrap.querySelector('[data-content]');
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const message = input.value.trim();
      if (!message) return;
      addMessage('user', message);
      history.push({ role: 'user', content: message });
      input.value = '';
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<span class="spinner"></span>';
      const aiNode = addMessage('assistant', '');
      let fullText = '';
      try {
        const token = getToken();
        const resp = await fetch('/api/davai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ message, history: history.slice(0, -1) }),
          credentials: 'include',
        });
        if (!resp.ok || !resp.body) {
          const err = await resp.json().catch(() => ({ error: 'Error' }));
          aiNode.textContent = '❌ ' + (err.error || `HTTP ${resp.status}`) + (err.detail ? ' · ' + err.detail : '');
          return;
        }
        const reader = resp.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') break;
            try {
              const p = JSON.parse(raw);
              if (typeof p.text === 'string') {
                fullText += p.text;
                aiNode.textContent = fullText;
                messagesEl.scrollTop = messagesEl.scrollHeight;
              }
              if (p.error) aiNode.textContent = '❌ ' + p.error;
            } catch {}
          }
        }
        if (fullText) history.push({ role: 'assistant', content: fullText });
      } catch (err) {
        aiNode.textContent = '❌ ' + err.message;
      } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Enviar';
        input.focus();
      }
    });
    input.focus();
  }

  /* ─────────────── BOOT ─────────────── */
  function boot() {
    loadStoredUser();

    /* Limpiar service workers viejos del v1/v2 si existen */
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister().catch(() => {})))
        .catch(() => {});
      if ('caches' in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k).catch(() => {}))).catch(() => {});
      }
    }

    if (state.user) {
      /* Verificar token aún válido contra el backend */
      api.get('/api/auth/me')
        .then((res) => { state.user = res.user; localStorage.setItem(USER_KEY, JSON.stringify(res.user)); })
        .catch(() => clearAuth())
        .finally(() => {
          if (!location.hash) navigate(state.user ? 'dashboard' : 'login');
          else handleRoute();
        });
    } else {
      navigate('login');
    }

    window.addEventListener('hashchange', handleRoute);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
