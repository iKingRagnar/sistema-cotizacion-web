'use strict';
// Tests de las funciones de seguridad de auth.js (firma de tokens, hashing, roles).
// Sin dependencias externas: usa el runner integrado `node --test`.
// AUTH_SECRET debe fijarse ANTES de requerir auth.js (se lee al cargar el módulo).
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-para-suite-de-pruebas-1234567890';

const test = require('node:test');
const assert = require('node:assert');
const auth = require('../auth');

test('hashPassword/verifyPassword: la clave correcta verifica y la incorrecta no', () => {
  const hash = auth.hashPassword('Secreta123!');
  assert.match(hash, /:/, 'el hash debe tener formato salt:hash');
  assert.strictEqual(auth.verifyPassword('Secreta123!', hash), true);
  assert.strictEqual(auth.verifyPassword('otra', hash), false);
  assert.strictEqual(auth.verifyPassword('', hash), false);
});

test('hashPassword: dos hashes de la misma clave difieren (salt aleatorio)', () => {
  assert.notStrictEqual(auth.hashPassword('misma'), auth.hashPassword('misma'));
});

test('signToken/verifyToken: round-trip devuelve el payload', () => {
  const payload = { sub: 42, u: 'admin', r: 'admin', exp: Date.now() + 60000 };
  const token = auth.signToken(payload);
  const out = auth.verifyToken(token);
  assert.ok(out, 'debe verificar');
  assert.strictEqual(out.sub, 42);
  assert.strictEqual(out.u, 'admin');
});

test('verifyToken: rechaza token manipulado', () => {
  const token = auth.signToken({ sub: 1, r: 'usuario', exp: Date.now() + 60000 });
  const [body] = token.split('.');
  const tampered = body + '.firmafalsa';
  assert.strictEqual(auth.verifyToken(tampered), null);
});

test('verifyToken: rechaza token expirado', () => {
  const token = auth.signToken({ sub: 1, r: 'admin', exp: Date.now() - 1000 });
  assert.strictEqual(auth.verifyToken(token), null);
});

test('verifyToken: rechaza basura / vacío / sin exp', () => {
  assert.strictEqual(auth.verifyToken(''), null);
  assert.strictEqual(auth.verifyToken('no-es-un-token'), null);
  assert.strictEqual(auth.verifyToken(null), null);
  const sinExp = auth.signToken({ sub: 1, r: 'admin' });
  assert.strictEqual(auth.verifyToken(sinExp), null);
});

test('normalizeRole: minúsculas y sin espacios', () => {
  assert.strictEqual(auth.normalizeRole('Admin'), 'admin');
  assert.strictEqual(auth.normalizeRole('  OPERADOR '), 'operador');
});

test('computeCanCotizar: admin y operador siempre; usuario solo si es vendedor vinculado', () => {
  assert.strictEqual(auth.computeCanCotizar('admin', null, false), true);
  assert.strictEqual(auth.computeCanCotizar('operador', null, false), true);
  assert.strictEqual(auth.computeCanCotizar('usuario', null, false), false);
  assert.strictEqual(auth.computeCanCotizar('usuario', 5, false), false);
  assert.strictEqual(auth.computeCanCotizar('usuario', 5, true), true);
  assert.strictEqual(auth.computeCanCotizar('consulta', 5, true), false);
});
