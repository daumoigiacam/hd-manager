import assert from 'node:assert/strict';
import test from 'node:test';
import { OWNER_DATA_SCHEMAS, validateOwnerData } from '../scripts/owner-data-gate.mjs';

const makeValues = (definition, overrides = {}) => Object.fromEntries(definition.fields.map((field) => {
  if (Object.hasOwn(overrides, field)) return [field, overrides[field]];
  if (field === 'approved') return [field, 'TRUE'];
  if (field === 'approved_by') return [field, 'owner-approval'];
  if (field === 'approved_at') return [field, '2026-08-22T00:00:00Z'];
  if (field === 'source_tenant_id' || field === 'target_tenant_id' || field === 'tenant_id') return [field, 'tenant-example'];
  if (field === 'target_active') return [field, 'TRUE'];
  if (field === 'mapping_status') return [field, 'OWNER_APPROVED'];
  if (field === 'status') return [field, 'OWNER_APPROVED'];
  if (field === 'approval_status') return [field, 'APPROVED'];
  if (field === 'conversion_direction') return [field, 'NONE'];
  if (field === 'conversion_factor') return [field, '1'];
  if (['input_weight', 'output_weight', 'yield_percent', 'loss_weight', 'loss_percent', 'waste_weight', 'byproduct_weight'].includes(field)) return [field, field === 'input_weight' ? '10' : field === 'output_weight' ? '8' : field === 'yield_percent' ? '80' : '0'];
  if (['quantity', 'weight_kg', 'amount', 'allocated_amount', 'remaining_amount', 'debit', 'credit', 'total_source'].includes(field)) return [field, '1'];
  if (['snapshot_date', 'effective_date', 'payment_date', 'posting_date'].includes(field)) return [field, '2026-08-22'];
  if (field === 'source_uom' || field === 'target_uom' || field === 'base_uom' || field === 'transaction_uom' || field === 'quantity_unit') return [field, 'kg'];
  if (field === 'customer_id' || field === 'employee_target_id' || field === 'target_product_id' || field === 'target_warehouse_id') return [field, `${field}-target-1`];
  if (field === 'customer_id' && definition.domain === 'DEBT') return [field, 'customer-target-1'];
  if (field === 'formula_reference') return [field, 'approved-formula-reference'];
  return [field, `${field}-1`];
}));

const toCsv = (definition, rows) => `${definition.fields.join(',')}\n${rows.map((row) => definition.fields.map((field) => row[field] ?? '').join(',')).join('\n')}\n`;

const completePackage = (overrides = {}) => Object.fromEntries(OWNER_DATA_SCHEMAS.map((definition) => {
  const values = makeValues(definition, overrides[definition.file] || {});
  if (definition.domain === 'UOM') {
    values.source_uom = 'kg';
    values.target_uom = 'kg';
    values.conversion_direction = 'NONE';
    values.mapping_status = 'EXACT';
  }
  if (definition.domain === 'DEBT') values.customer_id = 'customer-target-1';
  if (definition.domain === 'POULTRY') {
    values.input_weight = '10';
    values.output_weight = '8';
    values.yield_percent = '80';
  }
  return [definition.file, toCsv(definition, [values])];
}));

test('valid owner package is validated but only explicitly approved rows become migration-ready', () => {
  const result = validateOwnerData(completePackage());
  assert.equal(result.status, 'MIGRATION_READY');
  assert.equal(result.quarantine.length, 0);
  assert.equal(result.domains.every((domain) => domain.migration_ready === 1), true);
});

test('duplicate product mapping is quarantined without selecting a target', () => {
  const files = completePackage();
  const definition = OWNER_DATA_SCHEMAS.find((item) => item.file === 'product-crosswalk.csv');
  const values = makeValues(definition);
  files[definition.file] = toCsv(definition, [values, { ...values, target_product_id: 'another-target' }]);
  const result = validateOwnerData(files);
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.quarantine.some((entry) => entry.reason_code === 'DUPLICATE'));
  assert.equal(result.domains.find((domain) => domain.domain === 'PRODUCT').migration_ready, 0);
});

test('invalid conversion, negative opening stock, and inconsistent yield are quarantined', () => {
  const files = completePackage();
  const uom = OWNER_DATA_SCHEMAS.find((item) => item.file === 'uom-crosswalk.csv');
  const uomValues = makeValues(uom, { source_uom: 'con', target_uom: 'kg', conversion_factor: '0', conversion_direction: 'SOURCE_TO_TARGET', mapping_status: 'CONVERTED' });
  files[uom.file] = toCsv(uom, [uomValues]);
  const inventory = OWNER_DATA_SCHEMAS.find((item) => item.file === 'opening-inventory.csv');
  files[inventory.file] = toCsv(inventory, [makeValues(inventory, { quantity: '-1' })]);
  const poultry = OWNER_DATA_SCHEMAS.find((item) => item.file === 'poultry-yield-loss.csv');
  files[poultry.file] = toCsv(poultry, [makeValues(poultry, { input_weight: '10', output_weight: '8', yield_percent: '70' })]);
  const result = validateOwnerData(files);
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.quarantine.some((entry) => entry.reason_code === 'INVALID_CONVERSION'));
  assert.ok(result.quarantine.some((entry) => entry.reason_code === 'INVALID_QUANTITY'));
  assert.ok(result.quarantine.some((entry) => entry.reason_code === 'INCONSISTENT_RULE'));
});

