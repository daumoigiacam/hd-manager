import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parse } from '@babel/parser';

const source = readFileSync(new URL('../src/services/renderOptimization.js', import.meta.url), 'utf8');
const ast = parse(source, { sourceType: 'module' });
const declaration = ast.program.body.find(node => node.type === 'ExportNamedDeclaration'
  && node.declaration?.declarations?.some(row => row.id.name === 'useDebouncedValue'));
const expression = declaration.declaration.declarations[0].init;

function harness(initial = '', delay = 160, leading = false) {
  let state = initial;
  let value = initial;
  let options = leading;
  const reference = { current: false };
  let previousDependencies;
  let cleanup;
  let nextEffect;
  let now = 0;
  let sequence = 0;
  let emissions = 0;
  const timers = new Map();
  const timerScope = {
    setTimeout: (callback, wait) => { const id = ++sequence; timers.set(id, { callback, at: now + wait }); return id; },
    clearTimeout: id => timers.delete(id),
  };
  const hook = new Function('useState', 'useEffect', 'useRef', 'getTimerScope', 'DEFAULT_DEBOUNCE_MS',
    `return (${source.slice(expression.start, expression.end)});`)(
    () => [state, next => { if (!Object.is(next, state)) { state = next; emissions++; } }],
    (callback, dependencies) => {
      if (!previousDependencies || dependencies.some((entry, i) => !Object.is(entry, previousDependencies[i]))) {
        previousDependencies = dependencies;
        nextEffect = callback;
      }
    },
    () => reference, () => timerScope, 160
  );
  const render = (next = value, nextLeading = options) => {
    value = next;
    options = nextLeading;
    const output = hook(value, delay, { leading: options });
    if (nextEffect) {
      cleanup?.();
      const callback = nextEffect;
      nextEffect = null;
      cleanup = callback();
      return hook(value, delay, { leading: options });
    }
    return output;
  };
  render();
  return { render, emissions: () => emissions, timerCount: () => timers.size,
    advance(ms) {
      const target = now + ms;
      while (true) {
        const next = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
      }
      now = target;
      return render();
    },
    unmount: () => cleanup?.(),
  };
}

test('default trailing debounce retains its wait and publishes only the latest rapid input', () => {
  const hook = harness();
  assert.equal(hook.render('g'), '');
  assert.equal(hook.advance(80), '');
  assert.equal(hook.render('ga'), '');
  assert.equal(hook.advance(159), '');
  assert.equal(hook.advance(1), 'ga');
  assert.equal(hook.emissions(), 1);
});

test('leading search emits a single input immediately, coalesces a burst, then emits after idle immediately again', () => {
  const hook = harness('', 160, true);
  assert.equal(hook.render('g'), 'g');
  assert.equal(hook.advance(40), 'g');
  assert.equal(hook.render('ga'), 'g');
  assert.equal(hook.advance(40), 'g');
  assert.equal(hook.render('ga vit'), 'g');
  assert.equal(hook.advance(159), 'g');
  assert.equal(hook.advance(1), 'ga vit');
  assert.equal(hook.render('another'), 'another');
  assert.equal(hook.advance(160), 'another');
  assert.equal(hook.emissions(), 3, 'Trailing single-input receipt must be a state no-op');
});

test('mount does not open a typing burst and unmount cancels any late result', () => {
  const hook = harness('initial', 120, true);
  assert.equal(hook.render('changed'), 'changed');
  assert.equal(hook.render('pending'), 'changed');
  hook.unmount();
  assert.equal(hook.timerCount(), 0);
  assert.equal(hook.advance(1000), 'changed');
});

test('switching back to trailing behavior cancels the pending leading burst', () => {
  const hook = harness('', 120, true);
  assert.equal(hook.render('first'), 'first');
  assert.equal(hook.render('second', false), 'first');
  assert.equal(hook.advance(119), 'first');
  assert.equal(hook.advance(1), 'second');
  assert.equal(hook.render('third', true), 'third');
});

test('zero delay stays cancellable and publishes the final input without waiting a positive interval', () => {
  const hook = harness('', 0, true);
  assert.equal(hook.render('first'), 'first');
  assert.equal(hook.render('last'), 'first');
  assert.equal(hook.advance(0), 'last');
});

test('only the three prepared product/dispatch searches opt into leading debounce', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const calls = [...app.matchAll(/useDebouncedValue\(([^\n]+)\)/g)].map(match => match[1]);
  assert.deepEqual(calls.filter(call => call.includes('leading: true')), [
    'dispatchCustomerSearchKeyword, 120, { leading: true }',
    'dispatchProductSearchKeyword, 120, { leading: true }',
    'productSearch, 160, { leading: true }',
  ]);
  assert.ok(calls.includes('customerSearch, 160'));
  assert.ok(calls.includes('searchKeyword, 160'));
});
