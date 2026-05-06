/**
 * Cliente nuevo desde cero: consume las rutas /api existentes.
 * La SPA histórica sigue disponible en /legacy-app (legacy-app.html).
 */
const TOKEN_KEY = 'scw_auth_token_v2';

/** Orden alineado con ACCESS_TAB_DEFS del proyecto anterior (solo como contrato de navegación). */
const TAB_DEFS = [
  ['dashboards', 'Dashboards'],
  ['clientes', 'Clientes'],
  ['refacciones', 'Refacciones'],
  ['maquinas', 'Máquinas'],
  ['almacen', 'Almacén'],
  ['cotizaciones', 'Cotizaciones'],
  ['ventas', 'Ventas'],
  ['prospeccion', 'Prospección'],
  ['revision-maquinas', 'Revisión Máquinas'],
  ['tarifas', 'Tarifas'],
  ['reportes', 'Reportes'],
  ['garantias', 'Garantías'],
  ['mantenimiento-garantia', 'Mantenimientos'],
  ['garantias-sin-cobertura', 'Sin cobertura'],
  ['bonos', 'Bonos'],
  ['viajes', 'Viajes'],
  ['tecnicos', 'Personal'],
  ['bitacoras', 'Bitácora de horas'],
  ['auditoria', 'Auditoría'],
  ['usuarios', 'Usuarios'],
  ['categorias-catalogo', 'Categorías'],
  ['demo', 'Cargar demo'],
  ['acerca', 'Acerca de'],
];

const LIST_ROUTES = {
  clientes: '/api/clientes',
  refacciones: '/api/refacciones',
  maquinas: '/api/maquinas',
  cotizaciones: '/api/cotizaciones',
  ventas: '/api/ventas',
  prospeccion: '/api/prospectos',
  'revision-maquinas': '/api/revision-maquinas',
  reportes: '/api/reportes',
  garantias: '/api/garantias',
  'mantenimiento-garantia': '/api/mantenimientos-garantia',
  'garantias-sin-cobertura': '/api/garantias/sin-cobertura',
  bonos: '/api/bonos',
  viajes: '/api/viajes',
  tecnicos: '/api/tecnicos',
  bitacoras: '/api/bitacoras',
  usuarios: '/api/app-users',
  'categorias-catalogo': '/api/categorias-catalogo',
};

let cfgGlobal = null;
let userGlobal = null;
let tokenGlobal = null;
let currentTab = 'dashboards';

function toast(message, kind = 'info') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function normalizeRole(r) {
  return String(r == null ? '' : r).trim().toLowerCase();
}

