import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const names = ['VIETNAM_TIME_ZONE', 'VIETNAM_DATE_FORMAT_OPTIONS', 'VIETNAM_TIME_FORMAT_OPTIONS', 'vietnamDateFormatter', 'vietnamTimeFormatter', 'vietnamNumericCollator'];
const declarations = names.map(name => source.match(new RegExp(`const ${name} = [^;]+;`))[0]).join('\n');
const formatters = vm.runInNewContext(`${declarations}\n({vietnamDateFormatter, vietnamTimeFormatter, vietnamNumericCollator, VIETNAM_DATE_FORMAT_OPTIONS, VIETNAM_TIME_FORMAT_OPTIONS})`);

test('cached date/time output is identical across midnight, leap days and years', () => {
  for (const value of ['2024-02-29T17:00:00Z', '2026-10-02T16:59:59Z', '2026-12-31T17:01:00Z', '1970-01-01T00:00:00Z']) {
    const date = new Date(value);
    assert.equal(formatters.vietnamDateFormatter.format(date), date.toLocaleDateString('vi-VN', formatters.VIETNAM_DATE_FORMAT_OPTIONS));
    assert.equal(formatters.vietnamTimeFormatter.format(date), date.toLocaleTimeString('vi-VN', formatters.VIETNAM_TIME_FORMAT_OPTIONS));
  }
});

test('cached collation preserves Vietnamese, numeric and equal-key ordering', () => {
  const values = ['Gà 10', 'Gà 2', 'ga 2', 'Đức', 'Dung', '', 'Khách 12', 'Khách 3'];
  assert.deepEqual([...values].sort(formatters.vietnamNumericCollator.compare), [...values].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true, sensitivity: 'base' })));
});
