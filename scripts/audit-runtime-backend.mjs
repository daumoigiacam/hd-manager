import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parse } from '@babel/parser';
import { resolveConfig } from 'vite';
import { collectIndexAssets } from './master-production-release-smoke.mjs';

const root = process.cwd();
const output = path.join(root, 'test-results/runtime-backend-audit-20261012');
const hash = data => createHash('sha256').update(data).digest('hex');
const relative = file => path.relative(root, file).replaceAll('\\', '/');
const read = file => fs.readFile(path.resolve(root, file), 'utf8');
const astOf = source => parse(source, { sourceType: 'unambiguous', plugins: ['jsx', 'importAttributes'] });
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'extra', 'comments', 'tokens'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(item => walk(item, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}
const callName = node => node?.type === 'Identifier' ? node.name
  : ['MemberExpression', 'OptionalMemberExpression'].includes(node?.type)
    ? `${callName(node.object)}.${node.property.name || node.property.value || ''}` : '';
const literal = node => node?.type === 'StringLiteral' ? node.value : null;
const source = await read('src/App.jsx');
const ast = astOf(source);
const collections = {};
const declarations = [];
const routes = [];
const views = [];
walk(ast, node => {
  if (node.type === 'VariableDeclarator' && node.id.name === 'FOREGROUND_REALTIME_COLLECTIONS_BY_TAB') {
    for (const property of node.init.arguments[0].properties) {
      collections[property.key.name || property.key.value] = property.value.elements.map(literal);
    }
  }
  const declaration = node.type === 'FunctionDeclaration' ? node
    : node.type === 'VariableDeclarator' && /FunctionExpression$/.test(node.init?.type || '') ? node.init : null;
  if (declaration) {
    const name = node.id?.name || '';
    if (/View$/.test(name) || name === 'MoreMenu') views.push({ name, line: node.loc.start.line });
    if (/^(handle|saveDataDocument|saveAtomicDocuments|writeFirestoreDocumentViaRest|flushPendingFirebaseWriteNow|requireSharedWriteConfirmation|requestPayos|requestCustomer)/.test(name)) {
      const calls = [];
      walk(declaration.body, item => {
        if (!['CallExpression', 'OptionalCallExpression'].includes(item.type)) return;
        const callee = callName(item.callee);
        if (/^(saveDataDocument|saveAtomicDocuments|setDoc|updateDoc|deleteDoc|addDoc|runTransaction|firebaseRunTransaction|fetch|identity\w+|customer\w+|requestPayos\w+|createWarehouseDispatch|updateWarehouseDispatch|archiveWarehouseDispatch|requireSharedWriteConfirmation|commitIdempotentWarehouseDispatchCreate|commitAtomicWrites|enqueuePendingFirebaseWrite)$/.test(callee)) {
          calls.push({ callee, line: item.loc.start.line, strings: item.arguments.map(literal).filter(Boolean) });
        }
      });
      if (calls.length) declarations.push({ name, line: node.loc.start.line, calls });
    }
  }
  if (node.type === 'SwitchStatement' && node.discriminant?.name === 'activeTab' && node.loc.start.line > 24000) {
    for (const entry of node.cases) {
      if (!literal(entry.test)) continue;
      const screens = new Set();
      const callbacks = new Set();
      for (const statement of entry.consequent) walk(statement, child => {
        if (child.type === 'JSXOpeningElement' && /View$|MoreMenu/.test(child.name?.name || '')) screens.add(child.name.name);
        if (child.type === 'JSXAttribute' && /^on[A-Z]/.test(child.name?.name || '')) callbacks.add(child.name.name);
      });
      routes.push({ route: literal(entry.test), line: entry.loc.start.line, screens: [...screens], callbacks: [...callbacks] });
    }
  }
});

const config = await resolveConfig({ mode: 'production', logLevel: 'silent' }, 'build');
const aliases = config.resolve.alias.filter(item => typeof item.find === 'string');
const seen = new Set();
const edges = [];
const packages = new Set();
const queue = [path.join(root, 'src/main.jsx')];
const unresolved = [];
while (queue.length) {
  const file = queue.shift();
  if (seen.has(file)) continue;
  seen.add(file);
  const body = await fs.readFile(file, 'utf8');
  if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
  const imports = new Set();
  walk(astOf(body), node => {
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && node.source) imports.add(node.source.value);
    if (node.type === 'CallExpression' && node.callee.type === 'Import' && literal(node.arguments[0])) imports.add(node.arguments[0].value);
  });
  for (const specifier of imports) {
    const alias = aliases.find(item => item.find === specifier);
    if (!alias && !specifier.startsWith('.')) { packages.add(specifier); continue; }
    const candidate = alias ? alias.replacement : path.resolve(path.dirname(file), specifier);
    const options = [candidate, ...['.js', '.jsx', '/index.js', '/index.jsx'].map(suffix => `${candidate}${suffix}`)];
    let target;
    for (const option of options) { if ((await fs.stat(option).catch(() => null))?.isFile()) { target = option; break; } }
    if (!target) { unresolved.push({ file: relative(file), specifier }); continue; }
    edges.push({ from: relative(file), import: specifier, to: relative(target) });
    queue.push(target);
  }
}

