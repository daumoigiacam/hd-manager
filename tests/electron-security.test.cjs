const assert = require('node:assert/strict');
const {
  normalizeExternalUrl,
  normalizeZaloExternalUrl,
  normalizeTrustedQrImageSource,
  normalizeQrPayload,
} = require('../electron/security.cjs');

assert.equal(normalizeExternalUrl('https://app.hdconnect.net/path'), 'https://app.hdconnect.net/path');
assert.equal(normalizeExternalUrl('tel:0978000000'), 'tel:0978000000');
assert.equal(normalizeExternalUrl('javascript:alert(1)'), '');
assert.equal(normalizeExternalUrl('file:///C:/Windows/System32/calc.exe'), '');
assert.equal(normalizeExternalUrl('https://user:secret@example.com'), '');
assert.equal(normalizeExternalUrl('https://example.com/\nfile:///tmp/a'), '');

assert.equal(normalizeZaloExternalUrl('https://zalo.me/g/example'), 'https://zalo.me/g/example');
assert.equal(normalizeZaloExternalUrl('zalo://g/example'), 'zalo://g/example');
assert.equal(normalizeZaloExternalUrl('https://example.com/g/example'), '');

assert.equal(normalizeTrustedQrImageSource('https://img.vietqr.io/image/demo.png'), 'https://img.vietqr.io/image/demo.png');
assert.equal(normalizeTrustedQrImageSource('http://127.0.0.1/private.png'), '');
assert.equal(normalizeTrustedQrImageSource('https://example.com/qr.png'), '');
assert.match(normalizeTrustedQrImageSource('data:image/png;base64,AAAA'), /^data:image\/png;base64,/);
assert.equal(normalizeQrPayload('0002010102123857'), '0002010102123857');
assert.equal(normalizeQrPayload('https://pay.payos.vn/web/demo'), 'https://pay.payos.vn/web/demo');
assert.equal(normalizeQrPayload('bad\nvalue'), '');

console.log('Electron security tests: PASS (16 cases)');
