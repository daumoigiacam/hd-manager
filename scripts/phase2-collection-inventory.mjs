import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const appPath = path.resolve('src/App.jsx');
const moduleInventoryPath = path.resolve('test-results/module-source-inventory.json');
const outputPath = path.resolve('test-results/phase2/collection-inventory.json');

const [source, moduleInventory, firestoreIndexes] = await Promise.all([
  readFile(appPath, 'utf8'),
  readFile(moduleInventoryPath, 'utf8').then(JSON.parse),
  readFile('firestore.indexes.json', 'utf8').then(JSON.parse),
]);

const collectionLiteral = source.match(/const DATA_COLLECTION_NAMES = \[([\s\S]*?)\];/)?.[1] || '';
const collections = [...collectionLiteral.matchAll(/'([^']+)'/g)].map((match) => match[1]);
if (collections.length === 0) throw new Error('DATA_COLLECTION_NAMES was not found');

const foregroundLiteral = source.match(/const FOREGROUND_REALTIME_COLLECTIONS_BY_TAB = Object\.freeze\(\{([\s\S]*?)\}\);/)?.[1] || '';
const foregroundByTab = Object.fromEntries(
  [...foregroundLiteral.matchAll(/^\s*([a-zA-Z0-9_]+):\s*\[([^\]]*)\]/gm)].map((match) => [
    match[1],
    [...match[2].matchAll(/'([^']+)'/g)].map((item) => item[1]),
  ]),
);

const indexCollections = new Set((firestoreIndexes.indexes || []).map((index) => index.collectionGroup));
const highImpactModules = new Set(['home', 'orders', 'customers', 'messages', 'payroll', 'pricing']);
const localFixtureRows = { products: 600, customers: 360, orders: 1800, payments: 900, orderRequests: 1 };

const rows = collections.map((collection) => {
  const modules = moduleInventory.modules
    .filter((module) => module.foregroundCollections.includes(collection))
    .map((module) => module.key);
  const companyPointLookup = collection === 'companies';
  const boundedMessages = collection === 'messages';
  const fullLoad = !companyPointLookup && !boundedMessages;
  const impactCount = modules.filter((module) => highImpactModules.has(module)).length;
  const risk = fullLoad
    ? impactCount > 0 || modules.length >= 4 ? 'CRITICAL' : 'HIGH'
    : boundedMessages ? 'MEDIUM' : 'LOW';
  const query = companyPointLookup
    ? 'doc(..., companies, tenantCompanyId)'
    : boundedMessages
      ? "where(companyId == tenantCompanyId) + orderBy(createdAt desc) + limit(200); scoped employee variants"
      : 'where(companyId == tenantCompanyId)';
  const index = companyPointLookup
    ? 'document id lookup'
    : boundedMessages
      ? indexCollections.has(collection) ? 'declared composite indexes' : 'MISSING composite verification'
      : 'automatic single-field companyId (deployment not verified)';
  return {
    collection,
    modules,
    currentRows: null,
    currentRowsScope: 'PRODUCTION_UNMEASURED; staging PostgreSQL is not the Firebase production datastore',
    localFixtureRows: localFixtureRows[collection] ?? null,
    query,
    fullLoad,
    pagination: boundedMessages ? 'bounded first page only; no cursor/load-older path' : companyPointLookup ? 'not applicable' : 'none',
    projection: 'none; full document payload',
    index,
    payloadBytes: null,
    risk,
    source: companyPointLookup ? 'src/App.jsx:13630' : boundedMessages ? 'src/App.jsx:13644' : 'src/App.jsx:13633',
    remediation: fullLoad
      ? 'Introduce a module-specific paged read model plus aggregates before applying a limit; a blind limit would change totals/history.'
      : boundedMessages
        ? 'Add cursor/load-older support so the existing 200-row cap does not hide valid history.'
        : 'No collection scan; keep point lookup.',
  };
});

const allMappedCollections = new Set(Object.values(foregroundByTab).flat());
const report = {
  generatedAt: new Date().toISOString(),
  scope: 'Static Firebase company-account query inventory. No production reads were made.',
  source: 'src/App.jsx getTenantCollectionSources',
  totals: {
    collections: rows.length,
    unboundedCompanyQueries: rows.filter((row) => row.fullLoad).length,
    boundedWithoutCursor: rows.filter((row) => row.pagination.startsWith('bounded')).length,
    critical: rows.filter((row) => row.risk === 'CRITICAL').length,
    high: rows.filter((row) => row.risk === 'HIGH').length,
    notForegroundMapped: collections.filter((collection) => !allMappedCollections.has(collection)),
  },
  rows,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, ...report.totals }));
