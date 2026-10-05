import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDispatchPreviewRows } from '../src/features/warehouse/dispatchPreviewRows.js';
import { renderDispatchSheetCanvas } from '../src/features/warehouse/renderDispatchSheetCanvas.js';

test('export padding preserves row identity and values without modifying the source', () => {
  const row = Object.freeze({id: 'd', pieceCount: 5, weightKg: 10});
  const rows = Object.freeze([row]);
  const result = buildDispatchPreviewRows(rows);
  assert.equal(result.length, 6);
  assert.equal(result[0], row);
  assert.equal(rows.length, 1);
  assert.equal(result[5].weightKg, '');
  assert.equal(buildDispatchPreviewRows(Array(12).fill(row)).length, 12);
  assert.equal(buildDispatchPreviewRows(null).length, 6);
});

test('typed canvas renderer preserves labels, dimensions and empty-row formatting', async () => {
  const text = [];
  const context = {fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText(value){text.push(value);}};
  const canvas = {width: 0,height: 0,getContext: () => context};
  const previous = globalThis.document;
  globalThis.document = {createElement: () => canvas};
  try {
    const ports = {companyName:'QA',formatDateLabel: d => d,formatNumber:String,compactProductName: n => n};
    assert.equal(await renderDispatchSheetCanvas([{customerName:'A',productName:'Vịt',pieceCount:'5',weightKg:10}], '2026-10-06',ports),canvas);
    assert.equal(canvas.width,1080);
    assert.equal(canvas.height,544);
    assert(text.includes('QA • 2026-10-06'));
    assert(text.includes('5 Con'));
    assert(text.includes('10'));
    assert(text.includes('Vịt'));
    await assert.rejects(renderDispatchSheetCanvas([], '2026-10-06',ports), /Chưa có dữ liệu/);
    canvas.getContext = () => null;
    await assert.rejects(renderDispatchSheetCanvas([{}], '2026-10-06',ports), /Khong the/);
  } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
});

test('unused preview calculation and unreachable history/recorder helpers are absent from parent', () => {
  const source = readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  for (const name of ['mergedDispatchRows','previewDispatchRows','openHistoryDispatchGroup','getSupportedVoiceRecorderMimeType']) {
    assert.doesNotMatch(source,new RegExp(`const ${name}\\b`));
  }
  assert.match(source,/renderTypedDispatchSheetCanvas\(sourceRows, targetDate/);
});