function normalizeAccessText(v) {
  return String(v == null ? '' : v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function prettyLabel(key) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function setToken(t) {
  tokenGlobal = t;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch (_) {}
}

function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (_) {
    return null;
  }
}

async function fetchJson(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (tokenGlobal) headers.Authorization = `Bearer ${tokenGlobal}`;
  const res = await fetch(path, { ...options, headers });
  let body = null;
  try {
    body = await res.json();
  } catch (_) {}
  if (!res.ok) {
    const msg =
      body && typeof body.error === 'string' ? body.error : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

function tabAllowedByUser(tabId, user) {
  const tp = user && user.tabPermissions;
  if (!tp || typeof tp !== 'object') return true;
  return tp[tabId] !== false;
}

function canAccessAdminOnlyModules(authRequired, user) {
  if (!authRequired) return true;
  return !!(user && normalizeRole(user.role) === 'admin');
}

function canAccessCotizaciones(authRequired, user) {
  if (!authRequired) return true;
  if (!user) return false;
  const r = normalizeRole(user.role);
  if (r === 'admin' || r === 'operador') return true;
  return !!user.canCotizar;
}

function isTabVisible(tabId, cfg, user) {
  if (!tabAllowedByUser(tabId, user)) return false;
  if (tabId === 'auditoria') {
    return !!(cfg.auditUi && user && normalizeRole(user.role) === 'admin');
  }
  if (tabId === 'usuarios' || tabId === 'categorias-catalogo') {
    return !!(cfg.authRequired && user && normalizeRole(user.role) === 'admin');
  }
  if (tabId === 'demo') {
    return canAccessAdminOnlyModules(cfg.authRequired, user);
  }
  if (tabId === 'prospeccion' || tabId === 'tarifas' || tabId === 'tecnicos') {
    return canAccessAdminOnlyModules(cfg.authRequired, user);
  }
  if (tabId === 'cotizaciones') {
    return canAccessCotizaciones(cfg.authRequired, user);
  }
  return true;
}

function visibleTabs(cfg, user) {
  return TAB_DEFS.filter(([id]) => isTabVisible(id, cfg, user));
}

function applyBranding(cfg) {
  document.title = cfg.shortName || cfg.appName || 'Sistema';
  const root = document.documentElement;
  root.style.setProperty('--toolbar-accent', cfg.accentHex || '#2dd4bf');
  if (cfg.primaryHex) root.style.setProperty('--sidebar-tint', cfg.primaryHex);
}

function inferColumns(rows, sampleLimit = 80) {
  const keys = new Set();
  const sample = Array.isArray(rows) ? rows.slice(0, sampleLimit) : [];
  sample.forEach((row) => {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      Object.keys(row).forEach((k) => keys.add(k));
    }
  });
  const ordered = Array.from(keys).sort((a, b) => {
    if (a === 'id') return -1;
    if (b === 'id') return 1;
    return a.localeCompare(b);
  });
  return ordered;
}

function filterColumnsForUser(keys, tabId, user) {
  const raw = user && user.columnPermissions && user.columnPermissions[tabId];
  if (!Array.isArray(raw) || raw.length === 0) return keys;
  const allowed = new Set(raw.map((x) => normalizeAccessText(x)));
  const filtered = keys.filter((k) => {
    const nk = normalizeAccessText(k);
    const nl = normalizeAccessText(prettyLabel(k));
    return allowed.has(nk) || allowed.has(nl);
  });
  return filtered.length ? filtered : keys;
}

function formatCellValue(val) {
  if (val == null) return '—';
  if (typeof val === 'boolean') return val ? 'Sí' : 'No';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : '—';
  if (typeof val === 'object') {
    try {
      const j = JSON.stringify(val);
      return j.length > 160 ? `${j.slice(0, 157)}…` : j;
    } catch (_) {
      return '[objeto]';
    }
  }
  const s = String(val);
  return s.length > 180 ? `${s.slice(0, 177)}…` : s;
}

function renderDataTable(keys, rows) {
  if (!keys.length) {
    return '<div class="empty-state">Sin columnas inferidas.</div>';
  }
  const head = keys.map((k) => `<th>${escapeHtml(prettyLabel(k))}</th>`).join('');
  const body = rows
    .map((row) => {
      const cells = keys.map((k) => {
        const v = row && Object.prototype.hasOwnProperty.call(row, k) ? row[k] : '';
        return `<td class="cell-long">${escapeHtml(formatCellValue(v))}</td>`;
      });
      return `<tr>${cells.join('')}</tr>`;
    })
    .join('');
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${body || '<tr><td colspan="' + keys.length + '" class="empty-state">Sin filas</td></tr>'}</tbody>
      </table>
    </div>`;
}

function filterRowsLocal(rows, query) {
  const q = normalizeAccessText(query);
  if (!q) return rows;
  return rows.filter((row) => {
    if (!row || typeof row !== 'object') return false;
    return Object.values(row).some((v) => normalizeAccessText(formatCellValue(v)).includes(q));
  });
}

function exportCsv(keys, rows) {
  const sep = ';';
  const esc = (v) => {
    const s = formatCellValue(v).replace(/"/g, '""');
    return `"${s}"`;
  };
  const header = keys.map((k) => esc(prettyLabel(k))).join(sep);
  const lines = rows.map((row) => keys.map((k) => esc(row[k])).join(sep));
  const blob = new Blob([header + '\n' + lines.join('\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `export-${currentTab}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
}

/** Almacén: mismas fuentes que la SPA anterior (máquinas + revisiones + clientes para ciudad). */
function ciudadMaquina(m, clienteById) {
  if (!m) return '—';
  if (m.ciudad && String(m.ciudad).trim()) return String(m.ciudad).trim();
  const cid = m.cliente_id != null ? String(m.cliente_id) : '';
  const c = cid ? clienteById.get(cid) : null;
  if (c && c.ciudad) return String(c.ciudad).trim();
  const u = (m.ubicacion && String(m.ubicacion).trim()) || '';
  return u || '—';
}

function estadoRevision(rev) {
  if (!rev) return 'Sin probar';
  const ent = rev.entregado === 'Si';
  const prFin = rev.prueba === 'Finalizada';
  if (ent && prFin) return 'Lista para entregar';
  if (ent) return 'Entrega inmediata';
  return 'Sin probar';
}

function buildAlmacenRows(maquinas, revisiones, clientes) {
  const clienteById = new Map(
    (Array.isArray(clientes) ? clientes : []).map((c) => [String(c.id), c])
  );
  const latest = new Map();
  for (const r of Array.isArray(revisiones) ? revisiones : []) {
    const mid = r.maquina_id != null ? String(r.maquina_id) : '';
    if (!mid) continue;
    const prev = latest.get(mid);
    if (!prev || Number(r.id) > Number(prev.id)) latest.set(mid, r);
  }
  return (Array.isArray(maquinas) ? maquinas : []).map((m) => {
    const rev = latest.get(String(m.id));
    return {
      id: m.id,
      modelo: m.modelo || m.nombre || m.categoria || '—',
      numero_serie: m.numero_serie || '—',
      ciudad: ciudadMaquina(m, clienteById),
      cliente: m.cliente_nombre || '—',
      estado_revision: estadoRevision(rev),
      revision_id: rev ? rev.id : '',
    };
  });
}

async function loadAlmacenDataset() {
  const [maquinas, revisiones, clientes] = await Promise.all([
    fetchJson('/api/maquinas'),
    fetchJson('/api/revision-maquinas'),
    fetchJson('/api/clientes').catch(() => []),
  ]);
  return buildAlmacenRows(toArray(maquinas), toArray(revisiones), toArray(clientes));
}

function toArray(x) {
  return Array.isArray(x) ? x : [];
}

function renderDashboard(stats) {
  const mes = stats.periodos && stats.periodos.mes_actual;
  const pron = stats.pronosticos && stats.pronosticos.proximo_mes;
  if (!mes || !pron) {
    return '<div class="empty-state">No se pudieron leer las métricas.</div>';
  }
  const cMes = mes.cotizaciones || {};
  const iMes = mes.incidentes || {};
  const bMes = mes.bitacoras || {};
  return `
    <p class="muted">Resumen operativo (misma fuente que <code>/api/dashboard-stats</code>).</p>
    <h2 class="section-title">Mes actual</h2>
    <div class="dash-grid">
      <div class="card"><h3>Cotizaciones</h3><p class="metric">${escapeHtml(String(cMes.count ?? '—'))}</p><p class="hint">Monto ${escapeHtml(formatMoney(cMes.monto))}</p></div>
      <div class="card"><h3>Incidentes</h3><p class="metric">${escapeHtml(String(iMes.count ?? '—'))}</p></div>
      <div class="card"><h3>Bitácora</h3><p class="metric">${escapeHtml(String(bMes.count ?? '—'))}</p><p class="hint">Horas ${escapeHtml(String(bMes.horas ?? '—'))}</p></div>
    </div>
    <h2 class="section-title">Estimación próximo mes</h2>
    <div class="dash-grid">
      <div class="card"><h3>Cotiz. (aprox.)</h3><p class="metric">${escapeHtml(String(pron.cotizaciones_count ?? '—'))}</p></div>
      <div class="card"><h3>Monto (aprox.)</h3><p class="metric">${escapeHtml(formatMoney(pron.cotizaciones_monto))}</p></div>
      <div class="card"><h3>Incidentes (aprox.)</h3><p class="metric">${escapeHtml(String(pron.incidentes_count ?? '—'))}</p></div>
    </div>`;
}

function formatMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  try {
    return x.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });
  } catch (_) {
    return String(x);
  }
}

