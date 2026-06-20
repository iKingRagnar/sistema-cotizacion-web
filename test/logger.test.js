'use strict';
const test = require('node:test');
const assert = require('node:assert');
const logger = require('../logger');

test('logger: expone niveles y child(), y no lanza', () => {
  for (const m of ['error', 'warn', 'info', 'debug']) {
    assert.strictEqual(typeof logger[m], 'function', `falta ${m}`);
  }
  assert.strictEqual(typeof logger.child, 'function');
  const child = logger.child({ reqId: 'abc' });
  assert.strictEqual(typeof child.info, 'function');
  // No deben lanzar excepción al emitir.
  assert.doesNotThrow(() => { logger.info('hola', { a: 1 }); });
  assert.doesNotThrow(() => { child.error('boom', { code: 'X' }); });
  assert.doesNotThrow(() => { logger.info('sin meta'); });
});
