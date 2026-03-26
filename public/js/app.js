(function () {
  const API = '/api';
  const AUTH_TOKEN_KEY = 'cotizacion-auth-token';
  const AUTH_USER_KEY = 'cotizacion-auth-user';
  const SOUND_PREF_KEY = 'cotizacion-sound';
  let serverConfig = Object.assign({}, typeof window.__APP_CONFIG__ === 'object' && window.__APP_CONFIG__ ? window.__APP_CONFIG__ : {});
  let clientesCache = [];
  let refaccionesCache = [];
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

  function qs(s) { return document.querySelector(s); }
  function qsAll(s) { return document.querySelectorAll(s); }

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
    const tagEl = qs('#app-tagline');
    const short = c.shortName || c.appName || 'Gestor Administrativo';
    if (nameEl) nameEl.textContent = short;
    if (tagEl) tagEl.textContent = c.tagline || '';
    updateDocumentTitleFromActiveTab();
    const logo = qs('#header-brand-logo');
    if (logo && c.logoUrl) {
      logo.src = c.logoUrl;
      logo.removeAttribute('aria-hidden');
      logo.alt = short;
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
      if (o && o.error) return o.error;
    } catch (_) {}
    return msg;
  }

  const LAST_TAB_KEY = 'cotizacion-last-tab';
  const VALID_TABS = ['dashboards', 'clientes', 'refacciones', 'maquinas', 'cotizaciones', 'reportes', 'garantias', 'bonos', 'viajes', 'incidentes', 'bitacoras'];
  const TABS_PERSIST = VALID_TABS.concat(['auditoria']);
  let reportesCache = [];
  let garantiasCache = [];
  let bonosCache = [];
  let viajesCache = [];
  let tecnicosCache = [];
  let lastQuickRefreshAt = 0;
  function showLoginOverlay(show) {
    const el = qs('#login-overlay');
    if (!el) return;
    el.classList.toggle('hidden', !show);
    document.body.classList.toggle('login-open', !!show);
  }
  function updateAuditTabVisibility() {
    const tab = qs('#tab-auditoria');
    if (!tab) return;
    const u = getSessionUser();
    const show = !!(serverConfig.auditUi && u && u.role === 'admin');
    tab.classList.toggle('hidden', !show);
  }
  function syncSessionHeader() {
    const wrap = qs('#header-session');
    const label = qs('#header-session-user');
    const out = qs('#btn-logout');
    if (!wrap || !label) return;
    const u = getSessionUser();
    if (serverConfig.authRequired && u) {
      wrap.classList.remove('hidden');
      label.textContent = (u.displayName || u.username || '') + ' · ' + (u.role || '');
      if (out) out.classList.remove('hidden');
    } else {
      wrap.classList.add('hidden');
      if (out) out.classList.add('hidden');
    }
  }
  function setupLoginForm() {
    const form = qs('#login-form');
    const err = qs('#login-error');
    if (!form || form._bound) return;
    form._bound = true;
    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      if (err) { err.classList.add('hidden'); err.textContent = ''; }
      const u = qs('#login-user');
      const p = qs('#login-pass');
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
            err.textContent = data.error || 'Error al iniciar sesión';
            err.classList.remove('hidden');
          }
          return;
        }
        setAuthSession(data.token, data.user);
        showLoginOverlay(false);
        applyBranding();
        updateAuditTabVisibility();
        syncSessionHeader();
        if (p) p.value = '';
        finishBoot();
      } catch (e) {
        if (err) {
          err.textContent = 'No se pudo conectar. Revisa la red o el servidor.';
          err.classList.remove('hidden');
        }
      }
    });
  }
  function initSoundToggleButton() {
    const btn = qs('#btn-sound-toggle');
    if (!btn || btn._bound) return;
    btn._bound = true;
    function refresh() {
      const on = isSoundEnabled();
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.title = on ? 'Sonido de confirmación: activado (clic para apagar)' : 'Sonido de confirmación: apagado (clic para activar)';
      const i = btn.querySelector('i');
      if (i) {
        i.classList.toggle('fa-volume-up', on);
        i.classList.toggle('fa-volume-mute', !on);
      }
    }
    refresh();
    btn.addEventListener('click', function () {
      try {
        const next = !isSoundEnabled();
        localStorage.setItem(SOUND_PREF_KEY, next ? '1' : '0');
      } catch (_) {}
      refresh();
      if (isSoundEnabled()) playSuccessChime();
    });
  }
  /** Título de la pestaña del navegador según la sección activa */
  function updateDocumentTitle(panelId) {
    const base = serverConfig.shortName || serverConfig.appName || 'Cotización Pro';
    const map = {
      dashboards: 'Dashboard',
      clientes: 'Clientes',
      refacciones: 'Refacciones',
      maquinas: 'Máquinas',
      cotizaciones: 'Cotizaciones',
      reportes: 'Reportes',
      garantias: 'Garantías',
      bonos: 'Bonos',
      viajes: 'Viajes',
      incidentes: 'Incidentes',
      bitacoras: 'Bitácora de horas',
      demo: 'Cargar demo',
      acerca: 'Acerca de',
      auditoria: 'Auditoría',
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
    qsAll('.panel').forEach(p => p.classList.remove('active'));
    qsAll('.tab').forEach(t => t.classList.remove('active'));
    const panel = document.getElementById('panel-' + id);
    const tab = document.querySelector('.tab[data-tab="' + id + '"]');
    if (panel) panel.classList.add('active');
    if (tab) tab.classList.add('active');
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
    if (id === 'bonos') loadBonos();
    if (id === 'viajes') loadViajes();
    if (id === 'incidentes') loadIncidentes();
    if (id === 'bitacoras') loadBitacoras();
    if (id === 'demo') loadSeedStatus();
    if (id === 'acerca') { /* solo mostrar panel */ }
    if (id === 'auditoria') loadAuditLog();
  }

  qsAll('.tab').forEach(t => {
    t.addEventListener('click', () => showPanel(t.dataset.tab));
  });

  async function fetchJson(url, opts = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const tok = getAuthToken();
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    const r = await fetch(url, Object.assign({}, opts, { headers }));
    const text = await r.text();
    if (r.status === 401 && serverConfig.authRequired) {
      clearAuthSession();
      updateAuditTabVisibility();
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

  function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function confirmar(msg) {
    return confirm(msg || '¿Eliminar este registro?');
  }

  function openConfirmModal(message, onConfirm) {
    const modal = qs('#confirm-modal');
    const title = qs('#confirm-title');
    const msgEl = qs('#confirm-message');
    const btnOk = qs('#confirm-btn-ok');
    const btnCancel = qs('#confirm-btn-cancel');
    const btnClose = qs('#confirm-close');
    if (!modal || !msgEl || !btnOk) return void confirm(message);
    title.textContent = 'Confirmar';
    msgEl.textContent = message || '¿Eliminar este registro?';
    modal.classList.remove('hidden');
    const close = () => { modal.classList.add('hidden'); btnOk.onclick = null; btnCancel.onclick = null; btnClose.onclick = null; };
    btnOk.onclick = () => { close(); if (typeof onConfirm === 'function') onConfirm(); };
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
  function updateTableFooter(tableId, showing, total, clearAndRefresh, paginationOpts) {
    const footer = qs('#footer-' + tableId);
    if (!footer) return;
    if (total === 0 && (!paginationOpts || paginationOpts.totalFiltered === 0)) { footer.innerHTML = ''; return; }
    const tbl = qs('#' + tableId);
    const hasFilters = !tbl ? false : (() => {
      let has = false;
      try {
        tbl.querySelectorAll('.filter-row .filter-input, .filter-row .filter-date-select, .filter-row .filter-date-input').forEach(inp => { if (inp.value && inp.value.trim()) has = true; });
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
    if (tbl) tbl.querySelectorAll('.filter-row .filter-input, .filter-row .filter-date-select, .filter-row .filter-date-input').forEach(inp => { inp.value = ''; });
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
    updateTableFooter('tabla-clientes', data.length, clientesCache.length, () => clearTableFiltersAndRefresh('tabla-clientes', '#buscar-clientes', applyClientesFiltersAndRender), arguments[1]);
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
      loadClientes();
    } catch (e) { showToast(parseApiError(e) || 'No se pudo eliminar.', 'error'); }
  }

  async function loadClientes() {
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
  function renderRefacciones(data) {
    const tbody = qs('#tabla-refacciones tbody');
    tbody.innerHTML = '';
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty">No hay refacciones. Agrega una nueva.</td></tr>';
      return;
    }
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
      tr.innerHTML = `
        <td><button type="button" class="btn-codigo-ref link-btn" data-id="${r.id}" title="Ver imagen/manual">${escapeHtml(r.codigo || '')}</button></td>
        <td>${escapeHtml(r.descripcion || '')}</td>
        <td>${escapeHtml(r.categoria || '')}${r.subcategoria ? ' / ' + escapeHtml(r.subcategoria) : ''}</td>
        <td>${escapeHtml(r.zona || '')}</td>
        <td class="${stockBajo ? 'stock-bajo' : ''}">${r.stock != null ? Number(r.stock).toLocaleString('es-MX') : '0'}</td>
        <td>${r.stock_minimo != null ? Number(r.stock_minimo) : 1}</td>
        <td>${typeof r.precio_unitario === 'number' ? '$' + r.precio_unitario.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : ''}</td>
        <td>${r.precio_usd ? 'US$' + Number(r.precio_usd).toLocaleString('en-US', { minimumFractionDigits: 2 }) : ''}</td>
        <td>${escapeHtml(r.unidad || 'PZA')}</td>
        <td class="th-actions">
          <button type="button" class="btn small outline btn-stock-ref" data-id="${r.id}" title="Ajustar stock"><i class="fas fa-boxes"></i></button>
          <button type="button" class="btn small primary btn-edit-ref" data-id="${r.id}"><i class="fas fa-edit"></i></button>
          <button type="button" class="btn small danger btn-delete-ref" data-id="${r.id}"><i class="fas fa-trash"></i></button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    updateTableFooter('tabla-refacciones', data.length, refaccionesCache.length, () => clearTableFiltersAndRefresh('tabla-refacciones', '#buscar-refacciones', applyRefaccionesFiltersAndRender), arguments[1]);
    tbody.querySelectorAll('.btn-codigo-ref').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const r = data.find(x => x.id == btn.dataset.id); if (r) openModalRefaccionImagen(r); });
    });
    tbody.querySelectorAll('.btn-stock-ref').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const r = data.find(x => x.id == btn.dataset.id); if (r) openModalAjusteStock(r); });
    });
    tbody.querySelectorAll('.btn-edit-ref').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const r = data.find(x => x.id == btn.dataset.id); if (r) openModalRefaccion(r); });
    });
    tbody.querySelectorAll('.btn-delete-ref').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openConfirmModal('¿Eliminar esta refacción?', () => deleteRefaccion(btn.dataset.id)); });
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
    renderTableSkeleton('tabla-refacciones', 8);
    try {
      const data = await fetchJson(API + '/refacciones');
      refaccionesCache = data;
      applyRefaccionesFiltersAndRender();
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
    updateTableFooter('tabla-maquinas', data.length, maquinasCache.length, () => clearTableFiltersAndRefresh('tabla-maquinas', null, applyMaquinasFiltersAndRender), arguments[1]);
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
      loadMaquinas();
    } catch (e) { showToast(parseApiError(e) || 'No se pudo eliminar.', 'error'); }
  }

  async function loadMaquinas() {
    showLoading();
    renderTableSkeleton('tabla-maquinas', 8);
    const clienteId = qs('#filtro-cliente-maq') && qs('#filtro-cliente-maq').value;
    const url = clienteId ? `${API}/maquinas?cliente_id=${clienteId}` : `${API}/maquinas`;
    try {
      const data = await fetchJson(url);
      maquinasCache = data;
      applyMaquinasFiltersAndRender();
    } catch (e) { renderMaquinas([]); console.error(e); }
    finally { hideLoading(); }
  }

  // ----- COTIZACIONES (módulo rehecho: carga + render explícitos) -----
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
    list.forEach(c => {
      const vig = getVigenciaSemaphore(c);
      const moneda = c.moneda || 'MXN';
      const totalFmt = c.total != null
        ? (moneda === 'USD' ? 'US$' + Number(c.total).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '$' + Number(c.total).toLocaleString('es-MX', { minimumFractionDigits: 2 }))
        : '';
      const tcFmt = c.tipo_cambio ? Number(c.tipo_cambio).toFixed(2) : '';
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
        <td>${totalFmt}</td>
        <td><span class="badge badge-moneda">${moneda}</span>${tcFmt ? '<small style="color:#6b7280"> @' + tcFmt + '</small>' : ''}</td>
        <td><span class="semaforo ${estadoClass}">${estadoLabel}</span></td>
        <td class="sla-cell"><span class="semaforo semaforo-${vig.color}" title="${escapeHtml(vig.label)}"><i class="fas ${vig.icon}"></i> ${escapeHtml(vig.label)}</span></td>
        <td class="th-actions">
          <button type="button" class="btn small outline btn-pdf-cot" data-id="${c.id}" title="Descargar / Imprimir PDF para cliente"><i class="fas fa-file-pdf"></i></button>
          ${c.estado !== 'aplicada' && c.estado !== 'venta' ? `<button type="button" class="btn small success btn-aplicar-cot" data-id="${c.id}" title="Aplicar como venta"><i class="fas fa-check"></i></button>` : ''}
          <button type="button" class="btn small primary btn-edit-cot" data-id="${c.id}" title="Editar"><i class="fas fa-edit"></i></button>
          <button type="button" class="btn small outline btn-duplicate-cot" data-id="${c.id}" title="Duplicar cotización"><i class="fas fa-copy"></i></button>
          <button type="button" class="btn small danger btn-delete-cot" data-id="${c.id}" title="Eliminar"><i class="fas fa-trash"></i></button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.btn-aplicar-cot').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        openConfirmModal('¿Aplicar esta cotización como venta? Se descontará el inventario.', () => aplicarCotizacion(btn.dataset.id));
      });
    });
    tbody.querySelectorAll('.btn-pdf-cot').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openCotizacionPdf(btn.dataset.id); });
    });
    tbody.querySelectorAll('.btn-edit-cot').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); editCotizacion(btn.dataset.id); });
    });
    tbody.querySelectorAll('.btn-duplicate-cot').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); duplicateCotizacion(btn.dataset.id); });
    });
    tbody.querySelectorAll('.btn-delete-cot').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openConfirmModal('¿Eliminar esta cotización?', () => deleteCotizacion(btn.dataset.id)); });
    });
    updateTableFooter('tabla-cotizaciones', list.length, cotizacionesCache.length, () => clearTableFiltersAndRefresh('tabla-cotizaciones', null, applyCotizacionesFiltersAndRender), arguments[2]);
  }

  async function loadCotizaciones() {
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
    }
  }

  async function deleteCotizacion(id) {
    try {
      await fetchJson(API + '/cotizaciones/' + id, { method: 'DELETE' });
      showToast('Cotización eliminada correctamente.', 'success');
      loadCotizaciones();
    } catch (e) { showToast(parseApiError(e) || 'No se pudo eliminar.', 'error'); }
  }

  async function aplicarCotizacion(id) {
    try {
      await fetchJson(API + '/cotizaciones/' + id + '/aplicar', { method: 'POST', body: JSON.stringify({}) });
      showToast('Cotización aplicada como venta. Inventario actualizado.', 'success');
      loadCotizaciones();
      loadRefacciones();
    } catch (e) { showToast(parseApiError(e) || 'No se pudo aplicar la cotización.', 'error'); }
  }

  // ----- REPORTES -----
  async function loadReportes() {
    showLoading();
    try {
      const [raw, tecs] = await Promise.all([fetchJson(API + '/reportes'), fetchJson(API + '/tecnicos').catch(() => [])]);
      reportesCache = toArray(raw);
      tecnicosCache = toArray(tecs);
      renderReportes(reportesCache);
    } catch (e) {
      renderReportes([]);
      showToast(parseApiError(e) || 'No se pudieron cargar los reportes.', 'error');
    } finally { hideLoading(); }
  }

  function renderReportes(data) {
    const tbody = qs('#tabla-reportes tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty">No hay reportes. Agrega uno nuevo.</td></tr>';
      return;
    }
    data.forEach(r => {
      const tr = document.createElement('tr');
      const tipoLabel = r.tipo_reporte === 'servicio' ? 'Servicio' : r.tipo_reporte === 'venta' ? 'Venta' : (r.tipo_reporte || '');
      const subLabel = r.subtipo || '';
      tr.innerHTML = `
        <td>${escapeHtml(r.folio || '')}</td>
        <td>${escapeHtml(r.razon_social || r.cliente_nombre || '')}</td>
        <td>${escapeHtml(r.numero_maquina || '')}</td>
        <td class="td-text-wrap">${escapeHtml(r.descripcion || '')}</td>
        <td><span class="badge badge-tipo-rep-${r.tipo_reporte || 'otro'}">${tipoLabel}</span></td>
        <td>${escapeHtml(subLabel)}</td>
        <td>${escapeHtml(r.tecnico || '')}</td>
        <td>${escapeHtml((r.fecha || '').toString().slice(0, 10))}</td>
        <td class="th-actions">
          <button type="button" class="btn small primary btn-edit-rep" data-id="${r.id}"><i class="fas fa-edit"></i></button>
          <button type="button" class="btn small danger btn-del-rep" data-id="${r.id}"><i class="fas fa-trash"></i></button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.btn-edit-rep').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const r = reportesCache.find(x => x.id == btn.dataset.id); if (r) openModalReporte(r); });
    });
    tbody.querySelectorAll('.btn-del-rep').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openConfirmModal('¿Eliminar este reporte?', () => deleteReporte(btn.dataset.id)); });
    });
  }

  function openModalReporte(reporte) {
    const isNew = !reporte || !reporte.id;
    const clientesOpts = clientesCache.map(c => `<option value="${c.id}" ${reporte && reporte.cliente_id == c.id ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('');
    const maquinasOpts = maquinasCache.map(m => `<option value="${m.id}" ${reporte && reporte.maquina_id == m.id ? 'selected' : ''}>${escapeHtml(m.modelo || m.nombre || m.numero_serie || '')}</option>`).join('');
    const tecnOpts = tecnicosCache.map(t => `<option value="${escapeHtml(t.nombre)}" ${reporte && reporte.tecnico === t.nombre ? 'selected' : ''}>${escapeHtml(t.nombre)}</option>`).join('');
    const body = `
      <div class="form-row">
        <div class="form-group"><label>Razón social</label><input type="text" id="m-rsocial" maxlength="200" value="${escapeHtml(reporte && reporte.razon_social) || ''}" placeholder="Nombre del cliente"></div>
        <div class="form-group"><label>Cliente (catálogo)</label>
          <select id="m-cliente"><option value="">— Sin cliente registrado —</option>${clientesOpts}</select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Máquina</label>
          <select id="m-maquina"><option value="">— Selecciona —</option>${maquinasOpts}</select>
        </div>
        <div class="form-group"><label>Número de máquina</label><input type="text" id="m-num-maq" maxlength="50" value="${escapeHtml(reporte && reporte.numero_maquina) || ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Tipo de reporte *</label>
          <select id="m-tipo-rep">
            <option value="servicio" ${reporte && reporte.tipo_reporte === 'servicio' ? 'selected' : ''}>Servicio</option>
            <option value="venta" ${reporte && reporte.tipo_reporte === 'venta' ? 'selected' : ''}>Venta</option>
          </select>
        </div>
        <div class="form-group"><label>Subtipo *</label>
          <select id="m-subtipo-rep">
            <option value="">— Selecciona tipo primero —</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Técnico</label>
          <select id="m-tecnico-rep"><option value="">— Sin asignar —</option>${tecnOpts}</select>
        </div>
        <div class="form-group"><label>Fecha</label><input type="date" id="m-fecha-rep" value="${(reporte && reporte.fecha || new Date().toISOString().slice(0,10))}"></div>
        <div class="form-group"><label>Estatus</label>
          <select id="m-est-rep">
            <option value="abierto" ${!reporte || reporte.estatus === 'abierto' ? 'selected' : ''}>Abierto</option>
            <option value="en_proceso" ${reporte && reporte.estatus === 'en_proceso' ? 'selected' : ''}>En proceso</option>
            <option value="cerrado" ${reporte && reporte.estatus === 'cerrado' ? 'selected' : ''}>Cerrado</option>
          </select>
        </div>
      </div>
      <div class="form-group"><label>Descripción *</label><textarea id="m-desc-rep" rows="3" maxlength="1000">${escapeHtml(reporte && reporte.descripcion) || ''}</textarea></div>
      <div class="form-group"><label>Notas</label><textarea id="m-notas-rep" rows="2" maxlength="500">${escapeHtml(reporte && reporte.notas) || ''}</textarea></div>
      <div class="form-actions">
        <button type="button" class="btn primary" id="m-save"><i class="fas fa-save"></i> Guardar</button>
        <button type="button" class="btn" id="modal-btn-cancel">Cancelar</button>
      </div>
    `;
    openModal(isNew ? 'Nuevo reporte' : 'Editar reporte', body);
    // Subtipos dinámicos
    const SUBTIPOS = {
      servicio: ['Falla eléctrica', 'Falla mecánica', 'Falla electrónica', 'Otro'],
      venta: ['Instalación', 'Capacitación', 'Garantía', 'Otra'],
    };
    const tipoSel = qs('#m-tipo-rep');
    const subSel = qs('#m-subtipo-rep');
    function updateSubtipos() {
      const opts = SUBTIPOS[tipoSel.value] || [];
      subSel.innerHTML = opts.map(s => `<option value="${s}" ${reporte && reporte.subtipo === s ? 'selected' : ''}>${s}</option>`).join('');
    }
    tipoSel.addEventListener('change', updateSubtipos);
    updateSubtipos();
    qs('#m-save').onclick = async () => {
      const desc = qs('#m-desc-rep').value.trim();
      if (!desc) { showToast('La descripción es obligatoria.', 'error'); return; }
      const payload = {
        cliente_id: qs('#m-cliente').value || null,
        razon_social: qs('#m-rsocial').value.trim() || null,
        maquina_id: qs('#m-maquina').value || null,
        numero_maquina: qs('#m-num-maq').value.trim() || null,
        tipo_reporte: qs('#m-tipo-rep').value,
        subtipo: qs('#m-subtipo-rep').value || null,
        descripcion: desc,
        tecnico: qs('#m-tecnico-rep').value || null,
        fecha: qs('#m-fecha-rep').value,
        estatus: qs('#m-est-rep').value,
        notas: qs('#m-notas-rep').value.trim() || null,
      };
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

  async function checkGarantiasAlertas() {
    try {
      const alertas = await fetchJson(API + '/garantias-alertas');
      const bar = qs('#garantias-alerta-bar');
      if (!bar) return;
      if (alertas && alertas.length) {
        bar.classList.remove('hidden');
        bar.innerHTML = `<i class="fas fa-bell"></i> <strong>${alertas.length} alerta(s) de mantenimiento:</strong> ${alertas.slice(0,3).map(a => escapeHtml(a.razon_social) + ' – ' + escapeHtml(a.fecha_programada)).join(' | ')}${alertas.length > 3 ? ' …' : ''}`;
      } else {
        bar.classList.add('hidden');
      }
    } catch (_) {}
  }

  function renderGarantias(data) {
    const tbody = qs('#tabla-garantias tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty">No hay garantías registradas. Agrega una.</td></tr>';
      return;
    }
    data.forEach(g => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(g.razon_social || '')}</td>
        <td>${escapeHtml(g.modelo_maquina || '')}</td>
        <td>${escapeHtml(g.numero_serie || '')}</td>
        <td>${escapeHtml((g.fecha_entrega || '').toString().slice(0,10))}</td>
        <td>${escapeHtml(g.tipo_maquina || '')}</td>
        <td><span class="badge badge-gar-${g.estado || 'activa'}">${g.estado || 'activa'}</span></td>
        <td>${g.total_pagado != null ? '$' + Number(g.total_pagado).toLocaleString('es-MX', {minimumFractionDigits:2}) : '—'}</td>
        <td class="th-actions">
          <button type="button" class="btn small outline btn-mant-gar" data-id="${g.id}" title="Ver mantenimientos"><i class="fas fa-calendar-check"></i></button>
          <button type="button" class="btn small primary btn-edit-gar" data-id="${g.id}"><i class="fas fa-edit"></i></button>
          <button type="button" class="btn small danger btn-del-gar" data-id="${g.id}"><i class="fas fa-trash"></i></button>
        </td>
      `;
      tbody.appendChild(tr);
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
    const body = `
      <div class="form-group"><label>Razón social *</label><input type="text" id="m-rsocial-g" maxlength="200" value="${escapeHtml(garantia && garantia.razon_social) || ''}" required></div>
      <div class="form-row">
        <div class="form-group"><label>Modelo de máquina *</label><input type="text" id="m-modelo-g" maxlength="100" value="${escapeHtml(garantia && garantia.modelo_maquina) || ''}" required></div>
        <div class="form-group"><label>Tipo de máquina</label><input type="text" id="m-tipo-maq-g" maxlength="80" value="${escapeHtml(garantia && garantia.tipo_maquina) || ''}" placeholder="Fresadora, CNC…"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Número de serie *</label><input type="text" id="m-nserie-g" maxlength="80" value="${escapeHtml(garantia && garantia.numero_serie) || ''}" required></div>
        <div class="form-group"><label>Fecha de entrega *</label><input type="date" id="m-fent-g" value="${(garantia && garantia.fecha_entrega || new Date().toISOString().slice(0,10))}" required></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Estado</label>
          <select id="m-est-g">
            <option value="activa" ${!garantia || garantia.estado === 'activa' ? 'selected' : ''}>Activa</option>
            <option value="vencida" ${garantia && garantia.estado === 'vencida' ? 'selected' : ''}>Vencida</option>
            <option value="cancelada" ${garantia && garantia.estado === 'cancelada' ? 'selected' : ''}>Cancelada</option>
          </select>
        </div>
        <div class="form-group"><label>Email de contacto</label><input type="email" id="m-email-g" maxlength="150" value="${escapeHtml(garantia && garantia.email_contacto) || ''}"></div>
      </div>
      <div class="form-group"><label>Notas</label><textarea id="m-notas-g" rows="2" maxlength="500">${escapeHtml(garantia && garantia.notas) || ''}</textarea></div>
      <div class="form-actions">
        <button type="button" class="btn primary" id="m-save"><i class="fas fa-save"></i> Guardar</button>
        <button type="button" class="btn" id="modal-btn-cancel">Cancelar</button>
      </div>
    `;
    openModal(isNew ? 'Nueva garantía' : 'Editar garantía', body);
    qs('#m-save').onclick = async () => {
      const rsocial = qs('#m-rsocial-g').value.trim();
      const modelo = qs('#m-modelo-g').value.trim();
      const nserie = qs('#m-nserie-g').value.trim();
      const fent = qs('#m-fent-g').value;
      if (!rsocial) { showToast('Razón social es obligatoria.', 'error'); return; }
      if (!modelo) { showToast('Modelo de máquina es obligatorio.', 'error'); return; }
      if (!nserie) { showToast('Número de serie es obligatorio.', 'error'); return; }
      const payload = {
        razon_social: rsocial,
        modelo_maquina: modelo,
        tipo_maquina: qs('#m-tipo-maq-g').value.trim() || null,
        numero_serie: nserie,
        fecha_entrega: fent,
        estado: qs('#m-est-g').value,
        email_contacto: qs('#m-email-g').value.trim() || null,
        notas: qs('#m-notas-g').value.trim() || null,
      };
      try {
        if (isNew) await fetchJson(API + '/garantias', { method: 'POST', body: JSON.stringify(payload) });
        else await fetchJson(API + '/garantias/' + garantia.id, { method: 'PUT', body: JSON.stringify(payload) });
        qs('#modal').classList.add('hidden');
        showToast('Garantía guardada.', 'success');
        loadGarantias();
      } catch (e) { showToast(parseApiError(e), 'error'); }
    };
  }

  async function openModalMantenimientos(garantia) {
    let mantenimientos = [];
    try {
      mantenimientos = toArray(await fetchJson(API + '/garantias/' + garantia.id + '/mantenimientos'));
    } catch (_) {}
    const rows = mantenimientos.map((m, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml((m.fecha_programada || '').toString().slice(0,10))}</td>
        <td>${m.fecha_realizado ? escapeHtml(m.fecha_realizado.toString().slice(0,10)) : '—'}</td>
        <td><span class="badge badge-mant-${m.estado || 'pendiente'}">${m.estado || 'pendiente'}</span></td>
        <td>${m.monto_pagado != null ? '$' + Number(m.monto_pagado).toFixed(2) : '—'}</td>
        <td><button type="button" class="btn small primary btn-mant-edit" data-id="${m.id}" data-garid="${garantia.id}"><i class="fas fa-edit"></i></button></td>
      </tr>
    `).join('');
    const body = `
      <p><strong>${escapeHtml(garantia.razon_social)}</strong> – ${escapeHtml(garantia.modelo_maquina)} (${escapeHtml(garantia.numero_serie)})</p>
      <table class="table-simple" style="width:100%;margin-top:1rem">
        <thead><tr><th>#</th><th>Fecha prog.</th><th>Realizado</th><th>Estado</th><th>Pago</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="empty">Sin mantenimientos generados.</td></tr>'}</tbody>
      </table>
      <div class="form-actions" style="margin-top:1rem">
        <button type="button" class="btn" id="modal-btn-cancel">Cerrar</button>
      </div>
    `;
    openModal('Mantenimientos: ' + escapeHtml(garantia.razon_social), body);
    document.querySelectorAll('.btn-mant-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const m = mantenimientos.find(x => x.id == btn.dataset.id);
        if (m) openModalEditMantenimiento(m, garantia);
      });
    });
  }

  function openModalEditMantenimiento(mant, garantia) {
    const body = `
      <div class="form-row">
        <div class="form-group"><label>Estado</label>
          <select id="m-est-mant">
            <option value="pendiente" ${mant.estado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
            <option value="confirmado" ${mant.estado === 'confirmado' ? 'selected' : ''}>Confirmado</option>
            <option value="realizado" ${mant.estado === 'realizado' ? 'selected' : ''}>Realizado</option>
            <option value="vencido" ${mant.estado === 'vencido' ? 'selected' : ''}>Vencido</option>
          </select>
        </div>
        <div class="form-group"><label>Fecha realizado</label><input type="date" id="m-frealiz-mant" value="${mant.fecha_realizado || ''}"></div>
        <div class="form-group"><label>Monto pagado</label><input type="number" id="m-monto-mant" step="0.01" min="0" value="${mant.monto_pagado || 0}"></div>
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
        estado: qs('#m-est-mant').value,
        fecha_realizado: qs('#m-frealiz-mant').value || null,
        monto_pagado: parseFloat(qs('#m-monto-mant').value) || null,
        notas: qs('#m-notas-mant').value.trim() || null,
      };
      try {
        await fetchJson(API + '/mantenimientos-garantia/' + mant.id, { method: 'PUT', body: JSON.stringify(payload) });
        qs('#modal').classList.add('hidden');
        showToast('Mantenimiento actualizado.', 'success');
        loadGarantias();
      } catch (e) { showToast(parseApiError(e), 'error'); }
    };
  }

  async function deleteGarantia(id) {
    try {
      await fetchJson(API + '/garantias/' + id, { method: 'DELETE' });
      showToast('Garantía eliminada.', 'success');
      loadGarantias();
    } catch (e) { showToast(parseApiError(e), 'error'); }
  }

  // ----- BONOS -----
  async function loadBonos() {
    showLoading();
    try {
      const [raw, tecs] = await Promise.all([fetchJson(API + '/bonos'), fetchJson(API + '/tecnicos').catch(() => [])]);
      bonosCache = toArray(raw);
      tecnicosCache = toArray(tecs);
      renderBonos(bonosCache);
    } catch (e) {
      renderBonos([]);
      showToast(parseApiError(e) || 'No se pudieron cargar los bonos.', 'error');
    } finally { hideLoading(); }
  }

  function renderBonos(data) {
    const tbody = qs('#tabla-bonos tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">No hay bonos registrados.</td></tr>';
      return;
    }
    let totalBonos = 0;
    data.forEach(b => {
      totalBonos += Number(b.monto_bono || 0);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(b.tecnico || '')}</td>
        <td>${escapeHtml(b.tipo_capacitacion || '')}</td>
        <td>${escapeHtml((b.fecha || '').toString().slice(0,10))}</td>
        <td>${escapeHtml(b.cliente_nombre || b.razon_social || '')}</td>
        <td>$${Number(b.monto_bono || 0).toLocaleString('es-MX', {minimumFractionDigits:2})}</td>
        <td><span class="badge badge-bono-${b.pagado ? 'pagado' : 'pendiente'}">${b.pagado ? 'Pagado' : 'Pendiente'}</span></td>
        <td class="th-actions">
          <button type="button" class="btn small primary btn-edit-bono" data-id="${b.id}"><i class="fas fa-edit"></i></button>
          <button type="button" class="btn small danger btn-del-bono" data-id="${b.id}"><i class="fas fa-trash"></i></button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    const totalEl = qs('#bonos-total');
    if (totalEl) totalEl.textContent = '$' + totalBonos.toLocaleString('es-MX', { minimumFractionDigits: 2 });
    tbody.querySelectorAll('.btn-edit-bono').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const b = bonosCache.find(x => x.id == btn.dataset.id); if (b) openModalBono(b); });
    });
    tbody.querySelectorAll('.btn-del-bono').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openConfirmModal('¿Eliminar este bono?', () => deleteBono(btn.dataset.id)); });
    });
  }

  function openModalBono(bono) {
    const isNew = !bono || !bono.id;
    const tecnOpts = tecnicosCache.map(t => `<option value="${escapeHtml(t.nombre)}" ${bono && bono.tecnico === t.nombre ? 'selected' : ''}>${escapeHtml(t.nombre)}</option>`).join('');
    const TIPOS_CAP = ['Operación básica', 'Operación avanzada', 'Mantenimiento', 'Programación CNC', 'Seguridad industrial', 'Otra'];
    const tiposOpts = TIPOS_CAP.map(t => `<option value="${t}" ${bono && bono.tipo_capacitacion === t ? 'selected' : ''}>${t}</option>`).join('');
    const body = `
      <div class="form-row">
        <div class="form-group"><label>Técnico *</label>
          <select id="m-tec-bono"><option value="">— Selecciona —</option>${tecnOpts}</select>
        </div>
        <div class="form-group"><label>Tipo de capacitación *</label>
          <select id="m-tipo-cap"><option value="">— Selecciona —</option>${tiposOpts}</select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Fecha</label><input type="date" id="m-fecha-bono" value="${bono && bono.fecha || new Date().toISOString().slice(0,10)}"></div>
        <div class="form-group"><label>Cliente / Empresa</label><input type="text" id="m-cliente-bono" maxlength="200" value="${escapeHtml(bono && bono.razon_social) || ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Monto bono (MXN) *</label><input type="number" id="m-monto-bono" step="0.01" min="0" value="${bono && bono.monto_bono || 0}"></div>
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
        tecnico,
        tipo_capacitacion: tipo,
        fecha: qs('#m-fecha-bono').value,
        razon_social: qs('#m-cliente-bono').value.trim() || null,
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
      const [raw, tecs] = await Promise.all([fetchJson(API + '/viajes'), fetchJson(API + '/tecnicos').catch(() => [])]);
      viajesCache = toArray(raw);
      tecnicosCache = toArray(tecs);
      renderViajes(viajesCache);
    } catch (e) {
      renderViajes([]);
      showToast(parseApiError(e) || 'No se pudieron cargar los viajes.', 'error');
    } finally { hideLoading(); }
  }

  function renderViajes(data) {
    const tbody = qs('#tabla-viajes tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty">No hay viajes registrados.</td></tr>';
      return;
    }
    let totalViáticos = 0;
    data.forEach(v => {
      const dias = Number(v.dias || 1);
      const monto = dias * 1000;
      totalViáticos += monto;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(v.tecnico || '')}</td>
        <td>${escapeHtml((v.fecha_inicio || '').toString().slice(0,10))}</td>
        <td>${escapeHtml((v.fecha_fin || '').toString().slice(0,10))}</td>
        <td>${dias}</td>
        <td>$${monto.toLocaleString('es-MX', {minimumFractionDigits:2})}</td>
        <td class="td-text-wrap">${escapeHtml(v.cliente || v.razon_social || '')}</td>
        <td class="td-text-wrap">${escapeHtml(v.actividades || '')}</td>
        <td class="th-actions">
          <button type="button" class="btn small primary btn-edit-viaje" data-id="${v.id}"><i class="fas fa-edit"></i></button>
          <button type="button" class="btn small danger btn-del-viaje" data-id="${v.id}"><i class="fas fa-trash"></i></button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    const totalEl = qs('#viajes-total-viaticos');
    if (totalEl) totalEl.textContent = '$' + totalViáticos.toLocaleString('es-MX', { minimumFractionDigits: 2 });
    tbody.querySelectorAll('.btn-edit-viaje').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const v = viajesCache.find(x => x.id == btn.dataset.id); if (v) openModalViaje(v); });
    });
    tbody.querySelectorAll('.btn-del-viaje').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openConfirmModal('¿Eliminar este viaje?', () => deleteViaje(btn.dataset.id)); });
    });
  }

  function openModalViaje(viaje) {
    const isNew = !viaje || !viaje.id;
    const tecnOpts = tecnicosCache.map(t => `<option value="${escapeHtml(t.nombre)}" ${viaje && viaje.tecnico === t.nombre ? 'selected' : ''}>${escapeHtml(t.nombre)}</option>`).join('');
    const body = `
      <div class="form-row">
        <div class="form-group"><label>Técnico *</label>
          <select id="m-tec-viaje"><option value="">— Selecciona —</option>${tecnOpts}</select>
        </div>
        <div class="form-group"><label>Cliente / Empresa</label><input type="text" id="m-cliente-viaje" maxlength="200" value="${escapeHtml(viaje && viaje.cliente) || escapeHtml(viaje && viaje.razon_social) || ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Fecha inicio</label><input type="date" id="m-finicio-viaje" value="${viaje && viaje.fecha_inicio || new Date().toISOString().slice(0,10)}"></div>
        <div class="form-group"><label>Fecha fin</label><input type="date" id="m-ffin-viaje" value="${viaje && viaje.fecha_fin || new Date().toISOString().slice(0,10)}"></div>
        <div class="form-group"><label>Días</label><input type="number" id="m-dias-viaje" min="1" step="1" value="${viaje && viaje.dias || 1}" readonly></div>
      </div>
      <p style="font-size:0.85rem;color:#6b7280;margin-top:-0.5rem">Viáticos: $1,000 MXN por día. <strong id="m-total-viaticos-preview">$${((viaje && viaje.dias || 1) * 1000).toLocaleString('es-MX')}</strong></p>
      <div class="form-group"><label>Actividades realizadas</label><textarea id="m-act-viaje" rows="3" maxlength="500">${escapeHtml(viaje && viaje.actividades) || ''}</textarea></div>
      <div class="form-group"><label>Notas</label><textarea id="m-notas-viaje" rows="2" maxlength="300">${escapeHtml(viaje && viaje.notas) || ''}</textarea></div>
      <div class="form-actions">
        <button type="button" class="btn primary" id="m-save"><i class="fas fa-save"></i> Guardar</button>
        <button type="button" class="btn" id="modal-btn-cancel">Cancelar</button>
      </div>
    `;
    openModal(isNew ? 'Nuevo viaje' : 'Editar viaje', body);
    // Auto calcular días
    function calcDias() {
      const fi = qs('#m-finicio-viaje').value;
      const ff = qs('#m-ffin-viaje').value;
      if (fi && ff) {
        const d = Math.max(1, Math.round((new Date(ff) - new Date(fi)) / 86400000) + 1);
        qs('#m-dias-viaje').value = d;
        qs('#m-total-viaticos-preview').textContent = '$' + (d * 1000).toLocaleString('es-MX');
      }
    }
    qs('#m-finicio-viaje').addEventListener('change', calcDias);
    qs('#m-ffin-viaje').addEventListener('change', calcDias);
    qs('#m-save').onclick = async () => {
      const tecnico = qs('#m-tec-viaje').value;
      if (!tecnico) { showToast('Selecciona un técnico.', 'error'); return; }
      const payload = {
        tecnico,
        cliente: qs('#m-cliente-viaje').value.trim() || null,
        fecha_inicio: qs('#m-finicio-viaje').value,
        fecha_fin: qs('#m-ffin-viaje').value,
        dias: parseInt(qs('#m-dias-viaje').value) || 1,
        actividades: qs('#m-act-viaje').value.trim() || null,
        notas: qs('#m-notas-viaje').value.trim() || null,
      };
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

  // Liquidación mensual de viajes
  async function generarLiquidacionMensual() {
    const mesInput = qs('#filtro-mes-viajes');
    const mes = mesInput ? mesInput.value : new Date().toISOString().slice(0, 7);
    if (!mes) { showToast('Selecciona un mes.', 'error'); return; }
    try {
      const data = await fetchJson(API + '/liquidacion-mensual?mes=' + mes);
      if (!data || !data.length) { showToast('Sin viajes en ese mes.', 'info'); return; }
      openModalLiquidacion(data, mes);
    } catch (e) { showToast(parseApiError(e), 'error'); }
  }

  function openModalLiquidacion(data, mes) {
    const rows = data.map(d => `
      <tr>
        <td>${escapeHtml(d.tecnico || '')}</td>
        <td>${d.total_dias}</td>
        <td>$${Number(d.total_viaticos).toLocaleString('es-MX', {minimumFractionDigits:2})}</td>
        <td>$${Number(d.total_bonos || 0).toLocaleString('es-MX', {minimumFractionDigits:2})}</td>
        <td><strong>$${Number((d.total_viaticos || 0) + (d.total_bonos || 0)).toLocaleString('es-MX', {minimumFractionDigits:2})}</strong></td>
      </tr>
    `).join('');
    const body = `
      <h3 style="margin-bottom:1rem">Liquidación mensual: ${mes}</h3>
      <table class="table-simple" style="width:100%">
        <thead><tr><th>Técnico</th><th>Días</th><th>Viáticos</th><th>Bonos</th><th>Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="form-actions" style="margin-top:1.5rem">
        <button type="button" class="btn primary" onclick="window.print()"><i class="fas fa-print"></i> Imprimir</button>
        <button type="button" class="btn" id="modal-btn-cancel">Cerrar</button>
      </div>
    `;
    openModal('Liquidación mensual', body);
  }

  // ----- INCIDENTES (módulo rehecho: carga + render explícitos) -----
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
          <button type="button" class="btn small outline btn-pdf-inc" data-id="${i.id}" title="Imprimir / PDF"><i class="fas fa-file-pdf"></i></button>
          <button type="button" class="btn small primary btn-edit-inc" data-id="${i.id}" title="Editar"><i class="fas fa-edit"></i></button>
          <button type="button" class="btn small outline btn-duplicate-inc" data-id="${i.id}" title="Duplicar incidente"><i class="fas fa-copy"></i></button>
          <button type="button" class="btn small danger btn-delete-inc" data-id="${i.id}" title="Eliminar"><i class="fas fa-trash"></i></button>
        </td>
      `;
      tbody.appendChild(tr);
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
  }

  async function loadIncidentes() {
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
      tbody.innerHTML = '<tr><td colspan="9" class="empty filter-empty"><span>No hay resultados con los filtros aplicados.</span> <button type="button" class="btn small primary clear-filters-inline">Quitar filtros</button></td></tr>';
      const btn = tbody.querySelector('.clear-filters-inline');
      if (btn) btn.addEventListener('click', () => clearTableFiltersAndRefresh('tabla-bitacoras', null, applyBitacorasFiltersAndRender));
      updateTableFooter('tabla-bitacoras', 0, bitacorasCache.length, () => clearTableFiltersAndRefresh('tabla-bitacoras', null, applyBitacorasFiltersAndRender));
      return;
    }
    list.forEach(b => {
      const est = getEstadoRegistroSemaphore(b);
      const act = String(b.actividades || '');
      const mat = String(b.materiales_usados || '');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(String((b.fecha || '').toString().slice(0, 10)))}</td>
        <td>${escapeHtml(String(b.incidente_folio || '—'))}</td>
        <td>${escapeHtml(String(b.cotizacion_folio || '—'))}</td>
        <td class="td-text-wrap">${escapeHtml(String(b.tecnico || ''))}</td>
        <td class="td-desc-wrap">${escapeHtml(act)}</td>
        <td>${b.tiempo_horas != null ? b.tiempo_horas : '—'}</td>
        <td class="td-desc-wrap td-desc-wrap--compact">${escapeHtml(mat)}</td>
        <td class="sla-cell"><span class="semaforo semaforo-${est.color}" title="${escapeHtml(est.label)}"><i class="fas ${est.icon}"></i> ${escapeHtml(est.label)}</span></td>
        <td class="th-actions">
          <button type="button" class="btn small outline btn-pdf-bit" data-id="${b.id}" title="Imprimir / PDF"><i class="fas fa-file-pdf"></i></button>
          <button type="button" class="btn small primary btn-edit-bit" data-id="${b.id}"><i class="fas fa-edit"></i></button>
          <button type="button" class="btn small danger btn-delete-bit" data-id="${b.id}"><i class="fas fa-trash"></i></button>
        </td>
      `;
      tbody.appendChild(tr);
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
  }

  async function loadBitacoras() {
    showLoading();
    renderTableSkeleton('tabla-bitacoras', 9);
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
      loadBitacoras();
    } catch (e) { showToast(parseApiError(e) || 'No se pudo eliminar.', 'error'); }
  }

  // ----- MODAL GENÉRICO ----- Focus trap, foco al abrir/cerrar, Escape cierra
  function openModal(title, bodyHtml, onClose) {
    const modal = qs('#modal');
    const modalBox = qs('#modal .modal-box');
    const previousFocus = document.activeElement;
    if (modalBox) {
      modalBox.classList.remove('pdf-preview-modal', 'dragging');
      modalBox.style.left = '';
      modalBox.style.top = '';
      modalBox.style.width = '';
      modalBox.style.height = '';
      modalBox.style.maxHeight = '';
    }
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
      <div class="form-row">
        <div class="form-group"><label>Código *</label><input type="text" id="m-codigo" maxlength="50" value="${escapeHtml(refaccion && refaccion.codigo) || ''}" required placeholder="Identificador único"></div>
        <div class="form-group"><label>Unidad</label><input type="text" id="m-unidad" maxlength="20" value="${escapeHtml(refaccion && refaccion.unidad) || 'PZA'}"></div>
      </div>
      <div class="form-group"><label>Descripción *</label><input type="text" id="m-descripcion" maxlength="250" value="${escapeHtml(refaccion && refaccion.descripcion) || ''}" required></div>
      <div class="form-row">
        <div class="form-group"><label>Categoría</label><input type="text" id="m-categoria" maxlength="80" value="${escapeHtml(refaccion && refaccion.categoria) || ''}" placeholder="Ej. Fresadora, Torno…"></div>
        <div class="form-group"><label>Subcategoría</label><input type="text" id="m-subcategoria" maxlength="80" value="${escapeHtml(refaccion && refaccion.subcategoria) || ''}" placeholder="Ej. Husillo, Motor…"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Zona (Estante/Rack)</label><input type="text" id="m-zona" maxlength="80" value="${escapeHtml(refaccion && refaccion.zona) || ''}" placeholder="Ej. Estante A-3"></div>
        <div class="form-group"><label>Stock actual</label><input type="number" id="m-stock" step="0.01" min="0" value="${refaccion && refaccion.stock != null ? refaccion.stock : 0}"></div>
        <div class="form-group"><label>Stock mínimo</label><input type="number" id="m-stock-min" step="0.01" min="0" value="${refaccion && refaccion.stock_minimo != null ? refaccion.stock_minimo : 1}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Precio MXN</label><input type="number" id="m-precio" step="0.01" min="0" value="${refaccion && refaccion.precio_unitario != null ? refaccion.precio_unitario : ''}" placeholder="0"></div>
        <div class="form-group"><label>Precio USD</label><input type="number" id="m-precio-usd" step="0.01" min="0" value="${refaccion && refaccion.precio_usd != null ? refaccion.precio_usd : ''}" placeholder="0"></div>
      </div>
      <div class="form-group"><label>Nº parte en manual (Assembly of Parts)</label><input type="text" id="m-noparte" maxlength="80" value="${escapeHtml(refaccion && refaccion.numero_parte_manual) || ''}" placeholder="Ej. 12-34-567"></div>
      <div class="form-row">
        <div class="form-group"><label>URL imagen</label><input type="url" id="m-imagen" maxlength="500" value="${escapeHtml(refaccion && refaccion.imagen_url) || ''}" placeholder="https://..."></div>
        <div class="form-group"><label>URL manual PDF</label><input type="url" id="m-manual" maxlength="500" value="${escapeHtml(refaccion && refaccion.manual_url) || ''}" placeholder="https://..."></div>
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
      const precio = parseFloat(qs('#m-precio').value) || 0;
      let err = validateRequired(codigo, 'Código es obligatorio');
      if (err) { markInvalid('m-codigo', err); return; }
      err = validateRequired(descripcion, 'Descripción es obligatoria');
      if (err) { markInvalid('m-descripcion', err); return; }
      const payload = {
        codigo,
        descripcion,
        zona: qs('#m-zona').value.trim() || null,
        stock: parseFloat(qs('#m-stock').value) || 0,
        stock_minimo: parseFloat(qs('#m-stock-min').value) || 1,
        precio_unitario: precio,
        precio_usd: parseFloat(qs('#m-precio-usd').value) || 0,
        unidad: qs('#m-unidad').value.trim() || 'PZA',
        categoria: qs('#m-categoria').value.trim() || null,
        subcategoria: qs('#m-subcategoria').value.trim() || null,
        imagen_url: qs('#m-imagen').value.trim() || null,
        manual_url: qs('#m-manual').value.trim() || null,
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
        loadRefacciones();
        if (typeof fillRefaccionesSelect === 'function') fillRefaccionesSelect();
      } catch (e) { showToast(parseApiError(e) || 'No se pudo guardar. Revisa los datos.', 'error'); }
      finally { btn.disabled = false; btn.innerHTML = origText; }
    };
  }

  // Modal para ver imagen/manual de refacción
  function openModalRefaccionImagen(ref) {
    const body = `
      <div style="text-align:center;padding:1rem 0">
        <p style="margin-bottom:0.5rem"><strong>Código:</strong> ${escapeHtml(ref.codigo)} &nbsp; <strong>Nº parte:</strong> ${escapeHtml(ref.numero_parte_manual || '—')}</p>
        ${ref.imagen_url ? `<img src="${escapeHtml(ref.imagen_url)}" alt="Imagen refacción" style="max-width:100%;max-height:300px;border-radius:8px;margin-bottom:1rem">` : '<p style="color:#6b7280">Sin imagen registrada.</p>'}
        ${ref.manual_url ? `<div><a href="${escapeHtml(ref.manual_url)}" target="_blank" class="btn outline"><i class="fas fa-file-pdf"></i> Ver manual PDF</a></div>` : '<p style="color:#6b7280">Sin manual registrado.</p>'}
      </div>
    `;
    openModal('Refacción: ' + (ref.descripcion || ref.codigo), body);
  }

  // Modal de ajuste de stock manual
  function openModalAjusteStock(ref) {
    const body = `
      <p style="margin-bottom:1rem">Stock actual: <strong>${Number(ref.stock || 0)}</strong> ${escapeHtml(ref.unidad || 'PZA')}</p>
      <div class="form-row">
        <div class="form-group"><label>Tipo</label>
          <select id="m-tipo-mov">
            <option value="entrada">Entrada (+)</option>
            <option value="salida">Salida (−)</option>
          </select>
        </div>
        <div class="form-group"><label>Cantidad *</label><input type="number" id="m-cant-mov" min="0.01" step="0.01" value="1"></div>
        <div class="form-group"><label>Costo unitario (MXN)</label><input type="number" id="m-costo-mov" min="0" step="0.01" value="${ref.precio_unitario || 0}"></div>
      </div>
      <div class="form-group"><label>Referencia</label><input type="text" id="m-ref-mov" maxlength="100" placeholder="Nº orden, proveedor…"></div>
      <div class="form-actions">
        <button type="button" class="btn primary" id="m-save"><i class="fas fa-boxes"></i> Aplicar</button>
        <button type="button" class="btn" id="modal-btn-cancel">Cancelar</button>
      </div>
    `;
    openModal('Ajustar stock: ' + escapeHtml(ref.codigo), body);
    qs('#m-save').onclick = async () => {
      const cant = parseFloat(qs('#m-cant-mov').value) || 0;
      if (cant <= 0) { showToast('La cantidad debe ser mayor que 0.', 'error'); return; }
      const payload = {
        tipo: qs('#m-tipo-mov').value,
        cantidad: cant,
        costo_unitario: parseFloat(qs('#m-costo-mov').value) || 0,
        referencia: qs('#m-ref-mov').value.trim() || null,
      };
      try {
        await fetchJson(API + '/refacciones/' + ref.id + '/ajuste-stock', { method: 'POST', body: JSON.stringify(payload) });
        qs('#modal').classList.add('hidden');
        showToast('Stock actualizado.', 'success');
        loadRefacciones();
      } catch (e) { showToast(parseApiError(e), 'error'); }
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
        tbody.innerHTML = '<tr><td colspan="7" class="empty">Sin eventos (o autenticación desactivada en el servidor).</td></tr>';
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

  function crossfilterEntityLabel(key) {
    const m = {
      clientes: 'Clientes',
      refacciones: 'Refacciones',
      maquinas: 'Máquinas',
      cotizaciones: 'Cotizaciones',
      incidentes: 'Incidentes',
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
    const idxMap = { cotizaciones: 0, incidentes: 1, bitacoras: 2 };
    const baseDonut = ['#059669', '#ea580c', '#7c3aed'];
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
      const raw = await Promise.all([
        fetchJson(API + '/clientes').catch(() => []),
        fetchJson(API + '/refacciones').catch(() => []),
        fetchJson(API + '/maquinas').catch(() => []),
        fetchJson(API + '/cotizaciones').catch(() => []),
        fetchJson(API + '/incidentes').catch(() => []),
        fetchJson(API + '/bitacoras').catch(() => []),
        fetchJson(API + '/dashboard-stats').catch(() => null),
      ]);
      const toArr = (x) => (x && Array.isArray(x) ? x : []);
      const clientes = toArr(raw[0]);
      const refacciones = toArr(raw[1]);
      const maquinas = toArr(raw[2]);
      const cotizaciones = toArr(raw[3]);
      const incidentes = toArr(raw[4]);
      const bitacoras = toArr(raw[5]);
      const dashboardStats = raw[6] && typeof raw[6] === 'object' ? raw[6] : null;
      const clientesCtx = applyGlobalBranchFilterRows(clientes);
      const clienteNamesCtx = new Set(clientesCtx.map(c => String(c && c.nombre || '').trim().toLowerCase()).filter(Boolean));
      const maquinasCtx = globalBranchFilter ? maquinas.filter(m => clienteNamesCtx.has(String(m && m.cliente_nombre || '').trim().toLowerCase())) : maquinas;
      const cotizacionesCtx = globalBranchFilter ? cotizaciones.filter(c => clienteNamesCtx.has(String(c && c.cliente_nombre || '').trim().toLowerCase())) : cotizaciones;
      const incidentesCtx = globalBranchFilter ? incidentes.filter(i => clienteNamesCtx.has(String(i && i.cliente_nombre || '').trim().toLowerCase())) : incidentes;
      const bitacorasCtx = bitacoras;
      if (loading) {
        loading.classList.add('hidden');
        loading.remove();
      }
      const now = new Date();
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const ciudades = new Set(clientesCtx.map(c => (c.ciudad || '').trim()).filter(Boolean)).size;
      const conRfc = clientesCtx.filter(c => (c.rfc || '').trim()).length;
      const valorCatalogo = refacciones.reduce((s, r) => s + (Number(r.precio_unitario) || 0), 0);
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
      const incAbiertos = incidentesCtx.filter(i => (i.estatus || '') === 'abierto').length;
      const incEnProceso = incidentesCtx.filter(i => (i.estatus || '') === 'en_proceso').length;
      const incAltaCritica = incidentesCtx.filter(i => /^(alta|critica)$/i.test(i.prioridad || '')).length;
      const incCerrados = incidentesCtx.filter(i => (i.estatus || '') === 'cerrado').length;
      const bitHoras = bitacorasCtx.reduce((s, b) => s + (Number(b.tiempo_horas) || 0), 0);
      const tecnicos = new Set(bitacorasCtx.map(b => (b.tecnico || '').trim()).filter(Boolean)).size;
      const bitEsteMes = bitacorasCtx.filter(b => (b.fecha || '').slice(0, 7) === thisMonthStart.slice(0, 7)).length;
      const incTotal = incidentesCtx.length;
      const incProgress = incTotal ? Math.round((incCerrados / incTotal) * 100) : 0;
      const cotMontoMes = cotizacionesCtx
        .filter(c => (c.fecha || '').slice(0, 7) === thisMonthStart.slice(0, 7))
        .reduce((s, c) => s + (Number(c.total) || 0), 0);
      const bitHorasMes = bitacorasCtx
        .filter(b => (b.fecha || '').slice(0, 7) === thisMonthStart.slice(0, 7))
        .reduce((s, b) => s + (Number(b.tiempo_horas) || 0), 0);
      const incUrgentesAbiertos = incidentesCtx.filter(i => {
        const est = String(i.estatus || '').toLowerCase();
        if (est === 'cerrado') return false;
        return /^(alta|critica)$/i.test(String(i.prioridad || ''));
      }).length;

      const execEl = document.createElement('div');
      execEl.className = 'dashboard-exec-scorecards';
      execEl.setAttribute('aria-label', 'Scorecard ejecutivo');
      execEl.innerHTML = `
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
        <article class="dashboard-score-tile dashboard-score-tile--risk" data-crossfilter-entity="incidentes" title="Clic: filtrar vista por incidentes">
          <span class="dashboard-score-eyebrow">Riesgo operativo</span>
          <span class="dashboard-score-label">Urgencias abiertas</span>
          <strong class="dashboard-score-value">${escapeHtml(String(incUrgentesAbiertos))}</strong>
          <span class="dashboard-score-meta"><i class="fas fa-fire"></i> Alta/crítica sin cerrar · ${escapeHtml(String(incAbiertos))} abiertos en total</span>
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
        { label: 'Cotizaciones (monto)', value: formatMoney(cotTotal), icon: 'fa-file-invoice-dollar', cf: 'cotizaciones' },
        { label: 'Incidentes abiertos', value: incAbiertos, icon: 'fa-exclamation-triangle', cf: 'incidentes' },
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
        { id: 'cotizaciones', icon: 'fa-file-invoice-dollar', title: 'Cotizaciones', goto: 'cotizaciones', rows: [{ label: 'Total', value: cotizacionesCtx.length, v: 'neutral' }, { label: 'Monto total', value: formatMoney(cotTotal), v: 'positive' }, { label: 'Este mes', value: cotEsteMes, v: 'positive' }, { label: 'Refacciones / Mano obra', value: cotRefacciones + ' / ' + cotManoObra, v: 'neutral' }] },
        { id: 'incidentes', icon: 'fa-exclamation-triangle', title: 'Incidentes', goto: 'incidentes', progress: incProgress, rows: [{ label: 'Total', value: incTotal, v: 'neutral' }, { label: 'Abiertos', value: incAbiertos, v: incAbiertos > 0 ? 'alert' : 'neutral' }, { label: 'En proceso', value: incEnProceso, v: 'neutral' }, { label: 'Alta/Crítica', value: incAltaCritica, v: incAltaCritica > 0 ? 'alert' : 'neutral' }, { label: 'Cerrados', value: incCerrados, v: 'positive' }] },
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

      // Rellenar cachés y tablas con los datos ya cargados (si algo falla no rompemos el dashboard)
      try {
        cotizacionesCache = cotizaciones;
        incidentesCache = incidentes;
        bitacorasCache = bitacoras;
        const filtCot = applyFilters(cotizacionesCache, getFilterValues('#tabla-cotizaciones'), 'tabla-cotizaciones');
        const filtInc = applyFilters(incidentesCache, getFilterValues('#tabla-incidentes'), 'tabla-incidentes');
        const filtBit = applyFilters(bitacorasCache, getFilterValues('#tabla-bitacoras'), 'tabla-bitacoras');
        renderCotizaciones(filtCot, cotizacionesCache.length);
        renderIncidentes(filtInc, incidentesCache.length);
        renderBitacoras(filtBit, bitacorasCache.length);
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
          const inc = p.incidentes; const incPrev = prev.incidentes;
          const bit = p.bitacoras; const bitPrev = prev.bitacoras;
          return `
            <div class="dashboard-stat-card" data-period="${period}">
              <h4 class="dashboard-stat-card-title-cf" title="Clic en una fila de métrica para filtrar">${escapeHtml(titulo)}</h4>
              <div class="stat-row stat-row-crossfilter" data-dimension="cotizaciones" title="${rowHint}"><span class="stat-label">Cotizaciones</span><span><span class="stat-value">${cot.count}</span> <span class="stat-diff ${diffClass(cot.count, cotPrev.count)}">${diffText(cot.count, cotPrev.count)}</span></span></div>
              <div class="stat-row stat-row-crossfilter" data-dimension="cotizaciones" title="${rowHint}"><span class="stat-label">Monto cotiz.</span><span><span class="stat-value">${formatMoney(cot.monto)}</span> <span class="stat-diff ${diffClass(cot.monto, cotPrev.monto)}">${diffText(cot.monto, cotPrev.monto)}</span></span></div>
              <div class="stat-row stat-row-crossfilter" data-dimension="incidentes" title="${rowHint}"><span class="stat-label">Incidentes</span><span><span class="stat-value">${inc.count}</span> <span class="stat-diff ${diffClass(inc.count, incPrev.count)}">${diffText(inc.count, incPrev.count)}</span></span></div>
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
          if (chartDonut) {
            chartDonut.destroy();
            chartDonut = null;
          }
          if (chartBars) {
            chartBars.destroy();
            chartBars = null;
          }
          const nCot = cotizacionesCtx.length;
          const nInc = incidentesCtx.length;
          const nBit = bitacorasCtx.length;
          const donutCtx = document.getElementById('chart-donut');
          if (donutCtx && (nCot + nInc + nBit > 0)) {
            chartDonut = new Chart(donutCtx, {
              type: 'doughnut',
              data: {
                labels: ['Cotizaciones', 'Incidentes', 'Bitácoras'],
                datasets: [{ data: [nCot, nInc, nBit], backgroundColor: ['#059669', '#ea580c', '#7c3aed'], borderColor: '#1e293b', borderWidth: 2 }],
              },
              options: {
                responsive: true,
                maintainAspectRatio: true,
                onHover: function (e, els) { if (e.native && e.native.target) e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
                onClick: function (_evt, elements) {
                  if (!elements || !elements.length) return;
                  const keys = ['cotizaciones', 'incidentes', 'bitacoras'];
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
                  { label: 'Actual', data: [p.semana_actual?.cotizaciones?.count ?? 0, p.mes_actual?.cotizaciones?.count ?? 0, p.año_actual?.cotizaciones?.count ?? 0], backgroundColor: 'rgba(56,189,248,0.8)', borderColor: '#38bdf8', borderWidth: 1 },
                  { label: 'Anterior', data: [p.semana_anterior?.cotizaciones?.count ?? 0, p.mes_anterior?.cotizaciones?.count ?? 0, p.año_anterior?.cotizaciones?.count ?? 0], backgroundColor: 'rgba(148,163,184,0.6)', borderColor: '#94a3b8', borderWidth: 1 },
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
        } else if (chartsEl) {
          chartsEl.style.display = 'none';
        }
        } else if (adv) {
          adv.style.display = 'none';
        }
      } catch (errAdv) {
        console.error('Dashboard estadísticas/gráficos:', errAdv);
        const adv = qs('#dashboard-advanced');
        if (adv) adv.style.display = 'none';
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
      const st = await fetchJson(API + '/seed-status');
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
    await loadClientes();
    await loadRefacciones();
    await loadMaquinas();
    await loadCotizaciones();
    await loadIncidentes();
    await loadBitacoras();
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
    await loadClientes();
    await loadRefacciones();
    await loadMaquinas();
    await loadCotizaciones();
    await loadIncidentes();
    await loadBitacoras();
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
    if (id === 'clientes') loadClientes();
    if (id === 'refacciones') loadRefacciones();
    if (id === 'maquinas') loadMaquinas();
    if (id === 'cotizaciones') loadCotizaciones();
    if (id === 'incidentes') loadIncidentes();
    if (id === 'bitacoras') loadBitacoras();
    loadSeedStatus(false);
    loadStorageHealth();
    if (!silent) showToast('Datos actualizados.', 'success');
  }

  async function seedDemo(useForce) {
    const btn = qs('#btn-seed-demo');
    // Si no recibimos useForce, detectamos si ya hay datos y preguntamos
    if (useForce === undefined) {
      try {
        const status = await fetchJson(API + '/seed-status');
        if (status && status.clientes > 0) {
          const ok = confirm(
            '⚠️ Ya hay datos cargados (' + status.clientes + ' clientes).\n\n' +
            '¿Quieres BORRAR todo y cargar el demo completo desde cero?\n\n' +
            'Esto eliminará clientes, refacciones, cotizaciones, incidentes, garantías, bonos y viajes.'
          );
          if (!ok) return;
          useForce = true;
        } else {
          useForce = false;
        }
      } catch (_) { useForce = false; }
    }
    btn.disabled = true;
    btn.textContent = 'Cargando…';
    try {
      const data = await fetchJson(API + '/seed-demo', {
        method: 'POST',
        body: JSON.stringify({ force: !!useForce }),
      });
      qs('#seed-status').innerHTML =
        `Listo: <strong>${data.clientes}</strong> clientes, <strong>${data.refacciones}</strong> refacciones, ` +
        `<strong>${data.maquinas}</strong> máquinas, <strong>${data.cotizaciones || 0}</strong> cotizaciones, ` +
        `<strong>${data.incidentes || 0}</strong> incidentes, <strong>${data.bitacoras || 0}</strong> bitácoras, ` +
        `<strong>${data.reportes || 0}</strong> reportes, <strong>${data.garantias || 0}</strong> garantías, ` +
        `<strong>${data.bonos || 0}</strong> bonos, <strong>${data.viajes || 0}</strong> viajes.`;
      btn.textContent = 'Datos demo cargados';
      loadSeedStatus();
      loadClientes();
      loadRefacciones();
      loadMaquinas();
      fillClientesSelect();
      await loadCotizaciones();
      await loadIncidentes();
      await loadBitacoras();
      showPanel('bitacoras', { skipLoad: true });
      showToast('Demo completo cargado: clientes, cotizaciones, incidentes, reportes, garantías, bonos y viajes.', 'success');
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
    if (q) filtered = filtered.filter(r => [r.codigo, r.descripcion, r.marca].some(v => normalizeForSearch(v).includes(normalizeForSearch(q))));
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
    const filtered = applyFilters(applyGlobalBranchFilterRows(maquinasCache), getFilterValues('#tabla-maquinas'), tid);
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
    const filtered = applyFilters(applyGlobalBranchFilterRows(cotizacionesCache), getFilterValues('#tabla-cotizaciones'), tid);
    const pageSize = getPageSize(tid);
    let page = getPaginationState(tid);
    const maxPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
    if (page > maxPage) { setPaginationPage(tid, 0); page = 0; }
    const slice = filtered.slice(page * pageSize, (page + 1) * pageSize);
    const popts = filtered.length > pageSize ? { page, pageSize, totalFiltered: filtered.length, onPrev: () => { setPaginationPage(tid, page - 1); applyCotizacionesFiltersAndRender(); }, onNext: () => { setPaginationPage(tid, page + 1); applyCotizacionesFiltersAndRender(); }, onPageSizeChange: (t, size) => { setPageSize(t, size); applyCotizacionesFiltersAndRender(); } } : undefined;
    renderCotizaciones(slice, cotizacionesCache.length, popts);
  }
  function applyIncidentesFiltersAndRender() {
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
  qs('#nuevo-incidente').addEventListener('click', () => openModalIncidente(null));
  qs('#nueva-bitacora').addEventListener('click', () => openModalBitacora(null));
  // Nuevos módulos
  const btnNuevoReporte = qs('#nuevo-reporte');
  if (btnNuevoReporte) btnNuevoReporte.addEventListener('click', () => openModalReporte(null));
  const btnNuevaGarantia = qs('#nueva-garantia');
  if (btnNuevaGarantia) btnNuevaGarantia.addEventListener('click', () => openModalGarantia(null));
  const btnNuevoBono = qs('#nuevo-bono');
  if (btnNuevoBono) btnNuevoBono.addEventListener('click', () => openModalBono(null));
  const btnNuevoViaje = qs('#nuevo-viaje');
  if (btnNuevoViaje) btnNuevoViaje.addEventListener('click', () => openModalViaje(null));
  const btnLiquidacion = qs('#btn-viajes-liquidacion');
  if (btnLiquidacion) btnLiquidacion.addEventListener('click', () => generarLiquidacionMensual());
  const btnGarantiasAlertas = qs('#btn-garantias-alertas');
  if (btnGarantiasAlertas) btnGarantiasAlertas.addEventListener('click', () => checkGarantiasAlertas());
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
  qs('#export-incidentes').addEventListener('click', () => exportToCsv(enrichIncidentesForExport(applyFilters(incidentesCache, getFilterValues('#tabla-incidentes'), 'tabla-incidentes')), 'tabla-incidentes', 'incidentes'));
  qs('#export-excel-incidentes').addEventListener('click', () => exportToExcel(enrichIncidentesForExport(applyFilters(incidentesCache, getFilterValues('#tabla-incidentes'), 'tabla-incidentes')), 'tabla-incidentes', 'incidentes'));
  qs('#export-bitacoras').addEventListener('click', () => exportToCsv(enrichBitacorasForExport(applyFilters(bitacorasCache, getFilterValues('#tabla-bitacoras'), 'tabla-bitacoras')), 'tabla-bitacoras', 'bitacoras'));
  qs('#export-excel-bitacoras').addEventListener('click', () => exportToExcel(enrichBitacorasForExport(applyFilters(bitacorasCache, getFilterValues('#tabla-bitacoras'), 'tabla-bitacoras')), 'tabla-bitacoras', 'bitacoras'));

  function updateHeaderUrgencies() {
    const el = qs('#header-alerts');
    if (!el) return;
    let urgent = 0;
    (incidentesCache || []).forEach(inc => {
      const d = getDiasRestantesSemaphore(inc);
      if (d.dias !== null && d.dias <= 3) urgent++;
    });
    if (urgent === 0) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = `<a href="#" class="alert-badge alert-urgent" id="header-alert-incidentes" role="button"><i class="fas fa-exclamation-triangle"></i> ${urgent} incidente${urgent !== 1 ? 's' : ''} por vencer</a>`;
    qs('#header-alert-incidentes').addEventListener('click', function (e) {
      e.preventDefault();
      showPanel('incidentes');
    });
    try {
      if (typeof showUrgentNotificationIfGranted === 'function' && !sessionStorage.getItem('notif-urgent-shown')) {
        showUrgentNotificationIfGranted();
        sessionStorage.setItem('notif-urgent-shown', '1');
      }
    } catch (_) {}
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      const modal = qs('#modal');
      if (modal && !modal.classList.contains('hidden')) modal.classList.add('hidden');
    }
    const inInput = document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].indexOf(document.activeElement.tagName) >= 0;
    if (!inInput && (e.ctrlKey || e.metaKey)) {
      const tabMap = { '0': 'dashboards', '1': 'clientes', '2': 'refacciones', '3': 'maquinas', '4': 'cotizaciones', '5': 'incidentes', '6': 'bitacoras', '7': 'acerca' };
      const uK = getSessionUser();
      if (serverConfig.auditUi && uK && uK.role === 'admin') tabMap['8'] = 'auditoria';
      const tab = tabMap[e.key];
      if (tab) { e.preventDefault(); showPanel(tab); }
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
        <li><kbd>Ctrl</kbd>+<kbd>5</kbd> … Incidentes</li>
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

  function syncThemeColorMeta() {
    const m = qs('#meta-theme-color');
    if (!m) return;
    const primary = (serverConfig && serverConfig.primaryHex) || '#1e3a5f';
    m.setAttribute('content', document.body.classList.contains('dark-theme') ? '#0f172a' : primary);
  }
  function initTheme() {
    const dark = localStorage.getItem('cotizacion-dark') === '1';
    const hc = localStorage.getItem('cotizacion-dark-hc') === '1';
    const icon = qs('#theme-icon');
    const contrastBtn = qs('#contrast-toggle');
    if (dark) { document.body.classList.add('dark-theme'); if (icon) { icon.classList.remove('fa-moon'); icon.classList.add('fa-sun'); } }
    else { document.body.classList.remove('dark-theme'); if (icon) { icon.classList.remove('fa-sun'); icon.classList.add('fa-moon'); } }
    document.body.classList.toggle('dark-high-contrast', dark && hc);
    if (contrastBtn) {
      contrastBtn.classList.toggle('is-active', dark && hc);
      contrastBtn.setAttribute('aria-pressed', dark && hc ? 'true' : 'false');
      contrastBtn.disabled = !dark;
      contrastBtn.title = dark ? 'Alto contraste en modo oscuro' : 'Activa tema oscuro para usar alto contraste';
    }
    syncThemeColorMeta();
  }
  function toggleTheme() {
    const dark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('cotizacion-dark', dark ? '1' : '0');
    const icon = qs('#theme-icon');
    if (icon) { icon.classList.toggle('fa-moon', !dark); icon.classList.toggle('fa-sun', dark); }
    const hcEnabled = localStorage.getItem('cotizacion-dark-hc') === '1';
    document.body.classList.toggle('dark-high-contrast', dark && hcEnabled);
    const contrastBtn = qs('#contrast-toggle');
    if (contrastBtn) {
      contrastBtn.classList.toggle('is-active', dark && hcEnabled);
      contrastBtn.setAttribute('aria-pressed', dark && hcEnabled ? 'true' : 'false');
      contrastBtn.disabled = !dark;
      contrastBtn.title = dark ? 'Alto contraste en modo oscuro' : 'Activa tema oscuro para usar alto contraste';
    }
    syncThemeColorMeta();
  }
  const themeBtn = qs('#theme-toggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
  const contrastBtn = qs('#contrast-toggle');
  if (contrastBtn) {
    contrastBtn.addEventListener('click', function () {
      if (!document.body.classList.contains('dark-theme')) {
        showToast('Activa tema oscuro para usar alto contraste.', 'error');
        return;
      }
      const active = document.body.classList.toggle('dark-high-contrast');
      localStorage.setItem('cotizacion-dark-hc', active ? '1' : '0');
      contrastBtn.classList.toggle('is-active', active);
      contrastBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
      showToast(active ? 'Alto contraste activado.' : 'Alto contraste desactivado.', 'success');
    });
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

  /** Primera visita: tips rápidos (se guarda al cerrar el modal) */
  function startGuidedTour() {
    const steps = [
      { panel: 'dashboards', title: 'Dashboard ejecutivo', text: 'Aquí ves KPIs, scorecards, comparativos y gráficas. Puedes cruzar filtros con clics como en BI.', icon: 'fa-chart-pie', gradient: 'g-teal', bullets: ['Cruza filtros por entidad y periodo', 'Monitorea indicadores semanales/mensuales', 'Accede rápido a respaldos y reportes'] },
      { panel: 'clientes', title: 'Catálogo de clientes', text: 'Registra clientes, RFC, ciudad y contacto. La ciudad alimenta el filtro global por sucursal.', icon: 'fa-users', gradient: 'g-blue', bullets: ['Alta rápida con validaciones', 'Datos listos para cotizaciones/incidentes', 'Ciudad usada para filtro global'] },
      { panel: 'cotizaciones', title: 'Cotizaciones profesionales', text: 'Crea y exporta cotizaciones. Desde aquí también puedes generar PDF cliente o interno.', icon: 'fa-file-invoice-dollar', gradient: 'g-indigo', bullets: ['Flujo de creación y edición ágil', 'PDF de una página optimizado A4', 'Vista previa antes de imprimir'] },
      { panel: 'incidentes', title: 'Incidentes y SLA', text: 'Controla incidentes, prioridad, vencimiento y estatus operativo.', icon: 'fa-triangle-exclamation', gradient: 'g-orange', bullets: ['Semáforos para urgencia y SLA', 'Seguimiento por cliente/máquina', 'Exportación ejecutiva para operación'] },
      { panel: 'bitacoras', title: 'Bitácora de horas', text: 'Registra actividades y horas por incidente/cotización para trazabilidad.', icon: 'fa-clock', gradient: 'g-violet', bullets: ['Historial técnico por actividad', 'Base para control de productividad', 'Reporte PDF cliente/interno'] },
      { panel: 'demo', title: 'Respaldos y persistencia', text: 'Aquí gestionas estado de persistencia, backups manuales y automáticos.', icon: 'fa-shield-halved', gradient: 'g-slate', bullets: ['Exporta/importa respaldo JSON', 'Backups automáticos con retención', 'Estado de almacenamiento en tiempo real'] },
    ];
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
      const last = localStorage.getItem(LAST_TAB_KEY);
      if (last === 'auditoria') {
        const u = getSessionUser();
        if (serverConfig.auditUi && u && u.role === 'admin') {
          showPanel('auditoria');
          return;
        }
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
      { id: 'cotizaciones', label: 'Cotizaciones', icon: 'fa-file-invoice-dollar' },
      { id: 'incidentes', label: 'Incidentes', icon: 'fa-exclamation-triangle' },
      { id: 'bitacoras', label: 'Bitácora de horas', icon: 'fa-clock' },
      { id: 'demo', label: 'Cargar demo', icon: 'fa-database' },
      { id: 'acerca', label: 'Acerca de', icon: 'fa-info-circle' },
    ];
    const uPal = getSessionUser();
    if (serverConfig.auditUi && uPal && uPal.role === 'admin') {
      sections.splice(8, 0, { id: 'auditoria', label: 'Auditoría (admin)', icon: 'fa-clipboard-list' });
    }
    function render(q) {
      const qn = (q || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const sectionItems = sections.filter(s => !qn || s.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(qn)).map(s => ({ type: 'section', ...s }));
      const clientItems = (clientesCache || []).filter(c => !qn || (c.nombre || '').toLowerCase().includes(qn) || (c.codigo || '').toLowerCase().includes(qn)).slice(0, 5).map(c => ({ type: 'cliente', id: c.id, label: c.nombre, meta: c.codigo, icon: 'fa-user' }));
      const cotItems = (cotizacionesCache || []).filter(c => !qn || (c.folio || '').toLowerCase().includes(qn)).slice(0, 5).map(c => ({ type: 'cotizacion', id: c.id, label: c.folio, meta: c.cliente_nombre, icon: 'fa-file-invoice' }));
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
          if (action === 'edit-incidente' && id) { showPanel('incidentes'); setTimeout(() => editIncidente(id), 100); }
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
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
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
      qs('#seed-status').innerHTML = `Listo: <strong>${data.incidentes || 0}</strong> incidentes, <strong>${data.bitacoras || 0}</strong> bitácoras, <strong>${data.cotizaciones || 0}</strong> cotizaciones agregados.`;
      loadSeedStatus();
      await loadCotizaciones();
      await loadIncidentes();
      await loadBitacoras();
      if ((data.incidentes || 0) === 0 || (data.bitacoras || 0) === 0) {
        showToast('No se insertaron incidentes ni bitácoras. Los nombres de cliente y máquina en seed-demo.json deben coincidir con los de Clientes y Máquinas. Prueba "Cargar datos demo ahora" si la base estaba vacía.', 'error');
      } else {
        showPanel('incidentes', { skipLoad: true });
      }
    } catch (e) {
      let msg = e.message;
      try { const o = JSON.parse(msg); if (o.error) msg = o.error; } catch (_) {}
      qs('#seed-status').innerHTML = '<span class="error-msg">Error: ' + escapeHtml(msg) + '</span>';
    }
    btn.disabled = false;
    btn.textContent = 'Cargar solo incidentes, bitácoras y cotizaciones demo';
  });
  loadBackupFilesList();

  let refreshIntervalId = null;
  function finishBoot() {
    showLoginOverlay(false);
    initTheme();
    syncSessionHeader();
    updateAuditTabVisibility();
    initSoundToggleButton();
    renderNotificationsPanel();
    updateNotificationsBadge();
    initOnboarding();
    restoreLastTabOrDefault();
    loadDashboard();
    fillClientesSelect();
    loadSeedStatus();
    loadStorageHealth();
    loadRecentAuditNotifications();
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
        loadClientes();
        loadRefacciones();
        loadMaquinas();
        loadCotizaciones();
        loadIncidentes();
        loadBitacoras();
      }, REFRESH_INTERVAL_MS);
    }
  }
  async function boot() {
    await fetchServerConfig();
    applyBranding();
    updateAuditTabVisibility();
    initSoundToggleButton();
    syncSessionHeader();
    if (serverConfig.authRequired && !getAuthToken()) {
      showLoginOverlay(true);
      const hint = qs('#login-hint');
      if (hint) hint.textContent = 'Introduce las credenciales que configuró el administrador del servidor (variable AUTH_ENABLED).';
      setupLoginForm();
      initTheme();
      syncThemeColorMeta();
      return;
    }
    finishBoot();
  }
  boot();
})();
