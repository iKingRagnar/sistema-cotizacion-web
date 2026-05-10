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

/** Iconos FA por pestaña — mismos que legacy-app.html (.tabs--rail). */
const TAB_ICONS = {
  dashboards: 'fa-chart-pie',
  clientes: 'fa-users',
  refacciones: 'fa-cogs',
  maquinas: 'fa-industry',
  almacen: 'fa-warehouse',
  cotizaciones: 'fa-file-invoice-dollar',
  ventas: 'fa-check-double',
  prospeccion: 'fa-map-marked-alt',
  'revision-maquinas': 'fa-tools',
  tarifas: 'fa-tags',
  reportes: 'fa-file-alt',
  garantias: 'fa-shield-alt',
  'mantenimiento-garantia': 'fa-calendar-check',
  'garantias-sin-cobertura': 'fa-ban',
  bonos: 'fa-award',
  viajes: 'fa-plane',
  tecnicos: 'fa-users',
  bitacoras: 'fa-clock',
  auditoria: 'fa-clipboard-list',
  usuarios: 'fa-user-shield',
  'categorias-catalogo': 'fa-sitemap',
  demo: 'fa-database',
  acerca: 'fa-info-circle',
};

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

const THEME_STORAGE_KEY = 'cotizacion-theme';

/** GET /api/:entity/:id cuando existe en servidor (detalle en modal Ver). */
const DETAIL_ROUTES = {
  clientes: '/api/clientes',
  refacciones: '/api/refacciones',
  maquinas: '/api/maquinas',
  cotizaciones: '/api/cotizaciones',
  tecnicos: '/api/tecnicos',
  bitacoras: '/api/bitacoras',
  reportes: '/api/reportes',
  garantias: '/api/garantias',
};

/** PUT /api/.../:id — cuerpo JSON (modal Editar). */
const UPDATE_ROUTES = {
  clientes: '/api/clientes',
  refacciones: '/api/refacciones',
  maquinas: '/api/maquinas',
  cotizaciones: '/api/cotizaciones',
  tecnicos: '/api/tecnicos',
  bitacoras: '/api/bitacoras',
  reportes: '/api/reportes',
  garantias: '/api/garantias',
  'revision-maquinas': '/api/revision-maquinas',
  'mantenimiento-garantia': '/api/mantenimientos-garantia',
  bonos: '/api/bonos',
  viajes: '/api/viajes',
};

const DELETE_ROUTES = {
  clientes: '/api/clientes',
  refacciones: '/api/refacciones',
  maquinas: '/api/maquinas',
  cotizaciones: '/api/cotizaciones',
  tecnicos: '/api/tecnicos',
  bitacoras: '/api/bitacoras',
  reportes: '/api/reportes',
  garantias: '/api/garantias',
  'revision-maquinas': '/api/revision-maquinas',
  bonos: '/api/bonos',
  viajes: '/api/viajes',
};

const APP_USER_ROLES_LIST = ['admin', 'usuario', 'operador', 'consulta', 'invitado'];

/** Pestañas donde tiene sentido elegir columnas visibles (alineado a UI clásica). */
const PERMISSION_COLUMN_TAB_IDS = TAB_DEFS.map(([id]) => id).filter(
  (id) => !['dashboards', 'demo', 'acerca'].includes(id)
);

let tableInteractionRowsRef = [];

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

function parseAccessJson(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const p = JSON.parse(String(raw));
    return p && typeof p === 'object' ? p : {};
  } catch (_) {
    return {};
  }
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
  syncThemeMetaTag();
}

function getStoredTheme() {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY);
    return t === 'light' || t === 'dark' ? t : 'dark';
  } catch (_) {
    return 'dark';
  }
}

function syncThemeMetaTag() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const light = document.documentElement.classList.contains('appearance-light');
  meta.setAttribute('content', light ? '#f1f5f9' : '#0f172a');
}

function applyStoredTheme() {
  const light = getStoredTheme() === 'light';
  document.documentElement.classList.toggle('appearance-light', light);
  document.body.classList.toggle('appearance-light', light);
  syncThemeMetaTag();
}

function toggleStoredTheme() {
  const next = document.documentElement.classList.contains('appearance-light') ? 'dark' : 'light';
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch (_) {}
  applyStoredTheme();
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => updateThemeToggleButton(btn));
}

function updateThemeToggleButton(btn) {
  if (!btn) return;
  const light = document.documentElement.classList.contains('appearance-light');
  btn.setAttribute('title', light ? 'Pasar a modo oscuro' : 'Pasar a modo claro');
  btn.setAttribute('aria-label', btn.getAttribute('title'));
  btn.setAttribute('aria-pressed', light ? 'true' : 'false');
  const icon = btn.querySelector('i');
  if (icon) {
    icon.className = light ? 'fas fa-moon' : 'fas fa-sun';
    icon.setAttribute('aria-hidden', 'true');
  } else {
    btn.textContent = light ? '🌙' : '☀️';
  }
}

function closeModal() {
  const mr = document.getElementById('modal-root');
  if (mr) mr.innerHTML = '';
}

function openModal(html) {
  const mr = document.getElementById('modal-root');
  if (!mr) return;
  mr.innerHTML = html;
  mr.querySelectorAll('[data-modal-close]').forEach((b) => b.addEventListener('click', closeModal));
  const bd = mr.querySelector('.modal-backdrop');
  if (bd) {
    bd.addEventListener('click', (ev) => {
      if (ev.target === bd) closeModal();
    });
  }
}

function closeHeaderProfileMenu() {
  const m = document.getElementById('header-profile-menu');
  const b = document.getElementById('btn-header-profile');
  if (m) m.classList.add('hidden');
  if (b) b.setAttribute('aria-expanded', 'false');
  try {
    window.removeEventListener('scroll', positionHeaderProfileMenu, true);
  } catch (_) {}
  try {
    window.removeEventListener('resize', positionHeaderProfileMenu);
  } catch (_) {}
}

function positionHeaderProfileMenu() {
  const m = document.getElementById('header-profile-menu');
  const b = document.getElementById('btn-header-profile');
  if (!m || !b) return;
  const r = b.getBoundingClientRect();
  const gap = 8;
  m.style.top = `${r.bottom + gap}px`;
  m.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
  m.style.left = 'auto';
}

function ensureHeaderProfileMenuPortaledToBody() {
  const m = document.getElementById('header-profile-menu');
  if (!m || m.getAttribute('data-portal-body') === '1') return;
  try {
    document.body.appendChild(m);
    m.setAttribute('data-portal-body', '1');
  } catch (_) {}
}

function toggleHeaderProfileMenu() {
  const m = document.getElementById('header-profile-menu');
  const b = document.getElementById('btn-header-profile');
  if (!m || !b) return;
  const open = m.classList.contains('hidden');
  if (open) {
    ensureHeaderProfileMenuPortaledToBody();
    positionHeaderProfileMenu();
    m.classList.remove('hidden');
    b.setAttribute('aria-expanded', 'true');
    try {
      window.addEventListener('scroll', positionHeaderProfileMenu, true);
    } catch (_) {}
    try {
      window.addEventListener('resize', positionHeaderProfileMenu);
    } catch (_) {}
  } else {
    closeHeaderProfileMenu();
  }
}

/** Sincroniza textos del menú perfil con userGlobal (mismo patrón que sistema-cotizacion-web-Old). */
function syncHeaderProfileLabels(user) {
  const display =
    user && (user.displayName || user.display_name || user.username)
      ? String(user.displayName || user.display_name || user.username)
      : 'Usuario';
  const role = user && user.role != null ? String(user.role) : '—';
  const pmDisp = document.getElementById('profile-menu-display');
  const pmFull = document.getElementById('profile-menu-fullname');
  const hName = document.getElementById('header-profile-name');
  const hRole = document.getElementById('header-profile-role');
  if (pmDisp) pmDisp.textContent = display;
  if (pmFull) pmFull.textContent = `${display} · ${role}`;
  if (hName) hName.textContent = display;
  if (hRole) hRole.textContent = role;
}

