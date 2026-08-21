import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildOrderRequestShareFiles,
  hasCompleteOrderRequestShareBlobSet
} from '../src/utils/orderRequestShare.js';

const blobs = [1, 2, 3, 4].map((page) => new Blob([`page-${page}`], { type: 'image/png' }));

assert.equal(hasCompleteOrderRequestShareBlobSet(blobs, 4), true);
assert.equal(hasCompleteOrderRequestShareBlobSet(blobs.slice(0, 1), 4), false);
assert.equal(
  hasCompleteOrderRequestShareBlobSet([...blobs.slice(0, 3), new Blob([], { type: 'image/png' })], 4),
  false,
  'an empty page must never be treated as a complete share set'
);

const files = buildOrderRequestShareFiles(blobs, 'bang-don-dat-hang', File);
assert.equal(files.length, 4, 'all four rendered pages must become share files');
assert.deepEqual(
  files.map((file) => file.name),
  [
    'bang-don-dat-hang-trang-1.png',
    'bang-don-dat-hang-trang-2.png',
    'bang-don-dat-hang-trang-3.png',
    'bang-don-dat-hang-trang-4.png'
  ]
);
assert.deepEqual(files.map((file) => file.type), ['image/png', 'image/png', 'image/png', 'image/png']);
assert.deepEqual(
  await Promise.all(files.map(async (file) => new TextDecoder().decode(await file.arrayBuffer()))),
  ['page-1', 'page-2', 'page-3', 'page-4']
);

const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
assert.match(appSource, /hasCompleteOrderRequestShareBlobSet\(persistedBlobs, expectedBlobCount\)/);
assert.match(appSource, /buildOrderRequestShareFiles\(blobs, baseFilename\)/);
assert.match(appSource, /Retry the same complete file set without optional text/);
assert.match(appSource, /for \(let index = 0; index < blobs\.length; index \+= 1\)/);

console.log('Order request multi-image share tests: PASS (4/4 files preserved).');
