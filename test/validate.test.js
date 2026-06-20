'use strict';
const test = require('node:test');
const assert = require('node:assert');
const validate = require('../middleware/validate');
const { clienteSchema } = require('../schemas/cliente');

function mockRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
  };
}

test('validate: acepta un payload de cliente válido del front (y mantiene extras)', () => {
  const req = { body: { nombre: 'ACME', rfc: 'XAXX010101000', telefono: '81-1234', constancia_clear: true, extra: 'ok' } };
  const res = mockRes();
  let called = false;
  validate(clienteSchema)(req, res, () => { called = true; });
  assert.strictEqual(called, true, 'debe llamar next()');
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(req.body.nombre, 'ACME');
  assert.strictEqual(req.body.extra, 'ok'); // passthrough
});

test('validate: acepta body vacío (todos los campos son opcionales)', () => {
  const req = { body: {} };
  const res = mockRes();
  let called = false;
  validate(clienteSchema)(req, res, () => { called = true; });
  assert.strictEqual(called, true);
});

test('validate: rechaza campo de tipo equivocado con 400 y detalles', () => {
  const req = { body: { nombre: { x: 1 } } };
  const res = mockRes();
  let called = false;
  validate(clienteSchema)(req, res, () => { called = true; });
  assert.strictEqual(called, false, 'no debe pasar al handler');
  assert.strictEqual(res.statusCode, 400);
  assert.ok(Array.isArray(res.body.detalles));
  assert.ok(res.body.detalles.some((d) => d.campo === 'nombre'));
});

test('validate: rechaza body que no es objeto', () => {
  const req = { body: 'soy-un-string' };
  const res = mockRes();
  let called = false;
  validate(clienteSchema)(req, res, () => { called = true; });
  assert.strictEqual(called, false);
  assert.strictEqual(res.statusCode, 400);
});
