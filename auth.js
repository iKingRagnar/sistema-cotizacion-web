/**
 * Autenticación opcional (AUTH_ENABLED), tokens firmados y auditoría de mutaciones.
 */
'use strict';
const crypto = require('crypto');
const db = require('./db');

const AUTH_ENABLED = process.env.AUTH_ENABLED === '1' || process.env.AUTH_ENABLED === 'true';
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
    role: p.r || 'operador',
    displayName: p.d || p.u || '',
  };
}

function isPublicPath(url) {
  return (
    url.startsWith('/api/config') ||
    url.startsWith('/api/auth/login')
  );
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

    const readOnly = req.method === 'GET' || req.method === 'HEAD';
    if (readOnly) {
      if (!['admin', 'operador', 'consulta'].includes(req.authUser.role)) {
        return res.status(403).json({ error: 'Sin permiso de acceso' });
      }
    } else {
      if (!['admin', 'operador'].includes(req.authUser.role)) {
        return res.status(403).json({ error: 'Tu rol solo permite consultar datos, no modificarlos' });
      }
    }

    wrapAuditJson(req, res);
    next();
  };
}

async function attemptLogin(username, password) {
  const u = await db.getOne('SELECT * FROM app_users WHERE username = ? AND activo = 1', [String(username).trim()]);
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
  if (!AUTH_ENABLED) return;
  const row = await db.getOne('SELECT COUNT(*) as c FROM app_users');
  const c = row && row.c != null ? Number(row.c) : 0;
  if (c > 0) return;

  const adminPass = process.env.ADMIN_INITIAL_PASSWORD || 'admin123';
  const opPass = process.env.OPERADOR_INITIAL_PASSWORD || 'operador123';
  const visPass = process.env.CONSULTA_INITIAL_PASSWORD || 'consulta123';

  await db.runQuery(
    'INSERT INTO app_users (username, password_hash, role, display_name) VALUES (?,?,?,?)',
    ['admin', hashPassword(adminPass), 'admin', 'Administrador']
  );
  await db.runQuery(
    'INSERT INTO app_users (username, password_hash, role, display_name) VALUES (?,?,?,?)',
    ['operador', hashPassword(opPass), 'operador', 'Operador']
  );
  await db.runQuery(
    'INSERT INTO app_users (username, password_hash, role, display_name) VALUES (?,?,?,?)',
    ['consulta', hashPassword(visPass), 'consulta', 'Solo consulta']
  );
  console.log('[auth] Usuarios iniciales creados: admin / operador / consulta (cambia contraseñas con variables de entorno o UPDATE en BD).');
}

module.exports = {
  AUTH_ENABLED,
  AUDIT_ENABLED,
  getPublicConfig,
  createApiMiddleware,
  attemptLogin,
  ensureSeedUsers,
  verifyToken,
};
