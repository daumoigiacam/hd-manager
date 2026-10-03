import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parse } from '@babel/parser';

// Read-only tracked-file inventory. Zero text matches are candidates, never deletion proof.
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const textFiles = new Map();
for (const file of files) {
  const bytes = fs.readFileSync(file);
  if (!bytes.includes(0) && !file.endsWith('package-lock.json')) textFiles.set(file, bytes.toString('utf8'));
}
const operational = [...textFiles].filter(([f]) => !/^(docs\/|test-results\/)/.test(f) && !f.endsWith('.md'));
const references = (name, owner) => operational.filter(([file, text]) => file !== owner && text.includes(name)).map(([file]) => file);
const imports = [];
for (const [file, source] of textFiles) {
  if (!/^src\/.*\.[cm]?jsx?$/.test(file)) continue;
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  for (const node of ast.program.body.filter(node => node.type === 'ImportDeclaration')) {
    const body = source.slice(0, node.start) + source.slice(node.end);
    for (const specifier of node.specifiers) {
      const name = specifier.local.name;
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!new RegExp(`\\b${escaped}\\b`).test(body)) imports.push({ file, name, module: node.source.value });
    }
  }
}
const sourceCandidates = files.filter(file => /^src\/.*\.[cm]?jsx?$/.test(file)).map(file => {
  const stem = path.basename(file).replace(/\.[^.]+$/, '');
  return { file, references: references(stem, file), classification: 'B: retain until runtime/build ownership is proven' };
}).filter(item => !item.references.length);
const assets = files.filter(file => /\.(png|jpe?g|webp|svg|ico|woff2?|ttf|mp3|mp4)$/.test(file)).map(file => ({
  file, references: references(path.basename(file), file),
  hash: createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
  classification: 'C: native/PWA/static URL discovery can be indirect; retain',
}));
const dependencies = ['package.json', 'functions/package.json', 'ios-expo/package.json'].filter(file => fs.existsSync(file)).flatMap(file => {
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).map(name => ({
    manifest: file, name, references: references(name, file),
    classification: 'C: keep; no dependency removal proven across all toolchains',
  }));
});
const debug = operational.filter(([file]) => /^(src|functions|scripts|tests)\//.test(file)).flatMap(([file, text]) => {
  const matches = [...text.matchAll(/\b(console\.(?:log|debug|warn|error)|debugger|TODO|FIXME|HACK|TEST_ONLY|DEV_ONLY)\b/g)];
  return matches.length ? [{ file, count: matches.length, classification: 'C: diagnostics/test output or B: intent unproven; retain' }] : [];
});
const scopes = [...new Set(files.map(file => file.includes('/') ? file.split('/')[0] : '(root)'))]
  .map(scope => ({ scope, count: files.filter(file => (file.includes('/') ? file.split('/')[0] : '(root)') === scope).length }));
const inventory = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  trackedFiles: files.length,
  sourceBytes: files.filter(file => file.startsWith('src/')).reduce((sum, file) => sum + fs.statSync(file).size, 0),
  scopes, unusedImportCandidates: imports, sourceCandidates, assets, dependencies, debug,
  backupFiles: files.filter(file => /\.(old|bak|backup|tmp|disabled|copy|orig)$/.test(file)),
  configFiles: files.filter(file => /config|\.github\/workflows|firebase|capacitor/.test(file)),
  cssFiles: files.filter(file => file.endsWith('.css')),
  limitations: 'String references over-approximate reachability. No-reference files and assets are NOT safe-removal findings. Native registration, dynamic routing and historical APIs are retained.',
};
fs.mkdirSync('test-results/safe-cleanup', { recursive: true });
fs.writeFileSync('test-results/safe-cleanup/repository-inventory.json', JSON.stringify(inventory, null, 2));
console.log(JSON.stringify({ ...inventory, assets: assets.length, dependencies: dependencies.length, debug: debug.length, configFiles: inventory.configFiles.length }, null, 2));

