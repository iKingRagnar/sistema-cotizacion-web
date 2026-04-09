(function () {
  const API = '/api';
  const AUTH_TOKEN_KEY = 'cotizacion-auth-token';
  const AUTH_USER_KEY = 'cotizacion-auth-user';
  const SOUND_PREF_KEY = 'cotizacion-sound';
  const BGM_MUTED_KEY = 'cotizacion-bgm-muted';
  const BGM_VOL_KEY = 'cotizacion-bgm-vol';
  const BGM_DEFAULT_VOL = 0.05;
  const BGM_VOL_STEP = 0.05;
  const BGM_SRC = '/audio/Technology-Song.wav';
  let bgMusicEl = null;
  let refreshSoundToggleUi = function () {};
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
  /** Evita llamar varias veces a /demo-ensure-maquinas en la misma carga de página. */
  let seedDemoEnsureOnce = false;

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
  function isBgmMuted() {
    try { return localStorage.getItem(BGM_MUTED_KEY) === '1'; } catch (_) { return false; }
  }
  function setBgmMuted(muted) {
    try { localStorage.setItem(BGM_MUTED_KEY, muted ? '1' : '0'); } catch (_) {}
    applyBgmPlaybackState();
  }
  function getBgmVolume() {
    try {
      const v = parseFloat(localStorage.getItem(BGM_VOL_KEY));
      if (!isNaN(v) && v >= 0 && v <= 1) return v;
    } catch (_) {}
    return BGM_DEFAULT_VOL;
  }
  function setBgmVolumeStored(v) {
    v = Math.max(0, Math.min(1, v));
    try { localStorage.setItem(BGM_VOL_KEY, String(v)); } catch (_) {}
    return v;
  }
  function applyBgmPlaybackState() {
    if (!bgMusicEl) return;
    const muted = isBgmMuted();
    bgMusicEl.volume = getBgmVolume();
    if (muted) {
      try { bgMusicEl.pause(); } catch (_) {}
    } else {
      bgMusicEl.muted = false;
      const p = bgMusicEl.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    }
  }
  function initBackgroundMusicOnce() {
    if (bgMusicEl) return;
    const audio = new Audio();
    audio.src = BGM_SRC;
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = getBgmVolume();
    bgMusicEl = audio;
    function tryPlay() {
      if (isBgmMuted()) return;
      audio.muted = false;
      audio.volume = getBgmVolume();
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    }
    if (isBgmMuted()) {
      try { audio.pause(); } catch (_) {}
    }
    document.addEventListener('click', tryPlay, { once: true });
    document.addEventListener('pointerdown', tryPlay, { once: true });
    document.addEventListener('keydown', tryPlay, { once: true });
    tryPlay();
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && bgMusicEl && !isBgmMuted()) {
        const p = bgMusicEl.play();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      }
    });
    document.addEventListener('keydown', function onBgmVolKey(e) {
      const t = e.target;
      if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.code !== 'NumpadAdd' && e.code !== 'NumpadSubtract') return;
      e.preventDefault();
      let v = getBgmVolume();
      if (e.code === 'NumpadAdd') v = setBgmVolumeStored(Math.min(1, v + BGM_VOL_STEP));
      else v = setBgmVolumeStored(Math.max(0, v - BGM_VOL_STEP));
      if (bgMusicEl) bgMusicEl.volume = v;
      if (v > 0 && isBgmMuted()) setBgmMuted(false);
      else applyBgmPlaybackState();
      refreshSoundToggleUi();
    });
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
  // Helpers de permisos por rol
  function canAdd() {
    const u = getSessionUser();
    if (!serverConfig.authRequired) return true;
    return u && ['admin', 'operador', 'usuario'].includes(u.role);
  }
  function canEdit() {
    const u = getSessionUser();
    if (!serverConfig.authRequired) return true;
    return u && ['admin', 'operador'].includes(u.role);
  }
  function canDelete() {
    const u = getSessionUser();
    if (!serverConfig.authRequired) return true;
    return u && u.role === 'admin';
  }
  function getRoleLabel(role) {
    const labels = { admin: 'Administrador', operador: 'Operador', usuario: 'Usuario', consulta: 'Consulta' };
    return labels[role] || role || '—';
  }
  /** Comisiones, bonos y % de ganancia: solo administrador cuando la app exige login. */
  function canViewCommissions() {
    if (!serverConfig.authRequired) return true;
    const u = getSessionUser();
    return !!(u && u.role === 'admin');
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
    const tagEl = qs('#app-tagline');
    const short = c.shortName || c.appName || 'Gestor Administrativo';
    if (nameEl) nameEl.textContent = short;
    if (tagEl) tagEl.textContent = c.tagline || '';
    // Login panel branding
    const lbName = qs('#login-brand-name');
    const lbTagline = qs('#login-brand-tagline');
    if (lbName) lbName.textContent = c.appName || short;
    if (lbTagline) lbTagline.textContent = c.tagline || '';
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
      if (o && o.error) {
        if (Array.isArray(o.errores) && o.errores.length) {
          return o.error + '\n' + o.errores.join('\n');
        }
        return o.error;
      }
    } catch (_) {}
    return msg;
  }

  const LAST_TAB_KEY = 'cotizacion-last-tab';
  const VALID_TABS = ['dashboards', 'clientes', 'refacciones', 'maquinas', 'cotizaciones', 'reportes', 'garantias', 'mantenimiento-garantia', 'garantias-sin-cobertura', 'bonos', 'bitacoras'];
  const TABS_PERSIST = VALID_TABS.concat(['auditoria']);
  let reportesCache = [];
  let garantiasCache = [];
  let mantenimientosGarantiaCache = [];
  let garantiasSinCoberturaCache = [];
  let bonosCache = [];
  let viajesCache = [];
  let tecnicosCache = [];
  let lastQuickRefreshAt = 0;
  function spawnLoginParticles() {
    const overlay = qs('#login-overlay');
    if (!overlay || overlay._particlesSpawned) return;
    overlay._particlesSpawned = true;
    const colors = [
      'rgba(14,148,163,0.7)', 'rgba(99,102,241,0.6)',
      'rgba(255,255,255,0.4)', 'rgba(14,148,163,0.4)',
      'rgba(30,58,95,0.8)',
    ];
    const count = 28;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('span');
      p.className = 'login-particle';
      const size = (Math.random() * 6 + 3).toFixed(1) + 'px';
      const left = (Math.random() * 100).toFixed(1) + '%';
      const dur = (Math.random() * 10 + 7).toFixed(1) + 's';
      const delay = (Math.random() * 10).toFixed(1) + 's';
      const px = ((Math.random() - 0.5) * 80).toFixed(1) + 'px';
      const color = colors[Math.floor(Math.random() * colors.length)];
      p.style.cssText = `--size:${size};--lft:${left};--dur:${dur};--delay:${delay};--px:${px};--color:${color}`;
      overlay.appendChild(p);
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
    if (!tab) return;
    const u = getSessionUser();
    const show = !!(serverConfig.auditUi && u && u.role === 'admin');
    tab.classList.toggle('hidden', !show);
    updateCommissionsUiVisibility();
  }
  function syncSessionHeader() {
    const wrap = qs('#header-session');
    const label = qs('#header-session-user');
    const out = qs('#btn-logout');
    if (!wrap || !label) return;
    const u = getSessionUser();
    if (u) {
      wrap.classList.remove('hidden');
      label.textContent = (u.displayName || u.username || '') + ' · ' + getRoleLabel(u.role);
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
  function initSoundToggleButton() {
    const btn = qs('#btn-sound-toggle');
    if (!btn || btn._bound) return;
    btn._bound = true;
    initBackgroundMusicOnce();
    function refresh() {
      const musicOn = !isBgmMuted();
      btn.setAttribute('aria-pressed', musicOn ? 'true' : 'false');
      btn.title = musicOn
        ? ('Música de fondo: activa (~' + Math.round(getBgmVolume() * 100) + '%). Num+ / Num− volumen. Clic silencia.')
        : ('Música de fondo: silenciada. Clic para activar. Num+ / Num− volumen.');
      const i = btn.querySelector('i');
      if (i) {
        i.classList.toggle('fa-volume-up', musicOn);
        i.classList.toggle('fa-volume-mute', !musicOn);
      }
    }
    refreshSoundToggleUi = refresh;
    refresh();
    btn.addEventListener('click', function () {
      setBgmMuted(!isBgmMuted());
      refresh();
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
      'mantenimiento-garantia': 'Mantenimientos por garantía',
      'garantias-sin-cobertura': 'Sin cobertura',
      bonos: 'Bonos',
      ventas: 'Ventas',
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
    if (id === 'bonos' && !canViewCommissions()) {
      showToast('Solo el administrador puede ver bonos y comisiones.', 'error');
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
    if (id === 'mantenimiento-garantia') loadMantenimientoGarantia();
    if (id === 'garantias-sin-cobertura') loadGarantiasSinCobertura();
    if (id === 'bonos') loadBonos();
    if (id === 'bitacoras') loadBitacoras();
    if (id === 'demo') loadSeedStatus();
    if (id === 'acerca') { /* solo mostrar panel */ }
    if (id === 'auditoria') loadAuditLog();
    if (id === 'ventas') loadVentas();
    if (id === 'revision-maquinas') loadRevisionMaquinas();
    if (id === 'tarifas') loadTarifas();
    if (id === 'tecnicos') loadTecnicos();
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
  function previewCliente(c) {
    openPreviewCard({
      title: c.nombre || 'Cliente',
      subtitle: c.codigo ? 'Código: ' + c.codigo : '',
      icon: 'fa-user-tie',
      color: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a9e 100%)',
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
      }]
    });
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
        <td>${escapeHtml(c.nombre || '')}</td>
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
  function previewRefaccion(r) {
    const stockBajo = Number(r.stock) <= Number(r.stock_minimo || 1);
    openPreviewCard({
      title: r.descripcion || 'Refacción',
      subtitle: r.codigo || '',
      icon: 'fa-cogs',
      color: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
      badge: stockBajo ? 'Stock Bajo' : 'Stock OK',
      badgeClass: stockBajo ? 'pvc-badge--danger' : 'pvc-badge--success',
      sections: [{
        title: 'Identificación', icon: 'fa-barcode',
        fields: [
          { label: 'Código', value: r.codigo, icon: 'fa-barcode' },
          { label: 'Descripción', value: r.descripcion, icon: 'fa-align-left', full: true },
          { label: 'Categoría', value: r.categoria, icon: 'fa-tag' },
          { label: 'Subcategoría', value: r.subcategoria, icon: 'fa-tags' },
          { label: 'Zona', value: r.zona, icon: 'fa-map-marker-alt' },
          { label: 'Unidad', value: r.unidad || 'PZA', icon: 'fa-ruler' },
        ]
      }, {
        title: 'Inventario y precio', icon: 'fa-dollar-sign',
        fields: [
          { label: 'Stock actual', value: r.stock != null ? Number(r.stock).toLocaleString('es-MX') : '0', icon: 'fa-boxes', badge: stockBajo, badgeClass: stockBajo ? 'pvc-badge--danger' : '' },
          { label: 'Stock mínimo', value: r.stock_minimo != null ? Number(r.stock_minimo) : 1, icon: 'fa-exclamation-triangle' },
          { label: 'Precio MXN', value: r.precio_unitario != null && r.precio_unitario !== '' ? '$' + Number(r.precio_unitario).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '', icon: 'fa-money-bill-wave' },
          { label: 'Precio USD', value: (() => { const u = resolveRefaccionPrecioUsd(r); return u != null ? 'US$' + u.toLocaleString('en-US', { minimumFractionDigits: 2 }) : ''; })(), icon: 'fa-dollar-sign' },
          { label: 'Nº Parte Manual', value: r.numero_parte_manual, icon: 'fa-book' },
        ]
      }]
    });
  }
  function renderRefacciones(data) {
    const tbody = qs('#tabla-refacciones tbody');
    tbody.innerHTML = '';
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty">No hay refacciones. Agrega una nueva.</td></tr>';
      return;
    }
    const _canEdit = canEdit(); const _canDelete = canDelete();
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
        <td>${imgThumb}</td>
        <td>${escapeHtml(r.descripcion || '')}</td>
        <td>${escapeHtml(r.categoria || '')}${r.subcategoria ? ' / ' + escapeHtml(r.subcategoria) : ''}</td>
        <td>${escapeHtml(r.zona || '')}</td>
        <td class="${stockBajo ? 'stock-bajo' : ''}">${r.stock != null ? Number(r.stock).toLocaleString('es-MX') : '0'}</td>
        <td>${r.stock_minimo != null ? Number(r.stock_minimo) : 1}</td>
        <td>${formatRefaccionPrecioUsdCell(r)}</td>
        <td>${r.precio_unitario != null && r.precio_unitario !== '' ? '$' + Number(r.precio_unitario).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : ''}</td>
        <td>${escapeHtml(r.unidad || 'PZA')}</td>
        <td class="th-actions">
          <button type="button" class="btn small outline btn-preview-ref" data-id="${r.id}" title="Vista previa"><i class="fas fa-eye"></i></button>
          <button type="button" class="btn small outline btn-stock-ref" data-id="${r.id}" title="Ajustar stock"><i class="fas fa-boxes"></i></button>
          ${_canEdit ? `<button type="button" class="btn small primary btn-edit-ref" data-id="${r.id}"><i class="fas fa-edit"></i></button>` : ''}
          ${_canDelete ? `<button type="button" class="btn small danger btn-delete-ref" data-id="${r.id}"><i class="fas fa-trash"></i></button>` : ''}
        </td>
      `;
      tbody.appendChild(tr);
    });
    updateTableFooter('tabla-refacciones', data.length, refaccionesCache.length, () => clearTableFiltersAndRefresh('tabla-refacciones', '#buscar-refacciones', applyRefaccionesFiltersAndRender), arguments[1]);
    animateTableRows('tabla-refacciones');
    tbody.querySelectorAll('.btn-codigo-ref').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const r = data.find(x => x.id == btn.dataset.id); if (r) openModalRefaccionImagen(r); });
    });
    tbody.querySelectorAll('.btn-preview-ref').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); const r = data.find(x => x.id == btn.dataset.id); if (r) previewRefaccion(r); });
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
    finally {
      hideLoading();
      if (typeof refreshAlertasHeader === 'function') refreshAlertasHeader();
    }
  }

  let tipoCambioActual = 17.0; // tipo de cambio USD/MXN actualizado desde Banxico

  /** USD guardado en BD, o derivado de precio MXN / tipo de cambio (mismo criterio que el backfill del servidor). */
  function resolveRefaccionPrecioUsd(r) {
    const usd = Number(r.precio_usd);
    if (Number.isFinite(usd) && usd > 0) return usd;
    const mxn = Number(r.precio_unitario);
    const tc = (typeof tipoCambioActual === 'number' && tipoCambioActual > 0) ? tipoCambioActual : 17;
    if (Number.isFinite(mxn) && mxn > 0 && tc > 0) return Math.round((mxn / tc) * 100) / 100;
    return null;
  }
  function formatRefaccionPrecioUsdCell(r) {
    const v = resolveRefaccionPrecioUsd(r);
    if (v == null) return '';
    const derived = !(Number(r.precio_usd) > 0);
    const title = derived ? ' title="Calculado desde precio MXN y tipo de cambio actual"' : '';
    return '<strong' + title + '>US$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</strong>';
  }

  // ----- MÁQUINAS -----
  const CATEGORIAS_MAQUINAS = ['Centro de Maquinado', 'Torno CNC', 'Electroerosionadora por Hilo', 'Electroerosionadora por Penetración', 'Fresadora CNC', 'Rectificadora', 'Torno Convencional', 'Otro'];
  let maquinasViewMode = 'tabla'; // 'tabla' | 'tarjetas'

  function previewMaquina(m) {
    const imgFields = [];
    if (m.imagen_pieza_url) {
      imgFields.push({
        label: 'Vista pieza / parte (manual)',
        value: `<div class="maq-preview-imgwrap"><img class="maq-preview-img" src="${escapeHtml(m.imagen_pieza_url)}" alt="Pieza"></div>`,
        html: true,
        full: true,
        icon: 'fa-image',
      });
    }
    if (m.imagen_ensamble_url) {
      imgFields.push({
        label: 'Diagrama de ensamble',
        value: `<div class="maq-preview-imgwrap"><img class="maq-preview-img" src="${escapeHtml(m.imagen_ensamble_url)}" alt="Ensamble"></div>`,
        html: true,
        full: true,
        icon: 'fa-object-group',
      });
    }
    openPreviewCard({
      title: m.modelo || m.nombre || 'Máquina',
      subtitle: [m.categoria_principal, m.categoria].filter(Boolean).join(' · ') || '',
      icon: 'fa-industry',
      color: 'linear-gradient(135deg, #1e3a5f 0%, #3b5998 100%)',
      badge: m.activo === 0 ? 'Inactiva' : 'Activa',
      badgeClass: m.activo === 0 ? 'pvc-badge--danger' : 'pvc-badge--success',
      sections: [
        ...(imgFields.length
          ? [{ title: 'Manual de partes — referencia visual', icon: 'fa-book', fields: imgFields }]
          : []),
        {
          title: 'Especificaciones', icon: 'fa-cog',
          fields: [
            { label: 'ID', value: m.id, icon: 'fa-hashtag' },
            { label: 'Centro / jerarquía', value: m.categoria_principal, icon: 'fa-sitemap' },
            { label: 'Categoría', value: m.categoria, icon: 'fa-layer-group' },
            { label: 'Modelo', value: m.modelo || m.nombre, icon: 'fa-tag', full: true },
            { label: 'Número de serie', value: m.numero_serie, icon: 'fa-barcode' },
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
    });
  }
  function renderMaquinaCard(m) {
    const _ce = canEdit(); const _cd = canDelete();
    const zona = escapeHtml(m.ubicacion || '—');
    const cat = escapeHtml(m.categoria || '—');
    const modelo = escapeHtml(m.modelo || m.nombre || '—');
    const serie = escapeHtml(m.numero_serie || '—');
    const cliente = escapeHtml(m.cliente_nombre || '—');
    const thumb = m.imagen_pieza_url
      ? `<div class="maq-card-thumb"><img src="${escapeHtml(m.imagen_pieza_url)}" alt="" loading="lazy"></div>`
      : `<div class="maq-card-thumb maq-card-thumb--empty"><i class="fas fa-image"></i></div>`;
    return `
      <div class="maq-card" data-id="${m.id}">
        ${thumb}
        <div class="maq-card-header">
          <span class="maq-card-cat">${cat}</span>
          <span class="maq-card-zona"><i class="fas fa-map-marker-alt"></i> ${zona}</span>
        </div>
        <div class="maq-card-modelo">${modelo}</div>
        <div class="maq-card-body">
          <div class="maq-card-row"><i class="fas fa-barcode"></i> <strong>Serie:</strong> ${serie}</div>
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
    const modelo = escapeHtml(m.modelo || m.nombre || '—');
    const serie = escapeHtml(m.numero_serie || '—');
    const cliente = escapeHtml(m.cliente_nombre || '—');
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
            <div class="maq-ficha-modelo">${modelo}</div>
          </div>
        </div>
        ${imgs}
        <table class="maq-ficha-table">
          <tr><th>Nº de Serie</th><td>${serie}</td></tr>
          <tr><th>Cliente</th><td>${cliente}</td></tr>
          <tr><th>Zona</th><td>${zona}</td></tr>
          <tr><th>Stock</th><td>${escapeHtml(String(m.stock != null ? m.stock : 0))}</td></tr>
          <tr><th>ID sistema</th><td>${m.id}</td></tr>
        </table>
        <div class="maq-ficha-actions no-print">
          <button type="button" class="btn outline" onclick="window.print()"><i class="fas fa-print"></i> Imprimir ficha</button>
        </div>
      </div>`;
    openModal(`Ficha de máquina – ${modelo}`, body);
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
      return;
    }

    // Vista tabla
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">No hay máquinas. Carga datos demo o agrega una nueva.</td></tr>';
      return;
    }
    const _canEdit = canEdit(); const _canDelete = canDelete();
    data.forEach(m => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${m.id}</td>
        <td>${escapeHtml(m.categoria || '')}</td>
        <td><strong>${escapeHtml(m.modelo || m.nombre || '')}</strong></td>
        <td>${escapeHtml(m.cliente_nombre || '')}</td>
        <td>${escapeHtml(m.numero_serie || '')}</td>
        <td>${escapeHtml(m.ubicacion || '')}</td>
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
      loadMaquinas();
    } catch (e) { showToast(parseApiError(e) || 'No se pudo eliminar.', 'error'); }
  }

  async function loadMaquinas() {
    showLoading();
    renderTableSkeleton('tabla-maquinas', 7);
    const clienteId = qs('#filtro-cliente-maq') && qs('#filtro-cliente-maq').value;
    const url = clienteId ? `${API}/maquinas?cliente_id=${clienteId}` : `${API}/maquinas`;
    try {
      const data = await fetchJson(url);
      maquinasCache = data;
      // Poblar filtro de categoría
      const catSel = qs('#filtro-categoria-maq');
      if (catSel) {
        const cats = [...new Set(data.map(m => m.categoria).filter(Boolean))].sort();
        catSel.innerHTML = '<option value="">Todas las categorías</option>' + cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
      }
      // Poblar filtro de zona
      const zonaSel = qs('#filtro-zona-maq');
      if (zonaSel) {
        const zonas = [...new Set(data.map(m => m.ubicacion).filter(Boolean))].sort();
        zonaSel.innerHTML = '<option value="">Todas las zonas</option>' + zonas.map(z => `<option value="${escapeHtml(z)}">${escapeHtml(z)}</option>`).join('');
      }
      applyMaquinasFiltersAndRender();
    } catch (e) { renderMaquinas([]); console.error(e); }
    finally { hideLoading(); }
  }

  // ----- COTIZACIONES (módulo rehecho: carga + render explícitos) -----
  function previewCotizacion(c) {
    const moneda = c.moneda || 'MXN';
    const totalFmt = c.total != null ? (moneda === 'USD' ? 'US$' + Number(c.total).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '$' + Number(c.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })) : '—';
    const estadoColors = { pendiente: 'pvc-badge--warning', aplicada: 'pvc-badge--success', venta: 'pvc-badge--success', cancelada: 'pvc-badge--danger' };
    openPreviewCard({
      title: c.folio || 'Cotización',
      subtitle: c.cliente_nombre || '',
      icon: 'fa-file-invoice-dollar',
      color: 'linear-gradient(135deg, #2d6a4f 0%, #1b4332 100%)',
      badge: c.estado || 'pendiente',
      badgeClass: estadoColors[c.estado] || 'pvc-badge--warning',
      sections: [{
        title: 'Datos generales', icon: 'fa-info-circle',
        fields: [
          { label: 'Folio', value: c.folio, icon: 'fa-hashtag' },
          { label: 'Cliente', value: c.cliente_nombre, icon: 'fa-user-tie' },
          { label: 'Tipo', value: c.tipo, icon: 'fa-tag' },
          { label: 'Fecha', value: (c.fecha || '').toString().slice(0, 10), icon: 'fa-calendar' },
          { label: 'Vendedor', value: [c.vendedor, c.vendedor_puesto].filter(Boolean).join(' · ') || '—', icon: 'fa-user' },
          { label: 'Descuento %', value: c.descuento_pct != null && Number(c.descuento_pct) > 0 ? String(c.descuento_pct) + '%' : '—', icon: 'fa-percent' },
          { label: 'Estado', value: c.estado, icon: 'fa-flag', badge: true, badgeClass: estadoColors[c.estado] || '' },
        ]
      }, {
        title: 'Montos', icon: 'fa-dollar-sign',
        fields: [
          { label: 'Moneda', value: moneda, icon: 'fa-money-bill' },
          { label: 'Tipo de cambio', value: c.tipo_cambio ? '$' + Number(c.tipo_cambio).toFixed(2) : '', icon: 'fa-exchange-alt' },
          { label: 'Subtotal', value: c.subtotal != null ? '$' + Number(c.subtotal).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '', icon: 'fa-calculator' },
          { label: 'IVA (16%)', value: c.iva != null ? '$' + Number(c.iva).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '', icon: 'fa-percent' },
          { label: 'Total', value: totalFmt, icon: 'fa-dollar-sign' },
          { label: 'Fecha aprobación', value: c.fecha_aprobacion ? (c.fecha_aprobacion + '').slice(0, 10) : '', icon: 'fa-check-circle' },
        ]
      }, c.notas ? {
        title: 'Notas', icon: 'fa-sticky-note',
        fields: [{ label: 'Notas', value: c.notas, full: true }]
      } : null].filter(Boolean)
    });
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
      await loadCotizaciones();
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

  // Prioridad para ordenamiento de reportes: garantía=0, instalación=1, servicio=2
  function reporteTipoPrioridad(tipo) {
    if (tipo === 'garantia') return 0;
    if (tipo === 'instalacion') return 1;
    return 2; // servicio u otro
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

    const TIPO_LABELS = { garantia: 'Garantía', instalacion: 'Instalación', servicio: 'Servicio', venta: 'Venta' };
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
        <td>${escapeHtml(r.subtipo || '')}</td>
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

  function refreshReporteSubtipoFilterOptions() {
    const tipoTop = (qs('#filtro-tipo-reporte')?.value || '').trim().toLowerCase();
    const subtipoTopSel = qs('#filtro-subtipo-reporte');
    const tipoRow = (qs('#tabla-reportes-filter-tipo')?.value || '').trim().toLowerCase();
    const subtipoSel = qs('#tabla-reportes-filter-subtipo');
    if (!subtipoSel) return;
    const tipo = tipoRow || tipoTop;
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
      filtered = filtered.filter((r) => String(r.tipo_reporte || '').trim().toLowerCase() === tipoTop);
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

    const clientesOpts = clientesCache.map(c =>
      `<option value="${c.id}" data-nombre="${escapeHtml(c.nombre)}" ${reporte && reporte.cliente_id == c.id ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`
    ).join('');

    // Filtrar máquinas por cliente si hay uno seleccionado
    const maqAll = maquinasCache;
    const maquinasOpts = (maqAll.length
      ? maqAll.map(m => `<option value="${m.id}" data-serie="${escapeHtml(m.numero_serie || '')}" ${reporte && reporte.maquina_id == m.id ? 'selected' : ''}>${escapeHtml(m.modelo || m.nombre || '')} – ${escapeHtml(m.numero_serie || '')}</option>`)
      : ['<option value="">— Sin máquinas —</option>']
    ).join('');

    const tecnOpts = tecnicosCache.map(t => {
      const selected = reporte && reporte.tecnico === t.nombre ? 'selected' : '';
      const label = t.ocupado && !(reporte && reporte.tecnico === t.nombre) ? `${escapeHtml(t.nombre)} 🔒 Ocupado` : escapeHtml(t.nombre);
      const disabled = t.ocupado && !isAdmin && !(reporte && reporte.tecnico === t.nombre) ? 'disabled' : '';
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
            <option value="garantia" ${reporte && reporte.tipo_reporte === 'garantia' ? 'selected' : ''}>Garantía</option>
            <option value="instalacion" ${reporte && reporte.tipo_reporte === 'instalacion' ? 'selected' : ''}>Instalación</option>
            <option value="servicio" ${!reporte || reporte.tipo_reporte === 'servicio' || !reporte.tipo_reporte ? 'selected' : ''}>Servicio</option>
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

    // Subtipos dinámicos por tipo de reporte
    const SUBTIPOS_REP = {
      garantia:   ['Mantenimiento preventivo', 'Mantenimiento correctivo', 'Falla mecánica', 'Falla electrónica', 'Otro'],
      instalacion:['Instalación de máquina', 'Puesta en marcha', 'Capacitación', 'Falta capacitación', 'Otro'],
      servicio:   ['Falla eléctrica', 'Falla mecánica', 'Falla electrónica', 'Capacitación', 'Falta capacitación', 'Otro'],
    };
    const tipoSel = qs('#m-tipo-rep');
    const subSel  = qs('#m-subtipo-rep');
    const maqSel  = qs('#m-maquina');
    const numMaqEl = qs('#m-num-maq');
    const clienteSel = qs('#m-cliente');
    const rsocialEl  = qs('#m-rsocial');

    function updateSubtiposRep() {
      const opts = SUBTIPOS_REP[tipoSel.value] || [];
      const cur = reporte && reporte.subtipo;
      subSel.innerHTML = `<option value="">— Selecciona —</option>` +
        opts.map(s => `<option value="${s}" ${cur === s ? 'selected' : ''}>${s}</option>`).join('');
    }
    tipoSel.addEventListener('change', updateSubtiposRep);
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
          { label: 'Tipo de máquina', value: g.tipo_maquina, icon: 'fa-tag' },
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
        <div class="form-group"><label>Costo (MXN)</label><input type="number" id="m-costo-mant" step="0.01" min="0" value="${Number(mant.costo) || 0}"></div>
        <div class="form-group"><label>Pagado (MXN)</label><input type="number" id="m-pagado-mant" step="0.01" min="0" value="${Number(mant.pagado) || 0}"></div>
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
    const tecnOpts = tecnicosCache.map(t => `<option value="${escapeHtml(t.nombre)}" ${bono && bono.tecnico === t.nombre ? 'selected' : ''}>${escapeHtml(t.nombre)}</option>`).join('');
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
    } finally { hideLoading(); }
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
    const tecnOpts = tecnicosCache.map(t => `<option value="${escapeHtml(t.nombre)}" ${viaje && viaje.tecnico === t.nombre ? 'selected' : ''}>${escapeHtml(t.nombre)}</option>`).join('');
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
      <p style="font-size:0.85rem;color:#6b7280;margin-top:-0.5rem">Viáticos: $1,000 MXN por día. <strong id="m-total-viaticos-preview">$${((viaje && viaje.dias) ? Number(viaje.dias) : 1) * 1000}</strong></p>
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
          { label: 'Horas trabajadas', value: b.tiempo_horas != null ? b.tiempo_horas + ' hrs' : '—', icon: 'fa-stopwatch' },
        ]
      }, b.actividades ? {
        title: 'Actividades', icon: 'fa-list-ul',
        fields: [{ label: 'Actividades realizadas', value: b.actividades, full: true }]
      } : null, b.materiales_usados ? {
        title: 'Materiales', icon: 'fa-boxes',
        fields: [{ label: 'Materiales usados', value: b.materiales_usados, full: true }]
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
      tbody.innerHTML = '<tr><td colspan="9" class="empty filter-empty"><span>No hay resultados con los filtros aplicados.</span> <button type="button" class="btn small primary clear-filters-inline">Quitar filtros</button></td></tr>';
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

  // ----- PREVIEW CARD ---- Tarjeta hermosa para ver todos los datos de un registro
  /**
   * openPreviewCard(config)
   * config: { title, subtitle, icon, color, badge, badgeClass, sections, footerHtml }
   * sections: [{ title, icon, fields: [{ label, value, full, badge, badgeClass, icon }] }]
   */
  function openPreviewCard(config) {
    const { title = '', subtitle = '', icon = 'fa-file-alt', color = 'var(--config-primary)', badge = '', badgeClass = '', sections = [], footerHtml = '' } = config;
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
    const body = `
      <div class="preview-card">
        <div class="pvc-header" style="background:${color}">
          <div class="pvc-header-icon"><i class="fas ${icon}"></i></div>
          <div class="pvc-header-info">
            <h2 class="pvc-title">${escapeHtml(title)}</h2>
            ${subtitle ? `<p class="pvc-subtitle">${escapeHtml(subtitle)}</p>` : ''}
          </div>
          ${badge ? `<span class="pvc-badge pvc-badge--header ${badgeClass}">${escapeHtml(badge)}</span>` : ''}
        </div>
        <div class="pvc-body">${sectionsHtml || '<p class="pvc-empty">Sin información adicional.</p>'}</div>
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
      modalBox.classList.remove('pdf-preview-modal', 'dragging', 'modal-cotizacion');
      modalBox.style.left = '';
      modalBox.style.top = '';
      modalBox.style.width = '';
      modalBox.style.height = '';
      modalBox.style.maxHeight = '';
      if (/cotizaci/i.test(String(title || ''))) modalBox.classList.add('modal-cotizacion');
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

  /** Segundo modal encima del principal (ej. bitácora sin cerrar cotización). */
  function openModalStack(title, bodyHtml, onClose) {
    const modal = qs('#modal-stack');
    if (!modal) return function () {};
    const previousFocus = document.activeElement;
    qs('#modal-stack-title').textContent = title;
    qs('#modal-stack-body').innerHTML = bodyHtml;
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
        <div class="form-group">
          <label>Foto 1: Manual de partes</label>
          <input type="file" id="m-foto1-file" accept="image/*" style="margin-bottom:0.3rem">
          ${refaccion && refaccion.imagen_url ? `<div class="ref-foto-preview-wrap"><img src="${escapeHtml(refaccion.imagen_url)}" class="ref-foto-thumb" alt="Foto 1"><button type="button" class="btn small danger" id="m-foto1-clear" style="margin-left:0.5rem"><i class="fas fa-times"></i></button></div>` : ''}
          <input type="hidden" id="m-imagen" value="${escapeHtml(refaccion && refaccion.imagen_url) || ''}">
        </div>
        <div class="form-group">
          <label>Foto 2: Diagrama de ensamblado</label>
          <input type="file" id="m-foto2-file" accept="image/*" style="margin-bottom:0.3rem">
          ${refaccion && refaccion.manual_url ? `<div class="ref-foto-preview-wrap"><img src="${escapeHtml(refaccion.manual_url)}" class="ref-foto-thumb" alt="Foto 2"><button type="button" class="btn small danger" id="m-foto2-clear" style="margin-left:0.5rem"><i class="fas fa-times"></i></button></div>` : ''}
          <input type="hidden" id="m-manual" value="${escapeHtml(refaccion && refaccion.manual_url) || ''}">
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn primary" id="m-save"><i class="fas fa-save"></i> Guardar</button>
        <button type="button" class="btn" id="modal-btn-cancel">Cancelar</button>
      </div>
    `;
    openModal(isNew ? 'Nueva refacción' : 'Editar refacción', body);
    // Clear buttons for existing photos
    const foto1ClearBtn = qs('#m-foto1-clear');
    const foto2ClearBtn = qs('#m-foto2-clear');
    if (foto1ClearBtn) foto1ClearBtn.addEventListener('click', () => { qs('#m-imagen').value = ''; foto1ClearBtn.closest('.ref-foto-preview-wrap').remove(); });
    if (foto2ClearBtn) foto2ClearBtn.addEventListener('click', () => { qs('#m-manual').value = ''; foto2ClearBtn.closest('.ref-foto-preview-wrap').remove(); });
    qs('#m-save').onclick = async () => {
      clearInvalidMarks();
      const codigo = qs('#m-codigo').value.trim();
      const descripcion = qs('#m-descripcion').value.trim();
      const precio = parseFloat(qs('#m-precio').value) || 0;
      let err = validateRequired(codigo, 'Código es obligatorio');
      if (err) { markInvalid('m-codigo', err); return; }
      err = validateRequired(descripcion, 'Descripción es obligatoria');
      if (err) { markInvalid('m-descripcion', err); return; }
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
        stock: parseFloat(qs('#m-stock').value) || 0,
        stock_minimo: parseFloat(qs('#m-stock-min').value) || 1,
        precio_unitario: precio,
        precio_usd: parseFloat(qs('#m-precio-usd').value) || 0,
        unidad: qs('#m-unidad').value.trim() || 'PZA',
        categoria: qs('#m-categoria').value.trim() || null,
        subcategoria: qs('#m-subcategoria').value.trim() || null,
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
    const foto2 = ref.manual_url ? (isImage(ref.manual_url) ? `<div style="text-align:center"><p style="font-size:0.8rem;color:#6b7280;margin-bottom:0.4rem">Diagrama de ensamblado</p><img src="${escapeHtml(ref.manual_url)}" alt="Foto 2" style="max-width:100%;max-height:320px;border-radius:8px;border:1px solid #e2e8f0"></div>` : `<div><a href="${escapeHtml(ref.manual_url)}" target="_blank" class="btn outline"><i class="fas fa-external-link-alt"></i> Ver foto 2</a></div>`) : '<p style="color:#6b7280;font-size:0.85rem">Sin foto 2.</p>';
    const body = `
      <p style="margin-bottom:0.75rem"><strong>Código:</strong> ${escapeHtml(ref.codigo)} &nbsp; <strong>Nº parte:</strong> ${escapeHtml(ref.numero_parte_manual || '—')}</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">${foto1}${foto2}</div>
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
    const catalogoUm = toArray(await fetchJson(API + '/catalogo-universal-maquinas').catch(() => []));
    const options = clientes.map(c => `<option value="${c.id}" ${maquina && maquina.cliente_id == c.id ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('');
    const catOpts = CATEGORIAS_MAQUINAS.map(c => `<option value="${c}" ${maquina && maquina.categoria === c ? 'selected' : ''}>${c}</option>`).join('');
    const zonasSucursal = ['Monterrey', 'Ciudad de México', 'Querétaro', 'Guadalajara', 'Reynosa', 'Chihuahua', 'Guanajuato', 'Tlalnepantla', 'Saltillo', 'San Luis Potosí', 'Otra'];
    const zonaOpts = zonasSucursal.map(z => `<option value="${z}" ${maquina && maquina.ubicacion === z ? 'selected' : ''}>${z}</option>`).join('');
    const catalogoOpts = catalogoUm.map((row, idx) => `<option value="${idx}" data-json="1">${escapeHtml(row.modelo)}</option>`).join('');
    const body = `
      <p class="form-hint" style="margin-top:0"><i class="fas fa-book"></i> Catálogo basado en <strong>UNIVERSAL 2025</strong> (PDF). Al elegir un modelo se rellenan categoría, imágenes placeholder pieza/ensamble y código de manual; sustituye las URLs por tus escaneos cuando los tengas.</p>
      <div class="form-group"><label>Importar desde catálogo Universal</label>
        <select id="m-catalogo-um">
          <option value="">— Sin importar (captura manual) —</option>
          ${catalogoOpts}
        </select>
      </div>
      <div class="form-group"><label>Cliente *</label><select id="m-cliente_id">${options}</select></div>
      <div class="form-row">
        <div class="form-group"><label>Centro de maquinado / jerarquía</label>
          <input type="text" id="m-categoria_principal" maxlength="80" value="${escapeHtml(maquina && maquina.categoria_principal) || ''}" placeholder="Ej: Centro de Maquinado">
        </div>
        <div class="form-group"><label>Categoría *</label>
          <select id="m-categoria">
            <option value="">-- Seleccionar --</option>
            ${catOpts}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Modelo *</label><input type="text" id="m-modelo" maxlength="120" value="${escapeHtml(maquina && maquina.modelo) || ''}" required placeholder="Ej: GH1440A, CTX 510…"></div>
        <div class="form-group"><label>Stock (0 por defecto en almacén demo)</label><input type="number" id="m-stock" step="any" min="0" value="${maquina && maquina.stock != null ? escapeHtml(String(maquina.stock)) : '0'}"></div>
        <div class="form-group"><label>Precio de lista (USD)</label><input type="number" id="m-precio-lista-usd" step="0.01" min="0" value="${maquina && maquina.precio_lista_usd != null ? escapeHtml(String(maquina.precio_lista_usd)) : ''}" placeholder="Lista para cotizar × TC"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Nº Serie</label><input type="text" id="m-numero_serie" maxlength="80" value="${escapeHtml(maquina && maquina.numero_serie) || ''}"></div>
        <div class="form-group"><label>Zona / Sucursal (PDF)</label>
          <select id="m-ubicacion">
            <option value="">-- Seleccionar --</option>
            ${zonaOpts}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>URL imagen — pieza / parte (manual)</label><input type="url" id="m-img-pieza" value="${escapeHtml(maquina && maquina.imagen_pieza_url) || ''}" placeholder="https://… o /img/maquinas/…"></div>
        <div class="form-group"><label>URL imagen — diagrama ensamble</label><input type="url" id="m-img-ensamble" value="${escapeHtml(maquina && maquina.imagen_ensamble_url) || ''}" placeholder="https://… o /img/maquinas/…"></div>
      </div>
      <div class="form-group"><label>Nombre / Identificador interno</label><input type="text" id="m-nombre" maxlength="150" value="${escapeHtml(maquina && maquina.nombre) || ''}" placeholder="Opcional; si vacío se usa el modelo"></div>
      <div class="form-actions">
        <button type="button" class="btn primary" id="m-save"><i class="fas fa-save"></i> Guardar</button>
        <button type="button" class="btn" id="modal-btn-cancel">Cancelar</button>
      </div>
    `;
    openModal(isNew ? 'Nueva máquina' : 'Editar máquina', body);
    const catSel = qs('#m-catalogo-um');
    if (catSel && catalogoUm.length) {
      catSel.addEventListener('change', () => {
        const i = parseInt(catSel.value, 10);
        if (!Number.isFinite(i) || !catalogoUm[i]) return;
        const row = catalogoUm[i];
        const modeloEl = qs('#m-modelo');
        const catEl = qs('#m-categoria');
        const cpEl = qs('#m-categoria_principal');
        const pz = qs('#m-img-pieza');
        const en = qs('#m-img-ensamble');
        if (modeloEl) modeloEl.value = row.modelo || '';
        if (catEl && row.categoria) {
          catEl.value = CATEGORIAS_MAQUINAS.includes(row.categoria) ? row.categoria : catEl.value;
          if (!CATEGORIAS_MAQUINAS.includes(row.categoria)) {
            const opt = document.createElement('option');
            opt.value = row.categoria;
            opt.selected = true;
            catEl.appendChild(opt);
          }
        }
        if (cpEl && row.categoria_principal) cpEl.value = row.categoria_principal;
        if (pz && row.imagen_pieza_url) pz.value = row.imagen_pieza_url;
        if (en && row.imagen_ensamble_url) en.value = row.imagen_ensamble_url;
      });
    }
    qs('#m-save').onclick = async () => {
      clearInvalidMarks();
      const modelo = (qs('#m-modelo').value || '').trim();
      let err = validateRequired(modelo, 'El modelo de la máquina es obligatorio');
      if (err) { markInvalid('m-modelo', err); return; }
      const stockRaw = qs('#m-stock') && qs('#m-stock').value;
      const stockNum = stockRaw !== '' && stockRaw != null ? Number(stockRaw) : 0;
      const payload = {
        cliente_id: parseInt(qs('#m-cliente_id').value, 10),
        nombre: qs('#m-nombre').value.trim() || modelo,
        categoria: qs('#m-categoria').value.trim() || null,
        categoria_principal: (qs('#m-categoria_principal') && qs('#m-categoria_principal').value.trim()) || null,
        modelo,
        numero_serie: qs('#m-numero_serie').value.trim() || null,
        ubicacion: qs('#m-ubicacion').value.trim() || null,
        imagen_pieza_url: (qs('#m-img-pieza') && qs('#m-img-pieza').value.trim()) || null,
        imagen_ensamble_url: (qs('#m-img-ensamble') && qs('#m-img-ensamble').value.trim()) || null,
        stock: Number.isFinite(stockNum) ? stockNum : 0,
        precio_lista_usd: qs('#m-precio-lista-usd') && qs('#m-precio-lista-usd').value !== '' ? Number(qs('#m-precio-lista-usd').value) : 0,
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
    // Catálogo completo solo para este modal: `maquinasCache` global suele estar filtrado por
    // la pestaña Máquinas (#filtro-cliente-maq) y no incluye todos los clientes → selects vacíos.
    const maquinasCatalogoModal = toArray(await fetchJson(API + '/maquinas').catch(() => []));
    if (!Array.isArray(refaccionesCache) || refaccionesCache.length === 0) {
      refaccionesCache = await fetchJson(API + '/refacciones').catch(() => []);
    }
    try {
      const tecRaw = await fetchJson(API + '/tecnicos').catch(() => []);
      tecnicosCache = toArray(tecRaw);
    } catch (_) {}
    const vendedoresOpts = (tecnicosCache || [])
      .filter((t) => Number(t.es_vendedor) === 1)
      .map((t) => {
        const sel = cot && cot.vendedor_personal_id && Number(cot.vendedor_personal_id) === Number(t.id) ? 'selected' : '';
        return `<option value="${t.id}" ${sel}>${escapeHtml(t.nombre)} — ${escapeHtml(t.puesto || 'Vendedor')}</option>`;
      })
      .join('');
    const descInicial = cot && cot.descuento_pct != null ? Number(cot.descuento_pct) : 0;
    const cotClienteId = cot && cot.cliente_id ? Number(cot.cliente_id) : null;
    const clienteOpts = clientes
      .map((c) => `<option value="${c.id}" ${cot && cot.cliente_id == c.id ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`)
      .join('');

    const cotMoneda = (cot && cot.moneda ? String(cot.moneda) : 'MXN').toUpperCase();
    const cotTc = cot && cot.tipo_cambio != null ? Number(cot.tipo_cambio) : 17.0;
    const maqIds = (() => {
      try {
        const raw = cot && cot.maquinas_ids;
        if (!raw) return [];
        if (Array.isArray(raw)) return raw.map((x) => Number(x)).filter(Boolean);
        const arr = JSON.parse(String(raw));
        return Array.isArray(arr) ? arr.map((x) => Number(x)).filter(Boolean) : [];
      } catch (_) {
        return [];
      }
    })();

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
              <select id="cotz-moneda">
                <option value="MXN" ${cotMoneda === 'MXN' ? 'selected' : ''}>MXN</option>
                <option value="USD" ${cotMoneda === 'USD' ? 'selected' : ''}>USD</option>
              </select>
            </div>
            <div class="form-group">
              <label>Tipo de cambio</label>
              <input type="number" id="cotz-tc" step="0.01" min="0" value="${Number.isFinite(cotTc) ? cotTc.toFixed(2) : '17.00'}" placeholder="17.00">
              <div class="hint">Precios de lista en USD se convierten con este tipo de cambio (MXN = USD × TC).</div>
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
            <p class="hint" id="cotz-comision-hint" style="font-size:0.85rem;">Los precios son estándar desde lista × TC. Las comisiones dependen del vendedor (David: 10% en equipo y refacciones; demás vendedores: 10% solo refacciones).</p>
            <div class="form-row">
              <div class="form-group">
                <label>Descuento autorizado (% sobre subtotal de partidas)</label>
                <input type="number" id="cotz-descuento-pct" min="0" max="100" step="0.5" value="${Number.isFinite(descInicial) ? descInicial : 0}">
              </div>
            </div>
          </div>
        </section>

        <section class="cotz-card cotz-card--maquinas" aria-labelledby="cotz-h-maq">
          <h4 class="cotz-card-title" id="cotz-h-maq"><span class="cotz-step-num">2</span> Equipos (opcional)</h4>
          <p class="hint cotz-maquinas-intro" id="cotz-maquinas-hint">Marca los equipos que aplican. Si no hay filas, registra máquinas para el cliente en la pestaña Máquinas.</p>
          <div id="cotz-maquinas-list" class="cotz-maquinas-list" role="group" aria-label="Máquinas de la cotización"></div>
        </section>

        <div class="cotz-inventory-hint" role="note">
          <i class="fas fa-boxes-stacked" aria-hidden="true"></i>
          <div>
            <strong>Inventario</strong> — Las partidas de <em>refacción</em> bajan existencias al usar <strong>Aprobar como venta</strong> en la tabla (no al guardar borrador). Mano de obra / vueltas no mueven almacén.
          </div>
        </div>

        <section class="cotz-card cotz-card--lineas" aria-labelledby="cotz-h-lineas">
          <h4 class="cotz-card-title" id="cotz-h-lineas"><span class="cotz-step-num">3</span> Partidas</h4>
          <div class="table-wrap cotz-lineas-table-wrap">
            <table class="data-table" id="tabla-cot-lineas">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Descripción</th>
                  <th>Cant</th>
                  <th>Precio</th>
                  <th>Subtotal</th>
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

          <div class="form-row">
            <div class="form-group">
              <label>Tipo de línea</label>
              <select id="cot-line-tipo">
                <option value="refaccion">Refacción (lista USD × TC)</option>
                <option value="equipo">Equipo / máquina (lista USD × TC)</option>
                <option value="mano_obra">Mano de obra</option>
                <option value="vuelta">Vuelta (ida)</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div class="form-group">
              <label>Máquina (opcional)</label>
              <select id="cot-line-maq">
                <option value="">— Sin máquina —</option>
              </select>
            </div>
          </div>

          <div class="form-group" id="cot-line-ref-wrap">
            <label>Refacción</label>
            <select id="cot-line-refaccion">
              ${(refaccionesCache || []).slice(0, 200).map(r => `<option value="${r.id}">${escapeHtml((r.codigo || '') + ' — ' + (r.descripcion || ''))}</option>`).join('')}
            </select>
          </div>

          <div class="form-group" id="cot-line-desc-wrap" style="display:none">
            <label>Concepto</label>
            <input type="text" id="cot-line-desc" placeholder="Ej. Diagnóstico, traslado (ida), reparación, etc.">
          </div>

          <div class="form-group" id="cot-line-bit-wrap" style="display:none">
            <label>Bitácora ligada (opcional)</label>
            <select id="cot-line-bitacora">
              <option value="">— Sin bitácora —</option>
            </select>
            <div class="hint">Solo bitácoras ligadas a esta cotización. Si no hay, crea una desde Bitácora o con el botón de abajo.</div>
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
                <label>Zona de servicio</label>
                <select id="cot-line-mo-zona">
                  <option value="a">A – Local (Monterrey)</option>
                  <option value="b">B – Regional (Guanajuato, QRO)</option>
                  <option value="c">C – Nacional (CDMX, GDL)</option>
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
            <div class="cotz-mo-hint">
              <i class="fas fa-calculator"></i> Precio sugerido desde Tarifas. Puedes ajustar cantidad y precio abajo.
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Cantidad / Horas</label>
              <input type="number" id="cot-line-cant" step="0.25" min="0" value="1">
            </div>
            <div class="form-group">
              <label>Precio unitario</label>
              <input type="number" id="cot-line-precio" step="0.01" min="0" value="0">
            </div>
          </div>

          <div class="form-actions cotz-add-actions">
            <button type="button" class="btn primary" id="cot-line-add"><i class="fas fa-plus"></i> Agregar a la cotización</button>
          </div>
        </div>

        <section class="cotz-card cotz-card--totals" aria-labelledby="cotz-h-tot">
          <h4 class="cotz-card-title" id="cotz-h-tot"><span class="cotz-step-num">4</span> Importes</h4>
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
    /** El modal puede re-renderizar; buscar el contenedor de checkboxes de forma robusta. */
    function getCotzMaquinasListEl() {
      const modal = qs('#modal');
      if (modal && !modal.classList.contains('hidden')) {
        const inModal = modal.querySelector('#cotz-maquinas-list');
        if (inModal) return inModal;
      }
      return qs('#modal-body #cotz-maquinas-list') || qs('#cotz-maquinas-list');
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
    function getSelectedMaquinaIdsFromUi() {
      const wrap = getCotzMaquinasListEl();
      if (!wrap) return [];
      return Array.from(wrap.querySelectorAll('input.cotz-maq-cb:checked'))
        .map((el) => Number(el.value))
        .filter((n) => Number.isFinite(n) && n > 0);
    }

    function renderLineas(lineas) {
      const tbody = qm('#tabla-cot-lineas tbody');
      if (!tbody) return;
      tbody.innerHTML = '';
      const rows = Array.isArray(lineas) ? lineas : [];
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty">No hay líneas. Agrega refacciones, vueltas o mano de obra.</td></tr>';
        return;
      }
      rows.forEach((l) => {
        const tr = document.createElement('tr');
        const desc = l.refaccion_descripcion ? (l.codigo ? (l.codigo + ' — ' + l.refaccion_descripcion) : l.refaccion_descripcion) : (l.descripcion || '');
        const tipoLbl = l.tipo_linea === 'equipo' ? 'equipo' : String(l.tipo_linea || '');
        tr.innerHTML = `
          <td>${escapeHtml(tipoLbl)}</td>
          <td class="td-text-wrap">${escapeHtml(String(desc || ''))}</td>
          <td class="num">${Number(l.cantidad || 0)}</td>
          <td class="num">${Number(l.precio_unitario || 0).toFixed(2)}</td>
          <td class="num">${Number(l.subtotal || 0).toFixed(2)}</td>
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

    function filterMaquinasPorCliente(catalog, clienteId) {
      const cid = Number(clienteId);
      if (!Number.isFinite(cid) || cid <= 0) return toArray(catalog).slice();
      const arr = toArray(catalog);
      let out = arr.filter((m) => Number(m.cliente_id) === cid);
      if (out.length) return out;
      out = arr.filter((m) => String(m.cliente_id) === String(cid));
      if (out.length) return out;
      return arr.filter((m) => m.cliente_id == cid);
    }

    function setMaquinasOptions(maqs, selectedIds, richLabels) {
      const list = toArray(maqs);
      const selIds = Array.isArray(selectedIds) ? selectedIds.map((x) => Number(x)).filter(Boolean) : [];
      function optLabel(m) {
        const base = m.nombre || m.modelo || m.numero_serie || ('#' + m.id);
        if (richLabels && (m.cliente_nombre || m.cliente_id != null)) {
          return (m.cliente_nombre || ('Cliente ' + m.cliente_id)) + ' — ' + base;
        }
        return base;
      }
      const optionsHtml = list
        .map((m) => {
          const sel = selIds.includes(Number(m.id)) ? 'selected' : '';
          return `<option value="${m.id}" ${sel}>${escapeHtml(optLabel(m))}</option>`;
        })
        .join('');
      const listEl = getCotzMaquinasListEl();
      let usingPresentationDummy = false;
      const clienteSel = qm('#cotz-cliente_id');
      const cliOpt = clienteSel?.selectedOptions?.[0];
      const clienteNom = (cliOpt && cliOpt.textContent) ? cliOpt.textContent.trim() : '';
      if (listEl) {
        if (!list.length) {
          usingPresentationDummy = true;
          const dummyLines = [
            'Compresor de Tornillo #2 — área principal',
            'Robot soldador FANUC — línea de ensamble',
            'Celda CNC / centro de mecanizado',
            'Banda transporte / proceso',
          ];
          const introCliente = clienteNom
            ? ` <strong>${escapeHtml(clienteNom)}</strong>:`
            : '';
          listEl.innerHTML =
            '<p class="hint cotz-maquinas-dummy-intro">Vista demo' +
            introCliente +
            ' equipos de ejemplo (solo pantalla). Marca para ver el flujo; <strong>no se guardan</strong> hasta tener equipos en el catálogo. Si la lista sigue vacía, en la pestaña <strong>Demo</strong> usa <em>Asegurar equipos por cliente</em>.</p>' +
            dummyLines
              .map(
                (label, i) =>
                  `<label class="cotz-maq-row cotz-maq-row-dummy"><input type="checkbox" class="cotz-maq-cb cotz-maq-cb-dummy" value="0" data-dummy="1" id="cotz-dummy-maq-${i}"> <span class="cotz-maq-label">${escapeHtml(label)}</span></label>`
              )
              .join('');
        } else {
          listEl.innerHTML = list
            .map((m) => {
              const chk = selIds.includes(Number(m.id)) ? 'checked' : '';
              return `<label class="cotz-maq-row"><input type="checkbox" class="cotz-maq-cb" value="${m.id}" ${chk}> <span class="cotz-maq-label">${escapeHtml(optLabel(m))}</span></label>`;
            })
            .join('');
        }
      }
      const single = qm('#cot-line-maq');
      if (single) {
        const current = single.value;
        if (!list.length) {
          single.innerHTML =
            '<option value="">— Sin máquina —</option>' +
            '<optgroup label="Ejemplos (solo vista)">' +
            ['Compresor industrial', 'Celda CNC', 'Línea transporte'].map((t) => `<option value="" disabled>${escapeHtml(t)}</option>`).join('') +
            '</optgroup>';
        } else {
          single.innerHTML = '<option value="">— Sin máquina —</option>' + (optionsHtml || '');
        }
        if (current && Number(current) > 0) single.value = current;
      }
      const hint = qm('#cotz-maquinas-hint');
      if (hint) {
        if (usingPresentationDummy) {
          hint.textContent =
            'Son filas solo para demo. Para datos reales como en otros clientes: pestaña Demo → «Asegurar equipos por cliente», o registra máquinas en la pestaña Máquinas.';
          hint.style.color = '#64748b';
        } else if (richLabels) {
          hint.textContent =
            'Mostrando todas las máquinas del catálogo (etiqueta: cliente — equipo). Si no ves la del cliente, revisa en Máquinas que el equipo tenga asignado ese cliente.';
          hint.style.color = '#b45309';
        } else {
          hint.textContent = 'Marca las que apliquen a esta cotización. Puedes elegir varias.';
          hint.style.color = '#64748b';
        }
      }
    }

    async function refreshMaquinasForSelectedCliente(keepSelectedIds) {
      const clienteId = Number(qm('#cotz-cliente_id')?.value) || null;
      const selected = keepSelectedIds != null ? keepSelectedIds : (() => {
        try { return getSelectedMaquinaIdsFromUi(); } catch (_) { return []; }
      })();
      // Respaldo inmediato + placeholder: si aún no hay equipos en caché para este cliente, mostrar filas demo YA (evita caja vacía mientras llega el API).
      if (clienteId) {
        const cached = filterMaquinasPorCliente(maquinasCatalogoModal, clienteId);
        if (cached.length) setMaquinasOptions(cached, selected, false);
        else setMaquinasOptions([], selected, false);
      } else if (maquinasCatalogoModal.length) {
        setMaquinasOptions(maquinasCatalogoModal, selected, false);
      } else {
        setMaquinasOptions([], selected, false);
      }
      try {
        if (clienteId) {
          const raw = await fetchJson(`${API}/maquinas?cliente_id=${encodeURIComponent(String(clienteId))}`);
          maquinasForModal = toArray(raw);
        } else {
          const raw = await fetchJson(`${API}/maquinas`);
          maquinasForModal = toArray(raw);
        }
      } catch (_) {
        maquinasForModal = clienteId
          ? filterMaquinasPorCliente(maquinasCatalogoModal, clienteId)
          : maquinasCatalogoModal.slice();
      }
      if (clienteId && (!Array.isArray(maquinasForModal) || maquinasForModal.length === 0)) {
        const fb = filterMaquinasPorCliente(maquinasCatalogoModal, clienteId);
        if (fb.length) maquinasForModal = fb;
      }
      // Sin rellenar con todo el catálogo: en demo se confunde con otros clientes. Si sigue vacío → setMaquinasOptions muestra filas demo.
      setMaquinasOptions(maquinasForModal, selected, false);
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
    function getFirstSelectedMaquinaId() {
      const ids = getSelectedMaquinaIdsFromUi();
      if (ids && ids.length) return Number(ids[0]) || null;
      return null;
    }
    function buildDefaultLineDraft() {
      const headerTipo = qm('#cotz-tipo')?.value || (cot && cot.tipo) || 'refacciones';
      const tipoLinea = headerTipo === 'mano_obra' ? 'mano_obra' : 'refaccion';
      const refId = Number(qm('#cot-line-refaccion')?.value) || null;
      const maqId = getFirstSelectedMaquinaId();
      return {
        tipo_linea: tipoLinea,
        maquina_id: maqId,
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
      const refEl = qm('#cot-line-refaccion');
      const descEl = qm('#cot-line-desc');
      const cantEl = qm('#cot-line-cant');
      const precioEl = qm('#cot-line-precio');
      if (tipoEl) tipoEl.value = d.tipo_linea || 'refaccion';
      if (maqEl) maqEl.value = d.maquina_id ? String(d.maquina_id) : '';
      if (refEl && d.refaccion_id) refEl.value = String(d.refaccion_id);
      if (descEl) descEl.value = d.descripcion || '';
      if (cantEl) cantEl.value = String(Number(d.cantidad || 1));
      if (precioEl) precioEl.value = String(Number(d.precio_unitario || 0));
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
    function calcManoObraPrice() {
      const tipoTec = qm('#cot-line-mo-tipo-tec')?.value || 'mecanico';
      const zona = qm('#cot-line-mo-zona')?.value || 'a';
      const hrsTraslado = Number(qm('#cot-line-mo-hrs-traslado')?.value) || 0;
      const hrsTrabajo = Number(qm('#cot-line-mo-hrs-trabajo')?.value) || 0;
      const ayudantes = Number(qm('#cot-line-mo-ayudantes')?.value) || 0;
      const viaticoDias = Number(qm('#cot-line-mo-viaticos-dias')?.value) || 0;
      const tarifaHora = getTarifaVal(`${tipoTec}_mxn`);
      const tarifaAyudante = getTarifaVal('ayudante_mxn');
      const tarifaViatico = getTarifaVal(`zona_${zona}_viatico`);
      const precio = (hrsTrabajo * tarifaHora)
        + (hrsTraslado * tarifaHora)
        + (ayudantes * hrsTrabajo * tarifaAyudante)
        + (viaticoDias * tarifaViatico);
      const descParts = [];
      if (hrsTrabajo) descParts.push(`${hrsTrabajo}h trabajo`);
      if (hrsTraslado) descParts.push(`${hrsTraslado}h traslado`);
      if (ayudantes) descParts.push(`${ayudantes} ayudante(s)`);
      const zonaLabel = zona === 'a' ? 'A-Local' : zona === 'b' ? 'B-Regional' : 'C-Nacional';
      const desc = `M.O. Zona ${zonaLabel} – ${descParts.join(', ')}`;
      if (qm('#cot-line-precio')) qm('#cot-line-precio').value = precio.toFixed(2);
      if (qm('#cot-line-cant')) qm('#cot-line-cant').value = hrsTrabajo || 1;
      if (qm('#cot-line-desc')) qm('#cot-line-desc').value = desc;
    }
    function fillPrecioListaLinea() {
      const t = qm('#cot-line-tipo')?.value || 'refaccion';
      const tc = Number(qm('#cotz-tc')?.value) || 17;
      const mon = (qm('#cotz-moneda')?.value || 'MXN').toUpperCase();
      const precioEl = qm('#cot-line-precio');
      if (t === 'refaccion') {
        const rid = Number(qm('#cot-line-refaccion')?.value);
        const r = (refaccionesCache || []).find((x) => Number(x.id) === rid);
        if (r && precioEl) {
          const usd = resolveRefaccionPrecioUsd(r);
          const mxn = Number(r.precio_unitario) || 0;
          const pu = mon === 'USD'
            ? (usd != null ? usd : 0)
            : (mxn > 0 ? mxn : (usd != null && usd > 0 ? Math.round(usd * tc * 100) / 100 : 0));
          precioEl.value = pu.toFixed(2);
        }
      }
      if (t === 'equipo') {
        const mid = Number(qm('#cot-line-maq')?.value);
        const m = (maquinasCatalogoModal || []).find((x) => Number(x.id) === mid);
        if (m && precioEl) {
          const usd = Number(m.precio_lista_usd) || 0;
          const pu = mon === 'USD' ? usd : (usd > 0 ? Math.round(usd * tc * 100) / 100 : 0);
          precioEl.value = pu.toFixed(2);
        }
      }
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
      const descWrap = qm('#cot-line-desc-wrap');
      const bitWrap = qm('#cot-line-bit-wrap');
      const moWrap = qm('#cot-line-mo-wrap');
      if (refWrap) refWrap.style.display = t === 'refaccion' ? '' : 'none';
      if (descWrap) descWrap.style.display = t === 'refaccion' || t === 'equipo' ? 'none' : '';
      if (bitWrap) bitWrap.style.display = t === 'mano_obra' ? '' : 'none';
      if (moWrap) moWrap.style.display = t === 'mano_obra' ? '' : 'none';
      if (t === 'mano_obra') calcManoObraPrice();
      if (t === 'refaccion' || t === 'equipo') fillPrecioListaLinea();
    }
    async function ensureCotizacionExistsBeforeLines() {
      if (currentCotId) return currentCotId;
      // Auto-guardar header para permitir agregar líneas desde "Nueva cotización"
      const fecha = readCotzFechaForSave();
      const clienteId = parseInt(qm('#cotz-cliente_id')?.value, 10);
      if (!clienteId) { showToast('Selecciona un cliente.', 'warning'); return null; }
      if (!fecha) { showToast('Selecciona una fecha.', 'warning'); return null; }
      const tipo = qm('#cotz-tipo')?.value || 'refacciones';
      const moneda = (qm('#cotz-moneda')?.value || 'MXN').toUpperCase();
      const tc = Number(qm('#cotz-tc')?.value) || 17.0;
      const maquinas_ids = getSelectedMaquinaIdsFromUi();
      const vid = qm('#cotz-vendedor-id')?.value ? Number(qm('#cotz-vendedor-id').value) : null;
      const vend = (tecnicosCache || []).find((x) => Number(x.id) === Number(vid));
      const payload = {
        cliente_id: clienteId,
        tipo,
        fecha,
        moneda,
        tipo_cambio: tc,
        maquinas_ids,
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
    // Mano de obra: recalcular precio cuando cambia cualquier campo
    ['#cot-line-mo-tipo-tec','#cot-line-mo-zona','#cot-line-mo-hrs-traslado',
     '#cot-line-mo-hrs-trabajo','#cot-line-mo-ayudantes','#cot-line-mo-viaticos-dias'].forEach(sel => {
      qm(sel)?.addEventListener('input', calcManoObraPrice);
      qm(sel)?.addEventListener('change', calcManoObraPrice);
    });
    syncLinePanelFields();
    syncVendedorCotz();

    // Si el usuario cambia las máquinas seleccionadas, el "draft" debe tomar la primera seleccionada
    getCotzMaquinasListEl()?.addEventListener('change', () => {
      const first = getFirstSelectedMaquinaId();
      if (!lastLineDraft) lastLineDraft = buildDefaultLineDraft();
      lastLineDraft.maquina_id = first;
    });

    qm('#cotz-cliente_id')?.addEventListener('change', async () => {
      await refreshMaquinasForSelectedCliente([]);
      const first = getFirstSelectedMaquinaId();
      if (!lastLineDraft) lastLineDraft = buildDefaultLineDraft();
      lastLineDraft.maquina_id = first;
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
      await refreshMaquinasForSelectedCliente(maqIds);
      if (currentCotId) await loadBitacorasForCotizacion();
    } catch (_) {}

    qm('#cot-line-bitacora')?.addEventListener('change', () => {
      const bitId = Number(qm('#cot-line-bitacora')?.value) || null;
      if (!bitId) return;
      const bit = (bitacorasForCot || []).find((b) => Number(b.id) === bitId);
      if (!bit) return;
      // Autorellenar mano de obra desde bitácora (editable)
      const horas = Number(bit.tiempo_horas) || 0;
      const act = (bit.actividades || '').trim();
      const tec = (bit.tecnico || '').trim();
      if (qm('#cot-line-cant')) qm('#cot-line-cant').value = String(horas || 1);
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
      const precio = Number(qm('#cot-line-precio')?.value) || 0;
      const maqId = Number(qm('#cot-line-maq')?.value) || null;
      const bitId = Number(qm('#cot-line-bitacora')?.value) || null;
      if (tipoLinea === 'equipo' && !maqId) {
        showToast('Selecciona la máquina / equipo para la línea de venta.', 'warning');
        return;
      }
      let payload = { tipo_linea: tipoLinea, cantidad: cant, precio_unitario: precio, maquina_id: maqId, bitacora_id: bitId };
      if (tipoLinea === 'refaccion') {
        const refId = Number(qm('#cot-line-refaccion')?.value) || null;
        payload = { ...payload, refaccion_id: refId };
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

    function openModalEditarLinea(linea) {
      const isRef = String(linea.tipo_linea || '') === 'refaccion';
      const isEquipo = String(linea.tipo_linea || '') === 'equipo';
      const isMO = String(linea.tipo_linea || '') === 'mano_obra';
      const clienteIdParaMaq = Number(qm('#cotz-cliente_id')?.value) || Number(cot && cot.cliente_id) || null;
      const maqOpts = ['<option value="">— Sin máquina —</option>']
        .concat((maquinasCatalogoModal || []).filter((m) => !clienteIdParaMaq || Number(m.cliente_id) === Number(clienteIdParaMaq))
          .map((m) => `<option value="${m.id}" ${Number(linea.maquina_id) === Number(m.id) ? 'selected' : ''}>${escapeHtml(m.nombre || m.modelo || m.numero_serie || ('#' + m.id))}</option>`))
        .join('');
      const refOpts = (refaccionesCache || []).slice(0, 200).map((r) => `<option value="${r.id}" ${Number(linea.refaccion_id) === Number(r.id) ? 'selected' : ''}>${escapeHtml((r.codigo || '') + ' — ' + (r.descripcion || ''))}</option>`).join('');
      const bitOpts = ['<option value="">— Sin bitácora —</option>']
        .concat((bitacorasForCot || []).map((b) => {
          const label = (b.fecha ? String(b.fecha).slice(0, 10) : '') + ' · ' + (b.tecnico || 'Técnico') + ' · ' + (Number(b.tiempo_horas || 0).toFixed(1) + ' h');
          const sel = Number(linea.bitacora_id) === Number(b.id) ? 'selected' : '';
          return `<option value="${b.id}" ${sel}>${escapeHtml(label)}</option>`;
        }))
        .join('');
      const html = `
        <div class="form-row">
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
          <div class="form-group">
            <label>Máquina (opcional)</label>
            <select id="e-line-maq">${maqOpts}</select>
          </div>
        </div>
        <div class="form-group" id="e-line-ref-wrap" style="${isRef ? '' : 'display:none'}">
          <label>Refacción</label>
          <select id="e-line-ref">${refOpts}</select>
        </div>
        <div class="form-group" id="e-line-desc-wrap" style="${isRef || isEquipo ? 'display:none' : ''}">
          <label>Descripción</label>
          <input type="text" id="e-line-desc" value="${escapeHtml(linea.descripcion || '')}">
        </div>
        <div class="form-group" id="e-line-bit-wrap" style="${isMO ? '' : 'display:none'}">
          <label>Bitácora ligada</label>
          <select id="e-line-bit">${bitOpts}</select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Cantidad / Horas</label>
            <input type="number" id="e-line-cant" step="0.25" min="0" value="${Number(linea.cantidad || 0)}">
          </div>
          <div class="form-group">
            <label>Precio</label>
            <input type="number" id="e-line-precio" step="0.01" min="0" value="${Number(linea.precio_unitario || 0)}">
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
        const descWrap = qs('#e-line-desc-wrap');
        const bitWrap = qs('#e-line-bit-wrap');
        if (refWrap) refWrap.style.display = t === 'refaccion' ? '' : 'none';
        if (descWrap) descWrap.style.display = t === 'refaccion' || t === 'equipo' ? 'none' : '';
        if (bitWrap) bitWrap.style.display = t === 'mano_obra' ? '' : 'none';
      }
      qs('#e-line-tipo')?.addEventListener('change', syncEditFields);
      syncEditFields();
      if (qs('#e-line-open-bit')) {
        qs('#e-line-open-bit').addEventListener('click', () => editBitacora(linea.bitacora_id));
      }
      qs('#e-line-save')?.addEventListener('click', async () => {
        const tipoLinea = qs('#e-line-tipo')?.value || 'otro';
        const payload = {
          tipo_linea: tipoLinea,
          maquina_id: Number(qs('#e-line-maq')?.value) || null,
          cantidad: Number(qs('#e-line-cant')?.value) || 0,
          precio_unitario: Number(qs('#e-line-precio')?.value) || 0,
          bitacora_id: Number(qs('#e-line-bit')?.value) || null,
        };
        if (tipoLinea === 'refaccion') payload.refaccion_id = Number(qs('#e-line-ref')?.value) || null;
        else if (tipoLinea !== 'equipo') payload.descripcion = qs('#e-line-desc')?.value?.trim() || null;
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
      const moneda = (qm('#cotz-moneda')?.value || 'MXN').toUpperCase();
      const tc = Number(qm('#cotz-tc')?.value) || 0;
      const maquinas_ids = getSelectedMaquinaIdsFromUi();
      const vid = qm('#cotz-vendedor-id')?.value ? Number(qm('#cotz-vendedor-id').value) : null;
      const vend = (tecnicosCache || []).find((x) => Number(x.id) === Number(vid));
      const payload = {
        cliente_id: clienteId,
        tipo,
        fecha,
        moneda,
        tipo_cambio: tc > 0 ? tc : 17.0,
        maquinas_ids,
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
        loadCotizaciones();
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
        loadBitacoras();
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
      const raw = await Promise.all([
        fetchJson(API + '/clientes').catch(() => []),
        fetchJson(API + '/refacciones').catch(() => []),
        fetchJson(API + '/maquinas').catch(() => []),
        fetchJson(API + '/cotizaciones').catch(() => []),
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
        { label: 'Cotizaciones (monto)', value: formatMoney(cotTotal), icon: 'fa-file-invoice-dollar', cf: 'cotizaciones' },
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
        { id: 'cotizaciones', icon: 'fa-file-invoice-dollar', title: 'Cotizaciones', goto: 'cotizaciones', rows: [{ label: 'Total', value: cotizacionesCtx.length, v: 'neutral' }, { label: 'Monto total', value: formatMoney(cotTotal), v: 'positive' }, { label: 'Este mes', value: cotEsteMes, v: 'positive' }, { label: 'Refacciones / Mano obra', value: cotRefacciones + ' / ' + cotManoObra, v: 'neutral' }] },
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
        bitacorasCache = bitacoras;
        const filtCot = applyFilters(cotizacionesCache, getFilterValues('#tabla-cotizaciones'), 'tabla-cotizaciones');
        const filtBit = applyFilters(bitacorasCache, getFilterValues('#tabla-bitacoras'), 'tabla-bitacoras');
        renderCotizaciones(filtCot, cotizacionesCache.length);
        renderBitacoras(filtBit, bitacorasCache.length);
        fetchJson(API + '/incidentes')
          .then((r) => { incidentesCache = toArray(r); updateHeaderUrgencies(); })
          .catch(() => {});
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
          const nBit = bitacorasCtx.length;
          const donutCtx = document.getElementById('chart-donut');
          if (donutCtx && (nCot + nBit > 0)) {
            chartDonut = new Chart(donutCtx, {
              type: 'doughnut',
              data: {
                labels: ['Cotizaciones', 'Bitácoras'],
                datasets: [{ data: [nCot, nBit], backgroundColor: ['#059669', '#7c3aed'], borderColor: '#1e293b', borderWidth: 2 }],
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
    if (id === 'garantias') loadGarantias();
    if (id === 'mantenimiento-garantia') loadMantenimientoGarantia();
    if (id === 'garantias-sin-cobertura') loadGarantiasSinCobertura();
    if (id === 'bitacoras') loadBitacoras();
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
      await loadBitacoras();
      showPanel('bitacoras', { skipLoad: true });
      showToast('Demo completo cargado: clientes, cotizaciones, reportes, garantías y bonos.', 'success');
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
    let filtered = applyFilters(applyGlobalBranchFilterRows(maquinasCache), getFilterValues('#tabla-maquinas'), tid);
    const catFilter = qs('#filtro-categoria-maq') && qs('#filtro-categoria-maq').value;
    if (catFilter) filtered = filtered.filter(m => m.categoria === catFilter);
    const zonaFilter = qs('#filtro-zona-maq') && qs('#filtro-zona-maq').value;
    if (zonaFilter) filtered = filtered.filter(m => m.ubicacion === zonaFilter);
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
    finally { hideLoading(); }
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
    const totalMXN = data.reduce((s, v) => s + (Number(v.total) || 0), 0);
    const resBar = qs('#ventas-resumen-bar');
    if (resBar) {
      resBar.classList.remove('hidden');
      resBar.innerHTML = `<i class="fas fa-chart-bar"></i> <strong>${data.length}</strong> ventas &nbsp;|&nbsp; Total: <strong>${formatMoney(totalMXN)}</strong>`;
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
    finally { hideLoading(); }
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
    if (effectiveCat && !CATEGORIAS_MAQUINAS.includes(effectiveCat)) {
      catExtra = `<option value="${escapeHtml(effectiveCat)}" selected>${escapeHtml(effectiveCat)} (histórico)</option>`;
    }
    const catOpts = CATEGORIAS_MAQUINAS.map(c =>
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
            if (rawCat && CATEGORIAS_MAQUINAS.includes(rawCat)) catEl.value = rawCat;
            else if (rawCat) {
              const has = Array.from(catEl.options).some(o => o.value === rawCat);
              if (!has) {
                const o = document.createElement('option');
                o.value = rawCat;
                o.textContent = rawCat + ' (catálogo)';
                catEl.insertBefore(o, catEl.firstChild);
              }
              catEl.value = rawCat;
            } else catEl.value = 'Centro de Maquinado';
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

  function previewTecnico(t) {
    openPreviewCard({
      title: t.nombre || 'Personal',
      subtitle: [t.puesto, t.departamento].filter(Boolean).join(' · ') || (t.ocupado ? 'En servicio' : 'Disponible'),
      icon: 'fa-hard-hat',
      color: 'linear-gradient(135deg, #0891b2 0%, #164e63 100%)',
      badge: t.activo ? 'Activo' : 'Inactivo',
      badgeClass: t.activo ? 'pvc-badge--success' : 'pvc-badge--danger',
      sections: [{
        title: 'Información', icon: 'fa-user',
        fields: [
          { label: 'ID', value: t.id, icon: 'fa-hashtag' },
          { label: 'Nombre', value: t.nombre, icon: 'fa-user', full: true },
          { label: 'Rol', value: t.rol || '—', icon: 'fa-id-badge' },
          { label: 'Puesto', value: t.puesto || '—', icon: 'fa-briefcase' },
          { label: 'Departamento', value: t.departamento || '—', icon: 'fa-building' },
          { label: 'Profesión', value: t.profesion || '—', icon: 'fa-graduation-cap' },
          { label: 'Vendedor', value: Number(t.es_vendedor) === 1 ? 'Sí' : 'No', icon: 'fa-handshake' },
          ...(canViewCommissions() ? [
            { label: 'Comisión % equipo', value: t.comision_maquinas_pct != null ? String(t.comision_maquinas_pct) : '—', icon: 'fa-percent' },
            { label: 'Comisión % refacciones', value: t.comision_refacciones_pct != null ? String(t.comision_refacciones_pct) : '—', icon: 'fa-percent' },
          ] : []),
          { label: 'Estado', value: t.activo ? 'Activo' : 'Inactivo', icon: 'fa-toggle-on', badge: true, badgeClass: t.activo ? 'pvc-badge--success' : 'pvc-badge--danger' },
          { label: 'Disponibilidad', value: t.ocupado ? '🔒 Ocupado' : '✓ Disponible', icon: 'fa-clock', badge: true, badgeClass: t.ocupado ? 'pvc-badge--warning' : 'pvc-badge--success' },
        ]
      }, t.habilidades ? {
        title: 'Habilidades / Especialidades', icon: 'fa-tools',
        fields: [{ label: 'Habilidades', value: t.habilidades, full: true }]
      } : null].filter(Boolean)
    });
  }
  function renderTecnicos(data) {
    const tbody = qs('#tabla-tecnicos tbody');
    if (!tbody) return;
    const q = (qs('#buscar-tecnicos')?.value || '').toLowerCase();
    const filtered = q ? data.filter(t => (t.nombre || '').toLowerCase().includes(q) || (t.habilidades || '').toLowerCase().includes(q) || (t.puesto || '').toLowerCase().includes(q) || (t.departamento || '').toLowerCase().includes(q)) : data;
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
      tr.innerHTML = `
        <td><strong>${escapeHtml(t.nombre || '')}</strong></td>
        <td style="font-size:0.82rem">${escapeHtml(t.rol || '—')}</td>
        <td style="font-size:0.82rem">${escapeHtml(t.puesto || '—')}</td>
        <td style="font-size:0.82rem">${escapeHtml(t.departamento || '—')}</td>
        <td>${vendBadge}</td>
        <td style="font-size:0.82rem;color:var(--text-secondary)">${escapeHtml(t.habilidades || '—')}</td>
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

  function openModalTecnico(tec) {
    const isNew = !tec || !tec.id;
    const showCom = canViewCommissions();
    const comRow = showCom ? `
      <div class="form-row">
        <div class="form-group"><label>Comisión % equipo (máquinas)</label><input type="number" id="m-tec-com-m" min="0" max="100" step="0.5" value="${tec && tec.comision_maquinas_pct != null ? escapeHtml(String(tec.comision_maquinas_pct)) : '0'}"></div>
        <div class="form-group"><label>Comisión % refacciones</label><input type="number" id="m-tec-com-r" min="0" max="100" step="0.5" value="${tec && tec.comision_refacciones_pct != null ? escapeHtml(String(tec.comision_refacciones_pct)) : '10'}"></div>
      </div>` : '';
    const body = `
      <div class="form-group"><label>Nombre *</label>
        <input type="text" id="m-tec-nombre" maxlength="100" value="${escapeHtml(tec && tec.nombre || '')}" placeholder="Ej. Juan Pérez" required>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Rol</label><input type="text" id="m-tec-rol" maxlength="120" value="${escapeHtml(tec && tec.rol || '')}" placeholder="Ej. Líder comercial"></div>
        <div class="form-group"><label>Puesto</label><input type="text" id="m-tec-puesto" maxlength="120" value="${escapeHtml(tec && tec.puesto || '')}" placeholder="Ej. Jefe de Área"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Departamento</label><input type="text" id="m-tec-depto" maxlength="120" value="${escapeHtml(tec && tec.departamento || '')}"></div>
        <div class="form-group"><label>Profesión</label><input type="text" id="m-tec-prof" maxlength="120" value="${escapeHtml(tec && tec.profesion || '')}"></div>
      </div>
      <div class="form-group"><label>Habilidades / Especialidades</label>
        <textarea id="m-tec-habilidades" rows="3" maxlength="500" placeholder="Ej. CNC Fanuc, Electroerosión, PLC Siemens, Soldadura MIG…">${escapeHtml(tec && tec.habilidades || '')}</textarea>
        <div class="hint">Separa con comas. Aparece en la tabla y en el dropdown de asignación.</div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>¿Vendedor?</label>
          <select id="m-tec-es-vendedor">
            <option value="0" ${tec && Number(tec.es_vendedor) !== 1 ? 'selected' : ''}>No</option>
            <option value="1" ${tec && Number(tec.es_vendedor) === 1 ? 'selected' : ''}>Sí</option>
          </select>
        </div>
      </div>
      ${comRow}
      ${!isNew ? `<div class="form-group"><label>Estado</label>
        <select id="m-tec-activo">
          <option value="1" ${tec && tec.activo != 0 ? 'selected' : ''}>Activo</option>
          <option value="0" ${tec && tec.activo == 0 ? 'selected' : ''}>Inactivo</option>
        </select>
      </div>` : ''}
      <div class="form-actions">
        <button type="button" class="btn primary" id="m-save"><i class="fas fa-save"></i> Guardar</button>
        <button type="button" class="btn" id="modal-btn-cancel">Cancelar</button>
      </div>`;
    openModal(isNew ? 'Nueva persona' : 'Editar personal', body);
    qs('#m-save').onclick = async () => {
      const nombre = qs('#m-tec-nombre')?.value.trim();
      if (!nombre) { showToast('El nombre es obligatorio.', 'error'); return; }
      const comM = canViewCommissions() ? (Number(qs('#m-tec-com-m')?.value) || 0) : (Number(tec && tec.comision_maquinas_pct) || 0);
      const comR = canViewCommissions() ? (Number(qs('#m-tec-com-r')?.value) || 0) : (Number(tec && tec.comision_refacciones_pct) || 10);
      const payload = {
        nombre,
        rol: qs('#m-tec-rol')?.value.trim() || null,
        puesto: qs('#m-tec-puesto')?.value.trim() || null,
        departamento: qs('#m-tec-depto')?.value.trim() || null,
        profesion: qs('#m-tec-prof')?.value.trim() || null,
        habilidades: qs('#m-tec-habilidades')?.value.trim() || null,
        es_vendedor: qs('#m-tec-es-vendedor')?.value === '1' ? 1 : 0,
        comision_maquinas_pct: comM,
        comision_refacciones_pct: comR,
        activo: isNew ? 1 : parseInt(qs('#m-tec-activo')?.value || '1', 10),
      };
      try {
        if (isNew) await fetchJson(API + '/tecnicos', { method: 'POST', body: JSON.stringify(payload) });
        else await fetchJson(API + '/tecnicos/' + tec.id, { method: 'PUT', body: JSON.stringify(payload) });
        qs('#modal').classList.add('hidden');
        showToast(isNew ? 'Persona creada.' : 'Persona actualizada.', 'success');
        loadTecnicos();
      } catch (e) { showToast(parseApiError(e) || 'No se pudo guardar.', 'error'); }
    };
  }

  qs('#btn-new-tecnico')?.addEventListener('click', () => openModalTecnico(null));
  qs('#buscar-tecnicos')?.addEventListener('input', debounce(() => renderTecnicos(tecnicosCache), 250));

  // ----- IMPORTAR XLSX REFACCIONES -----
  async function importRefaccionesXlsx(file) {
    if (!file) return;
    if (typeof ExcelJS === 'undefined') { showToast('ExcelJS no disponible. Recarga la página.', 'error'); return; }
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
        const precioRaw = row.getCell(3).value;
        const stockRaw = row.getCell(4).value;
        const categoria = (row.getCell(5).text || row.getCell(5).value || '').toString().trim();
        const zona = (row.getCell(6).text || row.getCell(6).value || '').toString().trim();
        // Intentar extraer código del inicio de la descripción (números + guiones)
        const codeMatch = desc.match(/^([\d\-A-Z]+(?:\s[\d\-A-Z]+)?)\s+(.+)$/);
        const codigo = codeMatch ? codeMatch[1].trim() : desc.slice(0, 20).replace(/\s+/g, '-').toUpperCase();
        const descripcion = codeMatch ? codeMatch[2].trim() : desc;
        rows.push({
          codigo,
          descripcion,
          unidad,
          precio_unitario: Number(precioRaw) || 0,
          stock: Number(stockRaw) || 0,
          categoria: categoria || null,
          zona: zona || null,
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
        }
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
  qs('#filtro-cliente-maq').addEventListener('change', loadMaquinas);
  qs('#filtro-categoria-maq') && qs('#filtro-categoria-maq').addEventListener('change', applyMaquinasFiltersAndRender);
  qs('#filtro-zona-maq') && qs('#filtro-zona-maq').addEventListener('change', applyMaquinasFiltersAndRender);
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
      const modal = qs('#modal');
      if (modal && !modal.classList.contains('hidden')) modal.classList.add('hidden');
    }
    const inInput = document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].indexOf(document.activeElement.tagName) >= 0;
    if (!inInput && (e.ctrlKey || e.metaKey)) {
      const tabMap = { '0': 'dashboards', '1': 'clientes', '2': 'refacciones', '3': 'maquinas', '4': 'cotizaciones', '5': 'bonos', '6': 'bitacoras', '7': 'acerca' };
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
      { panel: 'bonos', title: 'Bonos de capacitación', text: 'Bonos ligados a reportes de servicio y al personal.', icon: 'fa-award', gradient: 'g-orange', bullets: ['Montos y estados de pago', 'Asociación a reporte', 'Sin mezclar con viáticos'] },
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
      let last = localStorage.getItem(LAST_TAB_KEY);
      if (last === 'incidentes' || last === 'viajes') {
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
      if (last === 'bonos' && !canViewCommissions()) {
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
      { id: 'cotizaciones', label: 'Cotizaciones', icon: 'fa-file-invoice-dollar' },
      { id: 'bonos', label: 'Bonos', icon: 'fa-award' },
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
        loadMaquinas();
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
    if (!getAuthToken()) {
      showLoginOverlay(true);
      const hint = qs('#login-hint');
      if (hint) hint.textContent = 'Introduce las credenciales de tu cuenta para continuar.';
      setupLoginForm();
      initTheme();
      syncThemeColorMeta();
      return;
    }
    finishBoot();
  }
  boot();
})();
