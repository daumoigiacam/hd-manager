import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createEmptyDispatchDraft } from '../src/features/warehouse/warehouseDispatchFormModel.js';

const component = await readFile(new URL('../src/features/warehouse/DispatchTableBody.jsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/features/warehouse/dispatch-table.css', import.meta.url), 'utf8');
const weightEditor = await readFile(new URL('../src/features/warehouse/WarehouseWeightEntriesModal.jsx', import.meta.url), 'utf8');
const weightStyles = await readFile(new URL('../src/features/warehouse/dispatch-weight-editor.css', import.meta.url), 'utf8');

test('dispatch draft resets are independent and preserve only the selected driver', () => {
  const first = createEmptyDispatchDraft('driver-a');
  first.weightEntries.push(10);
  first.weightKg = '10';
  const second = createEmptyDispatchDraft('driver-b');
  assert.deepEqual(second.weightEntries, []);
  assert.equal(second.weightKg, '');
  assert.equal(second.assignedDriverId, 'driver-b');
  assert.equal(second.amount, 0);
  assert.notEqual(first.weightEntries, second.weightEntries);
});

test('quantity fields use defined design tokens and accessible direct input', async () => {
  const jsx = await readFile(new URL('../src/features/warehouse/DispatchQuantityFields.jsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/features/warehouse/dispatch-quantity-fields.css', import.meta.url), 'utf8');
  const tokens = await readFile(new URL('../src/design-system/foundation.css', import.meta.url), 'utf8');
  for (const [, name] of css.matchAll(/var\((--[\w-]+)\)/g)) assert.ok(tokens.includes(`${name}:`), name);
  assert.match(jsx, /aria-label="Số lượng xuất kho"/);
  assert.match(jsx, /onQuantityChange\(event.target.value\)/);
  assert.match(css, /repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /:focus-visible/);
});

test('dispatch table uses semantic styles and shared design tokens', () => {
  assert.doesNotMatch(component, /\b(?:bg|text|border)-(?:slate|emerald|sky|amber)-\d+/);
  for (const token of [
    '--hd-color-border-strong', '--hd-color-info-surface', '--hd-color-ink', '--hd-color-ink-soft',
    '--hd-color-success-surface', '--hd-color-warning-surface', '--hd-space-', '--hd-radius-control',
    '--hd-motion-fast', '--hd-touch-target', '--hd-type-', '--hd-font-weight-',
  ]) assert.ok(styles.includes(token), `expected token usage for ${token}`);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /:disabled/);
});

test('weight editor uses shared tokens, visible focus and native accessible controls', () => {
  assert.doesNotMatch(weightEditor, /\b(?:bg|text|border)-(?:slate|emerald|sky|amber)-\d+|rounded-\[/);
  for (const token of ['--hd-color-overlay', '--hd-radius-dialog', '--hd-space-', '--hd-type-', '--hd-layer-input-dialog', '--hd-touch-target']) {
    assert.ok(weightStyles.includes(token), token);
  }
  assert.match(weightEditor, /role="dialog" aria-modal="true"/);
  assert.match(weightEditor, /aria-label=\{`Lần cân/);
  assert.match(weightStyles, /:focus-visible/);
  assert.match(weightStyles, /:disabled/);
});
