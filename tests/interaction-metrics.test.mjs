import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeInteractionSamples } from '../scripts/interaction-metrics.mjs';

test('timing summary excludes preparation renders, nested profilers and unrelated SDK spans', () => {
  const render = (component, startTimeMs, commitTimeMs, actualDurationMs) => ({ type: 'render.react', detail: { component, startTimeMs, commitTimeMs, actualDurationMs } });
  const sample = { viewport: 'test', module: 'products', action: 'save', totalMs: 50, startTimeMs: 100, endTimeMs: 150, interactionId: 1, subscriptions: [], events: [
    render('HDManagerRoot', 60, 90, 30), render('HDManagerRoot', 110, 140, 20),
    render('Module:products', 115, 140, 10), render('HDManagerRoot', 145, 160, 12),
    { type: 'firestore.operation', interactionId: 0, detail: { startTimeMs: 105 } },
    { type: 'firestore.operation', interactionId: 1, detail: { startTimeMs: 112 } },
  ] };
  const [summary] = summarizeInteractionSamples([sample]);
  assert.equal(summary.average, 50);
  assert.equal(summary.render.average, 20);
  assert.equal(summary.maxSdkOperations, 1);
});

test('percentiles use nearest rank and retain the sample count', () => {
  const samples = Array.from({ length: 100 }, (_, index) => ({
    viewport: 'test', module: 'home', action: 'open', totalMs: index + 1,
    startTimeMs: 0, endTimeMs: 101, events: [], subscriptions: [],
  }));
  const [summary] = summarizeInteractionSamples(samples.reverse());
  assert.equal(summary.n, 100);
  for (const rank of [50, 90, 95, 99]) assert.equal(summary[`p${rank}`], rank);
  assert.equal(summary.max, 100);
  assert.deepEqual(summarizeInteractionSamples([]), []);
});