let scratchProfileOutsideClickBound = false;

function scratchProfileOutsideClose(ev) {
  const pm = document.getElementById('header-profile-menu');
  if (!pm || pm.classList.contains('hidden')) return;
  const w = document.getElementById('header-profile-wrap');
  const t = ev.target;
  if (t instanceof Node) {
    if (w && w.contains(t)) return;
    if (pm.contains(t)) return;
  }
  closeHeaderProfileMenu();
}

function wireHeaderProfileScratch(root) {
  ensureHeaderProfileMenuPortaledToBody();
  syncHeaderProfileLabels(userGlobal);

  if (!scratchProfileOutsideClickBound) {
    scratchProfileOutsideClickBound = true;
    document.addEventListener('click', scratchProfileOutsideClose, true);
  }

  const btnProf = root.querySelector('#btn-header-profile');
  const wrap = root.querySelector('#header-profile-wrap');
  if (btnProf && wrap) {
    btnProf.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleHeaderProfileMenu();
    });
  }

  root.querySelector('#profile-menu-refresh')?.addEventListener('click', () => {
    closeHeaderProfileMenu();
    const vr = root.querySelector('#view-root');
    if (vr) loadViewInto(vr);
  });

  root.querySelector('#profile-menu-perfil')?.addEventListener('click', () => {
    closeHeaderProfileMenu();
    currentTab = 'usuarios';
    root.querySelectorAll('.nav-item').forEach((b) =>
      b.classList.toggle('active', (b.getAttribute('data-tab') || '') === 'usuarios')
    );
    const vr = root.querySelector('#view-root');
    if (vr) loadViewInto(vr);
  });

  root.querySelector('#profile-menu-password')?.addEventListener('click', () => {
    closeHeaderProfileMenu();
    toast('Para cambiar contraseña usa la interfaz clásica (/legacy-app) o pide apoyo al administrador.', 'info');
  });

  root.querySelector('#profile-menu-notif-prefs')?.addEventListener('click', () => {
    closeHeaderProfileMenu();
    toast('Centro de notificaciones completo solo en la interfaz clásica.', 'info');
  });

  root.querySelector('#profile-menu-tema')?.addEventListener('click', () => {
    closeHeaderProfileMenu();
    toggleStoredTheme();
    root.querySelectorAll('[data-theme-toggle]').forEach((btn) => updateThemeToggleButton(btn));
  });

  root.querySelector('#profile-menu-densidad')?.addEventListener('click', () => {
    closeHeaderProfileMenu();
    document.body.classList.toggle('scratch-density-compact');
    try {
      localStorage.setItem(
        'scratch-table-density',
        document.body.classList.contains('scratch-density-compact') ? 'compact' : 'comfortable'
      );
    } catch (_) {}
    toast(
      document.body.classList.contains('scratch-density-compact')
        ? 'Tablas en modo compacto'
        : 'Tablas en modo cómodo',
      'info'
    );
  });

  root.querySelector('#profile-menu-mas')?.addEventListener('click', () => {
    closeHeaderProfileMenu();
    toast('Panel “Más opciones” del sistema clásico no está en esta vista.', 'info');
  });

  root.querySelector('#profile-menu-respaldo')?.addEventListener('click', () => {
    closeHeaderProfileMenu();
    currentTab = 'demo';
    root.querySelectorAll('.nav-item').forEach((b) =>
      b.classList.toggle('active', (b.getAttribute('data-tab') || '') === 'demo')
    );
    const vr = root.querySelector('#view-root');
    if (vr) loadViewInto(vr);
  });

  root.querySelector('#profile-menu-ayuda')?.addEventListener('click', () => {
    closeHeaderProfileMenu();
    toast('Atajos: tema desde el ícono sol/luna o menú perfil · Actualizar vista desde el menú.', 'info');
  });

  root.querySelector('#profile-menu-logout')?.addEventListener('click', () => {
    closeHeaderProfileMenu();
    setToken(null);
    userGlobal = null;
    renderLogin(document.getElementById('app'), cfgGlobal, null);
    document.body.classList.remove('sidebar-open');
    document.body.classList.remove('scratch-sidebar-collapsed');
  });

  try {
    const d = localStorage.getItem('scratch-table-density');
    if (d === 'compact') document.body.classList.add('scratch-density-compact');
  } catch (_) {}
}

function getRowStableId(row) {
  if (!row || typeof row !== 'object') return null;
  const id = row.id;
  if (id != null && String(id).trim() !== '') return String(id);
  return null;
}

function formatDetailPrimitive(v) {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '—';
    return escapeHtml(v % 1 === 0 ? String(v) : String(Number(v.toFixed(6))));
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}T\d/.test(s)) {
      try {
        const d = new Date(s);
        if (!Number.isNaN(d.getTime())) return escapeHtml(d.toLocaleString('es-MX'));
      } catch (_) {}
    }
    return escapeHtml(s);
  }
  return escapeHtml(String(v));
}

function renderDetailValueHtml(v, depth) {
  const d = depth ?? 0;
  if (d > 6) {
    try {
      return `<pre class="detail-json-inline">${escapeHtml(JSON.stringify(v, null, 2))}</pre>`;
    } catch (_) {
      return '—';
    }
  }
  if (v == null) return '—';
  if (Array.isArray(v)) {
    if (v.length === 0) return '—';
    const inner = v
      .map((item) => {
        if (item != null && typeof item === 'object') {
          return `<li><div class="detail-nested-block">${renderDetailValueHtml(item, d + 1)}</div></li>`;
        }
        return `<li>${formatDetailPrimitive(item)}</li>`;
      })
      .join('');
    return `<ul class="detail-list">${inner}</ul>`;
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v);
    if (!keys.length) return '—';
    const rows = keys
      .sort((a, b) => a.localeCompare(b))
      .map((k) => {
        const inner = v[k];
        const label = escapeHtml(prettyLabel(k));
        if (inner != null && typeof inner === 'object') {
          return `<tr><th>${label}</th><td><div class="detail-nested-block">${renderDetailValueHtml(inner, d + 1)}</div></td></tr>`;
        }
        return `<tr><th>${label}</th><td>${formatDetailPrimitive(inner)}</td></tr>`;
      })
      .join('');
    return `<table class="detail-kv-table"><tbody>${rows}</tbody></table>`;
  }
  return formatDetailPrimitive(v);
}

function renderDetailViewHtml(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return `<pre class="code-editor">${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`;
  }
  const rows = Object.keys(payload)
    .sort((a, b) => a.localeCompare(b))
    .map((k) => {
      const inner = payload[k];
      const label = escapeHtml(prettyLabel(k));
      if (inner != null && typeof inner === 'object') {
        return `<tr><th>${label}</th><td><div class="detail-nested-block">${renderDetailValueHtml(inner, 0)}</div></td></tr>`;
      }
      return `<tr><th>${label}</th><td>${formatDetailPrimitive(inner)}</td></tr>`;
    })
    .join('');
  return `<table class="detail-kv-table detail-kv-table-root"><tbody>${rows}</tbody></table>`;
}