function renderTarifas(obj) {
  if (!obj || typeof obj !== 'object') return '<div class="empty-state">Sin datos de tarifas.</div>';
  const rows = Object.keys(obj)
    .sort((a, b) => a.localeCompare(b))
    .map(
      (k) =>
        `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(formatCellValue(obj[k]))}</td></tr>`
    )
    .join('');
  return `<div class="table-wrap"><table class="kv-table"><tbody>${rows}</tbody></table></div>`;
}

function bindTableInteractions(container, keys, allRows) {
  const search = container.querySelector('#table-search');
  const btn = container.querySelector('#btn-csv');
  const redraw = () => {
    const q = search ? search.value.trim() : '';
    const filtered = filterRowsLocal(allRows, q);
    const wrap = container.querySelector('#table-mount');
    if (wrap) wrap.innerHTML = renderDataTable(keys, filtered);
    const hint = container.querySelector('#table-hint');
    if (hint) {
      hint.textContent =
        filtered.length === allRows.length
          ? `${allRows.length} registros`
          : `${filtered.length} de ${allRows.length}`;
    }
  };
  if (search) search.addEventListener('input', redraw);
  if (btn) btn.addEventListener('click', () => exportCsv(keys, filterRowsLocal(allRows, search ? search.value.trim() : '')));
  redraw();
}

