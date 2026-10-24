import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('customer form keeps mobile editable text at least 16px in all focus states', () => {
  const css = fs.readFileSync(new URL('../src/design-system/foundation.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(max-width: 1023px\), \(pointer: coarse\)\s*\{\s*\.hd-shell--staff \.hd-customer-create-view \.hd-customer-create-view__form :is\(input, select, textarea\)\s*\{\s*font-size: max\(16px, var\(--hd-type-body\)\) !important;/);
  assert.match(css, /transition-property: color, background-color, border-color, box-shadow;/);
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:[",\s])/);
});
