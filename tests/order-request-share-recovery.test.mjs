import assert from 'node:assert/strict';
import { appFunction } from './helpers/app-source-function.mjs';
import { buildOrderRequestShareFiles, prepareOrderRequestNativeFiles } from '../src/utils/orderRequestShare.js';

const blobs = [1, 2, 3].map(value => new Blob([`${value}`], { type: 'image/png' }));
let sends = 0;
const native = appFunction('shareOrderRequestSheetBlobs', {
  buildOrderRequestSheetFilename: () => 'orders',
  Capacitor: { getPlatform: () => 'android' },
  prepareOrderRequestNativeFiles,
  writeBlobToShareCache: async path => ({ uri: `file:///${path}` }),
  CapacitorShare: {
    canShare: async () => ({ value: true }),
    share: async ({ files }) => { sends++; assert.equal(files.length, 3); throw new Error('recipient failed'); },
  },
  isShareCancelled: () => false,
}, { scope: 'OrderRequestView' });
await assert.rejects(native(blobs), /recipient failed/);
assert.equal(sends, 1);
let webSends = 0;
const web = appFunction('shareOrderRequestSheetBlobs', {
  buildOrderRequestSheetFilename: () => 'orders',
  Capacitor: { getPlatform: () => 'web' },
  buildOrderRequestShareFiles,
  navigator: {
    canShare: () => true,
    share: async ({ files, text }) => {
      webSends++;
      assert.equal(files.length, 3);
      assert.equal(text, undefined);
      throw new Error('recipient failed');
    },
  },
  isShareCancelled: () => false,
}, { scope: 'OrderRequestView' });
await assert.rejects(web(blobs), /recipient failed/);
assert.equal(webSends, 1, 'a partial recipient failure must not automatically resend or download');
console.log('Native/web batch failure recovery: PASS');
