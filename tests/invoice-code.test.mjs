import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const readFormatter = path => {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const declaration = source.match(/const formatOrderCode = ([^\n]+);/);
  assert.ok(declaration, path);
  return Function(`return (${declaration[1]});`)();
};

test('frontend and backend invoice codes are bank-safe and retain legacy normalized references', () => {
  const frontend = readFormatter('../src/App.jsx');
  const backend = readFormatter('../functions/index.js');
  for (const id of ['o_hbjc', 'order_abc123', 'order_ab-c_1', 'order_a.b/c', 'order_123456']) {
    const code = frontend(id);
    assert.match(code, /^HD[A-Z0-9]*$/);
    assert.equal(code, backend(id));
    const legacy = `HD${id.slice(-6).toUpperCase()}`;
    assert.equal(code, legacy.replace(/[^A-Z0-9]/g, ''));
  }
  assert.equal(frontend('o_hbjc'), 'HDOHBJC');
  assert.equal(frontend('order_abc123'), 'HDABC123');
});
