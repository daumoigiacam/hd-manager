import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse } from '@babel/parser';

const output = path.resolve('test-results/master-audit');
await mkdir(output, { recursive: true });
async function filesIn(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'lib', 'dist', '.git'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(file));
    else if (/\.(m?js|jsx|cjs)$/.test(file)) files.push(file);
  }
  return files;
}
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'extra', 'comments', 'tokens'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value?.type) walk(value, visit);
  }
}
const calls = [], endpoints = [], exports = [], components = [], parseErrors = [];
const scannedFiles = await filesIn('src');
scannedFiles.push(...await filesIn('functions'));
for (const file of scannedFiles) {
  const source = await readFile(file, 'utf8');
  let tree;
  try { tree = parse(source, { sourceType: 'unambiguous', plugins: ['jsx'] }); }
  catch (error) { parseErrors.push({ file, message: error.message }); continue; }
  walk(tree, node => {
    const location = { file: file.replaceAll('\\', '/'), line: node.loc?.start.line };
    if (node.type === 'StringLiteral' && /^\/api\//.test(node.value)) endpoints.push({ ...location, route: node.value });
    if (node.type === 'AssignmentExpression' && node.left?.object?.name === 'exports') exports.push({ ...location, name: node.left.property.name });
    if (node.type === 'FunctionDeclaration' && /(?:View|Workspace|Center|Dashboard)$/.test(node.id?.name || '')) components.push({ ...location, name: node.id.name });
    if (node.type !== 'CallExpression') return;
    const name = node.callee.name || node.callee.property?.name || '';
    if (!/^(fetch|fetchWithTimeout|requestIdentityApi|httpsCallable|onSnapshot|firebaseQuery|query|getDoc|getDocs|firebaseGetDoc|firebaseGetDocs|where|orderBy|limit|startAfter|runTransaction|setDoc|updateDoc|deleteDoc|setInterval|get)$/.test(name)) return;
    const expression = source.slice(node.start, node.end);
    // Only short source snippets; never inspect runtime credentials or data.
    calls.push({ ...location, name, expression: expression.split(/\r?\n/)[0].slice(0, 220), explicitLimitInCall: /\b(?:firebaseLimit|limit)\s*\(/.test(expression), runtime: 'UNMEASURED' });
  });
}
const indexes = JSON.parse(await readFile('firestore.indexes.json', 'utf8'));
const report = {
  generatedAt: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  scope: 'Static AST inventory of src and functions. Call sites are NOT runtime request counts; get() includes non-database calls. No server query plans or deployed-index verification.',
  scannedFiles: scannedFiles.length, parseErrors, components, exports,
  endpoints: [...new Set(endpoints.map(row => row.route))].map(route => ({ route, sources: endpoints.filter(row => row.route === route), requestsPerScreen: null, payloadBytes: null, p50: null, p90: null, p95: null, p99: null, dbTime: null, status: 'UNMEASURED' })),
  calls, declaredIndexes: indexes.indexes,
};
await writeFile(path.join(output, 'source-inventory.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ files: report.scannedFiles, parseErrors, components: components.length, exportedFunctions: exports.length, routes: report.endpoints.length, callSites: calls.length, declaredIndexes: indexes.indexes.length }));
if (parseErrors.length) process.exitCode = 1;