test('missing payroll formula is a business decision blocker and sensitive values are redacted', () => {
  const files = completePackage();
  const payroll = OWNER_DATA_SCHEMAS.find((item) => item.file === 'payroll-mapping.csv');
  files[payroll.file] = toCsv(payroll, [makeValues(payroll, { formula_reference: '', salary_source: 'reset-token-value' })]);
  const result = validateOwnerData(files);
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.quarantine.some((entry) => entry.reason_code === 'BUSINESS_DECISION_REQUIRED'));
  const sensitive = result.quarantine.find((entry) => entry.reason_code === 'SENSITIVE_FIELD');
  assert.equal(sensitive?.original_value, '[REDACTED]');
});

test('all input processing is local and does not expose a migration-ready row when approval is absent', () => {
  const files = completePackage();
  const product = OWNER_DATA_SCHEMAS.find((item) => item.file === 'product-crosswalk.csv');
  files[product.file] = toCsv(product, [makeValues(product, { approved: 'FALSE', mapping_status: 'UNMAPPED', target_product_id: '' })]);
  const result = validateOwnerData(files);
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.domains.find((domain) => domain.domain === 'PRODUCT').migration_ready, 0);
});

test('approved product mapping without a target is quarantined as missing target', () => {
  const files = completePackage();
  const product = OWNER_DATA_SCHEMAS.find((item) => item.file === 'product-crosswalk.csv');
  files[product.file] = toCsv(product, [makeValues(product, { target_product_id: '', target_product_code: '', target_product_name: '' })]);
  const result = validateOwnerData(files);
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.quarantine.some((entry) => entry.reason_code === 'MISSING_TARGET'));
  assert.equal(result.domains.find((domain) => domain.domain === 'PRODUCT').migration_ready, 0);
});

test('manifest is required for the executable intake gate and validates version/approval fields', () => {
  const files = completePackage();
  const missing = validateOwnerData(files, { requireManifest: true });
  assert.equal(missing.status, 'BLOCKED');
  assert.ok(missing.quarantine.some((entry) => entry.domain === 'PACKAGE' && entry.reason_code === 'OWNER_DATA_REQUIRED'));

  const validManifest = {
    dataset_id: 'owner-package-example', version: '1', source: 'OWNER_SUPPLIED',
    created_at: '2026-08-22T00:00:00Z', created_by: 'owner', snapshot_date: '2026-08-22', approval_status: 'APPROVED',
  };
  const accepted = validateOwnerData(files, { requireManifest: true, manifest: validManifest });
  assert.equal(accepted.status, 'MIGRATION_READY');

  const pending = validateOwnerData(files, { requireManifest: true, manifest: { ...validManifest, approval_status: 'PENDING' } });
  assert.equal(pending.status, 'PARTIAL');
});

test('tenant mismatch and inactive approved targets are quarantined', () => {
  const files = completePackage();
  const product = OWNER_DATA_SCHEMAS.find((item) => item.file === 'product-crosswalk.csv');
  files[product.file] = toCsv(product, [makeValues(product, { target_tenant_id: 'tenant-other' }), makeValues(product, { source_product_id: 'product-2', source_product_code: 'product-2-code', target_product_id: 'target-product-2', target_product_code: 'target-product-2-code', target_active: 'FALSE' })]);
  const result = validateOwnerData(files);
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.quarantine.some((entry) => entry.reason_code === 'TENANT_MISMATCH'));
  assert.ok(result.quarantine.some((entry) => entry.reason_code === 'CONFLICT' && entry.field === 'target_active'));
});

test('UOM cycles and conflicting Product-UOM base units are quarantined', () => {
  const files = completePackage();
  const uom = OWNER_DATA_SCHEMAS.find((item) => item.file === 'uom-crosswalk.csv');
  files[uom.file] = toCsv(uom, [
    makeValues(uom, { source_uom: 'unit-a', target_uom: 'unit-b', conversion_factor: '2', conversion_direction: 'SOURCE_TO_TARGET', mapping_status: 'CONVERTED' }),
    makeValues(uom, { source_uom: 'unit-b', target_uom: 'unit-a', conversion_factor: '0.5', conversion_direction: 'SOURCE_TO_TARGET', mapping_status: 'CONVERTED' }),
  ]);
  const productUom = OWNER_DATA_SCHEMAS.find((item) => item.file === 'product-uom.csv');
  files[productUom.file] = toCsv(productUom, [
    makeValues(productUom, { product_id: 'product-cycle', base_uom: 'unit-a', transaction_uom: 'unit-a' }),
    makeValues(productUom, { product_id: 'product-cycle', base_uom: 'unit-b', transaction_uom: 'unit-b' }),
    makeValues(productUom, { product_id: 'product-invalid', base_uom: 'unsupported-uom', transaction_uom: 'unsupported-uom' }),
  ]);
  const result = validateOwnerData(files);
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.quarantine.some((entry) => entry.domain === 'UOM' && entry.reason_code === 'CONFLICT'));
  assert.ok(result.quarantine.some((entry) => entry.domain === 'PRODUCT_UOM' && entry.reason_code === 'CONFLICT'));
  assert.ok(result.quarantine.some((entry) => entry.domain === 'PRODUCT_UOM' && entry.reason_code === 'INVALID_UOM'));
});
