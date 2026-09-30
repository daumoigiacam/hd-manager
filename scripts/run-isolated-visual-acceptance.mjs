import { build, createServer, preview } from 'vite';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve(process.env.HD_VISUAL_ACCEPTANCE_OUTPUT || 'test-results/zero-final-visuals-release');
const cases = [
  'product-editor.visual', 'product-units.visual', 'customer-create.visual',
  'customer-supplier-directory.visual', 'employee-create-fab.visual',
  'order-create-fab.visual', 'order-request-save.visual', 'app-header-back.visual',
  'global-search.keyboard.visual', 'finance-summary.visual', 'business-report.visual',
  'messaging-redesign.visual', 'delivery-redesign.visual',
  'warehouse-dispatch-grouping.visual', 'viewport-save.audit',
  'navigation-performance.audit', 'navigation-performance.visual',
  'invoice-settings.integration', 'invoice-templates.visual',
  'hd-manager-visual-qa', 'passkey-auth.integration',
];
Object.assign(process.env, {
  VITE_DATA_MODE: 'preview', VITE_ALLOW_PREVIEW_BUILD: 'true',
  VITE_HD_BUILD_ID: 'zero-final-isolated-visuals',
});
await mkdir(output, { recursive: true });
const selectedCases = process.argv.slice(2);
if (selectedCases.some(name => !cases.includes(name))) throw new Error('Unknown visual acceptance case');
const outDir = path.join(output, 'dist');
await build({ build: { outDir }, logLevel: 'warn' });
const server = await preview({ build: { outDir }, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'warn' });
let sourceServer;
const results = [];
try {
  const url = `http://127.0.0.1:${server.httpServer.address().port}/`;
  for (const name of selectedCases.length ? selectedCases : cases) {
    const file = `tests/visual/${name}.mjs`;
    const source = await readFile(file, 'utf8');
    const env = { ...process.env };
    let caseUrl = url;
    if (name === 'invoice-templates.visual') {
      sourceServer ||= await createServer({
        cacheDir: path.join(output, 'vite-cache'),
        optimizeDeps: {
          entries: ['tests/visual/invoice-harness.html', 'src/features/invoice-templates/InvoiceTemplateWorkspace.jsx'],
          include: ['html-to-image', 'jspdf'],
        },
        server: { host: '127.0.0.1', port: 0 }, logLevel: 'warn',
      });
      if (!sourceServer.httpServer.listening) await sourceServer.listen();
      caseUrl = `http://127.0.0.1:${sourceServer.httpServer.address().port}/`;
    }
    for (const [, key] of source.matchAll(/process\.env\.(HD_MANAGER_[A-Z_]+(?:URL|OUTPUT))/g)) {
      if (key.endsWith('CDP_URL')) { delete env[key]; continue; }
      env[key] = key.endsWith('URL') ? caseUrl : path.join(output, name);
    }
    if (name === 'invoice-templates.visual') env.HD_MANAGER_INVOICE_QA_URL = `${caseUrl}tests/visual/invoice-harness.html`;
    const started = Date.now();
    let log = '';
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [file], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.on('data', data => { log += data; });
      child.stderr.on('data', data => { log += data; });
      child.on('error', reject);
      child.on('close', resolve);
    });
    await writeFile(path.join(output, `${name}.log`), log);
    results.push({ name, exitCode, durationMs: Date.now() - started, bundle: caseUrl === url ? 'production preview' : 'source-only invoice harness' });
    console.log(`${exitCode === 0 ? 'PASS' : 'FAIL'} ${name}`);
    await writeFile(path.join(output, 'results.json'), JSON.stringify({
      runtime: 'Isolated preview data; browser regression only, not cloud Firebase or native keyboard',
      results,
    }, null, 2));
  }
} finally {
  await sourceServer?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
if (results.some(result => result.exitCode !== 0)) process.exitCode = 1;
