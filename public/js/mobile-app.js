(function () {
  'use strict';
  const API = '/api';
  const TOKEN_KEY = 'cotizacion-auth-token';
  const USER_KEY  = 'cotizacion-auth-user';

  let currentPage = 'dashboard';
  let listCache   = {};
  let detailStack = [];

  // ── HELPERS ─────────────────────────────────────────────────────────────
  function token()  { return localStorage.getItem(TOKEN_KEY) || ''; }
  function headers(){ return { 'Content-Type':'application/json', 'Authorization': 'Bearer ' + token() }; }

  function toast(msg, ms = 2800) {
    const el = document.getElementById('m-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), ms);
  }

  function fmt(n, cur = '') {
    if (n == null || n === '') return '—';
    const num = parseFloat(n);
    if (isNaN(num)) return String(n);
    return cur + num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function badge(estado) {
    if (!estado) return '';
    const e = String(estado).toLowerCase();
    let cls = 'muted';
    if (['aprobada','pagada','activa','vendida','ok','completado','entregado'].some(x => e.includes(x))) cls = 'ok';
    else if (['pendiente','proceso','revisión','revision'].some(x => e.includes(x))) cls = 'warn';
    else if (['cancelada','rechazada','vencida'].some(x => e.includes(x))) cls = 'danger';
    else if (['borrador','nueva'].some(x => e.includes(x))) cls = 'info';
    return `<span class="m-badge ${cls}">${estado}</span>`;
  }

  function loader() {
    return `<div class="m-loader"><div class="m-spinner"></div><span>Cargando…</span></div>`;
  }
  function empty(msg = 'Sin resultados') {
    return `<div class="m-empty"><i class="fas fa-inbox"></i><p>${msg}</p></div>`;
  }

  // ── AUTH ─────────────────────────────────────────────────────────────────
  async function tryLogin(user, pass) {
    const r = await fetch(API + '/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Error de autenticación');
    localStorage.setItem(TOKEN_KEY, d.token);
    localStorage.setItem(USER_KEY,  JSON.stringify(d.user || {}));
    return d.user;
  }

  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch(_) { return null; }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    location.reload();
  }

  // ── NAVIGATION ───────────────────────────────────────────────────────────
  function showPage(pageId) {
    document.querySelectorAll('.m-page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.m-nav-btn').forEach(b => b.classList.remove('active'));
    const page = document.getElementById('page-' + pageId);
    const btn  = document.querySelector(`.m-nav-btn[data-page="${pageId}"]`);
    if (page) { page.classList.add('active'); currentPage = pageId; }
    if (btn)  btn.classList.add('active');
    document.getElementById('m-content').scrollTop = 0;
    loadPage(pageId);
  }

  function showDetail(html, title) {
    const det = document.getElementById('page-detail');
    det.innerHTML = `
      <div class="m-detail-header">
        <button id="m-back-btn" onclick="window.mBack()"><i class="fas fa-arrow-left"></i></button>
        <div class="m-detail-title">${title}</div>
      </div>
      ${html}`;
    detailStack.push(currentPage);
    document.querySelectorAll('.m-page').forEach(p => p.classList.remove('active'));
    det.classList.add('active');
    document.getElementById('m-content').scrollTop = 0;
  }

  window.mBack = function () {
    const prev = detailStack.pop() || 'dashboard';
    showPage(prev);
  };

  // ── LOAD PAGE ────────────────────────────────────────────────────────────
  function loadPage(id) {
    if (id === 'dashboard')    loadDashboard();
    else if (id === 'clientes')     loadClientes();
    else if (id === 'maquinas')     loadMaquinas();
    else if (id === 'cotizaciones') loadCotizaciones();
    else if (id === 'almacen')      loadAlmacen();
  }

  // ── DASHBOARD ────────────────────────────────────────────────────────────
  async function loadDashboard() {
    const el = document.getElementById('page-dashboard');
    el.innerHTML = loader();
    try {
      const [r1, r2, r3, r4] = await Promise.all([
        fetch(API + '/clientes', { headers: headers() }),
        fetch(API + '/cotizaciones?limit=200', { headers: headers() }),
        fetch(API + '/maquinas', { headers: headers() }),
        fetch(API + '/almacen', { headers: headers() }),
      ]);
      const clientes     = r1.ok ? await r1.json() : [];
      const cotizaciones = r2.ok ? (await r2.json()).rows || await r2.json() : [];
      const maquinas     = r3.ok ? await r3.json() : [];
      const almacen      = r4.ok ? await r4.json() : [];

      const cotArr = Array.isArray(cotizaciones) ? cotizaciones : (cotizaciones.rows || []);
      const totalCot = cotArr.reduce((s, c) => s + (parseFloat(c.total) || 0), 0);
      const aprobadas = cotArr.filter(c => /aprobada|vendida/i.test(c.estado || '')).length;
      const stockBajo = (Array.isArray(almacen) ? almacen : []).filter(r => (r.stock || 0) <= (r.stock_minimo || 0)).length;
      const u = getUser();

      el.innerHTML = `
        <p class="m-section-title">Bienvenido, ${u ? (u.displayName || u.username) : 'usuario'}</p>
        <div class="m-kpi-grid">
          <div class="m-kpi">
            <div class="m-kpi-label">Clientes</div>
            <div class="m-kpi-value accent">${Array.isArray(clientes) ? clientes.length : '—'}</div>
            <div class="m-kpi-sub">Registrados</div>
          </div>
          <div class="m-kpi">
            <div class="m-kpi-label">Cotizaciones</div>
            <div class="m-kpi-value">${cotArr.length}</div>
            <div class="m-kpi-sub">${aprobadas} aprobadas</div>
          </div>
          <div class="m-kpi">
            <div class="m-kpi-label">Valor total</div>
            <div class="m-kpi-value" style="font-size:1.1rem">$${(totalCot/1000).toFixed(1)}k</div>
            <div class="m-kpi-sub">En cotizaciones</div>
          </div>
          <div class="m-kpi">
            <div class="m-kpi-label">Máquinas</div>
            <div class="m-kpi-value">${Array.isArray(maquinas) ? maquinas.length : '—'}</div>
            <div class="m-kpi-sub">${stockBajo > 0 ? `<span style="color:var(--clr-danger)">${stockBajo} stock bajo</span>` : 'Almacén OK'}</div>
          </div>
        </div>
        <p class="m-section-title mt-16">Accesos rápidos</p>
        ${['clientes','cotizaciones','maquinas','almacen'].map(p => `
          <div class="m-card" onclick="window.mGo('${p}')">
            <div class="m-card-icon ${p==='cotizaciones'?'blue':p==='maquinas'?'yellow':p==='almacen'?'green':''}">
              <i class="fas fa-${p==='clientes'?'users':p==='cotizaciones'?'file-invoice-dollar':p==='maquinas'?'industry':'warehouse'}"></i>
            </div>
            <div class="m-card-body">
              <div class="m-card-title">${p.charAt(0).toUpperCase()+p.slice(1)}</div>
              <div class="m-card-sub">Ver listado completo</div>
            </div>
            <div class="m-card-arrow"><i class="fas fa-chevron-right"></i></div>
          </div>`).join('')}`;
    } catch(e) {
      el.innerHTML = `<div class="m-empty"><i class="fas fa-exclamation-triangle"></i><p>${e.message}</p></div>`;
    }
  }

  window.mGo = function(p) { showPage(p); };

  // ── CLIENTES ─────────────────────────────────────────────────────────────
  async function loadClientes(q = '') {
    const el = document.getElementById('page-clientes');
    if (!listCache.clientes) {
      el.innerHTML = loader();
      try {
        const r = await fetch(API + '/clientes', { headers: headers() });
        listCache.clientes = r.ok ? await r.json() : [];
      } catch(_) { listCache.clientes = []; }
    }
    const list = (listCache.clientes || []).filter(c =>
      !q || [c.nombre,c.codigo,c.rfc,c.ciudad,c.contacto,c.email].some(f => f && String(f).toLowerCase().includes(q.toLowerCase()))
    );
    el.innerHTML = `
      <div class="m-search-wrap"><i class="fas fa-search"></i>
        <input class="m-search" id="q-clientes" placeholder="Buscar cliente…" value="${q}" oninput="window.mSearch('clientes',this.value)">
      </div>
      <p class="m-section-title">${list.length} clientes</p>
      ${list.length ? list.map(c => `
        <div class="m-card" onclick="window.mClienteDetail(${c.id})">
          <div class="m-card-icon"><i class="fas fa-user"></i></div>
          <div class="m-card-body">
            <div class="m-card-title">${c.nombre || '—'}</div>
            <div class="m-card-sub">${[c.codigo, c.ciudad].filter(Boolean).join(' · ')}</div>
          </div>
          <div class="m-card-arrow"><i class="fas fa-chevron-right"></i></div>
        </div>`).join('') : empty()}`;
  }

  window.mSearch = function(page, val) {
    if (page === 'clientes') loadClientes(val);
    else if (page === 'maquinas') loadMaquinas(val);
    else if (page === 'cotizaciones') loadCotizaciones(val);
    else if (page === 'almacen') loadAlmacen(val);
  };

  window.mClienteDetail = async function(id) {
    const c = (listCache.clientes || []).find(x => x.id === id);
    if (!c) return;
    const rows = [
      ['Código',    c.codigo],
      ['RFC',       c.rfc],
      ['Contacto',  c.contacto],
      ['Teléfono',  c.telefono],
      ['Email',     c.email],
      ['Ciudad',    c.ciudad],
      ['Estado',    c.estado_pais],
      ['Dirección', c.direccion],
    ].filter(([,v]) => v);
    showDetail(`
      <div class="m-info-block">
        ${rows.map(([k,v]) => `<div class="m-info-row"><span class="m-info-key">${k}</span><span class="m-info-val">${v}</span></div>`).join('')}
      </div>
      <button class="m-btn-primary mt-8" onclick="window.mGoCotByCliente(${id})">
        <i class="fas fa-file-invoice-dollar"></i> Ver cotizaciones de este cliente
      </button>`, c.nombre || 'Cliente');
  };

  window.mGoCotByCliente = function(clienteId) {
    detailStack.push('detail');
    showPage('cotizaciones');
    setTimeout(() => {
      const inp = document.getElementById('q-cotizaciones');
      const cname = ((listCache.clientes||[]).find(x=>x.id===clienteId)||{}).nombre || '';
      if (inp && cname) { inp.value = cname; loadCotizaciones(cname); }
    }, 100);
  };

  // ── MÁQUINAS ─────────────────────────────────────────────────────────────
  async function loadMaquinas(q = '') {
    const el = document.getElementById('page-maquinas');
    if (!listCache.maquinas) {
      el.innerHTML = loader();
      try {
        const r = await fetch(API + '/maquinas', { headers: headers() });
        listCache.maquinas = r.ok ? await r.json() : [];
      } catch(_) { listCache.maquinas = []; }
    }
    const list = (listCache.maquinas || []).filter(m =>
      !q || [m.nombre,m.codigo,m.modelo,m.numero_serie,m.marca].some(f => f && String(f).toLowerCase().includes(q.toLowerCase()))
    );
    el.innerHTML = `
      <div class="m-search-wrap"><i class="fas fa-search"></i>
        <input class="m-search" id="q-maquinas" placeholder="Buscar máquina…" value="${q}" oninput="window.mSearch('maquinas',this.value)">
      </div>
      <p class="m-section-title">${list.length} máquinas</p>
      ${list.length ? list.map(m => `
        <div class="m-card" onclick="window.mMaquinaDetail(${m.id})">
          <div class="m-card-icon yellow"><i class="fas fa-industry"></i></div>
          <div class="m-card-body">
            <div class="m-card-title">${m.nombre || '—'}</div>
            <div class="m-card-sub">${[m.codigo, m.modelo, m.numero_serie].filter(Boolean).join(' · ')}</div>
          </div>
          <div class="m-card-arrow"><i class="fas fa-chevron-right"></i></div>
        </div>`).join('') : empty()}`;
  }

  window.mMaquinaDetail = function(id) {
    const m = (listCache.maquinas || []).find(x => x.id === id);
    if (!m) return;
    const rows = [
      ['Código', m.codigo], ['Marca', m.marca], ['Modelo', m.modelo],
      ['Serie', m.numero_serie], ['Año', m.anio], ['Sucursal', m.sucursal],
      ['Notas', m.notas],
    ].filter(([,v]) => v);
    showDetail(`
      <div class="m-info-block">
        ${rows.map(([k,v]) => `<div class="m-info-row"><span class="m-info-key">${k}</span><span class="m-info-val">${v}</span></div>`).join('')}
      </div>`, m.nombre || 'Máquina');
  };

  // ── COTIZACIONES ─────────────────────────────────────────────────────────
  async function loadCotizaciones(q = '') {
    const el = document.getElementById('page-cotizaciones');
    if (!listCache.cotizaciones) {
      el.innerHTML = loader();
      try {
        const r = await fetch(API + '/cotizaciones', { headers: headers() });
        const d = r.ok ? await r.json() : {};
        listCache.cotizaciones = Array.isArray(d) ? d : (d.rows || []);
      } catch(_) { listCache.cotizaciones = []; }
    }
    const list = (listCache.cotizaciones || []).filter(c =>
      !q || [c.folio, c.cliente, c.estado, c.tipo].some(f => f && String(f).toLowerCase().includes(q.toLowerCase()))
    );
    el.innerHTML = `
      <div class="m-search-wrap"><i class="fas fa-search"></i>
        <input class="m-search" id="q-cotizaciones" placeholder="Buscar cotización…" value="${q}" oninput="window.mSearch('cotizaciones',this.value)">
      </div>
      <p class="m-section-title">${list.length} cotizaciones</p>
      ${list.length ? list.map(c => `
        <div class="m-card" onclick="window.mCotDetail(${c.id})">
          <div class="m-card-icon blue"><i class="fas fa-file-invoice-dollar"></i></div>
          <div class="m-card-body">
            <div class="m-card-title">${c.folio || '#'+c.id} — ${c.cliente || '—'}</div>
            <div class="m-card-sub">${badge(c.estado)} ${fmt(c.total, c.moneda === 'USD' ? '$' : '$')} ${c.moneda || ''}</div>
          </div>
          <div class="m-card-arrow"><i class="fas fa-chevron-right"></i></div>
        </div>`).join('') : empty()}`;
  }

  window.mCotDetail = async function(id) {
    const c = (listCache.cotizaciones || []).find(x => x.id === id);
    if (!c) return;
    let items = [];
    try {
      const r = await fetch(`${API}/cotizaciones/${id}/items`, { headers: headers() });
      if (r.ok) items = await r.json();
    } catch(_) {}
    const rows = [
      ['Folio',    c.folio], ['Estado',   c.estado], ['Tipo',    c.tipo],
      ['Cliente',  c.cliente], ['Total',  fmt(c.total, '$') + ' ' + (c.moneda||'')],
      ['Fecha',    c.fecha || c.creado_en], ['Notas', c.notas],
    ].filter(([,v]) => v);
    const itemsHtml = items.length ? `
      <p class="m-section-title mt-16">Partidas (${items.length})</p>
      <div class="m-info-block">
        ${items.map(it => `
          <div class="m-info-row">
            <span class="m-info-key">${it.codigo || it.descripcion?.slice(0,12) || '—'}</span>
            <span class="m-info-val">${it.descripcion || '—'}<br>
              <span class="text-muted">Cant: ${it.cantidad} · ${fmt(it.precio_unitario,'$')} · Total: ${fmt(it.total,'$')}</span>
            </span>
          </div>`).join('')}
      </div>` : '';
    showDetail(`
      <div class="m-info-block">
        ${rows.map(([k,v]) => `<div class="m-info-row"><span class="m-info-key">${k}</span><span class="m-info-val">${v}</span></div>`).join('')}
      </div>${itemsHtml}`, (c.folio || '#'+id));
  };

  // ── ALMACÉN ──────────────────────────────────────────────────────────────
  async function loadAlmacen(q = '') {
    const el = document.getElementById('page-almacen');
    if (!listCache.almacen) {
      el.innerHTML = loader();
      try {
        const r = await fetch(API + '/almacen', { headers: headers() });
        listCache.almacen = r.ok ? await r.json() : [];
      } catch(_) { listCache.almacen = []; }
    }
    const list = (Array.isArray(listCache.almacen) ? listCache.almacen : []).filter(a =>
      !q || [a.codigo, a.descripcion, a.categoria].some(f => f && String(f).toLowerCase().includes(q.toLowerCase()))
    );
    el.innerHTML = `
      <div class="m-search-wrap"><i class="fas fa-search"></i>
        <input class="m-search" id="q-almacen" placeholder="Buscar refacción…" value="${q}" oninput="window.mSearch('almacen',this.value)">
      </div>
      <p class="m-section-title">${list.length} refacciones</p>
      ${list.length ? list.map(a => {
        const bajo = (a.stock || 0) <= (a.stock_minimo || 0);
        return `
          <div class="m-card">
            <div class="m-card-icon ${bajo ? 'red' : 'green'}"><i class="fas fa-boxes"></i></div>
            <div class="m-card-body">
              <div class="m-card-title">${a.descripcion || a.codigo || '—'}</div>
              <div class="m-card-sub">${a.codigo || ''} · Stock: <strong>${a.stock ?? '—'}</strong>${bajo ? ' <span style="color:var(--clr-danger)">⚠ bajo</span>' : ''}</div>
            </div>
          </div>`;
      }).join('') : empty()}`;
  }

  // ── LOGIN FORM ────────────────────────────────────────────────────────────
  function initLogin() {
    const form  = document.getElementById('m-login-form');
    const errEl = document.getElementById('m-login-err');
    const btn   = document.getElementById('m-login-btn');
    if (!form) return;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const u = document.getElementById('m-login-user').value.trim();
      const p = document.getElementById('m-login-pass').value;
      btn.disabled = true; btn.textContent = 'Entrando…';
      errEl.textContent = '';
      try {
        await tryLogin(u, p);
        document.getElementById('m-login').classList.add('hidden');
        initApp();
      } catch(err) {
        errEl.textContent = err.message;
      } finally {
        btn.disabled = false; btn.textContent = 'Entrar';
      }
    });
  }

  // ── USER DRAWER ───────────────────────────────────────────────────────────
  function initDrawer() {
    const drawer  = document.getElementById('m-user-drawer');
    const overlay = document.getElementById('m-drawer-overlay');
    const openBtn = document.getElementById('m-user-btn');
    if (!drawer) return;
    openBtn.addEventListener('click', () => {
      const u = getUser();
      document.getElementById('m-drawer-name').textContent = u ? (u.displayName || u.username) : '—';
      document.getElementById('m-drawer-role').textContent = u ? (u.role || '') : '';
      drawer.classList.add('open');
      overlay.classList.add('open');
    });
    overlay.addEventListener('click', closeDrawer);
    document.getElementById('m-drawer-logout').addEventListener('click', logout);
  }
  function closeDrawer() {
    document.getElementById('m-user-drawer').classList.remove('open');
    document.getElementById('m-drawer-overlay').classList.remove('open');
  }

  // ── NAV BUTTONS ───────────────────────────────────────────────────────────
  function initNav() {
    document.querySelectorAll('.m-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        detailStack = [];
        showPage(btn.dataset.page);
      });
    });
  }

  // ── BOOT ─────────────────────────────────────────────────────────────────
  function initApp() {
    const u = getUser();
    if (u) {
      document.getElementById('m-login').classList.add('hidden');
      document.getElementById('m-shell').style.display = '';
    }
    initNav();
    initDrawer();
    showPage('dashboard');
  }

  document.addEventListener('DOMContentLoaded', () => {
    initLogin();
    const hasToken = !!token();
    if (hasToken) {
      fetch(API + '/auth/me', { headers: headers() })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(d => {
          if (d.user) {
            localStorage.setItem(USER_KEY, JSON.stringify(d.user));
            document.getElementById('m-login').classList.add('hidden');
            document.getElementById('m-shell').style.display = '';
            initApp();
          } else { showLoginScreen(); }
        })
        .catch(() => showLoginScreen());
    } else {
      showLoginScreen();
    }
  });

  function showLoginScreen() {
    document.getElementById('m-login').classList.remove('hidden');
    document.getElementById('m-shell').style.display = 'none';
  }
})();
