import assert from 'node:assert/strict';
import test from 'node:test';
import configure from '../vite.config.js';

test('generated Gradle and audit outputs cannot trigger development hot reload', () => {
  const configuration = configure({ mode: 'development' });
  for (const pattern of ['**/.gradle-home/**', '**/.gradle/**', '**/test-results/**']) {
    assert.ok(configuration.server.watch.ignored.includes(pattern), pattern);
  }
  assert.ok(configuration.server.watch.ignored.includes('**/android/**'));
  assert.equal(configuration.server.watch.ignored.some(pattern => pattern.includes('/src/')), false);
});
