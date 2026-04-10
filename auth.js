/**
 * Autenticación siempre activa, tokens firmados y auditoría de mutaciones.
 * Roles:
 * - admin: todo + gestión de usuarios (/api/app-users).
 * - consulta | invitado: solo lectura (GET/HEAD).
 * - usuario | operador: lectura + crear/editar cotizaciones (y líneas), aplicar cotización, crear/editar reportes.
 */
'use strict';
const crypto = require('crypto');
const db = require('./db');

// Auth siempre activa a menos que explícitamente se desactive con AUTH_ENABLED=0
const AUTH_ENABLED = process.env.AUTH_ENABLED !== '0' && process.env.AUTH_ENABLED !== 'false';
const AUTH_SECRET = process.env.AUTH_SECRET || '';
const TOKEN_MS = (parseInt(process.env.AUTH_TOKEN_DAYS || '7', 10) || 7) * 24 * 60 * 60 * 1000;
const AUDIT_ENABLED = process.env.AUDIT_ENABLED !== '0' && process.env.AUDIT_ENABLED !== 'false';

function getPublicConfig() {
  const build =
    (process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || process.env.COMMIT_SHA || '').trim();
  const buildTag = build ? ('build:' + build.slice(0, 7)) : '';
  return {
    authRequired: AUTH_ENABLED,
    auditUi: AUTH_ENABLED,
    /** Si es false, no se insertan filas en audit_log (mutaciones no quedan registradas). */
    auditLoggingEnabled: AUDIT_ENABLED,
    appName: process.env.APP_NAME || 'Gestor Administrativo',
    shortName: process.env.APP_SHORT_NAME || 'Gestor Administrativo',
    tagline: process.env.APP_TAGLINE || 'Gestión de operaciones, incidentes, bitácora y catálogos en una sola plataforma',
    buildTag,
    logoUrl: (process.env.APP_LOGO_URL || '').trim(),
    primaryHex: process.env.APP_PRIMARY_HEX || '#1e3a5f',
    accentHex: process.env.APP_ACCENT_HEX || '#0d9488',
    soundEffectsDefault: process.env.APP_SOUND_DEFAULT === '1' || process.env.APP_SOUND_DEFAULT === 'true',
  };
}

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(plain, stored) {
  if (!stored || String(stored).indexOf(':') < 0) return false;
  const [salt, hash] = stored.split(':');
  try {
    const h = crypto.scryptSync(String(plain), salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(h, 'hex'));
  } catch (_) {
    return false;
  }
}

