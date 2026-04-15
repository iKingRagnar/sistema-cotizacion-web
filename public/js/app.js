(function () {
  const API = '/api';
  const AUTH_TOKEN_KEY = 'cotizacion-auth-token';
  const AUTH_USER_KEY = 'cotizacion-auth-user';
  const SIDEBAR_RAIL_COLLAPSED_KEY = 'cotizacion-sidebar-rail-collapsed';
  const SOUND_PREF_KEY = 'cotizacion-sound';
  /** Monto sugerido al crear un bono nuevo (USD); editable antes de guardar. */
  const DEFAULT_BONO_USD = 30;
  let serverConfig = Object.assign({}, typeof window.__APP_CONFIG__ === 'object' && window.__APP_CONFIG__ ? window.__APP_CONFIG__ : {});
  let clientesCache = [];
  let refaccionesCache = [];
  /** Árbol GET /api/categorias-catalogo para filtros de refacciones. */
  let categoriasCatalogoTree = { categorias: [] };
  /** Copia para edición/eliminación en panel admin de categorías. */
  let categoriasAdminTree = null;
  let maquinasCache = [];
  let cotizacionesCache = [];
  let incidentesCache = [];
  let bitacorasCache = [];
  let globalBranchFilter = '';
  const clienteCityById = {};
  const clienteCityByName = {};
  const notificationsFeed = [];
  let notificationsDateFrom = '';
  let notificationsDateTo = '';
  let notificationsUnread = 0;
  let chartDonut = null;
  let chartBars = null;
  /** Filtro cruzado en dashboard (estilo Power BI): dimensión de módulo y/o periodo del comparativo */
  let dashboardCrossFilterEntity = null;
  let dashboardCrossFilterPeriod = null;
  const systemStatusState = {
    mode: '—',
    persistence: '—',
    registros: '—',
    updatedAt: null,
  };
  /** Evita llamar varias veces a /demo-ensure-maquinas en la misma carga de página. */
  let seedDemoEnsureOnce = false;
  /** Tras `loadDashboard`, la primera apertura de estas pestañas puede usar datos ya traídos (menos red y menos bloqueo del hilo principal). */
  let skipNextClientesFetchAfterDashboard = false;
  let skipNextMaquinasFetchAfterDashboard = false;
  let skipNextCotizacionesFetchAfterDashboard = false;
  let skipNextBitacorasFetchAfterDashboard = false;
  /** maquina_id → cotización pendiente que ya incluye esa máquina (evita duplicar cotización). */
  let maquinaIdBloqueoCotizacionMap = new Map();
  let almacenMaquinasSnapshot = [];
  let almacenRevisionSnapshot = [];

  /** ExcelJS solo al exportar/importar XLSX (evita ~1MB de JS en cada carga de página). */
  let excelJsLoadPromise = null;
  function ensureExcelJs() {
    if (typeof ExcelJS !== 'undefined') return Promise.resolve();
    if (excelJsLoadPromise) return excelJsLoadPromise;
    excelJsLoadPromise = new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
      s.async = true;
      s.onload = function () {
        if (typeof ExcelJS !== 'undefined') resolve();
        else reject(new Error('ExcelJS'));
      };
      s.onerror = function () { reject(new Error('exceljs')); };
      document.head.appendChild(s);
    });
    return excelJsLoadPromise;
  }

  /** Chart.js solo cuando hace falta (dashboard con gráficos); no bloquea el primer paint. */
  let chartJsLoadPromise = null;
  function ensureChartJs() {
    if (typeof Chart !== 'undefined') return Promise.resolve();
    if (chartJsLoadPromise) return chartJsLoadPromise;
    chartJsLoadPromise = new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
      s.crossOrigin = 'anonymous';
      s.async = true;
      s.onload = function () {
        if (typeof Chart !== 'undefined') resolve();
        else reject(new Error('Chart'));
      };
      s.onerror = function () { reject(new Error('chartjs')); };
      document.head.appendChild(s);
    });
    return chartJsLoadPromise;
  }

  /** Gráficos del dashboard: carga Chart en idle para no competir con API + DOM principal. */
  function renderDashboardChartsDeferred(cotizacionesCtx, bitacorasCtx, dashboardStats) {
    const chartsEl = qs('#dashboard-charts');
    if (!chartsEl || !dashboardStats || !dashboardStats.periodos) {
      if (chartsEl) chartsEl.style.display = 'none';
      return;
    }
    const run = async function () {
      try {
        await ensureChartJs();
      } catch (_) {
        chartsEl.style.display = 'none';
        return;
      }
      if (typeof Chart === 'undefined') {
        chartsEl.style.display = 'none';
        return;
      }
      chartsEl.style.display = '';
      if (chartDonut) {
        chartDonut.destroy();
        chartDonut = null;
      }
      if (chartBars) {
        chartBars.destroy();
        chartBars = null;
      }
      const nCot = cotizacionesCtx.length;
      const nBit = bitacorasCtx.length;
      const donutCtx = document.getElementById('chart-donut');
      const industrialUi = document.body.classList.contains('theme-industrial');
      if (donutCtx && (nCot + nBit > 0)) {
        chartDonut = new Chart(donutCtx, {
          type: 'doughnut',
          data: {
            labels: ['Cotizaciones', 'Bitácoras'],
            datasets: [
              {
                data: [nCot, nBit],
                backgroundColor: industrialUi ? ['#ca8a04', '#57534e'] : ['#059669', '#7c3aed'],
                borderColor: industrialUi ? '#292524' : '#1e293b',
                borderWidth: 2,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            onHover: function (e, els) { if (e.native && e.native.target) e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
            onClick: function (_evt, elements) {
              if (!elements || !elements.length) return;
              const keys = ['cotizaciones', 'bitacoras'];
              const i = elements[0].index;
              if (keys[i]) setDashboardCrossFilterEntity(keys[i]);
            },
            plugins: { legend: { position: 'bottom', labels: { color: '#e2e8f0', font: { size: 12 } } } },
          },
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
              {
                label: 'Actual',
                data: [p.semana_actual?.cotizaciones?.count ?? 0, p.mes_actual?.cotizaciones?.count ?? 0, p.año_actual?.cotizaciones?.count ?? 0],
                backgroundColor: industrialUi ? 'rgba(234,179,8,0.82)' : 'rgba(56,189,248,0.8)',
                borderColor: industrialUi ? '#ca8a04' : '#38bdf8',
                borderWidth: 1,
              },
              {
                label: 'Anterior',
                data: [p.semana_anterior?.cotizaciones?.count ?? 0, p.mes_anterior?.cotizaciones?.count ?? 0, p.año_anterior?.cotizaciones?.count ?? 0],
                backgroundColor: industrialUi ? 'rgba(120,113,108,0.75)' : 'rgba(148,163,184,0.6)',
                borderColor: industrialUi ? '#78716c' : '#94a3b8',
                borderWidth: 1,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            onHover: function (e, els) { if (e.native && e.native.target) e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
            onClick: function (_evt, elements) {
              if (!elements || !elements.length) return;
              const periods = ['semana', 'mes', 'año'];
              const i = elements[0].index;
              if (periods[i]) setDashboardCrossFilterPeriod(periods[i]);
            },
            scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' } }, y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' } } },
            plugins: { legend: { position: 'bottom', labels: { color: '#e2e8f0' } } },
          },
        });
      }
    };
    const fail = function () { chartsEl.style.display = 'none'; };
    try {
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(function () { run().catch(fail); }, { timeout: 5000 });
      } else {
        setTimeout(function () { run().catch(fail); }, 1);
      }
    } catch (_) {
      setTimeout(function () { run().catch(fail); }, 1);
    }
  }

  function qs(s) { return document.querySelector(s); }
  function qsAll(s) { return document.querySelectorAll(s); }

  (function bindTableReadOnlyGuards() {
    /** Solo columna Acciones: bloquea inicio de selección (refuerzo al CSS). Celdas de datos permiten copiar. */
    function isActionsColumnInteraction(el) {
      if (!el || !el.closest) return false;
      const cell = el.closest('.data-table tbody td.th-actions');
      if (!cell) return false;
      if (el.closest && el.closest('input, textarea, select, [contenteditable="true"]')) return false;
      return true;
    }
    /** Bitácora: columnas Horas / Materiales / Estado — sin caret al arrastrar (solo estas celdas). */
    function isBitacoraNoIbeamBodyCell(el) {
      if (!el || !el.closest) return false;
      return !!el.closest('#tabla-bitacoras tbody td.col-no-ibeam');
    }
    document.addEventListener('selectstart', function (e) {
      if (isActionsColumnInteraction(e.target)) e.preventDefault();
      else if (isBitacoraNoIbeamBodyCell(e.target)) e.preventDefault();
    }, true);
    document.addEventListener('dragstart', function (e) {
      if (isActionsColumnInteraction(e.target)) e.preventDefault();
      else if (isBitacoraNoIbeamBodyCell(e.target)) e.preventDefault();
    }, true);
  })();

  function isSoundEnabled() {
    try {
      if (localStorage.getItem(SOUND_PREF_KEY) === '1') return true;
      if (localStorage.getItem(SOUND_PREF_KEY) === '0') return false;
    } catch (_) {}
    return !!(serverConfig && serverConfig.soundEffectsDefault);
  }
  function playSuccessChime() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(880, ctx.currentTime);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.07, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(ctx.currentTime);
      o.stop(ctx.currentTime + 0.15);
      setTimeout(function () { ctx.close && ctx.close(); }, 300);
    } catch (_) {}
  }
  function getAuthToken() {
    try { return localStorage.getItem(AUTH_TOKEN_KEY) || ''; } catch (_) { return ''; }
  }
  function setAuthSession(token, user) {
    try {
      if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
      else localStorage.removeItem(AUTH_TOKEN_KEY);
      if (user) localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
      else localStorage.removeItem(AUTH_USER_KEY);
    } catch (_) {}
  }
  function clearAuthSession() {
    setAuthSession(null, null);
  }
  function getSessionUser() {
    try { return JSON.parse(localStorage.getItem(AUTH_USER_KEY) || 'null'); } catch (_) { return null; }
  }
  /** Alineado con servidor: evita que "Admin" o espacios rompan permisos. */
  function normalizeRole(r) {
    return String(r == null ? '' : r).trim().toLowerCase();
  }
  // Helpers de permisos por rol
  function canAdd() {
    const u = getSessionUser();
    if (!serverConfig.authRequired) return true;
    const role = normalizeRole(u && u.role);
    return u && ['admin', 'operador', 'usuario'].includes(role);
  }
  function canEdit() {
    const u = getSessionUser();
    if (!serverConfig.authRequired) return true;
    const role = normalizeRole(u && u.role);
    return u && ['admin', 'operador'].includes(role);
  }
  function canDelete() {
    const u = getSessionUser();
    if (!serverConfig.authRequired) return true;
    return u && normalizeRole(u.role) === 'admin';
  }
  /** Entradas/salidas y conteo físico: admin, operador y usuario (no consulta/invitado). */
  function canAdjustStock() {
    const u = getSessionUser();
    if (!serverConfig.authRequired) return true;
    const role = normalizeRole(u && u.role);
    return u && ['admin', 'operador', 'usuario'].includes(role);
  }
  function getRoleLabel(role) {
    const labels = {
      admin: 'Administrador',
      operador: 'Operador',
      usuario: 'Usuario',
      consulta: 'Consulta',
      invitado: 'Invitado',
    };
    return labels[role] || role || '—';
  }

  /** Segunda línea del menú del monito: nombre completo (display_name). Si en BD quedó igual que el rol (semilla vieja), muestra el usuario. */
  function profileMenuSecondaryName(u) {
    if (!u) return '—';
    const uname = String(u.username || '').trim();
    const raw = String(u.displayName || '').trim();
    const roleLabel = getRoleLabel(u.role);
    if (!raw) return uname || '—';
    if (roleLabel && raw.toLowerCase() === String(roleLabel).toLowerCase()) return uname || raw;
    return raw;
  }
  /** Comisiones, bonos y % de ganancia: solo administrador cuando la app exige login. */
  function canViewCommissions() {
    if (!serverConfig.authRequired) return true;
    const u = getSessionUser();
    return !!(u && normalizeRole(u.role) === 'admin');
  }
  /** Tarifas, prospección y pestaña Personal: solo admin si hay login; sin auth, comportamiento local (acceso libre). */
  function canAccessAdminOnlyModules() {
    if (!serverConfig.authRequired) return true;
    const u = getSessionUser();
    return !!(u && normalizeRole(u.role) === 'admin');
  }
  /** Demo, respaldos y borrado masivo: solo admin con login (misma política que módulos solo admin). */
  function canAccessDemoAdminPanel() {
    return canAccessAdminOnlyModules();
  }
  /** Descargar vistas previas / archivos subidos: mismo criterio que módulos solo admin (sin auth en local, todos; con auth, solo rol admin). */
  function canDownloadUploadedMedia() {
    return canAccessAdminOnlyModules();
  }
  function refCategoriaLabel(c, depth) {
    const d = (depth | 0);
    if (d > 8) return '';
    if (c == null || c === '') return '';
    if (typeof c === 'number' && Number.isFinite(c)) return String(c);
    if (typeof c === 'boolean') return c ? '1' : '';
    if (typeof c === 'string') {
      const t = c.trim();
      if (!t || t === '[object Object]') return '';
      if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
        try {
          const parsed = JSON.parse(t);
          const inner = refCategoriaLabel(parsed, d + 1);
          if (inner) return inner;
        } catch (_) { /* seguir como texto */ }
      }
      return t;
    }
    if (Array.isArray(c)) {
      return c
        .map(function (x) {
          return refCategoriaLabel(x, d + 1);
        })
        .filter(Boolean)
        .join(', ');
    }
    if (typeof c === 'object') {
      const pick =
        c.nombre != null
          ? c.nombre
          : c.name != null
            ? c.name
            : c.label != null
              ? c.label
              : c.titulo != null
                ? c.titulo
                : c.value != null
                  ? c.value
                  : c.texto != null
                    ? c.texto
                    : c.categoria != null
                      ? c.categoria
                      : c.subcategoria != null
                        ? c.subcategoria
                        : c.id != null && typeof c.id !== 'object'
                          ? c.id
                          : null;
      if (pick != null && pick !== c) {
        const sub = refCategoriaLabel(pick, d + 1);
        return sub === '[object Object]' ? '' : sub;
      }
      return '';
    }
    const fb = String(c).trim();
    return fb === '[object Object]' ? '' : fb;
  }
  /** Celda HTML: línea / parte con pills (sin [object Object]). */
  function formatRefaccionCategoriaCellHtml(r) {
    const cat = refCategoriaLabel(r.categoria);
    const sub = refCategoriaLabel(r.subcategoria);
    if (!cat && !sub) return '<span class="ref-cat-empty">—</span>';
    if (!sub) {
      return (
        '<span class="ref-cat-stack"><span class="ref-cat-pill ref-cat-pill--line">' +
        escapeHtml(cat) +
        '</span></span>'
      );
    }
    return (
      '<span class="ref-cat-stack">' +
      '<span class="ref-cat-pill ref-cat-pill--line">' +
      escapeHtml(cat) +
      '</span>' +
      '<span class="ref-cat-sep" aria-hidden="true">/</span>' +
      '<span class="ref-cat-pill ref-cat-pill--part">' +
      escapeHtml(sub) +
      '</span>' +
      '</span>'
    );
  }
  /** Pestaña y API de cotizaciones: admin/operador siempre; usuario solo si está vinculado a Personal como vendedor. */
  function canAccessCotizaciones() {
    if (!serverConfig.authRequired) return true;
    const u = getSessionUser();
    if (!u) return false;
    const r = normalizeRole(u.role);
    if (r === 'admin' || r === 'operador') return true;
    return !!(u.canCotizar);
  }
  async function refreshSessionUser() {
    if (!serverConfig.authRequired || !getAuthToken()) return;
    try {
      const r = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + getAuthToken() } });
      const j = await r.json();
      if (r.ok && j.user) setAuthSession(getAuthToken(), j.user);
    } catch (_) {}
  }
  function updateCotizacionesTabVisibility() {
    const tab = qs('#tab-cotizaciones');
    if (tab) tab.classList.toggle('hidden', !canAccessCotizaciones());
  }
  function updateCommissionsUiVisibility() {
    document.documentElement.classList.toggle('hide-commissions', !canViewCommissions());
  }
  async function fetchServerConfig() {
    try {
      const r = await fetch('/api/config');
      const j = await r.json();
      serverConfig = Object.assign({}, typeof window.__APP_CONFIG__ === 'object' ? window.__APP_CONFIG__ : {}, j);
    } catch (_) {
      serverConfig = Object.assign({}, typeof window.__APP_CONFIG__ === 'object' ? window.__APP_CONFIG__ : {});
    }
  }
  function applyBranding() {
    const c = serverConfig;
    const nameEl = qs('#app-title-name');
    const short = c.shortName || c.appName || 'Servicio Técnico';
    if (nameEl) nameEl.textContent = short;
    // Login panel branding
    const lbName = qs('#login-brand-name');
    const lbTagline = qs('#login-brand-tagline');
    if (lbName) lbName.textContent = c.appName || short;
    if (lbTagline) lbTagline.textContent = c.tagline || '';
    updateDocumentTitleFromActiveTab();
    const logo = qs('#header-brand-logo');
    if (logo) {
      logo.classList.add('header-logo', 'header-logo--brand');
      if (c.logoUrl) {
        logo.src = c.logoUrl;
        logo.removeAttribute('aria-hidden');
        logo.alt = short;
      } else {
        logo.src = 'fondos/universal-logo.jpg?v=4';
        logo.alt = 'Universal';
      }
    }
    const desc = document.querySelector('meta[name="description"]');
    if (desc && c.tagline) desc.setAttribute('content', c.tagline);
    const acercaName = qs('#acerca-app-name');
    const acercaDesc = qs('#acerca-app-desc');
    if (acercaName) acercaName.textContent = c.appName || short;
    if (acercaDesc) acercaDesc.textContent = c.tagline || acercaDesc.textContent;
    document.documentElement.style.setProperty('--config-primary', c.primaryHex || '#1e3a5f');
    document.documentElement.style.setProperty('--config-accent', c.accentHex || '#0d9488');
  }

  function updateHeaderSystemStatus() {
    const el = qs('#header-system-status');
    if (!el) return;
    const bits = [];
    bits.push('Modo: ' + systemStatusState.mode);
    bits.push('Persistencia: ' + systemStatusState.persistence);
    bits.push('Registros: ' + systemStatusState.registros);
    if (systemStatusState.updatedAt) bits.push('Actualizado: ' + systemStatusState.updatedAt);
    el.textContent = bits.join(' · ');
  }

  function getNotificationsFiltered() {
    const from = notificationsDateFrom ? new Date(notificationsDateFrom + 'T00:00:00').getTime() : null;
    const to = notificationsDateTo ? new Date(notificationsDateTo + 'T23:59:59').getTime() : null;
    return notificationsFeed.filter(function (n) {
      const ts = Number(n.ts || 0);
      if (!ts) return !from && !to;
      if (from && ts < from) return false;
      if (to && ts > to) return false;
      return true;
    });
  }

  function renderNotificationsPanel() {
    const list = qs('#notifications-list');
    if (!list) return;
    const rows = getNotificationsFiltered();
    if (!rows.length) {
      list.innerHTML = '<div class="notification-item">Sin notificaciones recientes.</div>';
      return;
    }
    list.innerHTML = rows.map(function (n) {
      const level = n.level === 'error' ? 'error' : (n.level === 'success' ? 'success' : 'info');
      return `<div class="notification-item level-${level}">${escapeHtml(n.text)}<span class="meta">${escapeHtml(n.meta)}</span></div>`;
    }).join('');
  }

  function updateNotificationsBadge() {
    const badge = qs('#notifications-badge');
    if (!badge) return;
    if (!notificationsUnread) {
      badge.classList.add('hidden');
      badge.textContent = '0';
      return;
    }
    badge.classList.remove('hidden');
    badge.textContent = notificationsUnread > 99 ? '99+' : String(notificationsUnread);
  }

  function markNotificationsRead() {
    notificationsUnread = 0;
    updateNotificationsBadge();
  }

  function pushNotification(text, meta, level) {
    notificationsFeed.unshift({
      text: String(text || ''),
      meta: meta || new Date().toLocaleString('es-MX'),
      level: level || 'info',
      ts: Date.now(),
    });
    while (notificationsFeed.length > 40) notificationsFeed.pop();
    renderNotificationsPanel();
    const panel = qs('#notifications-panel');
    const panelOpen = !!(panel && !panel.classList.contains('hidden'));
    if (!panelOpen) notificationsUnread += 1;
    updateNotificationsBadge();
  }

  function exportNotificationsCsv() {
    const filtered = getNotificationsFiltered();
    if (!filtered.length) { showToast('No hay notificaciones para exportar.', 'error'); return; }
    const rows = [['fecha_meta', 'nivel', 'mensaje']].concat(
      filtered.map(n => [n.meta || '', n.level || 'info', n.text || ''])
    );
    const csv = rows.map(r => r.map(function (v) {
      const s = String(v == null ? '' : v);
      if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'notificaciones-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function exportNotificationsPdf() {
    const filtered = getNotificationsFiltered();
    if (!filtered.length) { showToast('No hay notificaciones para exportar.', 'error'); return; }
    const title = 'Centro de notificaciones';
    const rows = filtered.map(n => `
      <tr>
        <td>${escapeHtml(n.meta || '')}</td>
        <td>${escapeHtml((n.level || 'info').toUpperCase())}</td>
        <td>${escapeHtml(n.text || '')}</td>
      </tr>
    `).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
      <style>body{font-family:Arial,sans-serif;margin:18px;color:#0f172a}h1{font-size:20px;margin:0 0 8px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #e2e8f0;padding:7px;font-size:12px;text-align:left}th{background:#f8fafc}</style>
      </head><body><h1>${title}</h1><p>Generado: ${new Date().toLocaleString('es-MX')}</p><table><thead><tr><th>Fecha</th><th>Nivel</th><th>Mensaje</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { showToast('Permite pop-ups para exportar PDF.', 'error'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(function () { try { w.print(); } catch (_) {} }, 250);
  }

  async function loadRecentAuditNotifications() {
    try {
      const user = getSessionUser();
      if (!serverConfig.auditUi || !user || user.role !== 'admin') return;
      const rows = await fetchJson(API + '/audit?limit=8');
      (rows || []).slice(0, 5).forEach(function (r) {
        const actor = r.user_name || r.user_username || 'usuario';
        pushNotification((r.action || 'evento') + ' en ' + (r.entity || 'sistema') + ' por ' + actor, 'Auditoría · ' + fmtDateTimeIso(r.created_at), 'info');
      });
    } catch (_) {}
  }

  function rebuildClientCityMaps() {
    Object.keys(clienteCityById).forEach(k => delete clienteCityById[k]);
    Object.keys(clienteCityByName).forEach(k => delete clienteCityByName[k]);
    (clientesCache || []).forEach(function (c) {
      const city = String(c && c.ciudad || '').trim();
      if (!city) return;
      if (c && c.id != null) clienteCityById[String(c.id)] = city;
      const n = String(c && c.nombre || '').trim().toLowerCase();
      if (n) clienteCityByName[n] = city;
    });
  }

  function updateGlobalBranchOptions() {
    const sel = qs('#global-branch-filter');
    if (!sel) return;
    const cities = Array.from(new Set((clientesCache || []).map(c => String(c && c.ciudad || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'));
    const current = globalBranchFilter;
    sel.innerHTML = '<option value="">Todas las sucursales</option>' + cities.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    sel.value = cities.includes(current) ? current : '';
    globalBranchFilter = sel.value || '';
  }

  function rowCity(row) {
    if (!row || !globalBranchFilter) return '';
    if (row.ciudad) return String(row.ciudad || '').trim();
    if (row.cliente_id != null && clienteCityById[String(row.cliente_id)]) return clienteCityById[String(row.cliente_id)];
    if (row.cliente_nombre) {
      const k = String(row.cliente_nombre).trim().toLowerCase();
      return clienteCityByName[k] || '';
    }
    return '';
  }

  function applyGlobalBranchFilterRows(rows) {
    if (!globalBranchFilter) return rows;
    return (rows || []).filter(r => rowCity(r) === globalBranchFilter);
  }
  function showToast(message, type) {
    type = type === 'error' ? 'error' : 'success';
    if (type === 'success' && isSoundEnabled()) playSuccessChime();
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
    pushNotification(message, (type === 'error' ? 'Error' : 'Éxito') + ' · ' + new Date().toLocaleString('es-MX'), type);
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
      if (o && o.error) {
        if (Array.isArray(o.errores) && o.errores.length) {
          return o.error + '\n' + o.errores.join('\n');
        }
        return o.error;
      }
    } catch (_) {}
    if (/UNIQUE constraint failed:\s*refacciones\.codigo/i.test(msg)) {
      return 'Ya existe una refacción con ese código. Usa otro código o edita la existente.';
    }
    return msg;
  }

  const LAST_TAB_KEY = 'cotizacion-last-tab';
  const VALID_TABS = ['dashboards', 'clientes', 'refacciones', 'maquinas', 'almacen', 'cotizaciones', 'reportes', 'garantias', 'mantenimiento-garantia', 'garantias-sin-cobertura', 'bonos', 'viajes', 'bitacoras', 'prospeccion'];
  const TABS_PERSIST = VALID_TABS.concat(['auditoria', 'usuarios', 'categorias-catalogo']);
  let reportesCache = [];
  let garantiasCache = [];
  let mantenimientosGarantiaCache = [];
  let garantiasSinCoberturaCache = [];
  let bonosCache = [];
  let viajesCache = [];
  let tecnicosCache = [];
  let appUsersDeletedCache = [];
  let lastQuickRefreshAt = 0;
  function prefersReducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (_) {
      return false;
    }
  }
  function spawnLoginParticles() {
    const overlay = qs('#login-overlay');
    if (!overlay || overlay._particlesSpawned) return;
    if (prefersReducedMotion()) {
      overlay._particlesSpawned = true;
      return;
    }
    overlay._particlesSpawned = true;
    const colors = [
      'rgba(45,212,191,0.92)', 'rgba(56,189,248,0.9)', 'rgba(167,139,250,0.88)',
      'rgba(251,191,36,0.9)', 'rgba(244,114,182,0.85)', 'rgba(52,211,153,0.9)',
      'rgba(255,255,255,0.78)', 'rgba(94,234,212,0.88)', 'rgba(129,140,248,0.86)',
      'rgba(253,224,71,0.82)',
    ];
    const industrial = document.body && document.body.classList.contains('theme-industrial');
    const count = industrial ? 52 : 32;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('span');
      p.className = 'login-particle';
      const size = (Math.random() * (industrial ? 9 : 7) + (industrial ? 5 : 4)).toFixed(1) + 'px';
      const left = (Math.random() * 100).toFixed(1) + '%';
      const dur = (Math.random() * 10 + 7).toFixed(1) + 's';
      const delay = (Math.random() * 10).toFixed(1) + 's';
      const px = ((Math.random() - 0.5) * 80).toFixed(1) + 'px';
      const color = colors[Math.floor(Math.random() * colors.length)];
      p.style.cssText = `--size:${size};--lft:${left};--dur:${dur};--delay:${delay};--px:${px};--color:${color}`;
      overlay.appendChild(p);
    }
  }

  /** Misma animación de “burbujas” que el login, detrás del tablero (tema metal). */
  function spawnAppParticles() {
    const layer = qs('#app-particles-layer');
    if (!layer || layer._particlesSpawned) return;
    if (prefersReducedMotion()) {
      layer._particlesSpawned = true;
      return;
    }
    layer._particlesSpawned = true;
    const colors = [
      'rgba(45,212,191,0.88)', 'rgba(56,189,248,0.85)', 'rgba(167,139,250,0.82)',
      'rgba(251,191,36,0.82)', 'rgba(244,114,182,0.78)', 'rgba(52,211,153,0.86)',
      'rgba(255,255,255,0.72)', 'rgba(129,140,248,0.8)', 'rgba(253,224,71,0.75)',
      'rgba(34,211,238,0.84)',
    ];
    const count = 30;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('span');
      p.className = 'app-particle';
      const size = (Math.random() * 6 + 4).toFixed(1) + 'px';
      const left = (Math.random() * 100).toFixed(1) + '%';
      const dur = (Math.random() * 10 + 8).toFixed(1) + 's';
      const delay = (Math.random() * 12).toFixed(1) + 's';
      const px = ((Math.random() - 0.5) * 90).toFixed(1) + 'px';
      const color = colors[Math.floor(Math.random() * colors.length)];
      p.style.cssText = '--size:' + size + ';--lft:' + left + ';--dur:' + dur + ';--delay:' + delay + ';--px:' + px + ';--color:' + color;
      layer.appendChild(p);
    }
  }

  function showLoginOverlay(show) {
    const el = qs('#login-overlay');
    if (!el) return;
    el.classList.toggle('hidden', !show);
    document.body.classList.toggle('login-open', !!show);
    if (show) spawnLoginParticles();
  }
  function updateAuditTabVisibility() {
    const tab = qs('#tab-auditoria');
    const tabUsers = qs('#tab-usuarios');
    const tabCat = qs('#tab-categorias-catalogo');
    const u = getSessionUser();
    const showAudit = !!(serverConfig.auditUi && u && u.role === 'admin');
    if (tab) tab.classList.toggle('hidden', !showAudit);
    const showUsers = !!(serverConfig.authRequired && u && u.role === 'admin');
    if (tabUsers) tabUsers.classList.toggle('hidden', !showUsers);
    const showCatAdmin = !!(serverConfig.authRequired && u && u.role === 'admin');
    if (tabCat) tabCat.classList.toggle('hidden', !showCatAdmin);
    const tabDemo = qs('#tab-demo');
    const showDemoTab = canAccessDemoAdminPanel();
    if (tabDemo) tabDemo.classList.toggle('hidden', !showDemoTab);
    const goBackups = qs('#dashboard-go-backups');
    if (goBackups) goBackups.classList.toggle('hidden', !showDemoTab);
    if (!showDemoTab) {
      const activeTab = document.querySelector('.tab.active');
      const at = activeTab && activeTab.dataset && activeTab.dataset.tab;
      if (at === 'demo') showPanel('dashboards');
    }
    if (serverConfig.authRequired && u && u.role !== 'admin') {
      const activeTab = document.querySelector('.tab.active');
      const at = activeTab && activeTab.dataset && activeTab.dataset.tab;
      if (at === 'usuarios' || at === 'categorias-catalogo') showPanel('dashboards');
    }
    const showAdminModules = canAccessAdminOnlyModules();
    ['tab-prospeccion', 'tab-tarifas', 'tab-tecnicos'].forEach(function (tid) {
      const t = qs('#' + tid);
      if (t) t.classList.toggle('hidden', !showAdminModules);
    });
    if (!showAdminModules) {
      const activeTab = document.querySelector('.tab.active');
      const at = activeTab && activeTab.dataset && activeTab.dataset.tab;
      if (at === 'prospeccion' || at === 'tarifas' || at === 'tecnicos') {
        showPanel('dashboards');
      }
    }
    updateCotizacionesTabVisibility();
    updateCommissionsUiVisibility();
    syncAdminHubCardVisibility();
  }
  function syncAdminHubCardVisibility() {
    const u = getSessionUser();
    const showUsers = !!(serverConfig.authRequired && u && normalizeRole(u.role) === 'admin');
    const showAudit = !!(serverConfig.auditUi && u && normalizeRole(u.role) === 'admin');
    const showCat = !!(serverConfig.authRequired && u && normalizeRole(u.role) === 'admin');
    const showComm = canViewCommissions();
    const showAdminMod = canAccessAdminOnlyModules();
    const showDemo = canAccessDemoAdminPanel();
    const map = [
      ['admin-hub-card-usuarios', showUsers],
      ['admin-hub-card-auditoria', showAudit],
      ['admin-hub-card-categorias', showCat],
      ['admin-hub-card-bonos', showComm],
      ['admin-hub-card-viajes', showComm],
      ['admin-hub-card-prospeccion', showAdminMod],
      ['admin-hub-card-tarifas', showAdminMod],
      ['admin-hub-card-tecnicos', showAdminMod],
      ['admin-hub-card-demo', showDemo],
    ];
    let n = 0;
    map.forEach(function ([id, ok]) {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('hidden', !ok);
      if (ok) n += 1;
    });
    const mas = qs('#profile-menu-mas');
    if (mas) mas.classList.toggle('hidden', n === 0);
  }
  function closeHeaderProfileMenu() {
    const m = qs('#header-profile-menu');
    const b = qs('#btn-header-profile');
    if (m) m.classList.add('hidden');
    if (b) b.setAttribute('aria-expanded', 'false');
  }
  function toggleHeaderProfileMenu() {
    const m = qs('#header-profile-menu');
    const b = qs('#btn-header-profile');
    if (!m || !b) return;
    const open = m.classList.contains('hidden');
    if (open) {
      m.classList.remove('hidden');
      b.setAttribute('aria-expanded', 'true');
    } else {
      closeHeaderProfileMenu();
    }
  }
  function closeAdminHubOverlay() {
    const h = qs('#admin-hub-overlay');
    if (h) h.classList.add('hidden');
    document.body.classList.remove('admin-hub-open');
  }
  function openAdminHubOverlay() {
    syncAdminHubCardVisibility();
    const h = qs('#admin-hub-overlay');
    if (h) h.classList.remove('hidden');
    document.body.classList.add('admin-hub-open');
  }
  function wireHeaderProfileAndAdminHub() {
    const btnProf = qs('#btn-header-profile');
    const wrap = qs('#header-profile-wrap');
    if (btnProf && wrap) {
      btnProf.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleHeaderProfileMenu();
      });
    }
    const mas = qs('#profile-menu-mas');
    if (mas) {
      mas.addEventListener('click', function () {
        closeHeaderProfileMenu();
        openAdminHubOverlay();
      });
    }
    const pLogout = qs('#profile-menu-logout');
    if (pLogout) {
      pLogout.addEventListener('click', function () {
        closeHeaderProfileMenu();
        const legacy = qs('#btn-logout');
        if (legacy) legacy.click();
      });
    }
    document.addEventListener(
      'click',
      function (e) {
        const w = qs('#header-profile-wrap');
        if (!w || w.classList.contains('hidden')) return;
        if (w.contains(e.target)) return;
        closeHeaderProfileMenu();
      },
      true
    );
    const hub = qs('#admin-hub-overlay');
    const hubClose = qs('#admin-hub-close');
    const hubPanel = qs('#admin-hub-panel');
    if (hub) {
      hub.addEventListener('click', function (e) {
        if (e.target === hub) closeAdminHubOverlay();
      });
    }
    if (hubClose) hubClose.addEventListener('click', closeAdminHubOverlay);
    if (hubPanel) {
      hubPanel.addEventListener('click', function (e) {
        const card = e.target && e.target.closest && e.target.closest('[data-hub-tab]');
        if (!card || !hubPanel.contains(card)) return;
        const tab = card.getAttribute('data-hub-tab');
        if (!tab) return;
        closeAdminHubOverlay();
        showPanel(tab, { skipLoad: false });
      });
    }
  }
  function syncSessionHeader() {
    const wrap = qs('#header-session');
    const label = qs('#header-session-user');
    const out = qs('#btn-logout');
    const profileWrap = qs('#header-profile-wrap');
    const pname = qs('#header-profile-name');
    const prole = qs('#header-profile-role');
    if (!wrap || !label) return;
    const u = getSessionUser();
    if (u) {
      wrap.classList.add('hidden');
      if (out) out.classList.add('hidden');
      if (profileWrap) {
        profileWrap.classList.remove('hidden');
        const roleLabel = getRoleLabel(u.role);
        const fullLine = profileMenuSecondaryName(u);
        const uname = String((u.username || '') || '').trim();
        if (pname) pname.textContent = fullLine || uname || 'Usuario';
        if (prole) prole.textContent = roleLabel;
        const pmDisp = qs('#profile-menu-display');
        const pmFull = qs('#profile-menu-fullname');
        if (pmDisp) pmDisp.textContent = roleLabel;
        if (pmFull) pmFull.textContent = fullLine;
      }
    } else {
      wrap.classList.add('hidden');
      if (out) out.classList.add('hidden');
      if (profileWrap) profileWrap.classList.add('hidden');
      closeHeaderProfileMenu();
    }
    syncAdminHubCardVisibility();
    syncModuleDeleteZonesVisibility();
  }
  function setupLoginForm() {
    const form = qs('#login-form');
    const err = qs('#login-error');
    if (!form || form._bound) return;
    form._bound = true;
    // Ojo: mostrar/ocultar contraseña
    const eyeBtn = qs('#login-eye-btn');
    const eyeIcon = qs('#login-eye-icon');
    const passInput = qs('#login-pass');
    if (eyeBtn && passInput && eyeIcon) {
      eyeBtn.addEventListener('click', function () {
        const isText = passInput.type === 'text';
        passInput.type = isText ? 'password' : 'text';
        eyeIcon.className = isText ? 'fas fa-eye' : 'fas fa-eye-slash';
      });
    }
    const submitBtn = qs('#login-submit-btn');
    const submitText = submitBtn && submitBtn.querySelector('.login-submit-text');
    const submitLoading = submitBtn && submitBtn.querySelector('.login-submit-loading');
    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      if (err) { err.classList.add('hidden'); }
      const u = qs('#login-user');
      const p = qs('#login-pass');
      // Loading state
      if (submitBtn) submitBtn.disabled = true;
      if (submitText) submitText.classList.add('hidden');
      if (submitLoading) submitLoading.classList.remove('hidden');
      try {
        const r = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: (u && u.value) || '', password: (p && p.value) || '' }),
        });
        const text = await r.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (_) {}
        if (!r.ok) {
          if (err) {
            const errText = qs('#login-error-text');
            if (errText) errText.textContent = data.error || 'Usuario o contraseña incorrectos';
            else err.textContent = data.error || 'Usuario o contraseña incorrectos';
            err.classList.remove('hidden');
          }
          return;
        }
        setAuthSession(data.token, data.user);
        showLoginOverlay(false);
        applyBranding();
        updateAuditTabVisibility();
        updateCotizacionesTabVisibility();
        syncSessionHeader();
        if (p) p.value = '';
        finishBoot();
      } catch (e) {
        if (err) {
          const errText = qs('#login-error-text');
          if (errText) errText.textContent = 'No se pudo conectar. Revisa la red o el servidor.';
          else err.textContent = 'No se pudo conectar. Revisa la red o el servidor.';
          err.classList.remove('hidden');
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (submitText) submitText.classList.remove('hidden');
        if (submitLoading) submitLoading.classList.add('hidden');
      }
    });
  }
  let syncThemeToggleButtonUi = function () {};
  function initThemeToggleButton() {
    const btn = qs('#btn-theme-toggle');
    if (!btn || btn._bound) return;
    btn._bound = true;
    function refresh() {
      const isLight = document.body.classList.contains('appearance-light');
      btn.setAttribute('aria-pressed', isLight ? 'true' : 'false');
      btn.title = isLight ? 'Tema oscuro (luna)' : 'Tema claro (sol)';
      btn.setAttribute('aria-label', isLight ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro');
      const i = btn.querySelector('i');
      if (i) {
        i.className = 'fas ' + (isLight ? 'fa-moon' : 'fa-sun');
      }
    }
    syncThemeToggleButtonUi = refresh;
    refresh();
    btn.addEventListener('click', function () {
      const next = document.body.classList.contains('appearance-light') ? 'dark' : 'light';
      setTheme(next);
    });
  }
  /** Título de la pestaña del navegador según la sección activa */
  function updateDocumentTitle(panelId) {
    const base = serverConfig.shortName || serverConfig.appName || 'Servicio Técnico';
    const map = {
      dashboards: 'Dashboard',
      clientes: 'Clientes',
      refacciones: 'Refacciones',
      maquinas: 'Máquinas',
      almacen: 'Almacén',
      'revision-maquinas': 'Revisión máquinas',
      cotizaciones: 'Cotizaciones',
      reportes: 'Reportes',
      garantias: 'Garantías',
      'mantenimiento-garantia': 'Mantenimientos por garantía',
      'garantias-sin-cobertura': 'Sin cobertura',
      bonos: 'Bonos',
      viajes: 'Viajes',
      ventas: 'Ventas',
      prospeccion: 'Prospección',
      tarifas: 'Tarifas',
      tecnicos: 'Personal',
      bitacoras: 'Bitácora de horas',
      demo: 'Cargar demo',
      acerca: 'Acerca de',
      auditoria: 'Auditoría',
      usuarios: 'Usuarios',
      'categorias-catalogo': 'Categorías',
    };
    const section = map[panelId] || 'Inicio';
    document.title = section + ' · ' + base;
  }
  function updateDocumentTitleFromActiveTab() {
    const tab = document.querySelector('.tab.active');
    updateDocumentTitle(tab && tab.dataset.tab ? tab.dataset.tab : 'dashboards');
  }

  function showPanel(id, opts) {
    const skipLoad = opts && opts.skipLoad === true;
    if (serverConfig.authRequired && !getAuthToken() && id !== 'acerca') {
      showLoginOverlay(true);
      setupLoginForm();
      return;
    }
    if (id === 'auditoria') {
      const u = getSessionUser();
      if (!serverConfig.auditUi || !u || u.role !== 'admin') {
        showToast('Solo el administrador puede ver la auditoría.', 'error');
        return;
      }
    }
    if (id === 'usuarios') {
      const u = getSessionUser();
      if (!serverConfig.authRequired || !u || u.role !== 'admin') {
        showToast('Solo el administrador puede gestionar usuarios.', 'error');
        return;
      }
    }
    if (id === 'categorias-catalogo') {
      const u = getSessionUser();
      if (!serverConfig.authRequired || !u || u.role !== 'admin') {
        showToast('Solo el administrador puede gestionar categorías y subcategorías.', 'error');
        return;
      }
    }
    if (id === 'demo' && !canAccessDemoAdminPanel()) {
      showToast('Solo el administrador puede acceder a Cargar demo, respaldos y acciones masivas.', 'error');
      return;
    }
    if ((id === 'bonos' || id === 'viajes') && !canViewCommissions()) {
      showToast('Solo el administrador puede ver bonos, viajes y comisiones.', 'error');
      return;
    }
    if ((id === 'prospeccion' || id === 'tarifas' || id === 'tecnicos') && !canAccessAdminOnlyModules()) {
      showToast('Solo el administrador puede acceder a esta sección.', 'error');
      return;
    }
    if (id === 'cotizaciones' && !canAccessCotizaciones()) {
      showToast('No tienes acceso a cotizaciones. Un administrador debe vincular tu cuenta a Personal marcado como vendedor, o asignarte rol operador/administrador.', 'error');
      return;
    }
    qsAll('.panel').forEach(p => p.classList.remove('active'));
    qsAll('.tab').forEach(t => t.classList.remove('active'));
    const panel = document.getElementById('panel-' + id);
    const tab = document.querySelector('.tab[data-tab="' + id + '"]');
    if (panel) {
      // Force animation replay by removing and re-adding the class
      panel.classList.remove('active');
      void panel.offsetWidth; // reflow
      panel.classList.add('active');
    }
    if (tab) {
      tab.classList.add('active');
      requestAnimationFrame(() => {
        try {
          const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          tab.scrollIntoView({
            inline: 'center',
            block: 'nearest',
            behavior: reduceMotion ? 'auto' : 'smooth',
          });
        } catch (_) {
          try {
            tab.scrollIntoView(false);
          } catch (_) {}
        }
      });
    }
    if (TABS_PERSIST.indexOf(id) >= 0) try { localStorage.setItem(LAST_TAB_KEY, id); } catch (_) {}
    updateDocumentTitle(id);
    if (skipLoad) return;
    if (id === 'dashboards') loadDashboard();
    if (id === 'clientes') loadClientes();
    if (id === 'refacciones') loadRefacciones();
    if (id === 'maquinas') loadMaquinas();
    if (id === 'cotizaciones') loadCotizaciones();
    if (id === 'reportes') loadReportes();
    if (id === 'garantias') loadGarantias();
    if (id === 'mantenimiento-garantia') loadMantenimientoGarantia();
    if (id === 'garantias-sin-cobertura') loadGarantiasSinCobertura();
    if (id === 'bonos') loadBonos();
    if (id === 'viajes') loadViajes();
    if (id === 'bitacoras') loadBitacoras();
    if (id === 'demo') {
      loadSeedStatus();
      {
        const du = getSessionUser();
        if (!serverConfig.authRequired || normalizeRole(du && du.role) === 'admin') loadBackupFilesList();
      }
    }
    if (id === 'acerca') { /* solo mostrar panel */ }
    if (id === 'auditoria') loadAuditLog();
    if (id === 'usuarios') loadAppUsers();
    if (id === 'categorias-catalogo') loadCategoriasAdminPanel();
    if (id === 'ventas') loadVentas();
    if (id === 'prospeccion') loadProspeccion();
    if (id === 'revision-maquinas') loadRevisionMaquinas();
    if (id === 'almacen') loadAlmacen();
    if (id === 'tarifas') loadTarifas();
    if (id === 'tecnicos') loadTecnicos();
  }

  qsAll('.tab').forEach(t => {
    t.addEventListener('click', () => showPanel(t.dataset.tab));
  });

  function isSidebarRailCollapsedStored() {
    try {
      return localStorage.getItem(SIDEBAR_RAIL_COLLAPSED_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function applySidebarRailCollapsed(collapsed) {
    document.body.classList.toggle('sidebar-rail-collapsed', collapsed);
    const btn = qs('#btn-sidebar-rail-toggle');
    if (btn) {
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      btn.title = collapsed
        ? 'Mostrar lista de módulos'
        : 'Ocultar lista de módulos (más espacio para el contenido)';
    }
    try {
      localStorage.setItem(SIDEBAR_RAIL_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch (_) {}
  }

  (function initSidebarRailToggle() {
    const btn = qs('#btn-sidebar-rail-toggle');
    if (!btn) return;
    applySidebarRailCollapsed(isSidebarRailCollapsedStored());
    btn.addEventListener('click', function () {
      applySidebarRailCollapsed(!document.body.classList.contains('sidebar-rail-collapsed'));
    });
  })();

  async function fetchJson(url, opts = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const tok = getAuthToken();
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    const r = await fetch(url, Object.assign({}, opts, { headers }));
    const text = await r.text();
    if (r.status === 401 && serverConfig.authRequired) {
      clearAuthSession();
      updateAuditTabVisibility();
      updateCommissionsUiVisibility();
      syncSessionHeader();
      showLoginOverlay(true);
    }
    if (!r.ok) throw new Error(text || r.statusText);
    if (!text || !String(text).trim()) return {};
    try { return JSON.parse(text); } catch (_) { throw new Error(text); }
  }

  /** Siempre devuelve un array para listas del API (evita undefined/objeto). */
  function toArray(x) {
    if (Array.isArray(x)) return x;
    if (x && typeof x === 'object' && Array.isArray(x.data)) return x.data;
    if (x && typeof x === 'object' && Array.isArray(x.rows)) return x.rows;
    return [];
  }

  /** Clave estable para comparar nombres de técnico (coma, espacios, tildes). */
  function nombreTecnicoKey(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/,/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function isSameTecnicoNombre(a, b) {
    const ka = nombreTecnicoKey(a);
    const kb = nombreTecnicoKey(b);
    return ka && kb && ka === kb;
  }

  /** Comisiones especiales David Cantú: 15% refacciones con cliente David; 15% máquina vendida por David (solo admin UI). */
  const DAVID_CANTU_COMISION_PCT = 15;
  let davidComisionesRowsCache = [];

  function isDavidVendedorCot(v) {
    if (!v) return false;
    if (isSameTecnicoNombre(v.vendedor, 'David Cantu')) return true;
    const vid = v.vendedor_personal_id;
    if (vid == null || vid === '') return false;
    const t = (tecnicosCache || []).find(function (x) { return String(x.id) === String(vid); });
    return !!(t && isSameTecnicoNombre(t.nombre, 'David Cantu'));
  }

  function computeDavidCantuComisionRows(ventas) {
    const rows = [];
    for (const v of toArray(ventas)) {
      const tipo = String(v.tipo || '').toLowerCase();
      const total = Number(v.total) || 0;
      const cliente = v.cliente_nombre || '';
      const pct = DAVID_CANTU_COMISION_PCT;
      const monto = Math.round(total * pct * 100) / 10000;
      if (tipo === 'refacciones' && isSameTecnicoNombre(cliente, 'David Cantu')) {
        rows.push({
          folio: v.folio,
          fecha: String(v.fecha_aprobacion || v.fecha || '').slice(0, 10),
          regla: 'refacciones_a_david',
          concepto: 'Refacciones · cliente David Cantú',
          detalle: '15% sobre el total de la venta por venta de refacciones a David Cantú.',
          base: total,
          pct: pct,
          monto: monto,
          moneda: (v.moneda || 'USD').toUpperCase(),
          vendedor: v.vendedor || '—',
        });
        continue;
      }
      if (tipo === 'maquina' && isDavidVendedorCot(v)) {
        rows.push({
          folio: v.folio,
          fecha: String(v.fecha_aprobacion || v.fecha || '').slice(0, 10),
          regla: 'maquina_vende_david',
          concepto: 'Equipo / máquina · vende David Cantú',
          detalle: '15% sobre el total cuando David Cantú vende máquina.',
          base: total,
          pct: pct,
          monto: monto,
          moneda: (v.moneda || 'USD').toUpperCase(),
          vendedor: v.vendedor || '—',
        });
      }
    }
    return rows;
  }

  function fmtCotizacionMontoMoneda(v, amount) {
    const mon = (v.moneda || 'USD').toUpperCase();
    const n = Number(amount) || 0;
    if (mon === 'USD') return 'US$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async function refreshDavidComisionesCotPanel() {
    const wrap = qs('#cotizaciones-comisiones-david-wrap');
    const bodyEl = qs('#cotizaciones-comisiones-david-body');
    const totalEl = qs('#cotizaciones-comisiones-david-total');
    if (!wrap || !bodyEl) return;
    if (!canViewCommissions()) {
      wrap.classList.add('hidden');
      davidComisionesRowsCache = [];
      return;
    }
    try {
      if (!tecnicosCache || !tecnicosCache.length) {
        try {
          tecnicosCache = toArray(await fetchJson(API + '/tecnicos'));
        } catch (_) {}
      }
      const ventas = toArray(await fetchJson(API + '/ventas'));
      if (!ventas.length) {
        wrap.classList.add('hidden');
        davidComisionesRowsCache = [];
        return;
      }
      wrap.classList.remove('hidden');
      const rows = computeDavidCantuComisionRows(ventas);
      davidComisionesRowsCache = rows.slice();
      if (!rows.length) {
        bodyEl.innerHTML =
          '<p class="david-comisiones-empty"><i class="fas fa-info-circle"></i> Aún no hay ventas que apliquen: refacciones con <strong>cliente</strong> David Cantú, o <strong>máquina</strong> con vendedor David Cantú.</p>';
        if (totalEl) {
          totalEl.hidden = true;
          totalEl.innerHTML = '';
        }
        return;
      }
      let sumMxn = 0;
      let sumUsd = 0;
      const trs = rows
        .map(function (r) {
          const fakeV = { moneda: r.moneda };
          if (r.moneda === 'USD') sumUsd += r.monto;
          else sumMxn += r.monto;
          return `<tr>
            <td>${escapeHtml(String(r.folio || ''))}</td>
            <td>${escapeHtml(r.fecha)}</td>
            <td><span class="david-comisiones-badge">${escapeHtml(r.concepto)}</span></td>
            <td class="td-text-wrap">${escapeHtml(r.detalle)}</td>
            <td>${escapeHtml(String(r.vendedor))}</td>
            <td class="num">${fmtCotizacionMontoMoneda(fakeV, r.base)}</td>
            <td class="num david-comisiones-pct">${r.pct}%</td>
            <td class="num david-comisiones-monto">${fmtCotizacionMontoMoneda(fakeV, r.monto)}</td>
          </tr>`;
        })
        .join('');
      bodyEl.innerHTML =
        '<table class="data-table david-comisiones-table"><thead><tr>' +
        '<th>Folio</th><th>Fecha</th><th>Concepto</th><th>Detalle</th><th>Vendedor</th><th class="num">Base (total)</th><th class="num">%</th><th class="num">Comisión</th>' +
        '</tr></thead><tbody>' +
        trs +
        '</tbody></table>';
      if (totalEl) {
        const parts = [];
        if (sumMxn > 0) parts.push('<strong>Total MXN:</strong> ' + formatMoney(sumMxn));
        if (sumUsd > 0) parts.push('<strong>Total USD:</strong> US$' + sumUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        totalEl.innerHTML = '<div class="david-comisiones-total-inner">' + parts.join(' &nbsp;·&nbsp; ') + '</div>';
        totalEl.hidden = false;
      }
    } catch (_) {
      wrap.classList.add('hidden');
      davidComisionesRowsCache = [];
    }
  }

  /**
   * Una opción por persona en selects: evita "David Cantu" y "David Cantu," duplicados.
   * Prefiere la variante sin coma al final; fusiona flag ocupado (reportes).
   */
  function tecnicosUniqueForSelect(tecnicos) {
    const groups = new Map();
    for (const t of toArray(tecnicos)) {
      if (!t || t.nombre == null) continue;
      const raw = String(t.nombre).replace(/\s+/g, ' ').trim();
      if (!raw) continue;
      const key = nombreTecnicoKey(raw);
      if (!key) continue;
      const ocup = !!(t && t.ocupado);
      const cur = groups.get(key);
      if (!cur) {
        groups.set(key, { raw, ocupado: ocup });
      } else {
        cur.ocupado = !!(cur.ocupado || ocup);
        const pickRaw = (a, b) => {
          const aEnd = /,\s*$/.test(a);
          const bEnd = /,\s*$/.test(b);
          if (aEnd !== bEnd) return aEnd ? b : a;
          return a.length <= b.length ? a : b;
        };
        cur.raw = pickRaw(cur.raw, raw);
      }
    }
    return Array.from(groups.values())
      .map((g) => ({
        nombre: g.raw.replace(/,\s*$/, '').replace(/\s+/g, ' ').trim(),
        ocupado: g.ocupado,
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
  }

  function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  /** URLs largas (p. ej. data:image base64) no caben fiable en atributos HTML; se guardan aquí y el DOM usa data-media-ref corto. */
  const _pvcMediaUrlRegistry = Object.create(null);
  let _pvcMediaUrlSeq = 0;
  function clearPvcMediaUrlRegistry() {
    Object.keys(_pvcMediaUrlRegistry).forEach((k) => { delete _pvcMediaUrlRegistry[k]; });
    _pvcMediaUrlSeq = 0;
  }
  function registerPvcMediaUrl(url) {
    const id = 'pvc' + (++_pvcMediaUrlSeq);
    _pvcMediaUrlRegistry[id] = String(url || '');
    return id;
  }
  function pvcMediaUrlFromBtn(btn) {
    if (!btn) return '';
    const ref = btn.getAttribute('data-media-ref');
    if (ref && Object.prototype.hasOwnProperty.call(_pvcMediaUrlRegistry, ref)) return _pvcMediaUrlRegistry[ref];
    return String(btn.getAttribute('data-url') || '');
  }

  function pvcExtFromMime(mime) {
    const m = String(mime || '').toLowerCase();
    if (m.indexOf('pdf') >= 0) return '.pdf';
    if (m.indexOf('png') >= 0) return '.png';
    if (m.indexOf('jpeg') >= 0 || m.indexOf('jpg') >= 0) return '.jpg';
    if (m.indexOf('webp') >= 0) return '.webp';
    if (m.indexOf('gif') >= 0) return '.gif';
    if (m.indexOf('svg') >= 0) return '.svg';
    return '';
  }
  function pvcExtFromUrlPath(u) {
    try {
      const q = String(u || '').split('?')[0];
      const m = q.match(/(\.[a-z0-9]{2,5})$/i);
      return m ? m[1] : '';
    } catch (_) {
      return '';
    }
  }
  function pvcTriggerBlobDownload(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || 'archivo';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => {
      try { URL.revokeObjectURL(a.href); } catch (_) {}
    }, 2500);
  }
  async function downloadPvcMedia(btn) {
    if (!canDownloadUploadedMedia()) {
      showToast('Solo el administrador puede descargar archivos.', 'error');
      return;
    }
    const url = pvcMediaUrlFromBtn(btn);
    let suggested = String(btn.getAttribute('data-download-name') || '').trim() || 'archivo';
    suggested = suggested.replace(/[^\w.\-\u00C0-\u024f]/g, '_') || 'archivo';
    const u = String(url || '');
    if (!u) {
      showToast('No hay archivo para descargar.', 'error');
      return;
    }
    try {
      if (u.startsWith('/api/') && serverConfig && serverConfig.authRequired) {
        let fetchUrl = u;
        if (/\/clientes\/[^/]+\/constancia/i.test(u) && u.indexOf('download=') < 0) {
          fetchUrl = u + (u.indexOf('?') >= 0 ? '&' : '?') + 'download=1';
        }
        const headers = {};
        const tok = getAuthToken();
        if (tok) headers['Authorization'] = 'Bearer ' + tok;
        const r = await fetch(fetchUrl, { headers });
        if (!r.ok) {
          let msg = 'No autorizado. Inicia sesión.';
          try {
            const j = await r.json();
            if (j && j.error) msg = j.error;
          } catch (_) {}
          throw new Error(msg);
        }
        const blob = await r.blob();
        let fn = suggested;
        if (fn.indexOf('.') < 0) {
          const ex = pvcExtFromMime(blob.type) || pvcExtFromUrlPath(u);
          fn += ex || '.bin';
        }
        pvcTriggerBlobDownload(blob, fn);
        return;
      }
      if (u.startsWith('data:')) {
        const r = await fetch(u);
        const blob = await r.blob();
        let fn = suggested;
        if (fn.indexOf('.') < 0) {
          fn += pvcExtFromMime(blob.type) || '.bin';
        }
        pvcTriggerBlobDownload(blob, fn);
        return;
      }
      if (u.startsWith('blob:')) {
        const r = await fetch(u);
        const blob = await r.blob();
        let fn = suggested;
        if (fn.indexOf('.') < 0) fn += pvcExtFromMime(blob.type) || '.bin';
        pvcTriggerBlobDownload(blob, fn);
        return;
      }
      const r = await fetch(u, { credentials: 'same-origin' });
      if (!r.ok) throw new Error('fetch');
      const blob = await r.blob();
      let fn = suggested;
      if (fn.indexOf('.') < 0) {
        fn += pvcExtFromMime(blob.type) || pvcExtFromUrlPath(u) || '.bin';
      }
      pvcTriggerBlobDownload(blob, fn);
    } catch (_) {
      showToast('No se pudo descargar el archivo.', 'error');
    }
  }

  /** Fallback ultra-robusto: captura clics de medios en todo el documento. */
  (function bindGlobalMediaOpenCapture() {
    document.addEventListener('click', function (e) {
      const t = e && e.target;
      if (!t || !t.closest) return;
      const btn = t.closest('.js-refaccion-open-media');
      if (!btn || btn.disabled) return;
      // Evita interferir con navegación normal fuera de la UI del sistema
      if (!document.body.contains(btn)) return;
      e.preventDefault();
      e.stopPropagation();
      try { e.stopImmediatePropagation(); } catch (_) {}
      const url = pvcMediaUrlFromBtn(btn);
      if (!url) {
        showToast('No se pudo abrir la imagen/archivo. Recarga la página (F5).', 'error');
        return;
      }
      // Si es un endpoint protegido (/api/...), abrir con Authorization (window.open no manda headers).
      if (String(url).startsWith('/api/') && serverConfig && serverConfig.authRequired) {
        const headers = {};
        const tok = getAuthToken();
        if (tok) headers['Authorization'] = 'Bearer ' + tok;
        fetch(url, { headers })
          .then(async (r) => {
            if (!r.ok) {
              let msg = 'No autorizado. Inicia sesión.';
              try {
                const j = await r.json();
                if (j && j.error) msg = j.error;
              } catch (_) {}
              throw new Error(msg);
            }
            const ct = String(r.headers.get('content-type') || '');
            const blob = await r.blob();
            const objUrl = URL.createObjectURL(blob);
            if (/^image\//i.test(ct) || /^image\//i.test(blob.type)) {
              // Abrir directamente el lightbox con blob URL.
              const prev = document.getElementById('ref-img-lightbox');
              if (prev) prev.remove();
              const wrap = document.createElement('div');
              wrap.id = 'ref-img-lightbox';
              wrap.className = 'ref-img-lightbox';
              wrap.setAttribute('role', 'dialog');
              wrap.setAttribute('aria-modal', 'true');
              const inner = document.createElement('div');
              inner.className = 'ref-img-lightbox-inner';
              const imgEl = document.createElement('img');
              imgEl.alt = '';
              imgEl.src = objUrl;
              inner.appendChild(imgEl);
              const closeBtn = document.createElement('button');
              closeBtn.type = 'button';
              closeBtn.className = 'ref-img-lightbox-close';
              closeBtn.setAttribute('aria-label', 'Cerrar');
              closeBtn.innerHTML = '<i class="fas fa-times"></i>';
              wrap.appendChild(closeBtn);
              wrap.appendChild(inner);
              document.body.appendChild(wrap);
              const close = () => {
                wrap.classList.add('ref-img-lightbox--out');
                setTimeout(() => {
                  wrap.remove();
                  document.removeEventListener('keydown', onKey);
                  try { URL.revokeObjectURL(objUrl); } catch (_) {}
                }, 200);
              };
              function onKey(ev) {
                if (ev.key === 'Escape') close();
              }
              document.addEventListener('keydown', onKey);
              wrap.addEventListener('click', (ev) => { if (ev.target === wrap || (ev.target && ev.target.closest('.ref-img-lightbox-close'))) close(); });
              requestAnimationFrame(() => wrap.classList.add('ref-img-lightbox--in'));
              return;
            }
            try { window.open(objUrl, '_blank', 'noopener,noreferrer'); } catch (_) {}
            setTimeout(() => { try { URL.revokeObjectURL(objUrl); } catch (_) {} }, 60_000);
          })
          .catch((err) => {
            showToast(String(err && err.message ? err.message : err) || 'No se pudo abrir el archivo.', 'error');
          });
        return;
      }
      openRefaccionMediaFull(url);
    }, true);
  })();

  (function bindGlobalMediaDownloadCapture() {
    document.addEventListener(
      'click',
      function (e) {
        const t = e && e.target;
        if (!t || !t.closest) return;
        const btn = t.closest('.js-refaccion-download-media');
        if (!btn || btn.disabled) return;
        if (!document.body.contains(btn)) return;
        e.preventDefault();
        e.stopPropagation();
        try {
          e.stopImmediatePropagation();
        } catch (_) {}
        void downloadPvcMedia(btn);
      },
      true
    );
  })();

  function confirmar(msg) {
    return confirm(msg || '¿Eliminar este registro?');
  }

  function openConfirmModal(message, onConfirm, opts) {
    const modal = qs('#confirm-modal');
    const title = qs('#confirm-title');
    const msgEl = qs('#confirm-message');
    const btnOk = qs('#confirm-btn-ok');
    const btnCancel = qs('#confirm-btn-cancel');
    const btnClose = qs('#confirm-close');
    if (!modal || !msgEl || !btnOk) return void confirm(message);
    const defLabel = 'Eliminar';
    const defIcon = 'fa-trash';
    const defClass = 'btn danger';
    const o = opts && typeof opts === 'object' ? opts : {};
    const useLabel = o.confirmLabel != null ? String(o.confirmLabel) : defLabel;
    const useIcon = o.confirmIcon != null ? String(o.confirmIcon) : defIcon;
    const useClass = o.confirmClass != null ? String(o.confirmClass) : defClass;
    function resetOkButton() {
      btnOk.className = defClass;
      btnOk.innerHTML = '<i class="fas ' + defIcon + '"></i> ' + escapeHtml(defLabel);
    }
    function applyOkButton() {
      btnOk.className = useClass;
      btnOk.innerHTML = '<i class="fas ' + useIcon + '"></i> ' + escapeHtml(useLabel);
    }
    title.textContent = 'Confirmar';
    msgEl.textContent = message || '¿Eliminar este registro?';
    applyOkButton();
    const confirmBox = qs('#confirm-modal .modal-box');
    if (confirmBox) applyModalThemeToBox(confirmBox);
    modal.classList.remove('hidden');
    const close = () => {
      modal.classList.add('hidden');
      if (confirmBox) {
        confirmBox.classList.remove('modal-box--theme-dark', 'modal-box--theme-industrial');
      }
      resetOkButton();
      btnOk.onclick = null;
      btnCancel.onclick = null;
      btnClose.onclick = null;
    };
    btnOk.onclick = () => {
      close();
      if (typeof onConfirm === 'function') onConfirm();
    };
    btnCancel.onclick = close;
    btnClose.onclick = close;
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

  /** Filtro tabla reportes: «venta» agrupa tipo venta + legado garantía/instalación. */
  function reporteTipoMatchesFiltro(rowTipo, filtroVal) {
    const f = String(filtroVal || '').trim().toLowerCase();
    if (!f) return true;
    const t = String(rowTipo || '').trim().toLowerCase();
    if (f === 'venta') return t === 'venta' || t === 'garantia' || t === 'instalacion';
    if (f === 'servicio') return t === 'servicio';
    return t === f;
  }

  function getFilterValues(tableEl) {
    const tbl = typeof tableEl === 'string' ? qs(tableEl) : tableEl;
    if (!tbl) return {};
    const out = {};
    tbl.querySelectorAll('.filter-input, .filter-date-select').forEach(inp => {
      if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(inp.tagName)) return;
      const key = inp.dataset.key;
      if (!key) return;
      if (inp.classList.contains('filter-date-select')) {
        out[key + '_dateSelect'] = inp.value;
        const dateInp = tbl.querySelector('.filter-date-input[data-key="' + key + '"]');
        out[key + '_dateInput'] = dateInp ? dateInp.value : '';
        return;
      }
      out[key] = (inp.value != null ? String(inp.value) : '').trim();
    });
    return out;
  }

  function applyFilters(data, filterValues, tableId) {
    if (!data || !Array.isArray(data)) return [];
    let out = data;
    const tbl = qs('#' + tableId);
    if (!tbl) return out;
    tbl.querySelectorAll('.filter-row .filter-input[data-key]:not(.filter-date-input), .filter-row .filter-date-select[data-key]').forEach(inp => {
      if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(inp.tagName)) return;
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
        if (key === 'tipo_reporte') {
          out = out.filter((row) => reporteTipoMatchesFiltro(row[key], val));
          return;
        }
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
      if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(inp.tagName)) return;
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
  /** Días restantes hasta fecha_vencimiento: verde = bien, amarillo = poco tiempo, rojo = vencido. */
  function getDiasRestantesSemaphore(inc) {
    const fVenc = (inc.fecha_vencimiento || '').toString().trim().slice(0, 10);
    if (!fVenc) return { color: 'gray', label: '—', dias: null };
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const venc = parseDate(fVenc);
    if (!venc) return { color: 'gray', label: '—', dias: null };
    const dias = Math.ceil((venc - hoy) / (24 * 60 * 60 * 1000));
    if (dias < 0) return { color: 'red', label: 'Vencido hace ' + Math.abs(dias) + ' día(s)', dias };
    if (dias === 0) return { color: 'red', label: 'Vence hoy', dias: 0 };
    if (dias <= 3) return { color: 'red', label: dias + ' día(s)', dias };
    if (dias <= 7) return { color: 'yellow', label: dias + ' día(s)', dias };
    return { color: 'green', label: dias + ' día(s)', dias };
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
    try {
      await ensureExcelJs();
    } catch (_) {
      showToast('No se pudo cargar la librería de Excel. Revisa la conexión.', 'error');
      return;
    }
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
  function updateTableFooter(tableId, showing, total, clearAndRefresh, paginationOpts) {
    const footer = qs('#footer-' + tableId);
    if (!footer) return;
    if (total === 0 && (!paginationOpts || paginationOpts.totalFiltered === 0)) { footer.innerHTML = ''; return; }
    const tbl = qs('#' + tableId);
    const hasFilters = !tbl ? false : (() => {
      let has = false;
      try {
        tbl.querySelectorAll('.filter-row .filter-input, .filter-row .filter-date-select, .filter-row .filter-date-input').forEach(inp => {
          if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(inp.tagName)) return;
          if (inp.value && inp.value.trim()) has = true;
        });
      } catch (_) {}
      return has;
    })();
    const showClear = hasFilters;
    let msg = `<span>Mostrando <strong>${showing}</strong> de <strong>${total}</strong> registros</span>`;
    if (paginationOpts && paginationOpts.totalFiltered > 0) {
      const start = paginationOpts.page * (paginationOpts.pageSize || PAGE_SIZE) + 1;
      const end = Math.min((paginationOpts.page + 1) * (paginationOpts.pageSize || PAGE_SIZE), paginationOpts.totalFiltered);
      msg = `<span class="pagination-info">Mostrando <strong>${start}&ndash;${end}</strong> de <strong>${paginationOpts.totalFiltered}</strong></span>`;
    }
    footer.innerHTML = msg + (showClear ? ' <button type="button" class="clear-filters">Limpiar filtros</button>' : '');
    if (paginationOpts && paginationOpts.totalFiltered > (paginationOpts.pageSize || PAGE_SIZE)) {
      const wrap = document.createElement('div');
      wrap.className = 'pagination-wrap';
      const prev = document.createElement('button');
      prev.type = 'button';
      prev.className = 'btn outline';
      prev.innerHTML = '<i class="fas fa-chevron-left"></i> Anterior';
      prev.disabled = paginationOpts.page === 0;
      if (!prev.disabled && paginationOpts.onPrev) prev.addEventListener('click', paginationOpts.onPrev);
      const next = document.createElement('button');
      next.type = 'button';
      next.className = 'btn outline';
      next.innerHTML = 'Siguiente <i class="fas fa-chevron-right"></i>';
      const totalPages = Math.ceil(paginationOpts.totalFiltered / (paginationOpts.pageSize || PAGE_SIZE));
      next.disabled = paginationOpts.page >= totalPages - 1;
      if (!next.disabled && paginationOpts.onNext) next.addEventListener('click', paginationOpts.onNext);
      wrap.appendChild(prev);
      wrap.appendChild(next);
      if (paginationOpts.onPageSizeChange && typeof PAGE_SIZES !== 'undefined') {
        const label = document.createElement('span');
        label.className = 'pagination-info';
        label.textContent = ' Mostrar: ';
        const sel = document.createElement('select');
        sel.className = 'pagination-size-select';
        sel.setAttribute('aria-label', 'Registros por página');
        PAGE_SIZES.forEach(n => {
          const opt = document.createElement('option');
          opt.value = n;
          opt.textContent = n;
          if (n === (paginationOpts.pageSize || PAGE_SIZE)) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.addEventListener('change', () => {
          const val = parseInt(sel.value, 10);
          if (!isNaN(val)) paginationOpts.onPageSizeChange(tableId, val);
        });
        wrap.appendChild(label);
        wrap.appendChild(sel);
      }
      footer.appendChild(wrap);
    }
    const clearBtn = footer.querySelector('.clear-filters');
    if (clearBtn && clearAndRefresh) clearBtn.addEventListener('click', clearAndRefresh);
  }
  function clearTableFiltersAndRefresh(tableId, searchId, onRefresh) {
    const tbl = qs('#' + tableId);
    if (tbl) tbl.querySelectorAll('.filter-row .filter-input, .filter-row .filter-date-select, .filter-row .filter-date-input').forEach(inp => {
      if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(inp.tagName)) return;
      inp.value = '';
    });
    if (searchId) { const s = qs(searchId); if (s) s.value = ''; }
    if (typeof getPaginationState === 'function') setPaginationPage(tableId, 0);
    if (onRefresh) onRefresh();
  }
  const PAGE_SIZE = 25;
  const PAGE_SIZES = [10, 25, 50];
  const paginationState = {};
  const pageSizeState = {};
  function getPaginationState(tableId) { return paginationState[tableId] != null ? paginationState[tableId] : 0; }
  function setPaginationPage(tableId, page) { paginationState[tableId] = Math.max(0, page); }
  function getPageSize(tableId) { return pageSizeState[tableId] != null ? pageSizeState[tableId] : PAGE_SIZE; }
  function setPageSize(tableId, size) { pageSizeState[tableId] = size; setPaginationPage(tableId, 0); }
  function renderTableSkeleton(tableId, colCount, rowCount) {
    const tbl = qs('#' + tableId);
    if (!tbl) return;
    const tbody = tbl.querySelector('tbody');
    if (!tbody) return;
    rowCount = rowCount || 8;
    let html = '';
    for (let i = 0; i < rowCount; i++) {
      let cells = '';
      for (let c = 0; c < colCount; c++) cells += '<td><span class="skeleton skeleton-text"></span></td>';
      html += '<tr class="skeleton-row">' + cells + '</tr>';
    }
    tbody.innerHTML = html;
  }

  /** Replay stagger animation on all rows in a table's tbody */
  function animateTableRows(tableId) {
    const tbl = qs('#' + tableId);
    if (!tbl) return;
    const rows = tbl.querySelectorAll('tbody tr:not(.skeleton-row)');
    rows.forEach(function (row, i) {
      row.style.animation = 'none';
      row.style.opacity = '0';
      void row.offsetWidth;
      row.style.animation = '';
      row.style.opacity = '';
      row.style.animationDelay = (i * 0.035) + 's';
    });
  }

  /** Animate a numeric value counting up in an element */
  function animateCount(el, target, duration) {
    if (!el) return;
    duration = duration || 800;
    const start = 0;
    const startTime = performance.now();
    const isFloat = String(target).includes('.');
    function tick(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const val = start + (target - start) * eased;
      el.textContent = isFloat ? val.toFixed(2) : Math.round(val).toLocaleString();
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ----- CLIENTES -----
  async function downloadClienteConstanciaFile(id, suggestedName) {
    try {
      const headers = {};
      const tok = getAuthToken();
      if (tok) headers['Authorization'] = 'Bearer ' + tok;
      const r = await fetch(API + '/clientes/' + encodeURIComponent(id) + '/constancia?download=1', { headers });
      if (!r.ok) throw new Error('bad');
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      let fn = (suggestedName || 'constancia').replace(/[^\w.\-\u00C0-\u024f]/g, '_') || 'constancia';
      if (fn.indexOf('.') < 0 && blob.type) {
        if (blob.type.indexOf('pdf') >= 0) fn += '.pdf';
        else if (blob.type.indexOf('jpeg') >= 0) fn += '.jpg';
        else if (blob.type.indexOf('png') >= 0) fn += '.png';
      }
      a.download = fn;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (_) {
      showToast('No se pudo descargar la constancia.', 'error');
    }
  }

  function makeImageThumbDataUrl(dataUrl, maxSize) {
    maxSize = maxSize || 56;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          let w = img.width;
          let h = img.height;
          if (w <= 0 || h <= 0) { resolve(null); return; }
          const scale = Math.min(maxSize / w, maxSize / h, 1);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.65));
        } catch (_) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  /** Abre imagen a pantalla completa (overlay). PDF u otros: nueva pestaña. */
  function openRefaccionMediaFull(url) {
    const u = String(url || '');
    if (!u) return;
    function openLightboxImgSrc(src) {
      const prev = document.getElementById('ref-img-lightbox');
      if (prev) prev.remove();
      const wrap = document.createElement('div');
      wrap.id = 'ref-img-lightbox';
      wrap.className = 'ref-img-lightbox';
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-modal', 'true');
      const inner = document.createElement('div');
      inner.className = 'ref-img-lightbox-inner';
      const imgEl = document.createElement('img');
      imgEl.alt = '';
      imgEl.src = src;
      inner.appendChild(imgEl);
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'ref-img-lightbox-close';
      closeBtn.setAttribute('aria-label', 'Cerrar');
      closeBtn.innerHTML = '<i class="fas fa-times"></i>';
      wrap.appendChild(closeBtn);
      wrap.appendChild(inner);
      document.body.appendChild(wrap);
      const shouldRevoke = String(src || '').startsWith('blob:');
      const close = () => {
        wrap.classList.add('ref-img-lightbox--out');
        setTimeout(() => {
          wrap.remove();
          document.removeEventListener('keydown', onKey);
          if (shouldRevoke) {
            try { URL.revokeObjectURL(src); } catch (_) {}
          }
        }, 200);
      };
      function onKey(e) {
        if (e.key === 'Escape') close();
      }
      document.addEventListener('keydown', onKey);
      wrap.addEventListener('click', (e) => { if (e.target === wrap || (e.target && e.target.closest('.ref-img-lightbox-close'))) close(); });
      requestAnimationFrame(() => wrap.classList.add('ref-img-lightbox--in'));
    }

    const isImg = u.startsWith('data:image') || /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(u);
    if (!isImg) {
      try { window.open(u, '_blank', 'noopener,noreferrer'); } catch (_) {}
      return;
    }
    const prev = document.getElementById('ref-img-lightbox');
    if (prev) prev.remove();
    const wrap = document.createElement('div');
    wrap.id = 'ref-img-lightbox';
    wrap.className = 'ref-img-lightbox';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    openLightboxImgSrc(u);
  }

  /** Tras innerHTML del modal: addEventListener en cada .js-refaccion-open-media (onclick en HTML no es fiable con innerHTML/CSP). */
  function wireModalMediaOpenButtons(root) {
    if (!root) return;
    root.querySelectorAll('.js-refaccion-open-media').forEach((btn) => {
      btn.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          const url = pvcMediaUrlFromBtn(btn);
          if (!url) {
            showToast('No se pudo abrir la imagen. Recarga la página (F5).', 'error');
            return;
          }
          openRefaccionMediaFull(url);
        },
        true
      );
    });
  }

  function pvcMediaDownloadButtonHtml(mediaRef, dataUrl, downloadName, extraClass) {
    if (!canDownloadUploadedMedia()) return '';
    const refAttr = mediaRef ? ' data-media-ref="' + escapeHtml(mediaRef) + '"' : '';
    const urlAttr = !mediaRef && dataUrl ? ' data-url="' + escapeHtml(dataUrl) + '"' : '';
    const dn = downloadName ? ' data-download-name="' + escapeHtml(downloadName) + '"' : '';
    const cls = 'ref-pvc-hero-cta-btn ref-pvc-hero-cta-btn--dl js-refaccion-download-media' + (extraClass ? ' ' + extraClass : '');
    return (
      '<button type="button" class="' +
      cls +
      '"' +
      refAttr +
      urlAttr +
      dn +
      ' title="Descargar"><i class="fas fa-download"></i> Descargar</button>'
    );
  }
  function heroCtaRowHtml(mediaRef, dataUrl, downloadName) {
    const openAttr = mediaRef
      ? 'data-media-ref="' + escapeHtml(mediaRef) + '"'
      : 'data-url="' + escapeHtml(dataUrl) + '"';
    const dl = pvcMediaDownloadButtonHtml(mediaRef, dataUrl, downloadName);
    return (
      '<div class="ref-pvc-hero-cta-row">' +
      '<button type="button" class="ref-pvc-hero-cta-btn js-refaccion-open-media" ' +
      openAttr +
      ' title="Ver completo"><i class="fas fa-magnifying-glass-plus"></i> Ver</button>' +
      dl +
      '</div>'
    );
  }
  function heroFrameImageHtml(mediaRef, dataUrl, imgSrc, alt, downloadName) {
    const openAttr = mediaRef
      ? 'data-media-ref="' + escapeHtml(mediaRef) + '"'
      : 'data-url="' + escapeHtml(dataUrl) + '"';
    return (
      '<div class="ref-pvc-hero-frame">' +
      '<button type="button" class="ref-pvc-hero-frame-hit js-refaccion-open-media" ' +
      openAttr +
      ' title="Ver imagen completa">' +
      '<img src="' + escapeHtml(imgSrc) + '" alt="' + escapeHtml(alt || '') + '" loading="lazy">' +
      '<span class="ref-pvc-hero-shine"></span>' +
      '</button>' +
      heroCtaRowHtml(mediaRef, dataUrl, downloadName) +
      '</div>'
    );
  }
  function pvcDownloadBtnCompactHtml(mediaRef, dataUrl, downloadName) {
    if (!canDownloadUploadedMedia()) return '';
    const refAttr = mediaRef ? ' data-media-ref="' + escapeHtml(mediaRef) + '"' : '';
    const urlAttr = !mediaRef && dataUrl ? ' data-url="' + escapeHtml(dataUrl) + '"' : '';
    const dn = downloadName ? ' data-download-name="' + escapeHtml(downloadName) + '"' : '';
    return (
      '<button type="button" class="btn small outline pvc-dl-mini js-refaccion-download-media"' +
      refAttr +
      urlAttr +
      dn +
      ' title="Descargar" aria-label="Descargar"><i class="fas fa-download"></i></button>'
    );
  }

  /** Bloque bajo el título: imagen principal (número de parte) + miniatura pieza. */
  function buildRefaccionPreviewUnderHeader(r) {
    const imgPart = r.imagen_url ? String(r.imagen_url).trim() : '';
    const imgPieza = r.manual_url ? String(r.manual_url).trim() : '';
    if (!imgPart && !imgPieza) return '';
    const isImg = (u) => u && (u.startsWith('data:image') || /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(u));
    const isPdf = (u) => u && (u.startsWith('data:application/pdf') || /\.pdf(\?|$)/i.test(u));

    function blockNumeroParte(url) {
      if (isImg(url)) {
        const ref = registerPvcMediaUrl(url);
        return (
          '<div class="ref-pvc-hero-main">' +
          '<span class="ref-pvc-hero-kicker"><i class="fas fa-barcode"></i> Número de parte</span>' +
          heroFrameImageHtml(ref, null, url, 'Número de parte', 'refaccion-numero-parte') +
          '</div>'
        );
      }
      if (isPdf(url)) {
        return (
          '<div class="ref-pvc-hero-main">' +
          '<span class="ref-pvc-hero-kicker"><i class="fas fa-barcode"></i> Número de parte</span>' +
          '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer" class="ref-pvc-hero-doc">' +
          '<span class="ref-pvc-hero-doc-icon"><i class="fas fa-file-pdf"></i></span>' +
          '<span>Abrir PDF</span><i class="fas fa-external-link-alt ref-pvc-hero-doc-arrow"></i></a></div>'
        );
      }
      return (
        '<div class="ref-pvc-hero-main">' +
        '<span class="ref-pvc-hero-kicker"><i class="fas fa-barcode"></i> Número de parte</span>' +
        '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer" class="ref-pvc-hero-doc">' +
        '<span class="ref-pvc-hero-doc-icon"><i class="fas fa-file-alt"></i></span>' +
        '<span>Abrir archivo</span><i class="fas fa-external-link-alt ref-pvc-hero-doc-arrow"></i></a></div>'
      );
    }

    function blockPiezaThumb(url, compact) {
      if (isImg(url)) {
        const ref = registerPvcMediaUrl(url);
        const dl = pvcMediaDownloadButtonHtml(ref, null, 'refaccion-pieza-mini', 'ref-pvc-pieza-mini-dl');
        return (
          '<aside class="ref-pvc-hero-side' + (compact ? ' ref-pvc-hero-side--thumb' : '') + '">' +
          '<span class="ref-pvc-hero-kicker ref-pvc-hero-kicker--accent"><i class="fas fa-puzzle-piece"></i> Pieza</span>' +
          '<div class="ref-pvc-pieza-card">' +
          '<div class="ref-pvc-pieza-ring"></div>' +
          '<img src="' + escapeHtml(url) + '" alt="Vista pieza" loading="lazy">' +
          '</div>' +
          '<div class="ref-pvc-pieza-actions">' +
          dl +
          '<button type="button" class="ref-pvc-pieza-mini-zoom js-refaccion-open-media" data-media-ref="' +
          escapeHtml(ref) +
          '" title="Ver imagen completa">' +
          '<i class="fas fa-search-plus"></i></button>' +
          '</div>' +
          '</aside>'
        );
      }
      return (
        '<aside class="ref-pvc-hero-side">' +
        '<span class="ref-pvc-hero-kicker ref-pvc-hero-kicker--accent"><i class="fas fa-puzzle-piece"></i> Pieza</span>' +
        '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer" class="ref-pvc-hero-doc ref-pvc-hero-doc--compact">' +
        '<span class="ref-pvc-hero-doc-icon"><i class="fas ' + (isPdf(url) ? 'fa-file-pdf' : 'fa-file-alt') + '"></i></span>' +
        '<span>Abrir</span></a></aside>'
      );
    }

    function blockPiezaSolo(url) {
      if (isImg(url)) {
        const ref = registerPvcMediaUrl(url);
        return (
          '<div class="ref-pvc-hero-main ref-pvc-hero-main--solo">' +
          '<span class="ref-pvc-hero-kicker"><i class="fas fa-puzzle-piece"></i> Pieza</span>' +
          heroFrameImageHtml(ref, null, url, 'Pieza', 'refaccion-pieza') +
          '</div>'
        );
      }
      if (isPdf(url)) {
        return (
          '<div class="ref-pvc-hero-main">' +
          '<span class="ref-pvc-hero-kicker"><i class="fas fa-puzzle-piece"></i> Pieza</span>' +
          '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer" class="ref-pvc-hero-doc">' +
          '<span class="ref-pvc-hero-doc-icon"><i class="fas fa-file-pdf"></i></span>' +
          '<span>Abrir PDF</span><i class="fas fa-external-link-alt ref-pvc-hero-doc-arrow"></i></a></div>'
        );
      }
      return (
        '<div class="ref-pvc-hero-main">' +
        '<span class="ref-pvc-hero-kicker"><i class="fas fa-puzzle-piece"></i> Pieza</span>' +
        '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer" class="ref-pvc-hero-doc">' +
        '<span class="ref-pvc-hero-doc-icon"><i class="fas fa-file-alt"></i></span>' +
        '<span>Abrir archivo</span><i class="fas fa-external-link-alt ref-pvc-hero-doc-arrow"></i></a></div>'
      );
    }

    if (!imgPart && imgPieza) {
      return '<div class="ref-pvc-hero"><div class="ref-pvc-hero-inner ref-pvc-hero-inner--single">' + blockPiezaSolo(imgPieza) + '</div></div>';
    }

    const mainHtml = imgPart ? blockNumeroParte(imgPart) : '';
    const sideHtml = imgPieza ? blockPiezaThumb(imgPieza, !!imgPart) : '';
    const layoutClass = mainHtml && sideHtml ? 'ref-pvc-hero-inner--split' : 'ref-pvc-hero-inner--single';
    return '<div class="ref-pvc-hero"><div class="ref-pvc-hero-inner ' + layoutClass + '">' + mainHtml + sideHtml + '</div></div>';
  }

  /** Miniatura o icono (PDF/otro) para vistas previas de refacciones/máquinas. */
  function previewMediaThumbBlock(url, title) {
    const u = String(url || '');
    if (!u) return '';
    const isImg = u.startsWith('data:image') || /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(u);
    const mediaRef = registerPvcMediaUrl(u);
    const dl = pvcDownloadBtnCompactHtml(mediaRef, null, slugifyDownloadName(title || 'archivo'));
    if (isImg) {
      return `<div class="pvc-preview-media">
        <div class="pvc-preview-media-row">
        <button type="button" class="pvc-preview-media-btn js-refaccion-open-media" data-media-ref="${mediaRef}" title="Ver imagen completa">
          <img src="${escapeHtml(u)}" class="ref-foto-thumb" alt="${escapeHtml(title || '')}" style="max-height:140px;max-width:100%;object-fit:contain;border-radius:8px;border:1px solid var(--border-color,#e5e7eb);">
        </button>
        ${dl}
        </div>
      </div>`;
    }
    const isPdf = u.startsWith('data:application/pdf') || /\.pdf(\?|$)/i.test(u) || /application\/pdf/i.test(u);
    const icon = isPdf ? 'fa-file-pdf' : 'fa-file-alt';
    const cls = isPdf ? 'cliente-const-slot--pdf' : 'cliente-const-slot--file';
    return `<div class="pvc-preview-media">
      <div class="pvc-preview-media-row">
      <button type="button" class="cliente-const-slot ${cls} js-refaccion-open-media" data-media-ref="${mediaRef}" style="width:88px;height:88px;display:inline-flex;align-items:center;justify-content:center;" title="${escapeHtml((title || 'Archivo') + ' · clic para abrir')}">
        <i class="fas ${icon} fa-2x"></i>
      </button>
      ${dl}
      </div>
    </div>`;
  }
  function slugifyDownloadName(s) {
    const t = String(s || 'archivo').trim() || 'archivo';
    return t.replace(/[^\w.\-\u00C0-\u024f]/g, '_').replace(/_+/g, '_');
  }

  function clienteConstanciaThumbHtml(c) {
    if (!c || !c.has_constancia) return '';
    const openUrl = c.id != null ? (API + '/clientes/' + encodeURIComponent(c.id) + '/constancia') : '';
    const dl = pvcDownloadBtnCompactHtml(null, openUrl, 'cliente-constancia');
    if (c.constancia_kind === 'image' && c.constancia_thumb_url) {
      return `<span class="cliente-const-inline"><button type="button" class="cliente-const-slot js-refaccion-open-media" data-url="${escapeHtml(openUrl)}" title="Constancia fiscal (clic para abrir)">
        <img src="${escapeHtml(c.constancia_thumb_url)}" alt="" class="cliente-const-mini" loading="lazy">
      </button>${dl}</span>`;
    }
    const icon = c.constancia_kind === 'pdf' ? 'fa-file-pdf' : 'fa-file-alt';
    const cls = c.constancia_kind === 'pdf' ? 'cliente-const-slot--pdf' : 'cliente-const-slot--file';
    return `<span class="cliente-const-inline"><button type="button" class="cliente-const-slot ${cls} js-refaccion-open-media" data-url="${escapeHtml(openUrl)}" title="Constancia (${c.constancia_kind === 'pdf' ? 'PDF' : 'documento'}) · clic para abrir">
      <i class="fas ${icon}"></i>
    </button>${dl}</span>`;
  }

  function previewCliente(c) {
    clearPvcMediaUrlRegistry();
    const openUrl = c && c.id != null ? (API + '/clientes/' + encodeURIComponent(c.id) + '/constancia') : '';
    const hasConst = !!(c && c.has_constancia);
    const constKind = (c && c.constancia_kind) ? String(c.constancia_kind) : '';
    const constThumb = (c && c.constancia_thumb_url) ? String(c.constancia_thumb_url) : '';
    const constRef = constThumb ? registerPvcMediaUrl(constThumb) : '';
    const constKicker = constKind === 'pdf' ? 'PDF' : (constKind === 'image' ? 'Imagen' : (hasConst ? 'Archivo' : '—'));
    const underHeaderHtml = hasConst
      ? `
        <div class="ref-pvc-hero">
          <div class="ref-pvc-hero-inner ref-pvc-hero-inner--single">
            <div class="ref-pvc-hero-main ref-pvc-hero-main--solo">
              <div class="ref-pvc-hero-kicker ref-pvc-hero-kicker--accent"><i class="fas fa-file-invoice"></i> Constancia fiscal · ${escapeHtml(constKicker)}</div>
              ${constKind === 'image' && constThumb
                ? heroFrameImageHtml(null, openUrl, constThumb, 'Constancia fiscal', 'cliente-constancia')
                : `<div class="ref-pvc-hero-doc-row">
                   <button type="button" class="ref-pvc-hero-doc js-refaccion-open-media" data-url="${escapeHtml(openUrl)}" title="Clic para abrir constancia">
                     <span class="ref-pvc-hero-doc-icon"><i class="fas ${constKind === 'pdf' ? 'fa-file-pdf' : 'fa-file'}"></i></span>
                     <div>
                       <div style="font-weight:800;line-height:1.1">Abrir constancia</div>
                       <div style="opacity:0.75;font-size:0.82rem;line-height:1.3">${escapeHtml(constKind === 'pdf' ? 'PDF (clic para abrir)' : 'Archivo (clic para abrir)')}</div>
                     </div>
                     <span class="ref-pvc-hero-doc-arrow"><i class="fas fa-arrow-up-right-from-square"></i></span>
                   </button>
                   ${pvcMediaDownloadButtonHtml(null, openUrl, 'cliente-constancia', 'ref-pvc-hero-doc-dl')}
                   </div>`}
            </div>
          </div>
        </div>
      `
      : '';
    openPreviewCard({
      title: c.nombre || 'Cliente',
      subtitle: c.codigo ? 'Código: ' + c.codigo : '',
      icon: 'fa-user-tie',
      color: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a9e 100%)',
      underHeaderHtml,
      sections: [{
        title: 'Información fiscal', icon: 'fa-file-invoice',
        fields: [
          { label: 'ID', value: c.id, icon: 'fa-hashtag' },
          { label: 'Código', value: c.codigo, icon: 'fa-barcode' },
          { label: 'Nombre / Razón social', value: c.nombre, icon: 'fa-building', full: true },
          { label: 'RFC', value: c.rfc, icon: 'fa-id-card' },
        ]
      }, {
        title: 'Contacto', icon: 'fa-address-book',
        fields: [
          { label: 'Contacto', value: c.contacto, icon: 'fa-user' },
          { label: 'Teléfono', value: c.telefono, icon: 'fa-phone' },
          { label: 'Email', value: c.email, icon: 'fa-envelope' },
          { label: 'Dirección', value: c.direccion, icon: 'fa-map-marker-alt', full: true },
          { label: 'Ciudad', value: c.ciudad, icon: 'fa-city' },
        ]
      }],
      footerHtml: c.has_constancia && canDownloadUploadedMedia()
        ? '<button type="button" class="btn primary" id="pvc-dl-constancia"><i class="fas fa-download"></i> Descargar constancia</button>'
        : '',
    });
    setTimeout(() => {
      const btn = qs('#pvc-dl-constancia');
      if (btn) btn.addEventListener('click', () => downloadClienteConstanciaFile(c.id, c.constancia_nombre || 'constancia'));
    }, 0);
  }
  function renderClientes(data) {
    const tbody = qs('#tabla-clientes tbody');
    tbody.innerHTML = '';
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty">No hay clientes. Carga datos demo o agrega uno nuevo.</td></tr>';
      return;
    }
    const _canEdit = canEdit(); const _canDelete = canDelete();
    data.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.id}</td>
        <td>${escapeHtml(c.codigo || '')}</td>
        <td class="td-cliente-nombre"><span class="cliente-nombre-wrap"><span class="cliente-nombre-text">${escapeHtml(c.nombre || '')}</span>${clienteConstanciaThumbHtml(c)}</span></td>
        <td>${escapeHtml(c.rfc || '')}</td>
        <td>${escapeHtml(c.contacto || '')}</td>
        <td>${escapeHtml(c.telefono || '')}</td>
        <td>${c.email ? `<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>` : ''}</td>
        <td>${escapeHtml(c.ciudad || '')}</td>
        <td class="th-actions">
          <button type="button" class="btn small outline btn-preview-cliente" data-id="${c.id}" title="Vista previa"><i class="fas fa-eye"></i></button>
          ${_canEdit ? `<button type="button" class="btn small primary btn-edit-cliente" data-id="${c.id}"><i class="fas fa-edit"></i></button>` : ''}
          ${_canDelete ? `<button type="button" class="btn small danger btn-delete-cliente" data-id="${c.id}"><i class="fas fa-trash"></i></button>` : ''}
        </td>
      `;
      tbody.appendChild(tr);
    });
    updateTableFooter('tabla-clientes', data.length, clientesCache.length, () => clearTableFiltersAndRefresh('tabla-clientes', '#buscar-clientes', applyClientesFiltersAndRender), arguments[1]);
    animateTableRows('tabla-clientes');
    tbody.querySelectorAll('.btn-preview-cliente').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const c = data.find(x => x.id == btn.dataset.id); if (c) previewCliente(c); });
    });
    tbody.querySelectorAll('.btn-edit-cliente').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const c = data.find(x => x.id == btn.dataset.id); if (c) openModalCliente(c); });
    });
    tbody.querySelectorAll('.btn-delete-cliente').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openConfirmModal('¿Eliminar este cliente?', () => deleteCliente(btn.dataset.id)); });
    });
  }

  async function deleteCliente(id) {
    try {
      await fetchJson(API + '/clientes/' + id, { method: 'DELETE' });
      showToast('Cliente eliminado correctamente.', 'success');
      loadClientes({ force: true });
    } catch (e) { showToast(parseApiError(e) || 'No se pudo eliminar.', 'error'); }
  }

  async function loadClientes(opts) {
    const force = !!(opts && opts.force);
    if (force) skipNextClientesFetchAfterDashboard = false;
    else if (skipNextClientesFetchAfterDashboard) {
      skipNextClientesFetchAfterDashboard = false;
      rebuildClientCityMaps();
      updateGlobalBranchOptions();
      applyClientesFiltersAndRender();
      return;
    }
    showLoading();
    renderTableSkeleton('tabla-clientes', 8);
    try {
      const data = await fetchJson(API + '/clientes');
      clientesCache = data;
      rebuildClientCityMaps();
      updateGlobalBranchOptions();
      applyClientesFiltersAndRender();
    } catch (e) { renderClientes([]); console.error(e); }
    finally { hideLoading(); }
  }

  // ----- REFACCIONES -----
  function previewRefaccion(r) {
    const stockBajo = Number(r.stock) <= Number(r.stock_minimo || 1);
    const underHeaderHtml = buildRefaccionPreviewUnderHeader(r);
    const hasSeg = !!(refCategoriaLabel(r.categoria) || refCategoriaLabel(r.subcategoria));
    const footerHtml =
      '<p class="pvc-footer-link-hint" style="font-size:0.82rem;color:var(--text-muted,#64748b);line-height:1.45;margin:0 0 0.75rem;">' +
      '<i class="fas fa-link"></i> <strong>Línea</strong> y <strong>parte</strong> son los mismos segmentos que en <strong>Máquinas</strong> (campos <code>categoria</code> / <code>subcategoria</code>), definidos en <strong>Categorías</strong>. Se relacionan por <strong>texto igual</strong>. En cotización, cada línea usa <code>refaccion_id</code> o <code>maquina_id</code>.</p>' +
      '<button type="button" class="btn outline btn-ref-to-maquinas"' +
      (hasSeg ? '' : ' disabled title="Agrega línea o parte desde el catálogo"') +
      '><i class="fas fa-industry"></i> Ver máquinas con esta línea/parte</button>';
    openPreviewCard({
      title: r.descripcion || 'Refacción',
      subtitle: r.codigo || '',
      icon: 'fa-cogs',
      color: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
      badge: stockBajo ? 'Stock Bajo' : 'Stock OK',
      badgeClass: stockBajo ? 'pvc-badge--danger' : 'pvc-badge--success',
      underHeaderHtml,
      sections: [
        {
          title: 'Identificación', icon: 'fa-barcode',
          fields: [
            { label: 'Código', value: r.codigo, icon: 'fa-barcode' },
            { label: 'Descripción', value: r.descripcion, icon: 'fa-align-left', full: true },
            { label: 'Línea (nombre máquina)', value: refCategoriaLabel(r.categoria) || '—', icon: 'fa-layer-group' },
            { label: 'Parte', value: refCategoriaLabel(r.subcategoria) || '—', icon: 'fa-puzzle-piece' },
            { label: 'Zona', value: r.zona, icon: 'fa-map-marker-alt' },
            { label: 'Bloque', value: r.bloque, icon: 'fa-th-large' },
            { label: 'Unidad', value: r.unidad || 'PZA', icon: 'fa-ruler' },
          ],
        },
        {
          title: 'Inventario y precio', icon: 'fa-dollar-sign',
          fields: [
            { label: 'Stock actual', value: r.stock != null ? Number(r.stock).toLocaleString('es-MX') : '0', icon: 'fa-boxes', badge: stockBajo, badgeClass: stockBajo ? 'pvc-badge--danger' : '' },
            { label: 'Stock mínimo', value: r.stock_minimo != null ? Number(r.stock_minimo) : 1, icon: 'fa-exclamation-triangle' },
            { label: 'Precio lista (USD)', value: (() => { const u = resolveRefaccionPrecioUsd(r); return u != null ? 'US$' + u.toLocaleString('en-US', { minimumFractionDigits: 2 }) : ''; })(), icon: 'fa-dollar-sign' },
            ...(r.tipo_cambio_registro != null && Number(r.tipo_cambio_registro) > 0
              ? [{ label: 'T.C. al registrar (USD/MXN)', value: Number(r.tipo_cambio_registro).toFixed(4), icon: 'fa-exchange-alt' }]
              : []),
            { label: 'Nº Parte Manual', value: r.numero_parte_manual, icon: 'fa-book' },
          ],
        },
      ],
      footerHtml,
    });
    setTimeout(() => {
      const btn = qs('#modal-body .btn-ref-to-maquinas');
      if (btn && !btn.disabled) {
        btn.addEventListener('click', () =>
          goToMaquinasFromRefaccionSegmentos(refCategoriaLabel(r.categoria), refCategoriaLabel(r.subcategoria))
        );
      }
    }, 0);
  }
  function renderRefacciones(data) {
    const tbody = qs('#tabla-refacciones tbody');
    tbody.innerHTML = '';
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty">No hay refacciones. Agrega una nueva.</td></tr>';
      return;
    }
    const _canEdit = canEdit(); const _canDelete = canDelete(); const _canStock = canAdjustStock();
    // Alerta de stock bajo
    const bajos = data.filter(r => Number(r.stock) <= Number(r.stock_minimo || 1) && Number(r.stock_minimo || 1) > 0);
    const alertBar = qs('#ref-stock-alert-bar');
    if (alertBar) {
      if (bajos.length) {
        alertBar.classList.remove('hidden');
        alertBar.innerHTML = `<i class="fas fa-exclamation-triangle"></i> <strong>${bajos.length} refacción(es) con stock bajo:</strong> ${bajos.map(r => escapeHtml(r.codigo)).join(', ')}`;
      } else {
        alertBar.classList.add('hidden');
      }
    }
    data.forEach(r => {
      const stockBajo = Number(r.stock) <= Number(r.stock_minimo || 1);
      const tr = document.createElement('tr');
      if (stockBajo) tr.classList.add('row-stock-bajo');
      const imgThumb = r.imagen_url ? `<span class="ref-img-hover-wrap" tabindex="-1"><button type="button" class="btn-codigo-ref link-btn" data-id="${r.id}" title="Ver imagen/manual">${escapeHtml(r.codigo || '')}</button><img class="ref-img-hover-preview" src="${escapeHtml(r.imagen_url)}" alt="preview" loading="lazy"></span>` : `<button type="button" class="btn-codigo-ref link-btn" data-id="${r.id}" title="Ver imagen/manual">${escapeHtml(r.codigo || '')}</button>`;
      tr.innerHTML = `
        <td class="ref-td-code">${imgThumb}</td>
        <td class="td-desc-wrap td-text-wrap ref-td-desc">${escapeHtml(r.descripcion || '')}</td>
        <td class="ref-td-cat">${formatRefaccionCategoriaCellHtml(r)}</td>
        <td class="ref-td-meta">${escapeHtml(r.zona || '')}</td>
        <td class="ref-td-meta">${escapeHtml(r.bloque || '')}</td>
        <td class="ref-td-num ${stockBajo ? 'stock-bajo' : ''}">${r.stock != null ? Number(r.stock).toLocaleString('es-MX') : '0'}</td>
        <td class="ref-td-num">${r.stock_minimo != null ? Number(r.stock_minimo) : 1}</td>
        <td class="ref-td-price">${formatRefaccionPrecioUsdCell(r)}</td>
        <td class="ref-td-unit">${escapeHtml(r.unidad || 'PZA')}</td>
        <td class="th-actions ref-td-actions">
          <div class="row-actions-inline" role="group" aria-label="Acciones">
            <button type="button" class="btn small outline btn-preview-ref" data-id="${r.id}" title="Vista previa"><i class="fas fa-eye"></i></button>
            ${_canStock ? `<button type="button" class="btn small outline btn-stock-ref" data-id="${r.id}" title="Inventario"><i class="fas fa-boxes"></i></button>` : ''}
            ${_canEdit ? `<button type="button" class="btn small primary btn-edit-ref" data-id="${r.id}" title="Editar"><i class="fas fa-edit"></i></button>` : ''}
            ${_canDelete ? `<button type="button" class="btn small danger btn-delete-ref" data-id="${r.id}" title="Eliminar"><i class="fas fa-trash-alt"></i></button>` : ''}
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
    updateTableFooter('tabla-refacciones', data.length, refaccionesCache.length, () => clearTableFiltersAndRefresh('tabla-refacciones', '#buscar-refacciones', applyRefaccionesFiltersAndRender), arguments[1]);
    animateTableRows('tabla-refacciones');
    tbody.querySelectorAll('.btn-codigo-ref').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const r = data.find(x => x.id == btn.dataset.id); if (r) openModalRefaccionImagen(r); });
    });
    function closeRefaccionRowMenu(btn) {
      const det = btn && btn.closest && btn.closest('details.ds-row-actions');
      if (det) det.open = false;
    }
    tbody.querySelectorAll('.btn-preview-ref').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        closeRefaccionRowMenu(btn);
        const r = data.find(x => x.id == btn.dataset.id);
        if (r) previewRefaccion(r);
      });
    });
    tbody.querySelectorAll('.btn-stock-ref').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        closeRefaccionRowMenu(btn);
        const r = data.find(x => x.id == btn.dataset.id);
        if (r) openModalAjusteStock(r);
      });
    });
    tbody.querySelectorAll('.btn-edit-ref').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        closeRefaccionRowMenu(btn);
        const r = data.find(x => x.id == btn.dataset.id);
        if (r) openModalRefaccion(r);
      });
    });
    tbody.querySelectorAll('.btn-delete-ref').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        closeRefaccionRowMenu(btn);
        openConfirmModal('¿Eliminar esta refacción?', () => deleteRefaccion(btn.dataset.id));
      });
    });
  }

  async function deleteRefaccion(id) {
    try {
      await fetchJson(API + '/refacciones/' + id, { method: 'DELETE' });
      showToast('Refacción eliminada correctamente.', 'success');
      loadRefacciones();
    } catch (e) { showToast(parseApiError(e) || 'No se pudo eliminar.', 'error'); }
  }

  function refillRefaccionSubcategoriaOptions() {
    const selCat = qs('#filtro-categoria-ref');
    const selSub = qs('#filtro-subcategoria-ref');
    if (!selCat || !selSub) return;
    const cats = toArray(categoriasCatalogoTree && categoriasCatalogoTree.categorias);
    const catVal = selCat.value;
    const prevSub = selSub.value;
    let subs = [];
    if (!catVal) {
      const seen = new Set();
      cats.forEach((c) => {
        toArray(c.subcategorias).forEach((s) => {
          const n = s && s.nombre != null ? String(s.nombre) : '';
          if (n && !seen.has(n)) {
            seen.add(n);
            subs.push(n);
          }
        });
      });
    } else {
      const c = cats.find((x) => x.nombre === catVal);
      subs = toArray(c && c.subcategorias).map((s) => (s && s.nombre != null ? String(s.nombre) : '')).filter(Boolean);
    }
    selSub.innerHTML =
      '<option value="">Todas las subcategorías</option>' +
      subs.map((n) => '<option value="' + escapeHtml(n) + '">' + escapeHtml(n) + '</option>').join('');
    if (prevSub && subs.indexOf(prevSub) >= 0) selSub.value = prevSub;
    else selSub.value = '';
  }

  function populateRefaccionCategoriaFiltersFromTree(tree) {
    categoriasCatalogoTree = tree && tree.categorias ? tree : { categorias: [] };
    const selCat = qs('#filtro-categoria-ref');
    if (!selCat) return;
    const prevCat = selCat.value;
    const cats = toArray(categoriasCatalogoTree.categorias);
    selCat.innerHTML =
      '<option value="">Todas las categorías</option>' +
      cats.map((c) => '<option value="' + escapeHtml(c.nombre) + '">' + escapeHtml(c.nombre) + '</option>').join('');
    if (prevCat && [...selCat.options].some((o) => o.value === prevCat)) selCat.value = prevCat;
    else selCat.value = '';
    refillRefaccionSubcategoriaOptions();
  }

  function setupRefaccionFiltrosCategoriasOnce() {
    const selCat = qs('#filtro-categoria-ref');
    const selSub = qs('#filtro-subcategoria-ref');
    if (!selCat || selCat._catFilterBound) return;
    selCat._catFilterBound = true;
    selCat.addEventListener('change', () => {
      refillRefaccionSubcategoriaOptions();
      applyRefaccionesFiltersAndRender();
    });
    if (selSub && !selSub._subFilterBound) {
      selSub._subFilterBound = true;
      selSub.addEventListener('change', applyRefaccionesFiltersAndRender);
    }
  }

  async function loadRefacciones() {
    showLoading();
    renderTableSkeleton('tabla-refacciones', 10);
    setupRefaccionFiltrosCategoriasOnce();
    try {
      const [data, tree] = await Promise.all([
        fetchJson(API + '/refacciones'),
        fetchJson(API + '/categorias-catalogo').catch(() => ({ categorias: [] })),
      ]);
      refaccionesCache = toArray(data).map(function (r) {
        return Object.assign({}, r, {
          categoria: refCategoriaLabel(r.categoria),
          subcategoria: refCategoriaLabel(r.subcategoria),
        });
      });
      populateRefaccionCategoriaFiltersFromTree(tree);
      applyRefaccionesFiltersAndRender();
    } catch (e) {
      renderRefacciones([]);
      console.error(e);
    }
    finally {
      hideLoading();
      if (typeof refreshAlertasHeader === 'function') refreshAlertasHeader();
    }
  }

  let tipoCambioActual = 17.0; // tipo de cambio USD/MXN actualizado desde Banxico

  /** Precio lista en USD: prioridad a precio_usd; legado: MXN congelado con tipo_cambio_registro o TC actual. */
  function resolveRefaccionPrecioUsd(r) {
    const usd = Number(r.precio_usd);
    if (Number.isFinite(usd) && usd > 0) return usd;
    const mxn = Number(r.precio_unitario);
    const tcReg = Number(r.tipo_cambio_registro);
    const tc = (Number.isFinite(tcReg) && tcReg > 0)
      ? tcReg
      : ((typeof tipoCambioActual === 'number' && tipoCambioActual > 0) ? tipoCambioActual : 17);
    if (Number.isFinite(mxn) && mxn > 0 && tc > 0) return Math.round((mxn / tc) * 100) / 100;
    return null;
  }
  function formatRefaccionPrecioUsdCell(r) {
    const v = resolveRefaccionPrecioUsd(r);
    if (v == null) return '';
    const derived = !(Number(r.precio_usd) > 0);
    const title = derived ? ' title="Legado: estimado desde MXN y T.C. al registrar (o actual)"' : '';
    return '<strong' + title + '>US$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</strong>';
  }

  // ----- MÁQUINAS -----
  let maquinasViewMode = 'tabla'; // 'tabla' | 'tarjetas'

  function formatMaquinaFichaTecnicaCell(m) {
    const raw = m && m.ficha_tecnica != null ? String(m.ficha_tecnica).trim() : '';
    if (!raw) return '<span class="muted">—</span>';
    if (/^https?:\/\//i.test(raw)) {
      const host = raw.replace(/^https?:\/\//i, '');
      const label = host.length > 42 ? host.slice(0, 39) + '…' : host;
      return `<a href="${escapeHtml(raw)}" target="_blank" rel="noopener noreferrer" class="link-ficha-tecnica" title="${escapeHtml(raw)}"><i class="fas fa-external-link-alt"></i> ${escapeHtml(label)}</a>`;
    }
    const display = raw.length > 56 ? escapeHtml(raw.slice(0, 53)) + '…' : escapeHtml(raw);
    return `<span title="${escapeHtml(raw)}">${display}</span>`;
  }

  /** Payload completo para PUT /api/maquinas/:id (evita borrar campos al subir imagen desde la tabla). */
  function buildMaquinaPutPayload(m, overrides) {
    const o = overrides || {};
    const stockNum = m.stock != null && m.stock !== '' ? Number(m.stock) : 0;
    const plUsd = m.precio_lista_usd != null && m.precio_lista_usd !== '' ? Number(m.precio_lista_usd) : 0;
    return {
      cliente_id: m.cliente_id != null ? Number(m.cliente_id) : null,
      codigo: m.codigo != null && String(m.codigo).trim() !== '' ? String(m.codigo).trim() : null,
      nombre: (m.nombre || m.modelo || '').trim() || '',
      marca: m.marca != null && String(m.marca).trim() !== '' ? String(m.marca).trim() : null,
      modelo: m.modelo != null ? String(m.modelo) : null,
      numero_serie: m.numero_serie != null && String(m.numero_serie).trim() !== '' ? String(m.numero_serie).trim() : null,
      ubicacion: m.ubicacion != null && String(m.ubicacion).trim() !== '' ? String(m.ubicacion).trim() : null,
      categoria: m.categoria != null && String(m.categoria).trim() !== '' ? String(m.categoria).trim() : null,
      categoria_principal: m.categoria_principal != null && String(m.categoria_principal).trim() !== '' ? String(m.categoria_principal).trim() : null,
      subcategoria: o.subcategoria !== undefined
        ? o.subcategoria
        : (m.subcategoria != null && String(m.subcategoria).trim() !== '' ? String(m.subcategoria).trim() : null),
      imagen_pieza_url: o.imagen_pieza_url !== undefined ? o.imagen_pieza_url : (m.imagen_pieza_url || null),
      imagen_ensamble_url: o.imagen_ensamble_url !== undefined ? o.imagen_ensamble_url : (m.imagen_ensamble_url || null),
      stock: Number.isFinite(stockNum) ? stockNum : 0,
      precio_lista_usd: Number.isFinite(plUsd) ? plUsd : 0,
      ficha_tecnica: m.ficha_tecnica != null && String(m.ficha_tecnica).trim() !== '' ? String(m.ficha_tecnica).trim() : null,
    };
  }

  function readFileAsDataUrlInput(fileInput) {
    return new Promise((res) => {
      const file = fileInput && fileInput.files && fileInput.files[0];
      if (!file) { res(null); return; }
      const reader = new FileReader();
      reader.onload = (e) => res(e.target.result);
      reader.onerror = () => res(null);
      reader.readAsDataURL(file);
    });
  }

  function openModalMaquinaImagen(m) {
    const isImage = (url) => url && (String(url).startsWith('data:image') || /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(String(url)));
    let cur = '<p class="hint" style="margin:0">Sin imagen de catálogo. Elige un archivo abajo.</p>';
    if (m.imagen_pieza_url) {
      if (isImage(m.imagen_pieza_url)) {
        const imgRef = registerPvcMediaUrl(m.imagen_pieza_url);
        cur =
          `<div class="ref-foto-preview-wrap">
             <button type="button" class="js-refaccion-open-media" data-media-ref="${imgRef}" title="Ver imagen completa" style="border:none;background:transparent;padding:0;cursor:zoom-in;">
               <img src="${escapeHtml(m.imagen_pieza_url)}" class="ref-foto-thumb" alt="Vista previa" loading="lazy">
             </button>
             ${pvcDownloadBtnCompactHtml(imgRef, null, 'maquina-imagen-modal')}
           </div>`;
      } else {
        cur = `<p><a href="${escapeHtml(m.imagen_pieza_url)}" target="_blank" rel="noopener noreferrer" class="btn outline"><i class="fas fa-external-link-alt"></i> Ver imagen actual</a></p>`;
      }
    }
    const body = `
      <p style="margin-top:0"><strong>${escapeHtml(m.modelo || m.nombre || 'Máquina')}</strong> · ID sistema: <strong>${m.id}</strong></p>
      ${cur}
      <div class="form-group"><label>Subir o reemplazar imagen</label>
        <input type="file" id="maq-img-file" accept="image/*">
      </div>
      <p class="form-hint" style="font-size:0.8rem">Misma lógica que refacciones: la imagen se guarda en el registro (data URL).</p>
      <div class="form-actions">
        <button type="button" class="btn primary" id="maq-img-save"><i class="fas fa-save"></i> Guardar imagen</button>
        <button type="button" class="btn" id="modal-btn-cancel">Cerrar</button>
      </div>
    `;
    openModal('Imagen de máquina · ID ' + m.id, body);
    qs('#maq-img-save').onclick = async () => {
      const data = await readFileAsDataUrlInput(qs('#maq-img-file'));
      if (!data) { showToast('Selecciona una imagen.', 'error'); return; }
      const fresh = maquinasCache.find((x) => Number(x.id) === Number(m.id)) || m;
      const payload = buildMaquinaPutPayload(fresh, { imagen_pieza_url: data });
      const btn = qs('#maq-img-save');
      const orig = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';
      try {
        await fetchJson(API + '/maquinas/' + m.id, { method: 'PUT', body: JSON.stringify(payload) });
        qs('#modal').classList.add('hidden');
        showToast('Imagen guardada.', 'success');
        loadMaquinas({ force: true });
      } catch (e) { showToast(parseApiError(e) || 'No se pudo guardar la imagen.', 'error'); }
      finally { btn.disabled = false; btn.innerHTML = orig; }
    };
  }

  function previewMaquina(m) {
    clearPvcMediaUrlRegistry();
    const isImageUrl = (url) =>
      url && (String(url).startsWith('data:image') || /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(String(url)));
    const piezaUrl = m.imagen_pieza_url || '';
    const ensUrl = m.imagen_ensamble_url || '';
    const piezaThumb = piezaUrl ? piezaUrl : '/img/maquinas/placeholder-pieza.svg';
    const ensThumb = ensUrl && isImageUrl(ensUrl) ? ensUrl : '/img/maquinas/placeholder-ensamble.svg';
    const piezaMediaRef = piezaUrl ? registerPvcMediaUrl(piezaUrl) : '';
    const ensMediaRef = ensUrl ? registerPvcMediaUrl(ensUrl) : '';
    const ensBtnAttrs = ensUrl
      ? `class="ref-pvc-hero-doc js-refaccion-open-media" data-media-ref="${ensMediaRef}" title="Clic para abrir"`
      : `class="ref-pvc-hero-doc" title="Sin archivo de especificaciones"`;
    const ensKicker = ensUrl
      ? (String(ensUrl).startsWith('data:application/pdf') || /\.pdf(\?|$)/i.test(String(ensUrl)) ? 'PDF' : (isImageUrl(ensUrl) ? 'Imagen' : 'Archivo'))
      : '—';
    const underHeaderHtml = `
      <div class="ref-pvc-hero">
        <div class="ref-pvc-hero-inner ref-pvc-hero-inner--split">
          <div class="ref-pvc-hero-main">
            <div class="ref-pvc-hero-kicker ref-pvc-hero-kicker--accent"><i class="fas fa-image"></i> Imagen de carga máquina</div>
            ${
              piezaUrl
                ? heroFrameImageHtml(piezaMediaRef, null, piezaThumb, 'Imagen de carga máquina', 'maquina-imagen-carga')
                : '<div class="ref-pvc-hero-frame ref-pvc-hero-frame--empty" title="Sin imagen de carga máquina"><span class="ref-pvc-hero-frame-empty-inner">Sin imagen</span></div>'
            }
          </div>
          <div class="ref-pvc-hero-side ref-pvc-hero-side--thumb">
            <div class="ref-pvc-hero-kicker"><i class="fas fa-file-lines"></i> Especificaciones · ${escapeHtml(ensKicker)}</div>
            ${
              ensUrl && isImageUrl(ensUrl)
                ? heroFrameImageHtml(ensMediaRef, null, ensThumb, 'Especificaciones', 'maquina-especificaciones')
                : `<div class="ref-pvc-hero-doc-row">
                   <button type="button" ${ensBtnAttrs}>
                   <span class="ref-pvc-hero-doc-icon"><i class="fas ${ensUrl ? 'fa-file' : 'fa-file-circle-xmark'}"></i></span>
                   <div>
                     <div style="font-weight:800;line-height:1.1">${ensUrl ? 'Abrir archivo' : 'Sin archivo'}</div>
                     <div style="opacity:0.75;font-size:0.82rem;line-height:1.3">${ensUrl ? 'PDF o imagen (clic para abrir)' : 'Sube un PDF o imagen en Editar máquina'}</div>
                   </div>
                   <span class="ref-pvc-hero-doc-arrow"><i class="fas fa-arrow-up-right-from-square"></i></span>
                 </button>
                 ${ensUrl ? pvcMediaDownloadButtonHtml(ensMediaRef, null, 'maquina-especificaciones', 'ref-pvc-hero-doc-dl') : ''}
                 </div>`
            }
          </div>
        </div>
      </div>
    `;
    const ftRaw = (m.ficha_tecnica || '').trim();
    let fichaSpec = { label: 'Ficha técnica', value: '—', icon: 'fa-file-lines', full: true };
    if (ftRaw) {
      if (/^https?:\/\//i.test(ftRaw)) {
        fichaSpec = { label: 'Ficha técnica', value: `<a href="${escapeHtml(ftRaw)}" target="_blank" rel="noopener noreferrer">Abrir enlace</a>`, html: true, icon: 'fa-file-lines', full: true };
      } else {
        fichaSpec = { label: 'Ficha técnica', value: ftRaw, icon: 'fa-file-lines', full: true };
      }
    }
    openPreviewCard({
      title: m.categoria || m.modelo || m.nombre || 'Máquina',
      subtitle: [m.subcategoria, m.modelo || m.nombre].filter(Boolean).join(' · ') || (m.categoria_principal || ''),
      icon: 'fa-industry',
      color: 'linear-gradient(135deg, #1e3a5f 0%, #3b5998 100%)',
      badge: m.activo === 0 ? 'Inactiva' : 'Activa',
      badgeClass: m.activo === 0 ? 'pvc-badge--danger' : 'pvc-badge--success',
      underHeaderHtml,
      sections: [
        {
          title: 'Especificaciones', icon: 'fa-cog',
          fields: [
            { label: 'ID', value: m.id, icon: 'fa-hashtag' },
            { label: 'Centro / jerarquía', value: m.categoria_principal, icon: 'fa-sitemap' },
            { label: 'Nombre de la máquina', value: m.categoria, icon: 'fa-layer-group' },
            { label: 'Parte', value: m.subcategoria, icon: 'fa-puzzle-piece' },
            { label: 'Versión (modelo)', value: m.modelo || m.nombre, icon: 'fa-tag', full: true },
            { label: 'Número de serie', value: m.numero_serie, icon: 'fa-barcode' },
            fichaSpec,
            { label: 'Código interno', value: m.codigo, icon: 'fa-code' },
            { label: 'Stock (almacén demo)', value: m.stock != null ? String(m.stock) : '0', icon: 'fa-warehouse' },
          ],
        },
        {
          title: 'Ubicación y cliente', icon: 'fa-map-marker-alt',
          fields: [
            { label: 'Cliente', value: m.cliente_nombre, icon: 'fa-user-tie', full: true },
            { label: 'Zona / sucursal', value: m.ubicacion, icon: 'fa-map-marker-alt', full: true },
          ],
        },
      ],
      footerHtml:
        '<p class="pvc-footer-link-hint" style="font-size:0.82rem;color:var(--text-muted,#64748b);line-height:1.45;margin:0 0 0.75rem;">' +
        '<i class="fas fa-link"></i> Misma <strong>línea</strong> y <strong>parte</strong> que en refacciones (catálogo en <strong>Categorías</strong>). En cotización: <code>refaccion_id</code> o <code>maquina_id</code> por línea.</p>' +
        '<button type="button" class="btn outline btn-maq-to-ref"' +
        ((m.categoria && String(m.categoria).trim()) || (m.subcategoria && String(m.subcategoria).trim()) ? '' : ' disabled title="Agrega línea o parte desde el catálogo"') +
        '><i class="fas fa-cogs"></i> Ver refacciones con esta línea/parte</button>',
    });
    setTimeout(() => {
      const btn = qs('#modal-body .btn-maq-to-ref');
      if (btn && !btn.disabled) {
        btn.addEventListener('click', () => goToRefaccionesFromMaquinaSegmentos(m.categoria, m.subcategoria));
      }
    }, 0);
  }
  function renderMaquinaCard(m) {
    const _ce = canEdit(); const _cd = canDelete();
    const zona = escapeHtml(m.ubicacion || '—');
    const cat = escapeHtml(m.categoria || '—');
    const parte = (m.subcategoria && String(m.subcategoria).trim())
      ? `<div class="maq-card-parte">${escapeHtml(m.subcategoria)}</div>`
      : '';
    const modelo = escapeHtml(m.modelo || m.nombre || '—');
    const serie = escapeHtml(m.numero_serie || '—');
    const cliente = escapeHtml(m.cliente_nombre || '—');
    const ft = (m.ficha_tecnica || '').trim();
    const fichaLine = ft
      ? (/^https?:\/\//i.test(ft)
        ? `<div class="maq-card-row"><i class="fas fa-file-lines"></i> <strong>Ficha técnica:</strong> <a href="${escapeHtml(ft)}" target="_blank" rel="noopener noreferrer">Abrir</a></div>`
        : `<div class="maq-card-row" title="${escapeHtml(ft)}"><i class="fas fa-file-lines"></i> ${escapeHtml(ft.length > 72 ? ft.slice(0, 69) + '…' : ft)}</div>`)
      : '';
    const thumb = m.imagen_pieza_url
      ? `<div class="maq-card-thumb maq-card-thumb-upload" data-id="${m.id}" role="button" tabindex="0" title="Clic para subir o cambiar imagen"><img src="${escapeHtml(m.imagen_pieza_url)}" alt="" loading="lazy"></div>`
      : `<div class="maq-card-thumb maq-card-thumb--empty maq-card-thumb-upload" data-id="${m.id}" role="button" tabindex="0" title="Clic para subir imagen"><i class="fas fa-camera"></i></div>`;
    return `
      <div class="maq-card" data-id="${m.id}">
        ${thumb}
        <div class="maq-card-header">
          <span class="maq-card-cat">${cat}</span>
          <span class="maq-card-zona"><i class="fas fa-map-marker-alt"></i> ${zona}</span>
        </div>
        ${parte}
        <div class="maq-card-modelo" title="Versión / modelo">${modelo}</div>
        <div class="maq-card-body">
          <div class="maq-card-row"><i class="fas fa-barcode"></i> <strong>Serie:</strong> ${serie}</div>
          ${fichaLine}
          <div class="maq-card-row"><i class="fas fa-user-tie"></i> <strong>Cliente:</strong> ${cliente}</div>
        </div>
        <div class="maq-card-actions">
          <button type="button" class="btn small outline btn-view-maq" data-id="${m.id}" title="Ver ficha"><i class="fas fa-eye"></i> Ver</button>
          ${_ce ? `<button type="button" class="btn small primary btn-edit-maq" data-id="${m.id}" title="Editar"><i class="fas fa-edit"></i></button>` : ''}
          ${_cd ? `<button type="button" class="btn small danger btn-delete-maq" data-id="${m.id}" title="Eliminar"><i class="fas fa-trash"></i></button>` : ''}
        </div>
      </div>`;
  }

  function renderMaquinaFicha(m) {
    const zona = escapeHtml(m.ubicacion || '—');
    const cat = escapeHtml(m.categoria || '—');
    const parte = m.subcategoria && String(m.subcategoria).trim()
      ? `<div class="maq-ficha-parte">${escapeHtml(m.subcategoria)}</div>`
      : '';
    const modelo = escapeHtml(m.modelo || m.nombre || '—');
    const serie = escapeHtml(m.numero_serie || '—');
    const cliente = escapeHtml(m.cliente_nombre || '—');
    const ft = (m.ficha_tecnica || '').trim();
    const fichaTd = ft
      ? (/^https?:\/\//i.test(ft)
        ? `<a href="${escapeHtml(ft)}" target="_blank" rel="noopener noreferrer">${escapeHtml(ft)}</a>`
        : escapeHtml(ft))
      : '—';
    const imgs = (m.imagen_pieza_url || m.imagen_ensamble_url)
      ? `<div class="maq-ficha-imgs">
          ${m.imagen_pieza_url ? `<figure><figcaption>Pieza / parte</figcaption><img src="${escapeHtml(m.imagen_pieza_url)}" alt="Pieza"></figure>` : ''}
          ${m.imagen_ensamble_url ? `<figure><figcaption>Diagrama ensamble</figcaption><img src="${escapeHtml(m.imagen_ensamble_url)}" alt="Ensamble"></figure>` : ''}
        </div>`
      : '';
    const body = `
      <div class="maq-ficha">
        <div class="maq-ficha-header">
          <div class="maq-ficha-logo"><i class="fas fa-industry"></i></div>
          <div>
            <div class="maq-ficha-cat">${cat}</div>
            ${parte}
            <div class="maq-ficha-modelo">${modelo}</div>
          </div>
        </div>
        ${imgs}
        <table class="maq-ficha-table">
          <tr><th>Nº de Serie</th><td>${serie}</td></tr>
          <tr><th>Ficha técnica</th><td>${fichaTd}</td></tr>
          <tr><th>Cliente</th><td>${cliente}</td></tr>
          <tr><th>Zona</th><td>${zona}</td></tr>
          <tr><th>Stock</th><td>${escapeHtml(String(m.stock != null ? m.stock : 0))}</td></tr>
          <tr><th>ID sistema</th><td>${m.id}</td></tr>
        </table>
        <div class="maq-ficha-actions no-print">
          <button type="button" class="btn outline" onclick="window.print()"><i class="fas fa-print"></i> Imprimir ficha</button>
        </div>
      </div>`;
    openModal(`Ficha de máquina – ${cat} · ${modelo}`, body);
  }

  function renderMaquinas(data) {
    const tbody = qs('#tabla-maquinas tbody');
    const cardsWrap = qs('#maquinas-cards-wrap');

    if (maquinasViewMode === 'tarjetas') {
      tbody && (tbody.innerHTML = '');
      if (!cardsWrap) return;
      if (!data || data.length === 0) {
        cardsWrap.innerHTML = '<p class="empty" style="padding:2rem">No hay máquinas.</p>';
        return;
      }
      cardsWrap.innerHTML = data.map(renderMaquinaCard).join('');
      cardsWrap.querySelectorAll('.btn-edit-maq').forEach(btn => {
        btn.addEventListener('click', e => { e.stopPropagation(); const m = maquinasCache.find(x => x.id == btn.dataset.id); if (m) openModalMaquina(m); });
      });
      cardsWrap.querySelectorAll('.btn-delete-maq').forEach(btn => {
        btn.addEventListener('click', e => { e.stopPropagation(); openConfirmModal('¿Eliminar esta máquina?', () => deleteMaquina(btn.dataset.id)); });
      });
      cardsWrap.querySelectorAll('.btn-view-maq').forEach(btn => {
        btn.addEventListener('click', e => { e.stopPropagation(); const m = maquinasCache.find(x => x.id == btn.dataset.id); if (m) previewMaquina(m); });
      });
      cardsWrap.querySelectorAll('.maq-card-thumb-upload').forEach(el => {
        el.addEventListener('click', e => { e.stopPropagation(); const row = maquinasCache.find(x => x.id == el.dataset.id); if (row) openModalMaquinaImagen(row); });
        el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
      });
      return;
    }

    // Vista tabla
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">No hay máquinas. Carga datos demo o agrega una nueva.</td></tr>';
      return;
    }
    const _canEdit = canEdit(); const _canDelete = canDelete();
    data.forEach(m => {
      const tr = document.createElement('tr');
      const idCell = m.imagen_pieza_url
        ? `<span class="ref-img-hover-wrap" tabindex="-1"><button type="button" class="btn-id-maq link-btn" data-id="${m.id}" title="Subir o ver imagen de catálogo">${m.id}</button><img class="ref-img-hover-preview" src="${escapeHtml(m.imagen_pieza_url)}" alt="" loading="lazy"></span>`
        : `<button type="button" class="btn-id-maq link-btn" data-id="${m.id}" title="Subir imagen (catálogo)">${m.id}</button>`;
      tr.innerHTML = `
        <td>${idCell}</td>
        <td>${escapeHtml(m.categoria || '')}</td>
        <td>${escapeHtml(m.subcategoria || '')}</td>
        <td><strong>${escapeHtml(m.modelo || m.nombre || '')}</strong></td>
        <td>${formatMaquinaFichaTecnicaCell(m)}</td>
        <td class="th-actions">
          <button type="button" class="btn small outline btn-view-maq" data-id="${m.id}" title="Ver ficha"><i class="fas fa-eye"></i></button>
          ${_canEdit ? `<button type="button" class="btn small primary btn-edit-maq" data-id="${m.id}"><i class="fas fa-edit"></i></button>` : ''}
          ${_canDelete ? `<button type="button" class="btn small danger btn-delete-maq" data-id="${m.id}"><i class="fas fa-trash"></i></button>` : ''}
        </td>
      `;
      tbody.appendChild(tr);
    });
    updateTableFooter('tabla-maquinas', data.length, maquinasCache.length, () => clearTableFiltersAndRefresh('tabla-maquinas', null, applyMaquinasFiltersAndRender), arguments[1]);
    animateTableRows('tabla-maquinas');
    tbody.querySelectorAll('.btn-id-maq').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const row = data.find(x => x.id == btn.dataset.id); if (row) openModalMaquinaImagen(row); });
    });
    tbody.querySelectorAll('.btn-view-maq').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const m = data.find(x => x.id == btn.dataset.id); if (m) previewMaquina(m); });
    });
    tbody.querySelectorAll('.btn-edit-maq').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const m = data.find(x => x.id == btn.dataset.id); if (m) openModalMaquina(m); });
    });
    tbody.querySelectorAll('.btn-delete-maq').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openConfirmModal('¿Eliminar esta máquina?', () => deleteMaquina(btn.dataset.id)); });
    });
  }

  async function deleteMaquina(id) {
    try {
      await fetchJson(API + '/maquinas/' + id, { method: 'DELETE' });
      showToast('Máquina eliminada correctamente.', 'success');
      loadMaquinas({ force: true });
    } catch (e) { showToast(parseApiError(e) || 'No se pudo eliminar.', 'error'); }
  }

  async function loadMaquinas(opts) {
    const force = !!(opts && opts.force);
    if (force) skipNextMaquinasFetchAfterDashboard = false;
    else if (skipNextMaquinasFetchAfterDashboard) {
      skipNextMaquinasFetchAfterDashboard = false;
      applyMaquinasFiltersAndRender();
      return;
    }
    showLoading();
    renderTableSkeleton('tabla-maquinas', 6);
    try {
      const data = await fetchJson(`${API}/maquinas`);
      maquinasCache = data;
      applyMaquinasFiltersAndRender();
    } catch (e) { renderMaquinas([]); console.error(e); }
    finally { hideLoading(); }
  }

  /**
   * Refacciones y máquinas comparten segmentos de catálogo: `categoria` (línea / nombre de máquina) y
   * `subcategoria` (parte), definidos en GET /api/categorias-catalogo (pestaña Categorías). No hay FK
   * entre tablas: la relación es por texto igual. En cotización el vínculo explícito es por línea:
   * `refaccion_id` o `maquina_id`.
   */
  async function goToMaquinasFromRefaccionSegmentos(categoria, subcategoria) {
    const c = refCategoriaLabel(categoria);
    const s = refCategoriaLabel(subcategoria);
    if (!c && !s) {
      showToast('No hay línea ni parte de catálogo en esta refacción.', 'warning');
      return;
    }
    const mod = qs('#modal');
    if (mod) mod.classList.add('hidden');
    showPanel('maquinas', { skipLoad: true });
    try {
      await loadMaquinas({ force: true });
    } catch (_) {}
    const inpCat = qs('#tabla-maquinas .filter-input[data-key="categoria"]');
    const inpSub = qs('#tabla-maquinas .filter-input[data-key="subcategoria"]');
    if (inpSub) inpSub.value = '';
    if (inpCat) inpCat.value = '';
    let appliedCat = false;
    if (c && inpCat) {
      inpCat.value = c;
      appliedCat = true;
    }
    if (s && inpSub) inpSub.value = s;
    if (c && !appliedCat) showToast('No hay coincidencia en el filtro de nombre de máquina. Revisa el catálogo o filtra manualmente.', 'warning');
    applyMaquinasFiltersAndRender();
  }

  async function goToMaquinasFromRefaccionCategoria(categoria) {
    return goToMaquinasFromRefaccionSegmentos(categoria, null);
  }

  /** Desde vista previa de máquina: ir a Refacciones con los mismos segmentos de catálogo (dropdowns + filtros). */
  async function goToRefaccionesFromMaquinaSegmentos(categoria, subcategoria) {
    const c = refCategoriaLabel(categoria);
    const s = refCategoriaLabel(subcategoria);
    if (!c && !s) {
      showToast('No hay línea ni parte de catálogo en esta máquina.', 'warning');
      return;
    }
    const mod = qs('#modal');
    if (mod) mod.classList.add('hidden');
    showPanel('refacciones', { skipLoad: true });
    try {
      await loadRefacciones();
    } catch (_) {}
    const selCat = qs('#filtro-categoria-ref');
    const selSub = qs('#filtro-subcategoria-ref');
    const inpCatTbl = qs('#tabla-refacciones .filter-input[data-key="categoria"]');
    if (inpCatTbl) inpCatTbl.value = '';
    if (c) {
      const inDropdown = selCat && Array.from(selCat.options).some(o => o.value === c);
      if (inDropdown) {
        selCat.value = c;
      } else if (inpCatTbl) {
        selCat.value = '';
        inpCatTbl.value = c;
      } else if (selCat) selCat.value = '';
    } else if (selCat) selCat.value = '';
    refillRefaccionSubcategoriaOptions();
    if (s && selSub) {
      const hasOpt = Array.from(selSub.options).some(o => o.value === s);
      if (hasOpt) selSub.value = s;
      else showToast('La parte no está en el desplegable del árbol; revisa Categorías o filtra manualmente.', 'warning');
    }
    applyRefaccionesFiltersAndRender();
  }

  // ----- COTIZACIONES (módulo rehecho: carga + render explícitos) -----
  /** HTML de vista previa tipo documento comercial (alineado al PDF de cotización). */
  function buildCotizacionPreviewDocHtml(cot) {
    const tipoLabel = cot.tipo === 'mano_obra' ? 'Mano de obra' : cot.tipo === 'refacciones' ? 'Refacciones' : (cot.tipo || 'Cotización');
    const moneda = (cot.moneda || 'USD').toUpperCase();
    const tipoCambio = Number(cot.tipo_cambio) || 0;
    const subtotal = Number(cot.subtotal) || 0;
    const iva = Number(cot.iva) || 0;
    const total = Number(cot.total) || subtotal + iva;
    function fmtDate(s) { return s ? String(s).slice(0, 10) : '—'; }
    function validHasta(fecha) { const d = new Date(fecha || Date.now()); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); }
    function fmtMonto(n) {
      if (moneda === 'USD') return 'US$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function fmtUsd(n) { return 'US$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function fmtMxn(n) { return '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function tipoLineaLbl(t) {
      const m = { refaccion: 'Refacción', vuelta: 'Vuelta', mano_obra: 'Mano de obra', equipo: 'Equipo / máquina', otro: 'Otro' };
      const k = String(t || '').trim();
      return escapeHtml(m[k] || (k || '—'));
    }
    function lineDesc(l) {
      let desc = l.refaccion_descripcion
        ? (l.codigo ? (l.codigo + ' — ' + l.refaccion_descripcion) : l.refaccion_descripcion)
        : (l.descripcion || '');
      if (String(l.tipo_linea || '') === 'vuelta' && !String(desc || '').trim()) {
        const parts = [];
        if (Number(l.es_ida)) parts.push('Ida');
        const ht = Number(l.horas_trabajo) || 0;
        const htr = Number(l.horas_traslado) || 0;
        if (ht) parts.push(ht + 'h trabajo');
        if (htr) parts.push(htr + 'h traslado');
        desc = parts.length ? parts.join(' · ') : 'Vuelta';
      }
      return escapeHtml(desc);
    }
    function unitUsdMxn(l) {
      const pu = Number(l.precio_unitario || 0);
      let usd; let mxn;
      if (moneda === 'USD') {
        usd = pu;
        mxn = tipoCambio > 0 ? pu * tipoCambio : null;
      } else {
        mxn = pu;
        if (l.precio_usd != null && l.precio_usd !== '') usd = Number(l.precio_usd);
        else usd = tipoCambio > 0 ? pu / tipoCambio : null;
      }
      return { usd, mxn };
    }
    const lineas = Array.isArray(cot.lineas) ? cot.lineas : [];
    let rows = '';
    if (lineas.length > 0) {
      rows = lineas.map((l) => {
        const { usd, mxn } = unitUsdMxn(l);
        const colUsd = usd != null && !isNaN(usd) ? fmtUsd(usd) : '—';
        const colMxn = mxn != null && !isNaN(mxn) ? fmtMxn(mxn) : '—';
        return `<tr>
          <td>${tipoLineaLbl(l.tipo_linea)}</td>
          <td class="cdp-num">${escapeHtml(String(l.codigo || '—'))}</td>
          <td>${escapeHtml(String(l.maquina_nombre || '—'))}</td>
          <td class="cdp-desc">${lineDesc(l)}</td>
          <td class="cdp-num">${Number(l.cantidad || 1)}</td>
          <td class="cdp-num">${colUsd}</td>
          <td class="cdp-num">${colMxn}</td>
          <td class="cdp-num cdp-num--strong">${fmtMonto(Number(l.subtotal || (l.cantidad || 1) * (l.precio_unitario || 0)))}</td>
        </tr>`;
      }).join('');
    } else {
      rows = `<tr>
        <td>${escapeHtml(tipoLabel)}</td>
        <td class="cdp-num">—</td>
        <td>—</td>
        <td class="cdp-desc">${escapeHtml(tipoLabel)}</td>
        <td class="cdp-num">1</td>
        <td class="cdp-num">—</td>
        <td class="cdp-num">—</td>
        <td class="cdp-num cdp-num--strong">${fmtMonto(subtotal)}</td>
      </tr>`;
    }
    const vendedorTxt = [cot.vendedor_catalogo_nombre, cot.vendedor, cot.vendedor_puesto].filter(Boolean).join(' · ') || '—';
    const descPct = cot.descuento_pct != null && Number(cot.descuento_pct) > 0 ? String(cot.descuento_pct) + '%' : null;
    const tcLine = tipoCambio > 0 ? `<p class="cdp-tc-note">Tipo de cambio: 1 USD = $${Number(tipoCambio).toFixed(2)} MXN</p>` : '';
    const equivUsd = moneda === 'USD' && tipoCambio > 0
      ? `<p class="cdp-equiv"><span>Equivalente MXN</span><span>${fmtMxn(total * tipoCambio)}</span></p>`
      : '';
    return `
<div class="cotizacion-doc-preview">
  <div class="cdp-hero">
    <div class="cdp-hero-main">
      <span class="cdp-kicker">Documento</span>
      <h3 class="cdp-doc-title">COTIZACIÓN</h3>
      <p class="cdp-folio-line"><strong>${escapeHtml(String(cot.folio || '—'))}</strong></p>
    </div>
    <div class="cdp-hero-meta">
      <div><span class="cdp-mini-k">Emisión</span><span class="cdp-mini-v">${fmtDate(cot.fecha)}</span></div>
      <div><span class="cdp-mini-k">Vigencia</span><span class="cdp-mini-v">${fmtDate(validHasta(cot.fecha))}</span></div>
      <div><span class="cdp-mini-k">Modalidad</span><span class="cdp-mini-v">${escapeHtml(tipoLabel)}</span></div>
    </div>
  </div>
  <div class="cdp-strip">
    <span class="cdp-pill"><i class="fas fa-coins"></i> ${escapeHtml(moneda)}${tipoCambio > 0 ? ' · T.C. ' + Number(tipoCambio).toFixed(2) : ''}</span>
    <span class="cdp-pill"><i class="fas fa-percent"></i> IVA 16%</span>
    <span class="cdp-pill cdp-pill--accent"><i class="fas fa-file-invoice-dollar"></i> Total ${fmtMonto(total)}</span>
  </div>
  <div class="cdp-grid-2">
    <div class="cdp-card cdp-card--client">
      <div class="cdp-card-head"><i class="fas fa-building"></i> Cliente</div>
      <p class="cdp-client-name">${escapeHtml(String(cot.cliente_nombre || '—'))}</p>
    </div>
    <div class="cdp-card cdp-card--money">
      <div class="cdp-card-head"><i class="fas fa-calculator"></i> Resumen (${escapeHtml(moneda)})</div>
      <div class="cdp-money-row"><span>Subtotal</span><span>${fmtMonto(subtotal)}</span></div>
      <div class="cdp-money-row"><span>IVA 16%</span><span>${fmtMonto(iva)}</span></div>
      <div class="cdp-money-row cdp-money-row--total"><span>Total</span><span>${fmtMonto(total)}</span></div>
      ${equivUsd}
      ${tcLine}
    </div>
  </div>
  <div class="cdp-table-scroll">
    <table class="cdp-table">
      <thead>
        <tr>
          <th>Tipo</th>
          <th>Código</th>
          <th>Máquina</th>
          <th>Concepto</th>
          <th class="cdp-th-num">Cant.</th>
          <th class="cdp-th-num">P.u. USD</th>
          <th class="cdp-th-num">P.u. MXN</th>
          <th class="cdp-th-num">Subtotal (${escapeHtml(moneda)})</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <div class="cdp-footer-meta">
    <span><i class="fas fa-user-tie"></i> ${escapeHtml(vendedorTxt)}</span>
    ${descPct ? `<span><i class="fas fa-tag"></i> Descuento ${escapeHtml(descPct)}</span>` : ''}
    ${cot.fecha_aprobacion ? `<span><i class="fas fa-check-circle"></i> Aprobación ${fmtDate(cot.fecha_aprobacion)}</span>` : ''}
  </div>
  ${cot.notas ? `<div class="cdp-notes-block"><strong>Notas</strong><p>${escapeHtml(String(cot.notas))}</p></div>` : ''}
  <p class="cdp-disclaimer">Los importes en la columna Subtotal están expresados en <strong>${escapeHtml(moneda)}</strong>. Columnas USD/MXN son referencia. Vigencia sujeta a disponibilidad.</p>
</div>`;
  }

  async function previewCotizacion(c) {
    if (!c || c.id == null) return;
    const estadoColors = { pendiente: 'pvc-badge--warning', aplicada: 'pvc-badge--success', venta: 'pvc-badge--success', cancelada: 'pvc-badge--danger' };
    showLoading();
    try {
      const cot = await fetchJson(API + '/cotizaciones/' + c.id);
      const html = buildCotizacionPreviewDocHtml(cot);
      openPreviewCard({
        title: cot.folio || 'Cotización',
        subtitle: cot.cliente_nombre || '',
        icon: 'fa-file-invoice-dollar',
        color: 'linear-gradient(125deg, #1e3a5f 0%, #2563eb 52%, #0d9488 100%)',
        badge: cot.estado || 'pendiente',
        badgeClass: estadoColors[c.estado] || 'pvc-badge--warning',
        sections: [],
        customBodyHtml: html,
        previewCardClass: 'preview-card--cotizacion-doc'
      });
    } catch (e) {
      showToast(parseApiError(e) || 'No se pudo cargar la cotización.', 'error');
    } finally {
      hideLoading();
    }
  }
  function renderCotizaciones(data, totalInSystem) {
    const panel = qs('#panel-cotizaciones');
    if (!panel) return;
    const emptyEl = panel.querySelector('#cotizaciones-empty');
    const listEl = panel.querySelector('#cotizaciones-list');
    const table = panel.querySelector('#tabla-cotizaciones');
    const tbody = table ? table.querySelector('tbody') : null;
    if (!emptyEl || !listEl || !tbody) return;
    const list = Array.isArray(data) ? data : [];
    const total = totalInSystem != null ? totalInSystem : list.length;
    const hayRegistros = total > 0;
    const hayFilasVisibles = list.length > 0;
    emptyEl.classList.toggle('hidden', hayRegistros);
    listEl.classList.toggle('hidden', !hayRegistros);
    tbody.innerHTML = '';
    if (!hayRegistros) return;
    if (!hayFilasVisibles) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty filter-empty"><span>No hay resultados con los filtros aplicados.</span> <button type="button" class="btn small primary clear-filters-inline">Quitar filtros</button></td></tr>';
      const btn = tbody.querySelector('.clear-filters-inline');
      if (btn) btn.addEventListener('click', () => clearTableFiltersAndRefresh('tabla-cotizaciones', null, applyCotizacionesFiltersAndRender));
      updateTableFooter('tabla-cotizaciones', 0, cotizacionesCache.length, () => clearTableFiltersAndRefresh('tabla-cotizaciones', null, applyCotizacionesFiltersAndRender));
      return;
    }
    const _canEdit = canEdit(); const _canDelete = canDelete();
    list.forEach(c => {
      const vig = getVigenciaSemaphore(c);
      const moneda = c.moneda || 'USD';
      const totalFmt = c.total != null
        ? (moneda === 'USD' ? 'US$' + Number(c.total).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '$' + Number(c.total).toLocaleString('es-MX', { minimumFractionDigits: 2 }))
        : '';
      const tcNum = Number(c.tipo_cambio);
      const tcFmt = Number.isFinite(tcNum) && tcNum > 0 ? tcNum.toFixed(2) : '';
      const estadoMap = { pendiente: 'Pendiente', aplicada: 'Aplicada', cancelada: 'Cancelada', venta: 'Venta' };
      const estadoLabel = estadoMap[c.estado] || c.estado || 'Pendiente';
      const estadoClass = { pendiente: 'semaforo-amarillo', aplicada: 'semaforo-verde', venta: 'semaforo-verde', cancelada: 'semaforo-rojo' }[c.estado] || 'semaforo-gris';
      const tr = document.createElement('tr');
      if (c.estado === 'aplicada' || c.estado === 'venta') tr.classList.add('row-cot-aplicada');
      tr.innerHTML = `
        <td>${escapeHtml(String(c.folio || ''))}</td>
        <td class="td-text-wrap">${escapeHtml(String(c.cliente_nombre || ''))}</td>
        <td>${escapeHtml(String(c.tipo || ''))}</td>
        <td>${escapeHtml(String((c.fecha || '').toString().slice(0, 10)))}</td>
        <td><span class="badge badge-moneda">${moneda}</span></td>
        <td>
          <span class="badge badge-moneda" title="Tipo de cambio">${tcFmt ? escapeHtml(tcFmt) : '—'}</span>
          <button type="button" class="btn tiny outline btn-edit-tc" data-id="${c.id}" data-tc="${tcFmt || ''}" title="Editar tipo de cambio en tabla">
            <i class="fas fa-pen"></i>
          </button>
        </td>
        <td>${totalFmt || '—'}</td>
        <td><span class="semaforo ${estadoClass}">${estadoLabel}</span></td>
        <td class="sla-cell"><span class="semaforo semaforo-${vig.color}" title="${escapeHtml(vig.label)}"><i class="fas ${vig.icon}"></i> ${escapeHtml(vig.label)}</span></td>
        <td class="th-actions">
          <button type="button" class="btn small outline btn-preview-cot" data-id="${c.id}" title="Vista previa"><i class="fas fa-eye"></i></button>
          <button type="button" class="btn small outline btn-pdf-cot" data-id="${c.id}" title="Descargar / Imprimir PDF para cliente"><i class="fas fa-file-pdf"></i></button>
          ${c.estado !== 'aplicada' && c.estado !== 'venta' ? `<button type="button" class="btn small success btn-aplicar-cot" data-id="${c.id}" title="Aprobar como venta"><i class="fas fa-check"></i></button>` : ''}
          ${_canEdit ? `<button type="button" class="btn small primary btn-edit-cot" data-id="${c.id}" title="Editar"><i class="fas fa-edit"></i></button>` : ''}
          ${_canDelete ? `<button type="button" class="btn small danger btn-delete-cot" data-id="${c.id}" title="Eliminar"><i class="fas fa-trash"></i></button>` : ''}
        </td>
      `;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.btn-preview-cot').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const c = cotizacionesCache.find(x => x.id == btn.dataset.id); if (c) previewCotizacion(c); });
    });
    tbody.querySelectorAll('.btn-aplicar-cot').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        openConfirmModal('¿Aprobar como venta? Se descontará del almacén la cantidad de cada refacción en las líneas (según catálogo).', () => aplicarCotizacion(btn.dataset.id));
      });
    });
    tbody.querySelectorAll('.btn-pdf-cot').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openCotizacionPdf(btn.dataset.id); });
    });
    tbody.querySelectorAll('.btn-edit-cot').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); editCotizacion(btn.dataset.id); });
    });
    // btn-duplicate-cot removido
    tbody.querySelectorAll('.btn-delete-cot').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openConfirmModal('¿Eliminar esta cotización?', () => deleteCotizacion(btn.dataset.id)); });
    });
    tbody.querySelectorAll('.btn-edit-tc').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.id);
        if (!id) return;
        const actual = btn.dataset.tc || '';
        const raw = window.prompt('Nuevo tipo de cambio (MXN por USD):', actual || '17.00');
        if (raw == null) return;
        const next = Number(String(raw).replace(',', '.').trim());
        if (!Number.isFinite(next) || next <= 0) {
          showToast('Tipo de cambio inválido. Usa un número mayor a 0.', 'error');
          return;
        }
        await updateCotizacionTipoCambioInline(id, next);
      });
    });
    updateTableFooter('tabla-cotizaciones', list.length, cotizacionesCache.length, () => clearTableFiltersAndRefresh('tabla-cotizaciones', null, applyCotizacionesFiltersAndRender), arguments[2]);
    animateTableRows('tabla-cotizaciones');
  }

  async function loadCotizaciones(opts) {
    const force = !!(opts && opts.force);
    if (!canAccessCotizaciones()) {
      skipNextCotizacionesFetchAfterDashboard = false;
      cotizacionesCache = [];
      applyCotizacionesFiltersAndRender();
      return;
    }
    if (force) skipNextCotizacionesFetchAfterDashboard = false;
    else if (skipNextCotizacionesFetchAfterDashboard) {
      skipNextCotizacionesFetchAfterDashboard = false;
      applyCotizacionesFiltersAndRender();
      refreshDavidComisionesCotPanel();
      return;
    }
    showLoading();
    const table = qs('#tabla-cotizaciones');
    if (table && table.querySelector('tbody')) renderTableSkeleton('tabla-cotizaciones', 7);
    try {
      const raw = await fetchJson(API + '/cotizaciones');
      cotizacionesCache = toArray(raw);
      applyCotizacionesFiltersAndRender();
    } catch (e) {
      applyCotizacionesFiltersAndRender();
      showToast(parseApiError(e) || 'No se pudieron cargar las cotizaciones.', 'error');
    } finally {
      hideLoading();
      refreshDavidComisionesCotPanel();
      try {
        if (qs('#panel-almacen') && qs('#panel-almacen').classList.contains('active')) {
          refreshMaquinaBloqueoCotizacionMap(null).then(function () {
            renderAlmacenTable();
          });
        }
      } catch (_) {}
    }
  }

  async function deleteCotizacion(id) {
    try {
      await fetchJson(API + '/cotizaciones/' + id, { method: 'DELETE' });
      showToast('Cotización eliminada correctamente.', 'success');
      loadCotizaciones({ force: true });
    } catch (e) { showToast(parseApiError(e) || 'No se pudo eliminar.', 'error'); }
  }

  async function refreshMaquinaBloqueoCotizacionMap(excludeCotId) {
    maquinaIdBloqueoCotizacionMap = new Map();
    if (!canAccessCotizaciones()) return;
    const ex = excludeCotId != null && excludeCotId !== '' ? Number(excludeCotId) : 0;
    const list = toArray(cotizacionesCache).filter(
      (c) => String(c.estado || '').toLowerCase() === 'pendiente' && Number(c.id) !== ex && Number(c.id) > 0
    );
    const details = await Promise.all(
      list.map((c) => fetchJson(API + '/cotizaciones/' + c.id).catch(() => null))
    );
    details.forEach((full, i) => {
      const c = list[i];
      if (!full || !Array.isArray(full.lineas)) return;
      full.lineas.forEach((l) => {
        const mid = l.maquina_id != null ? Number(l.maquina_id) : null;
        if (!mid || !Number.isFinite(mid)) return;
        if (!maquinaIdBloqueoCotizacionMap.has(mid)) {
          maquinaIdBloqueoCotizacionMap.set(mid, {
            cotId: c.id,
            folio: full.folio != null && String(full.folio).trim() !== '' ? String(full.folio) : String(c.id),
          });
        }
      });
    });
  }

  function isMaquinaBloqueadaPorOtraCot(maquinaId, excludeCotId) {
    const bid = maquinaId != null && Number.isFinite(Number(maquinaId)) ? Number(maquinaId) : null;
    if (bid == null) return null;
    const lock = maquinaIdBloqueoCotizacionMap.get(bid);
    if (!lock) return null;
    if (excludeCotId != null && Number(lock.cotId) === Number(excludeCotId)) return null;
    return lock;
  }

  function resolveRefaccionIdFromDeleteInput(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    const list = toArray(refaccionesCache);
    const found = list.find(function (r) {
      return String(r.codigo || '')
        .trim()
        .toLowerCase() === s.toLowerCase();
    });
    return found && found.id != null ? Number(found.id) : null;
  }

  function resolveCotizacionIdFromDeleteInput(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    const list = toArray(cotizacionesCache);
    const found = list.find(function (c) {
      return String(c.folio || '')
        .trim()
        .toLowerCase() === s.toLowerCase();
    });
    return found && found.id != null ? Number(found.id) : null;
  }

  function syncModuleDeleteZonesVisibility() {
    qsAll('.module-delete-zone').forEach(function (el) {
      el.classList.toggle('hidden', !canDelete());
    });
  }

  function setupModuleDeleteZones() {
    if (setupModuleDeleteZones._done) return;
    setupModuleDeleteZones._done = true;

    qs('#btn-delete-cliente-zona')?.addEventListener('click', function () {
      if (!canDelete()) {
        showToast('Solo el administrador puede eliminar registros.', 'error');
        return;
      }
      const raw = qs('#delete-cliente-id') && qs('#delete-cliente-id').value;
      const id = parseInt(String(raw || '').trim(), 10);
      if (!Number.isFinite(id)) {
        showToast('Escribe el ID numérico del cliente (columna Id en la tabla).', 'error');
        return;
      }
      openConfirmModal('¿Eliminar el cliente con ID ' + id + '? Si tiene máquinas u otros vínculos, el servidor puede rechazar la operación.', function () {
        deleteCliente(id);
        const inp = qs('#delete-cliente-id');
        if (inp) inp.value = '';
      });
    });

    qs('#btn-delete-refaccion-zona')?.addEventListener('click', function () {
      if (!canDelete()) {
        showToast('Solo el administrador puede eliminar registros.', 'error');
        return;
      }
      const raw = qs('#delete-refaccion-id') && qs('#delete-refaccion-id').value;
      const id = resolveRefaccionIdFromDeleteInput(raw);
      if (id == null) {
        showToast('No se encontró: escribe el ID numérico o el código exacto de la refacción.', 'error');
        return;
      }
      openConfirmModal('¿Eliminar esta refacción del catálogo? Esta acción no se puede deshacer.', function () {
        deleteRefaccion(id);
        const inp = qs('#delete-refaccion-id');
        if (inp) inp.value = '';
      });
    });

    qs('#btn-delete-maquina-zona')?.addEventListener('click', function () {
      if (!canDelete()) {
        showToast('Solo el administrador puede eliminar registros.', 'error');
        return;
      }
      const raw = qs('#delete-maquina-id') && qs('#delete-maquina-id').value;
      const id = parseInt(String(raw || '').trim(), 10);
      if (!Number.isFinite(id)) {
        showToast('Escribe el ID numérico de la máquina (columna Id en la tabla).', 'error');
        return;
      }
      openConfirmModal('¿Eliminar esta máquina del catálogo? Esta acción no se puede deshacer.', function () {
        deleteMaquina(id);
        const inp = qs('#delete-maquina-id');
        if (inp) inp.value = '';
      });
    });

    qs('#btn-delete-cotizacion-zona')?.addEventListener('click', function () {
      if (!canDelete()) {
        showToast('Solo el administrador puede eliminar registros.', 'error');
        return;
      }
      const raw = qs('#delete-cotizacion-id') && qs('#delete-cotizacion-id').value;
      const id = resolveCotizacionIdFromDeleteInput(raw);
      if (id == null) {
        showToast('No se encontró: escribe el ID numérico o el folio exacto de la cotización.', 'error');
        return;
      }
      openConfirmModal('¿Eliminar esta cotización? Se quitarán también sus líneas. Esta acción no se puede deshacer.', function () {
        deleteCotizacion(id);
        const inp = qs('#delete-cotizacion-id');
        if (inp) inp.value = '';
      });
    });

    qsAll('.btn-vaciar-modulo').forEach(function (btn) {
      if (btn._vaciarBound) return;
      btn._vaciarBound = true;
      btn.addEventListener('click', function () {
        const mod = String(btn.getAttribute('data-modulo') || '').trim().toLowerCase();
        if (!mod) return;
        if (!canDelete()) {
          showToast('Solo el administrador puede vaciar tablas.', 'error');
          return;
        }
        const tag =
          'VACIAR-' +
          mod
            .toUpperCase()
            .replace(/[^a-z0-9]+/gi, '-')
            .replace(/^-|-$/g, '');
        openConfirmModal(
          'Se borrarán todas las filas del módulo «' + mod + '». No hay deshacer. ¿Continuar?',
          function () {
            const c = window.prompt('Para confirmar, escribe exactamente: ' + tag);
            if (c !== tag) {
              if (c != null && String(c).trim() !== '') showToast('Confirmación incorrecta.', 'error');
              return;
            }
            fetchJson(API + '/admin/vaciar-modulo', {
              method: 'POST',
              body: JSON.stringify({ modulo: mod, confirm: c }),
            })
              .then(function (j) {
                const n = j && j.deleted != null ? j.deleted : '';
                showToast('Tabla vaciada' + (n !== '' ? ' (' + n + ' filas).' : '.'), 'success');
                if (mod === 'refacciones') loadRefacciones();
                else if (mod === 'clientes') loadClientes({ force: true });
                else if (mod === 'maquinas') loadMaquinas({ force: true });
                else if (mod === 'cotizaciones') loadCotizaciones({ force: true });
                else if (mod === 'prospectos' && typeof loadProspeccion === 'function') loadProspeccion();
              })
              .catch(function (e) {
                showToast(parseApiError(e) || 'No se pudo vaciar.', 'error');
              });
          }
        );
      });
    });

    syncModuleDeleteZonesVisibility();
  }

  async function aplicarCotizacion(id) {
    try {
      await fetchJson(API + '/cotizaciones/' + id + '/aplicar', { method: 'POST', body: JSON.stringify({}) });
      showToast('Cotización aplicada como venta. Inventario actualizado.', 'success');
      loadCotizaciones({ force: true });
      loadRefacciones();
      loadVentas();
      if (typeof refreshAlertasHeader === 'function') refreshAlertasHeader();
    } catch (e) { showToast(parseApiError(e) || 'No se pudo aplicar la cotización.', 'error'); }
  }

  async function updateCotizacionTipoCambioInline(id, tc) {
    try {
      await fetchJson(`${API}/cotizaciones/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ tipo_cambio: Number(tc) }),
      });
      await loadCotizaciones({ force: true });
      showToast('Tipo de cambio actualizado.', 'success');
    } catch (e) {
      showToast(parseApiError(e) || 'No se pudo actualizar el tipo de cambio.', 'error');
    }
  }

  // ----- REPORTES -----
  function previewReporte(r) {
    const tipoColors = { garantia: 'pvc-badge--purple', instalacion: 'pvc-badge--info', servicio: 'pvc-badge--warning', venta: 'pvc-badge--success' };
    openPreviewCard({
      title: r.folio || 'Reporte',
      subtitle: r.razon_social || r.cliente_nombre || '',
      icon: 'fa-file-alt',
      color: 'linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)',
      badge: r.tipo_reporte || '',
      badgeClass: tipoColors[r.tipo_reporte] || 'pvc-badge--info',
      sections: [{
        title: 'Datos del reporte', icon: 'fa-info-circle',
        fields: [
          { label: 'Folio', value: r.folio, icon: 'fa-hashtag' },
          { label: 'Cliente / Razón social', value: r.razon_social || r.cliente_nombre, icon: 'fa-building', full: true },
          { label: 'Máquina', value: r.maquina_nombre || r.maquina_modelo, icon: 'fa-industry' },
          { label: 'Nº Serie', value: r.numero_maquina || r.maquina_serie, icon: 'fa-barcode' },
          { label: 'Tipo', value: r.tipo_reporte, icon: 'fa-tag', badge: true, badgeClass: tipoColors[r.tipo_reporte] || '' },
          { label: 'Subtipo', value: r.subtipo, icon: 'fa-tags' },
          { label: 'Técnico', value: r.tecnico, icon: 'fa-hard-hat' },
          { label: 'Fecha', value: (r.fecha || '').toString().slice(0, 10), icon: 'fa-calendar' },
          { label: 'Fecha programada', value: r.fecha_programada ? (r.fecha_programada + '').slice(0, 10) : '', icon: 'fa-calendar-check' },
          { label: 'Estatus', value: r.estatus, icon: 'fa-flag', badge: true, badgeClass: r.estatus === 'cerrado' ? 'pvc-badge--success' : 'pvc-badge--warning' },
          { label: 'Finalizado', value: Number(r.finalizado) === 1 ? 'Sí' : 'No', icon: 'fa-check-circle', badge: true, badgeClass: Number(r.finalizado) === 1 ? 'pvc-badge--success' : 'pvc-badge--danger' },
        ]
      }, r.descripcion ? {
        title: 'Descripción', icon: 'fa-align-left',
        fields: [{ label: 'Descripción', value: r.descripcion, full: true }]
      } : null].filter(Boolean)
    });
  }
  async function loadReportes() {
    showLoading();
    try {
      const [raw, tecs] = await Promise.all([fetchJson(API + '/reportes'), fetchJson(API + '/tecnicos').catch(() => [])]);
      reportesCache = toArray(raw);
      tecnicosCache = toArray(tecs);
      applyReportesFiltersAndRender();
    } catch (e) {
      renderReportes([]);
      showToast(parseApiError(e) || 'No se pudieron cargar los reportes.', 'error');
    } finally { hideLoading(); }
  }

  function reporteTipoPrioridad(tipo) {
    const t = String(tipo || '').toLowerCase();
    if (t === 'garantia') return 0;
    if (t === 'instalacion') return 1;
    if (t === 'venta') return 2;
    if (t === 'servicio') return 3;
    return 4;
  }

  function renderReportes(data) {
    const tbody = qs('#tabla-reportes tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const isAdmin = canDelete();

    // Ocultar columna fecha programada si no es admin
    const adminCols = document.querySelectorAll('.admin-only-col');
    adminCols.forEach(el => { el.style.display = isAdmin ? '' : 'none'; });

    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${isAdmin ? 12 : 11}" class="empty">No hay reportes. Agrega uno nuevo.</td></tr>`;
      updateTableFooter('tabla-reportes', 0, reportesCache.length, () => clearTableFiltersAndRefresh('tabla-reportes', null, applyReportesFiltersAndRender));
      return;
    }

    // Ordenar: garantía → instalación → servicio, luego por fecha desc
    const sorted = [...data].sort((a, b) => {
      const pa = reporteTipoPrioridad(a.tipo_reporte);
      const pb = reporteTipoPrioridad(b.tipo_reporte);
      if (pa !== pb) return pa - pb;
      return String(b.fecha || '').localeCompare(String(a.fecha || ''));
    });

    const TIPO_LABELS = {
      garantia: 'Garantía (legado)',
      instalacion: 'Instalación (legado)',
      servicio: 'Servicio',
      venta: 'Venta',
    };
    const TIPO_COLORS = { garantia: 'garantia', instalacion: 'instalacion', servicio: 'servicio', venta: 'venta' };

    sorted.forEach(r => {
      const tr = document.createElement('tr');
      const tipoLabel = TIPO_LABELS[r.tipo_reporte] || r.tipo_reporte || '';
      const estLabel = r.estatus || '—';
      const fpCell = isAdmin ? `<td>${escapeHtml((r.fecha_programada || '').toString().slice(0, 10))}</td>` : '';
      const finalizado = Number(r.finalizado) === 1;
      tr.innerHTML = `
        <td>${escapeHtml(r.folio || '')}</td>
        <td>${escapeHtml(r.razon_social || r.cliente_nombre || '')}</td>
        <td>${escapeHtml(r.maquina_nombre || r.maquina_modelo || '')}</td>
        <td>${escapeHtml(r.numero_maquina || r.maquina_serie || '')}</td>
        <td><span class="badge badge-tipo-rep-${TIPO_COLORS[r.tipo_reporte] || 'otro'}">${tipoLabel}</span></td>
        <td>${escapeHtml(formatReporteSubtipoCell(r.subtipo))}</td>
        <td>${escapeHtml(r.tecnico || '')}</td>
        <td>${escapeHtml((r.fecha || '').toString().slice(0, 10))}</td>
        ${fpCell}
        <td><span class="semaforo semaforo-${r.estatus === 'en_proceso' ? 'warn' : r.estatus === 'cerrado' ? 'ok' : 'gray'}">${estLabel}</span></td>
        <td>
          ${finalizado
            ? `<span class="badge badge-ok"><i class="fas fa-check-circle"></i> Finalizado</span>`
            : `<span class="rep-final-wrap">
            <button type="button" class="btn tiny success btn-finalizar-rep" data-id="${r.id}" title="Marcar como finalizado"><i class="fas fa-check"></i> Finalizar</button>
            <button type="button" class="btn tiny outline btn-adj-firma-rep" data-id="${r.id}" title="Finalizar y adjuntar PDF o imagen firmada (opcional)"><i class="fas fa-paperclip"></i></button>
          </span>`}
        </td>
        <td class="th-actions">
          <button type="button" class="btn small outline btn-preview-rep" data-id="${r.id}" title="Vista previa"><i class="fas fa-eye"></i></button>
          ${isAdmin ? `<button type="button" class="btn small primary btn-edit-rep" data-id="${r.id}"><i class="fas fa-edit"></i></button>` : (canEdit() ? `<button type="button" class="btn small primary btn-edit-rep" data-id="${r.id}"><i class="fas fa-edit"></i></button>` : '')}
          ${isAdmin ? `<button type="button" class="btn small danger btn-del-rep" data-id="${r.id}"><i class="fas fa-trash"></i></button>` : ''}
        </td>
      `;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.btn-preview-rep').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const r = reportesCache.find(x => x.id == btn.dataset.id); if (r) previewReporte(r); });
    });
    tbody.querySelectorAll('.btn-edit-rep').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const r = reportesCache.find(x => x.id == btn.dataset.id); if (r) openModalReporte(r); });
    });
    tbody.querySelectorAll('.btn-del-rep').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openConfirmModal('¿Eliminar este reporte?', () => deleteReporte(btn.dataset.id)); });
    });
    tbody.querySelectorAll('.btn-finalizar-rep').forEach(btn => {
      btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); finalizarReporte(btn.dataset.id); });
    });
    tbody.querySelectorAll('.btn-adj-firma-rep').forEach(btn => {
      btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); adjuntarFirmaYFinalizarReporte(btn.dataset.id); });
    });
    updateTableFooter('tabla-reportes', data.length, reportesCache.length, () => clearTableFiltersAndRefresh('tabla-reportes', null, applyReportesFiltersAndRender));
    animateTableRows('tabla-reportes');
  }

  /** Finaliza el reporte en el servidor (sin abrir selector de archivos). */
  async function finalizarReporte(id) {
    if (!id) return;
    if (!confirm('¿Marcar este reporte como finalizado?')) return;
    try {
      await fetchJson(API + '/reportes/' + id, {
        method: 'PUT',
        body: JSON.stringify({ finalizado: 1 }),
      });
      showToast('Reporte finalizado correctamente.', 'success');
      loadReportes();
    } catch (er) {
      showToast(parseApiError(er), 'error');
    }
  }

  /** Solo si el usuario elige el clip: adjuntar PDF/imagen y finalizar. */
  function adjuntarFirmaYFinalizarReporte(id) {
    if (!id) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.setAttribute('aria-label', 'Elegir archivo firmado');
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          await fetchJson(API + '/reportes/' + id, {
            method: 'PUT',
            body: JSON.stringify({
              finalizado: 1,
              archivo_firmado_b64: ev.target.result,
              archivo_firmado_nombre: file.name,
            }),
          });
          showToast('Reporte finalizado con archivo adjunto.', 'success');
          loadReportes();
        } catch (er) {
          showToast(parseApiError(er), 'error');
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  function normalizeReporteSubtipo(v) {
    return normalizeForSearch(v).replace(/_/g, ' ').trim();
  }

  const REP_SUBTIPO_LABELS = {
    falla_electrica: 'Falla eléctrica',
    falla_mecanica: 'Falla mecánica',
    falla_electronica: 'Falla electrónica',
    instalacion: 'Instalación',
    capacitacion: 'Capacitación',
    garantia: 'Garantía',
    otro: 'Otro / otra',
    otra: 'Otro / otra',
  };

  function formatReporteSubtipoCell(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    const key = normalizeReporteSubtipo(s).replace(/\s+/g, '_');
    return REP_SUBTIPO_LABELS[key] || s;
  }

  /** Mapea filas viejas (tipo garantía/instalación) al modal servicio/venta. */
  function mapReporteModalTipo(rep) {
    if (!rep || !rep.tipo_reporte) return { tipo: 'servicio', subtipo: rep && rep.subtipo ? rep.subtipo : '' };
    const t = String(rep.tipo_reporte).toLowerCase();
    if (t === 'venta' || t === 'servicio') return { tipo: t, subtipo: rep.subtipo || '' };
    if (t === 'garantia') return { tipo: 'venta', subtipo: rep.subtipo || 'garantia' };
    if (t === 'instalacion') return { tipo: 'venta', subtipo: rep.subtipo || 'instalacion' };
    return { tipo: 'servicio', subtipo: rep.subtipo || '' };
  }

  function refreshReporteSubtipoFilterOptions() {
    const tipoTop = (qs('#filtro-tipo-reporte')?.value || '').trim().toLowerCase();
    const subtipoTopSel = qs('#filtro-subtipo-reporte');
    const tipoRow = (qs('#tabla-reportes-filter-tipo')?.value || '').trim().toLowerCase();
    const subtipoSel = qs('#tabla-reportes-filter-subtipo');
    if (!subtipoSel) return;
    let tipo = tipoRow || tipoTop;
    if (tipo === 'garantia' || tipo === 'instalacion') tipo = 'venta';
    const map = {
      servicio: [
        { v: '', t: 'Todos (servicio)' },
        { v: 'falla_electrica', t: 'falla eléctrica' },
        { v: 'falla_mecanica', t: 'falla mecánica' },
        { v: 'falla_electronica', t: 'falla electrónica' },
        { v: 'otro', t: 'otro / otra' },
      ],
      venta: [
        { v: '', t: 'Todos (venta)' },
        { v: 'instalacion', t: 'instalación' },
        { v: 'capacitacion', t: 'capacitación' },
        { v: 'garantia', t: 'garantía' },
        { v: 'otro', t: 'otro / otra' },
      ],
      all: [
        { v: '', t: 'Todos' },
        { v: 'falla_electrica', t: 'falla eléctrica' },
        { v: 'falla_mecanica', t: 'falla mecánica' },
        { v: 'falla_electronica', t: 'falla electrónica' },
        { v: 'instalacion', t: 'instalación' },
        { v: 'capacitacion', t: 'capacitación' },
        { v: 'garantia', t: 'garantía' },
        { v: 'otro', t: 'otro / otra' },
      ],
    };
    const prev = subtipoSel.value || '';
    const opts = map[tipo] || map.all;
    subtipoSel.innerHTML = opts.map((o) => `<option value="${o.v}">${o.t}</option>`).join('');
    const allowed = new Set(opts.map((o) => o.v));
    subtipoSel.value = allowed.has(prev) ? prev : '';
    if (subtipoTopSel) {
      const prevTop = subtipoTopSel.value || '';
      subtipoTopSel.innerHTML = opts.map((o) => `<option value="${o.v}">${o.t}</option>`).join('');
      subtipoTopSel.value = allowed.has(prevTop) ? prevTop : '';
    }
  }

  function getFilteredReportes() {
    let filtered = applyFilters(reportesCache, getFilterValues('#tabla-reportes'), 'tabla-reportes');
    const tipoTop = (qs('#filtro-tipo-reporte')?.value || '').trim().toLowerCase();
    if (tipoTop) {
      filtered = filtered.filter((r) => reporteTipoMatchesFiltro(r.tipo_reporte, tipoTop));
    }
    const subtipo = (qs('#tabla-reportes-filter-subtipo')?.value || '').trim().toLowerCase();
    const subtipoTop = (qs('#filtro-subtipo-reporte')?.value || '').trim().toLowerCase();
    const subtipoActive = subtipo || subtipoTop;
    if (subtipoActive) {
      filtered = filtered.filter((r) => {
        const s = normalizeReporteSubtipo(r.subtipo || '');
        if (subtipoActive === 'otro') return s === 'otro' || s === 'otra';
        return s === normalizeReporteSubtipo(subtipoActive);
      });
    }
    return filtered;
  }

  function applyReportesFiltersAndRender() {
    refreshReporteSubtipoFilterOptions();
    const filtered = getFilteredReportes();
    renderReportes(filtered);
  }

  function openModalReporte(reporte) {
    const isNew = !reporte || !reporte.id;
    const isAdmin = canDelete();
    const modalTipoInicial = mapReporteModalTipo(reporte || {});

    const clientesOpts = clientesCache.map(c =>
      `<option value="${c.id}" data-nombre="${escapeHtml(c.nombre)}" ${reporte && reporte.cliente_id == c.id ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`
    ).join('');

    // Filtrar máquinas por cliente si hay uno seleccionado
    const maqAll = maquinasCache;
    const maquinasOpts = (maqAll.length
      ? maqAll.map(m => `<option value="${m.id}" data-serie="${escapeHtml(m.numero_serie || '')}" ${reporte && reporte.maquina_id == m.id ? 'selected' : ''}>${escapeHtml(m.modelo || m.nombre || '')} – ${escapeHtml(m.numero_serie || '')}</option>`)
      : ['<option value="">— Sin máquinas —</option>']
    ).join('');

    const tecnOpts = tecnicosUniqueForSelect(tecnicosCache).map(t => {
      const selected = reporte && isSameTecnicoNombre(reporte.tecnico, t.nombre) ? 'selected' : '';
      const sameAsReporte = reporte && isSameTecnicoNombre(reporte.tecnico, t.nombre);
      const label = t.ocupado && !sameAsReporte ? `${escapeHtml(t.nombre)} 🔒 Ocupado` : escapeHtml(t.nombre);
      const disabled = t.ocupado && !isAdmin && !sameAsReporte ? 'disabled' : '';
      return `<option value="${escapeHtml(t.nombre)}" ${selected} ${disabled}>${label}</option>`;
    }).join('');

    const fpVal = (reporte && reporte.fecha_programada || '').toString().slice(0, 10);
    const adminFields = isAdmin ? `
      <div class="form-row">
        <div class="form-group"><label><i class="fas fa-lock" style="font-size:.8em;opacity:.6"></i> Fecha programada <small>(admin)</small></label>
          <input type="date" id="m-fecha-prog" value="${fpVal}">
        </div>
        <div class="form-group"></div>
      </div>` : '';

    const body = `
      <div class="form-row">
        <div class="form-group"><label>Razón social / Cliente *</label>
          <select id="m-cliente"><option value="">— Seleccionar cliente —</option>${clientesOpts}</select>
        </div>
        <div class="form-group"><label>Razón social (texto libre)</label>
          <input type="text" id="m-rsocial" maxlength="200" value="${escapeHtml(reporte && reporte.razon_social) || ''}" placeholder="Se llena automáticamente al elegir cliente">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Máquina (catálogo)</label>
          <select id="m-maquina"><option value="">— Selecciona —</option>${maquinasOpts}</select>
        </div>
        <div class="form-group"><label>Nº de serie (automático)</label>
          <input type="text" id="m-num-maq" maxlength="80" value="${escapeHtml(reporte && reporte.numero_maquina) || ''}" readonly style="background:var(--bg-alt,#f8fafc)">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Tipo de reporte *</label>
          <select id="m-tipo-rep">
            <option value="servicio" ${modalTipoInicial.tipo === 'servicio' ? 'selected' : ''}>Servicio (fallas / campo)</option>
            <option value="venta" ${modalTipoInicial.tipo === 'venta' ? 'selected' : ''}>Venta (instalación, capacitación, garantía)</option>
          </select>
        </div>
        <div class="form-group"><label>Subtipo</label>
          <select id="m-subtipo-rep"><option value="">— Selecciona —</option></select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Técnico asignado</label>
          <select id="m-tecnico-rep"><option value="">— Sin asignar —</option>${tecnOpts}</select>
        </div>
        <div class="form-group"><label>Fecha del reporte</label>
          <input type="date" id="m-fecha-rep" value="${(reporte && reporte.fecha || new Date().toISOString().slice(0,10))}">
        </div>
        <div class="form-group"><label>Estatus</label>
          <select id="m-est-rep">
            <option value="abierto" ${!reporte || reporte.estatus === 'abierto' ? 'selected' : ''}>Abierto</option>
            <option value="en_proceso" ${reporte && reporte.estatus === 'en_proceso' ? 'selected' : ''}>En proceso</option>
            <option value="cerrado" ${reporte && reporte.estatus === 'cerrado' ? 'selected' : ''}>Cerrado</option>
          </select>
        </div>
      </div>
      ${adminFields}
      <div class="form-group"><label>Descripción del servicio</label>
        <textarea id="m-desc-rep" rows="3" maxlength="1000">${escapeHtml(reporte && reporte.descripcion) || ''}</textarea>
      </div>
      <div class="form-group"><label>Notas</label>
        <textarea id="m-notas-rep" rows="2" maxlength="500">${escapeHtml(reporte && reporte.notas) || ''}</textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn primary" id="m-save"><i class="fas fa-save"></i> Guardar</button>
        <button type="button" class="btn" id="modal-btn-cancel">Cancelar</button>
      </div>
    `;
    openModal(isNew ? 'Nuevo reporte' : 'Editar reporte', body);

    const SUBTIPOS_REP = {
      servicio: [
        { v: 'falla_electrica', l: 'Falla eléctrica' },
        { v: 'falla_mecanica', l: 'Falla mecánica' },
        { v: 'falla_electronica', l: 'Falla electrónica' },
        { v: 'otro', l: 'Otro / otra' },
      ],
      venta: [
        { v: 'instalacion', l: 'Instalación' },
        { v: 'capacitacion', l: 'Capacitación' },
        { v: 'garantia', l: 'Garantía' },
        { v: 'otro', l: 'Otro / otra' },
      ],
    };
    const tipoSel = qs('#m-tipo-rep');
    const subSel  = qs('#m-subtipo-rep');
    const maqSel  = qs('#m-maquina');
    const numMaqEl = qs('#m-num-maq');
    const clienteSel = qs('#m-cliente');
    const rsocialEl  = qs('#m-rsocial');

    function updateSubtiposRep() {
      const opts = SUBTIPOS_REP[tipoSel.value] || SUBTIPOS_REP.servicio;
      const curRaw = isNew ? '' : String(modalTipoInicial.subtipo || (reporte && reporte.subtipo) || '');
      const curN = curRaw ? normalizeReporteSubtipo(curRaw) : '';
      subSel.innerHTML = '<option value="">— Selecciona —</option>' +
        opts.map((o) => {
          const oN = normalizeReporteSubtipo(o.v);
          const sel = curN && (curN === oN || curN === normalizeReporteSubtipo(o.l)) ? ' selected' : '';
          return `<option value="${escapeHtml(o.v)}"${sel}>${escapeHtml(o.l)}</option>`;
        }).join('');
    }
    tipoSel.addEventListener('change', () => {
      subSel.innerHTML = '<option value="">— Selecciona —</option>' +
        (SUBTIPOS_REP[tipoSel.value] || SUBTIPOS_REP.servicio)
          .map((o) => `<option value="${escapeHtml(o.v)}">${escapeHtml(o.l)}</option>`)
          .join('');
    });
    updateSubtiposRep();

    // Al cambiar máquina → auto-llenar nº serie
    if (maqSel && numMaqEl) {
      maqSel.addEventListener('change', () => {
        const opt = maqSel.options[maqSel.selectedIndex];
        numMaqEl.value = opt ? (opt.dataset.serie || '') : '';
      });
    }

    // Al cambiar cliente → auto-llenar razón social
    if (clienteSel && rsocialEl) {
      clienteSel.addEventListener('change', () => {
        const opt = clienteSel.options[clienteSel.selectedIndex];
        if (opt && opt.value) rsocialEl.value = opt.dataset.nombre || '';
      });
    }

    // Auto-status: si técnico asignado + fecha_programada (admin) → en_proceso
    function autoStatus() {
      const tecSel = qs('#m-tecnico-rep');
      const fpEl   = qs('#m-fecha-prog');
      const estSel = qs('#m-est-rep');
      if (!estSel) return;
      if (tecSel && tecSel.value && fpEl && fpEl.value && estSel.value === 'abierto') {
        estSel.value = 'en_proceso';
      }
    }
    qs('#m-tecnico-rep') && qs('#m-tecnico-rep').addEventListener('change', autoStatus);
    qs('#m-fecha-prog') && qs('#m-fecha-prog').addEventListener('change', autoStatus);

    qs('#m-save').onclick = async () => {
      const tipo = qs('#m-tipo-rep').value;
      if (!tipo) { showToast('Selecciona el tipo de reporte.', 'error'); return; }
      const payload = {
        cliente_id: qs('#m-cliente').value || null,
        razon_social: qs('#m-rsocial').value.trim() || null,
        maquina_id: qs('#m-maquina').value || null,
        numero_maquina: qs('#m-num-maq').value.trim() || null,
        tipo_reporte: tipo,
        subtipo: qs('#m-subtipo-rep').value || null,
        descripcion: qs('#m-desc-rep').value.trim() || null,
        tecnico: qs('#m-tecnico-rep').value || null,
        fecha: qs('#m-fecha-rep').value,
        estatus: qs('#m-est-rep').value,
        notas: qs('#m-notas-rep').value.trim() || null,
        fecha_programada: isAdmin && qs('#m-fecha-prog') ? (qs('#m-fecha-prog').value || null) : undefined,
      };
      // Si no es admin, no enviar fecha_programada
      if (!isAdmin) delete payload.fecha_programada;
      try {
        if (isNew) await fetchJson(API + '/reportes', { method: 'POST', body: JSON.stringify(payload) });
        else await fetchJson(API + '/reportes/' + reporte.id, { method: 'PUT', body: JSON.stringify(payload) });
        qs('#modal').classList.add('hidden');
        showToast('Reporte guardado.', 'success');
        loadReportes();
      } catch (e) { showToast(parseApiError(e), 'error'); }
    };
  }

  async function deleteReporte(id) {
    try {
      await fetchJson(API + '/reportes/' + id, { method: 'DELETE' });
      showToast('Reporte eliminado.', 'success');
      loadReportes();
    } catch (e) { showToast(parseApiError(e), 'error'); }
  }

  // ----- GARANTÍAS -----
  function addDaysIso(iso, n) {
    const d = new Date((iso || '').slice(0, 10) + 'T12:00:00');
    if (isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function pickMonthWithMostMantenimientos(cache) {
    const counts = {};
    (cache || []).forEach(m => {
      const fp = (m.fecha_programada || '').toString().slice(0, 10);
      if (fp.length >= 7) {
        const ym = fp.slice(0, 7);
        counts[ym] = (counts[ym] || 0) + 1;
      }
    });
    let best = '';
    let n = 0;
    Object.keys(counts).forEach(ym => {
      if (counts[ym] > n) { n = counts[ym]; best = ym; }
    });
    return best || '';
  }

  function enrichMantGarRow(m) {
    const hoy = new Date().toISOString().slice(0, 10);
    const fp = (m.fecha_programada || '').toString().slice(0, 10);
    const conf = Number(m.confirmado) === 1 || !!m.fecha_realizada;
    let _estado_ui = 'pendiente';
    if (conf) _estado_ui = 'realizado';
    else if (fp && fp < hoy) _estado_ui = 'vencido';
    else if (fp && fp >= hoy && fp <= addDaysIso(hoy, 30)) _estado_ui = 'próximo';
    let _prioridad = 4;
    if (!conf && fp && fp < hoy) _prioridad = 1;
    else if (!conf && fp && fp >= hoy && fp <= addDaysIso(hoy, 30)) _prioridad = 2;
    else if (!conf) _prioridad = 3;
    return Object.assign({}, m, { _estado_ui, _prioridad });
  }

  async function loadGarantias() {
    showLoading();
    try {
      const raw = await fetchJson(API + '/garantias');
      garantiasCache = toArray(raw);
      renderGarantias(garantiasCache);
      checkGarantiasAlertas();
    } catch (e) {
      renderGarantias([]);
      showToast(parseApiError(e) || 'No se pudieron cargar las garantías.', 'error');
    } finally { hideLoading(); }
  }

  async function loadMantenimientoGarantia() {
    showLoading();
    try {
      const raw = await fetchJson(API + '/mantenimientos-garantia');
      mantenimientosGarantiaCache = toArray(raw).map(enrichMantGarRow);
      const mi = qs('#mant-gar-month');
      if (mi) {
        const best = pickMonthWithMostMantenimientos(mantenimientosGarantiaCache);
        const nowYm = new Date().toISOString().slice(0, 7);
        if (!mi.value) {
          mi.value = best || nowYm;
        } else {
          try {
            const touched = sessionStorage.getItem('mantGarMonthTouched');
            if (!touched && !sessionStorage.getItem('mantGarSmartV1')) {
              const cur = mi.value;
              const nCur = mantenimientosGarantiaCache.filter(m => (m.fecha_programada || '').toString().slice(0, 7) === cur).length;
              const nBest = best ? mantenimientosGarantiaCache.filter(m => (m.fecha_programada || '').toString().slice(0, 7) === best).length : 0;
              if (nCur === 0 && nBest > 0) mi.value = best;
              sessionStorage.setItem('mantGarSmartV1', '1');
            }
          } catch (_) {}
        }
      }
      renderMantenimientoGarantiaTable();
      renderMantenimientoGarantiaCalendar();
      checkGarantiasAlertas();
    } catch (e) {
      mantenimientosGarantiaCache = [];
      showToast(parseApiError(e) || 'No se pudieron cargar los mantenimientos.', 'error');
    } finally { hideLoading(); }
  }

  function renderMantenimientoGarantiaTable() {
    const tbody = qs('#tabla-mantenimientos-garantia tbody');
    const footer = qs('#footer-tabla-mantenimientos-garantia');
    if (!tbody) return;
    let data = mantenimientosGarantiaCache.slice().sort((a, b) =>
      (a._prioridad - b._prioridad) || String(a.fecha_programada || '').localeCompare(String(b.fecha_programada || ''))
    );
    data = applyFilters(data, getFilterValues('#tabla-mantenimientos-garantia'), 'tabla-mantenimientos-garantia');
    tbody.innerHTML = '';
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty">Sin registros o el filtro no devolvió resultados.</td></tr>';
      if (footer) footer.textContent = '';
      return;
    }
    const prioLabel = { 1: 'Alta', 2: 'Media', 3: 'Normal', 4: '—' };
    data.forEach(m => {
      const tr = document.createElement('tr');
      const alerts = [];
      if (Number(m.alerta_enviada)) alerts.push('Aviso enviado');
      if (Number(m.alerta_vencida)) alerts.push('Escalado vencido');
      tr.innerHTML = `
        <td><span class="badge badge-mant-prio-${m._prioridad <= 2 ? 'hi' : 'lo'}">${prioLabel[m._prioridad] || '—'}</span></td>
        <td>${escapeHtml(m.razon_social || '')}</td>
        <td>${escapeHtml(m.modelo_maquina || '')}</td>
        <td>${escapeHtml(m.numero_serie || '')}</td>
        <td>${escapeHtml((m.fecha_programada || '').toString().slice(0, 10))}</td>
        <td><span class="badge badge-mant-${m._estado_ui === 'realizado' ? 'ok' : m._estado_ui === 'vencido' ? 'bad' : m._estado_ui === 'próximo' ? 'warn' : 'pendiente'}">${escapeHtml(m._estado_ui)}</span></td>
        <td>$${Number(m.pagado || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
        <td class="td-text-wrap">${escapeHtml(alerts.join(' · ') || '—')}</td>
        <td class="th-actions">
          <button type="button" class="btn small primary btn-mant-gar-edit" data-id="${m.id}"><i class="fas fa-edit"></i></button>
        </td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.btn-mant-gar-edit').forEach(btn => {
      btn.addEventListener('click', async () => {
        const row = mantenimientosGarantiaCache.find(x => String(x.id) === String(btn.dataset.id));
        if (!row) return;
        let g = garantiasCache.find(x => String(x.id) === String(row.garantia_id));
        if (!g) {
          try { g = await fetchJson(API + '/garantias/' + row.garantia_id); } catch (_) {
            g = { id: row.garantia_id, razon_social: row.razon_social, modelo_maquina: row.modelo_maquina, numero_serie: row.numero_serie };
          }
        }
        openModalEditMantenimiento(row, g);
      });
    });
    if (footer) footer.textContent = data.length + ' fila(s)';
  }

  function renderMantenimientoGarantiaCalendar() {
    const wrap = qs('#mant-gar-cal-wrap');
    const mi = qs('#mant-gar-month');
    if (!wrap || !mi) return;
    const ym = mi.value || new Date().toISOString().slice(0, 7);
    const [Y, M] = ym.split('-').map(Number);
    const first = new Date(Y, M - 1, 1);
    const startPad = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(Y, M, 0).getDate();
    const labels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const byDay = {};
    mantenimientosGarantiaCache.forEach(m => {
      const d = (m.fecha_programada || '').toString().slice(0, 10);
      if (!d || d.slice(0, 7) !== ym) return;
      const day = d.slice(8, 10);
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(m);
    });
    let cells = '';
    for (let i = 0; i < startPad; i++) cells += '<div class="cal-cell cal-empty"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = String(d).padStart(2, '0');
      const list = byDay[ds] || [];
      const hoy = new Date().toISOString().slice(0, 10);
      const iso = ym + '-' + ds;
      let cls = 'cal-cell cal-day cal-day--click';
      if (iso === hoy) cls += ' cal-today';
      if (list.length) cls += ' cal-day--has-events';
      const dots = list.slice(0, 4).map(ev => {
        const st = ev._estado_ui === 'realizado' ? 'ok' : ev._estado_ui === 'vencido' ? 'bad' : ev._estado_ui === 'próximo' ? 'warn' : 'pendiente';
        return `<span class="cal-dot cal-dot-${st}" title="${escapeHtml(ev.razon_social)} · ${escapeHtml((ev.fecha_programada || '').slice(0, 10))}"></span>`;
      }).join('');
      const more = list.length > 4 ? `<span class="cal-more">+${list.length - 4}</span>` : '';
      const nEv = list.length;
      const aria = nEv ? `${nEv} mantenimiento(s)` : 'Sin eventos';
      cells += `<div class="${cls}" data-date="${iso}" role="button" tabindex="0" aria-label="Día ${d}. ${aria}"><div class="cal-day-num">${d}</div><div class="cal-dots">${dots}${more}</div></div>`;
    }
    const totalMes = mantenimientosGarantiaCache.filter(m => (m.fecha_programada || '').toString().slice(0, 7) === ym).length;
    wrap.innerHTML = `
      <p class="cal-month-summary"><i class="fas fa-calendar-alt"></i> <strong>${totalMes}</strong> mantenimiento(s) en este mes · Cambia el mes arriba para ver otros periodos.</p>
      <div class="cal-header">${labels.map(l => `<span>${l}</span>`).join('')}</div>
      <div class="cal-grid cal-grid--animated">${cells}</div>
      <p class="cal-legend"><span class="cal-dot cal-dot-bad"></span> Vencido
        <span class="cal-dot cal-dot-warn"></span> Próximo (30 días)
        <span class="cal-dot cal-dot-pendiente"></span> Pendiente
        <span class="cal-dot cal-dot-ok"></span> Realizado</p>`;
    wrap.querySelectorAll('.cal-day--click[data-date]').forEach(cell => {
      const iso = cell.getAttribute('data-date');
      const openDay = () => {
        const ds = iso.slice(8, 10);
        const items = byDay[ds] || [];
        openModalMantenimientosGarantiaDia(iso, items);
      };
      cell.addEventListener('click', e => { e.preventDefault(); openDay(); });
      cell.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDay(); }
      });
    });
  }

  function openModalMantenimientosGarantiaDia(dateIso, items) {
    const pretty = (() => {
      try {
        const d = new Date(dateIso + 'T12:00:00');
        return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      } catch (_) {
        return dateIso;
      }
    })();
    if (!items || !items.length) {
      openModal('Mantenimientos', `
        <div class="mant-dia-empty">
          <i class="fas fa-calendar-day"></i>
          <p><strong>${escapeHtml(pretty)}</strong></p>
          <p class="hint">No hay mantenimientos programados para este día.</p>
        </div>
        <div class="form-actions"><button type="button" class="btn" id="modal-btn-cancel">Cerrar</button></div>`);
      return;
    }
    const cards = items.map(ev => {
      const st = ev._estado_ui || 'pendiente';
      const badge = st === 'realizado' ? 'ok' : st === 'vencido' ? 'bad' : st === 'próximo' ? 'warn' : 'pendiente';
      return `
        <article class="mant-dia-card">
          <div class="mant-dia-card-head">
            <span class="mant-dia-client">${escapeHtml(ev.razon_social || '—')}</span>
            <span class="badge badge-mant-${badge}">${escapeHtml(st)}</span>
          </div>
          <div class="mant-dia-fields">
            <div><i class="fas fa-cog"></i> ${escapeHtml(ev.modelo_maquina || '—')}</div>
            <div><i class="fas fa-fingerprint"></i> ${escapeHtml(ev.numero_serie || '—')}</div>
            <div><i class="fas fa-calendar"></i> ${escapeHtml((ev.fecha_programada || '').toString().slice(0, 10))}</div>
            <div><i class="fas fa-dollar-sign"></i> Pagado: $${Number(ev.pagado || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
          </div>
          <button type="button" class="btn small primary btn-mant-dia-edit" data-id="${ev.id}"><i class="fas fa-edit"></i> Editar mantenimiento</button>
        </article>`;
    }).join('');
    openModal(`Mantenimientos · ${pretty}`, `
      <p class="mant-dia-sub">${items.length} evento(s) este día</p>
      <div class="mant-dia-stack">${cards}</div>
      <div class="form-actions"><button type="button" class="btn" id="modal-btn-cancel">Cerrar</button></div>`);
    document.querySelectorAll('.btn-mant-dia-edit').forEach(btn => {
      btn.addEventListener('click', async () => {
        const row = mantenimientosGarantiaCache.find(x => String(x.id) === String(btn.dataset.id));
        if (!row) return;
        let g = garantiasCache.find(x => String(x.id) === String(row.garantia_id));
        if (!g) {
          try { g = await fetchJson(API + '/garantias/' + row.garantia_id); } catch (_) {
            g = { id: row.garantia_id, razon_social: row.razon_social, modelo_maquina: row.modelo_maquina, numero_serie: row.numero_serie };
          }
        }
        qs('#modal') && qs('#modal').classList.add('hidden');
        openModalEditMantenimiento(row, g);
      });
    });
  }

  async function loadGarantiasSinCobertura() {
    showLoading();
    try {
      const raw = await fetchJson(API + '/garantias/sin-cobertura');
      garantiasSinCoberturaCache = toArray(raw);
      renderGarantiasSin(garantiasSinCoberturaCache);
    } catch (e) {
      garantiasSinCoberturaCache = [];
      renderGarantiasSin([]);
      showToast(parseApiError(e) || 'No se pudieron cargar los registros.', 'error');
    } finally { hideLoading(); }
  }

  function renderGarantiasSin(data) {
    const tbody = qs('#tabla-garantias-sin tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!data || !data.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">No hay garantías sin cobertura.</td></tr>';
      return;
    }
    const filtered = applyFilters(data, getFilterValues('#tabla-garantias-sin'), 'tabla-garantias-sin');
    filtered.forEach(g => {
      const tr = document.createElement('tr');
      const nMant = Array.isArray(g.mantenimientos) ? g.mantenimientos.length : 0;
      tr.innerHTML = `
        <td>${escapeHtml(g.razon_social || '')}</td>
        <td>${escapeHtml(g.modelo_maquina || '')}</td>
        <td>${escapeHtml(g.numero_serie || '')}</td>
        <td>${escapeHtml((g.fecha_entrega || '').toString().slice(0, 10))}</td>
        <td><span class="badge badge-gar-mant">${nMant}</span></td>
        <td class="th-actions">
          <button type="button" class="btn small outline btn-mant-gar-sin" data-id="${g.id}" title="Ver mantenimientos"><i class="fas fa-calendar-check"></i></button>
        </td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.btn-mant-gar-sin').forEach(btn => {
      btn.addEventListener('click', () => {
        const g = garantiasSinCoberturaCache.find(x => String(x.id) === String(btn.dataset.id));
        if (g) openModalMantenimientos(g);
      });
    });
  }

  function applyGarantiasSinFiltersAndRender() {
    renderGarantiasSin(garantiasSinCoberturaCache);
  }

  async function checkGarantiasAlertas() {
    try {
      const alertas = await fetchJson(API + '/garantias-alertas');
      const bar = qs('#garantias-alerta-bar');
      const prox = toArray(alertas && alertas.proximos);
      const venc = toArray(alertas && alertas.vencidos);
      const total = prox.length + venc.length;
      if (!bar) return;
      if (total > 0) {
        bar.classList.remove('hidden');
        const sample = prox.concat(venc).slice(0, 3);
        const extraV = venc.length ? ` · <strong>${venc.length} vencido(s)</strong>` : '';
        bar.innerHTML = `<i class="fas fa-bell"></i> <strong>${total} alerta(s):</strong> ${sample.map(a => escapeHtml(a.razon_social) + ' – ' + escapeHtml((a.fecha_programada || '').toString().slice(0, 10))).join(' | ')}${total > 3 ? ' …' : ''}${extraV}`;
      } else {
        bar.classList.add('hidden');
      }
    } catch (_) {}
  }

  function openModalGarantiasAlertasDetalle() {
    fetchJson(API + '/garantias-alertas').then(a => {
      const prox = toArray(a && a.proximos);
      const venc = toArray(a && a.vencidos);
      const rows = prox.map(x => `<tr><td>${escapeHtml(x.razon_social)}</td><td>${escapeHtml(x.fecha_programada)}</td><td>Próximo</td></tr>`)
        .concat(venc.map(x => `<tr><td>${escapeHtml(x.razon_social)}</td><td>${escapeHtml(x.fecha_programada)}</td><td><strong>Vencido</strong></td></tr>`));
      const body = `
        <p>Próximos 30 días: <strong>${prox.length}</strong> · Vencidos sin confirmar: <strong>${venc.length}</strong></p>
        <table class="table-simple" style="width:100%"><thead><tr><th>Cliente</th><th>Fecha prog.</th><th>Tipo</th></tr></thead>
        <tbody>${rows.length ? rows.join('') : '<tr><td colspan="3" class="empty">Sin alertas.</td></tr>'}</tbody></table>
        <p class="gar-modal-dry"><label><input type="checkbox" id="modal-gar-dry-run"> Simular (demo) — sin correo ni cambios en BD</label></p>
        <div class="form-actions" style="margin-top:1rem">
          <button type="button" class="btn primary" id="btn-run-procesar-alertas"><i class="fas fa-envelope"></i> Procesar (correo + marcar)</button>
          <button type="button" class="btn" id="modal-btn-cancel">Cerrar</button>
        </div>`;
      openModal('Alertas de mantenimiento', body);
      const b = qs('#btn-run-procesar-alertas');
      if (b) {
        b.onclick = async () => {
          try {
            const dryRun = !!(qs('#modal-gar-dry-run') && qs('#modal-gar-dry-run').checked);
            const r = await fetchJson(API + '/garantias-alertas/procesar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dryRun }) });
            if (dryRun) {
              showToast('Simulación: ' + (r.procesados || 0) + ' registro(s) · sin correo ni cambios en BD.', 'success');
            } else {
              showToast('Procesados: ' + (r.procesados || 0) + (r.errores && r.errores.length ? ' (revisar SMTP)' : ''), r.errores && r.errores.length ? 'error' : 'success');
              loadGarantias();
              loadMantenimientoGarantia();
            }
            qs('#modal').classList.add('hidden');
          } catch (e) { showToast(parseApiError(e), 'error'); }
        };
      }
    }).catch(() => {});
  }

  function previewGarantia(g) {
    const activa = g.activa === 1 || g.activa === true;
    openPreviewCard({
      title: g.razon_social || 'Garantía',
      subtitle: g.modelo_maquina || '',
      icon: 'fa-shield-alt',
      color: 'linear-gradient(135deg, #059669 0%, #065f46 100%)',
      badge: activa ? 'Activa' : 'Inactiva',
      badgeClass: activa ? 'pvc-badge--success' : 'pvc-badge--danger',
      sections: [{
        title: 'Equipo', icon: 'fa-industry',
        fields: [
          { label: 'Razón social', value: g.razon_social, icon: 'fa-building', full: true },
          { label: 'Modelo de máquina', value: g.modelo_maquina, icon: 'fa-cog' },
          { label: 'Número de serie', value: g.numero_serie, icon: 'fa-barcode' },
          { label: 'Fecha de entrega', value: (g.fecha_entrega || '').toString().slice(0, 10), icon: 'fa-calendar' },
          { label: 'Activa', value: activa ? 'Sí' : 'No', icon: 'fa-check-circle', badge: true, badgeClass: activa ? 'pvc-badge--success' : 'pvc-badge--danger' },
          { label: 'Mantenimientos', value: Array.isArray(g.mantenimientos) ? g.mantenimientos.length : 0, icon: 'fa-tools' },
        ]
      }]
    });
  }
  function renderGarantias(data) {
    const tbody = qs('#tabla-garantias tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">No hay garantías registradas. Agrega una.</td></tr>';
      return;
    }
    const _canEdit = canEdit(); const _canDelete = canDelete();
    data.forEach(g => {
      const tr = document.createElement('tr');
      const nMant = Array.isArray(g.mantenimientos) ? g.mantenimientos.length : 0;
      const activa = g.activa === 1 || g.activa === true;
      tr.innerHTML = `
        <td>${escapeHtml(g.razon_social || '')}</td>
        <td>${escapeHtml(g.modelo_maquina || '')}</td>
        <td>${escapeHtml(g.numero_serie || '')}</td>
        <td>${escapeHtml((g.fecha_entrega || '').toString().slice(0,10))}</td>
        <td><span class="badge badge-gar-mant" title="Mantenimientos registrados">${nMant}</span></td>
        <td><span class="badge badge-gar-${activa ? 'activa' : 'cancelada'}">${activa ? 'Sí' : 'No'}</span></td>
        <td class="th-actions">
          <button type="button" class="btn small outline btn-preview-gar" data-id="${g.id}" title="Vista previa"><i class="fas fa-eye"></i></button>
          <button type="button" class="btn small outline btn-mant-gar" data-id="${g.id}" title="Ver mantenimientos"><i class="fas fa-calendar-check"></i></button>
          ${_canEdit ? `<button type="button" class="btn small primary btn-edit-gar" data-id="${g.id}"><i class="fas fa-edit"></i></button>` : ''}
          ${_canDelete ? `<button type="button" class="btn small danger btn-del-gar" data-id="${g.id}"><i class="fas fa-trash"></i></button>` : ''}
        </td>
      `;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.btn-preview-gar').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const g = garantiasCache.find(x => x.id == btn.dataset.id); if (g) previewGarantia(g); });
    });
    tbody.querySelectorAll('.btn-mant-gar').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const g = garantiasCache.find(x => x.id == btn.dataset.id); if (g) openModalMantenimientos(g); });
    });
    tbody.querySelectorAll('.btn-edit-gar').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const g = garantiasCache.find(x => x.id == btn.dataset.id); if (g) openModalGarantia(g); });
    });
    tbody.querySelectorAll('.btn-del-gar').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openConfirmModal('¿Eliminar esta garantía y sus mantenimientos?', () => deleteGarantia(btn.dataset.id)); });
    });
  }

  function openModalGarantia(garantia) {
    const isNew = !garantia || !garantia.id;
    const clientesOpts = clientesCache.map(c => `<option value="${c.id}" ${garantia && Number(garantia.cliente_id) === Number(c.id) ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('');
    const activaVal = garantia && (garantia.activa === 0 || garantia.activa === false) ? '0' : '1';
    const body = `
      <div class="form-row">
        <div class="form-group"><label>Cliente (catálogo)</label>
          <select id="m-cliente-g"><option value="">— Sin vínculo —</option>${clientesOpts}</select>
        </div>
        <div class="form-group"><label>Razón social *</label><input type="text" id="m-rsocial-g" maxlength="200" value="${escapeHtml(garantia && garantia.razon_social) || ''}" required></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Modelo de máquina *</label><input type="text" id="m-modelo-g" maxlength="100" value="${escapeHtml(garantia && garantia.modelo_maquina) || ''}" required></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Número de serie *</label><input type="text" id="m-nserie-g" maxlength="80" value="${escapeHtml(garantia && garantia.numero_serie) || ''}" required></div>
        <div class="form-group"><label>Fecha de entrega *</label><input type="date" id="m-fent-g" value="${(garantia && garantia.fecha_entrega || new Date().toISOString().slice(0,10))}" required></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Activa</label>
          <select id="m-activa-g">
            <option value="1" ${activaVal === '1' ? 'selected' : ''}>Sí</option>
            <option value="0" ${activaVal === '0' ? 'selected' : ''}>No</option>
          </select>
        </div>
      </div>
      ${!isNew ? `<div class="form-group gar-recalc-box"><label class="gar-recalc-label"><input type="checkbox" id="m-recalc-mant"> Recalcular fechas de mantenimiento (solo si ninguno está confirmado, con fecha realizada o con pago registrado)</label></div>` : ''}
      <div class="form-group"><label>Notas</label><textarea id="m-notas-g" rows="2" maxlength="500">${escapeHtml(garantia && garantia.notas) || ''}</textarea></div>
      <div class="form-actions">
        <button type="button" class="btn primary" id="m-save"><i class="fas fa-save"></i> Guardar</button>
        <button type="button" class="btn" id="modal-btn-cancel">Cancelar</button>
      </div>
    `;
    openModal(isNew ? 'Nueva garantía' : 'Editar garantía', body);
    const selCli = qs('#m-cliente-g');
    const inpRs = qs('#m-rsocial-g');
    if (selCli && inpRs) {
      selCli.addEventListener('change', () => {
        const id = selCli.value;
        const c = clientesCache.find(x => String(x.id) === String(id));
        if (c && c.nombre) inpRs.value = c.nombre;
      });
    }
    qs('#m-save').onclick = async () => {
      const rsocial = qs('#m-rsocial-g').value.trim();
      const modelo = qs('#m-modelo-g').value.trim();
      const nserie = qs('#m-nserie-g').value.trim();
      const fent = qs('#m-fent-g').value;
      if (!rsocial) { showToast('Razón social es obligatoria.', 'error'); return; }
      if (!modelo) { showToast('Modelo de máquina es obligatorio.', 'error'); return; }
      if (!nserie) { showToast('Número de serie es obligatorio.', 'error'); return; }
      const clienteId = qs('#m-cliente-g').value || null;
      const payloadNew = {
        cliente_id: clienteId,
        razon_social: rsocial,
        modelo_maquina: modelo,
        numero_serie: nserie,
        fecha_entrega: fent,
      };
      const payloadPut = {
        ...payloadNew,
        activa: parseInt(qs('#m-activa-g').value, 10) ? 1 : 0,
      };
      const rec = qs('#m-recalc-mant');
      if (rec && rec.checked) payloadPut.recalcular_mantenimientos = true;
      try {
        if (isNew) await fetchJson(API + '/garantias', { method: 'POST', body: JSON.stringify(payloadNew) });
        else await fetchJson(API + '/garantias/' + garantia.id, { method: 'PUT', body: JSON.stringify(payloadPut) });
        qs('#modal').classList.add('hidden');
        showToast('Garantía guardada.', 'success');
        loadGarantias();
        loadMantenimientoGarantia();
      } catch (e) { showToast(parseApiError(e), 'error'); }
    };
  }

  async function openModalMantenimientos(garantia) {
    let mantenimientos = [];
    try {
      mantenimientos = toArray(await fetchJson(API + '/garantias/' + garantia.id + '/mantenimientos'));
    } catch (_) {}
    const rows = mantenimientos.map((m, i) => {
      const hoy = new Date().toISOString().slice(0, 10);
      const fp = (m.fecha_programada || '').toString().slice(0, 10);
      const conf = Number(m.confirmado) === 1;
      let est = 'pendiente';
      if (conf || m.fecha_realizada) est = 'realizado';
      else if (fp && fp < hoy) est = 'vencido';
      else if (fp && fp >= hoy && fp <= addDaysIso(hoy, 30)) est = 'próximo';
      const al = [];
      if (Number(m.alerta_enviada)) al.push('Aviso');
      if (Number(m.alerta_vencida)) al.push('Escalado');
      return `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(fp)}</td>
        <td>${m.fecha_realizada ? escapeHtml(String(m.fecha_realizada).slice(0, 10)) : '—'}</td>
        <td><span class="badge badge-mant-${est === 'realizado' ? 'ok' : est === 'vencido' ? 'bad' : est === 'próximo' ? 'warn' : 'pendiente'}">${escapeHtml(est)}</span></td>
        <td>$${Number(m.pagado || 0).toFixed(2)}</td>
        <td>${escapeHtml(al.join('/') || '—')}</td>
        <td><button type="button" class="btn small primary btn-mant-edit" data-id="${m.id}" data-garid="${garantia.id}"><i class="fas fa-edit"></i></button></td>
      </tr>`;
    }).join('');
    const body = `
      <p><strong>${escapeHtml(garantia.razon_social)}</strong> – ${escapeHtml(garantia.modelo_maquina)} (${escapeHtml(garantia.numero_serie)})</p>
      <table class="table-simple" style="width:100%;margin-top:1rem">
        <thead><tr><th>#</th><th>Fecha prog.</th><th>Realizado</th><th>Estado</th><th>Pagado</th><th>Alertas</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7" class="empty">Sin mantenimientos generados.</td></tr>'}</tbody>
      </table>
      <div class="form-actions" style="margin-top:1rem">
        <button type="button" class="btn outline" id="btn-gen-anio-mant"><i class="fas fa-plus"></i> Generar siguiente año</button>
        <button type="button" class="btn" id="modal-btn-cancel">Cerrar</button>
      </div>
    `;
    openModal('Mantenimientos: ' + escapeHtml(garantia.razon_social), body);
    const bGen = qs('#btn-gen-anio-mant');
    if (bGen) {
      bGen.addEventListener('click', async () => {
        try {
          await fetchJson(API + '/garantias/' + garantia.id + '/generar-siguiente-anio', { method: 'POST', body: '{}' });
          showToast('Mantenimientos del siguiente año generados.', 'success');
          qs('#modal').classList.add('hidden');
          loadGarantias();
          loadMantenimientoGarantia();
        } catch (e) { showToast(parseApiError(e), 'error'); }
      });
    }
    document.querySelectorAll('.btn-mant-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const m = mantenimientos.find(x => String(x.id) === String(btn.dataset.id));
        if (m) openModalEditMantenimiento(m, garantia);
      });
    });
  }

  function openModalEditMantenimiento(mant, garantia) {
    const body = `
      <p class="mant-edit-sub">${escapeHtml(garantia.razon_social || '')} · ${escapeHtml(garantia.modelo_maquina || '')}</p>
      <div class="form-row">
        <div class="form-group"><label><input type="checkbox" id="m-conf-mant" ${Number(mant.confirmado) === 1 ? 'checked' : ''}> Cliente confirmó / servicio programado</label></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Fecha realizado</label><input type="date" id="m-frealiz-mant" value="${mant.fecha_realizada ? String(mant.fecha_realizada).slice(0, 10) : ''}"></div>
        <div class="form-group"><label>Costo (USD)</label><input type="number" id="m-costo-mant" step="0.01" min="0" value="${Number(mant.costo) || 0}"></div>
        <div class="form-group"><label>Pagado (USD)</label><input type="number" id="m-pagado-mant" step="0.01" min="0" value="${Number(mant.pagado) || 0}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label><input type="checkbox" id="m-alerta-env-mant" ${Number(mant.alerta_enviada) === 1 ? 'checked' : ''}> Recordatorio enviado (manual)</label></div>
        <div class="form-group"><label><input type="checkbox" id="m-alerta-ven-mant" ${Number(mant.alerta_vencida) === 1 ? 'checked' : ''}> Escalado por vencido (manual)</label></div>
      </div>
      <div class="form-group"><label>Notas</label><textarea id="m-notas-mant" rows="2" maxlength="300">${escapeHtml(mant.notas) || ''}</textarea></div>
      <div class="form-actions">
        <button type="button" class="btn primary" id="m-save"><i class="fas fa-save"></i> Guardar</button>
        <button type="button" class="btn" id="modal-btn-cancel">Cancelar</button>
      </div>
    `;
    openModal('Actualizar mantenimiento', body);
    qs('#m-save').onclick = async () => {
      const payload = {
        confirmado: qs('#m-conf-mant').checked ? 1 : 0,
        fecha_realizada: qs('#m-frealiz-mant').value || null,
        costo: parseFloat(qs('#m-costo-mant').value) || 0,
        pagado: parseFloat(qs('#m-pagado-mant').value) || 0,
        alerta_enviada: qs('#m-alerta-env-mant').checked ? 1 : 0,
        alerta_vencida: qs('#m-alerta-ven-mant').checked ? 1 : 0,
        notas: qs('#m-notas-mant').value.trim() || null,
      };
      try {
        await fetchJson(API + '/mantenimientos-garantia/' + mant.id, { method: 'PUT', body: JSON.stringify(payload) });
        qs('#modal').classList.add('hidden');
        showToast('Mantenimiento actualizado.', 'success');
        loadGarantias();
        loadMantenimientoGarantia();
      } catch (e) { showToast(parseApiError(e), 'error'); }
    };
  }

  async function deleteGarantia(id) {
    try {
      await fetchJson(API + '/garantias/' + id, { method: 'DELETE' });
      showToast('Garantía eliminada.', 'success');
      loadGarantias();
      loadMantenimientoGarantia();
    } catch (e) { showToast(parseApiError(e), 'error'); }
  }

  // ----- BONOS -----
  async function loadBonos() {
    showLoading();
    try {
      const [raw, tecs, reps] = await Promise.all([
        fetchJson(API + '/bonos'),
        fetchJson(API + '/tecnicos').catch(() => []),
        fetchJson(API + '/reportes').catch(() => []),
      ]);
      bonosCache = toArray(raw);
      tecnicosCache = toArray(tecs);
      reportesCache = toArray(reps);
      renderBonos(bonosCache);
    } catch (e) {
      renderBonos([]);
      showToast(parseApiError(e) || 'No se pudieron cargar los bonos.', 'error');
    } finally { hideLoading(); }
  }

  function previewBono(b) {
    openPreviewCard({
      title: 'Bono: ' + (b.tecnico || '—'),
      subtitle: b.tipo_capacitacion || '',
      icon: 'fa-award',
      color: 'linear-gradient(135deg, #d97706 0%, #92400e 100%)',
      badge: b.pagado ? 'Pagado' : 'Pendiente',
      badgeClass: b.pagado ? 'pvc-badge--success' : 'pvc-badge--warning',
      sections: [{
        title: 'Información del bono', icon: 'fa-info-circle',
        fields: [
          { label: 'Técnico', value: b.tecnico, icon: 'fa-hard-hat' },
          { label: 'Reporte', value: b.reporte_folio || '—', icon: 'fa-file-alt' },
          { label: 'Tipo de capacitación', value: b.tipo_capacitacion, icon: 'fa-graduation-cap' },
          { label: 'Monto', value: '$' + Number(b.monto_bono || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 }), icon: 'fa-money-bill-wave' },
          { label: 'Fecha', value: (b.fecha || '').toString().slice(0, 10), icon: 'fa-calendar' },
          { label: 'Estado', value: b.pagado ? 'Pagado' : 'Pendiente', icon: 'fa-flag', badge: true, badgeClass: b.pagado ? 'pvc-badge--success' : 'pvc-badge--warning' },
        ]
      }, b.notas ? {
        title: 'Notas', icon: 'fa-sticky-note',
        fields: [{ label: 'Notas', value: b.notas, full: true }]
      } : null].filter(Boolean)
    });
  }
  function renderBonos(data) {
    const tbody = qs('#tabla-bonos tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty">No hay bonos registrados.</td></tr>';
      return;
    }
    const _canEdit = canEdit(); const _canDelete = canDelete();
    let totalBonos = 0;
    data.forEach(b => {
      totalBonos += Number(b.monto_bono || 0);
      const tr = document.createElement('tr');
      const folioRep = b.reporte_folio || '—';
      const notasTxt = (b.notas || '').toString();
      const notasShort = notasTxt.length > 80 ? notasTxt.slice(0, 77) + '…' : notasTxt;
      tr.innerHTML = `
        <td>${escapeHtml(b.tecnico || '')}</td>
        <td>${escapeHtml(folioRep)}</td>
        <td>${escapeHtml(b.tipo_capacitacion || '')}</td>
        <td>$${Number(b.monto_bono || 0).toLocaleString('es-MX', {minimumFractionDigits:2})}</td>
        <td>${escapeHtml((b.fecha || '').toString().slice(0,10))}</td>
        <td><span class="badge badge-bono-${b.pagado ? 'pagado' : 'pendiente'}">${b.pagado ? 'Pagado' : 'Pendiente'}</span></td>
        <td class="td-text-wrap">${escapeHtml(notasShort)}</td>
        <td class="th-actions">
          <button type="button" class="btn small outline btn-preview-bono" data-id="${b.id}" title="Vista previa"><i class="fas fa-eye"></i></button>
          ${_canEdit ? `<button type="button" class="btn small primary btn-edit-bono" data-id="${b.id}"><i class="fas fa-edit"></i></button>` : ''}
          ${_canDelete ? `<button type="button" class="btn small danger btn-del-bono" data-id="${b.id}"><i class="fas fa-trash"></i></button>` : ''}
        </td>
      `;
      tbody.appendChild(tr);
    });
    const totalEl = qs('#bonos-total');
    if (totalEl) totalEl.textContent = '$' + totalBonos.toLocaleString('es-MX', { minimumFractionDigits: 2 });
    tbody.querySelectorAll('.btn-preview-bono').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const b = bonosCache.find(x => x.id == btn.dataset.id); if (b) previewBono(b); });
    });
    tbody.querySelectorAll('.btn-edit-bono').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const b = bonosCache.find(x => x.id == btn.dataset.id); if (b) openModalBono(b); });
    });
    tbody.querySelectorAll('.btn-del-bono').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openConfirmModal('¿Eliminar este bono?', () => deleteBono(btn.dataset.id)); });
    });
  }

  function openModalBono(bono) {
    const isNew = !bono || !bono.id;
    const tecnOpts = tecnicosUniqueForSelect(tecnicosCache).map(t => `<option value="${escapeHtml(t.nombre)}" ${bono && isSameTecnicoNombre(bono.tecnico, t.nombre) ? 'selected' : ''}>${escapeHtml(t.nombre)}</option>`).join('');
    const reportesOpts = reportesCache.map(r => `<option value="${r.id}" ${bono && Number(bono.reporte_id) === Number(r.id) ? 'selected' : ''}>${escapeHtml(r.folio || ('#' + r.id))}</option>`).join('');
    const TIPOS_CAP = ['Operación básica', 'Operación avanzada', 'Mantenimiento', 'Programación CNC', 'Seguridad industrial', 'Otra'];
    const tiposOpts = TIPOS_CAP.map(t => `<option value="${t}" ${bono && bono.tipo_capacitacion === t ? 'selected' : ''}>${t}</option>`).join('');
    const body = `
      <div class="form-row">
        <div class="form-group"><label>Técnico *</label>
          <select id="m-tec-bono"><option value="">— Selecciona —</option>${tecnOpts}</select>
        </div>
        <div class="form-group"><label>Reporte (catálogo)</label>
          <select id="m-reporte-bono"><option value="">— Opcional —</option>${reportesOpts}</select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Tipo de capacitación *</label>
          <select id="m-tipo-cap"><option value="">— Selecciona —</option>${tiposOpts}</select>
        </div>
        <div class="form-group"><label>Fecha</label><input type="date" id="m-fecha-bono" value="${bono && bono.fecha || new Date().toISOString().slice(0,10)}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Monto bono (USD) *</label><input type="number" id="m-monto-bono" step="0.01" min="0" value="${bono && bono.monto_bono != null && bono.monto_bono !== '' ? Number(bono.monto_bono) : (isNew ? DEFAULT_BONO_USD : 0)}"></div>
        <div class="form-group"><label>Pagado</label>
          <select id="m-pagado-bono">
            <option value="0" ${!bono || !bono.pagado ? 'selected' : ''}>No</option>
            <option value="1" ${bono && bono.pagado ? 'selected' : ''}>Sí</option>
          </select>
        </div>
      </div>
      <div class="form-group"><label>Notas</label><textarea id="m-notas-bono" rows="2">${escapeHtml(bono && bono.notas) || ''}</textarea></div>
      <div class="form-actions">
        <button type="button" class="btn primary" id="m-save"><i class="fas fa-save"></i> Guardar</button>
        <button type="button" class="btn" id="modal-btn-cancel">Cancelar</button>
      </div>
    `;
    openModal(isNew ? 'Nuevo bono' : 'Editar bono', body);
    qs('#m-save').onclick = async () => {
      const tecnico = qs('#m-tec-bono').value;
      const tipo = qs('#m-tipo-cap').value;
      if (!tecnico) { showToast('Selecciona un técnico.', 'error'); return; }
      if (!tipo) { showToast('Selecciona el tipo de capacitación.', 'error'); return; }
      const payload = {
        reporte_id: qs('#m-reporte-bono').value || null,
        tecnico,
        tipo_capacitacion: tipo,
        fecha: qs('#m-fecha-bono').value,
        monto_bono: parseFloat(qs('#m-monto-bono').value) || 0,
        pagado: parseInt(qs('#m-pagado-bono').value) || 0,
        notas: qs('#m-notas-bono').value.trim() || null,
      };
      try {
        if (isNew) await fetchJson(API + '/bonos', { method: 'POST', body: JSON.stringify(payload) });
        else await fetchJson(API + '/bonos/' + bono.id, { method: 'PUT', body: JSON.stringify(payload) });
        qs('#modal').classList.add('hidden');
        showToast('Bono guardado.', 'success');
        loadBonos();
      } catch (e) { showToast(parseApiError(e), 'error'); }
    };
  }

  async function deleteBono(id) {
    try {
      await fetchJson(API + '/bonos/' + id, { method: 'DELETE' });
      showToast('Bono eliminado.', 'success');
      loadBonos();
    } catch (e) { showToast(parseApiError(e), 'error'); }
  }

  // ----- VIAJES -----
  async function loadViajes() {
    showLoading();
    try {
      const [raw, tecs, reps] = await Promise.all([
        fetchJson(API + '/viajes'),
        fetchJson(API + '/tecnicos').catch(() => []),
        fetchJson(API + '/reportes').catch(() => []),
      ]);
      viajesCache = toArray(raw).map(v => ({
        ...v,
        razon_social: (v.razon_social || v.cliente_nombre || '').toString().trim(),
        descripcion_busqueda: [v.descripcion, v.actividades].filter(Boolean).join(' · '),
      }));
      tecnicosCache = toArray(tecs);
      reportesCache = toArray(reps);
      if (!clientesCache.length) {
        try { clientesCache = toArray(await fetchJson(API + '/clientes')); } catch (_) {}
      }
      renderViajes(viajesCache);
    } catch (e) {
      renderViajes([]);
      showToast(parseApiError(e) || 'No se pudieron cargar los viajes.', 'error');
    } finally {
      hideLoading();
      const mesInp = qs('#filtro-mes-viajes');
      if (mesInp && !String(mesInp.value || '').trim()) {
        try {
          mesInp.value = new Date().toISOString().slice(0, 7);
        } catch (_) {}
      }
    }
  }

  function previewViaje(v) {
    const dias = Number(v.dias || 1);
    const monto = v.monto_viaticos != null && !isNaN(Number(v.monto_viaticos)) ? Number(v.monto_viaticos) : dias * 1000;
    const liq = Number(v.liquidado) === 1;
    openPreviewCard({
      title: 'Viaje: ' + (v.tecnico || '—'),
      subtitle: (v.cliente_nombre || v.razon_social || '').trim() || '',
      icon: 'fa-plane',
      color: 'linear-gradient(135deg, #0284c7 0%, #075985 100%)',
      badge: liq ? 'Liquidado' : 'Pendiente',
      badgeClass: liq ? 'pvc-badge--success' : 'pvc-badge--warning',
      sections: [{
        title: 'Detalles del viaje', icon: 'fa-info-circle',
        fields: [
          { label: 'Técnico', value: v.tecnico, icon: 'fa-hard-hat' },
          { label: 'Cliente / Empresa', value: v.cliente_nombre || v.razon_social, icon: 'fa-building', full: true },
          { label: 'Fecha inicio', value: (v.fecha_inicio || '').toString().slice(0, 10), icon: 'fa-calendar-alt' },
          { label: 'Fecha fin', value: (v.fecha_fin || '').toString().slice(0, 10), icon: 'fa-calendar-check' },
          { label: 'Días', value: dias, icon: 'fa-clock' },
          { label: 'Viáticos', value: '$' + monto.toLocaleString('es-MX', { minimumFractionDigits: 2 }), icon: 'fa-money-bill-wave' },
          { label: 'Mes liquidación', value: v.mes_liquidacion ? String(v.mes_liquidacion).slice(0, 7) : '', icon: 'fa-calendar' },
          { label: 'Liquidado', value: liq ? 'Sí' : 'No', icon: 'fa-check-circle', badge: true, badgeClass: liq ? 'pvc-badge--success' : 'pvc-badge--warning' },
        ]
      }, (v.descripcion || v.actividades) ? {
        title: 'Actividades', icon: 'fa-list',
        fields: [
          { label: 'Descripción', value: v.descripcion, full: true },
          { label: 'Actividades', value: v.actividades, full: true },
        ].filter(f => f.value)
      } : null].filter(Boolean)
    });
  }
  function renderViajes(data) {
    const tbody = qs('#tabla-viajes tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty">No hay viajes registrados.</td></tr>';
      return;
    }
    const _canEdit = canEdit(); const _canDelete = canDelete();
    let totalViáticos = 0;
    data.forEach(v => {
      const dias = Number(v.dias || 1);
      const monto = v.monto_viaticos != null && !isNaN(Number(v.monto_viaticos))
        ? Number(v.monto_viaticos)
        : dias * 1000;
      totalViáticos += monto;
      const clienteLabel = (v.cliente_nombre || v.razon_social || '').trim() || '—';
      const desc = [v.descripcion, v.actividades].filter(Boolean).join(' · ') || '—';
      const mesLiq = v.mes_liquidacion ? String(v.mes_liquidacion).slice(0, 7) : '—';
      const liq = Number(v.liquidado) === 1;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(v.tecnico || '')}</td>
        <td class="td-text-wrap">${escapeHtml(clienteLabel)}</td>
        <td>${escapeHtml((v.fecha_inicio || '').toString().slice(0,10))}</td>
        <td>${escapeHtml((v.fecha_fin || '').toString().slice(0,10))}</td>
        <td>${dias}</td>
        <td>$${monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
        <td class="td-text-wrap">${escapeHtml(desc)}</td>
        <td>${escapeHtml(mesLiq)}</td>
        <td><span class="badge ${liq ? 'badge-bono-pagado' : 'badge-bono-pendiente'}">${liq ? 'Sí' : 'No'}</span></td>
        <td class="th-actions">
          <button type="button" class="btn small outline btn-preview-viaje" data-id="${v.id}" title="Vista previa"><i class="fas fa-eye"></i></button>
          ${_canEdit ? `<button type="button" class="btn small primary btn-edit-viaje" data-id="${v.id}"><i class="fas fa-edit"></i></button>` : ''}
          ${_canDelete ? `<button type="button" class="btn small danger btn-del-viaje" data-id="${v.id}"><i class="fas fa-trash"></i></button>` : ''}
        </td>
      `;
      tbody.appendChild(tr);
    });
    const totalEl = qs('#viajes-total-viaticos');
    if (totalEl) totalEl.textContent = '$' + totalViáticos.toLocaleString('es-MX', { minimumFractionDigits: 2 });
    tbody.querySelectorAll('.btn-preview-viaje').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const v = viajesCache.find(x => x.id == btn.dataset.id); if (v) previewViaje(v); });
    });
    tbody.querySelectorAll('.btn-edit-viaje').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const v = viajesCache.find(x => x.id == btn.dataset.id); if (v) openModalViaje(v); });
    });
    tbody.querySelectorAll('.btn-del-viaje').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openConfirmModal('¿Eliminar este viaje?', () => deleteViaje(btn.dataset.id)); });
    });
  }

  function openModalViaje(viaje) {
    const isNew = !viaje || !viaje.id;
    const tecnOpts = tecnicosUniqueForSelect(tecnicosCache).map(t => `<option value="${escapeHtml(t.nombre)}" ${viaje && isSameTecnicoNombre(viaje.tecnico, t.nombre) ? 'selected' : ''}>${escapeHtml(t.nombre)}</option>`).join('');
    const clientesOpts = clientesCache.map(c => `<option value="${c.id}" ${viaje && Number(viaje.cliente_id) === Number(c.id) ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('');
    const reportesOpts = reportesCache.map(r => `<option value="${r.id}" ${viaje && Number(viaje.reporte_id) === Number(r.id) ? 'selected' : ''}>${escapeHtml(r.folio || ('#' + r.id))}</option>`).join('');
    const rsocial = (viaje && (viaje.razon_social || viaje.cliente_nombre)) ? escapeHtml(viaje.razon_social || viaje.cliente_nombre) : '';
    const mesLiqVal = viaje && viaje.mes_liquidacion ? String(viaje.mes_liquidacion).slice(0, 7) : '';
    const liqVal = viaje && Number(viaje.liquidado) === 1 ? '1' : '0';
    const body = `
      <div class="form-row">
        <div class="form-group"><label>Técnico *</label>
          <select id="m-tec-viaje"><option value="">— Selecciona —</option>${tecnOpts}</select>
        </div>
        <div class="form-group"><label>Cliente (catálogo)</label>
          <select id="m-cliente-viaje"><option value="">— Selecciona o escribe razón social —</option>${clientesOpts}</select>
        </div>
      </div>
      <div class="form-group"><label>Razón social / empresa *</label><input type="text" id="m-rsocial-viaje" maxlength="200" value="${rsocial}" required placeholder="Se rellena al elegir cliente o escribe manualmente"></div>
      <div class="form-row">
        <div class="form-group"><label>Fecha inicio *</label><input type="date" id="m-finicio-viaje" value="${viaje && viaje.fecha_inicio ? String(viaje.fecha_inicio).slice(0, 10) : new Date().toISOString().slice(0, 10)}"></div>
        <div class="form-group"><label>Fecha fin *</label><input type="date" id="m-ffin-viaje" value="${viaje && viaje.fecha_fin ? String(viaje.fecha_fin).slice(0, 10) : new Date().toISOString().slice(0, 10)}"></div>
        <div class="form-group"><label>Días</label><input type="number" id="m-dias-viaje" min="1" step="1" value="${viaje && viaje.dias ? Number(viaje.dias) : 1}" readonly></div>
      </div>
      <p style="font-size:0.85rem;color:#6b7280;margin-top:-0.5rem">Viáticos: US$1,000 por día. <strong id="m-total-viaticos-preview">US$${((viaje && viaje.dias) ? Number(viaje.dias) : 1) * 1000}</strong></p>
      <div class="form-row">
        <div class="form-group"><label>Reporte (opcional)</label>
          <select id="m-reporte-viaje"><option value="">— Ninguno —</option>${reportesOpts}</select>
        </div>
        <div class="form-group"><label>Mes liquidación</label><input type="month" id="m-mes-liq-viaje" value="${mesLiqVal}"></div>
      </div>
      ${!isNew ? `<div class="form-group"><label>Liquidado</label>
        <select id="m-liq-viaje">
          <option value="0" ${liqVal === '0' ? 'selected' : ''}>No</option>
          <option value="1" ${liqVal === '1' ? 'selected' : ''}>Sí</option>
        </select>
      </div>` : ''}
      <div class="form-group"><label>Descripción</label><textarea id="m-desc-viaje" rows="2" maxlength="500">${escapeHtml(viaje && viaje.descripcion) || ''}</textarea></div>
      <div class="form-group"><label>Actividades realizadas</label><textarea id="m-act-viaje" rows="3" maxlength="500">${escapeHtml(viaje && viaje.actividades) || ''}</textarea></div>
      <div class="form-actions">
        <button type="button" class="btn primary" id="m-save"><i class="fas fa-save"></i> Guardar</button>
        <button type="button" class="btn" id="modal-btn-cancel">Cancelar</button>
      </div>
    `;
    openModal(isNew ? 'Nuevo viaje' : 'Editar viaje', body);
    const selCli = qs('#m-cliente-viaje');
    const inpRs = qs('#m-rsocial-viaje');
    if (selCli && inpRs) {
      selCli.addEventListener('change', () => {
        const id = selCli.value;
        const c = clientesCache.find(x => String(x.id) === String(id));
        if (c && c.nombre) inpRs.value = c.nombre;
      });
    }
    // Auto calcular días
    function calcDias() {
      const fi = qs('#m-finicio-viaje').value;
      const ff = qs('#m-ffin-viaje').value;
      if (fi && ff) {
        const d = Math.max(1, Math.round((new Date(ff + 'T12:00:00') - new Date(fi + 'T12:00:00')) / 86400000) + 1);
        qs('#m-dias-viaje').value = d;
        qs('#m-total-viaticos-preview').textContent = '$' + (d * 1000).toLocaleString('es-MX');
        if (isNew) {
          const mesInp = qs('#m-mes-liq-viaje');
          if (mesInp && !String(mesInp.value || '').trim()) mesInp.value = fi.slice(0, 7);
        }
      }
    }
    qs('#m-finicio-viaje').addEventListener('change', calcDias);
    qs('#m-ffin-viaje').addEventListener('change', calcDias);
    calcDias();
    qs('#m-save').onclick = async () => {
      const tecnico = qs('#m-tec-viaje').value;
      if (!tecnico) { showToast('Selecciona un técnico.', 'error'); return; }
      const razon = qs('#m-rsocial-viaje').value.trim();
      if (!razon) { showToast('Indica la razón social o elige un cliente.', 'error'); return; }
      const fi = qs('#m-finicio-viaje').value;
      const ff = qs('#m-ffin-viaje').value;
      if (!fi || !ff) { showToast('Fecha inicio y fin son obligatorias.', 'error'); return; }
      const clienteIdRaw = qs('#m-cliente-viaje').value;
      const repIdRaw = qs('#m-reporte-viaje').value;
      const payload = {
        tecnico,
        cliente_id: clienteIdRaw ? Number(clienteIdRaw) : null,
        razon_social: razon,
        fecha_inicio: fi,
        fecha_fin: ff,
        descripcion: qs('#m-desc-viaje').value.trim() || null,
        actividades: qs('#m-act-viaje').value.trim() || null,
        reporte_id: repIdRaw ? Number(repIdRaw) : null,
        mes_liquidacion: qs('#m-mes-liq-viaje').value || null,
      };
      if (!isNew && qs('#m-liq-viaje')) {
        payload.liquidado = parseInt(qs('#m-liq-viaje').value, 10) ? 1 : 0;
      }
      try {
        if (isNew) await fetchJson(API + '/viajes', { method: 'POST', body: JSON.stringify(payload) });
        else await fetchJson(API + '/viajes/' + viaje.id, { method: 'PUT', body: JSON.stringify(payload) });
        qs('#modal').classList.add('hidden');
        showToast('Viaje guardado.', 'success');
        loadViajes();
      } catch (e) { showToast(parseApiError(e), 'error'); }
    };
  }

  async function deleteViaje(id) {
    try {
      await fetchJson(API + '/viajes/' + id, { method: 'DELETE' });
      showToast('Viaje eliminado.', 'success');
      loadViajes();
    } catch (e) { showToast(parseApiError(e), 'error'); }
  }

  /** Convierte respuesta GET /api/liquidacion-mensual ({ porTecnico }) en filas para tabla/CSV. */
  function buildLiquidacionRowsFromApi(apiRes) {
    const porTecnico = apiRes && apiRes.porTecnico && typeof apiRes.porTecnico === 'object' ? apiRes.porTecnico : null;
    if (!porTecnico) return [];
    return Object.keys(porTecnico)
      .sort((a, b) => a.localeCompare(b, 'es'))
      .map((tecnico) => {
        const block = porTecnico[tecnico];
        const viajes = Array.isArray(block.viajes) ? block.viajes : [];
        let total_dias = 0;
        for (const v of viajes) {
          if (v.dias != null && String(v.dias).trim() !== '') {
            total_dias += Math.max(0, Number(v.dias)) || 0;
          } else if (v.fecha_inicio && v.fecha_fin) {
            const fi = String(v.fecha_inicio).slice(0, 10);
            const ff = String(v.fecha_fin).slice(0, 10);
            total_dias += Math.max(
              1,
              Math.round((new Date(ff + 'T12:00:00') - new Date(fi + 'T12:00:00')) / 86400000) + 1
            );
          } else {
            total_dias += 1;
          }
        }
        const total_viaticos = Number(block.total_viaticos) || 0;
        const total_bonos = Number(block.total_bonos) || 0;
        return {
          tecnico,
          total_dias,
          total_viaticos,
          total_bonos,
          total_combined: total_viaticos + total_bonos,
        };
      });
  }

  // Liquidación mensual de viajes
  async function generarLiquidacionMensual() {
    const mesInput = qs('#filtro-mes-viajes');
    const mes = mesInput ? mesInput.value : new Date().toISOString().slice(0, 7);
    if (!mes) { showToast('Selecciona un mes.', 'error'); return; }
    try {
      const raw = await fetchJson(API + '/liquidacion-mensual?mes=' + encodeURIComponent(mes));
      const rows = buildLiquidacionRowsFromApi(raw);
      if (!rows.length) { showToast('No hay viajes ni bonos registrados para ese mes.', 'info'); return; }
      openModalLiquidacion(rows, mes);
    } catch (e) { showToast(parseApiError(e), 'error'); }
  }

  function openModalLiquidacion(rows, mes) {
    const rowsHtml = rows.map(d => `
      <tr>
        <td>${escapeHtml(d.tecnico || '')}</td>
        <td>${d.total_dias}</td>
        <td>$${Number(d.total_viaticos).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
        <td>$${Number(d.total_bonos || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
        <td><strong>$${Number(d.total_combined != null ? d.total_combined : (d.total_viaticos || 0) + (d.total_bonos || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong></td>
      </tr>
    `).join('');
    const body = `
      <h3 style="margin-bottom:1rem">Liquidación mensual: ${escapeHtml(mes)}</h3>
      <table class="table-simple" style="width:100%">
        <thead><tr><th>Técnico</th><th>Días viaje</th><th>Viáticos</th><th>Bonos</th><th>Total</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="form-actions" style="margin-top:1.5rem">
        <button type="button" class="btn outline" id="liq-export-csv"><i class="fas fa-file-csv"></i> Descargar CSV</button>
        <button type="button" class="btn primary" onclick="window.print()"><i class="fas fa-print"></i> Imprimir</button>
        <button type="button" class="btn" id="modal-btn-cancel">Cerrar</button>
      </div>
    `;
    openModal('Liquidación mensual', body);
    const csvBtn = qs('#modal-body #liq-export-csv');
    if (csvBtn) {
      csvBtn.onclick = () => {
        const header = ['Técnico', 'Días viaje', 'Viáticos USD', 'Bonos USD', 'Total USD'];
        const lines = [
          header.map(escapeCsv).join(','),
          ...rows.map((d) =>
            [
              escapeCsv(d.tecnico || ''),
              d.total_dias,
              Number(d.total_viaticos) || 0,
              Number(d.total_bonos) || 0,
              Number(d.total_combined != null ? d.total_combined : (d.total_viaticos || 0) + (d.total_bonos || 0)),
            ].join(',')
          ),
        ];
        const csv = '\uFEFF' + lines.join('\r\n');
        const a = document.createElement('a');
        a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
        a.download = 'liquidacion_' + String(mes).replace(/\s/g, '_') + '.csv';
        a.click();
        showToast('CSV descargado.', 'success');
      };
    }
  }

  // ----- INCIDENTES (módulo rehecho: carga + render explícitos) -----
  function previewIncidente(i) {
    const prioColors = { alta: 'pvc-badge--danger', media: 'pvc-badge--warning', baja: 'pvc-badge--info' };
    const estColors = { cerrado: 'pvc-badge--success', en_proceso: 'pvc-badge--warning', abierto: 'pvc-badge--danger' };
    openPreviewCard({
      title: i.folio || 'Incidente',
      subtitle: i.cliente_nombre || '',
      icon: 'fa-exclamation-triangle',
      color: 'linear-gradient(135deg, #dc2626 0%, #7f1d1d 100%)',
      badge: i.prioridad || 'media',
      badgeClass: prioColors[i.prioridad] || 'pvc-badge--warning',
      sections: [{
        title: 'Información del incidente', icon: 'fa-info-circle',
        fields: [
          { label: 'Folio', value: i.folio, icon: 'fa-hashtag' },
          { label: 'Cliente', value: i.cliente_nombre, icon: 'fa-user-tie' },
          { label: 'Máquina', value: i.maquina_nombre, icon: 'fa-industry' },
          { label: 'Técnico responsable', value: i.tecnico_responsable, icon: 'fa-hard-hat' },
          { label: 'Prioridad', value: i.prioridad, icon: 'fa-flag', badge: true, badgeClass: prioColors[i.prioridad] || '' },
          { label: 'Estatus', value: i.estatus, icon: 'fa-check-circle', badge: true, badgeClass: estColors[i.estatus] || '' },
        ]
      }, {
        title: 'Fechas', icon: 'fa-calendar',
        fields: [
          { label: 'Fecha reporte', value: (i.fecha_reporte || '').toString().slice(0, 10), icon: 'fa-calendar-alt' },
          { label: 'Fecha vencimiento', value: (i.fecha_vencimiento || '').toString().slice(0, 10), icon: 'fa-calendar-times' },
          { label: 'Fecha cierre', value: (i.fecha_cerrado || '').toString().slice(0, 10), icon: 'fa-calendar-check' },
        ]
      }, i.descripcion ? {
        title: 'Descripción', icon: 'fa-align-left',
        fields: [{ label: 'Descripción', value: i.descripcion, full: true }]
      } : null].filter(Boolean)
    });
  }
  function renderIncidentes(data, totalInSystem) {
    const panel = qs('#panel-incidentes');
    if (!panel) return;
    const emptyEl = panel.querySelector('#incidentes-empty');
    const listEl = panel.querySelector('#incidentes-list');
    const table = panel.querySelector('#tabla-incidentes');
    const tbody = table ? table.querySelector('tbody') : null;
    if (!emptyEl || !listEl || !tbody) return;
    const list = Array.isArray(data) ? data : [];
    const total = totalInSystem != null ? totalInSystem : list.length;
    const hayRegistros = total > 0;
    const hayFilasVisibles = list.length > 0;
    emptyEl.classList.toggle('hidden', hayRegistros);
    listEl.classList.toggle('hidden', !hayRegistros);
    tbody.innerHTML = '';
    if (!hayRegistros) return;
    if (!hayFilasVisibles) {
      tbody.innerHTML = '<tr><td colspan="12" class="empty filter-empty"><span>No hay resultados con los filtros aplicados.</span> <button type="button" class="btn small primary clear-filters-inline">Quitar filtros</button></td></tr>';
      const btn = tbody.querySelector('.clear-filters-inline');
      if (btn) btn.addEventListener('click', () => clearTableFiltersAndRefresh('tabla-incidentes', null, applyIncidentesFiltersAndRender));
      updateTableFooter('tabla-incidentes', 0, incidentesCache.length, () => clearTableFiltersAndRefresh('tabla-incidentes', null, applyIncidentesFiltersAndRender));
      return;
    }
    const _canEdit = canEdit(); const _canDelete = canDelete();
    list.forEach(i => {
      const sla = getSlaSemaphore(i);
      const diasRest = getDiasRestantesSemaphore(i);
      const desc = String(i.descripcion || '');
      const fVenc = (i.fecha_vencimiento || '').toString().slice(0, 10) || '—';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(String(i.folio || ''))}</td>
        <td class="td-text-wrap">${escapeHtml(String(i.cliente_nombre || ''))}</td>
        <td class="td-text-wrap">${escapeHtml(String(i.maquina_nombre || ''))}</td>
        <td class="td-desc-wrap">${escapeHtml(desc)}</td>
        <td>${(i.fecha_reporte || '').toString().slice(0, 10) || '—'}</td>
        <td>${(i.fecha_cerrado || '').toString().slice(0, 10) || '—'}</td>
        <td>${escapeHtml(fVenc)}</td>
        <td class="sla-cell"><span class="semaforo semaforo-${diasRest.color}" title="${escapeHtml(diasRest.label)}">${diasRest.dias !== null ? '<i class="fas fa-clock"></i> ' : ''}${escapeHtml(diasRest.label)}</span></td>
        <td>${escapeHtml(String(i.prioridad || ''))}</td>
        <td>${escapeHtml(String(i.estatus || ''))}</td>
        <td class="sla-cell"><span class="semaforo semaforo-${sla.color}" title="${escapeHtml(sla.label)}"><i class="fas ${sla.icon}"></i> ${escapeHtml(sla.label)}</span></td>
        <td class="th-actions">
          <button type="button" class="btn small outline btn-preview-inc" data-id="${i.id}" title="Vista previa"><i class="fas fa-eye"></i></button>
          <button type="button" class="btn small outline btn-pdf-inc" data-id="${i.id}" title="Imprimir / PDF"><i class="fas fa-file-pdf"></i></button>
          ${_canEdit ? `<button type="button" class="btn small primary btn-edit-inc" data-id="${i.id}" title="Editar"><i class="fas fa-edit"></i></button>` : ''}
          ${_canEdit ? `<button type="button" class="btn small outline btn-duplicate-inc" data-id="${i.id}" title="Duplicar incidente"><i class="fas fa-copy"></i></button>` : ''}
          ${_canDelete ? `<button type="button" class="btn small danger btn-delete-inc" data-id="${i.id}" title="Eliminar"><i class="fas fa-trash"></i></button>` : ''}
        </td>
      `;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.btn-preview-inc').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const i = incidentesCache.find(x => x.id == btn.dataset.id); if (i) previewIncidente(i); });
    });
    tbody.querySelectorAll('.btn-pdf-inc').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openIncidentePdf(btn.dataset.id); });
    });
    tbody.querySelectorAll('.btn-edit-inc').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); editIncidente(btn.dataset.id); });
    });
    tbody.querySelectorAll('.btn-duplicate-inc').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); duplicateIncidente(btn.dataset.id); });
    });
    tbody.querySelectorAll('.btn-delete-inc').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openConfirmModal('¿Eliminar este incidente?', () => deleteIncidente(btn.dataset.id)); });
    });
    updateTableFooter('tabla-incidentes', list.length, incidentesCache.length, () => clearTableFiltersAndRefresh('tabla-incidentes', null, applyIncidentesFiltersAndRender), arguments[2]);
    animateTableRows('tabla-incidentes');
  }

  async function loadIncidentes() {
    if (!qs('#panel-incidentes')) {
      try {
        const raw = await fetchJson(API + '/incidentes');
        incidentesCache = toArray(raw);
      } catch (_) {
        incidentesCache = [];
      }
      updateHeaderUrgencies();
      return;
    }
    showLoading();
    renderTableSkeleton('tabla-incidentes', 12);
    try {
      const raw = await fetchJson(API + '/incidentes');
      incidentesCache = toArray(raw);
      applyIncidentesFiltersAndRender();
      updateHeaderUrgencies();
      if (typeof requestNotificationPermissionAndMaybeNotify === 'function') requestNotificationPermissionAndMaybeNotify();
    } catch (e) {
      applyIncidentesFiltersAndRender();
      updateHeaderUrgencies();
      showToast(parseApiError(e) || 'No se pudieron cargar los incidentes.', 'error');
    } finally {
      hideLoading();
      if (typeof refreshAlertasHeader === 'function') refreshAlertasHeader();
    }
  }

  async function deleteIncidente(id) {
    try {
      await fetchJson(API + '/incidentes/' + id, { method: 'DELETE' });
      showToast('Incidente eliminado correctamente.', 'success');
      loadIncidentes();
    } catch (e) { showToast(parseApiError(e) || 'No se pudo eliminar.', 'error'); }
  }

  // ----- BITÁCORAS (módulo rehecho: carga + render explícitos) -----
  function previewBitacora(b) {
    openPreviewCard({
      title: 'Bitácora: ' + (b.tecnico || '—'),
      subtitle: (b.fecha || '').toString().slice(0, 10) + (b.incidente_folio ? ' · ' + b.incidente_folio : ''),
      icon: 'fa-clock',
      color: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
      sections: [{
        title: 'Detalles del registro', icon: 'fa-info-circle',
        fields: [
          { label: 'Fecha', value: (b.fecha || '').toString().slice(0, 10), icon: 'fa-calendar' },
          { label: 'Técnico', value: b.tecnico, icon: 'fa-hard-hat' },
          { label: 'Folio incidente', value: b.incidente_folio || '—', icon: 'fa-exclamation-triangle' },
          { label: 'Folio cotización', value: b.cotizacion_folio || '—', icon: 'fa-file-invoice-dollar' },
          { label: 'Folio reporte', value: b.reporte_folio || '—', icon: 'fa-clipboard-list' },
          { label: 'Horas trabajadas', value: b.tiempo_horas != null ? b.tiempo_horas + ' hrs' : '—', icon: 'fa-stopwatch' },
        ]
      }, b.actividades ? {
        title: 'Actividades', icon: 'fa-list-ul',
        fields: [{ label: 'Actividades realizadas', value: b.actividades, full: true }]
      } : null, b.materiales_usados ? {
        title: 'Materiales', icon: 'fa-boxes',
        fields: [{ label: 'Materiales usados', value: b.materiales_usados, full: true }]
      } : null,
      b.archivo_firmado || b.archivo_firmado_nombre ? {
        title: 'Evidencia', icon: 'fa-paperclip',
        fields: [{ label: 'Archivo firmado', value: b.archivo_firmado_nombre || 'Adjunto en registro', full: true }]
      } : null].filter(Boolean)
    });
  }
  function renderBitacoras(data, totalInSystem) {
    const panel = qs('#panel-bitacoras');
    if (!panel) return;
    const emptyEl = panel.querySelector('#bitacoras-empty');
    const listEl = panel.querySelector('#bitacoras-list');
    const table = panel.querySelector('#tabla-bitacoras');
    const tbody = table ? table.querySelector('tbody') : null;
    if (!emptyEl || !listEl || !tbody) return;
    const list = Array.isArray(data) ? data : [];
    const total = totalInSystem != null ? totalInSystem : list.length;
    const hayRegistros = total > 0;
    const hayFilasVisibles = list.length > 0;
    emptyEl.classList.toggle('hidden', hayRegistros);
    listEl.classList.toggle('hidden', !hayRegistros);
    tbody.innerHTML = '';
    if (!hayRegistros) return;
    if (!hayFilasVisibles) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty filter-empty"><span>No hay resultados con los filtros aplicados.</span> <button type="button" class="btn small primary clear-filters-inline">Quitar filtros</button></td></tr>';
      const btn = tbody.querySelector('.clear-filters-inline');
      if (btn) btn.addEventListener('click', () => clearTableFiltersAndRefresh('tabla-bitacoras', null, applyBitacorasFiltersAndRender));
      updateTableFooter('tabla-bitacoras', 0, bitacorasCache.length, () => clearTableFiltersAndRefresh('tabla-bitacoras', null, applyBitacorasFiltersAndRender));
      return;
    }
    const _canEdit = canEdit(); const _canDelete = canDelete();
    list.forEach(b => {
      const est = getEstadoRegistroSemaphore(b);
      const act = String(b.actividades || '');
      const mat = String(b.materiales_usados || '');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(String((b.fecha || '').toString().slice(0, 10)))}</td>
        <td>${escapeHtml(String(b.incidente_folio || '—'))}</td>
        <td>${escapeHtml(String(b.cotizacion_folio || '—'))}</td>
        <td>${escapeHtml(String(b.reporte_folio || '—'))}</td>
        <td class="td-text-wrap">${escapeHtml(String(b.tecnico || ''))}</td>
        <td class="td-desc-wrap">${escapeHtml(act)}</td>
        <td class="col-no-ibeam">${b.tiempo_horas != null ? b.tiempo_horas : '—'}</td>
        <td class="col-no-ibeam td-desc-wrap td-desc-wrap--compact">${escapeHtml(mat)}</td>
        <td class="col-no-ibeam sla-cell"><span class="semaforo semaforo-${est.color}" title="${escapeHtml(est.label)}"><i class="fas ${est.icon}"></i> ${escapeHtml(est.label)}</span></td>
        <td class="th-actions">
          <button type="button" class="btn small outline btn-preview-bit" data-id="${b.id}" title="Vista previa"><i class="fas fa-eye"></i></button>
          <button type="button" class="btn small outline btn-pdf-bit" data-id="${b.id}" title="Imprimir / PDF"><i class="fas fa-file-pdf"></i></button>
          ${_canEdit ? `<button type="button" class="btn small primary btn-edit-bit" data-id="${b.id}"><i class="fas fa-edit"></i></button>` : ''}
          ${_canDelete ? `<button type="button" class="btn small danger btn-delete-bit" data-id="${b.id}"><i class="fas fa-trash"></i></button>` : ''}
        </td>
      `;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.btn-preview-bit').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const b = bitacorasCache.find(x => x.id == btn.dataset.id); if (b) previewBitacora(b); });
    });
    tbody.querySelectorAll('.btn-pdf-bit').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openBitacoraPdf(btn.dataset.id); });
    });
    tbody.querySelectorAll('.btn-edit-bit').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); editBitacora(btn.dataset.id); });
    });
    tbody.querySelectorAll('.btn-delete-bit').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openConfirmModal('¿Eliminar este registro de bitácora?', () => deleteBitacora(btn.dataset.id)); });
    });
    updateTableFooter('tabla-bitacoras', list.length, bitacorasCache.length, () => clearTableFiltersAndRefresh('tabla-bitacoras', null, applyBitacorasFiltersAndRender), arguments[2]);
    animateTableRows('tabla-bitacoras');
  }

  async function loadBitacoras(opts) {
    const force = !!(opts && opts.force);
    if (force) skipNextBitacorasFetchAfterDashboard = false;
    else if (skipNextBitacorasFetchAfterDashboard) {
      skipNextBitacorasFetchAfterDashboard = false;
      applyBitacorasFiltersAndRender();
      return;
    }
    showLoading();
    renderTableSkeleton('tabla-bitacoras', 10);
    try {
      const raw = await fetchJson(API + '/bitacoras');
      bitacorasCache = toArray(raw);
      applyBitacorasFiltersAndRender();
    } catch (e) {
      const filtered = applyFilters(bitacorasCache, getFilterValues('#tabla-bitacoras'), 'tabla-bitacoras');
      renderBitacoras(filtered, bitacorasCache.length);
      showToast(parseApiError(e) || 'No se pudieron cargar las bitácoras.', 'error');
    } finally {
      hideLoading();
    }
  }

  async function deleteBitacora(id) {
    try {
      await fetchJson(API + '/bitacoras/' + id, { method: 'DELETE' });
      showToast('Registro de bitácora eliminado correctamente.', 'success');
      loadBitacoras({ force: true });
    } catch (e) { showToast(parseApiError(e) || 'No se pudo eliminar.', 'error'); }
  }

  // ----- PREVIEW CARD ---- Tarjeta hermosa para ver todos los datos de un registro
  /**
   * openPreviewCard(config)
   * config: { title, subtitle, icon, color, badge, badgeClass, sections, footerHtml, underHeaderHtml }
   * sections: [{ title, icon, fields: [{ label, value, full, badge, badgeClass, icon }] }]
   */
  function openPreviewCard(config) {
    const { title = '', subtitle = '', icon = 'fa-file-alt', color = 'var(--config-primary)', badge = '', badgeClass = '', sections = [], footerHtml = '', underHeaderHtml = '', customBodyHtml = null, previewCardClass = '' } = config;
    const sectionsHtml = sections.map(sec => {
      if (!sec || !sec.fields || !sec.fields.length) return '';
      const fieldsHtml = sec.fields.filter(f => f.value !== undefined && f.value !== null && f.value !== '').map(f => {
        const valueHtml = f.badge
          ? `<span class="pvc-badge ${f.badgeClass || ''}">${escapeHtml(String(f.value))}</span>`
          : `<span class="pvc-field-value">${f.html ? f.value : escapeHtml(String(f.value))}</span>`;
        return `<div class="pvc-field ${f.full ? 'pvc-field--full' : ''}">
          <span class="pvc-field-label">${f.icon ? `<i class="fas ${f.icon}"></i> ` : ''}${escapeHtml(f.label)}</span>
          ${valueHtml}
        </div>`;
      }).join('');
      if (!fieldsHtml) return '';
      return `<div class="pvc-section">
        ${sec.title ? `<div class="pvc-section-title">${sec.icon ? `<i class="fas ${sec.icon}"></i> ` : ''}${escapeHtml(sec.title)}</div>` : ''}
        <div class="pvc-fields">${fieldsHtml}</div>
      </div>`;
    }).join('');
    const bodyMain = customBodyHtml != null && String(customBodyHtml).trim() !== ''
      ? customBodyHtml
      : (sectionsHtml || '<p class="pvc-empty">Sin información adicional.</p>');
    const body = `
      <div class="preview-card ${previewCardClass || ''}">
        <div class="pvc-header" style="background:${color}">
          <div class="pvc-header-icon"><i class="fas ${icon}"></i></div>
          <div class="pvc-header-info">
            <h2 class="pvc-title">${escapeHtml(title)}</h2>
            ${subtitle ? `<p class="pvc-subtitle">${escapeHtml(subtitle)}</p>` : ''}
          </div>
          ${badge ? `<span class="pvc-badge pvc-badge--header ${badgeClass}">${escapeHtml(badge)}</span>` : ''}
        </div>
        ${underHeaderHtml || ''}
        <div class="pvc-body">${bodyMain}</div>
        ${footerHtml ? `<div class="pvc-footer">${footerHtml}</div>` : ''}
        <div class="pvc-close-row">
          <button type="button" class="btn outline" id="modal-btn-cancel"><i class="fas fa-times"></i> Cerrar</button>
        </div>
      </div>`;
    openModal(title, body);
  }

  // ----- MODAL GENÉRICO ----- Focus trap, foco al abrir/cerrar, Escape cierra
  function openModal(title, bodyHtml, onClose) {
    const modal = qs('#modal');
    const modalBox = qs('#modal .modal-box');
    const previousFocus = document.activeElement;
    if (modalBox) {
      modalBox.classList.remove(
        'pdf-preview-modal',
        'dragging',
        'modal-cotizacion',
        'modal-box--refaccion-preview',
        'modal-box--ref-stock',
        'modal-box--theme-dark',
        'modal-box--theme-industrial'
      );
      modalBox.style.left = '';
      modalBox.style.top = '';
      modalBox.style.width = '';
      modalBox.style.height = '';
      modalBox.style.maxHeight = '';
      const _t = String(title || '');
      if (/cotizaci/i.test(_t) || /m\u00e1quina/i.test(_t) || /maquina/i.test(_t)) modalBox.classList.add('modal-cotizacion');
    }
    qs('#modal-title').textContent = title;
    qs('#modal-body').innerHTML = bodyHtml;
    wireModalMediaOpenButtons(qs('#modal-body'));
    if (modalBox && /ref-pvc-hero/.test(String(bodyHtml || ''))) modalBox.classList.add('modal-box--refaccion-preview');
    if (modalBox) applyModalThemeToBox(modalBox);
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

  /** Segundo modal encima del principal (ej. bitácora sin cerrar cotización). */
  function openModalStack(title, bodyHtml, onClose) {
    const modal = qs('#modal-stack');
    if (!modal) return function () {};
    const previousFocus = document.activeElement;
    qs('#modal-stack-title').textContent = title;
    qs('#modal-stack-body').innerHTML = bodyHtml;
    wireModalMediaOpenButtons(qs('#modal-stack-body'));
    const stackBox = qs('#modal-stack .modal-box');
    if (stackBox) applyModalThemeToBox(stackBox);
    modal.classList.remove('hidden');
    clearInvalidMarks();
    const focusables = () => modal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
    const firstFocusable = () => focusables()[0];
    const lastFocusable = () => { const f = focusables(); return f[f.length - 1]; };
    const handleKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
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
    const btnClose = qs('#modal-stack-close');
    if (btnClose) btnClose.onclick = close;
    const cancelBtn = qs('#modal-stack-body #modal-btn-cancel');
    if (cancelBtn) cancelBtn.onclick = close;
    setTimeout(() => { const el = firstFocusable(); if (el) el.focus(); }, 50);
    return close;
  }

  // ----- MODAL CLIENTE -----
  function openModalCliente(cliente) {
    const isNew = !cliente || !cliente.id;
    const hasConst = !!(cliente && cliente.has_constancia);
    const constanciaNombreEsc = cliente && cliente.constancia_nombre ? escapeHtml(cliente.constancia_nombre) : '';
    let pendingConstanciaDataUrl = null;
    let pendingConstanciaName = null;
    let pendingConstanciaThumb = null;
    let constanciaClear = false;
    const body = `
      <div class="client-upload-area">
        <label class="upload-label"><i class="fas fa-file-invoice"></i> Constancia o datos fiscales (documento)</label>
        <p class="upload-hint">Sube PDF, Word, Excel o una imagen (JPG, PNG, GIF, WebP) para detectar nombre, RFC, dirección, etc. Los PDF escaneados sin texto seleccionable pueden fallar; en ese caso usa foto o PDF con texto. El archivo queda guardado al pulsar <strong>Guardar</strong>.</p>
        <div id="m-constancia-existing" class="${hasConst && !isNew ? '' : 'hidden'}">
          <p class="form-hint" style="margin-top:0"><i class="fas fa-paperclip"></i> Constancia en sistema${constanciaNombreEsc ? ': <strong>' + constanciaNombreEsc + '</strong>' : ''}</p>
          <div class="form-row" style="gap:0.5rem;flex-wrap:wrap;margin-top:0.35rem">
            <button type="button" class="btn small outline" id="m-btn-dl-constancia"><i class="fas fa-download"></i> Descargar</button>
            <button type="button" class="btn small danger outline" id="m-btn-rm-constancia"><i class="fas fa-times"></i> Quitar constancia</button>
          </div>
        </div>
        <p id="m-constancia-pending-hint" class="upload-hint hidden" style="margin-top:0.5rem"></p>
        <input type="file" id="m-file-fiscal" accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,application/msword,.doc,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,application/vnd.ms-excel,.xls" class="input-file">
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
    const pendingHintEl = qs('#m-constancia-pending-hint');
    if (!isNew && cliente.id) {
      const btnDl = qs('#m-btn-dl-constancia');
      if (btnDl) btnDl.addEventListener('click', () => downloadClienteConstanciaFile(cliente.id, cliente.constancia_nombre || 'constancia'));
      const btnRm = qs('#m-btn-rm-constancia');
      if (btnRm) {
        btnRm.addEventListener('click', () => {
          constanciaClear = true;
          pendingConstanciaDataUrl = null;
          pendingConstanciaName = null;
          pendingConstanciaThumb = null;
          if (fileInput) fileInput.value = '';
          const ex = qs('#m-constancia-existing');
          if (ex) ex.classList.add('hidden');
          if (pendingHintEl) {
            pendingHintEl.textContent = 'Se eliminará la constancia al guardar.';
            pendingHintEl.classList.remove('hidden');
          }
        });
      }
    }
    if (fileInput && statusEl && hintsEl) {
      fileInput.addEventListener('change', async function () {
        const file = this.files && this.files[0];
        if (!file) return;
        const guessMimeFromName = (name) => {
          const n = String(name || '').toLowerCase();
          if (n.endsWith('.pdf')) return 'application/pdf';
          if (n.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          if (n.endsWith('.doc')) return 'application/msword';
          if (n.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          if (n.endsWith('.xls')) return 'application/vnd.ms-excel';
          if (/\.(jpe?g)$/i.test(n)) return 'image/jpeg';
          if (n.endsWith('.png')) return 'image/png';
          if (n.endsWith('.gif')) return 'image/gif';
          if (n.endsWith('.webp')) return 'image/webp';
          return '';
        };
        let mime = (file.type || '').toLowerCase();
        if (!mime || mime === 'application/octet-stream') mime = guessMimeFromName(file.name) || '';
        const allowed = /^(image\/(jpeg|png|gif|webp)|application\/pdf|application\/vnd\.openxmlformats-officedocument\.(spreadsheetml\.sheet|wordprocessingml\.document)|application\/vnd\.ms-excel|application\/msword)$/;
        if (!mime || !allowed.test(mime)) {
          statusEl.textContent = 'Formato no admitido. Usa JPG, PNG, GIF, WebP, PDF, Word (.doc, .docx) o Excel (.xls, .xlsx).';
          statusEl.classList.remove('hidden', 'upload-ok');
          statusEl.classList.add('upload-error');
          return;
        }
        let fullDataUrl;
        try {
          fullDataUrl = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = reject;
            r.readAsDataURL(file);
          });
        } catch (_) {
          statusEl.textContent = 'No se pudo leer el archivo.';
          statusEl.classList.remove('hidden', 'upload-ok');
          statusEl.classList.add('upload-error');
          return;
        }
        constanciaClear = false;
        pendingConstanciaDataUrl = fullDataUrl;
        pendingConstanciaName = file.name || 'constancia';
        pendingConstanciaThumb = /^image\//.test(mime) ? await makeImageThumbDataUrl(fullDataUrl) : null;
        if (pendingHintEl) {
          pendingHintEl.textContent = 'Archivo listo: se guardará al pulsar Guardar (' + (pendingConstanciaName || '') + ').';
          pendingHintEl.classList.remove('hidden');
        }
        const ex = qs('#m-constancia-existing');
        if (ex) ex.classList.add('hidden');
        const analyzingLabel = /^image\//.test(mime) ? 'Analizando imagen…' : 'Analizando documento…';
        statusEl.textContent = analyzingLabel;
        statusEl.classList.remove('hidden', 'upload-ok', 'upload-error');
        statusEl.classList.add('upload-loading');
        hintsEl.classList.add('hidden');
        hintsEl.innerHTML = '';
        try {
          const base64 = fullDataUrl && fullDataUrl.indexOf('base64,') !== -1 ? fullDataUrl.split('base64,')[1] : fullDataUrl;
          const data = await fetchJson(API + '/ai/extract-client', { method: 'POST', body: JSON.stringify({ fileBase64: base64, mimeType: mime, fileName: file.name || '' }) });
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
      if (constanciaClear) payload.constancia_clear = true;
      else if (pendingConstanciaDataUrl) {
        payload.constancia_url = pendingConstanciaDataUrl;
        payload.constancia_nombre = pendingConstanciaName || 'constancia';
        payload.constancia_thumb_url = pendingConstanciaThumb || null;
      }
      const btn = qs('#m-save');
      const origText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';
      try {
        if (isNew) await fetchJson(API + '/clientes', { method: 'POST', body: JSON.stringify(payload) });
        else await fetchJson(API + '/clientes/' + cliente.id, { method: 'PUT', body: JSON.stringify(payload) });
        qs('#modal').classList.add('hidden');
        showToast(isNew ? 'Cliente guardado correctamente.' : 'Cliente actualizado correctamente.', 'success');
        if (isNew) setPaginationPage('tabla-clientes', 0);
        loadClientes({ force: true });
        fillClientesSelect();
      } catch (e) { showToast(parseApiError(e) || 'No se pudo guardar. Revisa los datos e intenta de nuevo.', 'error'); }
      finally { btn.disabled = false; btn.innerHTML = origText; }
    };
  }

  // ----- MODAL REFACCIÓN -----
  async function openModalRefaccion(refaccion) {
    const isNew = !refaccion || !refaccion.id;
    const tree = await fetchJson(API + '/categorias-catalogo').catch(() => ({ categorias: [] }));
    const cats = toArray(tree.categorias);
    const curCat = refaccion && refaccion.categoria ? String(refaccion.categoria).trim() : '';
    const curSub = refaccion && refaccion.subcategoria ? String(refaccion.subcategoria).trim() : '';
    const catOpts = '<option value="">— Seleccionar —</option>' + cats.map(c => `<option value="${escapeHtml(c.nombre)}" ${curCat === c.nombre ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('');
    const catObj = cats.find(c => c.nombre === curCat);
    const subs = catObj && catObj.subcategorias ? catObj.subcategorias : [];
    const subOpts = '<option value="">— (opcional) —</option>' + subs.map(s => `<option value="${escapeHtml(s.nombre)}" ${curSub === s.nombre ? 'selected' : ''}>${escapeHtml(s.nombre)}</option>`).join('');
    let precioUsdInicial = '';
    if (!isNew && refaccion) {
      const u = Number(refaccion.precio_usd);
      if (Number.isFinite(u) && u > 0) precioUsdInicial = u;
      else {
        const v = resolveRefaccionPrecioUsd(refaccion);
        if (v != null) precioUsdInicial = v;
      }
    }
    const tcHint = (typeof tipoCambioActual === 'number' && tipoCambioActual > 0) ? tipoCambioActual.toFixed(2) : '17.00';
    const foto1Ref = refaccion && refaccion.imagen_url ? registerPvcMediaUrl(refaccion.imagen_url) : '';
    const foto2Ref = refaccion && refaccion.manual_url ? registerPvcMediaUrl(refaccion.manual_url) : '';
    const body = `
      <div class="form-row">
        <div class="form-group"><label>Código *</label><input type="text" id="m-codigo" maxlength="50" value="${escapeHtml(refaccion && refaccion.codigo) || ''}" required placeholder="Identificador único"></div>
        <div class="form-group"><label>Unidad</label><input type="text" id="m-unidad" maxlength="20" value="${escapeHtml(refaccion && refaccion.unidad) || 'PZA'}"></div>
      </div>
      <div class="form-group"><label>Descripción *</label><input type="text" id="m-descripcion" maxlength="250" value="${escapeHtml(refaccion && refaccion.descripcion) || ''}" required></div>
      <div class="form-row">
        <div class="form-group"><label>Categoría</label><select id="m-categoria">${catOpts}</select></div>
        <div class="form-group"><label>Subcategoría</label><select id="m-subcategoria">${subOpts}</select></div>
      </div>
      <p class="form-hint" style="margin-top:0">Las listas salen del módulo <strong>Categorías</strong> (solo administrador). Si faltan valores, pide al admin que los dé de alta.</p>
      <div class="form-row">
        <div class="form-group"><label>Zona (Estante/Rack)</label><input type="text" id="m-zona" maxlength="80" value="${escapeHtml(refaccion && refaccion.zona) || ''}" placeholder="Ej. Estante A-3"></div>
        <div class="form-group"><label>Bloque</label><input type="text" id="m-bloque" maxlength="80" value="${escapeHtml(refaccion && refaccion.bloque) || ''}" placeholder="Ej. B-2"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Stock actual</label><input type="number" id="m-stock" step="0.01" min="0" value="${refaccion && refaccion.stock != null ? refaccion.stock : 0}"></div>
        <div class="form-group"><label>Stock mínimo</label><input type="number" id="m-stock-min" step="0.01" min="0" value="${refaccion && refaccion.stock_minimo != null ? refaccion.stock_minimo : 1}"></div>
      </div>
      <div class="form-group">
        <label>Precio lista (USD) *</label>
        <input type="number" id="m-precio-usd" step="0.01" min="0" value="${precioUsdInicial !== '' ? precioUsdInicial : ''}" placeholder="0.00" required>
        <p class="form-hint" style="margin-top:0.35rem">El tipo de cambio USD/MXN actual (Banxico, ≈ <strong>${tcHint}</strong>) se guarda en el registro al crear la primera vez y no se sobrescribe al editar.</p>
      </div>
      <div class="form-group"><label>Nº parte en manual (Assembly of Parts)</label><input type="text" id="m-noparte" maxlength="80" value="${escapeHtml(refaccion && refaccion.numero_parte_manual) || ''}" placeholder="Ej. 12-34-567"></div>
      <div class="form-row">
        <div class="form-group">
          <label>Foto 1: Manual de partes</label>
          <input type="file" id="m-foto1-file" accept="image/*" style="margin-bottom:0.3rem">
          ${refaccion && refaccion.imagen_url ? `<div class="ref-foto-preview-wrap">
            <button type="button" class="js-refaccion-open-media" data-media-ref="${foto1Ref}" title="Ver imagen completa" style="border:none;background:transparent;padding:0;cursor:zoom-in;">
              <img src="${escapeHtml(refaccion.imagen_url)}" class="ref-foto-thumb" alt="Foto 1" loading="lazy">
            </button>
            ${pvcDownloadBtnCompactHtml(foto1Ref, null, 'refaccion-foto1')}
            <button type="button" class="btn small danger" id="m-foto1-clear" style="margin-left:0.5rem"><i class="fas fa-times"></i></button>
          </div>` : ''}
          <input type="hidden" id="m-imagen" value="${escapeHtml(refaccion && refaccion.imagen_url) || ''}">
        </div>
        <div class="form-group">
          <label>Foto 2: Pieza (diagrama)</label>
          <input type="file" id="m-foto2-file" accept="image/*" style="margin-bottom:0.3rem">
          ${refaccion && refaccion.manual_url ? `<div class="ref-foto-preview-wrap">
            <button type="button" class="js-refaccion-open-media" data-media-ref="${foto2Ref}" title="Ver imagen completa" style="border:none;background:transparent;padding:0;cursor:zoom-in;">
              <img src="${escapeHtml(refaccion.manual_url)}" class="ref-foto-thumb" alt="Foto 2" loading="lazy">
            </button>
            ${pvcDownloadBtnCompactHtml(foto2Ref, null, 'refaccion-foto2')}
            <button type="button" class="btn small danger" id="m-foto2-clear" style="margin-left:0.5rem"><i class="fas fa-times"></i></button>
          </div>` : ''}
          <input type="hidden" id="m-manual" value="${escapeHtml(refaccion && refaccion.manual_url) || ''}">
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn primary" id="m-save"><i class="fas fa-save"></i> Guardar</button>
        <button type="button" class="btn" id="modal-btn-cancel">Cancelar</button>
      </div>
    `;
    openModal(isNew ? 'Nueva refacción' : 'Editar refacción', body);
    const selCat = qs('#m-categoria');
    const selSub = qs('#m-subcategoria');
    function refillSubcat() {
      if (!selCat || !selSub) return;
      const name = selCat.value;
      const cat = cats.find(c => c.nombre === name);
      const list = cat && cat.subcategorias ? cat.subcategorias : [];
      const keep = selSub.value;
      selSub.innerHTML = '<option value="">— (opcional) —</option>' + list.map(s => `<option value="${escapeHtml(s.nombre)}">${escapeHtml(s.nombre)}</option>`).join('');
      if (keep && list.some(s => s.nombre === keep)) selSub.value = keep;
      else if (curSub && list.some(s => s.nombre === curSub)) selSub.value = curSub;
    }
    if (selCat) selCat.addEventListener('change', refillSubcat);
    // Clear buttons for existing photos
    const foto1ClearBtn = qs('#m-foto1-clear');
    const foto2ClearBtn = qs('#m-foto2-clear');
    if (foto1ClearBtn) foto1ClearBtn.addEventListener('click', () => { qs('#m-imagen').value = ''; foto1ClearBtn.closest('.ref-foto-preview-wrap').remove(); });
    if (foto2ClearBtn) foto2ClearBtn.addEventListener('click', () => { qs('#m-manual').value = ''; foto2ClearBtn.closest('.ref-foto-preview-wrap').remove(); });
    qs('#m-save').onclick = async () => {
      clearInvalidMarks();
      const codigo = qs('#m-codigo').value.trim();
      const descripcion = qs('#m-descripcion').value.trim();
      const precioUsd = parseFloat(qs('#m-precio-usd').value);
  let err = validateRequired(codigo, 'Código es obligatorio');
      if (err) { markInvalid('m-codigo', err); return; }
      err = validateRequired(descripcion, 'Descripción es obligatoria');
      if (err) { markInvalid('m-descripcion', err); return; }
      if (!Number.isFinite(precioUsd) || precioUsd < 0) { markInvalid('m-precio-usd', 'Indica un precio en USD válido'); return; }
      const codigoKey = codigo.toLowerCase();
      const dupRef = (refaccionesCache || []).find(
        (r) =>
          r &&
          String(r.codigo || '')
            .trim()
            .toLowerCase() === codigoKey &&
          (isNew || Number(r.id) !== Number(refaccion.id))
      );
      if (dupRef) {
        markInvalid('m-codigo', 'Ese código ya está en uso en el catálogo activo.');
        showToast('Ya hay una refacción con ese código. Cambia el código o edita la existente.', 'error');
        return;
      }
      // Read file inputs as base64 data URLs if selected
      const readFileAsDataUrl = (fileInput) => new Promise((res) => {
        const file = fileInput && fileInput.files && fileInput.files[0];
        if (!file) { res(null); return; }
        const reader = new FileReader();
        reader.onload = (e) => res(e.target.result);
        reader.onerror = () => res(null);
        reader.readAsDataURL(file);
      });
      const foto1Data = await readFileAsDataUrl(qs('#m-foto1-file'));
      const foto2Data = await readFileAsDataUrl(qs('#m-foto2-file'));
      const payload = {
        codigo,
        descripcion,
        zona: qs('#m-zona').value.trim() || null,
        bloque: qs('#m-bloque') && qs('#m-bloque').value.trim() ? qs('#m-bloque').value.trim() : null,
        stock: parseFloat(qs('#m-stock').value) || 0,
        stock_minimo: parseFloat(qs('#m-stock-min').value) || 1,
        precio_usd: precioUsd,
        unidad: qs('#m-unidad').value.trim() || 'PZA',
        categoria: selCat && selCat.value.trim() ? selCat.value.trim() : null,
        subcategoria: selSub && selSub.value.trim() ? selSub.value.trim() : null,
        imagen_url: foto1Data || qs('#m-imagen').value.trim() || null,
        manual_url: foto2Data || qs('#m-manual').value.trim() || null,
        numero_parte_manual: qs('#m-noparte').value.trim() || null,
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
        if (isNew) setPaginationPage('tabla-refacciones', 0);
        loadRefacciones();
        if (typeof fillRefaccionesSelect === 'function') fillRefaccionesSelect();
      } catch (e) { showToast(parseApiError(e) || 'No se pudo guardar. Revisa los datos.', 'error'); }
      finally { btn.disabled = false; btn.innerHTML = origText; }
    };
  }

  // Modal para ver imágenes de refacción
  function openModalRefaccionImagen(ref) {
    const isImage = (url) => url && (url.startsWith('data:image') || /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url));
    const foto1 = ref.imagen_url ? (isImage(ref.imagen_url) ? `<div style="text-align:center"><p style="font-size:0.8rem;color:#6b7280;margin-bottom:0.4rem">Manual de partes</p><img src="${escapeHtml(ref.imagen_url)}" alt="Foto 1" style="max-width:100%;max-height:320px;border-radius:8px;border:1px solid #e2e8f0"></div>` : `<div><a href="${escapeHtml(ref.imagen_url)}" target="_blank" class="btn outline"><i class="fas fa-external-link-alt"></i> Ver foto 1</a></div>`) : '<p style="color:#6b7280;font-size:0.85rem">Sin foto 1.</p>';
    const foto2 = ref.manual_url ? (isImage(ref.manual_url) ? `<div style="text-align:center"><p style="font-size:0.8rem;color:#6b7280;margin-bottom:0.4rem">Pieza</p><img src="${escapeHtml(ref.manual_url)}" alt="Foto 2" style="max-width:100%;max-height:320px;border-radius:8px;border:1px solid #e2e8f0"></div>` : `<div><a href="${escapeHtml(ref.manual_url)}" target="_blank" class="btn outline"><i class="fas fa-external-link-alt"></i> Abrir manual / PDF / enlace</a></div>`) : '<p style="color:#6b7280;font-size:0.85rem">Sin pieza o diagrama.</p>';
    const body = `
      <p style="margin-bottom:0.75rem"><strong>Código:</strong> ${escapeHtml(ref.codigo)} &nbsp; <strong>Nº parte:</strong> ${escapeHtml(ref.numero_parte_manual || '—')}</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">${foto1}${foto2}</div>
    `;
    openModal('Refacción: ' + (ref.descripcion || ref.codigo), body);
  }

  // Modal de inventario: entrada/salida por cantidad o conteo físico (compatible con FIFO en servidor).
  function openModalAjusteStock(ref) {
    if (!canAdjustStock()) {
      showToast('Tu cuenta no tiene permiso para mover inventario.', 'error');
      return;
    }
    const base = Number(ref.stock) || 0;
    const uMed = escapeHtml(ref.unidad || 'PZA');
    const defaultCosto = Number(ref.precio_usd) > 0 ? ref.precio_usd : (resolveRefaccionPrecioUsd(ref) || 0);
    const body = `
      <div class="ref-stock-modal">
        <p class="form-hint" style="margin-top:0"><i class="fas fa-warehouse"></i> <strong>${escapeHtml(ref.codigo)}</strong> — ${escapeHtml(ref.descripcion || '')}</p>
        <div class="ref-stock-summary">
          <span>Stock actual: <strong id="m-stock-base">${base.toLocaleString('es-MX')}</strong> ${uMed}</span>
          <span class="ref-stock-min">Mínimo: <strong>${Number(ref.stock_minimo != null ? ref.stock_minimo : 1)}</strong></span>
        </div>
        <div class="ref-stock-mode" role="tablist" aria-label="Tipo de movimiento">
          <button type="button" class="btn small primary ref-stock-tab active" data-mode="delta" id="m-tab-delta">Entrada / salida</button>
          <button type="button" class="btn small outline ref-stock-tab" data-mode="abs" id="m-tab-abs">Conteo físico</button>
        </div>
        <div id="m-panel-delta" class="ref-stock-panel">
          <div class="form-row">
            <div class="form-group"><label>Tipo</label>
              <select id="m-tipo-mov" aria-label="Tipo de movimiento">
                <option value="entrada">Entrada (+)</option>
                <option value="salida">Salida (−)</option>
              </select>
            </div>
            <div class="form-group"><label>Cantidad *</label><input type="number" id="m-cant-mov" min="0.01" step="0.01" value="1" aria-describedby="m-preview-line"></div>
            <div class="form-group"><label>Costo unitario (USD)</label><input type="number" id="m-costo-mov" min="0" step="0.01" value="${defaultCosto}"></div>
          </div>
          <div class="form-group"><label>Referencia</label><input type="text" id="m-ref-mov" maxlength="100" placeholder="Nº orden, proveedor, factura…" autocomplete="off"></div>
        </div>
        <div id="m-panel-abs" class="ref-stock-panel hidden">
          <p class="form-hint" style="margin-top:0">Indica el <strong>stock contado</strong> en almacén. El sistema registra la diferencia como entrada o salida (auditoría FIFO).</p>
          <div class="form-row">
            <div class="form-group"><label>Stock final (conteo) *</label><input type="number" id="m-nuevo-stock" min="0" step="0.01" value="${base}"></div>
            <div class="form-group"><label>Costo unitario (USD)</label><input type="number" id="m-costo-abs" min="0" step="0.01" value="${defaultCosto}"></div>
          </div>
          <div class="form-group"><label>Referencia</label><input type="text" id="m-ref-abs" maxlength="100" placeholder="Inventario físico, auditoría…" autocomplete="off"></div>
        </div>
        <p id="m-preview-line" class="ref-stock-preview" aria-live="polite"></p>
        <div class="ref-stock-mov-block">
          <h4 class="ref-stock-mov-title"><i class="fas fa-history"></i> Últimos movimientos</h4>
          <div id="m-mov-list" class="ref-stock-mov-list"><span class="muted">Cargando…</span></div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn primary" id="m-save"><i class="fas fa-check"></i> Aplicar</button>
          <button type="button" class="btn" id="modal-btn-cancel">Cancelar</button>
        </div>
      </div>
    `;
    openModal('Inventario: ' + escapeHtml(ref.codigo), body);
    const modalBox = qs('#modal .modal-box');
    if (modalBox) modalBox.classList.add('modal-box--ref-stock');

    const panelD = qs('#m-panel-delta');
    const panelA = qs('#m-panel-abs');
    const tabD = qs('#m-tab-delta');
    const tabA = qs('#m-tab-abs');
    let mode = 'delta';

    function setMode(m) {
      mode = m;
      const isDelta = m === 'delta';
      panelD.classList.toggle('hidden', !isDelta);
      panelA.classList.toggle('hidden', isDelta);
      tabD.classList.toggle('primary', isDelta);
      tabD.classList.toggle('outline', !isDelta);
      tabD.classList.toggle('active', isDelta);
      tabA.classList.toggle('primary', !isDelta);
      tabA.classList.toggle('outline', isDelta);
      tabA.classList.toggle('active', !isDelta);
      updatePreview();
    }
    tabD.addEventListener('click', () => setMode('delta'));
    tabA.addEventListener('click', () => setMode('abs'));

    function updatePreview() {
      const el = qs('#m-preview-line');
      if (!el) return;
      if (mode === 'delta') {
        const cant = parseFloat(qs('#m-cant-mov') && qs('#m-cant-mov').value) || 0;
        const tipo = qs('#m-tipo-mov') && qs('#m-tipo-mov').value;
        let nuevo = base;
        if (tipo === 'entrada') nuevo = base + cant;
        else nuevo = Math.max(0, base - cant);
        el.textContent = cant > 0 ? `Tras el movimiento: ${nuevo.toLocaleString('es-MX')} ${ref.unidad || 'PZA'}` : 'Indica una cantidad mayor que 0.';
      } else {
        const nuevo = parseFloat(qs('#m-nuevo-stock') && qs('#m-nuevo-stock').value);
        if (!Number.isFinite(nuevo) || nuevo < 0) {
          el.textContent = 'Indica un stock final válido (≥ 0).';
          return;
        }
        const diff = nuevo - base;
        if (Math.abs(diff) < 1e-9) el.textContent = 'Sin cambio respecto al stock actual.';
        else el.textContent = `Ajuste: ${diff > 0 ? '+' : ''}${diff.toLocaleString('es-MX')} → stock final ${nuevo.toLocaleString('es-MX')} ${ref.unidad || 'PZA'}`;
      }
    }

    ['#m-tipo-mov', '#m-cant-mov', '#m-nuevo-stock'].forEach(sel => {
      const n = qs(sel);
      if (n) n.addEventListener('input', updatePreview);
      if (n) n.addEventListener('change', updatePreview);
    });
    updatePreview();

    fetchJson(API + '/refacciones/' + ref.id + '/movimientos')
      .then((rows) => {
        const wrap = qs('#m-mov-list');
        if (!wrap) return;
        const list = Array.isArray(rows) ? rows.slice(0, 8) : [];
        if (!list.length) {
          wrap.innerHTML = '<span class="muted">Sin movimientos registrados aún.</span>';
          return;
        }
        const tipoLabel = (t) => (t === 'salida' ? 'Salida' : 'Entrada');
        wrap.innerHTML = `
          <table class="ref-stock-mov-table">
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Cant.</th><th>Ref.</th></tr></thead>
            <tbody>
              ${list.map((m) => {
                const refM = String(m.referencia != null ? m.referencia : '');
                return `
                <tr>
                  <td>${escapeHtml(m.fecha || '—')}</td>
                  <td>${tipoLabel(m.tipo)}</td>
                  <td>${m.cantidad != null ? Number(m.cantidad).toLocaleString('es-MX') : '—'}</td>
                  <td>${escapeHtml(refM.slice(0, 48))}${refM.length > 48 ? '…' : ''}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>`;
      })
      .catch(() => {
        const wrap = qs('#m-mov-list');
        if (wrap) wrap.innerHTML = '<span class="muted">No se pudo cargar el historial.</span>';
      });

    qs('#m-save').onclick = async () => {
      const btn = qs('#m-save');
      const orig = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aplicando…';
      try {
        if (mode === 'abs') {
          const nuevo = parseFloat(qs('#m-nuevo-stock').value);
          if (!Number.isFinite(nuevo) || nuevo < 0) {
            showToast('Indica un stock final válido (≥ 0).', 'error');
            return;
          }
          const payload = {
            modo: 'absoluto',
            nuevo_stock: nuevo,
            costo_unitario: parseFloat(qs('#m-costo-abs').value) || 0,
            referencia: (qs('#m-ref-abs').value || '').trim() || null,
          };
          await fetchJson(API + '/refacciones/' + ref.id + '/ajuste-stock', { method: 'POST', body: JSON.stringify(payload) });
        } else {
          const cant = parseFloat(qs('#m-cant-mov').value) || 0;
          if (cant <= 0) {
            showToast('La cantidad debe ser mayor que 0.', 'error');
            return;
          }
          const payload = {
            tipo: qs('#m-tipo-mov').value,
            cantidad: cant,
            costo_unitario: parseFloat(qs('#m-costo-mov').value) || 0,
            referencia: (qs('#m-ref-mov').value || '').trim() || null,
          };
          await fetchJson(API + '/refacciones/' + ref.id + '/ajuste-stock', { method: 'POST', body: JSON.stringify(payload) });
        }
        qs('#modal').classList.add('hidden');
        if (modalBox) modalBox.classList.remove('modal-box--ref-stock');
        showToast('Inventario actualizado.', 'success');
        loadRefacciones();
      } catch (e) {
        showToast(parseApiError(e) || 'No se pudo aplicar el movimiento.', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = orig;
      }
    };
  }

  // ----- MODAL MÁQUINA -----
  async function openModalMaquina(maquina) {
    const isNew = !maquina || !maquina.id;
    const clientes = await fetchJson(API + '/clientes').catch(() => []);
    const clientesByNombre = [...toArray(clientes)].sort((a, b) =>
      String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' }));
    const defaultClienteId = clientesByNombre[0] && clientesByNombre[0].id != null ? Number(clientesByNombre[0].id) : null;
    const tree = await fetchJson(API + '/categorias-catalogo').catch(() => ({ categorias: [] }));
    const cats = toArray(tree.categorias);
    const curCat = maquina && maquina.categoria ? String(maquina.categoria).trim() : '';
    const curSub = maquina && maquina.subcategoria ? String(maquina.subcategoria).trim() : '';
    const catOpts = '<option value="">-- Seleccionar --</option>' + cats.map(c => `<option value="${escapeHtml(c.nombre)}" ${curCat === c.nombre ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('');
    const catObj = cats.find(c => c.nombre === curCat);
    const subs = catObj && catObj.subcategorias ? catObj.subcategorias : [];
    const subOpts = '<option value="">— (opcional) —</option>' + subs.map(s => `<option value="${escapeHtml(s.nombre)}" ${curSub === s.nombre ? 'selected' : ''}>${escapeHtml(s.nombre)}</option>`).join('');
    const body = `
      <div class="cotz-modal">
        <section class="cotz-card" aria-labelledby="maq-sec-machine">
          <h4 class="cotz-card-title" id="maq-sec-machine"><span class="cotz-step-num">1</span> Máquina</h4>
          <p class="form-hint" style="margin-top:0"><i class="fas fa-layer-group"></i> <strong>Nombre de la máquina</strong> (campo categoría), <strong>parte</strong> (subcategoría) y <strong>versión</strong> (modelo) definen el equipo. El catálogo de nombres/partes lo administra el administrador en <strong>Categorías</strong>. En la tabla, clic en el <strong>ID</strong> para cambiar solo la imagen principal.</p>
          <div class="form-group"><label>Nombre de la máquina *</label>
            <select id="m-categoria">${catOpts}</select>
          </div>
          <div class="form-group"><label>Parte</label>
            <select id="m-subcategoria">${subOpts}</select>
          </div>
          <div class="form-group"><label>Versión / modelo *</label><input type="text" id="m-modelo" maxlength="120" value="${escapeHtml(maquina && maquina.modelo) || ''}" required placeholder="Ej: GH1440A, CTX 510…"></div>
          <div class="form-group"><label>Ficha técnica (opcional)</label>
            <textarea id="m-ficha-tecnica" rows="2" maxlength="4000" placeholder="Enlace, nota o referencia (se muestra en la columna «Ficha técnica» del catálogo).">${escapeHtml(maquina && maquina.ficha_tecnica != null ? String(maquina.ficha_tecnica) : '')}</textarea>
            <p class="form-hint" style="margin:0.35rem 0 0;font-size:0.8rem"><i class="fas fa-info-circle"></i> Distinto del archivo de <strong>Especificaciones</strong> (imagen/PDF arriba): aquí va texto o URL corta.</p>
          </div>
        </section>
        <section class="cotz-card" aria-labelledby="maq-sec-spec">
          <h4 class="cotz-card-title" id="maq-sec-spec"><span class="cotz-step-num">2</span> Archivos</h4>
          <p class="form-hint" style="margin-top:0"><i class="fas fa-images"></i> Los archivos se guardan en el registro (data URL). La imagen de especificaciones puede ser <strong>PDF</strong> u otra imagen.</p>
          <div class="form-row" style="margin-top:0.65rem">
            <div class="form-group" style="margin-bottom:0">
              <label>Imagen de carga máquina</label>
              <input type="file" id="m-cat-file-pieza" accept="image/*">
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label>Especificaciones de máquina (opcional)</label>
              <input type="file" id="m-cat-file-ensamble" accept="image/*,application/pdf">
            </div>
          </div>
          <input type="hidden" id="m-h-imagen-pieza" value="${escapeHtml(maquina && maquina.imagen_pieza_url) || ''}">
          <input type="hidden" id="m-h-imagen-ensamble" value="${escapeHtml(maquina && maquina.imagen_ensamble_url) || ''}">
          <div class="form-row" style="margin-top:0.75rem;gap:1rem;align-items:flex-start">
            <div class="form-group" style="margin-bottom:0;flex:1;min-width:0">
              <label style="font-size:0.85rem">Vista previa imagen</label>
              <div id="m-prev-pieza">${(maquina && maquina.imagen_pieza_url) ? previewMediaThumbBlock(maquina.imagen_pieza_url, 'Imagen de carga máquina') : '<span class="muted">—</span>'}</div>
            </div>
            <div class="form-group" style="margin-bottom:0;flex:1;min-width:0">
              <label style="font-size:0.85rem">Vista previa especificaciones</label>
              <div id="m-prev-ensamble">${(maquina && maquina.imagen_ensamble_url) ? previewMediaThumbBlock(maquina.imagen_ensamble_url, 'Especificaciones') : '<span class="muted">—</span>'}</div>
            </div>
          </div>
        </section>
        <div class="form-actions">
          <button type="button" class="btn primary" id="m-save"><i class="fas fa-save"></i> Guardar</button>
          <button type="button" class="btn" id="modal-btn-cancel">Cancelar</button>
        </div>
      </div>
    `;
    openModal(isNew ? 'Nueva máquina' : 'Editar máquina', body);
    const selMaqCat = qs('#m-categoria');
    const selMaqSub = qs('#m-subcategoria');
    function refillMaqSub() {
      if (!selMaqCat || !selMaqSub) return;
      const name = selMaqCat.value;
      const cat = cats.find(c => c.nombre === name);
      const list = cat && cat.subcategorias ? cat.subcategorias : [];
      const keep = selMaqSub.value;
      selMaqSub.innerHTML = '<option value="">— (opcional) —</option>' + list.map(s => `<option value="${escapeHtml(s.nombre)}">${escapeHtml(s.nombre)}</option>`).join('');
      if (keep && list.some(s => s.nombre === keep)) selMaqSub.value = keep;
      else if (curSub && list.some(s => s.nombre === curSub)) selMaqSub.value = curSub;
    }
    if (selMaqCat) selMaqCat.addEventListener('change', refillMaqSub);

    const prevPieza = qs('#m-prev-pieza');
    const prevEns = qs('#m-prev-ensamble');
    function renderMaqMediaPrev(target, url, title) {
      if (!target) return;
      const u = (url || '').trim();
      target.innerHTML = u ? previewMediaThumbBlock(u, title) : '<span class="muted">—</span>';
      wireModalMediaOpenButtons(target);
    }
    renderMaqMediaPrev(prevPieza, qs('#m-h-imagen-pieza')?.value || '', 'Imagen de carga máquina');
    renderMaqMediaPrev(prevEns, qs('#m-h-imagen-ensamble')?.value || '', 'Especificaciones');
    qs('#m-cat-file-pieza')?.addEventListener('change', async () => {
      const dataUrl = await readFileAsDataUrlInput(qs('#m-cat-file-pieza'));
      if (!dataUrl) return;
      qs('#m-h-imagen-pieza').value = dataUrl;
      renderMaqMediaPrev(prevPieza, dataUrl, 'Imagen de carga máquina');
    });
    qs('#m-cat-file-ensamble')?.addEventListener('change', async () => {
      const dataUrl = await readFileAsDataUrlInput(qs('#m-cat-file-ensamble'));
      if (!dataUrl) return;
      qs('#m-h-imagen-ensamble').value = dataUrl;
      renderMaqMediaPrev(prevEns, dataUrl, 'Especificaciones');
    });
    qs('#m-save').onclick = async () => {
      clearInvalidMarks();
      const modelo = (qs('#m-modelo').value || '').trim();
      let err = validateRequired(modelo, 'La versión o modelo de la máquina es obligatorio');
      if (err) { markInvalid('m-modelo', err); return; }
      const errCat = validateRequired(selMaqCat && selMaqCat.value.trim(), 'El nombre de la máquina es obligatorio');
      if (errCat) { markInvalid('m-categoria', errCat); return; }
      const fotoPieza = await readFileAsDataUrlInput(qs('#m-cat-file-pieza'));
      const fotoEns = await readFileAsDataUrlInput(qs('#m-cat-file-ensamble'));
      const hPieza = (qs('#m-h-imagen-pieza') && qs('#m-h-imagen-pieza').value.trim()) || '';
      const hEns = (qs('#m-h-imagen-ensamble') && qs('#m-h-imagen-ensamble').value.trim()) || '';
      const imagenPieza = fotoPieza || hPieza || null;
      const imagenEns = fotoEns || hEns || null;
      const stockNum = !isNew && maquina && maquina.stock != null ? Number(maquina.stock) : 0;
      const plUsd = !isNew && maquina && maquina.precio_lista_usd != null ? Number(maquina.precio_lista_usd) : 0;
      const clienteIdFinal = (maquina && maquina.cliente_id != null)
        ? Number(maquina.cliente_id)
        : (defaultClienteId != null ? defaultClienteId : null);
      const catVal = selMaqCat && selMaqCat.value.trim() ? selMaqCat.value.trim() : null;
      const subVal = selMaqSub && selMaqSub.value.trim() ? selMaqSub.value.trim() : null;
      const fichaEl = qs('#m-ficha-tecnica');
      const fichaTxt = fichaEl && typeof fichaEl.value === 'string' ? fichaEl.value.trim() : '';
      const ficha_tecnica = fichaTxt !== '' ? fichaTxt : null;
      const payload = {
        nombre: modelo,
        codigo: !isNew && maquina && maquina.codigo != null ? String(maquina.codigo).trim() || null : null,
        marca: null,
        categoria: catVal,
        categoria_principal: catVal,
        subcategoria: subVal,
        modelo,
        numero_serie: !isNew && maquina ? (maquina.numero_serie != null && String(maquina.numero_serie).trim() !== '' ? String(maquina.numero_serie).trim() : null) : null,
        ubicacion: !isNew && maquina ? (maquina.ubicacion != null && String(maquina.ubicacion).trim() !== '' ? String(maquina.ubicacion).trim() : null) : null,
        imagen_pieza_url: imagenPieza,
        imagen_ensamble_url: imagenEns,
        ficha_tecnica,
        stock: Number.isFinite(stockNum) ? stockNum : 0,
        precio_lista_usd: Number.isFinite(plUsd) ? plUsd : 0,
      };
      if (clienteIdFinal != null && Number.isFinite(clienteIdFinal)) payload.cliente_id = clienteIdFinal;
      const btn = qs('#m-save');
      const origText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';
      try {
        if (isNew) await fetchJson(API + '/maquinas', { method: 'POST', body: JSON.stringify(payload) });
        else await fetchJson(API + '/maquinas/' + maquina.id, { method: 'PUT', body: JSON.stringify(payload) });
        qs('#modal').classList.add('hidden');
        showToast(isNew ? 'Máquina guardada correctamente.' : 'Máquina actualizada correctamente.', 'success');
        if (isNew) setPaginationPage('tabla-maquinas', 0);
        loadMaquinas({ force: true });
      } catch (e) { showToast(parseApiError(e) || 'No se pudo guardar. Revisa los datos.', 'error'); }
      finally { btn.disabled = false; btn.innerHTML = origText; }
    };
  }

  // ----- MODAL COTIZACIÓN -----
  async function openModalCotizacion(cot) {
    const isNew = !cot || !cot.id;
    const clientes = await fetchJson(API + '/clientes').catch(() => []);
    // Catálogo completo para el modal si hiciera falta; `maquinasCache` carga el listado completo en la pestaña.
    const maquinasCatalogoModal = toArray(await fetchJson(API + '/maquinas').catch(() => []));
    if (!Array.isArray(refaccionesCache) || refaccionesCache.length === 0) {
      const rawRef = await fetchJson(API + '/refacciones').catch(() => []);
      refaccionesCache = toArray(rawRef).map(function (r) {
        return Object.assign({}, r, {
          categoria: refCategoriaLabel(r.categoria),
          subcategoria: refCategoriaLabel(r.subcategoria),
        });
      });
    }
    try {
      const tecRaw = await fetchJson(API + '/tecnicos').catch(() => []);
      tecnicosCache = toArray(tecRaw);
    } catch (_) {}
    try {
      const tarRaw = await fetchJson(API + '/tarifas').catch(() => null);
      if (tarRaw && typeof tarRaw === 'object') {
        try {
          const prev = JSON.parse(localStorage.getItem('tarifas_cache') || '{}');
          localStorage.setItem('tarifas_cache', JSON.stringify({ ...prev, ...tarRaw }));
        } catch (_) {}
      }
    } catch (_) {}
    const vendedoresOpts = (tecnicosCache || [])
      .filter((t) => Number(t.es_vendedor) === 1)
      .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' }))
      .map((t) => {
        const sel = cot && cot.vendedor_personal_id && Number(cot.vendedor_personal_id) === Number(t.id) ? 'selected' : '';
        return `<option value="${t.id}" ${sel}>${escapeHtml(t.nombre)} — ${escapeHtml(t.puesto || 'Vendedor')}</option>`;
      })
      .join('');
    const descInicial = cot && cot.descuento_pct != null ? Number(cot.descuento_pct) : 0;
    const cotClienteId = cot && cot.cliente_id ? Number(cot.cliente_id) : null;
    const clientesCotSorted = [...toArray(clientes)].sort((a, b) =>
      String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' }));
    const clienteOpts = clientesCotSorted
      .map((c) => `<option value="${c.id}" ${cot && cot.cliente_id == c.id ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`)
      .join('');

    const cotMoneda = (cot && cot.moneda ? String(cot.moneda) : 'USD').toUpperCase();
    let cotTc =
      cot && cot.tipo_cambio != null && cot.tipo_cambio !== '' ? Number(cot.tipo_cambio) : NaN;

    let banxicoTcHint = '';
    try {
      const bx = await fetchJson(API + '/tipo-cambio-banxico').catch((err) => ({
        __fetch_err: true,
        msg: String(err && err.message ? err.message : err || 'Error de red'),
      }));
      if (bx && bx.__fetch_err) {
        banxicoTcHint =
          '<p class="hint" style="margin:0.35rem 0 0;font-size:0.78rem;color:var(--danger,#b91c1c)">Tipo de cambio referencia: no se pudo consultar (' +
          escapeHtml(bx.msg) +
          ').</p>';
      } else if (bx && Number(bx.valor) > 0) {
        if (isNew && (!Number.isFinite(cotTc) || cotTc <= 0)) {
          cotTc = Math.round(Number(bx.valor) * 10000) / 10000;
        }
        const fd = bx.fecha_dato ? escapeHtml(String(bx.fecha_dato)) : '';
        const au = bx.actualizado ? escapeHtml(String(bx.actualizado).slice(0, 19).replace('T', ' ')) : '';
        const vtxt = Number(bx.valor).toFixed(4);
        const fuente = String(bx.fuente || '');
        const tit =
          fuente === 'banxico'
            ? 'Banxico (FIX)'
            : fuente === 'fixer'
              ? 'Fixer'
            : fuente === 'exchangerate-api'
              ? 'ExchangeRate-API'
              : fuente === 'frankfurter'
                ? 'Frankfurter/ECB'
                : 'Referencia';
        const notaFrank =
          fuente === 'frankfurter'
            ? ' <em>No</em> es el FIX del DOF; para Banxico oficial define <code>BANXICO_TOKEN</code> en el servidor.'
            : '';
        banxicoTcHint =
          '<p class="hint" style="margin:0.35rem 0 0;font-size:0.78rem">' +
          tit +
          ' (' +
          escapeHtml(String(bx.serie || '')) +
          '): <strong>' +
          vtxt +
          '</strong> MXN por 1 USD' +
          (fd ? ' · ' + fd : '') +
          (au ? ' · sync ' + au + ' UTC' : '') +
          '.' +
          notaFrank +
          '</p>';
      } else if (bx && bx.token_configured === false && !bx.exchangerate_configured) {
        banxicoTcHint =
          '<p class="hint" style="margin:0.35rem 0 0;font-size:0.78rem">Tipo de cambio: el servidor intentó fuentes gratuitas (Frankfurter). Para el <strong>FIX Banxico</strong> agrega <code>BANXICO_TOKEN</code>; opcional <code>FIXER_API_KEY</code> (fixer.io) o <code>EXCHANGE_RATE_API_KEY</code> (exchangerate-api.com).</p>';
      } else {
        const err = bx && bx.error_ultima_consulta ? escapeHtml(String(bx.error_ultima_consulta).slice(0, 140)) : 'Sin dato aún.';
        banxicoTcHint =
          '<p class="hint" style="margin:0.35rem 0 0;font-size:0.78rem">Tipo de cambio referencia: sin valor. Último intento: ' +
          err +
          '</p>';
      }
    } catch (_) {
      banxicoTcHint =
        '<p class="hint" style="margin:0.35rem 0 0;font-size:0.78rem">Tipo de cambio referencia: error al cargar.</p>';
    }
    if (!Number.isFinite(cotTc) || cotTc <= 0) {
      cotTc = 17.0;
    }
    // Se renderiza vacío y se llena dinámicamente tras abrir modal (para usar cliente seleccionado real).
    const maquinasOpts = '';

    const body = `
      <div class="cotz-modal">
        <section class="cotz-card" aria-labelledby="cotz-h-datos">
          <h4 class="cotz-card-title" id="cotz-h-datos"><span class="cotz-step-num">1</span> Datos generales</h4>
          <div class="form-group"><label>Cliente *</label><select id="cotz-cliente_id">${clienteOpts}</select></div>
          <div class="form-row">
            <div class="form-group">
              <label>Tipo de cotización</label>
              <select id="cotz-tipo">
                <option value="refacciones" ${cot && cot.tipo === 'refacciones' ? 'selected' : ''}>Refacciones</option>
                <option value="maquina" ${cot && cot.tipo === 'maquina' ? 'selected' : ''}>Equipo / máquina</option>
                <option value="mano_obra" ${cot && cot.tipo === 'mano_obra' ? 'selected' : ''}>Mano de obra</option>
              </select>
            </div>
            <div class="form-group"><label>Fecha *</label><input type="date" id="cotz-fecha" value="${cot && cot.fecha ? String(cot.fecha).slice(0, 10) : new Date().toISOString().slice(0, 10)}"></div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Moneda</label>
              <select id="cotz-moneda" title="Todas las cotizaciones en USD">
                <option value="USD" selected>USD</option>
              </select>
            </div>
            <div class="form-group">
              <label>Tipo de cambio</label>
              <input type="number" id="cotz-tc" step="0.0001" min="0" value="${Number.isFinite(cotTc) ? cotTc.toFixed(4) : '17.0000'}" placeholder="17.3056">
              <div class="hint">Listas de refacciones y equipo en USD. <strong>Tipo de cambio = pesos mexicanos por 1 USD</strong> (suele verse ~18–21; si en otra página ves ~0.05, es USD por peso, no uses ese número aquí). Las vueltas usan tarifas en MXN y se expresan en USD con este T.C.</div>
              ${banxicoTcHint}
              <div class="form-actions" style="margin-top:0.5rem;flex-wrap:wrap;gap:0.35rem">
                <button type="button" class="btn small outline" id="cotz-recalc-lineas" title="Recalcula refacciones/equipo en USD×TC y vueltas por tarifa (sin cerrar el modal)"><i class="fas fa-sync-alt"></i> Actualizar partidas con este T.C.</button>
              </div>
            </div>
          </div>
          <div class="cotz-vendedor-block" style="margin-top:1rem;padding-top:1rem;border-top:1px solid rgba(15,118,110,0.15);">
            <div class="form-row">
              <div class="form-group">
                <label><i class="fas fa-user-tie"></i> Vendedor responsable</label>
                <select id="cotz-vendedor-id">
                  <option value="">— Quién cotiza / vende —</option>
                  ${vendedoresOpts}
                </select>
              </div>
              <div class="form-group">
                <label>Puesto</label>
                <input type="text" id="cotz-vendedor-puesto" class="input-readonly" readonly value="" placeholder="—">
              </div>
            </div>
            <p class="hint" id="cotz-comision-hint" style="font-size:0.85rem;">Los precios son estándar desde lista × TC. Las comisiones dependen del vendedor (David Cantú: 15% en equipo/máquina y 15% en refacciones según reglas; ver panel Comisiones David Cantú si eres administrador; demás vendedores con comisión en refacciones: típicamente 10%).</p>
            <div class="form-row">
              <div class="form-group">
                <label>Descuento autorizado (% sobre subtotal de partidas)</label>
                <input type="number" id="cotz-descuento-pct" min="0" max="100" step="0.5" value="${Number.isFinite(descInicial) ? descInicial : 0}">
              </div>
            </div>
          </div>
        </section>

        <div class="cotz-inventory-hint" role="note">
          <i class="fas fa-boxes-stacked" aria-hidden="true"></i>
          <div>
            <strong>Inventario</strong> — Las partidas de <em>refacción</em> bajan existencias al usar <strong>Aprobar como venta</strong> en la tabla (no al guardar borrador). Mano de obra / vueltas no mueven almacén.
          </div>
        </div>

        <section class="cotz-card cotz-card--lineas" aria-labelledby="cotz-h-lineas">
          <h4 class="cotz-card-title" id="cotz-h-lineas"><span class="cotz-step-num">2</span> Partidas</h4>
          <div class="table-wrap cotz-lineas-table-wrap">
            <table class="data-table" id="tabla-cot-lineas">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Código</th>
                  <th>Máquina</th>
                  <th>Descripción</th>
                  <th>Cant</th>
                  <th id="cot-lineas-th-pu">P.u. (MXN)</th>
                  <th id="cot-lineas-th-sub">Subt. (MXN)</th>
                  <th class="th-actions"></th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
          <div class="cotz-toolbar-lineas">
            <button type="button" class="btn outline" id="cotz-open-line-panel"><i class="fas fa-plus"></i> Agregar línea…</button>
          </div>
        </section>

        <div id="cot-line-panel" class="mini-panel cotz-add-line-panel hidden" aria-live="polite">
          <div class="mini-panel-head">
            <div class="mini-panel-title">Nueva partida</div>
            <button type="button" class="btn small outline" id="cot-line-cancel">Cerrar formulario</button>
          </div>

          <div class="form-group cotz-line-tipo-row">
            <label>Tipo de línea</label>
            <select id="cot-line-tipo">
              <option value="refaccion">Refacción (lista USD × TC)</option>
              <option value="equipo">Equipo / máquina (lista USD × TC)</option>
              <option value="mano_obra">Mano de obra</option>
              <option value="vuelta">Vuelta (ida + horas × tarifa)</option>
              <option value="otro">Otro</option>
            </select>
            <p class="hint" style="margin:0.35rem 0 0;font-size:0.8rem">Refacción y equipo son partidas distintas: elige el tipo y luego solo el catálogo que corresponda.</p>
          </div>

          <div class="cotz-line-block cotz-line-block--ref" id="cot-line-ref-wrap">
            <div class="cotz-line-block-head"><i class="fas fa-cog"></i> Refacción</div>
            <div class="form-group" style="margin-bottom:0">
              <label>Del catálogo</label>
              <select id="cot-line-refaccion">
                ${[...toArray(refaccionesCache)]
                  .sort((a, b) => String(a.codigo || '').localeCompare(String(b.codigo || ''), 'es', { sensitivity: 'base' }))
                  .slice(0, 200)
                  .map(r => `<option value="${r.id}">${escapeHtml((r.codigo || '') + ' — ' + (r.descripcion || ''))}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="cotz-line-block cotz-line-block--eq" id="cot-line-eq-wrap" style="display:none">
            <div class="cotz-line-block-head"><i class="fas fa-industry"></i> Equipo (catálogo completo)</div>
            <div class="form-group" style="margin-bottom:0">
              <label>Máquina</label>
              <select id="cot-line-maq">
                <option value="">— Elige equipo —</option>
              </select>
            </div>
          </div>

          <div class="form-group" id="cot-line-maq-opt-wrap" style="display:none">
            <label>Ligar a máquina (opcional)</label>
            <select id="cot-line-maq-opt">
              <option value="">— Sin máquina —</option>
            </select>
          </div>

          <div class="form-group" id="cot-line-desc-wrap" style="display:none">
            <label id="cot-line-desc-label">Concepto</label>
            <input type="text" id="cot-line-desc" placeholder="Ej. Diagnóstico, traslado (ida), reparación, etc.">
          </div>

          <div id="cot-line-vuelta-wrap" class="mini-panel" style="display:none;margin-bottom:0.75rem;padding:0.75rem;background:var(--bg-alt,#f8fafc);border-radius:8px">
            <div class="form-row">
              <div class="form-group" style="flex:1;min-width:200px">
                <label><input type="checkbox" id="cot-line-vuelta-ida" checked> Traslado ida (tarifa fija en MXN, convertida si la cotización es USD)</label>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Horas traslado</label>
                <input type="number" id="cot-line-vuelta-hrs-traslado" step="0.5" min="0" value="0"></div>
              <div class="form-group"><label>Horas trabajo (en sitio)</label>
                <input type="number" id="cot-line-vuelta-hrs-trabajo" step="0.5" min="0" value="0"></div>
            </div>
            <p class="hint" id="cot-line-vuelta-preview" style="margin:0.25rem 0 0"></p>
            <p class="hint" style="margin:0.35rem 0 0;font-size:0.8rem">Deja <strong>Precio unitario en 0</strong> para que el servidor calcule con las tarifas <code>vuelta_ida_mxn</code> y <code>vuelta_hora_mxn</code>. Si capturas un precio &gt; 0, se usa como manual.</p>
          </div>

          <div class="form-group" id="cot-line-bit-wrap" style="display:none">
            <label>Bitácora ligada (opcional)</label>
            <select id="cot-line-bitacora">
              <option value="">— Sin bitácora —</option>
            </select>
            <div class="hint">Si ya registraste horas en bitácora, elige una para copiar cantidad y concepto. Si aún no existe, usa <strong>Nueva bitácora</strong> (se liga a esta cotización).</div>
            <div class="form-actions" style="margin-top:0.5rem;">
              <button type="button" class="btn small outline" id="cot-line-new-bit"><i class="fas fa-clock"></i> Nueva bitácora</button>
            </div>
          </div>

          <div id="cot-line-mo-wrap" style="display:none">
            <div class="mo-fields-grid">
              <div class="form-group">
                <label>Tipo de técnico</label>
                <select id="cot-line-mo-tipo-tec">
                  <option value="mecanico">Mecánico</option>
                  <option value="electronico">Electrónico</option>
                  <option value="cnc">CNC / Programación</option>
                </select>
              </div>
              <div class="form-group">
                <label>Horas traslado</label>
                <input type="number" id="cot-line-mo-hrs-traslado" step="0.5" min="0" value="0">
              </div>
              <div class="form-group">
                <label>Horas trabajo</label>
                <input type="number" id="cot-line-mo-hrs-trabajo" step="0.5" min="0" value="1">
              </div>
              <div class="form-group">
                <label># Ayudantes</label>
                <input type="number" id="cot-line-mo-ayudantes" step="1" min="0" value="0">
              </div>
              <div class="form-group">
                <label>Viáticos (días)</label>
                <input type="number" id="cot-line-mo-viaticos-dias" step="1" min="0" value="0">
              </div>
            </div>
            <p class="hint" style="margin:0.35rem 0 0;font-size:0.78rem">Mecánico: <strong>0</strong> ayudantes = 1 técnico (h×1000 MXN); <strong>1</strong> = esquema 2 personas (+400 MXN); <strong>2+</strong> = 3 personas (+900 MXN). Electrónico: con <strong>1+</strong> ayudante = h×1500×1,4. Traslado en carro: h×2000 MXN. Viáticos: 1 pers. = días×1800+1200; 2+ pers. en campo = días×3600+1900 (hoja <em>TARIFAS</em>, Agenda Servicio).</p>
            <div class="cotz-mo-hint">
              <i class="fas fa-calculator"></i> Total en <strong>USD</strong> = suma de conceptos en MXN (lógica anterior) ÷ tipo de cambio. La partida lleva <strong>cantidad 1</strong> (importe en precio unitario).
            </div>
          </div>

          <div class="form-row">
            <div class="form-group" id="cot-line-cant-group">
              <label id="cot-line-cant-label">Cantidad / Horas</label>
              <input type="number" id="cot-line-cant" step="0.25" min="0" value="1">
            </div>
            <div class="form-group">
              <label id="cot-line-precio-label">Precio unitario</label>
              <input type="number" id="cot-line-precio" step="0.01" min="0" value="0">
            </div>
          </div>
          <p id="cot-line-ref-eq-hint" class="hint" style="display:none;margin:0.35rem 0 0;font-size:0.78rem">Catálogo en <strong>USD</strong>; aquí el precio unitario va en <strong>MXN</strong> (lista USD × tipo de cambio). Los totales del paso 3 siguen en la moneda de la cotización.</p>

          <div class="form-actions cotz-add-actions">
            <button type="button" class="btn primary" id="cot-line-add"><i class="fas fa-plus"></i> Agregar a la cotización</button>
          </div>
        </div>

        <section class="cotz-card cotz-card--totals" aria-labelledby="cotz-h-tot">
          <h4 class="cotz-card-title" id="cotz-h-tot"><span class="cotz-step-num">3</span> Importes</h4>
          <div class="form-row cotz-totals-row">
            <div class="form-group"><label>Subtotal</label><input type="text" id="cotz-subtotal" class="input-readonly" readonly value="${Number(cot && cot.subtotal || 0).toFixed(2)}"></div>
            <div class="form-group"><label>IVA (16%)</label><input type="text" id="cotz-iva" class="input-readonly" readonly value="${Number(cot && cot.iva || 0).toFixed(2)}"></div>
            <div class="form-group"><label>Total</label><input type="text" id="cotz-total" class="input-readonly cotz-total-highlight" readonly value="${Number(cot && cot.total || 0).toFixed(2)}"></div>
          </div>
        </section>

        <div class="cotz-modal-footer">
          <button type="button" class="btn primary" id="cotz-save"><i class="fas fa-save"></i> Guardar cotización</button>
          <button type="button" class="btn" id="modal-btn-cancel">Cerrar</button>
        </div>
      </div>
    `;

    openModal(isNew ? 'Nueva cotización' : 'Editar cotización', body);

    // Solo elementos del modal de cotización (evita qs('#m-*') que pega al primer id duplicado en el documento)
    const modalRoot = qs('#modal-body');
    function qm(sel) {
      return modalRoot ? modalRoot.querySelector(sel) : null;
    }
    function cotzMonedaModal() {
      return (qm('#cotz-moneda')?.value || 'USD').toUpperCase();
    }
    function cotzTcModal() {
      const t = Number(qm('#cotz-tc')?.value);
      return t > 0 ? t : 17;
    }
    /** Lista catálogo en USD → valor mostrado en MXN cuando la cotización es USD. */
    function listaUsdTomxnDisplayed(usd) {
      if (cotzMonedaModal() !== 'USD') return Number(usd) || 0;
      return Math.round(Number(usd || 0) * cotzTcModal() * 100) / 100;
    }
    /** Input en MXN (ref/equipo, cot USD) → precio unitario en USD para la API. */
    function precioRefEquipoInputToStoredUsd(raw, tipoLinea) {
      if (tipoLinea !== 'refaccion' && tipoLinea !== 'equipo') return Number(raw) || 0;
      if (cotzMonedaModal() !== 'USD') return Number(raw) || 0;
      const tc = cotzTcModal();
      const v = Number(raw) || 0;
      if (tc <= 0) return v;
      return Math.round((v / tc) * 1e6) / 1e6;
    }
    function getCotzFechaInput() {
      return qm('#cotz-fecha') || qs('#modal-body #cotz-fecha');
    }
    /** Snapshot actual de la cotización en edición; evita usar `cot` inicial desactualizado. */
    let cotSnapshot = cot ? { ...cot } : null;
    /** Fecha YYYY-MM-DD para guardar: input real o respaldo desde snapshot / hoy (evita undefined en JSON). */
    function readCotzFechaForSave() {
      const el = getCotzFechaInput();
      const raw = el && el.value != null ? String(el.value).trim() : '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
      if (cotSnapshot && cotSnapshot.fecha) {
        const s = String(cotSnapshot.fecha).slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      }
      return new Date().toISOString().slice(0, 10);
    }

    const cotId = cot && cot.id ? Number(cot.id) : null;

    function getSelectedIds(selectEl) {
      const ids = [];
      if (!selectEl) return ids;
      Array.from(selectEl.selectedOptions || []).forEach((o) => {
        const v = Number(o.value);
        if (Number.isFinite(v)) ids.push(v);
      });
      return ids;
    }
    function renderLineas(lineas) {
      const tbody = qm('#tabla-cot-lineas tbody');
      if (!tbody) return;
      tbody.innerHTML = '';
      const rows = Array.isArray(lineas) ? lineas : [];
      const tc = cotzTcModal();
      const mon = cotzMonedaModal();
      const thPu = qm('#cot-lineas-th-pu');
      const thSub = qm('#cot-lineas-th-sub');
      if (thPu) thPu.textContent = mon === 'USD' ? 'P.u. (MXN)' : ('P.u. (' + mon + ')');
      if (thSub) thSub.textContent = mon === 'USD' ? 'Subt. (MXN)' : ('Subt. (' + mon + ')');
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty">No hay líneas. Agrega refacciones, vueltas o mano de obra.</td></tr>';
        return;
      }
      rows.forEach((l) => {
        const tr = document.createElement('tr');
        let desc = l.refaccion_descripcion
          ? (l.codigo ? (l.codigo + ' — ' + l.refaccion_descripcion) : l.refaccion_descripcion)
          : (l.descripcion || '');
        if (String(l.tipo_linea || '') === 'vuelta' && !String(desc || '').trim()) {
          const parts = [];
          if (Number(l.es_ida)) parts.push('Ida');
          const ht = Number(l.horas_trabajo) || 0;
          const htr = Number(l.horas_traslado) || 0;
          if (ht) parts.push(ht + 'h trabajo');
          if (htr) parts.push(htr + 'h traslado');
          desc = parts.length ? parts.join(' · ') : 'Vuelta';
        }
        const tipoLbl = l.tipo_linea === 'equipo' ? 'equipo' : String(l.tipo_linea || '');
        const codigoCell = l.codigo ? escapeHtml(String(l.codigo)) : '—';
        const maqCell = l.maquina_nombre ? escapeHtml(String(l.maquina_nombre)) : '—';
        const puUsd = Number(l.precio_unitario || 0);
        const subtUsd = Number(l.subtotal || 0);
        const puDisp = mon === 'USD' ? (puUsd * tc) : puUsd;
        const subtDisp = mon === 'USD' ? (subtUsd * tc) : subtUsd;
        tr.innerHTML = `
          <td>${escapeHtml(tipoLbl)}</td>
          <td class="td-text-wrap">${codigoCell}</td>
          <td class="td-text-wrap">${maqCell}</td>
          <td class="td-text-wrap">${escapeHtml(String(desc || ''))}</td>
          <td class="num">${Number(l.cantidad || 0)}</td>
          <td class="num">${puDisp.toFixed(2)}</td>
          <td class="num">${subtDisp.toFixed(2)}</td>
          <td class="th-actions">
            <button type="button" class="btn small outline btn-edit-line" data-id="${l.id}" title="Editar"><i class="fas fa-pen"></i></button>
            <button type="button" class="btn small danger btn-del-line" data-id="${l.id}" title="Eliminar"><i class="fas fa-trash"></i></button>
          </td>
        `;
        tbody.appendChild(tr);
      });
      tbody.querySelectorAll('.btn-edit-line').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!currentCotId) return;
          const id = Number(btn.dataset.id) || null;
          const linea = rows.find((x) => Number(x.id) === id);
          if (!linea) return;
          openModalEditarLinea(linea);
        });
      });
      tbody.querySelectorAll('.btn-del-line').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!currentCotId) return;
          const id = btn.dataset.id;
          openConfirmModal('¿Eliminar esta línea?', async () => {
            try {
              await fetchJson(`${API}/cotizaciones/${currentCotId}/lineas/${id}`, { method: 'DELETE' });
              await refreshCotizacion();
              showToast('Línea eliminada.', 'success');
            } catch (err) {
              showToast(parseApiError(err) || 'No se pudo eliminar la línea.', 'error');
            }
          });
        });
      });
    }

    let currentCotId = cotId;
    let bitacorasForCot = [];
    let maquinasForModal = [];

    /** Etiqueta de máquina para selects de cotización: nombre máquina · parte · versión (sin cliente). */
    function cotMaqCatalogLabel(m) {
      if (!m) return '';
      const parts = [m.categoria, m.subcategoria, m.modelo || m.nombre].filter((x) => x != null && String(x).trim() !== '');
      if (parts.length) return parts.map((x) => String(x).trim()).join(' · ');
      return String(m.numero_serie || ('#' + m.id)).trim();
    }
    function cotMaqPool() {
      const src = maquinasForModal && maquinasForModal.length ? maquinasForModal : maquinasCatalogoModal;
      return [...toArray(src)].sort((a, b) =>
        cotMaqCatalogLabel(a).localeCompare(cotMaqCatalogLabel(b), 'es', { sensitivity: 'base' }));
    }
    function populateCotLineMaqSelects(preserveMaq, preserveOpt) {
      const list = cotMaqPool();
      const eqSel = qm('#cot-line-maq');
      const optSel = qm('#cot-line-maq-opt');
      const exCot = currentCotId != null ? Number(currentCotId) : null;
      const vEq = preserveMaq != null ? String(preserveMaq) : (eqSel && eqSel.value);
      const vOp = preserveOpt != null ? String(preserveOpt) : (optSel && optSel.value);
      function optHtml(m, selectedVal) {
        const lock = isMaquinaBloqueadaPorOtraCot(m.id, exCot);
        const selected = selectedVal && String(selectedVal) === String(m.id);
        const dis = lock && !selected ? ' disabled' : '';
        const suf = lock ? ' — Ocupada (folio ' + escapeHtml(lock.folio) + ')' : '';
        const sel = selected ? ' selected' : '';
        return `<option value="${m.id}"${sel}${dis}>${escapeHtml(cotMaqCatalogLabel(m) + suf)}</option>`;
      }
      const eqOpts =
        '<option value="">— Elige equipo —</option>' +
        list.map((m) => optHtml(m, vEq)).join('');
      const optOpts =
        '<option value="">— Sin máquina —</option>' +
        list.map((m) => optHtml(m, vOp)).join('');
      if (eqSel) {
        eqSel.innerHTML = eqOpts;
        if (vEq && list.some((m) => String(m.id) === vEq)) eqSel.value = vEq;
      }
      if (optSel) {
        optSel.innerHTML = optOpts;
        if (vOp && list.some((m) => String(m.id) === vOp)) optSel.value = vOp;
      }
    }
    async function refreshCotLineMaqDropdowns() {
      try {
        const raw = await fetchJson(`${API}/maquinas`);
        maquinasForModal = toArray(raw);
      } catch (_) {
        maquinasForModal = toArray(maquinasCatalogoModal).slice();
      }
      try {
        await refreshMaquinaBloqueoCotizacionMap(currentCotId);
      } catch (_) {}
      populateCotLineMaqSelects();
    }

    async function refreshCotizacion() {
      if (!currentCotId) return;
      const fresh = await fetchJson(`${API}/cotizaciones/${currentCotId}`);
      cotSnapshot = fresh && typeof fresh === 'object' ? { ...fresh } : cotSnapshot;
      if (qm('#cotz-subtotal')) qm('#cotz-subtotal').value = Number(fresh.subtotal || 0).toFixed(2);
      if (qm('#cotz-iva')) qm('#cotz-iva').value = Number(fresh.iva || 0).toFixed(2);
      if (qm('#cotz-total')) qm('#cotz-total').value = Number(fresh.total || 0).toFixed(2);
      if (qm('#cotz-descuento-pct') && fresh.descuento_pct != null) qm('#cotz-descuento-pct').value = String(Number(fresh.descuento_pct) || 0);
      if (qm('#cotz-vendedor-id') && fresh.vendedor_personal_id) qm('#cotz-vendedor-id').value = String(fresh.vendedor_personal_id);
      syncVendedorCotz();
      const fin = getCotzFechaInput();
      if (fin && fresh.fecha) {
        const fd = String(fresh.fecha).slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(fd)) fin.value = fd;
      }
      renderLineas(fresh.lineas || []);
      return fresh;
    }

    // Mini panel (Opción A): abre selector para agregar línea
    let lastLineDraft = null;
    function buildDefaultLineDraft() {
      const headerTipo = qm('#cotz-tipo')?.value || (cot && cot.tipo) || 'refacciones';
      const tipoLinea = headerTipo === 'mano_obra' ? 'mano_obra' : 'refaccion';
      const refId = Number(qm('#cot-line-refaccion')?.value) || null;
      return {
        tipo_linea: tipoLinea,
        maquina_id: null,
        refaccion_id: refId,
        descripcion: '',
        cantidad: 1,
        precio_unitario: 0,
      };
    }
    function applyLineDraftToPanel(d) {
      if (!d) return;
      const tipoEl = qm('#cot-line-tipo');
      const maqEl = qm('#cot-line-maq');
      const maqOptEl = qm('#cot-line-maq-opt');
      const refEl = qm('#cot-line-refaccion');
      const descEl = qm('#cot-line-desc');
      const cantEl = qm('#cot-line-cant');
      const precioEl = qm('#cot-line-precio');
      if (tipoEl) tipoEl.value = d.tipo_linea || 'refaccion';
      const tl = d.tipo_linea || 'refaccion';
      const mid = d.maquina_id ? String(d.maquina_id) : '';
      if (maqEl) maqEl.value = tl === 'equipo' ? mid : '';
      if (maqOptEl) {
        maqOptEl.value =
          tl === 'vuelta' || tl === 'mano_obra' || tl === 'otro' ? mid : '';
      }
      if (refEl && d.refaccion_id) refEl.value = String(d.refaccion_id);
      if (descEl) descEl.value = d.descripcion || '';
      if (cantEl) cantEl.value = String(Number(d.cantidad || 1));
      if (precioEl) {
        const storedUsd = Number(d.precio_unitario || 0);
        const showMxn = cotzMonedaModal() === 'USD' && (tl === 'refaccion' || tl === 'equipo');
        precioEl.value = showMxn ? listaUsdTomxnDisplayed(storedUsd).toFixed(2) : storedUsd.toFixed(2);
      }
    }
    function showLinePanel() {
      const p = qm('#cot-line-panel');
      if (!p) return;
      p.classList.remove('hidden');
      qm('#cot-line-tipo')?.focus();
    }
    function hideLinePanel() {
      const p = qm('#cot-line-panel');
      if (!p) return;
      p.classList.add('hidden');
    }
    function getTarifaVal(key) {
      try {
        const cache = JSON.parse(localStorage.getItem('tarifas_cache') || '{}');
        return Number(cache[key]) || 0;
      } catch (_) { return 0; }
    }
    /** Vista previa local (tarifas en caché); el servidor es la fuente de verdad al guardar. */
    function calcCotVueltaBaseMxn() {
      const ida = qm('#cot-line-vuelta-ida')?.checked;
      const ht = Number(qm('#cot-line-vuelta-hrs-trabajo')?.value) || 0;
      const htr = Number(qm('#cot-line-vuelta-hrs-traslado')?.value) || 0;
      const idaMxn = getTarifaVal('vuelta_ida_mxn') || 650;
      const hrMxn = getTarifaVal('vuelta_hora_mxn') || 450;
      return (ida ? idaMxn : 0) + ht * hrMxn + htr * hrMxn;
    }
    function updateCotVueltaPreview() {
      const prev = qm('#cot-line-vuelta-preview');
      if (!prev) return;
      const mon = (qm('#cotz-moneda')?.value || 'USD').toUpperCase();
      const tc = Number(qm('#cotz-tc')?.value) || 17;
      const baseMxn = calcCotVueltaBaseMxn();
      const pu = mon === 'USD' && tc > 0 ? Math.round((baseMxn / tc) * 100) / 100 : Math.round(baseMxn * 100) / 100;
      const unitLbl = mon === 'USD' ? 'USD' : 'MXN';
      prev.textContent = `Sugerido (1 partida): ${pu.toFixed(2)} ${unitLbl} · base tarifas MXN ${baseMxn.toFixed(2)} (ida + horas × tarifa)`;
    }
    /**
     * Mano de obra: importe total de la partida (cantidad = 1).
     * Base MXN alineada a la hoja TARIFAS de AGENDA SERVICIO.xlsx (traslado carro, mecánico 1–3 pers.,
     * electrónico 1–2 pers., viáticos 1–2 pers.) con claves opcionales `mo_agenda_*` en tarifas para ajustar.
     * Cotización en USD: total MXN ÷ T.C.
     */
    function calcManoObraMxnAgendaServicio(tipoTec, hrsTraslado, hrsTrabajo, ayudantes, viaticoDias) {
      const hinT = Math.max(0, Number(hrsTraslado) || 0);
      const hinW = Math.max(0, Number(hrsTrabajo) || 0);
      const ayu = Math.max(0, Math.floor(Number(ayudantes) || 0));
      const vd = Math.max(0, Math.floor(Number(viaticoDias) || 0));

      const trHr = Number(getTarifaVal('mo_agenda_traslado_carro_mxn_hr')) || 2000;
      const trMx = hinT * trHr;

      const mecHr =
        Number(getTarifaVal('mo_agenda_mecanico_mxn_hr')) ||
        Number(getTarifaVal('mecanico_mxn')) ||
        1000;
      const mec2Extra = Number(getTarifaVal('mo_agenda_mecanico_2pers_extra_mxn')) || 400;
      const mec3Extra = Number(getTarifaVal('mo_agenda_mecanico_3pers_extra_mxn')) || 900;
      const elecHr =
        Number(getTarifaVal('mo_agenda_electronico_mxn_hr')) ||
        Number(getTarifaVal('electronico_mxn')) ||
        1500;
      const elec2Mult = Number(getTarifaVal('mo_agenda_electronico_2pers_mult')) || 1.4;

      let trabajoMx = 0;
      const tt = String(tipoTec || 'mecanico').toLowerCase();
      if (tt === 'mecanico') {
        if (ayu >= 2) trabajoMx = hinW * mecHr + mec3Extra;
        else if (ayu === 1) trabajoMx = hinW * mecHr + mec2Extra;
        else trabajoMx = hinW * mecHr;
      } else if (tt === 'electronico') {
        if (ayu >= 1) trabajoMx = hinW * elecHr * elec2Mult;
        else trabajoMx = hinW * elecHr;
      } else {
        const cncHr = Number(getTarifaVal('cnc_mxn')) || mecHr;
        trabajoMx = hinW * cncHr;
      }

      const v1d = Number(getTarifaVal('mo_agenda_viatico1_por_dia_mxn')) || 1800;
      const v1f = Number(getTarifaVal('mo_agenda_viatico1_fijo_mxn')) || 1200;
      const v2d = Number(getTarifaVal('mo_agenda_viatico2_por_dia_mxn')) || 3600;
      const v2f = Number(getTarifaVal('mo_agenda_viatico2_fijo_mxn')) || 1900;
      let viaticoMx = 0;
      if (vd > 0) {
        if (ayu >= 1) viaticoMx = vd * v2d + v2f;
        else viaticoMx = vd * v1d + v1f;
      }

      return {
        trMx,
        trabajoMx,
        viaticoMx,
        totalMxn: trMx + trabajoMx + viaticoMx,
        ayu,
        tt,
      };
    }
    function calcManoObraPrice() {
      const tipoTec = qm('#cot-line-mo-tipo-tec')?.value || 'mecanico';
      const hrsTraslado = Number(qm('#cot-line-mo-hrs-traslado')?.value) || 0;
      const hrsTrabajo = Number(qm('#cot-line-mo-hrs-trabajo')?.value) || 0;
      const ayudantes = Number(qm('#cot-line-mo-ayudantes')?.value) || 0;
      const viaticoDias = Number(qm('#cot-line-mo-viaticos-dias')?.value) || 0;
      const tc = Number(qm('#cotz-tc')?.value) || 17;
      const mon = (qm('#cotz-moneda')?.value || 'USD').toUpperCase();
      const agg = calcManoObraMxnAgendaServicio(tipoTec, hrsTraslado, hrsTrabajo, ayudantes, viaticoDias);
      let pu = 0;
      if (mon === 'USD') {
        pu = tc > 0 ? Math.round((agg.totalMxn / tc) * 100) / 100 : 0;
      } else {
        pu = Math.round(agg.totalMxn * 100) / 100;
      }
      const descParts = [];
      if (hrsTraslado) descParts.push(`${hrsTraslado}h traslado (carro)`);
      if (hrsTrabajo) {
        const tlab = agg.tt === 'electronico' ? 'Electrónico' : agg.tt === 'cnc' ? 'CNC' : 'Mecánico';
        descParts.push(`${hrsTrabajo}h ${tlab}${Math.floor(ayudantes) ? ` +${Math.floor(ayudantes)} ayud.` : ''}`);
      }
      if (viaticoDias) {
        descParts.push(
          `${viaticoDias}d viáticos (${Math.floor(ayudantes) >= 1 ? '2 pers.' : '1 pers.'})`
        );
      }
      const desc = `M.O. (Agenda Servicio) – ${descParts.length ? descParts.join(' · ') : 'sin horas/días'}`;
      if (qm('#cot-line-precio')) qm('#cot-line-precio').value = pu.toFixed(2);
      if (qm('#cot-line-cant')) qm('#cot-line-cant').value = '1';
      if (qm('#cot-line-desc')) qm('#cot-line-desc').value = desc;
    }
    function fillPrecioListaLinea() {
      const t = qm('#cot-line-tipo')?.value || 'refaccion';
      const tc = cotzTcModal();
      const mon = cotzMonedaModal();
      const precioEl = qm('#cot-line-precio');
      if (t === 'refaccion') {
        const rid = Number(qm('#cot-line-refaccion')?.value);
        const r = (refaccionesCache || []).find((x) => Number(x.id) === rid);
        if (r && precioEl) {
          const usd = resolveRefaccionPrecioUsd(r);
          if (mon === 'USD') {
            precioEl.value = (usd != null ? listaUsdTomxnDisplayed(usd) : 0).toFixed(2);
          } else {
            precioEl.value = (usd != null && usd > 0 ? Math.round(usd * tc * 100) / 100 : 0).toFixed(2);
          }
        }
      }
      if (t === 'equipo') {
        const mid = Number(qm('#cot-line-maq')?.value);
        const m = cotMaqPool().find((x) => Number(x.id) === mid);
        if (m && precioEl) {
          const usd = Number(m.precio_lista_usd) || 0;
          if (mon === 'USD') {
            precioEl.value = listaUsdTomxnDisplayed(usd).toFixed(2);
          } else {
            precioEl.value = (usd > 0 ? Math.round(usd * tc * 100) / 100 : 0).toFixed(2);
          }
        }
      }
      if (t === 'vuelta') {
        updateCotVueltaPreview();
        if (precioEl && !(Number(precioEl.value) > 0)) precioEl.value = '0';
      }
      if (t === 'mano_obra') calcManoObraPrice();
    }
    function syncVendedorCotz() {
      const id = qm('#cotz-vendedor-id')?.value;
      const p = (tecnicosCache || []).find((x) => String(x.id) === String(id));
      const puestoEl = qm('#cotz-vendedor-puesto');
      const hint = qm('#cotz-comision-hint');
      if (puestoEl) puestoEl.value = p && p.puesto ? p.puesto : '';
      if (hint) {
        if (!canViewCommissions()) {
          hint.textContent = p
            ? `Vendedor: ${escapeHtml(p.nombre || '')}. Precios de lista × tipo de cambio; el descuento % aplica al subtotal de partidas.`
            : 'Selecciona quién cotiza para dejar trazabilidad. Precios de lista × tipo de cambio.';
        } else if (p) {
          const cm = Number(p.comision_maquinas_pct) || 0;
          const cr = Number(p.comision_refacciones_pct) || 0;
          const nom = escapeHtml(p.nombre || '');
          hint.innerHTML =
            `<strong>${nom}</strong> — Comisión estándar: <strong>${cm}%</strong> en venta de equipo (solo David Cantú tiene % en máquinas; otros 0%) ·
            <strong>${cr}%</strong> en refacciones. Los importes salen de lista × tipo de cambio; el descuento % se aplica al subtotal de partidas.`;
        } else {
          hint.textContent =
            'Selecciona quién cotiza para dejar trazabilidad y evitar precios distintos entre vendedores. Precios siempre de lista × TC.';
        }
      }
    }
    function syncLinePanelFields() {
      const t = qm('#cot-line-tipo')?.value || 'refaccion';
      const refWrap = qm('#cot-line-ref-wrap');
      const eqWrap = qm('#cot-line-eq-wrap');
      const maqOptWrap = qm('#cot-line-maq-opt-wrap');
      const descWrap = qm('#cot-line-desc-wrap');
      const descLabel = qm('#cot-line-desc-label');
      const bitWrap = qm('#cot-line-bit-wrap');
      const moWrap = qm('#cot-line-mo-wrap');
      const vuWrap = qm('#cot-line-vuelta-wrap');
      if (refWrap) refWrap.style.display = t === 'refaccion' ? '' : 'none';
      if (eqWrap) eqWrap.style.display = t === 'equipo' ? '' : 'none';
      if (maqOptWrap) {
        maqOptWrap.style.display =
          t === 'vuelta' || t === 'mano_obra' || t === 'otro' ? '' : 'none';
      }
      if (descWrap) {
        if (t === 'vuelta') {
          descWrap.style.display = '';
          if (descLabel) descLabel.textContent = 'Concepto (opcional)';
        } else {
          descWrap.style.display = t === 'refaccion' || t === 'equipo' ? 'none' : '';
          if (descLabel) descLabel.textContent = 'Concepto';
        }
      }
      if (bitWrap) bitWrap.style.display = t === 'mano_obra' ? '' : 'none';
      if (moWrap) moWrap.style.display = t === 'mano_obra' ? '' : 'none';
      if (vuWrap) vuWrap.style.display = t === 'vuelta' ? '' : 'none';
      const cantLab = qm('#cot-line-cant-label');
      const cantGroup = qm('#cot-line-cant-group');
      const precioLab = qm('#cot-line-precio-label');
      const refEqHint = qm('#cot-line-ref-eq-hint');
      const mon = cotzMonedaModal();
      if (cantGroup) cantGroup.style.display = t === 'mano_obra' || t === 'vuelta' ? 'none' : '';
      if (cantLab) {
        if (t === 'vuelta') cantLab.textContent = 'Cantidad (fija 1 en servidor)';
        else if (t === 'refaccion' || t === 'equipo' || t === 'otro') cantLab.textContent = 'Cantidad';
        else cantLab.textContent = 'Cantidad / Horas';
      }
      if (precioLab) {
        if (mon === 'USD' && (t === 'refaccion' || t === 'equipo')) precioLab.textContent = 'Precio unitario (MXN)';
        else if (t === 'mano_obra') precioLab.textContent = 'Precio unitario (USD)';
        else precioLab.textContent = 'Precio unitario';
      }
      if (refEqHint) refEqHint.style.display = mon === 'USD' && (t === 'refaccion' || t === 'equipo') ? '' : 'none';
      if (t === 'mano_obra') calcManoObraPrice();
      if (t === 'refaccion' || t === 'equipo') fillPrecioListaLinea();
      if (t === 'vuelta') {
        if (qm('#cot-line-cant')) qm('#cot-line-cant').value = '1';
        fillPrecioListaLinea();
        updateCotVueltaPreview();
      }
    }
    async function ensureCotizacionExistsBeforeLines() {
      if (currentCotId) return currentCotId;
      // Auto-guardar header para permitir agregar líneas desde "Nueva cotización"
      const fecha = readCotzFechaForSave();
      const clienteId = parseInt(qm('#cotz-cliente_id')?.value, 10);
      if (!clienteId) { showToast('Selecciona un cliente.', 'warning'); return null; }
      if (!fecha) { showToast('Selecciona una fecha.', 'warning'); return null; }
      const tipo = qm('#cotz-tipo')?.value || 'refacciones';
      const moneda = (qm('#cotz-moneda')?.value || 'USD').toUpperCase();
      const tc = Number(qm('#cotz-tc')?.value) || 17.0;
      const vid = qm('#cotz-vendedor-id')?.value ? Number(qm('#cotz-vendedor-id').value) : null;
      const vend = (tecnicosCache || []).find((x) => Number(x.id) === Number(vid));
      const payload = {
        cliente_id: clienteId,
        tipo,
        fecha,
        moneda,
        tipo_cambio: tc,
        maquinas_ids: [],
        vendedor_personal_id: vid && vid > 0 ? vid : null,
        descuento_pct: Math.min(100, Math.max(0, Number(qm('#cotz-descuento-pct')?.value) || 0)),
        vendedor: vend ? vend.nombre : null,
      };
      try {
        const created = await fetchJson(`${API}/cotizaciones`, { method: 'POST', body: JSON.stringify(payload) });
        currentCotId = Number(created && created.id) || null;
        if (currentCotId) {
          showToast('Cotización guardada. Ya puedes agregar líneas.', 'success');
          await refreshCotizacion();
          await loadBitacorasForCotizacion();
        }
        return currentCotId;
      } catch (e) {
        showToast(parseApiError(e) || 'No se pudo guardar la cotización.', 'error');
        return null;
      }
    }

    qm('#cotz-open-line-panel')?.addEventListener('click', async () => {
      const okId = await ensureCotizacionExistsBeforeLines();
      if (!okId) return;
      // Refrescar bitácoras cada vez que se abre (por si se crearon en otra pestaña)
      loadBitacorasForCotizacion();
      if (!lastLineDraft) lastLineDraft = buildDefaultLineDraft();
      applyLineDraftToPanel(lastLineDraft);
      syncLinePanelFields();
      showLinePanel();
    });
    qm('#cot-line-cancel')?.addEventListener('click', hideLinePanel);
    qm('#cot-line-tipo')?.addEventListener('change', syncLinePanelFields);
    qm('#cot-line-refaccion')?.addEventListener('change', fillPrecioListaLinea);
    qm('#cot-line-maq')?.addEventListener('change', fillPrecioListaLinea);
    qm('#cotz-tc')?.addEventListener('input', fillPrecioListaLinea);
    qm('#cotz-tc')?.addEventListener('change', fillPrecioListaLinea);
    qm('#cotz-moneda')?.addEventListener('change', fillPrecioListaLinea);
    qm('#cotz-vendedor-id')?.addEventListener('change', syncVendedorCotz);
    ['#cot-line-vuelta-ida', '#cot-line-vuelta-hrs-traslado', '#cot-line-vuelta-hrs-trabajo'].forEach((sel) => {
      qm(sel)?.addEventListener('input', () => {
        if ((qm('#cot-line-tipo')?.value || '') === 'vuelta') updateCotVueltaPreview();
      });
      qm(sel)?.addEventListener('change', () => {
        if ((qm('#cot-line-tipo')?.value || '') === 'vuelta') {
          updateCotVueltaPreview();
          fillPrecioListaLinea();
        }
      });
    });
    async function postRecalcCotizacionLineas() {
      if (!currentCotId) {
        showToast('Guarda la cotización o agrega una línea para crear el borrador antes de recalcular.', 'warning');
        return;
      }
      try {
        await fetchJson(`${API}/cotizaciones/${currentCotId}/recalc-lineas`, { method: 'POST', body: JSON.stringify({}) });
        await refreshCotizacion();
        showToast('Partidas actualizadas con el tipo de cambio y tarifas.', 'success');
      } catch (e) {
        showToast(parseApiError(e) || 'No se pudo recalcular las líneas.', 'error');
      }
    }
    qm('#cotz-recalc-lineas')?.addEventListener('click', postRecalcCotizacionLineas);
    // Mano de obra: recalcular precio cuando cambia cualquier campo
    ['#cot-line-mo-tipo-tec','#cot-line-mo-hrs-traslado',
     '#cot-line-mo-hrs-trabajo','#cot-line-mo-ayudantes','#cot-line-mo-viaticos-dias'].forEach(sel => {
      qm(sel)?.addEventListener('input', calcManoObraPrice);
      qm(sel)?.addEventListener('change', calcManoObraPrice);
    });
    syncLinePanelFields();
    syncVendedorCotz();

    qm('#cotz-cliente_id')?.addEventListener('change', async () => {
      await refreshCotLineMaqDropdowns();
    });

    qm('#cot-line-new-bit')?.addEventListener('click', async () => {
      const okId = await ensureCotizacionExistsBeforeLines();
      if (!okId) return;
      openModalBitacora({ cotizacion_id: okId }, { stack: true, onSaved: () => loadBitacorasForCotizacion() });
    });

    async function loadBitacorasForCotizacion() {
      if (!currentCotId) return [];
      try {
        const rows = await fetchJson(`${API}/bitacoras?cotizacion_id=${encodeURIComponent(String(currentCotId))}`);
        bitacorasForCot = toArray(rows);
      } catch (_) {
        bitacorasForCot = [];
      }
      const sel = qm('#cot-line-bitacora');
      if (sel) {
        sel.innerHTML = '<option value="">— Sin bitácora —</option>' + bitacorasForCot
          .map((b) => {
            const label = (b.fecha ? String(b.fecha).slice(0, 10) : '') + ' · ' + (b.tecnico || 'Técnico') + ' · ' + (Number(b.tiempo_horas || 0).toFixed(1) + ' h');
            return `<option value="${b.id}">${escapeHtml(label)}</option>`;
          })
          .join('');
      }
      return bitacorasForCot;
    }

    try {
      await refreshCotLineMaqDropdowns();
      if (currentCotId) await loadBitacorasForCotizacion();
    } catch (_) {}

    qm('#cot-line-bitacora')?.addEventListener('change', () => {
      const bitId = Number(qm('#cot-line-bitacora')?.value) || null;
      if (!bitId) return;
      const bit = (bitacorasForCot || []).find((b) => Number(b.id) === bitId);
      if (!bit) return;
      const horas = Number(bit.tiempo_horas) || 0;
      const act = (bit.actividades || '').trim();
      const tec = (bit.tecnico || '').trim();
      if ((qm('#cot-line-tipo')?.value || '') === 'mano_obra') {
        if (qm('#cot-line-mo-hrs-trabajo')) qm('#cot-line-mo-hrs-trabajo').value = String(horas || 1);
        calcManoObraPrice();
      } else if (qm('#cot-line-cant')) {
        qm('#cot-line-cant').value = String(horas || 1);
      }
      if (qm('#cot-line-desc')) qm('#cot-line-desc').value = (tec && act) ? `${act} (${tec})` : (act || tec || '');
    });

    // Load initial lines if editing
    if (currentCotId) {
      try { await refreshCotizacion(); } catch (_) {}
      try { await loadBitacorasForCotizacion(); } catch (_) {}
    } else {
      renderLineas([]);
    }

    qm('#cot-line-add')?.addEventListener('click', async () => {
      if (!currentCotId) return;
      const tipoLinea = qm('#cot-line-tipo')?.value || 'refaccion';
      const cant = Number(qm('#cot-line-cant')?.value) || 0;
      const precioRaw = Number(qm('#cot-line-precio')?.value) || 0;
      const precio = precioRefEquipoInputToStoredUsd(precioRaw, tipoLinea);
      const maqEquipo = Number(qm('#cot-line-maq')?.value) || null;
      const maqOpt = Number(qm('#cot-line-maq-opt')?.value) || null;
      let maqId = null;
      if (tipoLinea === 'equipo') maqId = maqEquipo;
      else if (tipoLinea === 'vuelta' || tipoLinea === 'mano_obra' || tipoLinea === 'otro') maqId = maqOpt;
      const bitId = Number(qm('#cot-line-bitacora')?.value) || null;
      if (tipoLinea === 'equipo' && !maqId) {
        showToast('Selecciona la máquina / equipo para la línea de venta.', 'warning');
        return;
      }
      if (maqId) {
        const lock = isMaquinaBloqueadaPorOtraCot(maqId, currentCotId);
        if (lock) {
          showToast(
            'Esta máquina ya está en la cotización pendiente ' +
              lock.folio +
              '. Cancela o concluye esa cotización antes de volver a cotizar el mismo equipo.',
            'error'
          );
          return;
        }
      }
      let payload = { tipo_linea: tipoLinea, cantidad: cant, precio_unitario: precio, maquina_id: maqId, bitacora_id: bitId };
      if (tipoLinea === 'refaccion') {
        const refId = Number(qm('#cot-line-refaccion')?.value) || null;
        payload = { ...payload, refaccion_id: refId, maquina_id: null };
      } else if (tipoLinea === 'vuelta') {
        const desc = qm('#cot-line-desc')?.value?.trim() || '';
        payload = {
          tipo_linea: 'vuelta',
          cantidad: 1,
          precio_unitario: precio > 0 ? precio : 0,
          maquina_id: maqId,
          bitacora_id: null,
          es_ida: !!qm('#cot-line-vuelta-ida')?.checked,
          horas_trabajo: Number(qm('#cot-line-vuelta-hrs-trabajo')?.value) || 0,
          horas_traslado: Number(qm('#cot-line-vuelta-hrs-traslado')?.value) || 0,
          descripcion: desc || null,
        };
      } else if (tipoLinea === 'mano_obra') {
        const desc = qm('#cot-line-desc')?.value?.trim() || '';
        const tipoTecMo = qm('#cot-line-mo-tipo-tec')?.value || 'mecanico';
        const htr = Number(qm('#cot-line-mo-hrs-traslado')?.value) || 0;
        const ht = Number(qm('#cot-line-mo-hrs-trabajo')?.value) || 0;
        const ayu = Number(qm('#cot-line-mo-ayudantes')?.value) || 0;
        const via = Number(qm('#cot-line-mo-viaticos-dias')?.value) || 0;
        payload = {
          tipo_linea: 'mano_obra',
          cantidad: 1,
          precio_unitario: precio,
          maquina_id: maqId,
          bitacora_id: bitId || null,
          descripcion: desc || null,
          horas_trabajo: ht,
          horas_traslado: htr,
          zona: null,
          ayudantes: ayu,
          tarifa_aplicada: JSON.stringify({
            tipo_tecnico: tipoTecMo,
            viaticos_dias: via,
            esquema: 'agenda_servicio_tarifas',
          }),
        };
      } else if (tipoLinea !== 'equipo') {
        const desc = qm('#cot-line-desc')?.value?.trim() || '';
        payload = { ...payload, descripcion: desc || null };
      }
      try {
        await fetchJson(`${API}/cotizaciones/${currentCotId}/lineas`, { method: 'POST', body: JSON.stringify(payload) });
        await refreshCotizacion();
        // Guardar como “default” para la siguiente línea (UX: abrir y solo dar Agregar)
        lastLineDraft = {
          tipo_linea: tipoLinea,
          maquina_id: maqId,
          refaccion_id: payload.refaccion_id || null,
          descripcion: payload.descripcion || '',
          cantidad: cant || 1,
          precio_unitario: precio || 0,
        };
        hideLinePanel();
        await loadBitacorasForCotizacion();
        showToast('Línea agregada.', 'success');
      } catch (e) {
        showToast(parseApiError(e) || 'No se pudo agregar la línea.', 'error');
      }
    });

    async function openModalEditarLinea(linea) {
      try {
        await refreshMaquinaBloqueoCotizacionMap(currentCotId);
      } catch (_) {}
      const isRef = String(linea.tipo_linea || '') === 'refaccion';
      const isEquipo = String(linea.tipo_linea || '') === 'equipo';
      const isMO = String(linea.tipo_linea || '') === 'mano_obra';
      const isVuelta = String(linea.tipo_linea || '') === 'vuelta';
      const pool = cotMaqPool();
      const mid = Number(linea.maquina_id) || null;
      const exCot = currentCotId != null ? Number(currentCotId) : null;
      function maqOptionTag(m, selectedMid) {
        const lock = isMaquinaBloqueadaPorOtraCot(m.id, exCot);
        const selected = selectedMid != null && Number(selectedMid) === Number(m.id);
        const dis = lock && !selected ? ' disabled' : '';
        const suf = lock && !selected ? ' — Ocupada (folio ' + escapeHtml(String(lock.folio)) + ')' : '';
        return `<option value="${m.id}"${selected ? ' selected' : ''}${dis}>${escapeHtml(cotMaqCatalogLabel(m) + suf)}</option>`;
      }
      const maqOptsEq = ['<option value="">— Elige equipo —</option>']
        .concat(pool.map((m) => maqOptionTag(m, mid)))
        .join('');
      const maqOptsOpt = ['<option value="">— Sin máquina —</option>']
        .concat(pool.map((m) => maqOptionTag(m, mid)))
        .join('');
      const refOpts = [...toArray(refaccionesCache)]
        .sort((a, b) => String(a.codigo || '').localeCompare(String(b.codigo || ''), 'es', { sensitivity: 'base' }))
        .slice(0, 200)
        .map((r) => `<option value="${r.id}" ${Number(linea.refaccion_id) === Number(r.id) ? 'selected' : ''}>${escapeHtml((r.codigo || '') + ' — ' + (r.descripcion || ''))}</option>`).join('');
      const bitOpts = ['<option value="">— Sin bitácora —</option>']
        .concat((bitacorasForCot || []).map((b) => {
          const label = (b.fecha ? String(b.fecha).slice(0, 10) : '') + ' · ' + (b.tecnico || 'Técnico') + ' · ' + (Number(b.tiempo_horas || 0).toFixed(1) + ' h');
          const sel = Number(linea.bitacora_id) === Number(b.id) ? 'selected' : '';
          return `<option value="${b.id}" ${sel}>${escapeHtml(label)}</option>`;
        }))
        .join('');
      const monEdit = cotzMonedaModal();
      const tlStored = String(linea.tipo_linea || '');
      const puStored = Number(linea.precio_unitario || 0);
      const precioEditInitial =
        monEdit === 'USD' && (tlStored === 'refaccion' || tlStored === 'equipo')
          ? listaUsdTomxnDisplayed(puStored).toFixed(2)
          : puStored.toFixed(2);
      const html = `
        <div class="form-group">
          <label>Tipo de línea</label>
          <select id="e-line-tipo">
            <option value="refaccion" ${String(linea.tipo_linea) === 'refaccion' ? 'selected' : ''}>Refacción</option>
            <option value="equipo" ${String(linea.tipo_linea) === 'equipo' ? 'selected' : ''}>Equipo / máquina</option>
            <option value="mano_obra" ${String(linea.tipo_linea) === 'mano_obra' ? 'selected' : ''}>Mano de obra</option>
            <option value="vuelta" ${String(linea.tipo_linea) === 'vuelta' ? 'selected' : ''}>Vuelta</option>
            <option value="otro" ${String(linea.tipo_linea) === 'otro' ? 'selected' : ''}>Otro</option>
          </select>
        </div>
        <div class="form-group" id="e-line-ref-wrap" style="${isRef ? '' : 'display:none'}">
          <label>Refacción</label>
          <select id="e-line-ref">${refOpts}</select>
        </div>
        <div class="form-group" id="e-line-eq-wrap" style="${isEquipo ? '' : 'display:none'}">
          <label>Máquina (catálogo)</label>
          <select id="e-line-maq-eq">${maqOptsEq}</select>
        </div>
        <div class="form-group" id="e-line-maq-opt-wrap" style="${isVuelta || isMO || String(linea.tipo_linea) === 'otro' ? '' : 'display:none'}">
          <label>Ligar a máquina (opcional)</label>
          <select id="e-line-maq-opt">${maqOptsOpt}</select>
        </div>
        <div class="form-group" id="e-line-desc-wrap" style="${isRef || isEquipo ? 'display:none' : ''}">
          <label>Descripción</label>
          <input type="text" id="e-line-desc" value="${escapeHtml(linea.descripcion || '')}">
        </div>
        <div class="form-group" id="e-line-bit-wrap" style="${isMO ? '' : 'display:none'}">
          <label>Bitácora ligada</label>
          <select id="e-line-bit">${bitOpts}</select>
        </div>
        <div id="e-line-vuelta-wrap" style="${isVuelta ? 'margin-bottom:0.75rem;padding:0.65rem;background:var(--bg-alt,#f8fafc);border-radius:8px' : 'display:none'}">
          <div class="form-group"><label><input type="checkbox" id="e-line-vuelta-ida" ${Number(linea.es_ida) ? 'checked' : ''}> Traslado ida (tarifa fija)</label></div>
          <div class="form-row">
            <div class="form-group"><label>Horas traslado</label>
              <input type="number" id="e-line-vuelta-htr" step="0.5" min="0" value="${Number(linea.horas_traslado) || 0}"></div>
            <div class="form-group"><label>Horas trabajo</label>
              <input type="number" id="e-line-vuelta-ht" step="0.5" min="0" value="${Number(linea.horas_trabajo) || 0}"></div>
          </div>
          <p class="hint" style="margin:0;font-size:0.8rem">Precio en <strong>0</strong> recalcula por tarifas al guardar; si capturas precio &gt; 0 queda manual.</p>
        </div>
        <div class="form-row" id="e-line-cant-precio-row">
          <div class="form-group" id="e-line-cant-group">
            <label id="e-line-cant-label">Cantidad</label>
            <input type="number" id="e-line-cant" step="0.25" min="0" value="${Number(linea.cantidad || 0)}">
          </div>
          <div class="form-group">
            <label id="e-line-precio-label">Precio unitario</label>
            <input type="number" id="e-line-precio" step="0.01" min="0" value="${precioEditInitial}">
          </div>
        </div>
        <div class="form-actions">
          ${isMO && linea.bitacora_id ? `<button type="button" class="btn outline" id="e-line-open-bit"><i class="fas fa-clock"></i> Abrir bitácora</button>` : ''}
          <button type="button" class="btn primary" id="e-line-save"><i class="fas fa-save"></i> Guardar cambios</button>
          <button type="button" class="btn" id="modal-btn-cancel">Cancelar</button>
        </div>
      `;
      openModal('Editar línea', html);
      function syncEditFields() {
        const t = qs('#e-line-tipo')?.value || 'otro';
        const refWrap = qs('#e-line-ref-wrap');
        const eqWrap = qs('#e-line-eq-wrap');
        const maqOptWrap = qs('#e-line-maq-opt-wrap');
        const descWrap = qs('#e-line-desc-wrap');
        const bitWrap = qs('#e-line-bit-wrap');
        const vuWrap = qs('#e-line-vuelta-wrap');
        if (refWrap) refWrap.style.display = t === 'refaccion' ? '' : 'none';
        if (eqWrap) eqWrap.style.display = t === 'equipo' ? '' : 'none';
        if (maqOptWrap) {
          maqOptWrap.style.display =
            t === 'vuelta' || t === 'mano_obra' || t === 'otro' ? '' : 'none';
        }
        if (descWrap) descWrap.style.display = t === 'refaccion' || t === 'equipo' ? 'none' : '';
        if (bitWrap) bitWrap.style.display = t === 'mano_obra' ? '' : 'none';
        if (vuWrap) vuWrap.style.display = t === 'vuelta' ? '' : 'none';
        const cantGroup = qs('#e-line-cant-group');
        const cantLab = qs('#e-line-cant-label');
        const precioLab = qs('#e-line-precio-label');
        const monE = (qm('#cotz-moneda')?.value || 'USD').toUpperCase();
        if (cantGroup) cantGroup.style.display = t === 'mano_obra' || t === 'vuelta' ? 'none' : '';
        if (cantLab) {
          if (t === 'vuelta') cantLab.textContent = 'Cantidad (fija 1 en servidor)';
          else if (t === 'refaccion' || t === 'equipo' || t === 'otro') cantLab.textContent = 'Cantidad';
          else cantLab.textContent = 'Cantidad / Horas';
        }
        if (precioLab) {
          if (monE === 'USD' && (t === 'refaccion' || t === 'equipo')) precioLab.textContent = 'Precio unitario (MXN)';
          else if (t === 'mano_obra') precioLab.textContent = 'Precio unitario (USD)';
          else precioLab.textContent = 'Precio unitario';
        }
      }
      function fillEditPrecioLista() {
        const t = qs('#e-line-tipo')?.value || 'otro';
        const tc = Number(qm('#cotz-tc')?.value) || 17;
        const mon = (qm('#cotz-moneda')?.value || 'USD').toUpperCase();
        const precioEl = qs('#e-line-precio');
        if (!precioEl) return;
        if (t === 'refaccion') {
          const rid = Number(qs('#e-line-ref')?.value);
          const r = (refaccionesCache || []).find((x) => Number(x.id) === rid);
          if (r) {
            const usd = resolveRefaccionPrecioUsd(r);
            const pu =
              mon === 'USD'
                ? (usd != null ? listaUsdTomxnDisplayed(usd) : 0)
                : usd != null && usd > 0
                  ? Math.round(usd * tc * 100) / 100
                  : 0;
            precioEl.value = pu.toFixed(2);
          }
        } else if (t === 'equipo') {
          const mid = Number(qs('#e-line-maq-eq')?.value);
          const m = cotMaqPool().find((x) => Number(x.id) === mid);
          if (m) {
            const usd = Number(m.precio_lista_usd) || 0;
            const pu = mon === 'USD' ? listaUsdTomxnDisplayed(usd) : usd > 0 ? Math.round(usd * tc * 100) / 100 : 0;
            precioEl.value = pu.toFixed(2);
          }
        }
      }
      qs('#e-line-ref')?.addEventListener('change', fillEditPrecioLista);
      qs('#e-line-maq-eq')?.addEventListener('change', fillEditPrecioLista);
      qs('#e-line-tipo')?.addEventListener('change', () => {
        syncEditFields();
        fillEditPrecioLista();
      });
      syncEditFields();
      if (qs('#e-line-open-bit')) {
        qs('#e-line-open-bit').addEventListener('click', () => editBitacora(linea.bitacora_id));
      }
      qs('#e-line-save')?.addEventListener('click', async () => {
        const tipoLinea = qs('#e-line-tipo')?.value || 'otro';
        let maquina_id = null;
        if (tipoLinea === 'equipo') maquina_id = Number(qs('#e-line-maq-eq')?.value) || null;
        else if (tipoLinea === 'vuelta' || tipoLinea === 'mano_obra' || tipoLinea === 'otro') {
          maquina_id = Number(qs('#e-line-maq-opt')?.value) || null;
        }
        if (maquina_id) {
          const lock = isMaquinaBloqueadaPorOtraCot(maquina_id, currentCotId);
          if (lock) {
            showToast(
              'Esta máquina ya está en la cotización pendiente ' +
                lock.folio +
                '. No se puede mover esta línea a ese equipo hasta liberar la otra cotización.',
              'error'
            );
            return;
          }
        }
        const precioRawEdit = Number(qs('#e-line-precio')?.value) || 0;
        const precioUsdStored = precioRefEquipoInputToStoredUsd(precioRawEdit, tipoLinea);
        const payload = {
          tipo_linea: tipoLinea,
          maquina_id,
          cantidad: Number(qs('#e-line-cant')?.value) || 0,
          precio_unitario: precioUsdStored,
          bitacora_id: Number(qs('#e-line-bit')?.value) || null,
        };
        if (tipoLinea === 'refaccion') {
          payload.refaccion_id = Number(qs('#e-line-ref')?.value) || null;
          payload.maquina_id = null;
        } else if (tipoLinea !== 'equipo') payload.descripcion = qs('#e-line-desc')?.value?.trim() || null;
        if (tipoLinea === 'vuelta') {
          payload.cantidad = 1;
          payload.es_ida = !!qs('#e-line-vuelta-ida')?.checked;
          payload.horas_trabajo = Number(qs('#e-line-vuelta-ht')?.value) || 0;
          payload.horas_traslado = Number(qs('#e-line-vuelta-htr')?.value) || 0;
        }
        try {
          await fetchJson(`${API}/cotizaciones/${currentCotId}/lineas/${linea.id}`, { method: 'PUT', body: JSON.stringify(payload) });
          qs('#modal').classList.add('hidden');
          await refreshCotizacion();
          await loadBitacorasForCotizacion();
          showToast('Línea actualizada.', 'success');
        } catch (e) {
          showToast(parseApiError(e) || 'No se pudo actualizar la línea.', 'error');
        }
      });
    }

    qm('#cotz-save').onclick = async () => {
      clearInvalidMarks();
      const fecha = readCotzFechaForSave();
      let err = validateRequired(fecha, 'La fecha es obligatoria');
      if (err) { markInvalid(getCotzFechaInput(), err); return; }
      const clienteId = parseInt(qm('#cotz-cliente_id')?.value, 10);
      if (!clienteId) { markInvalid(qm('#cotz-cliente_id'), 'Selecciona un cliente'); return; }
      const tipo = qm('#cotz-tipo')?.value;
      const moneda = (qm('#cotz-moneda')?.value || 'USD').toUpperCase();
      const tc = Number(qm('#cotz-tc')?.value) || 0;
      const vid = qm('#cotz-vendedor-id')?.value ? Number(qm('#cotz-vendedor-id').value) : null;
      const vend = (tecnicosCache || []).find((x) => Number(x.id) === Number(vid));
      const payload = {
        cliente_id: clienteId,
        tipo,
        fecha,
        moneda,
        tipo_cambio: tc > 0 ? tc : 17.0,
        maquinas_ids: [],
        vendedor_personal_id: vid && vid > 0 ? vid : null,
        descuento_pct: Math.min(100, Math.max(0, Number(qm('#cotz-descuento-pct')?.value) || 0)),
        vendedor: vend ? vend.nombre : null,
      };
      const btn = qm('#cotz-save');
      if (!btn) return;
      const origText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';
      try {
        if (!currentCotId) {
          const created = await fetchJson(`${API}/cotizaciones`, { method: 'POST', body: JSON.stringify(payload) });
          currentCotId = Number(created && created.id) || null;
          cotSnapshot = created && typeof created === 'object' ? { ...created } : cotSnapshot;
          showToast('Cotización guardada. Ahora puedes agregar líneas.', 'success');
          if (currentCotId) await refreshCotizacion();
        } else {
          // Si ya existe, preservar folio actual (creado en auto-guardado al agregar línea primero).
          if (cotSnapshot && cotSnapshot.folio) payload.folio = cotSnapshot.folio;
          await fetchJson(`${API}/cotizaciones/${currentCotId}`, { method: 'PUT', body: JSON.stringify(payload) });
          await refreshCotizacion();
          showToast('Cotización actualizada.', 'success');
        }
        loadCotizaciones({ force: true });
      } catch (e) {
        showToast(parseApiError(e) || 'No se pudo guardar. Revisa los datos.', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
      }
    };
  }

  async function editCotizacion(id) {
    try {
      const cot = await fetchJson(API + '/cotizaciones/' + id);
      openModalCotizacion(cot);
    } catch (e) { showToast(parseApiError(e) || 'No se pudo cargar la cotización.', 'error'); }
  }
  async function duplicateCotizacion(id) {
    try {
      const cot = await fetchJson(API + '/cotizaciones/' + id);
      const copy = { ...cot, id: undefined, folio: '' };
      openModalCotizacion(copy);
    } catch (e) { showToast(parseApiError(e) || 'No se pudo duplicar la cotización.', 'error'); }
  }
  function buildPdfUrl(page, id, audience, autoprint) {
    const base = window.location.pathname.replace(/\/[^/]*$/, '') || '';
    const q = [
      'id=' + encodeURIComponent(id),
      'audience=' + encodeURIComponent(audience || 'cliente'),
      'autoprint=' + encodeURIComponent(String(autoprint ? 1 : 0)),
      'v=2',
    ].join('&');
    return (base ? base + '/' : '') + page + '?' + q;
  }
  function openPdfPreview(kind, id) {
    const page = kind === 'cotizacion' ? 'cotizacion-pdf.html' : (kind === 'incidente' ? 'incidente-pdf.html' : 'bitacora-pdf.html');
    const PDF_ZOOM_KEY = 'pdf-preview-zoom';
    const PDF_MODAL_RECT_KEY = 'pdf-preview-modal-rect';
    let audience = 'cliente';
    let zoomValue = '1';
    try {
      const saved = localStorage.getItem('pdf-audience');
      if (saved === 'interno' || saved === 'cliente') audience = saved;
      const savedZoom = localStorage.getItem(PDF_ZOOM_KEY);
      if (savedZoom === '0.8' || savedZoom === '1' || savedZoom === '1.25') zoomValue = savedZoom;
    } catch (_) {}
    const html = `
      <div class="pdf-preview-toolbar">
        <label>Vista:</label>
        <select id="pdf-preview-audience">
          <option value="cliente" ${audience === 'cliente' ? 'selected' : ''}>Cliente</option>
          <option value="interno" ${audience === 'interno' ? 'selected' : ''}>Interno</option>
        </select>
        <label>Zoom:</label>
        <select id="pdf-preview-zoom">
          <option value="0.8" ${zoomValue === '0.8' ? 'selected' : ''}>80%</option>
          <option value="1" ${zoomValue === '1' ? 'selected' : ''}>100%</option>
          <option value="1.25" ${zoomValue === '1.25' ? 'selected' : ''}>125%</option>
        </select>
        <button type="button" class="btn outline" id="pdf-preview-download"><i class="fas fa-download"></i> Descargar directo</button>
        <button type="button" class="btn outline" id="pdf-preview-open"><i class="fas fa-up-right-from-square"></i> Abrir en nueva pestaña</button>
        <button type="button" class="btn primary" id="pdf-preview-print"><i class="fas fa-print"></i> Imprimir / Guardar PDF</button>
      </div>
      <div class="pdf-preview-frame-wrap">
        <iframe id="pdf-preview-frame" class="pdf-preview-frame" title="Vista previa de PDF"></iframe>
      </div>
    `;
    openModal('Vista previa PDF', html);
    const modal = qs('#modal');
    const modalBox = qs('#modal .modal-box');
    const modalHeader = qs('#modal .modal-header');
    if (modalBox) modalBox.classList.add('pdf-preview-modal');
    let drag = null;
    function saveRect() {
      if (!modalBox || !modalBox.classList.contains('pdf-preview-modal')) return;
      const r = modalBox.getBoundingClientRect();
      const payload = {
        left: Math.round(r.left),
        top: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
      try { localStorage.setItem(PDF_MODAL_RECT_KEY, JSON.stringify(payload)); } catch (_) {}
    }
    function clampAndApplyRect(rect) {
      if (!modalBox || !rect) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const minW = Math.min(760, Math.max(380, vw - 24));
      const minH = Math.min(480, Math.max(320, vh - 24));
      const w = Math.max(minW, Math.min(vw - 24, Number(rect.width) || Math.round(vw * 0.9)));
      const h = Math.max(minH, Math.min(vh - 24, Number(rect.height) || Math.round(vh * 0.85)));
      const left = Math.max(12, Math.min(vw - w - 12, Number(rect.left) || Math.round((vw - w) / 2)));
      const top = Math.max(12, Math.min(vh - h - 12, Number(rect.top) || 24));
      modalBox.style.width = w + 'px';
      modalBox.style.height = h + 'px';
      modalBox.style.left = left + 'px';
      modalBox.style.top = top + 'px';
    }
    if (modalBox) {
      try {
        const raw = localStorage.getItem(PDF_MODAL_RECT_KEY);
        if (raw) clampAndApplyRect(JSON.parse(raw));
      } catch (_) {}
      modalBox.addEventListener('mouseup', saveRect);
    }
    if (modalHeader && modalBox) {
      modalHeader.style.cursor = 'move';
      const onMove = function (e) {
        if (!drag || !modalBox.classList.contains('pdf-preview-modal')) return;
        const w = modalBox.offsetWidth;
        const h = modalBox.offsetHeight;
        const maxLeft = Math.max(12, window.innerWidth - w - 12);
        const maxTop = Math.max(12, window.innerHeight - h - 12);
        const left = Math.max(12, Math.min(maxLeft, e.clientX - drag.dx));
        const top = Math.max(12, Math.min(maxTop, e.clientY - drag.dy));
        modalBox.style.left = left + 'px';
        modalBox.style.top = top + 'px';
      };
      const onUp = function () {
        if (!drag) return;
        drag = null;
        modalBox.classList.remove('dragging');
        saveRect();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      modalHeader.addEventListener('mousedown', function (e) {
        if (e.target && (e.target.closest('.close') || e.target.closest('button') || e.target.closest('select'))) return;
        const r = modalBox.getBoundingClientRect();
        drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
        modalBox.classList.add('dragging');
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    }
    const frame = qs('#pdf-preview-frame');
    const sel = qs('#pdf-preview-audience');
    const zoomSel = qs('#pdf-preview-zoom');
    const downloadBtn = qs('#pdf-preview-download');
    function applyZoom() {
      if (!frame || !zoomSel) return;
      const z = Number(zoomSel.value || '1');
      try { localStorage.setItem(PDF_ZOOM_KEY, String(zoomSel.value || '1')); } catch (_) {}
      frame.style.transformOrigin = 'top left';
      frame.style.transform = 'scale(' + z + ')';
      frame.style.width = (100 / z) + '%';
      frame.style.height = 'min(' + Math.round((74 / z) * 1.0) + 'vh, ' + Math.round(860 / z) + 'px)';
    }
    function applySrc() {
      if (!frame || !sel) return;
      audience = sel.value || 'cliente';
      try { localStorage.setItem('pdf-audience', audience); } catch (_) {}
      frame.src = buildPdfUrl(page, id, audience, false);
    }
    if (sel) sel.addEventListener('change', applySrc);
    const openBtn = qs('#pdf-preview-open');
    if (openBtn) openBtn.addEventListener('click', function () {
      window.open(buildPdfUrl(page, id, audience, false), '_blank', 'noopener');
    });
    const printBtn = qs('#pdf-preview-print');
    if (printBtn) printBtn.addEventListener('click', function () {
      window.open(buildPdfUrl(page, id, audience, true), '_blank', 'noopener');
    });
    if (downloadBtn) downloadBtn.addEventListener('click', function () {
      window.open(buildPdfUrl(page, id, audience, true), '_blank', 'noopener');
    });
    if (zoomSel) zoomSel.addEventListener('change', applyZoom);
    applySrc();
    applyZoom();
  }
  function openCotizacionPdf(id) {
    openPdfPreview('cotizacion', id);
  }
  function openIncidentePdf(id) {
    openPdfPreview('incidente', id);
  }
  function openBitacoraPdf(id) {
    openPdfPreview('bitacora', id);
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
        <div class="form-group"><label>Fecha vencimiento</label><input type="date" id="m-fecha_vencimiento" value="${inc && inc.fecha_vencimiento ? inc.fecha_vencimiento.slice(0, 10) : ''}" title="Fecha límite para resolver"></div>
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
      const fechaVenc = qs('#m-fecha_vencimiento').value || null;
      const payload = {
        cliente_id: parseInt(qs('#m-cliente_id').value, 10),
        maquina_id: qs('#m-maquina_id').value ? parseInt(qs('#m-maquina_id').value, 10) : null,
        descripcion,
        prioridad: qs('#m-prioridad').value,
        estatus: qs('#m-estatus').value,
        fecha_reporte: fechaReporte,
        fecha_cerrado: fechaCerr,
        fecha_vencimiento: fechaVenc,
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
  async function duplicateIncidente(id) {
    try {
      const inc = await fetchJson(API + '/incidentes/' + id);
      const copy = { ...inc, id: undefined, folio: '', fecha_cerrado: null, estatus: 'abierto' };
      openModalIncidente(copy);
    } catch (e) { showToast(parseApiError(e) || 'No se pudo duplicar el incidente.', 'error'); }
  }

  // ----- MODAL BITÁCORA -----
  async function openModalBitacora(bit, opts) {
    opts = opts || {};
    const stack = !!opts.stack;
    const onSaved = typeof opts.onSaved === 'function' ? opts.onSaved : null;
    const isNew = !bit || !bit.id;
    const cotFetch = canAccessCotizaciones() ? fetchJson(API + '/cotizaciones').catch(() => []) : Promise.resolve([]);
    const [incidentes, cotizaciones] = await Promise.all([fetchJson(API + '/incidentes').catch(() => []), cotFetch]);
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
    if (stack) openModalStack(isNew ? 'Nueva bitácora (horas)' : 'Editar bitácora', body);
    else openModal(isNew ? 'Nueva bitácora (horas)' : 'Editar bitácora', body);
    const root = stack ? qs('#modal-stack-body') : qs('#modal-body');
    const q = (sel) => (root ? root.querySelector(sel) : null);
    const forcedCotId = stack && bit && Number(bit.cotizacion_id) > 0 ? Number(bit.cotizacion_id) : null;
    q('#m-save').onclick = async () => {
      clearInvalidMarks();
      let incId = q('#m-incidente_id').value ? parseInt(q('#m-incidente_id').value, 10) : null;
      let cotId = q('#m-cotizacion_id').value ? parseInt(q('#m-cotizacion_id').value, 10) : null;
      if (forcedCotId) {
        cotId = forcedCotId;
        incId = null;
      }
      const fecha = q('#m-fecha').value;
      if (!incId && !cotId) { markInvalid(q('#m-incidente_id'), 'Indica un incidente o una cotización.'); alert('Indica al menos un incidente o una cotización.'); return; }
      let err = validateRequired(fecha, 'La fecha es obligatoria');
      if (err) { markInvalid(q('#m-fecha'), err); return; }
      const payload = {
        incidente_id: incId,
        cotizacion_id: cotId,
        fecha: q('#m-fecha').value,
        tecnico: q('#m-tecnico').value.trim() || null,
        actividades: q('#m-actividades').value.trim() || null,
        tiempo_horas: parseFloat(q('#m-tiempo_horas').value) || 0,
        materiales_usados: q('#m-materiales').value.trim() || null,
      };
      const btn = q('#m-save');
      const origText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';
      try {
        if (isNew) await fetchJson(API + '/bitacoras', { method: 'POST', body: JSON.stringify(payload) });
        else await fetchJson(API + '/bitacoras/' + bit.id, { method: 'PUT', body: JSON.stringify(payload) });
        if (stack) qs('#modal-stack').classList.add('hidden');
        else qs('#modal').classList.add('hidden');
        showToast(isNew ? 'Registro de bitácora guardado correctamente.' : 'Bitácora actualizada correctamente.', 'success');
        loadBitacoras({ force: true });
        if (onSaved) await onSaved();
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

  async function loadAuditLog() {
    const tbody = qs('#audit-table-body');
    const meta = qs('#audit-meta');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="empty">Cargando…</td></tr>';
    if (meta) meta.textContent = '';
    try {
      const data = await fetchJson(API + '/audit?limit=100');
      const rows = data.rows || [];
      if (!rows.length) {
        let emptyMsg;
        if (!serverConfig.authRequired) {
          emptyMsg = 'Con autenticación desactivada en el servidor (AUTH_ENABLED=0) no se guarda historial de auditoría en esta tabla. No es un fallo de la app.';
        } else if (serverConfig.auditLoggingEnabled === false) {
          emptyMsg = 'La escritura en auditoría está desactivada (AUDIT_ENABLED=0 en el servidor). Las operaciones no se registran en esta tabla.';
        } else {
          emptyMsg = 'Sin eventos todavía. Prueba a crear o editar un cliente, refacción o cotización y vuelve a actualizar esta pestaña.';
        }
        tbody.innerHTML = '<tr><td colspan="7" class="empty">' + emptyMsg + '</td></tr>';
        if (meta) meta.textContent = !serverConfig.authRequired ? 'Modo sin auditoría API' : (serverConfig.auditLoggingEnabled === false ? 'Auditoría de escritura desactivada' : 'Historial vacío');
        return;
      }
      tbody.innerHTML = rows
        .map(function (r) {
          const d = (r.detail || '').slice(0, 160);
          return (
            '<tr><td>' +
            escapeHtml(r.creado_en) +
            '</td><td>' +
            escapeHtml(r.username) +
            '</td><td>' +
            escapeHtml(r.role) +
            '</td><td>' +
            escapeHtml(r.method) +
            '</td><td class="audit-path">' +
            escapeHtml(r.path) +
            '</td><td class="audit-action">' +
            escapeHtml(r.action) +
            '</td><td class="audit-detail">' +
            escapeHtml(d) +
            (d.length >= 160 ? '…' : '') +
            '</td></tr>'
          );
        })
        .join('');
      if (meta) meta.textContent = 'Registros en historial: ' + (data.total != null ? data.total : rows.length) + ' · Mostrando ' + rows.length;
    } catch (_) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">No se pudo cargar la auditoría (¿sesión de admin?).</td></tr>';
    }
  }

  const APP_USER_ROLE_OPTIONS = [
    { value: 'invitado', label: 'Invitado' },
    { value: 'consulta', label: 'Consulta' },
    { value: 'usuario', label: 'Usuario' },
    { value: 'operador', label: 'Operador' },
    { value: 'admin', label: 'Admin' },
  ];

  function renderUsuariosRoleSelect(userId, currentRole) {
    return (
      '<select class="filter-input usuarios-role-select" data-user-id="' +
      userId +
      '" aria-label="Rol">' +
      APP_USER_ROLE_OPTIONS.map(function (o) {
        return (
          '<option value="' +
          escapeHtml(o.value) +
          '"' +
          (o.value === currentRole ? ' selected' : '') +
          '>' +
          escapeHtml(o.label) +
          '</option>'
        );
      }).join('') +
      '</select>'
    );
  }

  function renderUsuariosTecnicoSelect(userId, tecnicosList, currentId) {
    const cur = currentId != null && currentId !== '' ? Number(currentId) : null;
    const opts = ['<option value="">— Sin vincular —</option>'].concat(
      (tecnicosList || []).map(function (t) {
        const tid = Number(t.id);
        const sel = cur != null && Number.isFinite(cur) && Number.isFinite(tid) && cur === tid ? ' selected' : '';
        const vend = Number(t.es_vendedor) === 1 ? ' · vendedor' : '';
        return '<option value="' + escapeHtml(String(tid)) + '"' + sel + '>' + escapeHtml(String(t.nombre || '')) + escapeHtml(vend) + '</option>';
      })
    );
    return (
      '<select class="filter-input usuarios-tecnico-select" data-user-id="' +
      userId +
      '" title="Vincular a Personal: con rol Usuario solo podrá cotizar si ese registro es vendedor (operador/admin no requieren esto).">' +
      opts.join('') +
      '</select>'
    );
  }

  function getUsuariosNotifyEmail() {
    const el = qs('#usuarios-notify-email');
    return el && el.value ? String(el.value).trim() : '';
  }

  function openMailtoUsuarioEliminado(row) {
    if (!row) return;
    const to = getUsuariosNotifyEmail();
    const subject = 'Usuario eliminado del sistema: ' + (row.username || '');
    const body =
      'Se eliminó la cuenta del sistema.\r\n\r\n' +
      'Usuario: ' +
      (row.username || '—') +
      '\r\n' +
      'Nombre: ' +
      (row.display_name || '—') +
      '\r\n' +
      'Rol: ' +
      (row.role || '—') +
      '\r\n' +
      'Eliminado: ' +
      (row.eliminado_en || '—') +
      '\r\n' +
      'Eliminado por: ' +
      (row.eliminado_por_username || '—') +
      '\r\n';
    const href = to
      ? 'mailto:' + encodeURIComponent(to) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body)
      : 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    window.location.href = href;
  }

  function openMailtoUsuariosEliminadosResumen(rows) {
    const list = toArray(rows);
    if (!list.length) {
      showToast('No hay registros para incluir en el correo.', 'warning');
      return;
    }
    const to = getUsuariosNotifyEmail();
    const subject = 'Resumen: usuarios eliminados del sistema (' + list.length + ')';
    const body =
      'Resumen de cuentas eliminadas:\r\n\r\n' +
      list
        .map(function (r, i) {
          return (
            (i + 1) +
            '. ' +
            (r.username || '—') +
            ' | ' +
            (r.display_name || '—') +
            ' | rol ' +
            (r.role || '—') +
            ' | eliminado ' +
            (r.eliminado_en || '—') +
            ' por ' +
            (r.eliminado_por_username || '—')
          );
        })
        .join('\r\n') +
      '\r\n';
    const href = to
      ? 'mailto:' + encodeURIComponent(to) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body)
      : 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    window.location.href = href;
  }

  async function loadAppDeletedUsers() {
    const tbody = qs('#tabla-usuarios-eliminados-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="empty">Cargando…</td></tr>';
    try {
      const rows = await fetchJson(API + '/app-users/deleted');
      const list = toArray(rows);
      appUsersDeletedCache = list;
      if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty">No hay eliminaciones registradas.</td></tr>';
        return;
      }
      tbody.innerHTML = list
        .map(function (r) {
          return (
            '<tr><td>' +
            escapeHtml(r.username) +
            '</td><td>' +
            escapeHtml(r.display_name || '—') +
            '</td><td>' +
            escapeHtml(r.role || '—') +
            '</td><td class="muted">' +
            escapeHtml(r.eliminado_en || '—') +
            '</td><td>' +
            escapeHtml(r.eliminado_por_username || '—') +
            '</td><td><button type="button" class="btn small outline usuarios-email-one-btn" data-del-id="' +
            escapeHtml(String(r.id)) +
            '" title="Abrir correo con texto de esta baja"><i class="fas fa-envelope"></i></button></td></tr>'
          );
        })
        .join('');
    } catch (e) {
      appUsersDeletedCache = [];
      tbody.innerHTML =
        '<tr><td colspan="6" class="empty">' + escapeHtml(parseApiError(e) || 'No se pudo cargar el historial.') + '</td></tr>';
    }
  }

  async function loadAppUsers() {
    const tbody = qs('#tabla-usuarios-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="empty">Cargando…</td></tr>';
    try {
      const [rows, tecnicos] = await Promise.all([
        fetchJson(API + '/app-users'),
        fetchJson(API + '/tecnicos').catch(() => []),
      ]);
      const list = toArray(rows);
      const tecList = toArray(tecnicos);
      const me = getSessionUser();
      const activeAdmins = list.filter(function (u) {
        return u.role === 'admin' && (u.activo === 1 || u.activo === true);
      }).length;
      if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty">No hay usuarios registrados.</td></tr>';
        loadAppDeletedUsers();
        return;
      }
      tbody.innerHTML = list
        .map(function (r) {
          const id = r.id;
          const activo = !!(r.activo === 1 || r.activo === true);
          const isSelf = me && Number(me.id) === Number(id);
          const rowIsActiveAdmin = r.role === 'admin' && activo;
          const blockLastAdmin = rowIsActiveAdmin && activeAdmins <= 1;
          const canDelete = !isSelf && !blockLastAdmin;
          let delTitle = 'Eliminar cuenta del sistema';
          if (isSelf) delTitle = 'No puedes eliminar tu propia cuenta';
          else if (blockLastAdmin) delTitle = 'No se puede eliminar el único administrador activo';
          return (
            '<tr data-user-row="' +
            id +
            '"><td>' +
            escapeHtml(r.username) +
            '</td><td class="usuarios-td-nombre"><div class="usuarios-nombre-cell"><span class="usuarios-display-label">' +
            escapeHtml(r.display_name || '—') +
            '</span><span class="usuarios-nombre-actions"><button type="button" class="btn small outline usuarios-edit-display-btn" data-user-id="' +
            id +
            '" title="Editar nombre completo"><i class="fas fa-user-edit" aria-hidden="true"></i><span class="visually-hidden"> Editar nombre</span></button></span></div></td><td>' +
            renderUsuariosRoleSelect(id, r.role || 'invitado') +
            '</td><td>' +
            renderUsuariosTecnicoSelect(id, tecList, r.tecnico_id) +
            '</td><td><input type="checkbox" class="usuarios-activo-check" id="usuarios-act-' +
            id +
            '" data-user-id="' +
            id +
            '" title="Cuenta activa" ' +
            (activo ? 'checked' : '') +
            '></td><td class="muted">' +
            escapeHtml(r.creado_en || '—') +
            '</td><td><button type="button" class="btn small danger usuarios-delete-btn" data-user-id="' +
            id +
            '" title="' +
            escapeHtml(delTitle) +
            '" ' +
            (canDelete ? '' : 'disabled') +
            '><i class="fas fa-user-minus"></i></button></td></tr>'
          );
        })
        .join('');
    } catch (e) {
      tbody.innerHTML =
        '<tr><td colspan="7" class="empty">' + escapeHtml(parseApiError(e) || 'No se pudo cargar usuarios.') + '</td></tr>';
    }
    loadAppDeletedUsers();
  }

  async function loadCategoriasAdminPanel() {
    const tbody = qs('#tabla-categorias-admin-body');
    const padreSel = qs('#cat-admin-sub-padre');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3" class="empty">Cargando…</td></tr>';
    try {
      const tree = await fetchJson(API + '/categorias-catalogo');
      categoriasAdminTree = tree;
      const cats = toArray(tree.categorias);
      if (padreSel) {
        padreSel.innerHTML = cats
          .map((c) => '<option value="' + escapeHtml(String(c.id)) + '">' + escapeHtml(c.nombre) + '</option>')
          .join('');
        if (!padreSel.options.length) padreSel.innerHTML = '<option value="">(Sin categorías)</option>';
      }
      if (!cats.length) {
        tbody.innerHTML =
          '<tr><td colspan="3" class="empty">No hay categorías. Agrega una arriba.</td></tr>';
        return;
      }
      tbody.innerHTML = cats
        .map((c) => {
          const subs = toArray(c.subcategorias);
          const subHtml = subs.length
            ? '<ul class="cat-admin-sub-ul">' +
              subs
                .map(
                  (s) =>
                    '<li class="cat-admin-sub-li">' +
                    '<span class="cat-admin-sub-name">' +
                    escapeHtml(s.nombre) +
                    '</span><span class="cat-admin-sub-actions">' +
                    '<button type="button" class="btn small outline cat-admin-edit-sub" data-id="' +
                    escapeHtml(String(s.id)) +
                    '" data-cat-id="' +
                    escapeHtml(String(c.id)) +
                    '" title="Editar"><i class="fas fa-edit"></i></button>' +
                    '<button type="button" class="btn small danger cat-admin-del-sub" data-id="' +
                    escapeHtml(String(s.id)) +
                    '" title="Eliminar"><i class="fas fa-trash"></i></button></span></li>'
                )
                .join('') +
              '</ul>'
            : '<span class="muted">—</span>';
          return (
            '<tr data-cat-id="' +
            escapeHtml(String(c.id)) +
            '"><td class="cat-admin-td-cat"><span class="cat-admin-cat-label"><strong>' +
            escapeHtml(c.nombre) +
            '</strong></span><span class="cat-admin-cat-actions">' +
            '<button type="button" class="btn small outline cat-admin-edit-cat" data-id="' +
            escapeHtml(String(c.id)) +
            '" title="Editar"><i class="fas fa-edit"></i></button>' +
            '<button type="button" class="btn small danger cat-admin-del-cat" data-id="' +
            escapeHtml(String(c.id)) +
            '" title="Eliminar"><i class="fas fa-trash"></i></button></span></td><td>' +
            subHtml +
            '</td><td class="muted">—</td></tr>'
          );
        })
        .join('');
    } catch (e) {
      tbody.innerHTML =
        '<tr><td colspan="3" class="empty">' + escapeHtml(parseApiError(e) || 'No se pudo cargar el catálogo.') + '</td></tr>';
    }
  }

  function setupCategoriasAdminPanel() {
    const addCat = qs('#cat-admin-add-categoria');
    const addSub = qs('#cat-admin-add-sub');
    const tbody = qs('#tabla-categorias-admin-body');
    if (addCat && !addCat._bound) {
      addCat._bound = true;
      addCat.addEventListener('click', async () => {
        const inp = qs('#cat-admin-new-nombre');
        const nombre = inp && inp.value ? String(inp.value).trim() : '';
        if (!nombre) {
          showToast('Escribe el nombre de la categoría.', 'error');
          return;
        }
        addCat.disabled = true;
        try {
          await fetchJson(API + '/admin/categorias-catalogo/categorias', {
            method: 'POST',
            body: JSON.stringify({ nombre: nombre, orden: 0 }),
          });
          if (inp) inp.value = '';
          showToast('Categoría creada.', 'success');
          await loadCategoriasAdminPanel();
          if (typeof loadRefacciones === 'function') loadRefacciones();
        } catch (e) {
          showToast(parseApiError(e) || 'No se pudo crear la categoría.', 'error');
        } finally {
          addCat.disabled = false;
        }
      });
    }
    if (addSub && !addSub._bound) {
      addSub._bound = true;
      addSub.addEventListener('click', async () => {
        const padre = qs('#cat-admin-sub-padre');
        const inp = qs('#cat-admin-new-sub');
        const categoria_id = padre && padre.value ? Number(padre.value) : NaN;
        const nombre = inp && inp.value ? String(inp.value).trim() : '';
        if (!Number.isFinite(categoria_id)) {
          showToast('Selecciona la categoría padre.', 'error');
          return;
        }
        if (!nombre) {
          showToast('Escribe el nombre de la subcategoría.', 'error');
          return;
        }
        addSub.disabled = true;
        try {
          await fetchJson(API + '/admin/categorias-catalogo/subcategorias', {
            method: 'POST',
            body: JSON.stringify({ categoria_id: categoria_id, nombre: nombre, orden: 0 }),
          });
          if (inp) inp.value = '';
          showToast('Subcategoría creada.', 'success');
          await loadCategoriasAdminPanel();
          if (typeof loadRefacciones === 'function') loadRefacciones();
        } catch (e) {
          showToast(parseApiError(e) || 'No se pudo crear la subcategoría.', 'error');
        } finally {
          addSub.disabled = false;
        }
      });
    }
    if (tbody && !tbody._catAdminDeleg) {
      tbody._catAdminDeleg = true;
      tbody.addEventListener('click', async (ev) => {
        const t = ev.target.closest('button');
        if (!t) return;
        if (t.classList.contains('cat-admin-edit-cat')) {
          const id = t.dataset.id;
          const row = categoriasAdminTree && toArray(categoriasAdminTree.categorias).find((c) => String(c.id) === String(id));
          const cur = row ? row.nombre : '';
          const n = window.prompt('Nuevo nombre de categoría:', cur);
          if (n == null) return;
          const nombre = String(n).trim();
          if (!nombre) return;
          try {
            await fetchJson(API + '/admin/categorias-catalogo/categorias/' + id, {
              method: 'PUT',
              body: JSON.stringify({ nombre: nombre, orden: row && row.orden != null ? row.orden : 0 }),
            });
            showToast('Categoría actualizada.', 'success');
            await loadCategoriasAdminPanel();
            if (typeof loadRefacciones === 'function') loadRefacciones();
          } catch (e) {
            showToast(parseApiError(e) || 'No se pudo actualizar.', 'error');
          }
          return;
        }
        if (t.classList.contains('cat-admin-del-cat')) {
          const id = t.dataset.id;
          if (!window.confirm('¿Eliminar esta categoría? Se eliminarán también sus subcategorías.')) return;
          try {
            await fetchJson(API + '/admin/categorias-catalogo/categorias/' + id, { method: 'DELETE' });
            showToast('Categoría eliminada.', 'success');
            await loadCategoriasAdminPanel();
            if (typeof loadRefacciones === 'function') loadRefacciones();
          } catch (e) {
            showToast(parseApiError(e) || 'No se pudo eliminar.', 'error');
          }
          return;
        }
        if (t.classList.contains('cat-admin-edit-sub')) {
          const id = t.dataset.id;
          const catId = t.dataset.catId;
          const cat = categoriasAdminTree && toArray(categoriasAdminTree.categorias).find((c) => String(c.id) === String(catId));
          const sub = cat && toArray(cat.subcategorias).find((s) => String(s.id) === String(id));
          const cur = sub ? sub.nombre : '';
          const n = window.prompt('Nuevo nombre de subcategoría:', cur);
          if (n == null) return;
          const nombre = String(n).trim();
          if (!nombre) return;
          try {
            await fetchJson(API + '/admin/categorias-catalogo/subcategorias/' + id, {
              method: 'PUT',
              body: JSON.stringify({
                nombre: nombre,
                orden: sub && sub.orden != null ? sub.orden : 0,
                categoria_id: Number(catId),
              }),
            });
            showToast('Subcategoría actualizada.', 'success');
            await loadCategoriasAdminPanel();
            if (typeof loadRefacciones === 'function') loadRefacciones();
          } catch (e) {
            showToast(parseApiError(e) || 'No se pudo actualizar.', 'error');
          }
          return;
        }
        if (t.classList.contains('cat-admin-del-sub')) {
          const id = t.dataset.id;
          if (!window.confirm('¿Eliminar esta subcategoría?')) return;
          try {
            await fetchJson(API + '/admin/categorias-catalogo/subcategorias/' + id, { method: 'DELETE' });
            showToast('Subcategoría eliminada.', 'success');
            await loadCategoriasAdminPanel();
            if (typeof loadRefacciones === 'function') loadRefacciones();
          } catch (e) {
            showToast(parseApiError(e) || 'No se pudo eliminar.', 'error');
          }
        }
      });
    }
  }

  function setupUsuariosPanel() {
    const btn = qs('#btn-usuarios-create');
    const tbody = qs('#tabla-usuarios-body');
    if (btn && !btn._bound) {
      btn._bound = true;
      btn.addEventListener('click', async function () {
        const uEl = qs('#usuarios-new-username');
        const pEl = qs('#usuarios-new-password');
        const dEl = qs('#usuarios-new-display');
        const rEl = qs('#usuarios-new-role');
        const username = (uEl && uEl.value ? String(uEl.value) : '').trim().toLowerCase();
        const password = pEl && pEl.value ? String(pEl.value) : '';
        const display_name = (dEl && dEl.value ? String(dEl.value) : '').trim() || username;
        const role = rEl && rEl.value ? String(rEl.value) : 'invitado';
        if (!username || !password) {
          showToast('Usuario y contraseña son obligatorios.', 'error');
          return;
        }
        btn.disabled = true;
        try {
          await fetchJson(API + '/app-users', {
            method: 'POST',
            body: JSON.stringify({ username: username, password: password, display_name: display_name, role: role }),
          });
          showToast('Usuario creado.', 'success');
          if (uEl) uEl.value = '';
          if (pEl) pEl.value = '';
          if (dEl) dEl.value = '';
          loadAppUsers();
        } catch (e) {
          showToast(parseApiError(e) || 'No se pudo crear el usuario.', 'error');
        } finally {
          btn.disabled = false;
        }
      });
    }
    if (tbody && !tbody._delegBound) {
      tbody._delegBound = true;
      tbody.addEventListener('change', async function (ev) {
        const t = ev.target;
        if (!t || !t.dataset || t.dataset.userId == null) return;
        const id = parseInt(t.dataset.userId, 10);
        if (!Number.isFinite(id)) return;
        if (t.classList && t.classList.contains('usuarios-role-select')) {
          try {
            await fetchJson(API + '/app-users/' + id, {
              method: 'PATCH',
              body: JSON.stringify({ role: t.value }),
            });
            showToast('Rol actualizado.', 'success');
            const me = getSessionUser();
            if (me && Number(me.id) === id) {
              await refreshSessionUser();
              updateCotizacionesTabVisibility();
            }
          } catch (e) {
            showToast(parseApiError(e) || 'No se pudo actualizar el rol.', 'error');
            loadAppUsers();
          }
        }
        if (t.classList && t.classList.contains('usuarios-tecnico-select')) {
          try {
            const v = t.value === '' ? null : parseInt(t.value, 10);
            await fetchJson(API + '/app-users/' + id, {
              method: 'PATCH',
              body: JSON.stringify({ tecnico_id: v }),
            });
            showToast('Vinculación a Personal actualizada.', 'success');
            const me = getSessionUser();
            if (me && Number(me.id) === id) {
              await refreshSessionUser();
              updateCotizacionesTabVisibility();
            }
          } catch (e) {
            showToast(parseApiError(e) || 'No se pudo actualizar la vinculación.', 'error');
            loadAppUsers();
          }
        }
        if (t.classList && t.classList.contains('usuarios-activo-check')) {
          try {
            await fetchJson(API + '/app-users/' + id, {
              method: 'PATCH',
              body: JSON.stringify({ activo: t.checked }),
            });
            showToast('Estado de cuenta actualizado.', 'success');
          } catch (e) {
            showToast(parseApiError(e) || 'No se pudo actualizar.', 'error');
            loadAppUsers();
          }
        }
      });
    }
    if (tbody && !tbody._usuariosDelClick) {
      tbody._usuariosDelClick = true;
      tbody.addEventListener('click', async function (ev) {
        const editBtn = ev.target && ev.target.closest && ev.target.closest('button.usuarios-edit-display-btn');
        if (editBtn) {
          ev.preventDefault();
          const id = parseInt(editBtn.dataset.userId, 10);
          if (!Number.isFinite(id)) return;
          const td = editBtn.closest('td');
          const span = td && td.querySelector('.usuarios-nombre-cell .usuarios-display-label');
          let cur = span ? String(span.textContent || '').trim() : '';
          if (cur === '—') cur = '';
          const n = window.prompt('Nombre completo (menú de perfil y listados):', cur);
          if (n == null) return;
          const display_name = String(n).trim();
          if (!display_name) {
            showToast('El nombre no puede quedar vacío.', 'error');
            return;
          }
          editBtn.disabled = true;
          try {
            await fetchJson(API + '/app-users/' + id, {
              method: 'PATCH',
              body: JSON.stringify({ display_name: display_name }),
            });
            showToast('Nombre actualizado.', 'success');
            const me = getSessionUser();
            if (me && Number(me.id) === id) {
              await refreshSessionUser();
              syncSessionHeader();
            }
            await loadAppUsers();
          } catch (e) {
            showToast(parseApiError(e) || 'No se pudo actualizar el nombre.', 'error');
            loadAppUsers();
          } finally {
            editBtn.disabled = false;
          }
          return;
        }
        const btn = ev.target && ev.target.closest && ev.target.closest('button.usuarios-delete-btn');
        if (!btn || btn.disabled) return;
        const id = parseInt(btn.dataset.userId, 10);
        if (!Number.isFinite(id)) return;
        if (!window.confirm('¿Eliminar esta cuenta del sistema? No se puede deshacer. Quedará registrado en el historial.')) return;
        btn.disabled = true;
        try {
          await fetchJson(API + '/app-users/' + id, { method: 'DELETE' });
          showToast('Usuario eliminado.', 'success');
          await loadAppUsers();
        } catch (e) {
          showToast(parseApiError(e) || 'No se pudo eliminar.', 'error');
          loadAppUsers();
        }
      });
    }
    const tbodyDel = qs('#tabla-usuarios-eliminados-body');
    if (tbodyDel && !tbodyDel._emailDeleg) {
      tbodyDel._emailDeleg = true;
      tbodyDel.addEventListener('click', function (ev) {
        const btn = ev.target && ev.target.closest && ev.target.closest('button.usuarios-email-one-btn');
        if (!btn) return;
        const did = parseInt(btn.dataset.delId, 10);
        if (!Number.isFinite(did)) return;
        const row = appUsersDeletedCache.find(function (x) {
          return Number(x.id) === did;
        });
        openMailtoUsuarioEliminado(row);
      });
    }
    const btnResumen = qs('#btn-usuarios-email-resumen');
    if (btnResumen && !btnResumen._bound) {
      btnResumen._bound = true;
      btnResumen.addEventListener('click', function () {
        openMailtoUsuariosEliminadosResumen(appUsersDeletedCache);
      });
    }
    const emailNotify = qs('#usuarios-notify-email');
    if (emailNotify && !emailNotify._bound) {
      emailNotify._bound = true;
      try {
        const k = 'usuariosEliminadosNotifyEmail';
        const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(k) : '';
        if (saved) emailNotify.value = saved;
      } catch (_) {}
      emailNotify.addEventListener('change', function () {
        try {
          localStorage.setItem('usuariosEliminadosNotifyEmail', String(emailNotify.value || '').trim());
        } catch (_) {}
      });
    }
  }

  function crossfilterEntityLabel(key) {
    const m = {
      clientes: 'Clientes',
      refacciones: 'Refacciones',
      maquinas: 'Máquinas',
      cotizaciones: 'Cotizaciones',
      bitacoras: 'Bitácora de horas',
    };
    return m[key] || key;
  }
  function crossfilterPeriodLabel(key) {
    const m = { semana: 'Semana', mes: 'Mes', año: 'Año' };
    return m[key] || key;
  }
  function setDashboardCrossFilterEntity(key) {
    if (dashboardCrossFilterEntity === key) dashboardCrossFilterEntity = null;
    else dashboardCrossFilterEntity = key || null;
    syncDashboardCrossFilterUi();
  }
  function setDashboardCrossFilterPeriod(key) {
    if (dashboardCrossFilterPeriod === key) dashboardCrossFilterPeriod = null;
    else dashboardCrossFilterPeriod = key || null;
    syncDashboardCrossFilterUi();
  }
  function clearDashboardCrossFilter() {
    dashboardCrossFilterEntity = null;
    dashboardCrossFilterPeriod = null;
    syncDashboardCrossFilterUi();
  }
  function syncDashboardCrossFilterUi() {
    const surface = qs('#panel-dashboards .dashboard-surface');
    const bar = qs('#dashboard-crossfilter-bar');
    const textEl = qs('#dashboard-crossfilter-text');
    if (!surface) return;
    surface.classList.toggle('dashboard-crossfilter-entity-active', !!dashboardCrossFilterEntity);
    surface.classList.toggle('dashboard-crossfilter-period-active', !!dashboardCrossFilterPeriod);
    surface.querySelectorAll('.is-crossfilter-match').forEach(function (el) { el.classList.remove('is-crossfilter-match'); });
    if (dashboardCrossFilterEntity) {
      surface.querySelectorAll('.dashboard-card[data-dashboard="' + dashboardCrossFilterEntity + '"]').forEach(function (el) { el.classList.add('is-crossfilter-match'); });
      surface.querySelectorAll('.dashboard-score-tile[data-crossfilter-entity="' + dashboardCrossFilterEntity + '"]').forEach(function (el) { el.classList.add('is-crossfilter-match'); });
      surface.querySelectorAll('.dashboard-kpi-item[data-crossfilter-entity="' + dashboardCrossFilterEntity + '"]').forEach(function (el) { el.classList.add('is-crossfilter-match'); });
    }
    if (dashboardCrossFilterPeriod) {
      surface.querySelectorAll('.dashboard-stat-card[data-period="' + dashboardCrossFilterPeriod + '"]').forEach(function (el) { el.classList.add('is-crossfilter-match'); });
    }
    const idxMap = { cotizaciones: 0, bitacoras: 1 };
    const baseDonut = ['#059669', '#7c3aed'];
    const dimDonut = 'rgba(51,65,85,0.38)';
    if (chartDonut && chartDonut.canvas && chartDonut.data && chartDonut.data.datasets && chartDonut.data.datasets[0]) {
      let colors = baseDonut.slice();
      if (dashboardCrossFilterEntity && Object.prototype.hasOwnProperty.call(idxMap, dashboardCrossFilterEntity)) {
        const hi = idxMap[dashboardCrossFilterEntity];
        colors = baseDonut.map(function (c, j) { return j === hi ? c : dimDonut; });
      }
      chartDonut.data.datasets[0].backgroundColor = colors;
      chartDonut.update('none');
    }
    if (chartBars && chartBars.canvas && chartBars.data && chartBars.data.datasets && chartBars.data.datasets[0] && chartBars.data.datasets[1]) {
      const periods = ['semana', 'mes', 'año'];
      const pi = dashboardCrossFilterPeriod ? periods.indexOf(dashboardCrossFilterPeriod) : -1;
      if (pi >= 0) {
        const dimBar = 'rgba(148,163,184,0.22)';
        chartBars.data.datasets[0].backgroundColor = chartBars.data.datasets[0].data.map(function (_, j) {
          return j === pi ? 'rgba(56,189,248,0.95)' : dimBar;
        });
        chartBars.data.datasets[1].backgroundColor = chartBars.data.datasets[1].data.map(function (_, j) {
          return j === pi ? 'rgba(148,163,184,0.85)' : dimBar;
        });
      } else {
        chartBars.data.datasets[0].backgroundColor = 'rgba(56,189,248,0.8)';
        chartBars.data.datasets[1].backgroundColor = 'rgba(148,163,184,0.6)';
      }
      chartBars.update('none');
    }
    if (bar && textEl) {
      const parts = [];
      if (dashboardCrossFilterEntity) parts.push('Módulo: ' + crossfilterEntityLabel(dashboardCrossFilterEntity));
      if (dashboardCrossFilterPeriod) parts.push('Periodo: ' + crossfilterPeriodLabel(dashboardCrossFilterPeriod));
      if (parts.length) {
        bar.classList.remove('hidden');
        textEl.textContent = 'Vista filtrada (clic de nuevo en el mismo elemento para quitar) · ' + parts.join(' · ');
      } else {
        bar.classList.add('hidden');
        textEl.textContent = '';
      }
    }
  }
  function initDashboardCrossfilterBindings() {
    const grid = qs('#dashboard-grid');
    if (grid && !grid.dataset.cfDelegation) {
      grid.dataset.cfDelegation = '1';
      grid.addEventListener('click', function (e) {
        const kpiItem = e.target.closest('.dashboard-kpi-item[data-crossfilter-entity]');
        if (kpiItem) {
          setDashboardCrossFilterEntity(kpiItem.getAttribute('data-crossfilter-entity'));
          return;
        }
        const tile = e.target.closest('.dashboard-score-tile[data-crossfilter-entity]');
        if (tile) {
          setDashboardCrossFilterEntity(tile.getAttribute('data-crossfilter-entity'));
          return;
        }
        const card = e.target.closest('.dashboard-card[data-dashboard]');
        if (card && !e.target.closest('.dashboard-card-action')) {
          setDashboardCrossFilterEntity(card.getAttribute('data-dashboard'));
        }
      });
    }
    const comp = qs('#dashboard-comparativo');
    if (comp && !comp.dataset.cfDelegation) {
      comp.dataset.cfDelegation = '1';
      comp.addEventListener('click', function (e) {
        const row = e.target.closest('.stat-row[data-dimension]');
        if (!row) return;
        const dim = row.getAttribute('data-dimension');
        if (dim) setDashboardCrossFilterEntity(dim);
        const statCard = row.closest('.dashboard-stat-card[data-period]');
        if (statCard) setDashboardCrossFilterPeriod(statCard.getAttribute('data-period'));
      });
    }
    const clr = qs('#dashboard-crossfilter-clear');
    if (clr && !clr.dataset.bound) {
      clr.dataset.bound = '1';
      clr.addEventListener('click', function () { clearDashboardCrossFilter(); });
    }
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
      const showCot = canAccessCotizaciones();
      const raw = await Promise.all([
        fetchJson(API + '/clientes').catch(() => []),
        fetchJson(API + '/refacciones').catch(() => []),
        fetchJson(API + '/maquinas').catch(() => []),
        showCot ? fetchJson(API + '/cotizaciones').catch(() => []) : Promise.resolve([]),
        fetchJson(API + '/bitacoras').catch(() => []),
        fetchJson(API + '/dashboard-stats').catch(() => null),
      ]);
      const toArr = (x) => (x && Array.isArray(x) ? x : []);
      const clientes = toArr(raw[0]);
      const refacciones = toArr(raw[1]);
      const maquinas = toArr(raw[2]);
      const cotizaciones = toArr(raw[3]);
      const bitacoras = toArr(raw[4]);
      const dashboardStats = raw[5] && typeof raw[5] === 'object' ? raw[5] : null;
      try {
        clientesCache = clientes;
        rebuildClientCityMaps();
        updateGlobalBranchOptions();
        skipNextClientesFetchAfterDashboard = true;
        maquinasCache = maquinas;
        skipNextMaquinasFetchAfterDashboard = true;
      } catch (e) {
        console.warn('Dashboard: prime caches', e);
      }
      const clientesCtx = applyGlobalBranchFilterRows(clientes);
      const clienteNamesCtx = new Set(clientesCtx.map(c => String(c && c.nombre || '').trim().toLowerCase()).filter(Boolean));
      const maquinasCtx = globalBranchFilter ? maquinas.filter(m => clienteNamesCtx.has(String(m && m.cliente_nombre || '').trim().toLowerCase())) : maquinas;
      const cotizacionesCtx = globalBranchFilter ? cotizaciones.filter(c => clienteNamesCtx.has(String(c && c.cliente_nombre || '').trim().toLowerCase())) : cotizaciones;
      const bitacorasCtx = bitacoras;
      if (loading) {
        loading.classList.add('hidden');
        loading.remove();
      }
      const now = new Date();
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const ciudades = new Set(clientesCtx.map(c => (c.ciudad || '').trim()).filter(Boolean)).size;
      const conRfc = clientesCtx.filter(c => (c.rfc || '').trim()).length;
      const valorCatalogo = refacciones.reduce((s, r) => s + (resolveRefaccionPrecioUsd(r) || 0), 0);
      const promPrecio = refacciones.length ? valorCatalogo / refacciones.length : 0;
      const marcas = new Set(refacciones.map(r => (r.marca || '').trim()).filter(Boolean)).size;
      const maqPorCliente = {};
      maquinasCtx.forEach(m => {
        const key = m.cliente_nombre || 'Sin cliente';
        maqPorCliente[key] = (maqPorCliente[key] || 0) + 1;
      });
      const topClienteMaq = Object.keys(maqPorCliente).length ? Object.entries(maqPorCliente).sort((a, b) => b[1] - a[1])[0] : null;
      const cotTotal = cotizacionesCtx.reduce((s, c) => s + (Number(c.total) || 0), 0);
      const cotEsteMes = cotizacionesCtx.filter(c => (c.fecha || '').slice(0, 7) === thisMonthStart.slice(0, 7)).length;
      const cotRefacciones = cotizacionesCtx.filter(c => (c.tipo || '') === 'refacciones').length;
      const cotManoObra = cotizacionesCtx.filter(c => (c.tipo || '') === 'mano_obra').length;
      const bitHoras = bitacorasCtx.reduce((s, b) => s + (Number(b.tiempo_horas) || 0), 0);
      const tecnicos = new Set(bitacorasCtx.map(b => (b.tecnico || '').trim()).filter(Boolean)).size;
      const bitEsteMes = bitacorasCtx.filter(b => (b.fecha || '').slice(0, 7) === thisMonthStart.slice(0, 7)).length;
      const cotMontoMes = cotizacionesCtx
        .filter(c => (c.fecha || '').slice(0, 7) === thisMonthStart.slice(0, 7))
        .reduce((s, c) => s + (Number(c.total) || 0), 0);
      const bitHorasMes = bitacorasCtx
        .filter(b => (b.fecha || '').slice(0, 7) === thisMonthStart.slice(0, 7))
        .reduce((s, b) => s + (Number(b.tiempo_horas) || 0), 0);

      const execEl = document.createElement('div');
      execEl.className = 'dashboard-exec-scorecards';
      execEl.setAttribute('aria-label', 'Scorecard ejecutivo');
      execEl.innerHTML = showCot
        ? `
        <article class="dashboard-score-tile dashboard-score-tile--revenue" data-crossfilter-entity="cotizaciones" title="Clic: filtrar vista por cotizaciones (como Power BI)">
          <span class="dashboard-score-eyebrow">Ingresos cotizados</span>
          <span class="dashboard-score-label">Monto del mes</span>
          <strong class="dashboard-score-value">${escapeHtml(formatMoney(cotMontoMes))}</strong>
          <span class="dashboard-score-meta"><i class="fas fa-file-invoice"></i> ${escapeHtml(String(cotEsteMes))} cotiz. emitidas · mes</span>
        </article>
        <article class="dashboard-score-tile dashboard-score-tile--pipeline" data-crossfilter-entity="cotizaciones" title="Clic: filtrar vista por cotizaciones">
          <span class="dashboard-score-eyebrow">Cartera / pipeline</span>
          <span class="dashboard-score-label">Valor total cotizaciones</span>
          <strong class="dashboard-score-value">${escapeHtml(formatMoney(cotTotal))}</strong>
          <span class="dashboard-score-meta"><i class="fas fa-layer-group"></i> ${escapeHtml(String(cotizacionesCtx.length))} documentos en sistema</span>
        </article>
        <article class="dashboard-score-tile dashboard-score-tile--risk" data-crossfilter-entity="refacciones" title="Clic: filtrar vista por refacciones">
          <span class="dashboard-score-eyebrow">Catálogo</span>
          <span class="dashboard-score-label">Refacciones en sistema</span>
          <strong class="dashboard-score-value">${escapeHtml(String(refacciones.length))}</strong>
          <span class="dashboard-score-meta"><i class="fas fa-cogs"></i> Partidas en catálogo</span>
        </article>
        <article class="dashboard-score-tile dashboard-score-tile--ops" data-crossfilter-entity="bitacoras" title="Clic: filtrar vista por bitácora">
          <span class="dashboard-score-eyebrow">Productividad</span>
          <span class="dashboard-score-label">Horas registradas · mes</span>
          <strong class="dashboard-score-value">${escapeHtml(bitHorasMes.toFixed(1))} h</strong>
          <span class="dashboard-score-meta"><i class="fas fa-hard-hat"></i> ${escapeHtml(String(bitEsteMes))} registros · ${escapeHtml(String(tecnicos))} técnicos</span>
        </article>
      `
        : `
        <article class="dashboard-score-tile dashboard-score-tile--risk" data-crossfilter-entity="refacciones" title="Clic: filtrar vista por refacciones">
          <span class="dashboard-score-eyebrow">Catálogo</span>
          <span class="dashboard-score-label">Refacciones en sistema</span>
          <strong class="dashboard-score-value">${escapeHtml(String(refacciones.length))}</strong>
          <span class="dashboard-score-meta"><i class="fas fa-cogs"></i> Partidas en catálogo</span>
        </article>
        <article class="dashboard-score-tile dashboard-score-tile--ops" data-crossfilter-entity="bitacoras" title="Clic: filtrar vista por bitácora">
          <span class="dashboard-score-eyebrow">Productividad</span>
          <span class="dashboard-score-label">Horas registradas · mes</span>
          <strong class="dashboard-score-value">${escapeHtml(bitHorasMes.toFixed(1))} h</strong>
          <span class="dashboard-score-meta"><i class="fas fa-hard-hat"></i> ${escapeHtml(String(bitEsteMes))} registros · ${escapeHtml(String(tecnicos))} técnicos</span>
        </article>
      `;
      grid.appendChild(execEl);

      const resumenKpi = [
        { label: 'Clientes', value: clientesCtx.length, icon: 'fa-users', cf: 'clientes' },
        ...(showCot ? [{ label: 'Cotizaciones (monto)', value: formatMoney(cotTotal), icon: 'fa-file-invoice-dollar', cf: 'cotizaciones' }] : []),
        { label: 'Refacciones (catálogo)', value: refacciones.length, icon: 'fa-cogs', cf: 'refacciones' },
        { label: 'Horas en bitácora', value: bitHoras.toFixed(1) + ' h', icon: 'fa-clock', cf: 'bitacoras' },
      ];
      const kpiEl = document.createElement('div');
      kpiEl.className = 'dashboard-kpi-strip';
      kpiEl.setAttribute('aria-label', 'Resumen ejecutivo');
      kpiEl.innerHTML = resumenKpi.map(k => `<span class="dashboard-kpi-item" data-crossfilter-entity="${escapeHtml(k.cf)}" title="Clic: filtrar por ${escapeHtml(crossfilterEntityLabel(k.cf))}"><i class="fas ${k.icon}"></i> <strong>${escapeHtml(String(k.value))}</strong> ${escapeHtml(k.label)}</span>`).join('');
      grid.appendChild(kpiEl);
      const cards = [
        { id: 'clientes', icon: 'fa-users', title: 'Clientes', goto: 'clientes', rows: [{ label: 'Total', value: clientesCtx.length, v: 'neutral' }, { label: 'Ciudades', value: ciudades, v: 'neutral' }, { label: 'Con RFC', value: conRfc, v: 'positive' }] },
        { id: 'refacciones', icon: 'fa-cogs', title: 'Refacciones', goto: 'refacciones', rows: [{ label: 'Total', value: refacciones.length, v: 'neutral' }, { label: 'Valor catálogo', value: formatMoney(valorCatalogo), v: 'positive' }, { label: 'Precio promedio', value: formatMoney(promPrecio), v: 'neutral' }, { label: 'Marcas', value: marcas, v: 'neutral' }] },
        { id: 'maquinas', icon: 'fa-industry', title: 'Máquinas', goto: 'maquinas', rows: [{ label: 'Total', value: maquinas.length, v: 'neutral' }, { label: 'Clientes con equipo', value: Object.keys(maqPorCliente).length, v: 'neutral' }, topClienteMaq ? { label: 'Top cliente', value: topClienteMaq[0] + ' (' + topClienteMaq[1] + ')', v: 'neutral', long: true } : null].filter(Boolean) },
        ...(showCot
          ? [{ id: 'cotizaciones', icon: 'fa-file-invoice-dollar', title: 'Cotizaciones', goto: 'cotizaciones', rows: [{ label: 'Total', value: cotizacionesCtx.length, v: 'neutral' }, { label: 'Monto total', value: formatMoney(cotTotal), v: 'positive' }, { label: 'Este mes', value: cotEsteMes, v: 'positive' }, { label: 'Refacciones / Mano obra', value: cotRefacciones + ' / ' + cotManoObra, v: 'neutral' }] }]
          : []),
        { id: 'bitacoras', icon: 'fa-clock', title: 'Bitácora de horas', goto: 'bitacoras', rows: [{ label: 'Registros', value: bitacorasCtx.length, v: 'neutral' }, { label: 'Horas totales', value: bitHoras.toFixed(1), v: 'positive' }, { label: 'Técnicos', value: tecnicos, v: 'neutral' }, { label: 'Este mes', value: bitEsteMes, v: 'positive' }] },
      ];
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

      // Cachés desde el mismo payload; pintar tablas pesadas solo si esa pestaña está activa (evita bloquear el hilo al cargar el dashboard).
      try {
        cotizacionesCache = showCot ? cotizaciones : [];
        bitacorasCache = bitacoras;
        if (showCot) skipNextCotizacionesFetchAfterDashboard = true;
        skipNextBitacorasFetchAfterDashboard = true;
        const tabEl = document.querySelector('.tab.active');
        const tid = tabEl && tabEl.dataset ? tabEl.dataset.tab : '';
        if (showCot && tid === 'cotizaciones') {
          const filtCot = applyFilters(cotizacionesCache, getFilterValues('#tabla-cotizaciones'), 'tabla-cotizaciones');
          renderCotizaciones(filtCot, cotizacionesCache.length);
        }
        if (tid === 'bitacoras') {
          const filtBit = applyFilters(bitacorasCache, getFilterValues('#tabla-bitacoras'), 'tabla-bitacoras');
          renderBitacoras(filtBit, bitacorasCache.length);
        }
        const runInc = function () {
          fetchJson(API + '/incidentes')
            .then((r) => { incidentesCache = toArray(r); updateHeaderUrgencies(); })
            .catch(function () {});
        };
        if (typeof requestIdleCallback === 'function') requestIdleCallback(runInc, { timeout: 2500 });
        else setTimeout(runInc, 1);
      } catch (err) {
        console.error('Dashboard prefill tablas:', err);
      }

      const dashUpdateEl = qs('#dashboard-last-update');
      if (dashUpdateEl) {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        dashUpdateEl.textContent = 'Última actualización: ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
      }

      // Estadísticas avanzadas y gráficos (si algo falla no rompemos el dashboard)
      try {
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
        const rowHint = 'Clic: cruzar filtro (módulo + periodo de esta tarjeta)';
        const pairs = [
          { key: 'semana_actual', prevKey: 'semana_anterior', titulo: 'Semana actual vs anterior', period: 'semana' },
          { key: 'mes_actual', prevKey: 'mes_anterior', titulo: 'Mes actual vs anterior', period: 'mes' },
          { key: 'año_actual', prevKey: 'año_anterior', titulo: 'Año actual vs anterior', period: 'año' },
        ];
        compEl.innerHTML = pairs.map(({ key, prevKey, titulo, period }) => {
          const p = dashboardStats.periodos[key];
          const prev = dashboardStats.periodos[prevKey];
          if (!p || !prev) return '';
          const cot = p.cotizaciones; const cotPrev = prev.cotizaciones;
          const bit = p.bitacoras; const bitPrev = prev.bitacoras;
          return `
            <div class="dashboard-stat-card" data-period="${period}">
              <h4 class="dashboard-stat-card-title-cf" title="Clic en una fila de métrica para filtrar">${escapeHtml(titulo)}</h4>
              <div class="stat-row stat-row-crossfilter" data-dimension="cotizaciones" title="${rowHint}"><span class="stat-label">Cotizaciones</span><span><span class="stat-value">${cot.count}</span> <span class="stat-diff ${diffClass(cot.count, cotPrev.count)}">${diffText(cot.count, cotPrev.count)}</span></span></div>
              <div class="stat-row stat-row-crossfilter" data-dimension="cotizaciones" title="${rowHint}"><span class="stat-label">Monto cotiz.</span><span><span class="stat-value">${formatMoney(cot.monto)}</span> <span class="stat-diff ${diffClass(cot.monto, cotPrev.monto)}">${diffText(cot.monto, cotPrev.monto)}</span></span></div>
              <div class="stat-row stat-row-crossfilter" data-dimension="bitacoras" title="${rowHint}"><span class="stat-label">Bitácoras</span><span><span class="stat-value">${bit.count} (${Number(bit.horas).toFixed(1)} h)</span> <span class="stat-diff ${diffClass(bit.count, bitPrev.count)}">${diffText(bit.count, bitPrev.count)}</span></span></div>
            </div>`;
        }).join('');

        const pron = dashboardStats.pronosticos;
        if (pron) {
          const pronCards = [
            { titulo: 'Próxima semana', d: pron.proxima_semana },
            { titulo: 'Próximo mes', d: pron.proximo_mes },
            { titulo: 'Próximo año', d: pron.proximo_año },
          ];
          pronEl.innerHTML = '<p class="dashboard-hint dashboard-forecast-legend">Cada fila: <strong>Cotizaciones</strong> = cantidad y monto estimado; <strong>Bitácoras</strong> = registros y horas estimadas.</p>' +
            pronCards.map(({ titulo, d }) => `
            <div class="dashboard-forecast-card">
              <h4>${escapeHtml(titulo)}</h4>
              <div class="stat-row"><span class="stat-label">Cotizaciones</span><span class="stat-value">${d.cotizaciones_count} cotiz. · ${formatMoney(d.cotizaciones_monto)}</span></div>
              <div class="stat-row"><span class="stat-label">Bitácoras</span><span class="stat-value">${d.bitacoras_count} registros · ${Number(d.bitacoras_horas).toFixed(1)} h</span></div>
            </div>`).join('');
        } else {
          pronEl.innerHTML = '<p class="dashboard-hint">No hay datos suficientes para pronósticos.</p>';
        }

        renderDashboardChartsDeferred(cotizacionesCtx, bitacorasCtx, dashboardStats);
        } else if (adv) {
          adv.style.display = 'none';
          const ceHide = qs('#dashboard-charts');
          if (ceHide) ceHide.style.display = 'none';
          if (chartDonut) { chartDonut.destroy(); chartDonut = null; }
          if (chartBars) { chartBars.destroy(); chartBars = null; }
        }
      } catch (errAdv) {
        console.error('Dashboard estadísticas/gráficos:', errAdv);
        const adv = qs('#dashboard-advanced');
        if (adv) adv.style.display = 'none';
        const ceErr = qs('#dashboard-charts');
        if (ceErr) ceErr.style.display = 'none';
        if (chartDonut) { chartDonut.destroy(); chartDonut = null; }
        if (chartBars) { chartBars.destroy(); chartBars = null; }
      }
      initDashboardCrossfilterBindings();
      syncDashboardCrossFilterUi();
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
      let st = await fetchJson(API + '/seed-status');
      const incompletas =
        st.maquinas_incompletas === true ||
        (Number(st.clientes) > 0 && Number(st.maquinas) < Number(st.clientes) * 2);
      if (!seedDemoEnsureOnce && incompletas && !isAutoRefresh) {
        seedDemoEnsureOnce = true;
        try {
          const fix = await fetchJson(API + '/demo-ensure-maquinas', { method: 'POST' });
          if (fix && Number(fix.inserted) > 0) {
            st = await fetchJson(API + '/seed-status');
            showToast(
              'Equipos de presentación completados: +' + fix.inserted + ' (total máquinas activas: ' + (fix.maquinas_activas ?? st.maquinas) + ').',
              'success'
            );
          }
        } catch (_) {
          /* Servidor sin ruta o sin permiso: no bloquear el panel Demo */
        }
      }
      el.innerHTML = `Actualmente: <strong>${st.clientes}</strong> clientes, <strong>${st.refacciones}</strong> refacciones, <strong>${st.maquinas}</strong> máquinas, <strong>${st.cotizaciones || 0}</strong> cotizaciones, <strong>${st.incidentes || 0}</strong> incidentes, <strong>${st.bitacoras || 0}</strong> bitácoras.`;
      const now = new Date();
      const totalReg = Number(st.clientes || 0) + Number(st.refacciones || 0) + Number(st.maquinas || 0) + Number(st.cotizaciones || 0) + Number(st.incidentes || 0) + Number(st.bitacoras || 0);
      systemStatusState.registros = totalReg;
      systemStatusState.updatedAt = formatLastUpdate(now);
      updateHeaderSystemStatus();
      if (lastEl) lastEl.textContent = 'Última actualización: ' + formatLastUpdate(now);
      if (isAutoRefresh) showToast('Datos actualizados automáticamente (cada 12 h).', 'success');
    } catch (e) {
      el.textContent = 'No se pudo conectar con el servidor.';
      systemStatusState.registros = 'sin conexión';
      updateHeaderSystemStatus();
      if (lastEl) lastEl.textContent = '';
    }
  }

  async function refreshAfterFullWipe() {
    await loadSeedStatus();
    await loadStorageHealth();
    await loadDashboard();
    if (canAccessCotizaciones()) await loadCotizaciones({ force: true });
    await loadIncidentes();
    await loadBitacoras({ force: true });
    await loadMaquinas({ force: true });
    await loadClientes({ force: true });
    fillClientesSelect();
    if (typeof loadReportes === 'function') await loadReportes();
    if (typeof loadGarantias === 'function') await loadGarantias();
    if (typeof loadMantenimientoGarantia === 'function') await loadMantenimientoGarantia();
    if (typeof loadGarantiasSinCobertura === 'function') await loadGarantiasSinCobertura();
    if (typeof loadBonos === 'function') await loadBonos();
    if (typeof loadViajes === 'function') await loadViajes();
    if (typeof loadProspeccion === 'function') await loadProspeccion();
    if (typeof syncSessionHeader === 'function') syncSessionHeader();
  }

  async function loadStorageHealth() {
    const pill = qs('#storage-health-pill');
    const detail = qs('#storage-health-detail');
    if (!pill || !detail) return;
    try {
      const st = await fetchJson(API + '/storage-health');
      pill.classList.remove('status-pill-neutral', 'status-pill-ok', 'status-pill-warn', 'status-pill-bad');
      if (st && st.persistence === 'persistent_cloud') {
        pill.classList.add('status-pill-ok');
        pill.textContent = 'Persistencia: nube estable';
      } else if (st && st.persistence === 'local_file_persistent') {
        pill.classList.add('status-pill-ok');
        pill.textContent = 'Persistencia: archivo local OK';
      } else if (st && st.persistence === 'local_file_missing') {
        pill.classList.add('status-pill-warn');
        pill.textContent = 'Persistencia: archivo aún no creado';
      } else {
        pill.classList.add('status-pill-warn');
        pill.textContent = 'Persistencia: revisar configuración';
      }
      if (st && st.mode === 'sqlite' && st.path) {
        detail.textContent = 'SQLite: ' + st.path;
        systemStatusState.mode = 'SQLite';
      } else if (st && st.mode === 'turso') {
        detail.textContent = 'Modo Turso (base de datos en nube).';
        systemStatusState.mode = 'Turso';
      } else {
        detail.textContent = st && st.details ? st.details : 'No se pudo determinar el estado de persistencia.';
        systemStatusState.mode = 'desconocido';
      }
      systemStatusState.persistence = pill.textContent.replace('Persistencia: ', '');
      updateHeaderSystemStatus();
    } catch (_) {
      pill.classList.remove('status-pill-neutral', 'status-pill-ok', 'status-pill-warn');
      pill.classList.add('status-pill-bad');
      pill.textContent = 'Persistencia: sin conexión';
      detail.textContent = 'No fue posible consultar /api/storage-health.';
      systemStatusState.mode = 'sin conexión';
      systemStatusState.persistence = 'sin conexión';
      updateHeaderSystemStatus();
    }
  }

  function downloadJsonFile(filename, obj) {
    const text = JSON.stringify(obj, null, 2);
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      a.remove();
    }, 400);
  }

  async function exportBackupJson() {
    const btn = qs('#btn-backup-export');
    if (btn) { btn.disabled = true; btn.textContent = 'Generando respaldo…'; }
    try {
      const data = await fetchJson(API + '/backup/export');
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const ts = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
      const file = 'microsip-backup-' + ts + '.json';
      downloadJsonFile(file, data);
      try { localStorage.setItem(BACKUP_REMINDER_KEY, String(Date.now())); } catch (_) {}
      showToast('Respaldo exportado correctamente.', 'success');
    } catch (e) {
      showToast(parseApiError(e) || 'No se pudo exportar el respaldo.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Exportar respaldo JSON'; }
    }
  }

  async function importBackupJsonFromFile(file) {
    if (!file) return;
    const txt = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(txt);
    } catch (_) {
      throw new Error('El archivo no es un JSON válido.');
    }
    const ok = window.confirm('Esto reemplazará TODOS los datos actuales por los del respaldo. ¿Deseas continuar?');
    if (!ok) return;
    await fetchJson(API + '/backup/import', {
      method: 'POST',
      body: JSON.stringify({ backup: parsed }),
    });
    await loadSeedStatus();
    await loadStorageHealth();
    await loadDashboard();
    await loadClientes({ force: true });
    await loadRefacciones();
    await loadMaquinas({ force: true });
    if (canAccessCotizaciones()) await loadCotizaciones({ force: true });
    await loadBitacoras({ force: true });
    fillClientesSelect();
    showToast('Respaldo restaurado correctamente.', 'success');
  }

  function formatBytes(n) {
    const v = Number(n) || 0;
    if (v < 1024) return v + ' B';
    if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB';
    return (v / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function fmtDateTimeIso(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '—';
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (_) {
      return '—';
    }
  }

  async function downloadBackupByName(name) {
    const res = await fetchJson(API + '/backup/file?name=' + encodeURIComponent(name));
    if (!res || !res.backup) throw new Error('No se pudo cargar el respaldo seleccionado.');
    downloadJsonFile(name, res.backup);
    showToast('Backup descargado: ' + name, 'success');
  }

  async function restoreBackupByName(name) {
    const res = await fetchJson(API + '/backup/file?name=' + encodeURIComponent(name));
    if (!res || !res.backup) throw new Error('No se pudo cargar el respaldo seleccionado.');
    const ok = window.confirm('Se restaurará el backup ' + name + ' y se reemplazarán todos los datos actuales. ¿Continuar?');
    if (!ok) return;
    await fetchJson(API + '/backup/import', {
      method: 'POST',
      body: JSON.stringify({ backup: res.backup }),
    });
    await loadSeedStatus();
    await loadStorageHealth();
    await loadDashboard();
    await loadClientes({ force: true });
    await loadRefacciones();
    await loadMaquinas({ force: true });
    if (canAccessCotizaciones()) await loadCotizaciones({ force: true });
    await loadBitacoras({ force: true });
    fillClientesSelect();
    showToast('Backup restaurado desde lista automática.', 'success');
  }

  async function deleteBackupByName(name) {
    const ok = window.confirm('¿Eliminar este backup del servidor?\n' + name);
    if (!ok) return;
    await fetchJson(API + '/backup/file', {
      method: 'DELETE',
      body: JSON.stringify({ name }),
    });
    showToast('Backup eliminado: ' + name, 'success');
  }

  async function createBackupNow() {
    const btn = qs('#btn-backup-create-now');
    if (btn) { btn.disabled = true; btn.textContent = 'Creando…'; }
    try {
      const r = await fetchJson(API + '/backup/create-now', { method: 'POST' });
      showToast('Backup creado: ' + (r.file || 'ok'), 'success');
      await loadBackupFilesList();
    } catch (e) {
      showToast(parseApiError(e) || 'No se pudo crear el backup.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus"></i> Crear ahora'; }
    }
  }

  async function loadBackupFilesList() {
    const box = qs('#backup-files-list');
    const policyEl = qs('#backup-files-policy');
    if (!box) return;
    box.innerHTML = '<div class="backup-file-empty">Cargando backups…</div>';
    try {
      const data = await fetchJson(API + '/backup/files');
      const files = Array.isArray(data && data.files) ? data.files : [];
      if (policyEl) {
        const p = data && data.policy ? data.policy : null;
        if (p) {
          policyEl.textContent = `Política activa: cada ${p.intervalHours}h · máximo ${p.maxFiles} archivos · antigüedad máxima ${p.maxAgeDays} días`;
        } else {
          policyEl.textContent = '';
        }
      }
      if (!files.length) {
        box.innerHTML = '<div class="backup-file-empty">Aún no hay backups automáticos en el servidor.</div>';
        return;
      }
      box.innerHTML = files.map(function (f) {
        return `
          <div class="backup-file-row" data-backup-name="${escapeHtml(f.name)}">
            <div>
              <span class="backup-file-name">${escapeHtml(f.name)}</span>
              <small class="backup-file-meta">${escapeHtml(fmtDateTimeIso(f.modifiedAt))} · ${escapeHtml(formatBytes(f.sizeBytes))}</small>
            </div>
            <div class="backup-file-actions">
              <button type="button" class="btn small outline btn-backup-download" data-name="${escapeHtml(f.name)}"><i class="fas fa-download"></i> Descargar</button>
              <button type="button" class="btn small outline btn-backup-restore" data-name="${escapeHtml(f.name)}"><i class="fas fa-clock-rotate-left"></i> Restaurar</button>
              <button type="button" class="btn small outline btn-backup-danger btn-backup-delete" data-name="${escapeHtml(f.name)}"><i class="fas fa-trash"></i> Borrar</button>
            </div>
          </div>
        `;
      }).join('');
      box.querySelectorAll('.btn-backup-download').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          const name = btn.dataset.name;
          if (!name) return;
          btn.disabled = true;
          try { await downloadBackupByName(name); } catch (e) { showToast(parseApiError(e) || 'No se pudo descargar el backup.', 'error'); }
          btn.disabled = false;
        });
      });
      box.querySelectorAll('.btn-backup-restore').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          const name = btn.dataset.name;
          if (!name) return;
          btn.disabled = true;
          try { await restoreBackupByName(name); } catch (e) { showToast(parseApiError(e) || 'No se pudo restaurar el backup.', 'error'); }
          btn.disabled = false;
        });
      });
      box.querySelectorAll('.btn-backup-delete').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          const name = btn.dataset.name;
          if (!name) return;
          btn.disabled = true;
          try {
            await deleteBackupByName(name);
            await loadBackupFilesList();
          } catch (e) {
            showToast(parseApiError(e) || 'No se pudo borrar el backup.', 'error');
          }
          btn.disabled = false;
        });
      });
    } catch (e) {
      box.innerHTML = '<div class="backup-file-empty">No se pudo consultar la lista de backups automáticos.</div>';
      showToast(parseApiError(e) || 'No se pudo cargar la lista de backups.', 'error');
    }
  }

  function refreshActivePanelData(opts) {
    const silent = !!(opts && opts.silent);
    const active = document.querySelector('.tab.active');
    const id = active && active.dataset ? active.dataset.tab : 'dashboards';
    if (id === 'dashboards') loadDashboard();
    if (id === 'clientes') loadClientes({ force: true });
    if (id === 'refacciones') loadRefacciones();
    if (id === 'maquinas') loadMaquinas({ force: true });
    if (id === 'almacen') loadAlmacen();
    if (id === 'cotizaciones') loadCotizaciones({ force: true });
    if (id === 'garantias') loadGarantias();
    if (id === 'mantenimiento-garantia') loadMantenimientoGarantia();
    if (id === 'garantias-sin-cobertura') loadGarantiasSinCobertura();
    if (id === 'bonos') loadBonos();
    if (id === 'viajes') loadViajes();
    if (id === 'bitacoras') loadBitacoras({ force: true });
    if (id === 'prospeccion') loadProspeccion();
    if (id === 'usuarios') loadAppUsers();
    if (id === 'demo') {
      const ru = getSessionUser();
      if (!serverConfig.authRequired || normalizeRole(ru && ru.role) === 'admin') loadBackupFilesList();
    }
    loadSeedStatus(false);
    loadStorageHealth();
    if (!silent) showToast('Datos actualizados.', 'success');
  }

  async function seedDemo() {
    const btn = qs('#btn-seed-demo');
    try {
      const status = await fetchJson(API + '/seed-status');
      if (status && Number(status.clientes) > 0) {
        const msg =
          'Ya hay clientes en la base: no se borra ni se pisa datos reales. ' +
          'Para añadir incidentes/bitácoras/cotizaciones demo usa el botón verde «Cargar solo incidentes, bitácoras y cotizaciones demo», o SQL en Turso (scripts/).';
        if (qs('#seed-status')) qs('#seed-status').innerHTML = '<span class="warn-msg">' + escapeHtml(msg) + '</span>';
        showToast(msg, 'success');
        return;
      }
    } catch (_) {}
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = 'Cargando…';
    try {
      const data = await fetchJson(API + '/seed-demo', {
        method: 'POST',
        body: JSON.stringify({ force: false }),
      });
      const en = data.enrichment || {};
      const enLine =
        en.tecnicos_demo != null
          ? ` · Personal demo: <strong>${en.tecnicos_demo}</strong>, calendario mg: <strong>${en.mantenimientos_calendario || 0}</strong>, sin cobertura: <strong>${en.garantias_sin_cobertura || 0}</strong>, bonos seed: <strong>${en.bonos_demo || 0}</strong>`
          : '';
      qs('#seed-status').innerHTML =
        `Listo: <strong>${data.clientes}</strong> clientes, <strong>${data.refacciones}</strong> refacciones, ` +
        `<strong>${data.maquinas}</strong> máquinas, <strong>${data.cotizaciones || 0}</strong> cotizaciones, ` +
        `<strong>${data.incidentes || 0}</strong> incidentes, <strong>${data.bitacoras || 0}</strong> bitácoras, ` +
        `<strong>${data.reportes || 0}</strong> reportes, <strong>${data.garantias || 0}</strong> garantías, ` +
        `<strong>${data.bonos || 0}</strong> bonos, <strong>${data.viajes || 0}</strong> viajes.${enLine}`;
      btn.textContent = 'Datos demo cargados';
      loadSeedStatus();
      loadClientes({ force: true });
      loadRefacciones();
      loadMaquinas({ force: true });
      fillClientesSelect();
      if (canAccessCotizaciones()) await loadCotizaciones({ force: true });
      await loadBitacoras({ force: true });
      if (typeof loadTecnicos === 'function') loadTecnicos();
      if (typeof loadMantenimientoGarantia === 'function') loadMantenimientoGarantia();
      if (typeof loadGarantiasSinCobertura === 'function') loadGarantiasSinCobertura();
      if (typeof loadBonos === 'function') loadBonos();
      if (typeof loadViajes === 'function') loadViajes();
      showPanel('bitacoras', { skipLoad: true });
      showToast('Demo completo cargado: clientes, cotizaciones, reportes, garantías, bonos, personal y mantenimientos.', 'success');
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
      const sel = qs('#filtro-cliente-maq');
      if (!sel) return;
      let rows = toArray(clientesCache);
      if (!rows.length) {
        const data = await fetchJson(API + '/clientes');
        rows = toArray(data);
        clientesCache = rows;
        rebuildClientCityMaps();
        updateGlobalBranchOptions();
      }
      const sorted = [...rows].sort((a, b) =>
        String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' }));
      const first = '<option value="">Todos los clientes</option>';
      sel.innerHTML = first + sorted.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
    } catch (_) {}
  }

  function applyClientesFiltersAndRender() {
    const tid = 'tabla-clientes';
    const q = (qs('#buscar-clientes') && qs('#buscar-clientes').value || '').trim();
    let filtered = applyFilters(applyGlobalBranchFilterRows(clientesCache), getFilterValues('#tabla-clientes'), tid);
    if (q) filtered = filtered.filter(c => [c.nombre, c.codigo, c.rfc].some(v => normalizeForSearch(v).includes(normalizeForSearch(q))));
    const pageSize = getPageSize(tid);
    let page = getPaginationState(tid);
    const maxPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
    if (page > maxPage) { setPaginationPage(tid, 0); page = 0; }
    const slice = filtered.slice(page * pageSize, (page + 1) * pageSize);
    const popts = filtered.length > pageSize ? { page, pageSize, totalFiltered: filtered.length, onPrev: () => { setPaginationPage(tid, page - 1); applyClientesFiltersAndRender(); }, onNext: () => { setPaginationPage(tid, page + 1); applyClientesFiltersAndRender(); }, onPageSizeChange: (t, size) => { setPageSize(t, size); applyClientesFiltersAndRender(); } } : undefined;
    renderClientes(slice, popts);
  }
  function applyRefaccionesFiltersAndRender() {
    const tid = 'tabla-refacciones';
    const q = (qs('#buscar-refacciones') && qs('#buscar-refacciones').value || '').trim();
    let filtered = applyFilters(refaccionesCache, getFilterValues('#tabla-refacciones'), tid);
    const fc = qs('#filtro-categoria-ref') && qs('#filtro-categoria-ref').value;
    if (fc) filtered = filtered.filter(r => r.categoria === fc);
    const fsu = qs('#filtro-subcategoria-ref') && qs('#filtro-subcategoria-ref').value;
    if (fsu) filtered = filtered.filter(r => r.subcategoria === fsu);
    if (q) filtered = filtered.filter(r => [r.codigo, r.descripcion, r.categoria, r.subcategoria, r.zona].some(v => normalizeForSearch(v).includes(normalizeForSearch(q))));
    const pageSize = getPageSize(tid);
    let page = getPaginationState(tid);
    const maxPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
    if (page > maxPage) { setPaginationPage(tid, 0); page = 0; }
    const slice = filtered.slice(page * pageSize, (page + 1) * pageSize);
    const popts = filtered.length > pageSize ? { page, pageSize, totalFiltered: filtered.length, onPrev: () => { setPaginationPage(tid, page - 1); applyRefaccionesFiltersAndRender(); }, onNext: () => { setPaginationPage(tid, page + 1); applyRefaccionesFiltersAndRender(); }, onPageSizeChange: (t, size) => { setPageSize(t, size); applyRefaccionesFiltersAndRender(); } } : undefined;
    renderRefacciones(slice, popts);
  }
  function applyMaquinasFiltersAndRender() {
    const tid = 'tabla-maquinas';
    let filtered = applyFilters(applyGlobalBranchFilterRows(maquinasCache), getFilterValues('#tabla-maquinas'), tid);
    const pageSize = getPageSize(tid);
    let page = getPaginationState(tid);
    const maxPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
    if (page > maxPage) { setPaginationPage(tid, 0); page = 0; }
    const slice = filtered.slice(page * pageSize, (page + 1) * pageSize);
    const popts = filtered.length > pageSize ? { page, pageSize, totalFiltered: filtered.length, onPrev: () => { setPaginationPage(tid, page - 1); applyMaquinasFiltersAndRender(); }, onNext: () => { setPaginationPage(tid, page + 1); applyMaquinasFiltersAndRender(); }, onPageSizeChange: (t, size) => { setPageSize(t, size); applyMaquinasFiltersAndRender(); } } : undefined;
    renderMaquinas(slice, popts);
  }
  function applyCotizacionesFiltersAndRender() {
    const tid = 'tabla-cotizaciones';
    let base = applyGlobalBranchFilterRows(cotizacionesCache);
    const inclAplicadas = qs('#cot-incluir-aplicadas');
    if (inclAplicadas && !inclAplicadas.checked) {
      base = base.filter(c => c.estado !== 'aplicada' && c.estado !== 'venta');
    }
    const filtered = applyFilters(base, getFilterValues('#tabla-cotizaciones'), tid);
    const pageSize = getPageSize(tid);
    let page = getPaginationState(tid);
    const maxPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
    if (page > maxPage) { setPaginationPage(tid, 0); page = 0; }
    const slice = filtered.slice(page * pageSize, (page + 1) * pageSize);
    const popts = filtered.length > pageSize ? { page, pageSize, totalFiltered: filtered.length, onPrev: () => { setPaginationPage(tid, page - 1); applyCotizacionesFiltersAndRender(); }, onNext: () => { setPaginationPage(tid, page + 1); applyCotizacionesFiltersAndRender(); }, onPageSizeChange: (t, size) => { setPageSize(t, size); applyCotizacionesFiltersAndRender(); } } : undefined;
    renderCotizaciones(slice, cotizacionesCache.length, popts);
  }
  function applyIncidentesFiltersAndRender() {
    if (!qs('#tabla-incidentes')) return;
    const tid = 'tabla-incidentes';
    const filtered = applyFilters(applyGlobalBranchFilterRows(incidentesCache), getFilterValues('#tabla-incidentes'), tid);
    const pageSize = getPageSize(tid);
    let page = getPaginationState(tid);
    const maxPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
    if (page > maxPage) { setPaginationPage(tid, 0); page = 0; }
    const slice = filtered.slice(page * pageSize, (page + 1) * pageSize);
    const popts = filtered.length > pageSize ? { page, pageSize, totalFiltered: filtered.length, onPrev: () => { setPaginationPage(tid, page - 1); applyIncidentesFiltersAndRender(); }, onNext: () => { setPaginationPage(tid, page + 1); applyIncidentesFiltersAndRender(); }, onPageSizeChange: (t, size) => { setPageSize(t, size); applyIncidentesFiltersAndRender(); } } : undefined;
    renderIncidentes(slice, incidentesCache.length, popts);
  }
  function applyBitacorasFiltersAndRender() {
    const tid = 'tabla-bitacoras';
    const filtered = applyFilters(applyGlobalBranchFilterRows(bitacorasCache), getFilterValues('#tabla-bitacoras'), tid);
    const pageSize = getPageSize(tid);
    let page = getPaginationState(tid);
    const maxPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
    if (page > maxPage) { setPaginationPage(tid, 0); page = 0; }
    const slice = filtered.slice(page * pageSize, (page + 1) * pageSize);
    const popts = filtered.length > pageSize ? { page, pageSize, totalFiltered: filtered.length, onPrev: () => { setPaginationPage(tid, page - 1); applyBitacorasFiltersAndRender(); }, onNext: () => { setPaginationPage(tid, page + 1); applyBitacorasFiltersAndRender(); }, onPageSizeChange: (t, size) => { setPageSize(t, size); applyBitacorasFiltersAndRender(); } } : undefined;
    renderBitacoras(slice, bitacorasCache.length, popts);
  }

  // ----- VENTAS -----
  let ventasCache = [];
  async function loadVentas() {
    showLoading();
    try {
      const data = await fetchJson(API + '/ventas');
      ventasCache = Array.isArray(data) ? data : [];
      renderVentas(ventasCache);
    } catch (e) { console.error(e); }
    finally {
      hideLoading();
      refreshDavidComisionesCotPanel();
    }
  }

  function renderVentas(data) {
    const tbody = qs('#tabla-ventas tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const showCom = canViewCommissions();
    const colSpan = showCom ? 9 : 8;
    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${colSpan}" class="empty">No hay ventas aprobadas aún.</td></tr>`;
      return;
    }

    // Resumen bar
    const totalVentasUsd = data.reduce((s, v) => s + (Number(v.total) || 0), 0);
    const resBar = qs('#ventas-resumen-bar');
    if (resBar) {
      resBar.classList.remove('hidden');
      resBar.innerHTML = `<i class="fas fa-chart-bar"></i> <strong>${data.length}</strong> ventas &nbsp;|&nbsp; Total: <strong>${formatMoney(totalVentasUsd)} USD</strong>`;
    }

    const TARIFAS = {};
    try { Object.assign(TARIFAS, JSON.parse(localStorage.getItem('tarifas_cache') || '{}')); } catch (_) {}
    const comSvc = Number(TARIFAS.comision_svc) || 15;

    data.forEach(v => {
      const tr = document.createElement('tr');
      const tipoLabel = v.tipo === 'refacciones' ? 'Refacciones' : v.tipo === 'servicio' ? 'Servicio' : v.tipo === 'maquina' ? 'Equipo / máquina' : (v.tipo || '—');
      const totalUSD = v.moneda === 'USD' ? formatMoney(v.total) : (v.tipo_cambio > 0 ? formatMoney(v.total / v.tipo_cambio) : '—');
      const cr = Number(v.v_comision_refacciones_pct);
      const cm = Number(v.v_comision_maquinas_pct);
      let comPct = 0;
      if (v.tipo === 'refacciones') comPct = Number.isFinite(cr) ? cr : 10;
      else if (v.tipo === 'servicio') comPct = comSvc;
      else if (v.tipo === 'maquina') comPct = Number.isFinite(cm) ? cm : 0;
      const comAmt = comPct > 0 ? formatMoney(Number(v.total) * comPct / 100) : '—';
      const comTd = showCom ? `<td>${comPct > 0 ? `${comPct}% = ${comAmt}` : '—'}</td>` : '';
      tr.innerHTML = `
        <td>${escapeHtml(v.folio || '')}</td>
        <td>${escapeHtml((v.fecha_aprobacion || v.fecha || '').slice(0, 10))}</td>
        <td>${escapeHtml(v.cliente_nombre || '')}</td>
        <td>${escapeHtml(tipoLabel)}</td>
        <td>${formatMoney(v.total)}</td>
        <td>${totalUSD}</td>
        <td>${escapeHtml(v.vendedor || '—')}</td>
        ${comTd}
        <td class="th-actions">
          <button type="button" class="btn small outline btn-pdf-venta" data-id="${v.id}" title="Ver PDF"><i class="fas fa-file-pdf"></i></button>
        </td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.btn-pdf-venta').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openCotizacionPdf(btn.dataset.id); });
    });
  }

  // ----- PROSPECCIÓN (mapa + tabla, /api/prospectos) -----
  let prospectosCache = [];
  let leafletLoadPromise = null;
  let prospeccionMap = null;
  let prospeccionMarkersLayer = null;

  function ensureLeaflet() {
    if (typeof window !== 'undefined' && window.L && typeof window.L.map === 'function') return Promise.resolve();
    if (leafletLoadPromise) return leafletLoadPromise;
    leafletLoadPromise = new Promise(function (resolve, reject) {
      const href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      if (!document.querySelector('link[href="' + href + '"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
      }
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { leafletLoadPromise = null; reject(new Error('No se pudo cargar Leaflet')); };
      document.body.appendChild(s);
    });
    return leafletLoadPromise;
  }

  function setupProspeccionUi() {
    const f = qs('#filtro-prospeccion');
    if (f && !f._prospeccionBound) {
      f._prospeccionBound = true;
      let t;
      f.addEventListener('input', function () {
        clearTimeout(t);
        t = setTimeout(function () { renderProspeccionFromCache(); }, 200);
      });
    }
    const btnR = qs('#btn-prospeccion-refresh');
    if (btnR && !btnR._prospeccionBound) {
      btnR._prospeccionBound = true;
      btnR.addEventListener('click', function () { loadProspeccion(); });
    }
    const btnE = qs('#export-prospeccion-csv');
    if (btnE && !btnE._prospeccionBound) {
      btnE._prospeccionBound = true;
      btnE.addEventListener('click', exportProspeccionCsv);
    }
  }

  function getProspectosFiltered() {
    const raw = prospectosCache || [];
    const q = (qs('#filtro-prospeccion') && qs('#filtro-prospeccion').value || '').trim().toLowerCase();
    if (!q) return raw.slice();
    return raw.filter(function (r) {
      const blob = [
        r.empresa, r.zona, r.estado, r.industria, r.tipo_interes, r.notas,
      ].map(function (x) { return String(x || '').toLowerCase(); }).join(' ');
      return blob.indexOf(q) >= 0;
    });
  }

  function fmtProspectoUsd(n) {
    const x = Number(n) || 0;
    return x.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function renderProspeccionKpis(rows) {
    const el = qs('#prospeccion-kpis');
    if (!el) return;
    const total = rows.length;
    const conGeo = rows.filter(function (r) { return Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng)); }).length;
    const pot = rows.reduce(function (s, r) { return s + (Number(r.potencial_usd) || 0); }, 0);
    const scoreAvg = total ? rows.reduce(function (s, r) { return s + (Number(r.score_ia) || 0); }, 0) / total : 0;
    el.innerHTML = `
      <div class="prospeccion-kpi"><div class="prospeccion-kpi-lbl">Prospectos (filtrados)</div><div class="prospeccion-kpi-val">${total}</div></div>
      <div class="prospeccion-kpi"><div class="prospeccion-kpi-lbl">Con coordenadas</div><div class="prospeccion-kpi-val">${conGeo}</div></div>
      <div class="prospeccion-kpi"><div class="prospeccion-kpi-lbl">Potencial USD (suma)</div><div class="prospeccion-kpi-val">${fmtProspectoUsd(pot)}</div></div>
      <div class="prospeccion-kpi"><div class="prospeccion-kpi-lbl">Score IA (prom.)</div><div class="prospeccion-kpi-val">${scoreAvg.toFixed(0)}</div></div>`;
  }

  function renderProspeccionTable(rows) {
    const tbody = qs('#tabla-prospeccion tbody');
    const foot = qs('#footer-tabla-prospeccion');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty">No hay prospectos. Usa <strong>Cargar demo</strong> o altas en base.</td></tr>';
      if (foot) foot.textContent = '';
      return;
    }
    rows.forEach(function (r) {
      const tr = document.createElement('tr');
      const notas = String(r.notas || '');
      tr.innerHTML = `
        <td>${escapeHtml(r.empresa || '')}</td>
        <td>${escapeHtml(r.zona || '—')}</td>
        <td>${escapeHtml(r.estado || '—')}</td>
        <td>${escapeHtml(r.industria || '—')}</td>
        <td>${escapeHtml(r.tipo_interes || '—')}</td>
        <td>${escapeHtml(fmtProspectoUsd(r.potencial_usd))}</td>
        <td>${escapeHtml(String(Math.round(Number(r.score_ia) || 0)))}</td>
        <td>${escapeHtml((r.ultimo_contacto || '').slice(0, 10) || '—')}</td>
        <td>${escapeHtml(notas.slice(0, 120))}${notas.length > 120 ? '…' : ''}</td>`;
      tbody.appendChild(tr);
    });
    if (foot) foot.textContent = rows.length + ' fila(s)';
  }

  function renderProspeccionMap(rows) {
    const L = window.L;
    if (!L) return;
    const el = qs('#map-prospeccion');
    if (!el) return;
    const valid = rows.filter(function (r) {
      const lat = Number(r.lat); const lng = Number(r.lng);
      return Number.isFinite(lat) && Number.isFinite(lng);
    });
    if (!prospeccionMap) {
      prospeccionMap = L.map(el, { scrollWheelZoom: true });
      var useIndustrialTiles = document.body && document.body.classList.contains('theme-industrial');
      var tileUrl = useIndustrialTiles
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      var tileOpts = useIndustrialTiles
        ? { attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 20 }
        : { attribution: '&copy; OpenStreetMap', maxZoom: 19 };
      L.tileLayer(tileUrl, tileOpts).addTo(prospeccionMap);
      prospeccionMarkersLayer = L.layerGroup().addTo(prospeccionMap);
    }
    prospeccionMarkersLayer.clearLayers();
    valid.forEach(function (r) {
      const lat = Number(r.lat); const lng = Number(r.lng);
      const rad = 8 + Math.min(8, (Number(r.score_ia) || 50) / 12);
      const m = L.circleMarker([lat, lng], {
        radius: rad,
        color: '#0d9488',
        weight: 2,
        fillColor: '#14b8a6',
        fillOpacity: 0.55,
      });
      m.bindPopup('<strong>' + escapeHtml(r.empresa || '') + '</strong><br>' +
        (r.zona ? escapeHtml(r.zona) + '<br>' : '') +
        'Potencial USD: ' + fmtProspectoUsd(r.potencial_usd) + '<br>Score: ' + Math.round(Number(r.score_ia) || 0));
      prospeccionMarkersLayer.addLayer(m);
    });
    if (valid.length) {
      const bounds = L.latLngBounds(valid.map(function (r) { return [Number(r.lat), Number(r.lng)]; }));
      prospeccionMap.fitBounds(bounds.pad(0.15));
    } else {
      prospeccionMap.setView([25.7, -100.3], 5);
    }
    setTimeout(function () { try { prospeccionMap.invalidateSize(); } catch (_) {} }, 200);
  }

  function renderProspeccionFromCache() {
    setupProspeccionUi();
    const rows = getProspectosFiltered();
    renderProspeccionKpis(rows);
    renderProspeccionTable(rows);
    if (window.L && typeof window.L.map === 'function') renderProspeccionMap(rows);
  }

  async function loadProspeccion() {
    setupProspeccionUi();
    showLoading();
    try {
      await ensureLeaflet();
      const data = await fetchJson(API + '/prospectos');
      prospectosCache = toArray(data);
      renderProspeccionFromCache();
    } catch (e) {
      console.error(e);
      showToast(parseApiError(e) || 'No se pudieron cargar los prospectos.', 'error');
      prospectosCache = [];
      renderProspeccionFromCache();
    } finally {
      hideLoading();
      setTimeout(function () { try { if (prospeccionMap) prospeccionMap.invalidateSize(); } catch (_) {} }, 300);
    }
  }

  function exportProspeccionCsv() {
    const rows = getProspectosFiltered();
    if (!rows.length) { showToast('No hay filas para exportar.', 'error'); return; }
    const headers = ['empresa', 'zona', 'lat', 'lng', 'estado', 'industria', 'tipo_interes', 'potencial_usd', 'score_ia', 'ultimo_contacto', 'notas'];
    const out = [headers.join(',')].concat(rows.map(function (r) {
      return headers.map(function (h) {
        let v = r[h];
        if (v == null) v = '';
        v = String(v);
        if (/[",\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
        return v;
      }).join(',');
    })).join('\n');
    const blob = new Blob([out], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'prospeccion-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  // ----- ALMACÉN (modelo, sucursal, serie, estado revisión, cotización pendiente) -----
  async function loadAlmacen() {
    showLoading();
    try {
      await refreshMaquinaBloqueoCotizacionMap(null);
      const [maqRaw, revRaw] = await Promise.all([
        fetchJson(API + '/maquinas').catch(() => []),
        fetchJson(API + '/revision-maquinas').catch(() => []),
      ]);
      almacenMaquinasSnapshot = toArray(maqRaw);
      almacenRevisionSnapshot = toArray(revRaw);
      if (!toArray(clientesCache).length) {
        try {
          clientesCache = toArray(await fetchJson(API + '/clientes'));
          rebuildClientCityMaps();
          updateGlobalBranchOptions();
        } catch (_) {}
      }
      const sel = qs('#filtro-sucursal-almacen');
      if (sel) {
        const cur = sel.value || '';
        const cities = [
          ...new Set(
            almacenMaquinasSnapshot.map((m) => ciudadSucursalMaquina(m)).filter((c) => c && c !== '—')
          ),
        ].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
        sel.innerHTML =
          '<option value="">Todas las sucursales</option>' +
          cities.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
        if (cur && cities.includes(cur)) sel.value = cur;
      }
      renderAlmacenTable();
    } catch (e) {
      console.error(e);
      showToast(parseApiError(e) || 'No se pudo cargar almacén.', 'error');
    } finally {
      hideLoading();
    }
  }

  function ciudadSucursalMaquina(m) {
    if (!m) return '—';
    if (m.ciudad && String(m.ciudad).trim()) return String(m.ciudad).trim();
    const cid = m.cliente_id;
    if (cid != null && clientesCache && clientesCache.length) {
      const c = clientesCache.find((x) => String(x.id) === String(cid));
      if (c && c.ciudad) return String(c.ciudad).trim();
    }
    const nom = (m.cliente_nombre || '').trim();
    if (nom) {
      const k = nom.toLowerCase();
      if (clienteCityByName[k]) return clienteCityByName[k];
    }
    const u = (m.ubicacion && String(m.ubicacion).trim()) || '';
    return u || '—';
  }

  function modeloAlmacenDisplay(m) {
    return String(m.modelo || m.nombre || m.categoria || '—').trim();
  }

  function latestRevisionForMaquinaId(revs, maquinaId) {
    const idStr = String(maquinaId);
    const list = (revs || []).filter((r) => r.maquina_id != null && String(r.maquina_id) === idStr);
    if (!list.length) return null;
    return list.reduce((a, b) => (Number(b.id) > Number(a.id) ? b : a));
  }

  function estadoAlmacenDesdeRevision(rev) {
    if (!rev) return { label: 'Sin probar', hint: 'Sin registro en Revisión Máquinas', cls: 'badge-warn' };
    const ent = rev.entregado === 'Si';
    const prFin = rev.prueba === 'Finalizada';
    if (ent && prFin) return { label: 'Lista para entregar', hint: 'Entregada y prueba finalizada', cls: 'badge-ok' };
    if (ent) return { label: 'Entrega inmediata', hint: 'Marcada como entregada; prueba no finalizada', cls: 'badge-info' };
    return { label: 'Sin probar', hint: 'Sin entregar o en proceso de prueba', cls: 'badge-warn' };
  }

  function renderAlmacenTable() {
    const tbody = qs('#tabla-almacen tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const maquinas = almacenMaquinasSnapshot || [];
    const revs = almacenRevisionSnapshot || [];
    const q = (qs('#buscar-almacen') && qs('#buscar-almacen').value || '').trim();
    const suc = (qs('#filtro-sucursal-almacen') && qs('#filtro-sucursal-almacen').value || '').trim();
    let rows = applyGlobalBranchFilterRows(maquinas.slice());
    if (suc) rows = rows.filter((m) => ciudadSucursalMaquina(m) === suc);
    if (q) {
      const nq = normalizeForSearch(q);
      rows = rows.filter((m) =>
        [m.modelo, m.nombre, m.categoria, m.subcategoria, m.numero_serie, m.cliente_nombre].some((v) =>
          normalizeForSearch(v).includes(nq)
        )
      );
    }
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="empty">Sin equipos que coincidan. <strong>Máquinas</strong> define modelo y serie; <strong>Revisión Máquinas</strong> el estado; <strong>Cotizaciones</strong> pendientes bloquean duplicar equipo.</td></tr>';
      return;
    }
    rows.sort((a, b) =>
      String(modeloAlmacenDisplay(a)).localeCompare(String(modeloAlmacenDisplay(b)), 'es', { sensitivity: 'base' })
    );
    rows.forEach((m) => {
      const tr = document.createElement('tr');
      const modelo = modeloAlmacenDisplay(m);
      const sucursal = ciudadSucursalMaquina(m);
      const serie = (m.numero_serie && String(m.numero_serie).trim()) || '—';
      const rev = latestRevisionForMaquinaId(revs, m.id);
      const est = estadoAlmacenDesdeRevision(rev);
      const lock = maquinaIdBloqueoCotizacionMap.get(Number(m.id));
      const cotCell = lock
        ? `<button type="button" class="link-btn btn-almacen-open-cot" data-cot-id="${lock.cotId}" title="Abrir cotización pendiente">${escapeHtml(lock.folio)}</button>`
        : '—';
      const revBtn =
        rev && rev.id
          ? `<button type="button" class="btn small outline btn-almacen-open-rev" title="Ir a Revisión Máquinas"><i class="fas fa-tools"></i></button>`
          : `<button type="button" class="btn small outline btn-almacen-new-rev" data-maq-id="${m.id}" title="Nueva revisión"><i class="fas fa-plus"></i></button>`;
      const subLine = [m.categoria, m.subcategoria].filter((x) => x && String(x).trim()).join(' · ');
      tr.innerHTML = `
        <td><strong>${escapeHtml(modelo)}</strong>${subLine ? `<div class="muted" style="font-size:0.82rem">${escapeHtml(subLine)}</div>` : ''}</td>
        <td>${escapeHtml(sucursal)}</td>
        <td>${escapeHtml(serie)}</td>
        <td><span class="badge ${est.cls}" title="${escapeHtml(est.hint)}">${escapeHtml(est.label)}</span></td>
        <td>${cotCell}</td>
        <td class="th-actions">${revBtn}</td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.btn-almacen-open-cot').forEach((btn) => {
      btn.addEventListener('click', async function (e) {
        e.preventDefault();
        const cid = Number(btn.dataset.cotId);
        if (!cid) return;
        try {
          const cot = await fetchJson(API + '/cotizaciones/' + cid);
          showPanel('cotizaciones', { skipLoad: true });
          openModalCotizacion(cot);
        } catch (err) {
          showToast(parseApiError(err) || 'No se pudo abrir la cotización.', 'error');
        }
      });
    });
    tbody.querySelectorAll('.btn-almacen-open-rev').forEach((btn) => {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        showPanel('revision-maquinas');
        loadRevisionMaquinas();
      });
    });
    tbody.querySelectorAll('.btn-almacen-new-rev').forEach((btn) => {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        const id = Number(btn.dataset.maqId);
        showPanel('revision-maquinas');
        loadRevisionMaquinas().then(function () {
          openModalRevisionMaquina({ maquina_id: id });
        });
      });
    });
  }

  // ----- REVISIÓN DE MÁQUINAS -----
  let revisionMaquinasCache = [];
  let revisionMaquinasCatalogoCache = [];
  async function fetchRevisionMaquinasCatalogo() {
    const data = await fetchJson(API + '/maquinas');
    revisionMaquinasCatalogoCache = Array.isArray(data) ? data : [];
    return revisionMaquinasCatalogoCache;
  }

  function renderRevisionMaquinasCatalog() {
    const el = qs('#revision-maq-catalog');
    if (!el) return;
    const list = revisionMaquinasCatalogoCache || [];
    if (!list.length) {
      el.innerHTML = '<p class="empty revision-maq-catalog-empty">No hay equipos en el catálogo. Regístralos en la pestaña <strong>Máquinas</strong>.</p>';
      return;
    }
    el.innerHTML = list.map(m => {
      const tit = m.modelo || m.nombre || 'Equipo';
      return `
      <article class="revision-maq-card" role="listitem">
        <div class="revision-maq-card-top">
          <span class="revision-maq-card-title">${escapeHtml(tit)}</span>
          <span class="revision-maq-card-serie"><i class="fas fa-barcode"></i> ${escapeHtml(m.numero_serie || '—')}</span>
        </div>
        <div class="revision-maq-card-client"><i class="fas fa-building"></i> ${escapeHtml(m.cliente_nombre || '—')}</div>
        <div class="revision-maq-card-meta"><span class="revision-maq-pill">${escapeHtml(m.categoria || '—')}</span></div>
        <button type="button" class="btn small primary btn-rev-desde-catalogo" data-maq-id="${m.id}">
          <i class="fas fa-clipboard-check"></i> Nueva revisión
        </button>
      </article>`;
    }).join('');
    el.querySelectorAll('.btn-rev-desde-catalogo').forEach(btn => {
      btn.addEventListener('click', () => {
        openModalRevisionMaquina({ maquina_id: Number(btn.dataset.maqId) });
      });
    });
  }

  async function loadRevisionMaquinas() {
    showLoading();
    try {
      const [data] = await Promise.all([
        fetchJson(API + '/revision-maquinas'),
        fetchRevisionMaquinasCatalogo(),
      ]);
      revisionMaquinasCache = Array.isArray(data) ? data : [];
      renderRevisionMaquinasCatalog();
      renderRevisionMaquinas(revisionMaquinasCache);
    } catch (e) { console.error(e); }
    finally {
      hideLoading();
      try {
        if (qs('#panel-almacen') && qs('#panel-almacen').classList.contains('active')) {
          almacenRevisionSnapshot = (revisionMaquinasCache || []).slice();
          renderAlmacenTable();
        }
      } catch (_) {}
    }
  }

  function renderRevisionMaquinas(data) {
    const tbody = qs('#tabla-revision-maquinas tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const filtEnt = qs('#filtro-entregado-rev') && qs('#filtro-entregado-rev').value;
    const filtPrueba = qs('#filtro-prueba-rev') && qs('#filtro-prueba-rev').value;
    let filtered = data;
    if (filtEnt) filtered = filtered.filter(r => r.entregado === filtEnt);
    if (filtPrueba) filtered = filtered.filter(r => r.prueba === filtPrueba);
    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty">Sin registros. Agrega una revisión.</td></tr>';
      return;
    }
    filtered.forEach(r => {
      const tr = document.createElement('tr');
      const entregadoBadge = r.entregado === 'Si'
        ? `<span class="badge badge-ok"><i class="fas fa-check"></i> Sí</span>`
        : `<span class="badge badge-warn"><i class="fas fa-times"></i> No</span>`;
      const pruebaBadge = r.prueba === 'Finalizada'
        ? `<span class="badge badge-ok">Finalizada</span>`
        : `<span class="badge badge-info">En Proceso</span>`;
      tr.innerHTML = `
        <td>${r.id}</td>
        <td>${escapeHtml(r.maquina_categoria || r.categoria || '')}</td>
        <td>${escapeHtml(r.maquina_modelo || r.modelo || '')}</td>
        <td>${escapeHtml(r.numero_serie || '')}</td>
        <td>${entregadoBadge}</td>
        <td>${pruebaBadge}</td>
        <td class="td-text-wrap">${escapeHtml(r.comentarios || '')}</td>
        <td class="th-actions">
          <button type="button" class="btn small primary btn-edit-rev" data-id="${r.id}"><i class="fas fa-edit"></i></button>
          <button type="button" class="btn small danger btn-del-rev" data-id="${r.id}"><i class="fas fa-trash"></i></button>
        </td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.btn-edit-rev').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const r = revisionMaquinasCache.find(x => x.id == btn.dataset.id); if (r) openModalRevisionMaquina(r); });
    });
    tbody.querySelectorAll('.btn-del-rev').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openConfirmModal('¿Eliminar este registro?', async () => {
        await fetchJson(API + '/revision-maquinas/' + btn.dataset.id, { method: 'DELETE' });
        loadRevisionMaquinas();
      }); });
    });
  }

  async function openModalRevisionMaquina(rev) {
    await fetchRevisionMaquinasCatalogo();
    const treeRm = await fetchJson(API + '/categorias-catalogo').catch(() => ({ categorias: [] }));
    const catNames = toArray(treeRm.categorias).map(c => c.nombre);
    const catalog = revisionMaquinasCatalogoCache.length ? revisionMaquinasCatalogoCache : maquinasCache;
    const isNew = !rev || !rev.id;
    const preMaqId = rev && rev.maquina_id != null ? rev.maquina_id : null;
    const maqOpts = catalog.map(m =>
      `<option value="${m.id}" data-modelo="${escapeHtml(m.modelo || m.nombre || '')}" data-serie="${escapeHtml(m.numero_serie || '')}" data-cat="${escapeHtml(m.categoria || '')}" ${preMaqId != null && String(preMaqId) === String(m.id) ? 'selected' : ''}>${escapeHtml(m.modelo || m.nombre || '')} – ${escapeHtml(m.numero_serie || '')}</option>`
    ).join('');
    const catVal = (rev && rev.categoria) || '';
    const catFromMaq = rev && rev.maquina_id && catalog.find(x => String(x.id) === String(rev.maquina_id));
    const effectiveCat = catVal || (catFromMaq && catFromMaq.categoria) || '';
    let catExtra = '';
    if (effectiveCat && !catNames.includes(effectiveCat)) {
      catExtra = `<option value="${escapeHtml(effectiveCat)}" selected>${escapeHtml(effectiveCat)} (histórico)</option>`;
    }
    const catOpts = catNames.map(c =>
      `<option value="${escapeHtml(c)}" ${effectiveCat === c ? 'selected' : ''}>${escapeHtml(c)}</option>`
    ).join('');
    const body = `
      <div class="form-group"><label>Máquina (catálogo)</label>
        <select id="rm-maquina"><option value="">— Seleccionar —</option>${maqOpts}</select>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Categoría</label>
          <select id="rm-cat">${catExtra}<option value="" disabled ${!effectiveCat ? 'selected' : ''}>— Elegir categoría —</option>${catOpts}</select>
        </div>
        <div class="form-group"><label>Modelo</label><input type="text" id="rm-modelo" value="${escapeHtml(rev && rev.modelo || '')}" placeholder="Auto desde catálogo"></div>
      </div>
      <div class="form-group"><label>Nº de serie</label><input type="text" id="rm-serie" value="${escapeHtml(rev && rev.numero_serie || '')}" placeholder="Auto desde catálogo"></div>
      <div class="form-row">
        <div class="form-group"><label>Entregado</label>
          <select id="rm-entregado">
            <option value="No" ${!rev || rev.entregado === 'No' ? 'selected' : ''}>No</option>
            <option value="Si" ${rev && rev.entregado === 'Si' ? 'selected' : ''}>Sí</option>
          </select>
        </div>
        <div class="form-group"><label>Prueba</label>
          <select id="rm-prueba">
            <option value="En Proceso" ${!rev || rev.prueba === 'En Proceso' ? 'selected' : ''}>En Proceso</option>
            <option value="Finalizada" ${rev && rev.prueba === 'Finalizada' ? 'selected' : ''}>Finalizada</option>
          </select>
        </div>
      </div>
      <div class="form-group"><label>Comentarios</label><textarea id="rm-coment" rows="2">${escapeHtml(rev && rev.comentarios || '')}</textarea></div>
      <div class="form-actions">
        <button type="button" class="btn primary" id="m-save"><i class="fas fa-save"></i> Guardar</button>
        <button type="button" class="btn" id="modal-btn-cancel">Cancelar</button>
      </div>`;
    openModal(isNew ? 'Nueva revisión de máquina' : 'Editar revisión', body);
    const maqSel = qs('#rm-maquina');
    if (maqSel) {
      maqSel.addEventListener('change', () => {
        const opt = maqSel.options[maqSel.selectedIndex];
        if (opt && opt.value) {
          const catEl = qs('#rm-cat');
          const rawCat = (opt.dataset.cat || '').trim();
          if (catEl) {
            if (rawCat && catNames.includes(rawCat)) catEl.value = rawCat;
            else if (rawCat) {
              const has = Array.from(catEl.options).some(o => o.value === rawCat);
              if (!has) {
                const o = document.createElement('option');
                o.value = rawCat;
                o.textContent = rawCat + ' (catálogo)';
                catEl.insertBefore(o, catEl.firstChild);
              }
              catEl.value = rawCat;
            } else if (catNames.length) catEl.value = catNames[0];
          }
          qs('#rm-modelo').value = opt.dataset.modelo || '';
          qs('#rm-serie').value = opt.dataset.serie || '';
          // Si no entregado, prueba = En Proceso
          if (qs('#rm-entregado').value === 'No') qs('#rm-prueba').value = 'En Proceso';
        }
      });
    }
    qs('#m-save').onclick = async () => {
      const payload = {
        maquina_id: qs('#rm-maquina').value || null,
        categoria: qs('#rm-cat').value.trim() || null,
        modelo: qs('#rm-modelo').value.trim() || null,
        numero_serie: qs('#rm-serie').value.trim() || null,
        entregado: qs('#rm-entregado').value,
        prueba: qs('#rm-prueba').value,
        comentarios: qs('#rm-coment').value.trim() || null,
      };
      // Si no entregado → prueba siempre "En Proceso"
      if (payload.entregado === 'No') payload.prueba = 'En Proceso';
      try {
        if (isNew) await fetchJson(API + '/revision-maquinas', { method: 'POST', body: JSON.stringify(payload) });
        else await fetchJson(API + '/revision-maquinas/' + rev.id, { method: 'PUT', body: JSON.stringify(payload) });
        qs('#modal').classList.add('hidden');
        showToast('Guardado correctamente.', 'success');
        loadRevisionMaquinas();
      } catch (e) { showToast(parseApiError(e), 'error'); }
    };
  }

  // ----- TARIFAS -----
  let tarifasCache = {};
  async function loadTarifas() {
    try {
      const data = await fetchJson(API + '/tarifas');
      tarifasCache = data || {};
      // Guardar en localStorage para uso offline en Ventas
      try { localStorage.setItem('tarifas_cache', JSON.stringify(tarifasCache)); } catch (_) {}
      // Poblar inputs
      document.querySelectorAll('.tarifa-input').forEach(inp => {
        const key = inp.dataset.key;
        if (key && tarifasCache[key] !== undefined) inp.value = tarifasCache[key];
      });
      document.querySelectorAll('.tarifa-input-text').forEach(inp => {
        const key = inp.dataset.key;
        if (key && tarifasCache[key] !== undefined) inp.value = tarifasCache[key];
      });
      // Sincronizar notas de cómo se calculan
      const updateNota = (id, key, fmt) => {
        const el = qs(id);
        if (el && tarifasCache[key]) el.textContent = fmt ? fmt(tarifasCache[key]) : tarifasCache[key];
      };
      if (canViewCommissions()) {
        updateNota('#nota-comision-ref', 'comision_ref');
        updateNota('#nota-comision-maq', 'comision_maq_david');
        updateNota('#nota-bono-20k', 'bono_20k', v => Number(v).toLocaleString('es-MX'));
        updateNota('#nota-bono-40k', 'bono_40k', v => Number(v).toLocaleString('es-MX'));
        updateNota('#nota-bono-dia', 'bono_dia', v => Number(v).toLocaleString('es-MX'));
      }
    } catch (e) { console.error(e); }
  }

  const btnSaveTarifas = qs('#btn-save-tarifas');
  if (btnSaveTarifas) {
    btnSaveTarifas.addEventListener('click', async () => {
      const updates = {};
      document.querySelectorAll('.tarifa-input').forEach(inp => {
        if (inp.dataset.key) updates[inp.dataset.key] = inp.value;
      });
      document.querySelectorAll('.tarifa-input-text').forEach(inp => {
        if (inp.dataset.key) updates[inp.dataset.key] = inp.value;
      });
      // Campos con id fijos
      ['tarifa-comision-ref','tarifa-comision-svc','tarifa-comision-maq-david','tarifa-bono-20k','tarifa-bono-40k','tarifa-bono-dia'].forEach(id => {
        const el = qs('#' + id);
        if (el) {
          const key = id.replace('tarifa-', '').replace(/-/g, '_');
          updates[key] = el.value;
        }
      });
      try {
        await fetchJson(API + '/tarifas', { method: 'PUT', body: JSON.stringify(updates) });
        tarifasCache = { ...tarifasCache, ...updates };
        try { localStorage.setItem('tarifas_cache', JSON.stringify(tarifasCache)); } catch (_) {}
        showToast('Tarifas guardadas correctamente.', 'success');
      } catch (e) { showToast(parseApiError(e), 'error'); }
    });
  }

  // Filtros de revisión de máquinas
  qs('#filtro-entregado-rev') && qs('#filtro-entregado-rev').addEventListener('change', () => renderRevisionMaquinas(revisionMaquinasCache));
  qs('#filtro-prueba-rev') && qs('#filtro-prueba-rev').addEventListener('change', () => renderRevisionMaquinas(revisionMaquinasCache));
  qs('#nueva-revision-maq') && qs('#nueva-revision-maq').addEventListener('click', () => openModalRevisionMaquina(null));

  // Tipo de cambio Banxico: obtener al cargar y mostrar en header
  async function fetchAndShowTipoCambio() {
    try {
      const tc = await fetchJson(API + '/tipo-cambio');
      if (tc && tc.valor) {
        tipoCambioActual = Number(tc.valor);
        const el = qs('#header-slot-tc') || qs('#header-alerts');
        if (el) {
          el.innerHTML = '';
          const badge = document.createElement('span');
          badge.className = 'tc-badge';
          const fuente = tc.fuente === 'banxico' ? 'Banxico' : tc.fuente === 'exchangerate-api' ? 'ExchangeRate-API' : (tc.fuente || 'referencia');
          badge.title = `Tipo de cambio (${fuente})${tc.fecha ? ' · ' + tc.fecha : ''}`;
          badge.innerHTML = `<i class="fas fa-dollar-sign"></i> TC: $${tipoCambioActual.toFixed(2)}`;
          badge.style.cssText = 'background:var(--config-accent,#0d9488);color:#fff;padding:3px 8px;border-radius:12px;font-size:0.78rem;font-weight:600;cursor:default';
          el.appendChild(badge);
        }
      }
    } catch (_) {}
  }
  fetchAndShowTipoCambio();
  setInterval(fetchAndShowTipoCambio, 3 * 60 * 60 * 1000);
  refreshAlertasHeader();
  setInterval(refreshAlertasHeader, 3 * 60 * 1000);

  // ----- TÉCNICOS -----
  async function loadTecnicos() {
    try {
      const data = await fetchJson(API + '/tecnicos');
      tecnicosCache = toArray(data);
      renderTecnicos(tecnicosCache);
    } catch (e) { console.error(e); }
  }

  async function previewTecnico(t) {
    let full = t;
    if (t && t.id) {
      try { full = await fetchJson(API + '/tecnicos/' + t.id); } catch (_) {}
    }
    const puestoTxt = (full.puesto || full.rol || '').trim() || '—';
    const ineThumb = full.ine_thumb_url || full.ine_foto_url;
    const licThumb = full.licencia_thumb_url || full.licencia_foto_url;
    const ineOpen = full.ine_foto_url || full.ine_thumb_url;
    const licOpen = full.licencia_foto_url || full.licencia_thumb_url;
    let underHeaderHtml = '';
    if (ineThumb || licThumb) {
      const parts = [];
      if (ineThumb) {
        parts.push(
          '<div class="tec-pvc-doc"><span class="tec-pvc-doc-label">INE</span><div class="tec-pvc-doc-thumb-row">' +
          '<button type="button" class="tec-pvc-doc-thumb js-refaccion-open-media" data-url="' + escapeHtml(ineOpen) + '" title="Ver INE">' +
          '<img src="' + escapeHtml(ineThumb) + '" alt="INE" loading="lazy"></button>' +
          pvcDownloadBtnCompactHtml(null, ineOpen, 'tecnico-ine') +
          '</div></div>'
        );
      }
      if (licThumb) {
        parts.push(
          '<div class="tec-pvc-doc"><span class="tec-pvc-doc-label">Licencia</span><div class="tec-pvc-doc-thumb-row">' +
          '<button type="button" class="tec-pvc-doc-thumb js-refaccion-open-media" data-url="' + escapeHtml(licOpen) + '" title="Ver licencia">' +
          '<img src="' + escapeHtml(licThumb) + '" alt="Licencia" loading="lazy"></button>' +
          pvcDownloadBtnCompactHtml(null, licOpen, 'tecnico-licencia') +
          '</div></div>'
        );
      }
      underHeaderHtml = '<div class="tec-pvc-docs">' + parts.join('') + '</div>';
    }
    openPreviewCard({
      title: full.nombre || 'Personal',
      subtitle: [full.puesto || full.rol, full.departamento].filter(Boolean).join(' · ') || (full.ocupado ? 'En servicio' : 'Disponible'),
      icon: 'fa-hard-hat',
      color: 'linear-gradient(135deg, #0891b2 0%, #164e63 100%)',
      badge: full.activo ? 'Activo' : 'Inactivo',
      badgeClass: full.activo ? 'pvc-badge--success' : 'pvc-badge--danger',
      underHeaderHtml,
      sections: [{
        title: 'Información', icon: 'fa-user',
        fields: [
          { label: 'ID', value: full.id, icon: 'fa-hashtag' },
          { label: 'Nombre', value: full.nombre, icon: 'fa-user', full: true },
          { label: 'Puesto', value: puestoTxt, icon: 'fa-briefcase' },
          { label: 'Departamento', value: full.departamento || '—', icon: 'fa-building' },
          { label: 'Profesión', value: full.profesion || '—', icon: 'fa-graduation-cap' },
          { label: 'Vendedor', value: Number(full.es_vendedor) === 1 ? 'Sí' : 'No', icon: 'fa-handshake' },
          ...(canViewCommissions() ? [
            { label: 'Comisión % equipo', value: full.comision_maquinas_pct != null ? String(full.comision_maquinas_pct) : '—', icon: 'fa-percent' },
            { label: 'Comisión % refacciones', value: full.comision_refacciones_pct != null ? String(full.comision_refacciones_pct) : '—', icon: 'fa-percent' },
          ] : []),
          { label: 'Estado', value: full.activo ? 'Activo' : 'Inactivo', icon: 'fa-toggle-on', badge: true, badgeClass: full.activo ? 'pvc-badge--success' : 'pvc-badge--danger' },
          { label: 'Disponibilidad', value: full.ocupado ? '🔒 Ocupado' : '✓ Disponible', icon: 'fa-clock', badge: true, badgeClass: full.ocupado ? 'pvc-badge--warning' : 'pvc-badge--success' },
        ]
      }, full.habilidades ? {
        title: 'Habilidades / Especialidades', icon: 'fa-tools',
        fields: [{ label: 'Habilidades', value: full.habilidades, full: true }]
      } : null].filter(Boolean)
    });
  }
  function renderTecnicos(data) {
    const tbody = qs('#tabla-tecnicos tbody');
    if (!tbody) return;
    const q = (qs('#buscar-tecnicos')?.value || '').toLowerCase();
    const filtered = q ? data.filter(t => (t.nombre || '').toLowerCase().includes(q) || (t.habilidades || '').toLowerCase().includes(q) || (t.puesto || '').toLowerCase().includes(q) || (t.rol || '').toLowerCase().includes(q) || (t.departamento || '').toLowerCase().includes(q)) : data;
    tbody.innerHTML = '';
    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty">No hay personal registrado.</td></tr>';
      return;
    }
    const _canEdit = canEdit(); const _canDelete = canDelete();
    filtered.forEach(t => {
      const ocupadoBadge = t.ocupado ? '<span class="badge semaforo-rojo">🔒 Ocupado</span>' : '<span class="badge semaforo-verde">✓ Disponible</span>';
      const activoBadge = t.activo ? '<span class="badge semaforo-verde">Activo</span>' : '<span class="badge semaforo-gris">Inactivo</span>';
      const vendBadge = Number(t.es_vendedor) === 1 ? '<span class="badge badge-ok">Vende</span>' : '<span class="badge badge-warn">No ventas</span>';
      const tr = document.createElement('tr');
      const puestoCell = (t.puesto || t.rol || '').trim() || '—';
      const ineOpenU = t.ine_foto_url || t.ine_thumb_url;
      const licOpenU = t.licencia_foto_url || t.licencia_thumb_url;
      const ineMini = t.ine_thumb_url
        ? `<span class="tec-doc-slot-wrap"><button type="button" class="tec-doc-slot js-refaccion-open-media" data-url="${escapeHtml(t.ine_thumb_url)}" title="INE (clic para abrir)"><img src="${escapeHtml(t.ine_thumb_url)}" alt="" loading="lazy"></button>${pvcDownloadBtnCompactHtml(null, ineOpenU, 'tecnico-ine')}</span>`
        : '<span class="tec-doc-slot" title="Sin INE">—</span>';
      const licMini = t.licencia_thumb_url
        ? `<span class="tec-doc-slot-wrap"><button type="button" class="tec-doc-slot js-refaccion-open-media" data-url="${escapeHtml(t.licencia_thumb_url)}" title="Licencia (clic para abrir)"><img src="${escapeHtml(t.licencia_thumb_url)}" alt="" loading="lazy"></button>${pvcDownloadBtnCompactHtml(null, licOpenU, 'tecnico-licencia')}</span>`
        : '<span class="tec-doc-slot" title="Sin licencia">—</span>';
      tr.innerHTML = `
        <td><strong>${escapeHtml(t.nombre || '')}</strong></td>
        <td style="font-size:0.82rem">${escapeHtml(puestoCell)}</td>
        <td style="font-size:0.82rem">${escapeHtml(t.departamento || '—')}</td>
        <td>${vendBadge}</td>
        <td style="font-size:0.82rem;color:var(--text-secondary)">${escapeHtml(t.habilidades || '—')}</td>
        <td><div class="tec-personal-docs-row">${ineMini}${licMini}</div></td>
        <td>${ocupadoBadge}</td>
        <td>${activoBadge}</td>
        <td class="th-actions">
          <button type="button" class="btn small outline btn-preview-tec" data-id="${t.id}" title="Vista previa"><i class="fas fa-eye"></i></button>
          ${_canEdit ? `<button type="button" class="btn small primary btn-edit-tec" data-id="${t.id}"><i class="fas fa-edit"></i></button>` : ''}
          ${_canDelete ? `<button type="button" class="btn small danger btn-del-tec" data-id="${t.id}"><i class="fas fa-trash"></i></button>` : ''}
        </td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.btn-preview-tec').forEach(btn => {
      btn.addEventListener('click', () => { const t = tecnicosCache.find(x => String(x.id) === String(btn.dataset.id)); if (t) previewTecnico(t); });
    });
    tbody.querySelectorAll('.btn-edit-tec').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = tecnicosCache.find(x => String(x.id) === String(btn.dataset.id));
        if (t) openModalTecnico(t);
      });
    });
    tbody.querySelectorAll('.btn-del-tec').forEach(btn => {
      btn.addEventListener('click', () => {
        openConfirmModal('¿Desactivar este técnico?', async () => {
          await fetchJson(API + '/tecnicos/' + btn.dataset.id, { method: 'DELETE' });
          loadTecnicos();
        });
      });
    });
  }

  async function openModalTecnico(tec) {
    const isNew = !tec || !tec.id;
    let full = tec;
    if (tec && tec.id) {
      try { full = await fetchJson(API + '/tecnicos/' + tec.id); } catch (_) { full = tec; }
    }
    const showCom = canViewCommissions();
    const comRow = showCom ? `
      <div class="form-row">
        <div class="form-group"><label>Comisión % equipo (máquinas)</label><input type="number" id="m-tec-com-m" min="0" max="100" step="0.5" value="${full && full.comision_maquinas_pct != null ? escapeHtml(String(full.comision_maquinas_pct)) : '0'}"></div>
        <div class="form-group"><label>Comisión % refacciones</label><input type="number" id="m-tec-com-r" min="0" max="100" step="0.5" value="${full && full.comision_refacciones_pct != null ? escapeHtml(String(full.comision_refacciones_pct)) : '10'}"></div>
      </div>` : '';
    const hasIne = !!(full && (full.ine_thumb_url || full.ine_foto_url));
    const hasLic = !!(full && (full.licencia_thumb_url || full.licencia_foto_url));
    const inePrevSrc = (full && (full.ine_thumb_url || full.ine_foto_url)) || '';
    const licPrevSrc = (full && (full.licencia_thumb_url || full.licencia_foto_url)) || '';
    const inePrevRef = inePrevSrc ? registerPvcMediaUrl(inePrevSrc) : '';
    const licPrevRef = licPrevSrc ? registerPvcMediaUrl(licPrevSrc) : '';
    const body = `
      <div class="form-group"><label>Nombre *</label>
        <input type="text" id="m-tec-nombre" maxlength="100" value="${escapeHtml(full && full.nombre || '')}" placeholder="Ej. Juan Pérez" required>
      </div>
      <div class="form-group"><label>Puesto</label><input type="text" id="m-tec-puesto" maxlength="120" value="${escapeHtml((full && (full.puesto || full.rol)) || '')}" placeholder="Ej. Líder comercial, Jefe de área…"></div>
      <div class="form-row">
        <div class="form-group"><label>Departamento</label><input type="text" id="m-tec-depto" maxlength="120" value="${escapeHtml(full && full.departamento || '')}"></div>
        <div class="form-group"><label>Profesión</label><input type="text" id="m-tec-prof" maxlength="120" value="${escapeHtml(full && full.profesion || '')}"></div>
      </div>
      <div class="form-group"><label>Habilidades / Especialidades</label>
        <textarea id="m-tec-habilidades" rows="3" maxlength="500" placeholder="Ej. CNC Fanuc, Electroerosión, PLC Siemens, Soldadura MIG…">${escapeHtml(full && full.habilidades || '')}</textarea>
        <div class="hint">Separa con comas. Aparece en la tabla y en el dropdown de asignación.</div>
      </div>
      <div class="form-row tec-upload-pair">
        <div class="form-group tec-upload-box">
          <label><i class="fas fa-id-card"></i> INE (imagen)</label>
          <input type="file" id="m-tec-ine" accept="image/*">
          <div id="m-tec-ine-existing" class="${hasIne && !isNew ? '' : 'hidden'}">
            <p class="form-hint" style="margin-top:0.35rem"><i class="fas fa-image"></i> INE en sistema</p>
            <button type="button" class="js-refaccion-open-media" data-media-ref="${inePrevRef}" title="Ver INE" style="border:none;background:transparent;padding:0;cursor:zoom-in;">
              <img id="m-tec-ine-img" class="tec-upload-preview" src="${escapeHtml(inePrevSrc)}" alt="INE" loading="lazy">
            </button>
            ${pvcDownloadBtnCompactHtml(inePrevRef, null, 'tecnico-ine')}
            <button type="button" class="btn small danger outline" id="m-tec-ine-rm" style="margin-top:0.35rem"><i class="fas fa-times"></i> Quitar INE</button>
          </div>
          <img id="m-tec-ine-new" class="tec-upload-preview hidden js-refaccion-open-media" alt="Vista previa INE">
        </div>
        <div class="form-group tec-upload-box">
          <label><i class="fas fa-car"></i> Licencia de conducir</label>
          <input type="file" id="m-tec-lic" accept="image/*">
          <div id="m-tec-lic-existing" class="${hasLic && !isNew ? '' : 'hidden'}">
            <p class="form-hint" style="margin-top:0.35rem"><i class="fas fa-image"></i> Licencia en sistema</p>
            <button type="button" class="js-refaccion-open-media" data-media-ref="${licPrevRef}" title="Ver licencia" style="border:none;background:transparent;padding:0;cursor:zoom-in;">
              <img id="m-tec-lic-img" class="tec-upload-preview" src="${escapeHtml(licPrevSrc)}" alt="Licencia" loading="lazy">
            </button>
            ${pvcDownloadBtnCompactHtml(licPrevRef, null, 'tecnico-licencia')}
            <button type="button" class="btn small danger outline" id="m-tec-lic-rm" style="margin-top:0.35rem"><i class="fas fa-times"></i> Quitar licencia</button>
          </div>
          <img id="m-tec-lic-new" class="tec-upload-preview hidden js-refaccion-open-media" alt="Vista previa licencia">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>¿Vendedor?</label>
          <select id="m-tec-es-vendedor">
            <option value="0" ${full && Number(full.es_vendedor) !== 1 ? 'selected' : ''}>No</option>
            <option value="1" ${full && Number(full.es_vendedor) === 1 ? 'selected' : ''}>Sí</option>
          </select>
        </div>
      </div>
      ${comRow}
      ${!isNew ? `<div class="form-group"><label>Estado</label>
        <select id="m-tec-activo">
          <option value="1" ${full && full.activo != 0 ? 'selected' : ''}>Activo</option>
          <option value="0" ${full && full.activo == 0 ? 'selected' : ''}>Inactivo</option>
        </select>
      </div>` : ''}
      <div class="form-actions">
        <button type="button" class="btn primary" id="m-save"><i class="fas fa-save"></i> Guardar</button>
        <button type="button" class="btn" id="modal-btn-cancel">Cancelar</button>
      </div>`;
    openModal(isNew ? 'Nueva persona' : 'Editar personal', body);

    let pendingIneFull = null;
    let pendingIneThumb = null;
    let pendingLicFull = null;
    let pendingLicThumb = null;
    let ineClear = false;
    let licenciaClear = false;

    function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || ''));
        r.onerror = () => reject(new Error('lectura'));
        r.readAsDataURL(file);
      });
    }

    const ineInput = qs('#m-tec-ine');
    const licInput = qs('#m-tec-lic');
    const ineNewEl = qs('#m-tec-ine-new');
    const licNewEl = qs('#m-tec-lic-new');
    const ineEx = qs('#m-tec-ine-existing');
    const licEx = qs('#m-tec-lic-existing');

    qs('#m-tec-ine-rm')?.addEventListener('click', () => {
      ineClear = true;
      pendingIneFull = null;
      pendingIneThumb = null;
      if (ineInput) ineInput.value = '';
      if (ineNewEl) { ineNewEl.classList.add('hidden'); ineNewEl.removeAttribute('src'); }
      if (ineEx) ineEx.classList.add('hidden');
    });
    qs('#m-tec-lic-rm')?.addEventListener('click', () => {
      licenciaClear = true;
      pendingLicFull = null;
      pendingLicThumb = null;
      if (licInput) licInput.value = '';
      if (licNewEl) { licNewEl.classList.add('hidden'); licNewEl.removeAttribute('src'); }
      if (licEx) licEx.classList.add('hidden');
    });

    ineInput?.addEventListener('change', async () => {
      const file = ineInput.files && ineInput.files[0];
      if (!file || !/^image\//.test(file.type)) {
        if (file) showToast('Selecciona una imagen (JPG, PNG, etc.).', 'error');
        return;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        pendingIneFull = dataUrl;
        pendingIneThumb = await makeImageThumbDataUrl(dataUrl, 96);
        ineClear = false;
        if (ineEx) ineEx.classList.add('hidden');
        if (ineNewEl) {
          ineNewEl.src = dataUrl;
          ineNewEl.setAttribute('data-media-ref', registerPvcMediaUrl(dataUrl));
          ineNewEl.classList.remove('hidden');
        }
      } catch (_) {
        showToast('No se pudo leer la imagen de INE.', 'error');
      }
    });

    licInput?.addEventListener('change', async () => {
      const file = licInput.files && licInput.files[0];
      if (!file || !/^image\//.test(file.type)) {
        if (file) showToast('Selecciona una imagen (JPG, PNG, etc.).', 'error');
        return;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        pendingLicFull = dataUrl;
        pendingLicThumb = await makeImageThumbDataUrl(dataUrl, 96);
        licenciaClear = false;
        if (licEx) licEx.classList.add('hidden');
        if (licNewEl) {
          licNewEl.src = dataUrl;
          licNewEl.setAttribute('data-media-ref', registerPvcMediaUrl(dataUrl));
          licNewEl.classList.remove('hidden');
        }
      } catch (_) {
        showToast('No se pudo leer la imagen de licencia.', 'error');
      }
    });

    qs('#m-save').onclick = async () => {
      const nombre = qs('#m-tec-nombre')?.value.trim();
      if (!nombre) { showToast('El nombre es obligatorio.', 'error'); return; }
      const comM = canViewCommissions() ? (Number(qs('#m-tec-com-m')?.value) || 0) : (Number(full && full.comision_maquinas_pct) || 0);
      const comR = canViewCommissions() ? (Number(qs('#m-tec-com-r')?.value) || 0) : (Number(full && full.comision_refacciones_pct) || 10);
      const puestoVal = qs('#m-tec-puesto')?.value.trim() || null;
      const payload = {
        nombre,
        rol: puestoVal,
        puesto: puestoVal,
        departamento: qs('#m-tec-depto')?.value.trim() || null,
        profesion: qs('#m-tec-prof')?.value.trim() || null,
        habilidades: qs('#m-tec-habilidades')?.value.trim() || null,
        es_vendedor: qs('#m-tec-es-vendedor')?.value === '1' ? 1 : 0,
        comision_maquinas_pct: comM,
        comision_refacciones_pct: comR,
        activo: isNew ? 1 : parseInt(qs('#m-tec-activo')?.value || '1', 10),
      };
      if (pendingIneFull) {
        payload.ine_foto_url = pendingIneFull;
        payload.ine_thumb_url = pendingIneThumb || null;
      }
      if (pendingLicFull) {
        payload.licencia_foto_url = pendingLicFull;
        payload.licencia_thumb_url = pendingLicThumb || null;
      }
      if (!isNew) {
        if (ineClear) payload.ine_clear = true;
        if (licenciaClear) payload.licencia_clear = true;
      }
      try {
        if (isNew) await fetchJson(API + '/tecnicos', { method: 'POST', body: JSON.stringify(payload) });
        else await fetchJson(API + '/tecnicos/' + tec.id, { method: 'PUT', body: JSON.stringify(payload) });
        qs('#modal').classList.add('hidden');
        showToast(isNew ? 'Persona creada.' : 'Persona actualizada.', 'success');
        if (isNew) setPaginationPage('tabla-tecnicos', 0);
        loadTecnicos();
      } catch (e) { showToast(parseApiError(e) || 'No se pudo guardar.', 'error'); }
    };
  }

  qs('#btn-new-tecnico')?.addEventListener('click', () => openModalTecnico(null));
  qs('#buscar-tecnicos')?.addEventListener('input', debounce(() => renderTecnicos(tecnicosCache), 250));

  // ----- IMPORTAR XLSX REFACCIONES -----
  async function importRefaccionesXlsx(file) {
    if (!file) return;
    try {
      await ensureExcelJs();
    } catch (_) {
      showToast('No se pudo cargar la librería de Excel. Revisa la conexión.', 'error');
      return;
    }
    showToast('Leyendo archivo…', 'info');
    try {
      const buffer = await file.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);
      const ws = wb.worksheets[0];
      if (!ws) { showToast('No se encontró hoja de cálculo.', 'error'); return; }
      const rows = [];
      ws.eachRow((row, rowNum) => {
        if (rowNum === 1) return; // skip header
        const desc = (row.getCell(1).text || row.getCell(1).value || '').toString().trim();
        if (!desc) return;
        const unidad = (row.getCell(2).text || row.getCell(2).value || 'PZA').toString().trim() || 'PZA';
        const precioUsdRaw = row.getCell(3).value;
        const stockRaw = row.getCell(4).value;
        const categoria = refCategoriaLabel(row.getCell(5).value != null ? row.getCell(5).value : row.getCell(5).text) || null;
        const zona = (row.getCell(6).text || row.getCell(6).value || '').toString().trim();
        const bloque = (row.getCell(7).text || row.getCell(7).value || '').toString().trim();
        // Intentar extraer código del inicio de la descripción (números + guiones)
        const codeMatch = desc.match(/^([\d\-A-Z]+(?:\s[\d\-A-Z]+)?)\s+(.+)$/);
        const codigo = codeMatch ? codeMatch[1].trim() : desc.slice(0, 20).replace(/\s+/g, '-').toUpperCase();
        const descripcion = codeMatch ? codeMatch[2].trim() : desc;
        rows.push({
          codigo,
          descripcion,
          unidad,
          precio_usd: Number(precioUsdRaw) || 0,
          stock: Number(stockRaw) || 0,
          categoria: categoria || null,
          zona: zona || null,
          bloque: bloque || null,
          activo: 1,
        });
      });
      if (!rows.length) { showToast('No se encontraron datos en el archivo.', 'warning'); return; }
      // Mostrar preview y confirmar
      openConfirmModal(
        `Se importarán ${rows.length} refacciones. Las que ya existen (por código) serán actualizadas. ¿Continuar?`,
        async () => {
          let ok = 0, errors = 0;
          for (const r of rows) {
            try {
              // Intentar insertar; si existe (409) hacer PUT
              try {
                await fetchJson(API + '/refacciones', { method: 'POST', body: JSON.stringify(r) });
              } catch (e) {
                if (e && (String(e.message || e).includes('409') || String(e.message || e).includes('UNIQUE'))) {
                  const existing = refaccionesCache.find(x => x.codigo === r.codigo);
                  if (existing) await fetchJson(API + '/refacciones/' + existing.id, { method: 'PUT', body: JSON.stringify(r) });
                } else throw e;
              }
              ok++;
            } catch (_) { errors++; }
          }
          showToast(`Importación completada: ${ok} registros, ${errors} errores.`, errors ? 'warning' : 'success');
          loadRefacciones();
        },
        { confirmLabel: 'Cargar', confirmIcon: 'fa-file-import', confirmClass: 'btn primary' }
      );
    } catch (e) {
      showToast('Error al leer el archivo: ' + (e.message || e), 'error');
      console.error(e);
    }
  }

  qs('#import-refacciones-file')?.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      importRefaccionesXlsx(file);
      e.target.value = ''; // reset para permitir re-selección
    }
  });
  qs('#btn-import-refacciones-trigger')?.addEventListener('click', (e) => {
    e.preventDefault();
    qs('#import-refacciones-file')?.click();
  });

  // ----- EVENT LISTENERS -----
  qs('#buscar-clientes').addEventListener('input', debounce(loadClientes, 350));
  qs('#buscar-refacciones').addEventListener('input', debounce(loadRefacciones, 350));
  const toggleViewBtn = qs('#toggle-view-maquinas');
  if (toggleViewBtn) {
    toggleViewBtn.addEventListener('click', () => {
      maquinasViewMode = maquinasViewMode === 'tabla' ? 'tarjetas' : 'tabla';
      const tablaWrap = qs('#maquinas-tabla-wrap');
      const cardsWrap = qs('#maquinas-cards-wrap');
      if (maquinasViewMode === 'tarjetas') {
        tablaWrap && tablaWrap.classList.add('hidden');
        cardsWrap && cardsWrap.classList.remove('hidden');
        toggleViewBtn.innerHTML = '<i class="fas fa-table"></i> Vista tabla';
      } else {
        tablaWrap && tablaWrap.classList.remove('hidden');
        cardsWrap && cardsWrap.classList.add('hidden');
        toggleViewBtn.innerHTML = '<i class="fas fa-th-large"></i> Vista tarjetas';
      }
      applyMaquinasFiltersAndRender();
    });
  }
  bindTableFilters('tabla-clientes', applyClientesFiltersAndRender);
  bindTableFilters('tabla-refacciones', applyRefaccionesFiltersAndRender);
  (function bindRefaccionesRowMenuSingleton() {
    const tbl = qs('#tabla-refacciones');
    if (tbl && !tbl._dsToggleBound) {
      tbl._dsToggleBound = true;
      tbl.addEventListener(
        'toggle',
        function (e) {
          const t = e.target;
          if (!t || !t.classList || !t.classList.contains('ds-row-actions') || !t.open) return;
          tbl.querySelectorAll('details.ds-row-actions[open]').forEach(function (d) {
            if (d !== t) d.open = false;
          });
        },
        true
      );
    }
  })();
  document.addEventListener('click', function dsCloseRefaccionesRowMenus(e) {
    if (!e.target || !e.target.closest || !e.target.closest('#tabla-refacciones .ds-row-actions')) {
      document.querySelectorAll('#tabla-refacciones details.ds-row-actions[open]').forEach(function (d) {
        d.open = false;
      });
    }
  });
  bindTableFilters('tabla-maquinas', applyMaquinasFiltersAndRender);
  bindTableFilters('tabla-cotizaciones', applyCotizacionesFiltersAndRender);
  const cotIncluirAplicadas = qs('#cot-incluir-aplicadas');
  if (cotIncluirAplicadas) {
    try {
      if (localStorage.getItem('cot-incluir-aplicadas') === '1') cotIncluirAplicadas.checked = true;
    } catch (_) {}
    cotIncluirAplicadas.addEventListener('change', () => {
      try { localStorage.setItem('cot-incluir-aplicadas', cotIncluirAplicadas.checked ? '1' : '0'); } catch (_) {}
      applyCotizacionesFiltersAndRender();
    });
  }
  bindTableFilters('tabla-reportes', applyReportesFiltersAndRender);
  if (qs('#tabla-incidentes')) bindTableFilters('tabla-incidentes', applyIncidentesFiltersAndRender);
  bindTableFilters('tabla-bitacoras', applyBitacorasFiltersAndRender);
  bindTableFilters('tabla-mantenimientos-garantia', () => renderMantenimientoGarantiaTable());
  bindTableFilters('tabla-garantias-sin', applyGarantiasSinFiltersAndRender);
  const dashboardRefresh = qs('#dashboard-refresh');
  if (dashboardRefresh) dashboardRefresh.addEventListener('click', () => loadDashboard());
  const btnRefreshAlmacen = qs('#btn-refresh-almacen');
  if (btnRefreshAlmacen) btnRefreshAlmacen.addEventListener('click', () => loadAlmacen());
  const buscarAlmacen = qs('#buscar-almacen');
  if (buscarAlmacen) buscarAlmacen.addEventListener('input', debounce(() => renderAlmacenTable(), 250));
  const filtroSucursalAlmacen = qs('#filtro-sucursal-almacen');
  if (filtroSucursalAlmacen) filtroSucursalAlmacen.addEventListener('change', () => renderAlmacenTable());
  const dashboardGoBackups = qs('#dashboard-go-backups');
  if (dashboardGoBackups) dashboardGoBackups.addEventListener('click', () => showPanel('demo'));
  const dashboardGoExecutivePdf = qs('#dashboard-go-executive-pdf');
  if (dashboardGoExecutivePdf) dashboardGoExecutivePdf.addEventListener('click', () => window.open('/dashboard-pdf.html', '_blank'));
  const btnPrintPdf = qs('#btn-print-pdf');
  if (btnPrintPdf) btnPrintPdf.addEventListener('click', () => window.print());
  const branchSel = qs('#global-branch-filter');
  if (branchSel) {
    try { globalBranchFilter = localStorage.getItem('global-branch-filter') || ''; } catch (_) {}
    branchSel.value = globalBranchFilter;
    branchSel.addEventListener('change', function () {
      globalBranchFilter = branchSel.value || '';
      try { localStorage.setItem('global-branch-filter', globalBranchFilter); } catch (_) {}
      refreshActivePanelData({ silent: true });
      showToast(globalBranchFilter ? ('Filtro global aplicado: ' + globalBranchFilter) : 'Filtro global limpiado', 'success');
    });
  }
  qs('#nuevo-cliente').addEventListener('click', () => openModalCliente(null));
  qs('#nueva-refaccion').addEventListener('click', () => openModalRefaccion(null));
  qs('#nueva-maquina').addEventListener('click', () => openModalMaquina(null));
  qs('#nueva-cotizacion').addEventListener('click', () => openModalCotizacion(null));
  const btnNuevoIncidente = qs('#nuevo-incidente');
  if (btnNuevoIncidente) btnNuevoIncidente.addEventListener('click', () => openModalIncidente(null));
  qs('#nueva-bitacora').addEventListener('click', () => openModalBitacora(null));
  // Nuevos módulos
  const btnNuevoReporte = qs('#nuevo-reporte');
  if (btnNuevoReporte) btnNuevoReporte.addEventListener('click', () => openModalReporte(null));
  const filtroTipoReporteTop = qs('#filtro-tipo-reporte');
  if (filtroTipoReporteTop) filtroTipoReporteTop.addEventListener('change', applyReportesFiltersAndRender);
  const filtroSubtipoReporteTop = qs('#filtro-subtipo-reporte');
  if (filtroSubtipoReporteTop) filtroSubtipoReporteTop.addEventListener('change', applyReportesFiltersAndRender);
  const filtroTipoReporteTbl = qs('#tabla-reportes-filter-tipo');
  if (filtroTipoReporteTbl) filtroTipoReporteTbl.addEventListener('change', applyReportesFiltersAndRender);
  const filtroSubtipoReporteTbl = qs('#tabla-reportes-filter-subtipo');
  if (filtroSubtipoReporteTbl) filtroSubtipoReporteTbl.addEventListener('change', applyReportesFiltersAndRender);
  const btnNuevaGarantia = qs('#nueva-garantia');
  if (btnNuevaGarantia) btnNuevaGarantia.addEventListener('click', () => openModalGarantia(null));
  const btnNuevoBono = qs('#nuevo-bono');
  if (btnNuevoBono) btnNuevoBono.addEventListener('click', () => openModalBono(null));
  const btnNuevoViaje = qs('#nuevo-viaje');
  if (btnNuevoViaje) btnNuevoViaje.addEventListener('click', () => openModalViaje(null));
  const btnLiquidacion = qs('#btn-viajes-liquidacion');
  if (btnLiquidacion) btnLiquidacion.addEventListener('click', () => generarLiquidacionMensual());
  const btnGarantiasAlertas = qs('#btn-garantias-alertas');
  if (btnGarantiasAlertas) btnGarantiasAlertas.addEventListener('click', () => openModalGarantiasAlertasDetalle());
  const btnMantGarRefresh = qs('#btn-mant-gar-refresh');
  if (btnMantGarRefresh) btnMantGarRefresh.addEventListener('click', () => loadMantenimientoGarantia());
  const btnMantGarProcesar = qs('#btn-mant-gar-procesar-alertas');
  if (btnMantGarProcesar) {
    btnMantGarProcesar.addEventListener('click', async () => {
      try {
        const dryRun = !!(qs('#mant-gar-dry-run') && qs('#mant-gar-dry-run').checked);
        const r = await fetchJson(API + '/garantias-alertas/procesar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dryRun }) });
        if (dryRun) {
          showToast('Simulación: ' + (r.procesados || 0) + ' registro(s) · sin correo ni cambios en BD.', 'success');
          checkGarantiasAlertas();
        } else {
          showToast('Alertas procesadas: ' + (r.procesados || 0) + (r.errores && r.errores.length ? '. Revisa SMTP en el servidor.' : ''), r.errores && r.errores.length ? 'error' : 'success');
          loadMantenimientoGarantia();
          loadGarantias();
        }
      } catch (e) { showToast(parseApiError(e), 'error'); }
    });
  }
  const btnMantGarHoy = qs('#btn-mant-gar-hoy');
  if (btnMantGarHoy) btnMantGarHoy.addEventListener('click', () => {
    const mi = qs('#mant-gar-month');
    if (mi) mi.value = new Date().toISOString().slice(0, 7);
    try { sessionStorage.setItem('mantGarMonthTouched', '1'); } catch (_) {}
    renderMantenimientoGarantiaCalendar();
  });
  const mantGarMonth = qs('#mant-gar-month');
  if (mantGarMonth) {
    mantGarMonth.addEventListener('change', () => {
      try { sessionStorage.setItem('mantGarMonthTouched', '1'); } catch (_) {}
      renderMantenimientoGarantiaCalendar();
    });
  }
  const btnMantGarRefreshSin = qs('#btn-mant-gar-refresh-sin');
  if (btnMantGarRefreshSin) btnMantGarRefreshSin.addEventListener('click', () => loadGarantiasSinCobertura());
  const exportGarantiasSin = qs('#export-garantias-sin');
  if (exportGarantiasSin) exportGarantiasSin.addEventListener('click', () => exportToCsv(applyFilters(garantiasSinCoberturaCache, getFilterValues('#tabla-garantias-sin'), 'tabla-garantias-sin'), 'tabla-garantias-sin', 'garantias_sin_cobertura'));
  qs('.btn-empty-cot').addEventListener('click', () => openModalCotizacion(null));
  const btnEmptyInc = qs('.btn-empty-inc');
  if (btnEmptyInc) btnEmptyInc.addEventListener('click', () => openModalIncidente(null));
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
    if (q) d = d.filter(r => [r.codigo, r.descripcion, r.categoria, r.subcategoria, r.zona].some(v => normalizeForSearch(v).includes(normalizeForSearch(q))));
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
  const btnEmailDavidCom = qs('#btn-email-david-comisiones');
  if (btnEmailDavidCom) {
    btnEmailDavidCom.addEventListener('click', function () {
      if (!canViewCommissions()) return;
      const rows = davidComisionesRowsCache || [];
      if (!rows.length) {
        showToast('No hay líneas de comisión para incluir. Revisa que existan ventas aprobadas que apliquen las reglas.', 'warning');
        return;
      }
      let sumMxn = 0;
      let sumUsd = 0;
      const lines = rows.map(function (r) {
        const fakeV = { moneda: r.moneda };
        const mStr = fmtCotizacionMontoMoneda(fakeV, r.monto);
        const bStr = fmtCotizacionMontoMoneda(fakeV, r.base);
        if (r.moneda === 'USD') sumUsd += r.monto;
        else sumMxn += r.monto;
        return [r.folio, r.fecha, r.concepto, 'Base ' + bStr, r.pct + '%', mStr].join(' — ');
      });
      let tot = '';
      if (sumMxn > 0) tot += 'Total comisión MXN: ' + formatMoney(sumMxn) + '\n';
      if (sumUsd > 0) tot += 'Total comisión USD: US$' + sumUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\n';
      const body =
        'Resumen comisiones David Cantú (reglas: 15% refacciones con cliente David Cantú; 15% máquina vendida por David Cantú)\n\n' +
        lines.join('\n') +
        '\n\n' +
        tot +
        '\n—\nGenerado desde el sistema de cotizaciones.';
      const subject = 'Comisiones David Cantú — ' + new Date().toISOString().slice(0, 10);
      window.location.href = 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    });
  }
  const btnExportReportes = qs('#export-reportes');
  if (btnExportReportes) btnExportReportes.addEventListener('click', () => exportToCsv(getFilteredReportes(), 'tabla-reportes', 'reportes'));
  const expInc = qs('#export-incidentes');
  if (expInc) expInc.addEventListener('click', () => exportToCsv(enrichIncidentesForExport(applyFilters(incidentesCache, getFilterValues('#tabla-incidentes'), 'tabla-incidentes')), 'tabla-incidentes', 'incidentes'));
  const expIncX = qs('#export-excel-incidentes');
  if (expIncX) expIncX.addEventListener('click', () => exportToExcel(enrichIncidentesForExport(applyFilters(incidentesCache, getFilterValues('#tabla-incidentes'), 'tabla-incidentes')), 'tabla-incidentes', 'incidentes'));
  qs('#export-bitacoras').addEventListener('click', () => exportToCsv(enrichBitacorasForExport(applyFilters(bitacorasCache, getFilterValues('#tabla-bitacoras'), 'tabla-bitacoras')), 'tabla-bitacoras', 'bitacoras'));
  qs('#export-excel-bitacoras').addEventListener('click', () => exportToExcel(enrichBitacorasForExport(applyFilters(bitacorasCache, getFilterValues('#tabla-bitacoras'), 'tabla-bitacoras')), 'tabla-bitacoras', 'bitacoras'));

  function updateHeaderUrgencies() {
    const slot = qs('#header-slot-urgent');
    if (!slot) return;
    slot.innerHTML = '';
    let urgent = 0;
    (incidentesCache || []).forEach(inc => {
      const d = getDiasRestantesSemaphore(inc);
      if (d.dias !== null && d.dias <= 3) urgent++;
    });
    if (urgent === 0) return;
    const a = document.createElement('a');
    a.href = '#';
    a.className = 'alert-badge alert-urgent';
    a.id = 'header-alert-incidentes';
    a.setAttribute('role', 'button');
    a.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${urgent} incidente${urgent !== 1 ? 's' : ''} por vencer`;
    a.addEventListener('click', function (e) {
      e.preventDefault();
      showPanel('bitacoras');
    });
    slot.appendChild(a);
    try {
      if (typeof showUrgentNotificationIfGranted === 'function' && !sessionStorage.getItem('notif-urgent-shown')) {
        showUrgentNotificationIfGranted();
        sessionStorage.setItem('notif-urgent-shown', '1');
      }
    } catch (_) {}
  }

  async function openCentroAlertasModal() {
    showLoading();
    try {
      const data = await fetchJson(API + '/alertas');
      const items = data.items || [];
      const html = items.length === 0
        ? '<p class="hint">No hay alertas en este momento.</p>'
        : `<ul class="alertas-centro-list" style="list-style:none;padding:0;margin:0;max-height:60vh;overflow:auto;">${items.map(it => `<li style="padding:10px 0;border-bottom:1px solid var(--border-color,#e5e7eb);"><strong>${escapeHtml(it.titulo || '')}</strong><br><span style="color:var(--text-muted,#64748b);font-size:0.9rem;">${escapeHtml(it.detalle || '')}</span></li>`).join('')}</ul>`;
      openModal('Centro de alertas', html);
    } catch (e) {
      showToast(parseApiError(e) || 'No se pudieron cargar las alertas.', 'error');
    } finally {
      hideLoading();
    }
  }

  async function refreshAlertasHeader() {
    const slot = qs('#header-slot-alertas');
    if (!slot) return;
    try {
      const data = await fetchJson(API + '/alertas');
      const n = (data.items || []).length;
      slot.innerHTML = '';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'alert-badge' + (n > 0 ? '' : '');
      btn.id = 'btn-header-centro-alertas';
      btn.title = 'Ver alertas de inventario e incidentes';
      btn.style.cssText = 'border:none;font:inherit;cursor:pointer;';
      btn.innerHTML = n > 0
        ? `<i class="fas fa-bell"></i> Alertas (${n})`
        : `<i class="fas fa-bell"></i> Alertas`;
      btn.addEventListener('click', (e) => { e.preventDefault(); openCentroAlertasModal(); });
      slot.appendChild(btn);
    } catch (_) { /* silencioso en header */ }
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      const hub = qs('#admin-hub-overlay');
      if (hub && !hub.classList.contains('hidden')) {
        closeAdminHubOverlay();
        return;
      }
      const pm = qs('#header-profile-menu');
      if (pm && !pm.classList.contains('hidden')) {
        closeHeaderProfileMenu();
        return;
      }
      const modal = qs('#modal');
      if (modal && !modal.classList.contains('hidden')) modal.classList.add('hidden');
    }
    const inInput = document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].indexOf(document.activeElement.tagName) >= 0;
    if (!inInput && (e.ctrlKey || e.metaKey)) {
      const tabMap = { '0': 'dashboards', '1': 'clientes', '2': 'refacciones', '3': 'maquinas', '4': 'cotizaciones', '5': 'bonos', '6': 'bitacoras', '7': 'acerca' };
      const uK = getSessionUser();
      if (serverConfig.auditUi && uK && uK.role === 'admin') tabMap['8'] = 'auditoria';
      const tab = tabMap[e.key];
      if (tab) {
        e.preventDefault();
        if (tab === 'cotizaciones' && !canAccessCotizaciones()) return;
        showPanel(tab);
      }
    }
    if (!inInput && e.key === 'k' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      openCommandPalette();
    }
    if (!inInput && (e.key === '?' || (e.key === '/' && (e.ctrlKey || e.metaKey)))) {
      e.preventDefault();
      openShortcutsModal();
    }
  });

  function openShortcutsModal() {
    const html = `
      <ul class="shortcuts-list" style="list-style:none;padding:0;margin:0;">
        <li><kbd>Ctrl</kbd>+<kbd>0</kbd> … Dashboards</li>
        <li><kbd>Ctrl</kbd>+<kbd>1</kbd> … Clientes</li>
        <li><kbd>Ctrl</kbd>+<kbd>2</kbd> … Refacciones</li>
        <li><kbd>Ctrl</kbd>+<kbd>3</kbd> … Máquinas</li>
        <li><kbd>Ctrl</kbd>+<kbd>4</kbd> … Cotizaciones</li>
        <li><kbd>Ctrl</kbd>+<kbd>5</kbd> … Bonos</li>
        <li><kbd>Ctrl</kbd>+<kbd>6</kbd> … Bitácora de horas</li>
        <li><kbd>Ctrl</kbd>+<kbd>7</kbd> … Acerca de</li>
        <li><kbd>Ctrl</kbd>+<kbd>8</kbd> … Auditoría (solo admin, si está activa la autenticación)</li>
        <li><kbd>Ctrl</kbd>+<kbd>K</kbd> … Búsqueda global (paleta de comandos)</li>
        <li><kbd>Ctrl</kbd>+<kbd>/</kbd> o <kbd>?</kbd> … Ver esta ayuda</li>
        <li><kbd>Esc</kbd> … Cerrar modal o paleta</li>
      </ul>
      <p class="hint" style="margin-top:1rem;">En Mac usa <kbd>Cmd</kbd> en lugar de <kbd>Ctrl</kbd>.</p>
    `;
    openModal('Atajos de teclado', html);
  }

  const THEME_STORAGE_KEY = 'cotizacion-theme';
  /** Apariencia: `dark` = industrial (luna), `light` = velos claros sobre el mismo fondo (sol). */
  const VALID_THEMES = ['light', 'dark'];
  function normalizeTheme(t) {
    return VALID_THEMES.indexOf(t) >= 0 ? t : 'dark';
  }
  function getTheme() {
    try {
      const raw = localStorage.getItem(THEME_STORAGE_KEY);
      if (raw === 'light' || raw === 'dark') return raw;
    } catch (_) {}
    return 'dark';
  }
  function applyModalThemeToBox(box) {
    if (!box) return;
    box.classList.remove('modal-box--theme-dark', 'modal-box--theme-industrial');
    if (getTheme() === 'dark') box.classList.add('modal-box--theme-industrial');
  }
  function syncOpenModalsTheme() {
    [['#modal', '#modal .modal-box'], ['#modal-stack', '#modal-stack .modal-box'], ['#confirm-modal', '#confirm-modal .modal-box']].forEach(
      ([wrapSel, boxSel]) => {
        const wrap = qs(wrapSel);
        const box = qs(boxSel);
        if (wrap && box && !wrap.classList.contains('hidden')) applyModalThemeToBox(box);
      }
    );
  }
  function setTheme(mode) {
    mode = normalizeTheme(mode);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch (_) {}
    document.body.classList.remove('appearance-light', 'dark-theme', 'dark-high-contrast');
    document.body.classList.add('theme-industrial');
    if (mode === 'light') document.body.classList.add('appearance-light');
    syncOpenModalsTheme();
    syncThemeColorMeta();
    try { syncThemeToggleButtonUi(); } catch (_) {}
  }
  function syncThemeColorMeta() {
    const m = qs('#meta-theme-color');
    if (!m) return;
    m.setAttribute('content', getTheme() === 'light' ? '#f8fafc' : '#0f172a');
  }
  function initTheme() {
    setTheme(getTheme());
  }
  const logoutBtn = qs('#btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      clearAuthSession();
      if (serverConfig.authRequired) {
        location.reload();
        return;
      }
      updateAuditTabVisibility();
      syncSessionHeader();
      location.reload();
    });
  }
  wireHeaderProfileAndAdminHub();

  /** Primera visita: tips rápidos (se guarda al cerrar el modal) */
  function startGuidedTour() {
    const stepsAll = [
      { panel: 'dashboards', title: 'Dashboard ejecutivo', text: 'Aquí ves KPIs, scorecards, comparativos y gráficas. Puedes cruzar filtros con clics como en BI.', icon: 'fa-chart-pie', gradient: 'g-teal', bullets: ['Cruza filtros por entidad y periodo', 'Monitorea indicadores semanales/mensuales', 'Accede rápido a respaldos y reportes'] },
      { panel: 'clientes', title: 'Catálogo de clientes', text: 'Registra clientes, RFC, ciudad y contacto. La ciudad alimenta el filtro global por sucursal.', icon: 'fa-users', gradient: 'g-blue', bullets: ['Alta rápida con validaciones', 'Datos listos para cotizaciones/incidentes', 'Ciudad usada para filtro global'] },
      { panel: 'cotizaciones', title: 'Cotizaciones profesionales', text: 'Crea y exporta cotizaciones. Desde aquí también puedes generar PDF cliente o interno.', icon: 'fa-file-invoice-dollar', gradient: 'g-indigo', bullets: ['Flujo de creación y edición ágil', 'PDF de una página optimizado A4', 'Vista previa antes de imprimir'] },
      { panel: 'bonos', title: 'Bonos de capacitación', text: 'Bonos ligados a reportes de servicio y al personal.', icon: 'fa-award', gradient: 'g-orange', bullets: ['Montos y estados de pago', 'Asociación a reporte', 'Sin mezclar con viáticos'] },
      { panel: 'bitacoras', title: 'Bitácora de horas', text: 'Registra actividades y horas por incidente/cotización para trazabilidad.', icon: 'fa-clock', gradient: 'g-violet', bullets: ['Historial técnico por actividad', 'Base para control de productividad', 'Reporte PDF cliente/interno'] },
      { panel: 'demo', title: 'Respaldos y persistencia', text: 'Aquí gestionas estado de persistencia, backups manuales y automáticos.', icon: 'fa-shield-halved', gradient: 'g-slate', bullets: ['Exporta/importa respaldo JSON', 'Backups automáticos con retención', 'Estado de almacenamiento en tiempo real'] },
    ];
    const steps = stepsAll.filter(function (s) {
      return s.panel !== 'demo' || canAccessDemoAdminPanel();
    });
    let idx = 0;
    function draw() {
      const s = steps[idx];
      showPanel(s.panel, { skipLoad: false });
      const html = `
        <div class="tour-card ${escapeHtml(s.gradient)}">
          <div class="tour-media">
            <div class="tour-media-icon"><i class="fas ${escapeHtml(s.icon)}"></i></div>
            <div class="tour-media-title">${escapeHtml(s.title)}</div>
            <div class="tour-media-caption">Paso ${idx + 1} de ${steps.length}</div>
          </div>
          <div class="tour-content">
            <p class="tour-lead">${escapeHtml(s.text)}</p>
            <ul class="tour-bullets">
              ${(s.bullets || []).map(b => `<li><i class="fas fa-check-circle"></i><span>${escapeHtml(b)}</span></li>`).join('')}
            </ul>
            <div class="tour-progress">
              <div class="tour-progress-bar"><span style="width:${Math.round(((idx + 1) / steps.length) * 100)}%"></span></div>
              <span class="tour-progress-label">${idx + 1}/${steps.length}</span>
            </div>
            <div class="form-actions" style="margin-top:0.8rem;">
              <button type="button" class="btn" id="tour-prev" ${idx === 0 ? 'disabled' : ''}>Anterior</button>
              <button type="button" class="btn primary" id="tour-next">${idx === steps.length - 1 ? 'Finalizar tour' : 'Siguiente'}</button>
            </div>
          </div>
        </div>`;
      const closeFn = openModal('Tour guiado', html);
      const prev = qs('#tour-prev');
      const next = qs('#tour-next');
      if (prev) prev.addEventListener('click', function () { if (idx > 0) { idx--; closeFn(); draw(); } });
      if (next) next.addEventListener('click', function () {
        if (idx >= steps.length - 1) { closeFn(); showToast('Tour finalizado. Puedes repetirlo desde el ícono de ruta.', 'success'); return; }
        idx++; closeFn(); draw();
      });
    }
    draw();
  }

  function initOnboarding() {
    try { if (localStorage.getItem('cotizacion-onboarding-v1')) return; } catch (_) { return; }
    setTimeout(function () {
      const html = `
      <div class="onboarding-welcome">
        <p class="onboarding-lead">Así sacas provecho al sistema desde el primer minuto:</p>
        <ul class="onboarding-list">
          <li><i class="fas fa-keyboard"></i> <span>Atajos <kbd>Ctrl</kbd>+<kbd>1</kbd>…<kbd>6</kbd> por sección, <kbd>Ctrl</kbd>+<kbd>7</kbd> Acerca de, <kbd>Ctrl</kbd>+<kbd>8</kbd> Auditoría (admin con login), <kbd>Ctrl</kbd>+<kbd>K</kbd> búsqueda global.</span></li>
          <li><i class="fas fa-moon"></i> <span>Tema claro u oscuro con el botón junto a los atajos.</span></li>
          <li><i class="fas fa-robot"></i> <span>Agente de soporte (robot abajo a la derecha): preguntas sobre cotizaciones, incidentes y más.</span></li>
        </ul>
        <p class="hint" style="margin-top:1rem;">Vuelve a ver atajos con <kbd>?</kbd> o <kbd>Ctrl</kbd>+<kbd>/</kbd>.</p>
        <div class="form-actions" style="margin-top:1.25rem;">
          <button type="button" class="btn primary" id="onboarding-dismiss">Entendido, empezar</button>
        </div>
      </div>`;
      const closeFn = openModal('Bienvenido', html, function () {
        try { localStorage.setItem('cotizacion-onboarding-v1', '1'); } catch (_) {}
      });
      const btn = qs('#onboarding-dismiss');
      if (btn) btn.addEventListener('click', function () { closeFn(); });
    }, 1100);
  }

  function restoreLastTabOrDefault() {
    try {
      let last = localStorage.getItem(LAST_TAB_KEY);
      if (last === 'incidentes') {
        try { localStorage.removeItem(LAST_TAB_KEY); } catch (_) {}
        last = null;
      }
      if (last === 'auditoria') {
        const u = getSessionUser();
        if (serverConfig.auditUi && u && u.role === 'admin') {
          showPanel('auditoria');
          return;
        }
      }
      if (last === 'usuarios') {
        const u = getSessionUser();
        if (serverConfig.authRequired && u && u.role === 'admin') {
          showPanel('usuarios');
          return;
        }
      }
      if ((last === 'bonos' || last === 'viajes') && !canViewCommissions()) {
        try { localStorage.removeItem(LAST_TAB_KEY); } catch (_) {}
        last = null;
      }
      if (last === 'prospeccion' && !canAccessAdminOnlyModules()) {
        try { localStorage.removeItem(LAST_TAB_KEY); } catch (_) {}
        last = null;
      }
      if (last === 'cotizaciones' && !canAccessCotizaciones()) {
        try { localStorage.removeItem(LAST_TAB_KEY); } catch (_) {}
        last = null;
      }
      if (last === 'demo' && !canAccessDemoAdminPanel()) {
        try { localStorage.removeItem(LAST_TAB_KEY); } catch (_) {}
        last = null;
      }
      if (last && VALID_TABS.indexOf(last) >= 0) showPanel(last);
    } catch (_) {}
  }

  function openCommandPalette() {
    const wrap = qs('#command-palette');
    const input = qs('#command-palette-input');
    const results = qs('#command-palette-results');
    if (!wrap || !input || !results) return;
    wrap.classList.remove('hidden');
    input.value = '';
    input.focus();
    const sections = [
      { id: 'dashboards', label: 'Dashboards', icon: 'fa-chart-pie' },
      { id: 'clientes', label: 'Clientes', icon: 'fa-users' },
      { id: 'refacciones', label: 'Refacciones', icon: 'fa-cogs' },
      { id: 'maquinas', label: 'Máquinas', icon: 'fa-industry' },
      { id: 'almacen', label: 'Almacén', icon: 'fa-warehouse' },
      ...(canAccessCotizaciones() ? [{ id: 'cotizaciones', label: 'Cotizaciones', icon: 'fa-file-invoice-dollar' }] : []),
      { id: 'bonos', label: 'Bonos', icon: 'fa-award' },
      { id: 'viajes', label: 'Viajes', icon: 'fa-plane' },
      { id: 'bitacoras', label: 'Bitácora de horas', icon: 'fa-clock' },
      ...(canAccessDemoAdminPanel() ? [{ id: 'demo', label: 'Cargar demo', icon: 'fa-database' }] : []),
      { id: 'acerca', label: 'Acerca de', icon: 'fa-info-circle' },
    ];
    const uPal = getSessionUser();
    const bonosIdx = sections.findIndex(s => s.id === 'bonos');
    if (canAccessAdminOnlyModules() && bonosIdx >= 0) {
      sections.splice(
        bonosIdx,
        0,
        { id: 'prospeccion', label: 'Prospección', icon: 'fa-map-marked-alt' },
        { id: 'tarifas', label: 'Tarifas', icon: 'fa-tags' },
        { id: 'tecnicos', label: 'Personal / Técnicos', icon: 'fa-users' }
      );
    }
    let insertBeforeAcerca = sections.findIndex(s => s.id === 'acerca');
    if (insertBeforeAcerca < 0) insertBeforeAcerca = sections.length;
    if (serverConfig.auditUi && uPal && uPal.role === 'admin') {
      sections.splice(insertBeforeAcerca, 0, { id: 'auditoria', label: 'Auditoría (admin)', icon: 'fa-clipboard-list' });
      insertBeforeAcerca++;
    }
    if (serverConfig.authRequired && uPal && uPal.role === 'admin') {
      sections.splice(insertBeforeAcerca, 0, { id: 'usuarios', label: 'Usuarios y permisos (admin)', icon: 'fa-user-shield' });
    }
    function render(q) {
      const qn = (q || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const sectionItems = sections.filter(s => !qn || s.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(qn)).map(s => ({ type: 'section', ...s }));
      const clientItems = (clientesCache || []).filter(c => !qn || (c.nombre || '').toLowerCase().includes(qn) || (c.codigo || '').toLowerCase().includes(qn)).slice(0, 5).map(c => ({ type: 'cliente', id: c.id, label: c.nombre, meta: c.codigo, icon: 'fa-user' }));
      const cotItems = canAccessCotizaciones()
        ? (cotizacionesCache || []).filter(c => !qn || (c.folio || '').toLowerCase().includes(qn)).slice(0, 5).map(c => ({ type: 'cotizacion', id: c.id, label: c.folio, meta: c.cliente_nombre, icon: 'fa-file-invoice' }))
        : [];
      const incItems = (incidentesCache || []).filter(i => !qn || (i.folio || '').toLowerCase().includes(qn)).slice(0, 5).map(i => ({ type: 'incidente', id: i.id, label: i.folio, meta: i.cliente_nombre, icon: 'fa-exclamation-triangle' }));
      const refItems = (refaccionesCache || []).filter(r => !qn || (r.codigo || '').toLowerCase().includes(qn) || (r.descripcion || '').toLowerCase().includes(qn)).slice(0, 5).map(r => ({ type: 'refaccion', id: r.id, label: r.codigo || 'Refacción', meta: r.descripcion, icon: 'fa-cog' }));
      const maqItems = (maquinasCache || []).filter(m => !qn || (m.nombre || '').toLowerCase().includes(qn) || (m.cliente_nombre || '').toLowerCase().includes(qn)).slice(0, 5).map(m => ({ type: 'maquina', id: m.id, label: m.nombre, meta: m.cliente_nombre, icon: 'fa-industry' }));
      const bitItems = (bitacorasCache || []).filter(b => !qn || (b.tecnico || '').toLowerCase().includes(qn) || (b.incidente_folio || '').toLowerCase().includes(qn)).slice(0, 5).map(b => ({ type: 'bitacora', id: b.id, label: b.incidente_folio || ('Bitácora #' + b.id), meta: b.tecnico, icon: 'fa-clock' }));
      const all = [...sectionItems, ...clientItems, ...cotItems, ...incItems, ...refItems, ...maqItems, ...bitItems];
      results.innerHTML = all.length ? all.map((it, idx) => {
        const meta = it.meta ? `<span class="command-palette-item-meta">${escapeHtml(it.meta)}</span>` : '';
        if (it.type === 'section') return `<button type="button" class="command-palette-item" data-action="panel" data-id="${escapeHtml(it.id)}"><i class="fas ${it.icon}"></i> ${escapeHtml(it.label)}</button>`;
        if (it.type === 'cliente') return `<button type="button" class="command-palette-item" data-action="edit-cliente" data-id="${it.id}"><i class="fas ${it.icon}"></i> ${escapeHtml(it.label)} ${meta}</button>`;
        if (it.type === 'cotizacion') return `<button type="button" class="command-palette-item" data-action="edit-cotizacion" data-id="${it.id}"><i class="fas ${it.icon}"></i> ${escapeHtml(it.label)} ${meta}</button>`;
        if (it.type === 'incidente') return `<button type="button" class="command-palette-item" data-action="edit-incidente" data-id="${it.id}"><i class="fas ${it.icon}"></i> ${escapeHtml(it.label)} ${meta}</button>`;
        if (it.type === 'refaccion') return `<button type="button" class="command-palette-item" data-action="edit-refaccion" data-id="${it.id}"><i class="fas ${it.icon}"></i> ${escapeHtml(it.label)} ${meta}</button>`;
        if (it.type === 'maquina') return `<button type="button" class="command-palette-item" data-action="edit-maquina" data-id="${it.id}"><i class="fas ${it.icon}"></i> ${escapeHtml(it.label)} ${meta}</button>`;
        if (it.type === 'bitacora') return `<button type="button" class="command-palette-item" data-action="edit-bitacora" data-id="${it.id}"><i class="fas ${it.icon}"></i> ${escapeHtml(it.label)} ${meta}</button>`;
        return '';
      }).join('') : '<p style="padding:1rem;color:#64748b;">Sin resultados</p>';
      results.querySelectorAll('.command-palette-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const action = btn.dataset.action;
          const id = btn.dataset.id;
          wrap.classList.add('hidden');
          if (action === 'panel') showPanel(id);
          if (action === 'edit-cliente' && id) { showPanel('clientes'); setTimeout(() => openModalCliente(clientesCache.find(c => c.id == id)), 100); }
          if (action === 'edit-cotizacion' && id) { showPanel('cotizaciones'); setTimeout(() => editCotizacion(id), 100); }
          if (action === 'edit-incidente' && id) { showPanel('bitacoras'); setTimeout(() => editIncidente(id), 100); }
          if (action === 'edit-refaccion' && id) { showPanel('refacciones'); setTimeout(() => openModalRefaccion(refaccionesCache.find(r => r.id == id)), 100); }
          if (action === 'edit-maquina' && id) { showPanel('maquinas'); setTimeout(() => openModalMaquina(maquinasCache.find(m => m.id == id)), 100); }
          if (action === 'edit-bitacora' && id) { showPanel('bitacoras'); setTimeout(() => editBitacora(id), 100); }
        });
      });
    }
    render('');
    input.addEventListener('input', () => render(input.value));
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { wrap.classList.add('hidden'); return; }
      if (ev.key === 'Enter') {
        const first = results.querySelector('.command-palette-item');
        if (first) first.click();
      }
    });
    wrap.addEventListener('click', (ev) => { if (ev.target === wrap) wrap.classList.add('hidden'); });
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').then((reg) => {
      try { reg.update(); } catch (_) {}
    }).catch(() => {});
  }

  const offlineBanner = qs('#offline-banner');
  function updateOfflineBanner() {
    if (!offlineBanner) return;
    if (navigator.onLine) offlineBanner.classList.add('hidden');
    else offlineBanner.classList.remove('hidden');
  }
  updateOfflineBanner();
  window.addEventListener('online', updateOfflineBanner);
  window.addEventListener('offline', updateOfflineBanner);

  const shortcutsBtn = qs('#shortcuts-btn');
  if (shortcutsBtn) shortcutsBtn.addEventListener('click', openShortcutsModal);
  const notifBtn = qs('#btn-notifications');
  const notifPanel = qs('#notifications-panel');
  const notifClear = qs('#notifications-clear');
  const notifRangePreset = qs('#notifications-range-preset');
  const notifDateFrom = qs('#notifications-date-from');
  const notifDateTo = qs('#notifications-date-to');
  const notifExportCsv = qs('#notifications-export-csv');
  const notifExportPdf = qs('#notifications-export-pdf');
  if (notifBtn && notifPanel) {
    const notifOriginalParent = notifPanel.parentElement;
    const notifOriginalNext = notifPanel.nextSibling;
    function mountNotificationsPanel() {
      if (notifPanel.parentElement !== document.body) document.body.appendChild(notifPanel);
    }
    function unmountNotificationsPanel() {
      if (!notifOriginalParent || notifPanel.parentElement === notifOriginalParent) return;
      if (notifOriginalNext && notifOriginalNext.parentNode === notifOriginalParent) notifOriginalParent.insertBefore(notifPanel, notifOriginalNext);
      else notifOriginalParent.appendChild(notifPanel);
    }
    function positionNotificationsPanel() {
      if (notifPanel.classList.contains('hidden')) return;
      mountNotificationsPanel();
      const r = notifBtn.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const panelW = Math.min(560, vw - 24);
      const left = Math.max(12, Math.min(vw - panelW - 12, r.right - panelW));
      const desiredTop = r.bottom + 8;
      const panelH = Math.max(260, Math.min(520, vh - desiredTop - 12));
      const openUp = (vh - desiredTop - 12) < 260;
      const top = openUp ? Math.max(12, r.top - panelH - 8) : Math.min(vh - 80, desiredTop);
      notifPanel.classList.add('floating');
      notifPanel.style.left = left + 'px';
      notifPanel.style.top = top + 'px';
      notifPanel.style.width = panelW + 'px';
      notifPanel.style.maxHeight = panelH + 'px';
      const list = qs('#notifications-list');
      if (list) list.style.maxHeight = Math.max(160, panelH - 86) + 'px';
    }
    function hideNotificationsPanel() {
      notifPanel.classList.add('hidden');
      notifPanel.classList.remove('floating');
      notifPanel.style.left = '';
      notifPanel.style.top = '';
      notifPanel.style.width = '';
      notifPanel.style.maxHeight = '';
      const list = qs('#notifications-list');
      if (list) list.style.maxHeight = '';
      unmountNotificationsPanel();
    }
    notifBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      notifPanel.classList.toggle('hidden');
      if (notifPanel.classList.contains('hidden')) { hideNotificationsPanel(); return; }
      renderNotificationsPanel();
      markNotificationsRead();
      positionNotificationsPanel();
    });
    document.addEventListener('click', function (e) {
      if (notifPanel.classList.contains('hidden')) return;
      if (e.target === notifBtn || notifBtn.contains(e.target)) return;
      if (e.target === notifPanel || notifPanel.contains(e.target)) return;
      hideNotificationsPanel();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!notifPanel.classList.contains('hidden')) hideNotificationsPanel();
    });
    window.addEventListener('resize', positionNotificationsPanel);
    window.addEventListener('scroll', positionNotificationsPanel, { passive: true });
  }
  if (notifClear) {
    notifClear.addEventListener('click', function () {
      notificationsFeed.length = 0;
      renderNotificationsPanel();
      markNotificationsRead();
    });
  }
  if (notifDateFrom) {
    notifDateFrom.addEventListener('change', function () {
      notificationsDateFrom = this.value || '';
      if (notifRangePreset) notifRangePreset.value = '';
      renderNotificationsPanel();
    });
  }
  if (notifDateTo) {
    notifDateTo.addEventListener('change', function () {
      notificationsDateTo = this.value || '';
      if (notifRangePreset) notifRangePreset.value = '';
      renderNotificationsPanel();
    });
  }
  if (notifRangePreset && notifDateFrom && notifDateTo) {
    notifRangePreset.addEventListener('change', function () {
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      let from = '';
      let to = '';
      if (this.value === 'today') {
        from = iso(now); to = iso(now);
      } else if (this.value === '7d') {
        const d = new Date(now); d.setDate(d.getDate() - 6);
        from = iso(d); to = iso(now);
      } else if (this.value === '30d') {
        const d = new Date(now); d.setDate(d.getDate() - 29);
        from = iso(d); to = iso(now);
      } else if (this.value === 'month') {
        const d = new Date(now.getFullYear(), now.getMonth(), 1);
        from = iso(d); to = iso(now);
      }
      notifDateFrom.value = from;
      notifDateTo.value = to;
      notificationsDateFrom = from;
      notificationsDateTo = to;
      renderNotificationsPanel();
    });
  }
  if (notifExportCsv) notifExportCsv.addEventListener('click', exportNotificationsCsv);
  if (notifExportPdf) notifExportPdf.addEventListener('click', exportNotificationsPdf);
  const tourBtn = qs('#btn-guided-tour');
  if (tourBtn) {
    tourBtn.addEventListener('click', function () { startGuidedTour(); });
  }

  const BACKUP_REMINDER_KEY = 'cotizacion-backup-last';
  const BACKUP_REMINDER_INTERVAL = 24 * 60 * 60 * 1000;
  function maybeShowBackupReminder() {
    const last = parseInt(localStorage.getItem(BACKUP_REMINDER_KEY) || '0', 10);
    if (Date.now() - last < BACKUP_REMINDER_INTERVAL) return;
    localStorage.setItem(BACKUP_REMINDER_KEY, String(Date.now()));
    showToast('Tip: usa "Exportar respaldo JSON" en Cargar demo para guardar copia completa de la base.', 'success');
  }

  function requestNotificationPermissionAndMaybeNotify() {
    if (!('Notification' in window) || Notification.permission === 'granted') return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().then((p) => {
        if (p === 'granted' && typeof updateHeaderUrgencies === 'function') {
          const urgent = (incidentesCache || []).filter(inc => { const d = getDiasRestantesSemaphore(inc); return d.dias !== null && d.dias <= 3; }).length;
          if (urgent > 0) new Notification('Sistema de Cotización', { body: `${urgent} incidente(s) por vencer. Revisa la sección Incidentes.`, icon: '/favicon.svg' });
        }
      });
    }
  }
  function showUrgentNotificationIfGranted() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const urgent = (incidentesCache || []).filter(inc => { const d = getDiasRestantesSemaphore(inc); return d.dias !== null && d.dias <= 3; }).length;
    if (urgent > 0) new Notification('Incidentes por vencer', { body: `Tienes ${urgent} incidente(s) por vencer o vencidos.`, icon: '/favicon.svg' });
  }

  // ----- Asistente IA: minimizable (bolita), tooltip, inactividad, unread, animaciones -----
  (function initAiChat() {
    const wrap = qs('#ai-widget-wrap');
    const widget = qs('#ai-widget');
    const fab = qs('#ai-fab');
    const nudgeEl = qs('#ai-fab-nudge');
    const nudgeClose = qs('#ai-fab-nudge-close');
    const NUDGE_SESSION_KEY = 'ai-fab-nudge-dismissed';
    const minimizeBtn = qs('#ai-minimize');
    const unreadBadge = qs('#ai-unread-badge');
    const messagesEl = qs('#ai-messages');
    const inputEl = qs('#ai-input');
    const sendBtn = qs('#ai-send');
    const attachBtn = qs('#ai-attach');
    const fileInput = qs('#ai-file-input');
    const voiceBtn = qs('#ai-voice');
    if (!wrap || !widget || !messagesEl || !inputEl || !sendBtn) return;

    const chatHistory = [];
    let lastReplyForTTS = null;
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
    let pendingFileName = null;

    function dismissFabNudge() {
      if (!nudgeEl) return;
      try { sessionStorage.setItem(NUDGE_SESSION_KEY, '1'); } catch (_) {}
      nudgeEl.classList.remove('ai-fab-nudge--visible');
      wrap.classList.remove('ai-fab-nudge-active');
      setTimeout(function () { if (nudgeEl) nudgeEl.classList.add('hidden'); }, 400);
    }
    function maybeShowFabNudge() {
      if (!nudgeEl || !fab) return;
      try { if (sessionStorage.getItem(NUDGE_SESSION_KEY)) return; } catch (_) { /* sin sessionStorage, mostrar igual */ }
      setTimeout(function () {
        if (wrap.classList.contains('expanded')) return;
        try { if (sessionStorage.getItem(NUDGE_SESSION_KEY)) return; } catch (_) {}
        nudgeEl.classList.remove('hidden');
        requestAnimationFrame(function () {
          nudgeEl.classList.add('ai-fab-nudge--visible');
          wrap.classList.add('ai-fab-nudge-active');
        });
        setTimeout(dismissFabNudge, 14000);
      }, 2600);
    }
    maybeShowFabNudge();
    if (nudgeClose) nudgeClose.addEventListener('click', function (e) { e.stopPropagation(); dismissFabNudge(); });

    function setExpanded(expanded) {
      wrap.classList.toggle('collapsed', !expanded);
      wrap.classList.toggle('expanded', expanded);
      if (expanded) {
        unreadCount = 0;
        updateUnreadBadge();
        dismissFabNudge();
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
      if (!isUser) {
        lastReplyForTTS = msg;
        if (!isUser && wrap.classList.contains('collapsed')) {
          unreadCount++;
          updateUnreadBadge();
        }
      }
    }
    function speakReply(text) {
      if (!text || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.slice(0, 500));
      u.lang = 'es-MX';
      u.rate = 0.95;
      u.onerror = () => {};
      window.speechSynthesis.speak(u);
    }
    let voiceRetryCount = 0;
    const VOICE_MAX_RETRY = 1;
    function startVoiceInput(isRetry) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        showToast('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.', 'error');
        return;
      }
      if (!window.isSecureContext) {
        showToast('El reconocimiento de voz solo funciona en HTTPS o en localhost. Abre la app desde https:// o desde http://localhost.', 'error');
        return;
      }
      if (isRetry) {
        showToast('Escuchando de nuevo… Habla ahora.', 'success');
      } else {
        showToast('Escuchando… Di tu mensaje en los próximos segundos.', 'success');
      }
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'es-MX';
      rec.maxAlternatives = 3;
      if (voiceBtn) voiceBtn.classList.add('recording');
      let spokenText = '';
      rec.onresult = function (e) {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i];
          const t = result[0] && result[0].transcript;
          if (result.isFinal && t) {
            spokenText += t;
            try { rec.stop(); } catch (_) {}
          }
        }
      };
      rec.onend = function () {
        if (voiceBtn) voiceBtn.classList.remove('recording');
        voiceRetryCount = 0;
        const txt = spokenText.trim();
        if (txt) {
          inputEl.value = (inputEl.value.trim() ? inputEl.value + ' ' : '') + txt;
          send();
        }
      };
      rec.onerror = function (e) {
        if (voiceBtn) voiceBtn.classList.remove('recording');
        if (e.error === 'aborted') return;
        if (e.error === 'no-speech' && !isRetry && voiceRetryCount < VOICE_MAX_RETRY) {
          voiceRetryCount++;
          showToast('No se detectó voz. Reintentando en 1 segundo… habla cuando veas "Escuchando de nuevo".', 'success');
          setTimeout(function () { startVoiceInput(true); }, 1000);
          return;
        }
        if (e.error === 'no-speech') {
          showToast('No se detectó voz. Pulsa el micrófono, espera a ver "Escuchando…" y habla en seguida.', 'error');
          voiceRetryCount = 0;
          return;
        }
        let msg = 'No se pudo reconocer la voz. Intenta de nuevo.';
        if (e.error === 'not-allowed') {
          msg = 'Permiso de micrófono denegado. Haz clic en el candado o ícono de la barra de direcciones y permite el micrófono para este sitio.';
        } else if (e.error === 'network') {
          msg = 'El reconocimiento de voz requiere internet. Revisa tu conexión.';
        } else if (e.error === 'audio-capture') {
          msg = 'No se pudo usar el micrófono. Comprueba que no esté en uso por otra pestaña o aplicación.';
        } else if (e.error === 'language-not-supported') {
          msg = 'Idioma no soportado en este navegador. Prueba en Chrome o Edge.';
        } else if (e.error === 'service-not-allowed') {
          msg = 'Servicio de voz no disponible. Usa Chrome o Edge y asegúrate de tener conexión a internet.';
        }
        try { console.warn('SpeechRecognition error:', e.error, e.message || ''); } catch (_) {}
        showToast(msg, 'error');
        voiceRetryCount = 0;
      };
      setTimeout(function () {
        try {
          rec.start();
        } catch (err) {
          if (voiceBtn) voiceBtn.classList.remove('recording');
          showToast('No se pudo iniciar el micrófono. Comprueba los permisos del sitio.', 'error');
        }
      }, 400);
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
    function guessChatAttachMime(name) {
      const n = String(name || '').toLowerCase();
      if (n.endsWith('.pdf')) return 'application/pdf';
      if (n.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      if (n.endsWith('.doc')) return 'application/msword';
      if (n.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      if (n.endsWith('.xls')) return 'application/vnd.ms-excel';
      if (/\.(jpe?g)$/i.test(n)) return 'image/jpeg';
      if (n.endsWith('.png')) return 'image/png';
      if (n.endsWith('.gif')) return 'image/gif';
      if (n.endsWith('.webp')) return 'image/webp';
      return '';
    }
    if (attachBtn && fileInput) {
      attachBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', function () {
        const file = this.files && this.files[0];
        if (!file) return;
        let mime = (file.type || '').toLowerCase();
        if (!mime || mime === 'application/octet-stream') mime = guessChatAttachMime(file.name) || '';
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
          pendingFileName = file.name || '';
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
      const fileNameAttach = pendingFileName;
      pendingFileBase64 = null;
      pendingFileMime = null;
      pendingFileName = null;
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
            data = await fetchJson(API + '/ai/extract-client', { method: 'POST', body: JSON.stringify({ fileBase64: fileB64, mimeType: fileMime, fileName: fileNameAttach || '' }) });
            const d = data.data || {};
            if (d.nombre || d.rfc) {
              append('Encontré datos en el archivo. Abriendo formulario de cliente para que revises y guardes.', false);
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
        } else if (data.action === 'open_cliente' && data.data) {
          setExpanded(false);
          openModalCliente(data.data);
          append(reply, false);
        } else if (data.action === 'open_incidente' && data.data) {
          setExpanded(false);
          openModalIncidente(data.data);
          append(reply, false);
        } else if (data.action === 'open_bitacora' && data.data) {
          setExpanded(false);
          openModalBitacora(data.data);
          append(reply, false);
        } else {
          append(reply, false);
        }
        chatHistory.push({ role: 'assistant', content: reply });
        while (chatHistory.length > 20) chatHistory.splice(0, 2);
        if (reply && window.speechSynthesis) speakReply(reply);
      } catch (e) {
        let msg = e.message;
        try { const o = JSON.parse(msg); if (o.error) msg = o.error; if (o.hint) msg += '\n\n' + o.hint; } catch (_) {}
        append('⚠️ ' + msg, false);
      }
      sendBtn.disabled = false;
    }
    sendBtn.addEventListener('click', send);
    inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    if (voiceBtn) voiceBtn.addEventListener('click', startVoiceInput);
  })();

  qs('#btn-seed-demo').addEventListener('click', seedDemo);
  const btnBackupExport = qs('#btn-backup-export');
  if (btnBackupExport) btnBackupExport.addEventListener('click', exportBackupJson);
  const btnBackupImport = qs('#btn-backup-import');
  const backupImportFile = qs('#backup-import-file');
  const btnBackupFilesRefresh = qs('#btn-backup-files-refresh');
  const btnBackupCreateNow = qs('#btn-backup-create-now');
  if (btnBackupFilesRefresh) btnBackupFilesRefresh.addEventListener('click', loadBackupFilesList);
  if (btnBackupCreateNow) btnBackupCreateNow.addEventListener('click', createBackupNow);
  if (btnBackupImport && backupImportFile) {
    btnBackupImport.addEventListener('click', function () { backupImportFile.click(); });
    backupImportFile.addEventListener('change', async function () {
      const file = this.files && this.files[0];
      if (!file) return;
      btnBackupImport.disabled = true;
      btnBackupImport.textContent = 'Restaurando…';
      try {
        await importBackupJsonFromFile(file);
      } catch (e) {
        showToast(parseApiError(e) || 'No se pudo restaurar el respaldo.', 'error');
      } finally {
        this.value = '';
        btnBackupImport.disabled = false;
        btnBackupImport.textContent = 'Restaurar respaldo JSON';
      }
    });
  }
  qs('#btn-seed-extra').addEventListener('click', async () => {
    const btn = qs('#btn-seed-extra');
    btn.disabled = true;
    btn.textContent = 'Cargando…';
    try {
      const data = await fetchJson(API + '/seed-demo-extra', { method: 'POST' });
      const en = data.enrichment || {};
      const enTxt =
        en.tecnicos_demo != null
          ? ` · +Personal <strong>${en.tecnicos_demo}</strong>, mant. calendario <strong>${en.mantenimientos_calendario || 0}</strong>, sin cobertura <strong>${en.garantias_sin_cobertura || 0}</strong>, bonos <strong>${en.bonos_demo || 0}</strong>`
          : '';
      qs('#seed-status').innerHTML =
        `Listo: <strong>${data.incidentes || 0}</strong> incidentes, <strong>${data.bitacoras || 0}</strong> bitácoras, <strong>${data.cotizaciones || 0}</strong> cotizaciones agregados.${enTxt}`;
      loadSeedStatus();
      if (canAccessCotizaciones()) await loadCotizaciones({ force: true });
      await loadIncidentes();
      await loadBitacoras({ force: true });
      if (typeof loadTecnicos === 'function') loadTecnicos();
      if (typeof loadMantenimientoGarantia === 'function') loadMantenimientoGarantia();
      if (typeof loadGarantiasSinCobertura === 'function') loadGarantiasSinCobertura();
      if (typeof loadBonos === 'function') loadBonos();
      if ((data.incidentes || 0) === 0 || (data.bitacoras || 0) === 0) {
        showToast('No se insertaron incidentes ni bitácoras. Los nombres de cliente y máquina en seed-demo.json deben coincidir con los de Clientes y Máquinas. Prueba "Cargar datos demo ahora" si la base estaba vacía.', 'error');
      } else {
        showPanel('bitacoras', { skipLoad: true });
      }
    } catch (e) {
      let msg = e.message;
      try { const o = JSON.parse(msg); if (o.error) msg = o.error; } catch (_) {}
      qs('#seed-status').innerHTML = '<span class="error-msg">Error: ' + escapeHtml(msg) + '</span>';
    }
    btn.disabled = false;
    btn.textContent = 'Cargar solo incidentes, bitácoras y cotizaciones demo';
  });

  const btnEnsureMaq = qs('#btn-ensure-demo-maquinas');
  if (btnEnsureMaq) {
    btnEnsureMaq.addEventListener('click', async () => {
      btnEnsureMaq.disabled = true;
      const orig = btnEnsureMaq.innerHTML;
      btnEnsureMaq.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aplicando…';
      try {
        const data = await fetchJson(API + '/demo-ensure-maquinas', { method: 'POST' });
        qs('#seed-status').innerHTML =
          `Equipos listos: se insertaron <strong>${data.inserted || 0}</strong> registro(s); total máquinas activas en catálogo: <strong>${data.maquinas_activas ?? '—'}</strong> (clientes: ${data.clientes ?? '—'}).`;
        loadSeedStatus();
        loadMaquinas({ force: true });
        fillClientesSelect();
        showToast('Equipos demo asegurados por cliente. Abre una cotización y elige cualquier cliente.', 'success');
      } catch (e) {
        let msg = e.message;
        try { const o = JSON.parse(msg); if (o.error) msg = o.error; } catch (_) {}
        showToast(msg || 'No se pudo completar.', 'error');
      }
      btnEnsureMaq.disabled = false;
      btnEnsureMaq.innerHTML = orig;
    });
  }

  const btnWipeAllSystem = qs('#btn-wipe-all-system');
  if (btnWipeAllSystem) {
    btnWipeAllSystem.addEventListener('click', async () => {
      const ok1 = window.confirm(
        '¿Borrar casi todos los datos del sistema?\n\n' +
          'Se eliminan clientes, refacciones, máquinas, cotizaciones, usuarios de la app y el resto, ' +
          'pero NO se borra Prospección (prospectos).\n\n' +
          'NO HAY VUELTA ATRÁS para lo que sí se borra. Si hay autenticación, solo un administrador puede continuar.'
      );
      if (!ok1) return;
      const phrase = window.prompt(
        'Para confirmar, escribe exactamente (mayúsculas y guiones):\nBORRAR-TODO-EL-SISTEMA'
      );
      if (phrase == null) return;
      if (String(phrase).trim() !== 'BORRAR-TODO-EL-SISTEMA') {
        showToast('Frase de confirmación incorrecta.', 'error');
        return;
      }
      btnWipeAllSystem.disabled = true;
      try {
        const data = await fetchJson(API + '/wipe-all-data', {
          method: 'POST',
          body: JSON.stringify({ confirm: 'BORRAR-TODO-EL-SISTEMA' }),
        });
        const d = data.deleted || {};
        const pr = data.seed_status && data.seed_status.prospectos;
        showToast(
          'Sistema vaciado. Filas eliminadas: ' +
            (d.deleted_total != null ? d.deleted_total : '—') +
            (pr != null ? ' · Prospección: ' + pr + ' registro(s) conservados.' : ''),
          'success'
        );
        await refreshAfterFullWipe();
      } catch (e) {
        let msg = parseApiError(e);
        try {
          const o = JSON.parse(e.message);
          if (o && o.hint) msg = msg + '\n' + o.hint;
        } catch (_) {}
        showToast(msg, 'error');
      } finally {
        btnWipeAllSystem.disabled = false;
      }
    });
  }

  let refreshIntervalId = null;
  function finishBoot() {
    showLoginOverlay(false);
    try {
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(function () { try { spawnAppParticles(); } catch (_) {} }, { timeout: 2000 });
      } else {
        setTimeout(function () { try { spawnAppParticles(); } catch (_) {} }, 100);
      }
    } catch (_) {
      spawnAppParticles();
    }
    initTheme();
    syncSessionHeader();
    updateAuditTabVisibility();
    updateCotizacionesTabVisibility();
    setupUsuariosPanel();
    setupModuleDeleteZones();
    setupCategoriasAdminPanel();
    initThemeToggleButton();
    renderNotificationsPanel();
    updateNotificationsBadge();
    initOnboarding();
    restoreLastTabOrDefault();
    loadDashboard()
      .then(function () { fillClientesSelect(); })
      .catch(function () { fillClientesSelect(); });
    setTimeout(function () {
      loadSeedStatus();
      loadStorageHealth();
      loadRecentAuditNotifications();
      const bootUser = getSessionUser();
      if (!serverConfig.authRequired || normalizeRole(bootUser && bootUser.role) === 'admin') {
        loadBackupFilesList();
      }
    }, 0);
    window.addEventListener('focus', function () {
      const now = Date.now();
      if (now - lastQuickRefreshAt < 20000) return;
      lastQuickRefreshAt = now;
      refreshActivePanelData({ silent: true });
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastQuickRefreshAt < 20000) return;
      lastQuickRefreshAt = now;
      refreshActivePanelData({ silent: true });
    });
    setTimeout(maybeShowBackupReminder, 15000);
    setTimeout(requestNotificationPermissionAndMaybeNotify, 3000);
    if (refreshIntervalId == null) {
      refreshIntervalId = setInterval(function () {
        loadSeedStatus(true);
        loadDashboard();
        loadClientes({ force: true });
        loadRefacciones();
        loadMaquinas({ force: true });
        if (canAccessCotizaciones()) loadCotizaciones({ force: true });
        loadIncidentes();
        loadBitacoras({ force: true });
      }, REFRESH_INTERVAL_MS);
    }
  }
  async function boot() {
    await fetchServerConfig();
    applyBranding();
    updateAuditTabVisibility();
    initThemeToggleButton();
    syncSessionHeader();
    if (!getAuthToken()) {
      showLoginOverlay(true);
      const hint = qs('#login-hint');
      if (hint) hint.textContent = 'Introduce las credenciales de tu cuenta para continuar.';
      setupLoginForm();
      initTheme();
      syncThemeColorMeta();
      return;
    }
    await refreshSessionUser();
    updateAuditTabVisibility();
    finishBoot();
  }
  boot();
})();