async function loadViewInto(container) {
  const cfg = cfgGlobal;
  const user = userGlobal;
  const titleMap = Object.fromEntries(TAB_DEFS);

  try {
    switch (currentTab) {
      case 'dashboards': {
        const stats = await fetchJson('/api/dashboard-stats');
        container.innerHTML = renderDashboard(stats);
        break;
      }
      case 'tarifas': {
        const data = await fetchJson('/api/tarifas');
        container.innerHTML = `<p class="muted">Parámetros económicos (clave → valor).</p>${renderTarifas(data)}`;
        break;
      }
      case 'almacen': {
        const merged = await loadAlmacenDataset();
        const keys = filterColumnsForUser(
          ['id', 'modelo', 'numero_serie', 'ciudad', 'cliente', 'estado_revision', 'revision_id'],
          'almacen',
          user
        );
        container.innerHTML = `
          <p class="muted">Vista resumida de almacén (máquinas + última revisión). Para flujo completo usa la interfaz clásica.</p>
          <div id="almacen-table-root">
            <div class="table-toolbar">
              <input type="search" id="table-search" placeholder="Buscar en columnas visibles…" />
              <button type="button" class="btn btn-ghost" id="btn-csv">Exportar CSV</button>
              <span id="table-hint" class="muted"></span>
            </div>
            <div id="table-mount"></div>
          </div>`;
        bindTableInteractions(container.querySelector('#almacen-table-root'), keys, merged);
        break;
      }
      case 'auditoria': {
        const data = await fetchJson('/api/audit?limit=120');
        const rows = toArray(data.rows);
        const keys = filterColumnsForUser(inferColumns(rows), 'auditoria', user);
        container.innerHTML = `
          <p class="muted">Últimos eventos (total en servidor: ${escapeHtml(String(data.total ?? '—'))}).</p>
          <div id="audit-root">
            <div class="table-toolbar">
              <input type="search" id="table-search" placeholder="Filtrar…" />
              <button type="button" class="btn btn-ghost" id="btn-csv">Exportar CSV</button>
              <span id="table-hint" class="muted"></span>
            </div>
            <div id="table-mount"></div>
          </div>`;
        bindTableInteractions(container.querySelector('#audit-root'), keys, rows);
        break;
      }
      case 'demo': {
        const [storage, seed] = await Promise.all([
          fetchJson('/api/storage-health').catch((e) => ({ error: e.message })),
          fetchJson('/api/seed-status').catch((e) => ({ error: e.message })),
        ]);
        container.innerHTML = `
          <p class="muted">Panel mínimo de diagnóstico (solo lectura). Herramientas avanzadas de demo/respaldo siguen en la <a href="/legacy-app">interfaz clásica</a>.</p>
          <div class="card"><h3>Almacenamiento</h3><pre style="margin:0;white-space:pre-wrap;font-size:0.8rem;">${escapeHtml(JSON.stringify(storage, null, 2))}</pre></div>
          <div class="card" style="margin-top:12px;"><h3>Conteos (seed-status)</h3><pre style="margin:0;white-space:pre-wrap;font-size:0.8rem;">${escapeHtml(JSON.stringify(seed, null, 2))}</pre></div>`;
        break;
      }
      case 'acerca': {
        container.innerHTML = `
          <div class="card">
            <h3>${escapeHtml(cfg.appName || 'Sistema')}</h3>
            <p class="muted">${escapeHtml(cfg.tagline || '')}</p>
            <dl class="kv-table" style="margin-top:1rem;">
              <tr><th>Versión UI</th><td>Nueva interfaz (scratch)</td></tr>
              <tr><th>Clásica</th><td><a href="/legacy-app">/legacy-app</a></td></tr>
              <tr><th>Autenticación</th><td>${cfg.authRequired ? 'Requerida' : 'Desactivada (local)'}</td></tr>
              <tr><th>Auditoría UI</th><td>${cfg.auditUi ? 'Disponible (admin)' : 'No'}</td></tr>
              ${cfg.buildTag ? `<tr><th>Build</th><td>${escapeHtml(cfg.buildTag)}</td></tr>` : ''}
            </dl>
          </div>`;
        break;
      }
      default: {
        const path = LIST_ROUTES[currentTab];
        if (!path) {
          container.innerHTML = `<div class="empty-state">Vista no configurada: ${escapeHtml(currentTab)}</div>`;
          break;
        }
        const data = await fetchJson(path);
        const rows = toArray(data);
        if (rows.length > 450) {
          toast('Lista grande: se muestran todas las filas devueltas por la API; usa búsqueda o exporta CSV.', 'info');
        }
        let keys = inferColumns(rows);
        keys = filterColumnsForUser(keys, currentTab, user);
        container.innerHTML = `
          <p class="muted">Fuente: <code>${escapeHtml(path)}</code></p>
          <div id="list-root">
            <div class="table-toolbar">
              <input type="search" id="table-search" placeholder="Buscar…" />
              <button type="button" class="btn btn-ghost" id="btn-csv">Exportar CSV</button>
              <span id="table-hint" class="muted"></span>
            </div>
            <div id="table-mount"></div>
          </div>`;
        bindTableInteractions(container.querySelector('#list-root'), keys, rows);
        break;
      }
    }
  } catch (e) {
    container.innerHTML = `<div class="alert-error">${escapeHtml(e.message || String(e))}</div>`;
    toast(e.message || 'Error al cargar vista', 'error');
  }

  const vt = document.getElementById('view-title');
  if (vt) vt.textContent = titleMap[currentTab] || currentTab;
}