async function openDetailModal(tabId, row) {
  const sid = getRowStableId(row);
  const base = DETAIL_ROUTES[tabId];
  let payload = row;
  if (base && sid) {
    try {
      payload = await fetchJson(`${base}/${encodeURIComponent(sid)}`);
    } catch (e) {
      toast(e.message || 'No se pudo cargar el detalle; se muestra la fila de la tabla.', 'info');
      payload = row;
    }
  }
  const detailHtml = renderDetailViewHtml(payload);
  const json = escapeHtml(JSON.stringify(payload, null, 2));
  const titleLabel = prettyLabel(tabId);
  openModal(`
    <div class="modal-backdrop" role="dialog" aria-modal="true">
      <div class="modal-dialog wide">
        <div class="modal-head">
          <h2>Ver · ${escapeHtml(titleLabel)}</h2>
          <button type="button" class="btn btn-ghost btn-icon" data-modal-close aria-label="Cerrar">✕</button>
        </div>
        <div class="modal-body detail-modal-body">
          <div class="detail-readable">${detailHtml}</div>
          <details class="detail-json-toggle">
            <summary>JSON técnico (copiar / depurar)</summary>
            <pre class="code-editor detail-json-pre">${json}</pre>
          </details>
        </div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-modal-close>Cerrar</button></div>
      </div>
    </div>`);
}