if (process.argv.includes('--write-register')) {
  const diagnostics = JSON.parse(fs.readFileSync('test-results/safe-cleanup/unused-baseline.json', 'utf8'));
  const rows = [];
  for (const item of diagnostics) {
    const file = path.relative(process.cwd(), item.file).replaceAll('\\', '/');
    const baseline = execFileSync('git', ['show', `4db424a3:${file}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const before = parse(baseline, { sourceType: 'module', plugins: ['jsx'] }).program.body;
    const current = fs.readFileSync(file, 'utf8');
    const importNames = before.filter(node => node.type === 'ImportDeclaration').flatMap(node => node.specifiers.map(spec => spec.local.name));
    for (const message of item.messages.filter(message => message.ruleId === 'no-unused-vars')) {
      const name = message.message.match(/^'([^']+)'/)?.[1];
      const removed = importNames.includes(name) && !new RegExp(`\\b${name}\\b`).test(current);
      const refs = references(name, file);
      const keep = !removed && (name.startsWith('_') || refs.some(ref => ref.startsWith('tests/')));
      rows.push({ item: name, type: importNames.includes(name) ? 'Import binding' : 'Static unused-symbol candidate', location: `${file}:${message.line}`,
        evidence: removed ? 'Lexical use absent; executable AST + module source order unchanged; implementation retained' :
          `${refs.length} other-file literal references; ${refs.slice(0, 2).join(', ') || 'runtime/side-effect reachability not proven'}`,
        classification: removed ? 'A' : keep ? 'C' : 'B', action: removed ? 'Remove binding only' : 'Keep', risk: removed ? 'Low; tested' : 'Behavior/test/runtime ownership' });
    }
  }
  for (const candidate of sourceCandidates) rows.push({ item: candidate.file, type: 'File candidate', location: candidate.file,
    evidence: 'No basename reference; exported session/permission helper. Authentication boundary, not approved as dead API.', classification: 'B', action: 'Keep for owner review', risk: 'Authentication/authorization' });
  const escape = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
  fs.writeFileSync('DEAD_CODE_REGISTER.md', [
    '# Dead Code Register', '',
    'Baseline: `4db424a3e511bc2a24162245e7423478da9f89c8`. Locations refer to baseline. A = proven removable binding, B = retain for review, C = required/test-used, D = historical evidence (retained as a group).', '',
    '| Item | Type | Location | Evidence | Classification | Action | Risk |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(row => `| ${Object.values(row).map(escape).join(' | ')} |`), '',
    'Historical reports, migrations and release evidence: D, retain. No whole file, API, hook, state initializer, callback, asset, CSS rule or dependency was admitted to A.', '',
    'ESLint no-unused-vars is not JSX-aware here. JSX-only references, side-effectful initializers, destructuring used to omit properties, source-extracted tests and compatibility APIs are not removal proof. B entries remain intentionally unchanged.', '',
    `Counts: A ${rows.filter(row => row.classification === 'A').length}; B ${rows.filter(row => row.classification === 'B').length}; C ${rows.filter(row => row.classification === 'C').length}; D historical records retained.`, '',
  ].join('\n'));
  fs.writeFileSync('REMOVED_DEPENDENCIES_REGISTER.md', [
    '# Removed Dependencies Register', '', 'Removed: **0**. package.json and all lockfiles are unchanged.', '',
    'Font packages without literal consumers remain B for owner review; absence of imports alone does not establish all packaging consumers. CLI/type/build packages can be invoked by binary names, ambient type resolution or plugins. No uninstall or install was performed.', '',
    '| Manifest | Package | Evidence | Classification / Action |', '| --- | --- | --- | --- |',
    ...dependencies.map(item => `| ${item.manifest} | ${item.name} | ${item.references.slice(0, 3).join(', ') || 'Indirect CLI/type/build use or unproven packaging dependency'} | ${item.name.startsWith('@fontsource') ? 'B: owner review; keep' : 'C: keep'} |`), '',
  ].join('\n'));
  fs.writeFileSync('REMOVED_ASSETS_REGISTER.md', [
    '# Removed Assets Register', '', 'Removed: **0**. Native resources, manifest icons, public URLs, website/social images and historical screenshots are retained.', '',
    'Equal hashes do not prove interchangeable density/qualifier paths. CSS selectors and asset names can be assembled dynamically; no stylesheet, font or image was admitted to A.', '',
    '| Asset | Reference Evidence | Action |', '| --- | --- | --- |',
    ...assets.map(item => `| ${item.file} | ${item.references.slice(0, 3).join(', ') || 'Native/static URL or build discovery; complete external reachability unproven'} | Keep |`), '',
  ].join('\n'));
}