function wireSidebarEvents(root) {
  const toggle = root.querySelector('#nav-toggle');
  const scrim = root.querySelector('#nav-scrim');
  const close = () => document.body.classList.remove('sidebar-open');
  if (toggle) {
    toggle.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
  }
  if (scrim) scrim.addEventListener('click', close);
  root.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentTab = btn.getAttribute('data-tab') || 'dashboards';
      root.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b === btn));
      const vr = root.querySelector('#view-root');
      if (vr) vr.innerHTML = '<div class="muted">Cargando…</div>';
      loadViewInto(vr).finally(close);
    });
  });
  root.querySelector('#btn-refresh')?.addEventListener('click', () => {
    const vr = root.querySelector('#view-root');
    if (vr) loadViewInto(vr);
  });
  root.querySelector('#btn-logout')?.addEventListener('click', () => {
    setToken(null);
    userGlobal = null;
    renderLogin(document.getElementById('app'), cfgGlobal, null);
    document.body.classList.remove('sidebar-open');
  });
}

function renderShell(root, cfg, user) {
  cfgGlobal = cfg;
  userGlobal = user;
  const tabs = visibleTabs(cfg, user);
  const display =
    user.displayName || user.display_name || user.username || 'Usuario';
  const role = user.role || '—';

  if (!tabs.some(([id]) => id === currentTab)) currentTab = 'dashboards';

  const navHtml = tabs
    .map(
      ([id, label]) =>
        `<button type="button" class="nav-item${id === currentTab ? ' active' : ''}" data-tab="${escapeHtml(id)}">${escapeHtml(label)}</button>`
    )
    .join('');

  root.replaceChildren(
    el(`
      <div class="shell">
        <div class="scrim" id="nav-scrim" aria-hidden="true"></div>
        <aside class="sidebar">
          <div class="sidebar-head">
            <div class="sidebar-brand">${escapeHtml(cfg.shortName || cfg.appName || 'Portal')}</div>
            <div class="sidebar-sub">Nano machining · operaciones</div>
            <button type="button" class="btn btn-ghost nav-toggle" id="nav-toggle">Menú</button>
          </div>
          <nav class="nav-scroll" aria-label="Secciones">${navHtml}</nav>
        </aside>
        <div class="shell-main">
          <header class="toolbar">
            <h1 id="view-title">—</h1>
            <div class="toolbar-actions">
              <span class="user-pill">${escapeHtml(display)} · ${escapeHtml(role)}</span>
              <button type="button" class="btn btn-ghost" id="btn-refresh">Actualizar</button>
              ${cfg.authRequired ? '<button type="button" class="btn btn-ghost" id="btn-logout">Salir</button>' : ''}
            </div>
          </header>
          <main class="view-root" id="view-root"><div class="muted">Cargando…</div></main>
        </div>
      </div>
    `)
  );

  wireSidebarEvents(root);
  loadViewInto(root.querySelector('#view-root'));
}

