/**
 * Seed inicial: crea usuario admin si no existe.
 * Uso: node seed.js
 */
const bcrypt = require('bcryptjs');
const db = require('./db');

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(ADMIN_USER);

if (existing) {
  console.log(`✓ Usuario "${ADMIN_USER}" ya existe (id=${existing.id}). Skip.`);
  process.exit(0);
}

const hash = bcrypt.hashSync(ADMIN_PASS, 10);
const result = db.prepare(`
  INSERT INTO users (username, password_hash, nombre, role, activo)
  VALUES (?, ?, ?, 'admin', 1)
`).run(ADMIN_USER, hash, 'Administrador');

console.log('✅ Admin creado:');
console.log(`   id: ${result.lastInsertRowid}`);
console.log(`   usuario: ${ADMIN_USER}`);
console.log(`   contraseña: ${ADMIN_PASS}`);
console.log('   ⚠️  Cambia la contraseña en producción.');