function openEditModal(tabId, row) {
  const base = UPDATE_ROUTES[tabId];
  if (!base) {
    toast('Esta sección no tiene edición directa por PUT en la nueva interfaz.', 'info');
    return;
  }
  const sid = getRowStableId(row);
  if (!sid) {
    toast('La fila no tiene id para guardar.', 'error');
    return;
  }
  const taId = 'modal-edit-json';
  openModal(`
    <div class="modal-backdrop" role="dialog" aria-modal="true">
      <div class="modal-dialog wide">
        <div class="modal-head">
          <h2>Editar · ${escapeHtml(tabId)}</h2>
          <button type="button" class="btn btn-ghost btn-icon" data-modal-close aria-label="Cerrar">✕</button>
        </div>
        <div class="modal-body">
          <p class="muted" style="margin-top:0;">Ajusta el JSON y guarda (PUT). Si no estás seguro, usa la interfaz clásica para formularios guiados.</p>
          <textarea id="${taId}" class="code-editor">${escapeHtml(JSON.stringify(row, null, 2))}</textarea>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-modal-close>Cancelar</button>
          <button type="button" class="btn btn-primary" id="btn-modal-save-edit">Guardar</button>
        </div>
      </div>
    </div>`);
  document.getElementById('btn-modal-save-edit')?.addEventListener('click', async () => {
    const raw = document.getElementById(taId)?.value;
    let body;
    try {
      body = JSON.parse(raw || '{}');
    } catch (_) {
      toast('JSON inválido', 'error');
      return;
    }
    try {
      await fetchJson(`${base}/${encodeURIComponent(sid)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      toast('Cambios guardados', 'ok');
      closeModal();
      const vr = document.querySelector('#view-root');
      if (vr) loadViewInto(vr);
    } catch (e) {
      toast(e.message || 'Error al guardar', 'error');
    }
  });
}

async function confirmDeleteRow(tabId, row) {
  const base = DELETE_ROUTES[tabId];
  const sid = getRowStableId(row);
  if (!base || !sid) return;
  if (!window.confirm(`¿Eliminar el registro ${sid} (${tabId})? Esta acción puede ser irreversible.`)) return;
  try {
    await fetchJson(`${base}/${encodeURIComponent(sid)}`, { method: 'DELETE' });
    toast('Registro eliminado', 'ok');
    const vr = document.querySelector('#view-root');
    if (vr) loadViewInto(vr);
  } catch (e) {
    toast(e.message || 'No se pudo eliminar', 'error');
  }
}

function inferColumns(rows) {
  const keys = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      Object.keys(row).forEach((k) => keys.add(k));
    }
  }
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

function rawCellTitle(row, k) {
  if (!row || !Object.prototype.hasOwnProperty.call(row, k)) return '';
  const v = row[k];
  if (v == null) return '';
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch (_) {
      return '';
    }
  }
  return String(v);
}

function cellClassForColumnKey(k) {
  const nk = normalizeAccessText(k);
  if (nk === 'id' || nk.endsWith(' id')) return 'cell-tight';
  if (
    /precio|total|iva|subtotal|tipo|cambio|stock|pct|descuento|folio|numero|serie|codigo|rfc|telefono|moneda|hora|fecha/i.test(
      nk
    )
  )
    return 'cell-tight';
  return 'cell-long';
}

function renderDataTable(keys, rows, tabId) {
  if (!keys.length) {
    return '<div class="empty-state">Sin columnas inferidas.</div>';
  }
  const showActions = !!tabId;
  const canEdit = tabId && UPDATE_ROUTES[tabId];
  const canDel = tabId && DELETE_ROUTES[tabId];
  const head =
    (showActions ? '<th class="th-actions th-actions-sticky-left">Acciones</th>' : '') +
    keys.map((k) => `<th>${escapeHtml(prettyLabel(k))}</th>`).join('');
  const body = rows
    .map((row, i) => {
      const sid = getRowStableId(row);
      const actions = showActions
        ? `<td class="td-actions td-actions-inline td-actions-sticky-left">
            <button type="button" class="btn small outline act-ver" data-i="${i}" title="Ver detalle" aria-label="Ver"><i class="fas fa-eye" aria-hidden="true"></i></button>
            ${
              canEdit
                ? `<button type="button" class="btn small primary act-edit" data-i="${i}" title="Editar" aria-label="Editar"><i class="fas fa-edit" aria-hidden="true"></i></button>`
                : ''
            }
            ${
              canDel && sid
                ? `<button type="button" class="btn small danger act-del" data-i="${i}" title="Eliminar" aria-label="Eliminar"><i class="fas fa-trash-alt" aria-hidden="true"></i></button>`
                : ''
            }
          </td>`
        : '';
      const cells = keys.map((k) => {
        const v = row && Object.prototype.hasOwnProperty.call(row, k) ? row[k] : '';
        const cls = cellClassForColumnKey(k);
        const title = escapeHtml(rawCellTitle(row, k).slice(0, 900));
        return `<td class="${cls}" title="${title}">${escapeHtml(formatCellValue(v))}</td>`;
      });
      return `<tr>${actions}${cells.join('')}</tr>`;
    })
    .join('');
  const colCount = keys.length + (showActions ? 1 : 0);
  return `
    <div class="table-wrap table-wrap-scroll">
      <table class="data-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${body || `<tr><td colspan="${colCount}" class="empty-state">Sin filas</td></tr>`}</tbody>
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

function bindTableInteractions(container, keys, allRows, tabId) {
  const search = container.querySelector('#table-search');
  const btn = container.querySelector('#btn-csv');
  const mount = container.querySelector('#table-mount');
  const redraw = () => {
    const q = search ? search.value.trim() : '';
    const filtered = filterRowsLocal(allRows, q);
    tableInteractionRowsRef = filtered;
    if (mount) mount.innerHTML = renderDataTable(keys, filtered, tabId);
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
  if (mount && tabId) {
    mount.addEventListener('click', (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLElement)) return;
      const btnEl = t.closest('.act-ver, .act-edit, .act-del');
      if (!btnEl) return;
      const idx = Number(btnEl.getAttribute('data-i'));
      const row = tableInteractionRowsRef[idx];
      if (!row) return;
      if (btnEl.classList.contains('act-ver')) {
        openDetailModal(tabId, row);
      } else if (btnEl.classList.contains('act-edit')) {
        openEditModal(tabId, row);
      } else if (btnEl.classList.contains('act-del')) {
        confirmDeleteRow(tabId, row);
      }
    });
  }
  redraw();
}

async function buildColumnLabelsByTab() {
  const out = {};
  for (const tid of PERMISSION_COLUMN_TAB_IDS) {
    if (tid === 'tarifas') {
      out[tid] = ['Clave', 'Valor'];
      continue;
    }
    if (tid === 'almacen') {
      out[tid] = ['id', 'modelo', 'numero_serie', 'ciudad', 'cliente', 'estado_revision', 'revision_id'].map((k) =>
        prettyLabel(k)
      );
      continue;
    }
    const path = LIST_ROUTES[tid];
    if (!path) {
      out[tid] = [];
      continue;
    }
    try {
      const rows = toArray(await fetchJson(path));
      out[tid] = inferColumns(rows).map((k) => prettyLabel(k));
    } catch (_) {
      out[tid] = [];
    }
  }
  return out;
}

function wireThemeToggle(btn) {
  if (!btn) return;
  updateThemeToggleButton(btn);
  btn.addEventListener('click', () => toggleStoredTheme());
}

function usuarioRoleSelectHtml(userId, role) {
  const opts = APP_USER_ROLES_LIST.map(
    (r) =>
      `<option value="${escapeHtml(r)}" ${String(role || '') === r ? 'selected' : ''}>${escapeHtml(r)}</option>`
  ).join('');
  return `<select class="filter-input u-role" data-user-id="${escapeHtml(String(userId))}" style="min-width:6.5rem;">${opts}</select>`;
}

function usuarioTecnicoSelectHtml(userId, tecnicoId, tecnicos) {
  const opts =
    `<option value="">—</option>` +
    toArray(tecnicos)
      .map((t) => {
        const id = String(t.id);
        const sel = String(tecnicoId || '') === id ? ' selected' : '';
        const lab = String(t.nombre_completo || t.nombre || id);
        return `<option value="${escapeHtml(id)}"${sel}>${escapeHtml(lab)}</option>`;
      })
      .join('');
  return `<select class="filter-input u-tec" data-user-id="${escapeHtml(String(userId))}" style="min-width:12rem;">${opts}</select>`;
}

function createTecnicoSelectHtml(tecnicos) {
  return usuarioTecnicoSelectHtml('_', '', tecnicos).replace(
    'class="filter-input u-tec"',
    'class="filter-input" id="create-tecnico"'
  );
}

function syncPermEditor(root, user) {
  const tabs = parseAccessJson(user.tab_permissions);
  const cols = parseAccessJson(user.column_permissions);
  TAB_DEFS.forEach(([tid]) => {
    const el = root.querySelector('.perm-tab[data-tab-id="' + tid + '"]');
    if (!el) return;
    const has = Object.prototype.hasOwnProperty.call(tabs, tid);
    el.checked = has ? tabs[tid] !== false : true;
  });
  root.querySelectorAll('.perm-col').forEach((box) => {
    const tabId = box.getAttribute('data-tab-id');
    const colLab = box.getAttribute('data-col-label');
    const list = cols && cols[tabId] && Array.isArray(cols[tabId]) ? cols[tabId] : null;
    if (!list || list.length === 0) {
      box.checked = true;
      return;
    }
    const allowed = new Set(list.map((x) => normalizeAccessText(x)));
    box.checked = allowed.has(normalizeAccessText(colLab));
  });
}

async function loadUsuariosView(container) {
  container.innerHTML = '<p class="muted">Cargando administración de usuarios…</p>';
  let users;
  let tecnicos;
  let deletedArr;
  let schedulesArr;
  let colLabels;
  try {
    [users, tecnicos, deletedArr, schedulesArr, colLabels] = await Promise.all([
      fetchJson('/api/app-users'),
      fetchJson('/api/tecnicos').catch(() => []),
      fetchJson('/api/app-users/deleted').catch(() => []),
      fetchJson('/api/admin/report-schedules').catch(() => []),
      buildColumnLabelsByTab(),
    ]);
  } catch (e) {
    container.innerHTML = '<div class="alert-error">' + escapeHtml(e.message || String(e)) + '</div>';
    return;
  }
  users = toArray(users);
  deletedArr = toArray(deletedArr);
  schedulesArr = toArray(schedulesArr);
  const me = userGlobal;
  const activeAdmins = users.filter((u) => u.role === 'admin' && (u.activo === 1 || u.activo === true)).length;

  const permUserOpts = users
    .map((u) => '<option value="' + escapeHtml(String(u.id)) + '">' + escapeHtml(u.username) + '</option>')
    .join('');

  const tabPermChecks = TAB_DEFS.map(
    ([tid, label]) =>
      '<label class="perm-tabs-grid"><input type="checkbox" class="perm-tab" data-tab-id="' +
      escapeHtml(tid) +
      '" /> <span>' +
      escapeHtml(label) +
      ' <span class="muted">(' +
      escapeHtml(tid) +
      ')</span></span></label>'
  ).join('');

  const colBlocks = PERMISSION_COLUMN_TAB_IDS.map((tid) => {
    const labels = colLabels[tid] || [];
    const tabMeta = TAB_DEFS.find(([x]) => x === tid);
    const tabLab = tabMeta ? tabMeta[1] : tid;
    const checks = labels
      .map(
        (lab) =>
          '<label style="display:inline-flex;margin:4px 10px 4px 0;gap:6px;align-items:center;"><input type="checkbox" class="perm-col" data-tab-id="' +
          escapeHtml(tid) +
          '" data-col-label="' +
          escapeHtml(lab) +
          '" /> ' +
          escapeHtml(lab) +
          '</label>'
      )
      .join('');
    return (
      '<div class="perm-cols-block"><h5>' +
      escapeHtml(tabLab) +
      '</h5><div>' +
      (checks || '<span class="muted">Sin columnas inferidas para esta pestaña.</span>') +
      '</div></div>'
    );
  }).join('');

  const tbody = users
    .map((r) => {
      const id = r.id;
      const activo = !!(r.activo === 1 || r.activo === true);
      const isSelf = me && Number(me.id) === Number(id);
      const rowIsActiveAdmin = r.role === 'admin' && activo;
      const blockLastAdmin = rowIsActiveAdmin && activeAdmins <= 1;
      const canDelete = !isSelf && !blockLastAdmin;
      return (
        '<tr>' +
        '<td>' +
        escapeHtml(String(r.username || '')) +
        '</td>' +
        '<td>' +
        escapeHtml(String(r.display_name || '—')) +
        '</td>' +
        '<td>' +
        usuarioRoleSelectHtml(id, r.role || 'invitado') +
        '</td>' +
        '<td>' +
        usuarioTecnicoSelectHtml(id, r.tecnico_id, tecnicos) +
        '</td>' +
        '<td><input type="checkbox" class="u-activo" data-user-id="' +
        escapeHtml(String(id)) +
        '"' +
        (activo ? ' checked' : '') +
        '/></td>' +
        '<td class="muted">' +
        escapeHtml(String(r.creado_en || '—')) +
        '</td>' +
        '<td class="td-actions">' +
        '<button type="button" class="btn btn-small btn-outline u-json" data-user-id="' +
        escapeHtml(String(id)) +
        '">Ver</button> ' +
        '<button type="button" class="btn btn-small btn-outline u-nombre" data-user-id="' +
        escapeHtml(String(id)) +
        '">Nombre</button> ' +
        '<button type="button" class="btn btn-small btn-danger u-del" data-user-id="' +
        escapeHtml(String(id)) +
        '"' +
        (canDelete ? '' : ' disabled') +
        '>Eliminar</button>' +
        '</td>' +
        '</tr>'
      );
    })
    .join('');

  const deletedRows = deletedArr
    .map(
      (r, i) =>
        '<tr><td>' +
        escapeHtml(String(r.username || '')) +
        '</td><td>' +
        escapeHtml(String(r.display_name || '—')) +
        '</td><td>' +
        escapeHtml(String(r.role || '—')) +
        '</td><td class="muted">' +
        escapeHtml(String(r.eliminado_en || '—')) +
        '</td><td>' +
        escapeHtml(String(r.eliminado_por_username || '—')) +
        '</td><td><button type="button" class="btn btn-small btn-outline del-mail" data-del-idx="' +
        i +
        '">Correo</button></td></tr>'
    )
    .join('');

  const schedRows = schedulesArr
    .map((s, i) => {
      const sid = String(s.id || '');
      return (
        '<tr>' +
        '<td>' +
        escapeHtml(sid) +
        '</td>' +
        '<td>' +
        escapeHtml(String(s.module || '—')) +
        '</td>' +
        '<td>' +
        escapeHtml(String(s.frequency || '—')) +
        '</td>' +
        '<td>' +
        escapeHtml(String(s.runAt || '—')) +
        '</td>' +
        '<td class="cell-long">' +
        escapeHtml(formatCellValue(Array.isArray(s.to) ? s.to.join(', ') : s.to)) +
        '</td>' +
        '<td class="muted">' +
        escapeHtml(String(s.lastPeriodStamp || '—')) +
        '</td>' +
        '<td><input type="checkbox" class="sched-on" data-sched-id="' +
        escapeHtml(sid) +
        '"' +
        (s.enabled ? ' checked' : '') +
        '/></td>' +
        '<td class="td-actions">' +
        '<button type="button" class="btn btn-small btn-outline sched-view" data-sched-idx="' +
        i +
        '">Ver</button> ' +
        '<button type="button" class="btn btn-small btn-danger sched-del" data-sched-id="' +
        escapeHtml(sid) +
        '">Eliminar</button>' +
        '</td>' +
        '</tr>'
      );
    })
    .join('');

  const createRoleOpts = APP_USER_ROLES_LIST.map((r) => '<option value="' + r + '">' + r + '</option>').join('');
  const createTecHtml = createTecnicoSelectHtml(tecnicos);

  container.innerHTML =
    '<div id="usuarios-admin-root">' +
    '<p class="muted">Administración alineada a la interfaz clásica (mismas rutas <code>/api/app-users</code>, permisos y programaciones).</p>' +
    '<div class="card" style="margin-bottom:14px;">' +
    '<h3 style="margin:0 0 10px;font-size:1rem;">Nuevo usuario</h3>' +
    '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;">' +
    '<div class="field" style="margin:0;min-width:140px;"><label for="create-user">Usuario</label><input id="create-user" autocomplete="off" /></div>' +
    '<div class="field" style="margin:0;min-width:140px;"><label for="create-pass">Contraseña</label><input id="create-pass" type="password" autocomplete="new-password" /></div>' +
    '<div class="field" style="margin:0;min-width:140px;"><label for="create-dn">Nombre completo</label><input id="create-dn" autocomplete="name" /></div>' +
    '<div class="field" style="margin:0;"><label>Rol</label><select id="create-role" class="filter-input">' +
    createRoleOpts +
    '</select></div>' +
    '<div class="field" style="margin:0;"><label>Personal (cotizar)</label>' +
    createTecHtml +
    '</div>' +
    '<button type="button" class="btn btn-primary" id="btn-create-user">Crear</button>' +
    '</div></div>' +
    '<div class="card" style="margin-bottom:14px;">' +
    '<h3 style="margin:0 0 8px;font-size:1rem;">Permisos por usuario</h3>' +
    '<p class="muted" style="margin:0 0 10px;">Pestañas visibles y columnas permitidas por tabla.</p>' +
    '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-bottom:10px;">' +
    '<div class="field" style="margin:0;min-width:220px;"><label for="perm-user-sel">Usuario</label>' +
    '<select id="perm-user-sel" class="filter-input">' +
    permUserOpts +
    '</select></div>' +
    '<button type="button" class="btn btn-ghost" id="btn-perm-save">Guardar permisos</button>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;">' +
    '<div><h4 style="margin:0 0 8px;font-size:0.9rem;">Pestañas visibles</h4><div class="perm-grid">' +
    tabPermChecks +
    '</div></div>' +
    '<div style="max-height:280px;overflow:auto;"><h4 style="margin:0 0 8px;font-size:0.9rem;">Columnas por tabla</h4>' +
    colBlocks +
    '</div></div></div>' +
    '<div class="table-wrap" style="margin-bottom:14px;"><table class="data-table"><thead><tr>' +
    '<th>Usuario</th><th>Nombre</th><th>Rol</th><th>Personal (cotizar)</th><th>Activo</th><th>Alta</th><th class="th-actions">Acciones</th>' +
    '</tr></thead><tbody>' +
    (tbody || '<tr><td colspan="7" class="empty-state">Sin usuarios</td></tr>') +
    '</tbody></table></div>' +
    '<div class="card" style="margin-bottom:14px;">' +
    '<h3 style="margin:0 0 8px;font-size:1rem;">Usuarios eliminados</h3>' +
    '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-bottom:10px;">' +
    '<div class="field" style="margin:0;min-width:220px;"><label for="del-notify-email">Correo destino (opcional)</label>' +
    '<input type="email" id="del-notify-email" class="filter-input" placeholder="rrhh@empresa.com" autocomplete="email" /></div>' +
    '</div>' +
    '<div class="table-wrap"><table class="data-table"><thead><tr>' +
    '<th>Usuario</th><th>Nombre</th><th>Rol</th><th>Eliminado</th><th>Eliminado por</th><th>Correo</th>' +
    '</tr></thead><tbody>' +
    (deletedRows || '<tr><td colspan="6" class="empty-state">Sin registros</td></tr>') +
    '</tbody></table></div></div>' +
    '<div class="card">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;">' +
    '<h3 style="margin:0;font-size:1rem;">Programaciones automáticas de reportes</h3>' +
    '<button type="button" class="btn btn-ghost" id="btn-sched-refresh">Actualizar vista</button></div>' +
    '<p class="muted" style="margin:0 0 10px;">Editar activación / eliminar; detalle en JSON.</p>' +
    '<div class="table-wrap"><table class="data-table"><thead><tr>' +
    '<th>ID</th><th>Módulo</th><th>Frecuencia</th><th>Hora</th><th>Destinatarios</th><th>Último envío</th><th>Activo</th><th class="th-actions">Acciones</th>' +
    '</tr></thead><tbody>' +
    (schedRows || '<tr><td colspan="8" class="empty-state">Sin programaciones</td></tr>') +
    '</tbody></table></div></div>' +
    '</div>';

  const root = container.querySelector('#usuarios-admin-root');
  if (!root) return;
  root._schedules = schedulesArr;
  root._deleted = deletedArr;

  function selectedUser() {
    const sel = root.querySelector('#perm-user-sel');
    const id = sel ? Number(sel.value) : NaN;
    return users.find((u) => Number(u.id) === id) || users[0];
  }

  function refreshPermUi() {
    const u = selectedUser();
    if (!u) return;
    syncPermEditor(root, u);
  }

  root.querySelector('#perm-user-sel')?.addEventListener('change', refreshPermUi);
  refreshPermUi();

  root.querySelector('#btn-create-user')?.addEventListener('click', async () => {
    const username = root.querySelector('#create-user')?.value.trim().toLowerCase();
    const password = root.querySelector('#create-pass')?.value || '';
    const display_name = root.querySelector('#create-dn')?.value.trim() || username;
    const role = root.querySelector('#create-role')?.value || 'invitado';
    const tecnicoSel = root.querySelector('#create-tecnico');
    const tecnico_id = tecnicoSel && tecnicoSel.value ? tecnicoSel.value : undefined;
    try {
      await fetchJson('/api/app-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role, display_name, tecnico_id }),
      });
      toast('Usuario creado', 'ok');
      await loadUsuariosView(container);
    } catch (e) {
      toast(e.message || 'Error al crear', 'error');
    }
  });

  root.querySelector('#btn-perm-save')?.addEventListener('click', async () => {
    const u = selectedUser();
    if (!u) {
      toast('Selecciona un usuario', 'info');
      return;
    }
    const tabPerms = {};
    TAB_DEFS.forEach(([tid]) => {
      const el = root.querySelector('.perm-tab[data-tab-id="' + tid + '"]');
      if (!el) return;
      tabPerms[tid] = !!el.checked;
    });
    const colPerms = {};
    PERMISSION_COLUMN_TAB_IDS.forEach((tid) => {
      const boxes = root.querySelectorAll('.perm-col[data-tab-id="' + tid + '"]');
      const arr = [];
      boxes.forEach((box) => {
        if (box.checked) arr.push(box.getAttribute('data-col-label'));
      });
      colPerms[tid] = arr;
    });
    try {
      await fetchJson('/api/app-users/' + encodeURIComponent(String(u.id)), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tab_permissions: tabPerms, column_permissions: colPerms }),
      });
      toast('Permisos guardados', 'ok');
      await loadUsuariosView(container);
    } catch (e) {
      toast(e.message || 'No se pudo guardar permisos', 'error');
    }
  });

  root.addEventListener('change', async (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.classList.contains('u-role')) {
      const id = Number(t.getAttribute('data-user-id'));
      try {
        await fetchJson('/api/app-users/' + encodeURIComponent(String(id)), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: t.value }),
        });
        toast('Rol actualizado', 'ok');
      } catch (e) {
        toast(e.message || 'Error', 'error');
        await loadUsuariosView(container);
      }
    }
    if (t.classList.contains('u-tec')) {
      const id = Number(t.getAttribute('data-user-id'));
      const body = { tecnico_id: t.value === '' ? null : t.value };
      try {
        await fetchJson('/api/app-users/' + encodeURIComponent(String(id)), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        toast('Personal vinculado', 'ok');
      } catch (e) {
        toast(e.message || 'Error', 'error');
        await loadUsuariosView(container);
      }
    }
    if (t.classList.contains('u-activo')) {
      const id = Number(t.getAttribute('data-user-id'));
      try {
        await fetchJson('/api/app-users/' + encodeURIComponent(String(id)), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activo: t.checked }),
        });
        toast('Estado actualizado', 'ok');
      } catch (e) {
        toast(e.message || 'Error', 'error');
        await loadUsuariosView(container);
      }
    }
    if (t.classList.contains('sched-on')) {
      const sid = t.getAttribute('data-sched-id');
      if (!sid) return;
      try {
        await fetchJson('/api/admin/report-schedules/' + encodeURIComponent(sid), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: t.checked }),
        });
        toast('Programación actualizada', 'ok');
      } catch (e) {
        toast(e.message || 'Error', 'error');
        t.checked = !t.checked;
      }
    }
  });

  root.addEventListener('click', async (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    const btn = t.closest('button');
    if (!btn) return;
    if (btn.classList.contains('u-json')) {
      const id = Number(btn.getAttribute('data-user-id'));
      const row = users.find((x) => Number(x.id) === id);
      if (!row) return;
      openModal(
        '<div class="modal-backdrop" role="dialog" aria-modal="true"><div class="modal-dialog wide"><div class="modal-head"><h2>Usuario · JSON</h2><button type="button" class="btn btn-ghost btn-icon" data-modal-close>✕</button></div><div class="modal-body"><pre class="code-editor" style="margin:0;white-space:pre-wrap;">' +
          escapeHtml(JSON.stringify(row, null, 2)) +
          '</pre></div><div class="modal-actions"><button type="button" class="btn btn-ghost" data-modal-close>Cerrar</button></div></div></div>'
      );
    }
    if (btn.classList.contains('u-nombre')) {
      const id = Number(btn.getAttribute('data-user-id'));
      const row = users.find((x) => Number(x.id) === id);
      if (!row) return;
      const cur = String(row.display_name || '');
      const v = window.prompt('Nombre completo para la cuenta', cur);
      if (v == null) return;
      try {
        await fetchJson('/api/app-users/' + encodeURIComponent(String(id)), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ display_name: v.trim() || row.username }),
        });
        toast('Nombre actualizado', 'ok');
        await loadUsuariosView(container);
      } catch (e) {
        toast(e.message || 'Error', 'error');
      }
    }
    if (btn.classList.contains('u-del')) {
      const id = Number(btn.getAttribute('data-user-id'));
      if (!window.confirm('¿Eliminar usuario ' + id + '?')) return;
      try {
        await fetchJson('/api/app-users/' + encodeURIComponent(String(id)), { method: 'DELETE' });
        toast('Usuario eliminado', 'ok');
        await loadUsuariosView(container);
      } catch (e) {
        toast(e.message || 'Error', 'error');
      }
    }
    if (btn.classList.contains('del-mail')) {
      const i = Number(btn.getAttribute('data-del-idx'));
      const o = root._deleted && root._deleted[i];
      if (!o) return;
      const email = root.querySelector('#del-notify-email')?.value.trim() || '';
      const sub = encodeURIComponent('Resumen baja usuario: ' + (o.username || ''));
      const body = encodeURIComponent(
        'Usuario: ' +
          (o.username || '') +
          '\nNombre: ' +
          (o.display_name || '') +
          '\nEliminado: ' +
          (o.eliminado_en || '') +
          '\nPor: ' +
          (o.eliminado_por_username || '') +
          '\n'
      );
      const q = 'subject=' + sub + '&body=' + body;
      window.location.href = email ? 'mailto:' + email + '?' + q : 'mailto:?' + q;
    }
    if (btn.classList.contains('sched-view')) {
      const i = Number(btn.getAttribute('data-sched-idx'));
      const o = root._schedules && root._schedules[i];
      if (!o) return;
      openModal(
        '<div class="modal-backdrop" role="dialog" aria-modal="true"><div class="modal-dialog wide"><div class="modal-head"><h2>Programación</h2><button type="button" class="btn btn-ghost btn-icon" data-modal-close>✕</button></div><div class="modal-body"><pre class="code-editor" style="margin:0;white-space:pre-wrap;">' +
          escapeHtml(JSON.stringify(o, null, 2)) +
          '</pre></div><div class="modal-actions"><button type="button" class="btn btn-ghost" data-modal-close>Cerrar</button></div></div></div>'
      );
    }
    if (btn.classList.contains('sched-del')) {
      const sid = btn.getAttribute('data-sched-id');
      if (!sid || !window.confirm('¿Eliminar programación ' + sid + '?')) return;
      try {
        await fetchJson('/api/admin/report-schedules/' + encodeURIComponent(sid), { method: 'DELETE' });
        toast('Programación eliminada', 'ok');
        await loadUsuariosView(container);
      } catch (e) {
        toast(e.message || 'Error', 'error');
      }
    }
    if (btn.id === 'btn-sched-refresh') {
      await loadUsuariosView(container);
    }
  });
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
              <button type="button" class="btn small outline" id="btn-csv">Exportar CSV</button>
              <span id="table-hint" class="muted"></span>
            </div>
            <div id="table-mount"></div>
          </div>`;
        bindTableInteractions(container.querySelector('#almacen-table-root'), keys, merged, 'almacen');
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
              <button type="button" class="btn small outline" id="btn-csv">Exportar CSV</button>
              <span id="table-hint" class="muted"></span>
            </div>
            <div id="table-mount"></div>
          </div>`;
        bindTableInteractions(container.querySelector('#audit-root'), keys, rows, 'auditoria');
        break;
      }
      case 'usuarios': {
        await loadUsuariosView(container);
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
              <button type="button" class="btn small outline" id="btn-csv">Exportar CSV</button>
              <span id="table-hint" class="muted"></span>
            </div>
            <div id="table-mount"></div>
          </div>`;
        bindTableInteractions(container.querySelector('#list-root'), keys, rows, currentTab);
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
    toggle.addEventListener('click', () => {
      if (window.matchMedia('(max-width: 900px)').matches) {
        document.body.classList.toggle('sidebar-open');
      } else {
        document.body.classList.toggle('scratch-sidebar-collapsed');
        const expanded = !document.body.classList.contains('scratch-sidebar-collapsed');
        toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      }
    });
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
}

function renderShell(root, cfg, user) {
  document.body.classList.remove('login-open');
  cfgGlobal = cfg;
  userGlobal = user;
  const tabs = visibleTabs(cfg, user);

  if (!tabs.some(([id]) => id === currentTab)) currentTab = 'dashboards';

  const navHtml = tabs
    .map(([id, label]) => {
      const ic = TAB_ICONS[id] || 'fa-circle';
      return `<button type="button" class="nav-item rail-tab${id === currentTab ? ' active' : ''}" data-tab="${escapeHtml(
        id
      )}"><i class="fas ${ic}" aria-hidden="true"></i><span class="nav-label">${escapeHtml(label)}</span></button>`;
    })
    .join('');

  const logoSrcRaw =
    cfg.logoUrl != null && String(cfg.logoUrl).trim()
      ? String(cfg.logoUrl).trim()
      : '/fondos/universal-logo.jpg';

  const appTitle = escapeHtml(cfg.appName || cfg.shortName || 'Servicio Tecnico');

  const logoutMenuItem = cfg.authRequired
    ? `<button type="button" class="header-profile-menu-item danger" role="menuitem" id="profile-menu-logout"><i class="fas fa-sign-out-alt" aria-hidden="true"></i><span>Cerrar sesión</span></button>`
    : '';

  root.replaceChildren(
    el(`
      <div class="shell scratch-shell">
        <div class="scrim" id="nav-scrim" aria-hidden="true"></div>
        <header class="scratch-app-header" aria-label="Cabecera principal">
          <div class="scratch-header-inner">
            <div class="scratch-header-brand">
              <div class="scratch-header-logo-wrap header-brand-logo-wrap">
                <img class="scratch-header-logo login-brand-hero-img" src="${escapeHtml(logoSrcRaw)}" alt="Universal" width="120" height="72" decoding="async" loading="lazy" />
              </div>
              <div class="scratch-header-brand-text">
                <h1 class="scratch-header-service-title">${appTitle}</h1>
              </div>
            </div>
            <div class="scratch-header-actions">
              <span class="scratch-powered-by header-powered-by" aria-label="Créditos">powered by Ing. David Cantú</span>
              <button type="button" class="scratch-btn-icon-header shell-theme-toggle" data-theme-toggle title="Tema claro u oscuro" aria-label="Cambiar tema claro u oscuro" aria-pressed="false"><i class="fas fa-sun" aria-hidden="true"></i></button>
              <div id="header-profile-wrap" class="header-profile-wrap">
                <div class="header-profile-meta visually-hidden">
                  <span id="header-profile-name" class="header-profile-name"></span>
                  <span id="header-profile-role" class="header-profile-role"></span>
                </div>
                <button type="button" id="btn-header-profile" class="btn-header-profile" aria-expanded="false" aria-haspopup="true" aria-controls="header-profile-menu" title="Cuenta y sesión" aria-describedby="header-profile-name">
                  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
                    <circle cx="12" cy="9" r="3.5" fill="none" stroke="currentColor" stroke-width="1.75"/>
                    <path d="M6.5 20v-0.5a5.5 5.5 0 0111 0v0.5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                  </svg>
                  <span class="header-profile-caret" aria-hidden="true"><i class="fas fa-chevron-down"></i></span>
                </button>
                <div id="header-profile-menu" class="header-profile-menu hidden" role="menu" aria-label="Menú de cuenta">
                  <div class="header-profile-menu-user">
                    <strong id="profile-menu-display"></strong>
                    <div class="header-profile-menu-meta"><span id="profile-menu-fullname"></span></div>
                  </div>
                  <button type="button" class="header-profile-menu-item" role="menuitem" id="profile-menu-refresh"><i class="fas fa-sync-alt" aria-hidden="true"></i><span>Actualizar vista</span></button>
                  <div class="header-profile-menu-section">Mi cuenta</div>
                  <button type="button" class="header-profile-menu-item" role="menuitem" id="profile-menu-perfil"><i class="fas fa-id-card" aria-hidden="true"></i><span>Mi perfil</span></button>
                  <button type="button" class="header-profile-menu-item" role="menuitem" id="profile-menu-password"><i class="fas fa-key" aria-hidden="true"></i><span>Cambiar contraseña</span></button>
                  <button type="button" class="header-profile-menu-item" role="menuitem" id="profile-menu-notif-prefs"><i class="fas fa-bell" aria-hidden="true"></i><span>Notificaciones</span></button>
                  <div class="header-profile-menu-divider"></div>
                  <div class="header-profile-menu-section">Personalización</div>
                  <button type="button" class="header-profile-menu-item" role="menuitem" id="profile-menu-tema"><i class="fas fa-palette" aria-hidden="true"></i><span>Tema y apariencia</span></button>
                  <button type="button" class="header-profile-menu-item" role="menuitem" id="profile-menu-densidad"><i class="fas fa-grip-lines" aria-hidden="true"></i><span>Densidad de tablas</span></button>
                  <div class="header-profile-menu-divider"></div>
                  <div class="header-profile-menu-section">Avanzado</div>
                  <button type="button" class="header-profile-menu-item" role="menuitem" id="profile-menu-mas"><i class="fas fa-sliders-h" aria-hidden="true"></i><span>Más opciones…</span></button>
                  <button type="button" class="header-profile-menu-item" role="menuitem" id="profile-menu-respaldo"><i class="fas fa-database" aria-hidden="true"></i><span>Respaldos</span></button>
                  <button type="button" class="header-profile-menu-item" role="menuitem" id="profile-menu-ayuda"><i class="fas fa-circle-question" aria-hidden="true"></i><span>Ayuda y atajos</span></button>
                  ${logoutMenuItem}
                </div>
              </div>
            </div>
          </div>
        </header>
        <div class="app-frame scratch-app-frame">
          <aside class="sidebar scratch-sidebar-nav sidebar-nav" aria-label="Navegación de módulos">
            <div class="scratch-sidebar-toolbar sidebar-nav-toolbar">
              <button type="button" id="nav-toggle" class="btn-sidebar-rail-toggle scratch-sidebar-toggle" aria-expanded="true" aria-controls="scratch-rail-tabs" title="Mostrar u ocultar lista de módulos">
                <span class="visually-hidden">Menú módulos</span>
                <svg class="sidebar-rail-burger-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
                  <rect x="4" y="6.25" width="16" height="2" rx="0.5" fill="currentColor"/>
                  <rect x="4" y="11" width="16" height="2" rx="0.5" fill="currentColor"/>
                  <rect x="4" y="15.75" width="16" height="2" rx="0.5" fill="currentColor"/>
                </svg>
              </button>
              <p class="sidebar-nav-title" id="sidebar-rail-heading">Módulos</p>
            </div>
            <nav id="scratch-rail-tabs" class="nav-scroll tabs tabs--rail scratch-rail-tabs" role="navigation" aria-labelledby="sidebar-rail-heading">${navHtml}</nav>
          </aside>
          <div class="shell-main scratch-main">
            <header class="toolbar scratch-view-toolbar">
              <h1 id="view-title">—</h1>
            </header>
            <main class="view-root" id="view-root"><div class="muted">Cargando…</div></main>
            <footer class="shell-footer">Nanoprecisión · mismo backend · interfaz renovada</footer>
          </div>
        </div>
      </div>
    `)
  );

  wireSidebarEvents(root);
  wireHeaderProfileScratch(root);
  root.querySelectorAll('[data-theme-toggle]').forEach((b) => wireThemeToggle(b));
  loadViewInto(root.querySelector('#view-root'));
}

