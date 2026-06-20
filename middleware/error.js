'use strict';
const logger = require('../logger');
// Error handler central de Express. Loguea el detalle interno (con reqId si existe)
// y devuelve al cliente un mensaje genérico en producción (no filtra stack/SQL).
module.exports = function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const detail = err && err.message ? String(err.message) : String(err || 'Error');
  logger.error('unhandled', {
    reqId: req && req.id,
    path: req && req.path,
    method: req && req.method,
    detail,
    stack: err && err.stack,
  });
  const clientMsg = process.env.NODE_ENV === 'production' ? 'Error interno del servidor.' : detail;
  if (req && req.path && String(req.path).startsWith('/api')) {
    return res.status(500).json({ error: clientMsg });
  }
  res.status(500).type('html').send(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Error</title></head><body><h1>Error del servidor</h1><pre>${clientMsg.replace(/</g, '&lt;')}</pre></body></html>`
  );
};
