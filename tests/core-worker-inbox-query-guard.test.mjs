import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from '@babel/parser';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, collection, query, where, orderBy, limit, queryEqual } from 'firebase/firestore';
import { canUseFirestoreReadWorker } from '../src/services/readWorkerPolicy.js';

const source = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
let expression;
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'VariableDeclarator' && node.id?.name === 'workerEligible') expression = source.slice(node.init.start, node.init.end);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') visit(value);
  }
}
visit(ast);
assert.ok(expression);
const evaluate = new Function('readWorker', 'canUseFirestoreReadWorker', 'colName', 'collectionRefs', 'customerSession',
  'firebaseQueryEqual', 'firebaseQuery', 'collection', 'db', 'appId', 'tenantCompanyId', 'firebaseWhere', 'firebaseOrderBy', 'firebaseLimit',
  `return ${expression}`);

test('actual App worker admission accepts only the exact SDK manager inbox query', async () => {
  const app = initializeApp({ projectId: 'demo-worker-query-guard', apiKey: 'demo-key' }, 'worker-query-guard');
  try {
    const db = getFirestore(app), appId = 'fixture', companyId = 'company-a';
    const target = collection(db, 'artifacts', appId, 'public', 'data', 'messages');
    const expected = () => query(target, where('companyId', '==', companyId), orderBy('createdAt', 'desc'), limit(200));
    const eligible = (refs, customerSession = false, worker = {}) => evaluate(worker, canUseFirestoreReadWorker,
      'messages', refs, customerSession, queryEqual, query, collection, db, appId, companyId, where, orderBy, limit);
    assert.equal(eligible([expected()]), true);
    assert.equal(eligible([expected()], true), false);
    assert.equal(eligible([expected()], false, null), false);
    assert.equal(eligible([expected(), expected()]), false);
    assert.equal(eligible([query(target, where('companyId', '==', 'company-b'), orderBy('createdAt', 'desc'), limit(200))]), false);
    assert.equal(eligible([query(target, where('companyId', '==', companyId), where('assignedEmployeeId', '==', 'employee-a'), orderBy('createdAt', 'desc'), limit(200))]), false);
    assert.equal(eligible([query(target, where('companyId', '==', companyId), orderBy('createdAt', 'desc'), limit(100))]), false);
    assert.equal(eligible([query(target, where('companyId', '==', companyId), orderBy('createdAt', 'asc'), limit(200))]), false);
    assert.equal(eligible([query(target, where('companyId', '==', companyId))]), false);
  } finally { await deleteApp(app); }
});