const inspect = text => ({
  firebase: ['hd-manager-c5839', 'hd-manager-production', 'cloudfunctions.net', 'firestore.googleapis.com', 'identitytoolkit.googleapis.com'].filter(marker => text.includes(marker)),
  platform: ['/api/v1', '/platform-admin', 'hd-connect-platform', 'vps-production', 'staging-api.hdconnect.net'].filter(marker => text.includes(marker)),
  identityFunctions: ['identityLogin', 'identityBiometricLogin', 'identityAttendance', 'attendanceAutoWifiCheckIn', 'customerPortalBootstrap', 'geminiGenerateContent'].filter(marker => text.includes(marker)),
});
const responseLog = [];
async function get(url) {
  const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' }, redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${new URL(url).pathname}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  responseLog.push({ url, status: response.status, bytes: bytes.length, sha256: hash(bytes), contentType: response.headers.get('content-type') });
  return bytes.toString('utf8');
}
const productionOrigin = 'https://app.hdconnect.net';
const manifest = JSON.parse(await get(`${productionOrigin}/version.json`));
const index = await get(`${productionOrigin}/`);
const { assets } = await collectIndexAssets(index);
const pending = assets.filter(asset => asset.kind === 'js').map(asset => new URL(asset.path, productionOrigin).href);
const fetched = new Map();
while (pending.length) {
  const url = pending.shift();
  if (fetched.has(url)) continue;
  if (fetched.size >= 80) throw new Error('Unexpected bundle size');
  const text = await get(url);
  fetched.set(url, text);
  // Follow static imports, lazy imports and Vite's literal preload chunk table.
  walk(astOf(text), node => {
    if (node.type !== 'StringLiteral' || !/^(?:\.\/|\/?assets\/)[A-Za-z0-9_./-]+\.js$/.test(node.value)) return;
    const child = new URL(node.value, node.value.startsWith('assets/') ? `${productionOrigin}/` : url);
    if (child.origin === productionOrigin && child.pathname.startsWith('/assets/')) pending.push(child.href);
  });
}
const bundle = [...fetched.values()].join('\n');
const urls = new Set();
for (const text of fetched.values()) walk(astOf(text), node => {
  if (node.type !== 'StringLiteral' || !/^https?:\/\//.test(node.value)) return;
  try { urls.add(new URL(node.value).origin); } catch { /* Templated strings are not complete URLs. */ }
});
const local = { available: false };
try {
  const html = await get('http://127.0.0.1:5213/');
  local.available = true;
  local.viteDevelopment = html.includes('/@vite/client');
  if (local.viteDevelopment) {
    const app = await get('http://127.0.0.1:5213/src/App.jsx');
    local.markers = inspect(app);
    local.platformRuntimeImport = app.includes('/src/config/firebase-only-runtime.js');
    local.stagingRuntimeImport = app.includes('/src/api/hdConnectStaging.js');
    local.note = 'Development module contains inactive source branches; aliases determine the runtime.';
  } else {
    local.version = JSON.parse(await get('http://127.0.0.1:5213/version.json'));
    const localAssets = await collectIndexAssets(html);
    const main = localAssets.assets.find(asset => /\/index-[^/]+\.js$/.test(asset.path));
    if (main) local.markers = inspect(await get(`http://127.0.0.1:5213${main.path}`));
  }
} catch (error) { local.error = error.message; }

const evidence = {
  inspectedAt: new Date().toISOString(),
  repository: { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), workingTree: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim() },
  build: {
    mode: config.mode,
    safeEnvironment: Object.fromEntries(['VITE_DATA_MODE', 'VITE_FIREBASE_PROJECT_ID', 'VITE_HD_APP_ID', 'VITE_API_BASE_URL', 'VITE_INVENTORY_VPS_ENABLED', 'VITE_IDENTITY_API_BASE_URL', 'VITE_PAYOS_API_BASE_URL', 'VITE_SEPAY_API_BASE_URL'].map(key => [key, config.env[key] || null])),
    runtimeAliases: aliases.filter(item => item.find.startsWith('@hd/')).map(item => ({ name: item.find, target: relative(item.replacement) })),
  },
  graph: { entry: 'src/main.jsx', files: [...seen].map(relative).sort(), packages: [...packages].sort(), edges, unresolved,
    platformFilesReachable: [...seen].map(relative).filter(file => /^src\/(api\/|platform\/|features\/platform-admin\/|mocks\/)/.test(file)) },
  source: { collections, routes: [...new Map(routes.map(route => [route.route, route])).values()], views, declarations,
    hashes: Object.fromEntries(await Promise.all(['src/App.jsx', 'vite.config.js', '.github/workflows/deploy.yml', 'firebase.json', 'src/config/firebase-only-runtime.js', 'src/services/identityCenter.js', 'functions/index.js'].map(async file => [file, hash(await read(file))]))) },
  production: { origin: productionOrigin, manifest, markers: inspect(bundle), javascriptChunksInspected: fetched.size, literalOrigins: [...urls].sort() },
  localhost: local,
  httpEvidence: responseLog,
  limitations: ['Static call paths include inactive branches, which must be interpreted with build aliases.', 'This does not certify all authenticated business flows or deployed Cloud Functions source parity.', 'An APK on disk is not proof of the version installed on a disconnected phone.'],
};
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ commit: evidence.repository.commit, build: evidence.build, reachableFiles: seen.size,
  platformFilesReachable: evidence.graph.platformFilesReachable, unresolved, production: evidence.production,
  localhost: local, routes: routes.map(({route, line, screens}) => ({route, line, screens})),
  handlers: declarations.length, output: relative(path.join(output, 'evidence.json')) }, null, 2));