function signToken(payload) {
  const secret = AUTH_SECRET || 'dev-inseguro-cambiar-AUTH_SECRET';
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const secret = AUTH_SECRET || 'dev-inseguro-cambiar-AUTH_SECRET';
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  try {
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch (_) {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch (_) {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
  return payload;
}

function parseBearer(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

function attachUser(req) {
  req.authUser = null;
  const raw = parseBearer(req);
  if (!raw) return;
  const p = verifyToken(raw);
  if (!p || p.sub == null) return;
  req.authUser = {
    id: p.sub,
    username: p.u || '',
    role: p.r || 'usuario',
    displayName: p.d || p.u || '',
  };
}

function isPublicPath(url) {
  return (
    url.startsWith('/api/config') ||
    url.startsWith('/api/auth/login')
  );
}

const READ_ONLY_ROLES = ['consulta', 'invitado'];
const STAFF_ROLES = ['usuario', 'operador'];

function normalizeApiPath(url) {
  const path = String(url || '').split('?')[0];
  return path.replace(/\/+$/, '') || path;
}

/** Rutas que solo el administrador puede usar (cualquier método). */
function isAdminOnlyApiPath(url) {
  const p = normalizeApiPath(url);
  if (p.startsWith('/api/app-users')) return true;
  if (p === '/api/tarifas') return true;
  if (p === '/api/prospectos') return true;
  return false;
}

/** usuario/operador: POST permitido (cotizaciones, líneas, aplicar, reportes, IA prospectos). */
function postAllowedForStaff(url) {
  const p = normalizeApiPath(url);
  if (p === '/api/cotizaciones') return true;
  if (/^\/api\/cotizaciones\/\d+\/lineas$/.test(p)) return true;
  if (/^\/api\/cotizaciones\/\d+\/aplicar$/.test(p)) return true;
  if (p === '/api/reportes') return true;
  if (p === '/api/ai/chat') return true;
  if (p.startsWith('/api/ai/extract')) return true;
  return false;
}

/** usuario/operador: PUT/PATCH permitido (cotización, línea de cotización, reporte). */
function putPatchAllowedForStaff(url) {
  const p = normalizeApiPath(url);
  if (/^\/api\/cotizaciones\/\d+$/.test(p)) return true;
  if (/^\/api\/cotizaciones\/\d+\/lineas\/\d+$/.test(p)) return true;
  if (/^\/api\/reportes\/\d+$/.test(p)) return true;
  return false;
}

function wrapAuditJson(req, res) {
  if (!AUDIT_ENABLED || !req.authUser) return;
  const m = req.method;
  if (m !== 'POST' && m !== 'PUT' && m !== 'DELETE') return;
  if (res._auditWrapped) return;
  res._auditWrapped = true;
  const origJson = res.json.bind(res);
  res.json = function (body) {
    const out = origJson(body);
    const code = res.statusCode;
    if (code >= 200 && code < 300) {
      let detail = '';
      try {
        detail = typeof body === 'object' ? JSON.stringify(body) : String(body);
      } catch (_) {
        detail = '';
      }
      if (detail.length > 800) detail = detail.slice(0, 800) + '…';
      const pathOnly = (req.originalUrl || '').split('?')[0];
      db.runQuery(
        'INSERT INTO audit_log (username, role, action, method, path, detail, ip) VALUES (?,?,?,?,?,?,?)',
        [
          req.authUser.username,
          req.authUser.role,
          `${m} ${pathOnly}`,
          m,
          pathOnly,
          detail,
          (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '',
        ]
      ).catch(() => {});
    }
    return out;
  };
}

function createApiMiddleware() {
  return function apiAuthAudit(req, res, next) {
    if (!req.originalUrl.startsWith('/api')) return next();

    attachUser(req);

    if (isPublicPath(req.originalUrl)) return next();

    if (req.originalUrl.startsWith('/api/audit')) {
      if (!AUTH_ENABLED) {
        wrapAuditJson(req, res);
        return next();
      }
      if (!req.authUser) {
        return res.status(401).json({ error: 'No autorizado. Inicia sesión.' });
      }
      if (req.authUser.role !== 'admin') {
        return res.status(403).json({ error: 'Solo el rol administrador puede ver la auditoría' });
      }
      return next();
    }

    if (!AUTH_ENABLED) {
      req.authUser = req.authUser || { id: 0, username: 'local', role: 'admin', displayName: 'Local' };
      wrapAuditJson(req, res);
      return next();
    }

    if (AUTH_ENABLED && !AUTH_SECRET) {
      console.warn('[auth] AUTH_ENABLED=1 pero falta AUTH_SECRET. Define AUTH_SECRET en el entorno.');
    }

    if (!req.authUser) {
      return res.status(401).json({ error: 'No autorizado. Inicia sesión.' });
    }

    const method = req.method;
    const isRead = method === 'GET' || method === 'HEAD';
    const isWrite = method === 'POST';
    const isModify = method === 'PUT' || method === 'PATCH';
    const isDelete = method === 'DELETE';

    const role = req.authUser.role;

    const validRoles = ['admin', 'operador', 'usuario', 'consulta', 'invitado'];
    if (!validRoles.includes(role)) {
      return res.status(403).json({ error: 'Rol no reconocido' });
    }

    if (isAdminOnlyApiPath(req.originalUrl) && role !== 'admin') {
      return res.status(403).json({ error: 'Solo el administrador puede acceder a este recurso.' });
    }

    if (isRead) {
      wrapAuditJson(req, res);
      return next();
    }

    if (role === 'admin') {
      wrapAuditJson(req, res);
      return next();
    }

    if (READ_ONLY_ROLES.includes(role)) {
      return res.status(403).json({
        error: 'Tu cuenta solo permite consultar información. Para cambios, solicita permisos al administrador.',
      });
    }

    if (STAFF_ROLES.includes(role)) {
      if (isWrite) {
        if (postAllowedForStaff(req.originalUrl)) {
          wrapAuditJson(req, res);
          return next();
        }
        return res.status(403).json({
          error: 'No tienes permiso para crear este tipo de registro. Solo cotizaciones, líneas, aplicar cotización y reportes.',
        });
      }
      if (isModify) {
        if (putPatchAllowedForStaff(req.originalUrl)) {
          wrapAuditJson(req, res);
          return next();
        }
        return res.status(403).json({ error: 'Solo el administrador puede editar este recurso.' });
      }
      if (isDelete) {
        return res.status(403).json({ error: 'Solo el administrador puede eliminar registros.' });
      }
    }

    wrapAuditJson(req, res);
    next();
  };
}

async function attemptLogin(username, password) {
  const u = await db.getOne(
    'SELECT * FROM app_users WHERE lower(username) = lower(?) AND activo = 1',
    [String(username).trim()]
  );
  if (!u || !verifyPassword(password, u.password_hash)) return null;
  const exp = Date.now() + TOKEN_MS;
  const token = signToken({ sub: u.id, u: u.username, r: u.role, d: u.display_name || u.username, exp });
  return {
    token,
    user: {
      id: u.id,
      username: u.username,
      role: u.role,
      displayName: u.display_name || u.username,
    },
  };
}

async function ensureSeedUsers() {
  const row = await db.getOne('SELECT COUNT(*) as c FROM app_users');
  const c = row && row.c != null ? Number(row.c) : 0;
  if (c > 0) return;

  const adminPass = process.env.ADMIN_INITIAL_PASSWORD || 'Admin2025!';
  const seedDemo = process.env.AUTH_SEED_DEMO_USERS === '1' || process.env.AUTH_SEED_DEMO_USERS === 'true';
  await db.runQuery(
    'INSERT INTO app_users (username, password_hash, role, display_name) VALUES (?,?,?,?)',
    ['admin', hashPassword(adminPass), 'admin', 'Administrador']
  );
  console.log('[auth] Usuario administrador inicial creado (admin). El admin puede crear más cuentas desde la app.');
  console.log('  admin / ' + adminPass);

  if (!seedDemo) return;

  const u1Pass = process.env.USUARIO1_INITIAL_PASSWORD || 'Usuario1_2025';
  const u2Pass = process.env.USUARIO2_INITIAL_PASSWORD || 'Usuario2_2025';
  const opPass = process.env.OPERADOR_INITIAL_PASSWORD || 'Operador2025';
  const visPass = process.env.CONSULTA_INITIAL_PASSWORD || 'Consulta2025';
  await db.runQuery(
    'INSERT INTO app_users (username, password_hash, role, display_name) VALUES (?,?,?,?)',
    ['usuario1', hashPassword(u1Pass), 'usuario', 'Usuario 1']
  );
  await db.runQuery(
    'INSERT INTO app_users (username, password_hash, role, display_name) VALUES (?,?,?,?)',
    ['usuario2', hashPassword(u2Pass), 'usuario', 'Usuario 2']
  );
  await db.runQuery(
    'INSERT INTO app_users (username, password_hash, role, display_name) VALUES (?,?,?,?)',
    ['operador', hashPassword(opPass), 'operador', 'Operador']
  );
  await db.runQuery(
    'INSERT INTO app_users (username, password_hash, role, display_name) VALUES (?,?,?,?)',
    ['consulta', hashPassword(visPass), 'consulta', 'Solo consulta']
  );
  console.log('[auth] AUTH_SEED_DEMO_USERS=1: usuarios demo adicionales creados (usuario1, usuario2, operador, consulta).');
}

module.exports = {
  AUTH_ENABLED,
  AUDIT_ENABLED,
  getPublicConfig,
  createApiMiddleware,
  attemptLogin,
  ensureSeedUsers,
  verifyToken,
  hashPassword,
  READ_ONLY_ROLES,
  STAFF_ROLES,
};
