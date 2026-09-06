import assert from 'node:assert/strict';
import test from 'node:test';
import { createHdConnectStagingApi } from '../src/api/hdConnectStaging.js';
import {
  loadVpsEmployeeReviews,
  mergeVpsEmployeeReviews,
  normalizeVpsEmployeeReview,
  saveVpsEmployeeReview,
} from '../src/api/vpsEmployeeReviews.js';

const COMPANY = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const EMPLOYEE = '33333333-3333-4333-8333-333333333333';
const REVIEW = '44444444-4444-4444-8444-444444444444';
const session = {
  id: USER,
  companyId: COMPANY,
  permissions: ['hr.performance.read', 'hr.performance.manage'],
};

const response = (patch = {}) => ({
  id: REVIEW,
  companyId: COMPANY,
  employeeId: EMPLOYEE,
  reviewerId: USER,
  periodType: 'MONTH',
  periodStart: '2026-09-01T00:00:00.000Z',
  periodEnd: '2026-09-30T00:00:00.000Z',
  score: 80,
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
  metadata: {
    hdManagerReview: {
      id: 'er_legacy_001',
      targetEmployeeId: EMPLOYEE,
      targetEmployeeName: 'Nhan vien QA',
      reviewerEmployeeId: 'legacy-reviewer',
      reviewerName: 'An danh',
      rating: 4,
      score: 4,
      criteriaScores: { quality: 4, teamwork: 4 },
      criteriaAverage: 4,
      reason: 'Lam viec tot',
      monthKey: '2026-09',
      date: '2026-09-06',
      isAnonymous: true,
    },
  },
  ...patch,
});

test('saves a lossless, idempotent VPS performance review using the native HR endpoint', async () => {
  let request;
  const api = createHdConnectStagingApi({
    post: async (path, body, options) => {
      request = { path, body, options };
      return response({
        metadata: body.metadata,
        periodStart: `${body.periodStart}T00:00:00.000Z`,
        periodEnd: `${body.periodEnd}T00:00:00.000Z`,
        score: body.score,
      });
    },
  });
  const saved = await saveVpsEmployeeReview(api, session, {
    id: 'er_legacy_001',
    companyId: COMPANY,
    targetEmployeeId: EMPLOYEE,
    targetEmployeeName: 'Nhan vien QA',
    reviewerEmployeeId: 'legacy-reviewer',
    reviewerName: 'An danh',
    isAnonymous: true,
    source: 'peer',
    rating: 4,
    criteriaScores: { quality: 4, teamwork: 4 },
    criteriaAverage: 4,
    reason: 'Lam viec tot',
    monthKey: '2026-09',
    date: '2026-09-06',
  });

  assert.equal(request.path, '/hr-suite/performance-reviews');
  assert.equal(request.body.companyId, undefined);
  assert.equal(request.body.employeeId, EMPLOYEE);
  assert.equal(request.body.periodType, 'MONTH');
  assert.equal(request.body.periodStart, '2026-09-01');
  assert.equal(request.body.periodEnd, '2026-09-30');
  assert.equal(request.body.score, 80);
  assert.equal(request.body.sourceReference, 'hdm-review:er_legacy_001');
  assert.equal(request.body.metadata.hdManagerReview.criteriaScores.teamwork, 4);
  assert.equal(request.options.idempotencyKey, 'hdm-review:er_legacy_001');
  assert.equal(saved.rating, 4);
  assert.equal(saved.criteriaScores.quality, 4);
  assert.equal(saved.source, 'hd-connect-vps');
});

test('loads complete tenant-scoped review pages and rejects cross-tenant records', async () => {
  const loaded = await loadVpsEmployeeReviews({
    listHrPerformanceReviews: async () => ({
      items: [response()],
      pagination: { hasNextPage: false },
    }),
  }, session);
  assert.equal(loaded.complete, true);
  assert.equal(loaded.items.length, 1);
  assert.equal(loaded.items[0].targetEmployeeId, EMPLOYEE);
  assert.deepEqual(mergeVpsEmployeeReviews([], loaded.items, COMPANY), loaded.items);
  await assert.rejects(
    () => loadVpsEmployeeReviews({
      listHrPerformanceReviews: async () => ({
        items: [response({ companyId: '55555555-5555-4555-8555-555555555555' })],
        pagination: { hasNextPage: false },
      }),
    }, session),
    { code: 'HR_PERFORMANCE_REVIEW_SCOPE_MISMATCH' },
  );
});

test('preserves the manager star scale and fails closed for invalid tenant, employee, or rating input', async () => {
  assert.equal(normalizeVpsEmployeeReview(response()).rating, 4);
  await assert.rejects(
    () => saveVpsEmployeeReview({}, session, {
      id: 'er_wrong_tenant', companyId: '55555555-5555-4555-8555-555555555555',
      targetEmployeeId: EMPLOYEE, rating: 4, monthKey: '2026-09',
    }),
    { code: 'HR_PERFORMANCE_REVIEW_TENANT_MISMATCH' },
  );
  await assert.rejects(
    () => saveVpsEmployeeReview({}, session, {
      id: 'er_invalid_rating', companyId: COMPANY,
      targetEmployeeId: EMPLOYEE, rating: 6, monthKey: '2026-09',
    }),
    { code: 'HR_PERFORMANCE_REVIEW_RATING_INVALID' },
  );
});

test('the App selects the VPS review adapter before any Firebase write path', async () => {
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const start = app.indexOf('  const handleAddEmployeeReview =');
  const source = app.slice(start, app.indexOf('\n  const ', start + 1));
  assert.match(source, /if \(isVpsApiMode\)/);
  assert.ok(source.indexOf('if (isVpsApiMode)') < source.indexOf('if (!firebaseUser)'));
  assert.match(source, /saveVpsEmployeeReview/);
  assert.match(app, /loadVpsEmployeeReviews\(api, currentUser/);
});
