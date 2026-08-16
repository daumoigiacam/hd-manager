import assert from 'node:assert/strict';
import test from 'node:test';
import { CUTOVER_INPUTS, summarizeCutoverPreparation, validateCutoverCsv } from '../src/features/platform-admin/cutoverPreparation.js';

const row = (filename, values = {}) => {
  const definition = CUTOVER_INPUTS.find((input) => input.key === filename);
  return `${definition.requiredHeaders.join(',')}\n${definition.requiredHeaders.map((header) => values[header] || `value-${header}`).join(',')}`;
};

test('cutover preparation rejects missing headers and duplicate source IDs', () => {
  const missing = validateCutoverCsv('identity-input.csv', 'source_identity_id\nidentity-1');
  assert.equal(missing.status, 'BLOCKED');
  assert.ok(missing.errors.some((error) => error.message.includes('Missing required header')));

  const identity = CUTOVER_INPUTS.find((input) => input.key === 'identity-input.csv');
  const values = Object.fromEntries(identity.requiredHeaders.map((header) => [header, `value-${header}`]));
  values.verified_email = 'owner@example.test';
  values.invitation_required = 'TRUE';
  values.approved = 'TRUE';
  const csv = `${row('identity-input.csv', values)}\n${identity.requiredHeaders.map((header) => values[header]).join(',')}`;
  const duplicate = validateCutoverCsv('identity-input.csv', csv);
  assert.equal(duplicate.status, 'BLOCKED');
  assert.ok(duplicate.errors.some((error) => error.message.includes('Duplicate source_identity_id')));
});

test('cutover preparation rejects sensitive fields and invalid payment dispositions', () => {
  const sensitive = validateCutoverCsv('identity-input.csv', 'source_identity_id,password\nidentity-1,secret');
  assert.equal(sensitive.status, 'BLOCKED');
  assert.ok(sensitive.errors.some((error) => error.message.includes('Sensitive field')));

  const payment = CUTOVER_INPUTS.find((input) => input.key === 'payment-collision-decisions.csv');
  const values = Object.fromEntries(payment.requiredHeaders.map((header) => [header, `value-${header}`]));
  values.disposition = 'UNKNOWN';
  values.approved = 'TRUE';
  const invalid = validateCutoverCsv(payment.key, row(payment.key, values));
  assert.equal(invalid.status, 'BLOCKED');
  assert.ok(invalid.errors.some((error) => error.message.includes('disposition must be one of')));
});

test('overall preparation remains pending until all business files are supplied', () => {
  assert.deepEqual(summarizeCutoverPreparation({}), { status: 'PENDING', label: 'Awaiting business inputs' });
});
