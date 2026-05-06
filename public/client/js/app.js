/**
 * Frontend greenfield: solo consume API existente (login, config, me).
 * La SPA anterior sigue en /legacy-app.html vía ruta /legacy-app.
 */
const TOKEN_KEY = 'scw_auth_token_v2';

function applyTheme(cfg) {
  const root = document.documentElement;
  if (cfg.primaryHex) root.style.setProperty('--brand-primary', cfg.primaryHex);
  if (cfg.accentHex) root.style.setProperty('--brand-accent', cfg.accentHex);
  document.title = cfg.shortName || cfg.appName || 'Sistema';
}

async function fetchJson(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  const res = await fetch(path, { ...options, headers });
  let body = null;
  try {
    body = await res.json();
  } catch (_) {
    body = null;
  }
  if (!res.ok) {
    const msg =
      body && typeof body.error === 'string'
        ? body.error
        : `Error ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch (_) {}
}

function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (_) {
    return null;
  }
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function renderLogin(root, cfg, errorMsg) {
  const errBlock =
    errorMsg != null && String(errorMsg).trim()
      ? `<div class="alert alert-error" role="alert">${escapeHtml(String(errorMsg))}</div>`
      : '';

  root.replaceChildren(
    el(`
      <div class="login-wrap">
        <div class="login-card">
          <h1>${escapeHtml(cfg.shortName || cfg.appName || 'Acceso')}</h1>
          <p class="subtitle">${escapeHtml(cfg.tagline || 'Inicia sesión para continuar.')}</p>
          ${errBlock}
          <form id="login-form" novalidate>
            <div class="field">
              <label for="username">Usuario</label>
              <input id="username" name="username" type="text" autocomplete="username" required />
            </div>
            <div class="field">
              <label for="password">Contraseña</label>
              <input id="password" name="password" type="password" autocomplete="current-password" required />
            </div>
            <button type="submit" class="btn btn-primary">Entrar</button>
          </form>
          ${
            cfg.buildTag
              ? `<p class="build-tag muted">${escapeHtml(cfg.buildTag)}</p>`
              : ''
          }
        </div>
      </div>
    `)
  );

  const form = root.querySelector('#login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = root.querySelector('#username').value.trim();
    const password = root.querySelector('#password').value;
    try {
      const data = await fetchJson('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (data.token) {
        try {
          localStorage.setItem(TOKEN_KEY, data.token);
        } catch (_) {}
      }
      const me = await fetchJson('/api/auth/me', {
        headers: { Authorization: `Bearer ${data.token}` },
      });
      renderShell(root, cfg, me.user);
    } catch (err) {
      renderLogin(root, cfg, err.message || 'No se pudo iniciar sesión.');
    }
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderShell(root, cfg, user) {
  const display = user.displayName || user.display_name || user.username || 'Usuario';
  const role = user.role || '—';

  root.replaceChildren(
    el(`
      <div class="app-shell">
        <header class="top-bar">
          <div>
            <h1>${escapeHtml(cfg.shortName || cfg.appName || 'Panel')}</h1>
            <p class="tagline">${escapeHtml(cfg.tagline || '')}</p>
          </div>
          <div class="top-actions">
            <span class="user-chip">${escapeHtml(display)} · ${escapeHtml(role)}</span>
            <button type="button" class="btn btn-ghost" id="btn-logout">Cerrar sesión</button>
          </div>
        </header>
        <main class="page">
          <div class="card">
            <h2>Panel principal</h2>
            <p class="muted">
              Esta interfaz es nueva: aquí solo mostramos tu sesión y la configuración pública.
              Los módulos de negocio (cotizaciones, clientes, catálogos, etc.) se conectarán por API
              en iteraciones siguientes, sin reutilizar la maquetación ni estilos del proyecto anterior.
            </p>
            <dl class="kv">
              <div><dt>Usuario</dt><dd>${escapeHtml(user.username || '—')}</dd></div>
              <div><dt>Nombre</dt><dd>${escapeHtml(display)}</dd></div>
              <div><dt>Rol</dt><dd>${escapeHtml(role)}</dd></div>
              <div><dt>Puede cotizar</dt><dd>${user.canCotizar ? 'Sí' : 'No'}</dd></div>
            </dl>
            ${
              cfg.buildTag
                ? `<p class="build-tag muted">${escapeHtml(cfg.buildTag)}</p>`
                : ''
            }
          </div>
        </main>
      </div>
    `)
  );

  root.querySelector('#btn-logout').addEventListener('click', () => {
    clearToken();
    renderLogin(root, cfg, null);
  });
}

async function bootstrap() {
  const root = document.getElementById('app');
  if (!root) return;

  let cfg;
  try {
    cfg = await fetchJson('/api/config');
  } catch (e) {
    root.replaceChildren(
      el(`<div class="login-wrap"><div class="login-card"><p class="alert alert-error">${escapeHtml(e.message)}</p></div></div>`)
    );
    return;
  }

  applyTheme(cfg);

  if (!cfg.authRequired) {
    try {
      const me = await fetchJson('/api/auth/me');
      renderShell(root, cfg, me.user);
    } catch (e) {
      root.replaceChildren(
        el(`<div class="login-wrap"><div class="login-card"><p class="alert alert-error">${escapeHtml(e.message)}</p></div></div>`)
      );
    }
    return;
  }

  const token = getToken();
  if (token) {
    try {
      const me = await fetchJson('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      renderShell(root, cfg, me.user);
      return;
    } catch (_) {
      clearToken();
    }
  }

  renderLogin(root, cfg, null);
}

bootstrap();
