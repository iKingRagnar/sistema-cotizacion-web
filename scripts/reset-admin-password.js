#!/usr/bin/env node
/**
 * Restablece la contraseña del usuario admin (y activa la cuenta).
 * Usa la misma BD que el servidor (Turso o SQLite vía .env).
 *
 * Uso (desde la raíz del proyecto):
 *   node scripts/reset-admin-password.js "TuNuevaClaveSegura"
 *
 * Con npm:
 *   npm run auth:reset-admin -- "TuNuevaClaveSegura"
 */
'use strict';

require('dotenv').config();
const path = require('path');

const db = require(path.join(__dirname, '..', 'db'));
const auth = require(path.join(__dirname, '..', 'auth'));

async function main() {
  const pwd = (process.argv[2] || '').trim();
  if (pwd.length < 8) {
    console.error('Uso: node scripts/reset-admin-password.js "ContraseñaDeAlMenos8Caracteres"');
    process.exit(1);
  }

  await db.init();
  const hash = auth.hashPassword(pwd);
  const n = await db.runMutationCount(
    'UPDATE app_users SET password_hash = ?, activo = 1 WHERE lower(username) = lower(?)',
    [hash, 'admin']
  );

  if (n === 0) {
    await db.runQuery(
      'INSERT INTO app_users (username, password_hash, role, display_name, activo) VALUES (?,?,?,?,1)',
      ['admin', hash, 'admin', 'Usuario principal']
    );
    console.log('[ok] Usuario admin creado. Inicia sesión con: admin / (la clave que indicaste)');
  } else {
    console.log('[ok] Contraseña de admin actualizada (' + n + ' fila(s)).');
  }
}

main().catch(function (err) {
  console.error('[error]', err && err.message ? err.message : err);
  process.exit(1);
});