function renderLogin(root, cfg, err) {
  cfgGlobal = cfg;
  document.body.classList.add('login-open');

  const logoSrcRaw =
    cfg.logoUrl != null && String(cfg.logoUrl).trim()
      ? String(cfg.logoUrl).trim()
      : '/fondos/universal-logo.jpg';
  const brandTitle = escapeHtml(cfg.shortName || cfg.appName || 'Servicio Técnico');
  const brandTagline = escapeHtml(
    cfg.tagline || 'Universal · Operaciones, incidentes, bitácora y catálogos'
  );
  const errText = err != null && String(err).trim() ? escapeHtml(String(err)) : '';
  const errHidden = errText ? '' : ' hidden';

  const authForm = cfg.authRequired
    ? `
          <form id="login-form" class="login-form" method="post" action="#" autocomplete="on" novalidate>
            <div class="form-group login-field">
              <label for="login-user"><i class="fas fa-user"></i> Usuario</label>
              <input type="text" id="login-user" name="username" autocomplete="username" required placeholder="Tu nombre de usuario" />
            </div>
            <div class="form-group login-field">
              <label for="login-pass"><i class="fas fa-lock"></i> Contraseña</label>
              <div class="login-pass-wrap">
                <input type="password" id="login-pass" name="password" autocomplete="current-password" required placeholder="Tu contraseña" />
                <button type="button" class="login-eye-btn" id="login-eye-btn" tabindex="-1" aria-label="Mostrar/ocultar contraseña"><i class="fas fa-eye" id="login-eye-icon"></i></button>
              </div>
            </div>
            <p class="login-error${errHidden}" id="login-error" role="alert"><i class="fas fa-exclamation-circle"></i> <span id="login-error-text">${errText}</span></p>
            <button type="submit" class="login-submit btn primary big" id="login-submit-btn">
              <span class="login-submit-text"><i class="fas fa-sign-in-alt"></i> Entrar al sistema</span>
              <span class="login-submit-loading hidden"><i class="fas fa-spinner fa-spin"></i> Verificando…</span>
            </button>
          </form>
          <div class="login-roles-info">
            <p class="login-roles-title"><i class="fas fa-info-circle"></i> Niveles de acceso disponibles</p>
            <div class="login-roles-grid">
              <div class="login-role-card login-role-admin">
                <i class="fas fa-crown"></i>
                <strong>Administrador</strong>
                <span>CRUD completo + auditoría</span>
              </div>
              <div class="login-role-card login-role-usuario">
                <i class="fas fa-user-plus"></i>
                <strong>Usuario</strong>
                <span>Agregar registros + ver</span>
              </div>
              <div class="login-role-card login-role-consulta">
                <i class="fas fa-eye"></i>
                <strong>Consulta</strong>
                <span>Solo lectura</span>
              </div>
            </div>
          </div>`
    : `
          <p class="login-hint" id="login-hint-local">Sin login obligatorio: cargando perfil…</p>
          <p class="login-error hidden" id="login-error" role="alert"><i class="fas fa-exclamation-circle"></i> <span id="login-error-text"></span></p>`;

  root.replaceChildren(
    el(`
      <div id="login-overlay" class="login-overlay" role="dialog" aria-modal="true" aria-labelledby="login-title">
        <span class="header-powered-by login-overlay-powered-by" aria-label="Créditos">powered by Ing. David Cantú</span>
        <div class="login-split">
          <div class="login-brand-panel">
            <div class="login-brand-content">
              <div class="login-brand-logo" aria-hidden="true">
                <img src="${escapeHtml(logoSrcRaw)}" alt="" width="120" height="72" class="login-brand-hero-img" decoding="async" />
              </div>
              <h1 class="login-brand-title" id="login-brand-name">${brandTitle}</h1>
              <p class="login-brand-tagline" id="login-brand-tagline">${brandTagline}</p>
              <div class="login-brand-features">
                <div class="login-feature-item"><i class="fas fa-shield-alt"></i><span>Acceso seguro por roles</span></div>
                <div class="login-feature-item"><i class="fas fa-chart-line"></i><span>Dashboards en tiempo real</span></div>
                <div class="login-feature-item"><i class="fas fa-file-invoice-dollar"></i><span>Cotizaciones y ventas</span></div>
                <div class="login-feature-item"><i class="fas fa-tools"></i><span>Gestión de incidentes</span></div>
              </div>
              <div class="login-brand-badges">
                <span class="login-badge"><i class="fas fa-crown"></i> Admin</span>
                <span class="login-badge"><i class="fas fa-user-edit"></i> Usuario</span>
                <span class="login-badge"><i class="fas fa-eye"></i> Consulta</span>
              </div>
            </div>
            <div class="login-brand-decoration">
              <div class="login-deco-circle login-deco-c1"></div>
              <div class="login-deco-circle login-deco-c2"></div>
              <div class="login-deco-circle login-deco-c3"></div>
            </div>
          </div>
          <div class="login-form-panel">
            <div class="login-card">
              <div class="login-card-header">
                <div class="login-card-icon"><i class="fas fa-lock"></i></div>
                <h2 id="login-title">${cfg.authRequired ? 'Iniciar sesión' : 'Acceso local'}</h2>
                <p class="login-hint" id="login-hint">${escapeHtml(cfg.authRequired ? 'Introduce tus credenciales para continuar' : 'Entorno sin credenciales obligatorias.')}</p>
              </div>
              ${authForm}
              <p class="login-classic-footer">
                ¿Necesitas la interfaz anterior? <a href="/legacy-app">Abrir interfaz clásica</a>${
                  cfg.buildTag
                    ? ` · build:${escapeHtml(String(cfg.buildTag).replace(/^build:\s*/i, ''))}`
                    : ''
                }
              </p>
            </div>
          </div>
        </div>
      </div>
    `)
  );

  const eyeBtn = root.querySelector('#login-eye-btn');
  const passInput = root.querySelector('#login-pass');
  const eyeIcon = root.querySelector('#login-eye-icon');
  if (eyeBtn && passInput && eyeIcon) {
    eyeBtn.addEventListener('click', () => {
      const show = passInput.type === 'password';
      passInput.type = show ? 'text' : 'password';
      eyeIcon.className = show ? 'fas fa-eye-slash' : 'fas fa-eye';
    });
  }

  const form = root.querySelector('#login-form');
  if (form) {
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const username = root.querySelector('#login-user').value.trim();
      const password = root.querySelector('#login-pass').value;
      const submitBtn = root.querySelector('#login-submit-btn');
      const loadSpan = root.querySelector('.login-submit-loading');
      const textSpan = root.querySelector('.login-submit-text');
      const errEl = root.querySelector('#login-error');
      const errTx = root.querySelector('#login-error-text');
      if (errEl) errEl.classList.add('hidden');
      if (submitBtn) submitBtn.disabled = true;
      if (loadSpan) loadSpan.classList.remove('hidden');
      if (textSpan) textSpan.classList.add('hidden');
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
        const msg = e.message || 'No se pudo iniciar sesión.';
        if (errTx) errTx.textContent = msg;
        if (errEl) errEl.classList.remove('hidden');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (loadSpan) loadSpan.classList.add('hidden');
        if (textSpan) textSpan.classList.remove('hidden');
      }
    });
  } else if (!cfg.authRequired) {
    fetchJson('/api/auth/me')
      .then((me) => renderShell(root, cfg, me.user))
      .catch((e) => {
        const errEl = root.querySelector('#login-error');
        const errTx = root.querySelector('#login-error-text');
        if (errTx) errTx.textContent = e.message || String(e);
        if (errEl) errEl.classList.remove('hidden');
      });
  }
}

async function bootstrap() {
  const root = document.getElementById('app');
  if (!root) return;

  applyStoredTheme();

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
