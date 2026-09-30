import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const server = await createServer({ optimizeDeps: { noDiscovery: true, entries: [] }, server: { host: '127.0.0.1', port: 0 }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  page.on('console', message => console.log(`BROWSER ${message.type()}: ${message.text()}`));
  page.on('pageerror', error => console.log(`BROWSER ERROR: ${error.message}`));
  page.on('worker', worker => console.log(`WORKER ${worker.url()}`));
  const url = `http://127.0.0.1:${server.httpServer.address().port}`;
  await page.route('**/*', route => {
    if (route.request().resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="UTF-8"><title>Canvas encoding test</title>' });
    return new URL(route.request().url()).origin === url ? route.continue() : route.abort();
  });
  await page.goto(url);
  const result = await page.evaluate(async () => {
    const { createRecordedShareCanvas } = await import('/src/utils/shareCanvas.js');
    const draw = canvas => {
      const ctx = canvas.getContext('2d');
      ctx.font = '900 25px Arial';
      const width = ctx.measureText('Vietnamese invoice').width;
      canvas.height = 220;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#065f46'; ctx.font = '900 28px Arial'; ctx.textAlign = 'center';
      ctx.fillText('BẢNG ĐƠN ĐẶT HÀNG', 210, 48);
      ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.35; ctx.strokeRect(15, 65, 390, 110);
      ctx.textBaseline = 'middle'; ctx.font = '700 22px Arial';
      ctx.fillText('Khách hàng: 290.000 đ', 210, 105);
      ctx.beginPath(); ctx.moveTo(20, 150); ctx.lineTo(380, 150); ctx.quadraticCurveTo(400, 150, 400, 170); ctx.stroke();
      return width;
    };
    const legacy = document.createElement('canvas'); legacy.width = 420;
    const recorded = createRecordedShareCanvas(420);
    const measured = [draw(legacy), draw(recorded)];
    const blob = await Promise.race([
      recorded.convertToBlob({ type: 'image/png' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Encoding did not complete')), 10000)),
    ]);
    const decoded = await createImageBitmap(blob);
    const pixels = document.createElement('canvas'); pixels.width = decoded.width; pixels.height = decoded.height;
    const ctx = pixels.getContext('2d'); ctx.drawImage(decoded, 0, 0); decoded.close();
    const actual = ctx.getImageData(0, 0, 420, 220).data;
    const expected = legacy.getContext('2d').getImageData(0, 0, 420, 220).data;
    const mismatches = expected.reduce((count, byte, i) => count + (byte !== actual[i] ? 1 : 0), 0);
    const workerMode = recorded.encodingMode;
    const OriginalWorker = window.Worker;
    window.Worker = undefined;
    const fallback = createRecordedShareCanvas(420);
    window.Worker = OriginalWorker;
    const nativeFallback = fallback instanceof HTMLCanvasElement;
    draw(fallback);
    const fallbackBlob = await new Promise(resolve => fallback.toBlob(resolve));
    window.Worker = class { constructor() { throw new Error('Worker blocked'); } };
    const { createRecordedShareCanvas: blockedCreate } = await import('/src/utils/shareCanvas.js?workerBlockedTest=1');
    const blocked = blockedCreate(420);
    draw(blocked);
    const blockedBlob = await blocked.convertToBlob({ type: 'image/png' });
    window.Worker = OriginalWorker;
    const pages = Array.from({ length: 4 }, () => createRecordedShareCanvas(420));
    pages.forEach(draw);
    const pageBlobs = await Promise.all(pages.map(canvas => canvas.convertToBlob({ type: 'image/png' })));
    return { measured, mismatches, workerMode, nativeFallback, bytes: blob.size, fallbackBytes: fallbackBlob.size,
      blockedMode: blocked.encodingMode, blockedBytes: blockedBlob.size, pageBytes: pageBlobs.map(page => page.size), size: [pixels.width, pixels.height] };
  });
  assert.equal(result.workerMode, 'worker');
  assert.equal(result.mismatches, 0, 'Worker export must preserve every pixel, including fonts and paths');
  assert.equal(result.measured[0], result.measured[1]);
  assert.equal(result.nativeFallback, true);
  assert.ok(result.bytes > 0 && result.fallbackBytes > 0);
  assert.equal(result.blockedMode, 'html-fallback');
  assert.equal(result.blockedBytes, result.fallbackBytes);
  assert.deepEqual(result.pageBytes, Array(4).fill(result.bytes));
  assert.deepEqual(result.size, [420, 220]);
  console.log(JSON.stringify({ status: 'PASS', ...result }));
} finally {
  await browser.close();
  await server.close();
}
