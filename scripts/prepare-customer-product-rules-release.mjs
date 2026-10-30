import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const [basePath, outputPath] = process.argv.slice(2);
assert.ok(basePath && outputPath, 'Usage: node scripts/prepare-customer-product-rules-release.mjs <active-rules-backup> <output-rules>');
const source = await readFile('firestore.rules', 'utf8');
const base = await readFile(basePath, 'utf8');
const names = ['customerProductKeys', 'customerConfigActionEnabled', 'canManageCustomerProductConfig', 'dispatchEmployeePath', 'dispatchCompanyPath', 'dispatchRoleKey'];
const functions = names.map(name => {
  assert.ok(!base.includes(`function ${name}(`), `Active rules already define ${name}; review required`);
  const start = source.indexOf(`    function ${name}(`);
  assert.ok(start >= 0, `Missing helper ${name}`);
  let end = source.indexOf('{', start), depth = 1;
  while (depth && ++end < source.length) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
  }
  assert.equal(depth, 0);
  return source.slice(start, end + 1);
}).join('\n\n');
const entry = '    function isCustomerIdentity()';
assert.equal(base.split(entry).length, 2, 'Active rules entry must be unique');
const update = '      allow update: if hasIdentitySession()\n';
const normalized = base.replaceAll('\r\n', '\n');
assert.equal(normalized.split(update).length, 2, 'Update entry must be unique');
const guard = "        && (collectionId != 'customers'\n          || !request.resource.data.diff(resource.data).affectedKeys().hasAny(customerProductKeys())\n          || canManageCustomerProductConfig(appId, resource.data))\n";
const result = normalized.replace(entry, `${functions}\n\n${entry}`).replace(update, `${update}${guard}`);
await writeFile(outputPath, result);
const sha = value => createHash('sha256').update(value).digest('hex');
console.log(JSON.stringify({ baseSha256: sha(base), outputSha256: sha(result), helpers: names, scope: 'Existing active rules plus customer product update guard only' }));