function renderLogin(root, cfg, err) {
  cfgGlobal = cfg;
  const msg =
    err != null && String(err).trim()
      ? `<div class="alert-error" role="alert">${escapeHtml(String(err))}</div>`
      : '';

  root.replaceChildren(
    el(`
      <div class="login-screen">
        <div class="login-hero" role="img" aria-label="Fondo industrial nano machining">
          <div class="login-hero__grid"></div>
          <div class="login-hero__overlay"></div>
          <div class="login-hero__content">
            <span class="login-kicker">Precision · Field service · Quality</span>
            <h1 class="login-brand">${escapeHtml(cfg.shortName || cfg.appName || 'Operaciones')}</h1>
            <p class="login-tagline">${escapeHtml(cfg.tagline || 'Acceso seguro al mismo backend y datos.')}</p>
          </div>
        </div>
        <div class="login-panel">
          <div class="login-card">
            <h2>${cfg.authRequired ? 'Iniciar sesión' : 'Acceso local'}</h2>
            <p class="subtitle">${escapeHtml(cfg.authRequired ? 'Credenciales corporativas' : 'Sin login obligatorio: cargando perfil de sólo lectura.')}</p>
            ${cfg.authRequired ? msg : ''}
            ${
              cfg.authRequired
                ? `<form id="login-form" novalidate>
              <div class="field">
                <label for="username">Usuario</label>
                <input id="username" name="username" autocomplete="username" required />
              </div>
              <div class="field">
                <label for="password">Contraseña</label>
                <input id="password" type="password" autocomplete="current-password" required />
              </div>
              <button type="submit" class="btn btn-primary">Entrar</button>
            </form>`
                : `<p class="muted">Entrando como usuario local…</p>`
            }
            <p class="login-meta">
              ¿Necesitas la interfaz anterior? <a href="/legacy-app">Abrir interfaz clásica</a>
              ${cfg.buildTag ? ` · ${escapeHtml(cfg.buildTag)}` : ''}
            </p>
          </div>
        </div>
      </div>
    `)
  );

  const form = root.querySelector('#login-form');
  if (form) {
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const username = root.querySelector('#username').value.trim();
      const password = root.querySelector('#password').value;
      try {
        const data = await fetchJson('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        setToken(data.token);
        userGlobal = data.user;
        toast(`Hola, ${userGlobal.displayName || userGlobal.username}`, 'ok');
        renderShell(root, cfg, userGlobal);
      } catch (e) {
        renderLogin(root, cfg, e.message || 'No se pudo iniciar sesión.');
      }
    });
  } else if (!cfg.authRequired) {
    fetchJson('/api/auth/me')
      .then((me) => renderShell(root, cfg, me.user))
      .catch((e) => {
        root.querySelector('.login-panel').prepend(
          el(`<div class="alert-error">${escapeHtml(e.message)}</div>`)
        );
      });
  }
}

async function bootstrap() {
  const root = document.getElementById('app');
  if (!root) return;

  let cfg;
  try {
    cfg = await fetchJson('/api/config');
  } catch (e) {
    root.replaceChildren(el(`<div class="login-panel" style="min-height:100vh;display:flex;align-items:center;justify-content:center;"><div class="alert-error">${escapeHtml(e.message)}</div></div>`));
    return;
  }

  applyBranding(cfg);

  if (!cfg.authRequired) {
    setToken(null);
    renderLogin(root, cfg, null);
    return;
  }

  const t = getStoredToken();
  if (t) {
    setToken(t);
    try {
      const me = await fetchJson('/api/auth/me');
      renderShell(root, cfg, me.user);
      return;
    } catch (_) {
      setToken(null);
    }
  }

  renderLogin(root, cfg, null);
}

bootstrap();
