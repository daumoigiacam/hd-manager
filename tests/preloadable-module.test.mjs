import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createPreloadableModule } from '../src/utils/preloadableModule.js';

test('preloaded lazy modules render their real content without a fallback or extra import', async () => {
  let calls = 0;
  const module = createPreloadableModule(async () => {
    calls++;
    return { default: () => React.createElement('p', null, 'Ready') };
  });
  const View = React.lazy(module.load);
  assert.equal(calls, 0, 'Import must not run at startup');
  assert.equal(module.preload(), module.preload(), 'Concurrent preloads share one promise');
  await module.preload();
  const html = renderToString(React.createElement(React.Suspense, { fallback: 'Waiting' }, React.createElement(View)));
  assert.ok(html.includes('<p>Ready</p>'));
  assert.ok(!html.includes('Waiting'));
  assert.equal(calls, 1);
  assert.ok(renderToString(React.createElement(View)).includes('Ready'));
});

test('an unprepared module loads once and propagates import failures', async () => {
  let calls = 0;
  const module = createPreloadableModule(() => {
    calls++;
    throw new Error('chunk-unavailable');
  });
  const failures = [];
  const thenable = module.load();
  await thenable.then(() => assert.fail('Failed imports must not resolve'), error => failures.push(error.message));
  await assert.rejects(module.preload(), /chunk-unavailable/);
  assert.deepEqual(failures, ['chunk-unavailable']);
  assert.equal(calls, 1);
});
