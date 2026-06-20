'use strict';
// Logger estructurado mínimo y SIN dependencias.
// - En producción emite JSON por línea (correlacionable por reqId).
// - En desarrollo emite texto legible.
// Nivel configurable con LOG_LEVEL (error|warn|info|debug; por defecto info).
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CURRENT = LEVELS[String(process.env.LOG_LEVEL || 'info').toLowerCase()];
const THRESHOLD = CURRENT == null ? LEVELS.info : CURRENT;
const isProd = process.env.NODE_ENV === 'production';

function emit(level, msg, meta) {
  if (LEVELS[level] > THRESHOLD) return;
  const rec = { t: new Date().toISOString(), level, msg: String(msg) };
  if (meta && typeof meta === 'object') {
    for (const k of Object.keys(meta)) if (meta[k] !== undefined) rec[k] = meta[k];
  }
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  out(isProd ? JSON.stringify(rec) : `[${level}] ${rec.msg}` + (meta ? ' ' + safeJson(meta) : ''));
}

function safeJson(o) { try { return JSON.stringify(o); } catch (_) { return '[meta no serializable]'; } }

function make(ctx) {
  return {
    error: (m, meta) => emit('error', m, Object.assign({}, ctx, meta)),
    warn: (m, meta) => emit('warn', m, Object.assign({}, ctx, meta)),
    info: (m, meta) => emit('info', m, Object.assign({}, ctx, meta)),
    debug: (m, meta) => emit('debug', m, Object.assign({}, ctx, meta)),
    child: (more) => make(Object.assign({}, ctx, more)),
  };
}

module.exports = make({});
