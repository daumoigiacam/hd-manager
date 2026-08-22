#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APPROVAL_VALUES = new Set(['TRUE', 'FALSE']);
const MAPPING_STATUSES = new Set(['UNMAPPED', 'AUTO_MAPPED', 'OWNER_APPROVED', 'EXACT', 'CONVERTED', 'CONFLICT', 'QUARANTINED', 'REJECTED']);
const RECORD_STATUSES = new Set(['DRAFT', 'PENDING', 'VALIDATED', 'OWNER_APPROVED', 'MIGRATION_READY', 'QUARANTINED', 'REJECTED']);
const APPROVAL_STATUSES = new Set(['PENDING', 'APPROVED', 'REJECTED']);
const FORBIDDEN_PATTERN = /\b(password|passwd|pin|token|private[_ -]?key|secret|api[_ -]?key|credential)\b/i;
const REASON_CODES = Object.freeze({
  MISSING_FIELD: 'MISSING_FIELD',
  DUPLICATE: 'DUPLICATE',
  CONFLICT: 'CONFLICT',
  TENANT_MISMATCH: 'TENANT_MISMATCH',
  INVALID_UOM: 'INVALID_UOM',
  MISSING_UOM: 'MISSING_UOM',
  MISSING_WAREHOUSE: 'MISSING_WAREHOUSE',
  MISSING_PRODUCT: 'MISSING_PRODUCT',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  INVALID_WEIGHT: 'INVALID_WEIGHT',
  INVALID_QUANTITY: 'INVALID_QUANTITY',
  AMBIGUOUS_MAPPING: 'AMBIGUOUS_MAPPING',
  MISSING_APPROVAL: 'MISSING_APPROVAL',
  BUSINESS_DECISION_REQUIRED: 'BUSINESS_DECISION_REQUIRED',
  OWNER_DATA_REQUIRED: 'OWNER_DATA_REQUIRED',
  MISSING_TARGET: 'MISSING_TARGET',
  INVALID_STATUS: 'INVALID_STATUS',
  INVALID_CONVERSION: 'INVALID_CONVERSION',
  INCONSISTENT_RULE: 'INCONSISTENT_RULE',
  SENSITIVE_FIELD: 'SENSITIVE_FIELD',
});

const schema = (config) => ({
  ...config,
  fields: [...config.fields],
  required: [...config.required],
  unique: [...(config.unique || [])],
  uniqueGroups: (config.uniqueGroups || (config.unique || []).map((field) => [field])).map((group) => [...group]),
});

export const OWNER_DATA_SCHEMAS = Object.freeze([
  schema({
    file: 'product-crosswalk.csv', domain: 'PRODUCT', sourceId: 'source_product_id',
    fields: ['source_product_id', 'source_product_code', 'source_product_name', 'target_product_id', 'target_product_code', 'target_product_name', 'source_tenant_id', 'target_tenant_id', 'tenant_id', 'category', 'product_type', 'base_unit', 'active', 'target_active', 'mapping_status', 'approved', 'approved_by', 'approved_at'],
    required: ['source_product_id', 'source_product_name', 'tenant_id', 'base_unit', 'mapping_status', 'approved', 'approved_by', 'approved_at'],
    unique: ['source_product_id', 'target_product_id', 'source_product_code', 'target_product_code'],
    mappingField: 'mapping_status',
    targetFields: ['target_product_id', 'target_product_code', 'target_product_name'],
  }),
  schema({
    file: 'warehouse-crosswalk.csv', domain: 'WAREHOUSE', sourceId: 'source_warehouse_id',
    fields: ['source_warehouse_id', 'source_warehouse_code', 'source_warehouse_name', 'target_warehouse_id', 'target_warehouse_code', 'target_warehouse_name', 'source_tenant_id', 'target_tenant_id', 'tenant_id', 'active', 'target_active', 'mapping_status', 'approved', 'approved_by', 'approved_at'],
    required: ['source_warehouse_id', 'source_warehouse_name', 'tenant_id', 'mapping_status', 'approved', 'approved_by', 'approved_at'],
    unique: ['source_warehouse_id', 'target_warehouse_id', 'source_warehouse_code', 'target_warehouse_code'],
    mappingField: 'mapping_status',
    targetFields: ['target_warehouse_id', 'target_warehouse_code', 'target_warehouse_name'],
  }),
  schema({
    file: 'uom-crosswalk.csv', domain: 'UOM', sourceId: 'source_uom',
    fields: ['source_uom', 'target_uom', 'conversion_factor', 'conversion_direction', 'product_scope', 'tenant_scope', 'mapping_status', 'approved', 'approved_by', 'approved_at'],
    required: ['source_uom', 'target_uom', 'mapping_status', 'approved', 'approved_by', 'approved_at'],
    unique: ['source_uom', 'target_uom', 'product_scope', 'tenant_scope'],
    uniqueGroups: [['source_uom', 'target_uom', 'product_scope', 'tenant_scope']],
    mappingField: 'mapping_status', numeric: ['conversion_factor'],
  }),
  schema({
    file: 'product-uom.csv', domain: 'PRODUCT_UOM', sourceId: 'product_id',
    fields: ['product_id', 'tenant_id', 'base_uom', 'transaction_uom', 'conversion_factor', 'mapping_status', 'approved', 'approved_by', 'approved_at'],
    required: ['product_id', 'tenant_id', 'base_uom', 'transaction_uom', 'mapping_status', 'approved', 'approved_by', 'approved_at'],
    unique: ['product_id', 'tenant_id', 'base_uom', 'transaction_uom'],
    uniqueGroups: [['product_id', 'tenant_id', 'base_uom', 'transaction_uom']],
    mappingField: 'mapping_status', numeric: ['conversion_factor'],
  }),
  schema({
    file: 'opening-inventory.csv', domain: 'INVENTORY', sourceId: 'source_reference',
    fields: ['source_reference', 'tenant_id', 'warehouse_id', 'product_id', 'quantity', 'quantity_unit', 'weight_kg', 'snapshot_date', 'source_system', 'status', 'approved', 'approved_by', 'approved_at'],
    required: ['source_reference', 'tenant_id', 'warehouse_id', 'product_id', 'quantity', 'quantity_unit', 'snapshot_date', 'status', 'approved_by', 'approved_at'],
    unique: ['source_reference', 'tenant_id', 'warehouse_id', 'product_id', 'snapshot_date'],
    uniqueGroups: [['source_reference'], ['tenant_id', 'warehouse_id', 'product_id', 'snapshot_date']],
    statusField: 'status', numeric: ['quantity', 'weight_kg'],
  }),
  schema({
    file: 'opening-debt.csv', domain: 'DEBT', sourceId: 'source_reference',
    fields: ['source_reference', 'tenant_id', 'customer_id', 'supplier_id', 'amount', 'currency', 'snapshot_date', 'source_system', 'status', 'approved', 'approved_by', 'approved_at'],
    required: ['source_reference', 'tenant_id', 'amount', 'currency', 'snapshot_date', 'status', 'approved_by', 'approved_at'],
    unique: ['source_reference', 'tenant_id', 'customer_id', 'supplier_id', 'snapshot_date'],
    uniqueGroups: [['source_reference'], ['tenant_id', 'customer_id', 'supplier_id', 'snapshot_date']],
    statusField: 'status', numeric: ['amount'],
  }),
  schema({
    file: 'weight-semantics.csv', domain: 'WEIGHT', sourceId: 'rule_id',
    fields: ['rule_id', 'tenant_id', 'quantity_authority', 'weight_authority', 'derived_field', 'effective_date', 'mapping_status', 'approved', 'approved_by', 'approved_at'],
    required: ['rule_id', 'tenant_id', 'quantity_authority', 'weight_authority', 'derived_field', 'effective_date', 'mapping_status', 'approved_by', 'approved_at'],
    unique: ['rule_id', 'tenant_id', 'effective_date'], mappingField: 'mapping_status',
  }),
  schema({
    file: 'poultry-yield-loss.csv', domain: 'POULTRY', sourceId: 'rule_id',
    fields: ['rule_id', 'tenant_id', 'animal_type', 'input_state', 'input_weight', 'output_state', 'output_weight', 'yield_percent', 'loss_weight', 'loss_percent', 'waste_weight', 'byproduct_weight', 'effective_date', 'mapping_status', 'approved', 'approved_by', 'approved_at'],
    required: ['rule_id', 'tenant_id', 'animal_type', 'input_state', 'output_state', 'effective_date', 'mapping_status', 'approved_by', 'approved_at'],
    unique: ['rule_id', 'tenant_id', 'animal_type', 'input_state', 'output_state', 'effective_date'],
    mappingField: 'mapping_status', numeric: ['input_weight', 'output_weight', 'yield_percent', 'loss_weight', 'loss_percent', 'waste_weight', 'byproduct_weight'],
  }),
  schema({
    file: 'payment-mapping.csv', domain: 'PAYMENT', sourceId: 'provider_reference',
    fields: ['provider', 'provider_reference', 'payment_id', 'customer_id', 'invoice_id', 'amount', 'currency', 'payment_date', 'status', 'mapping_status', 'approved', 'approved_by', 'approved_at'],
    required: ['provider', 'provider_reference', 'amount', 'currency', 'payment_date', 'status', 'mapping_status', 'approved_by', 'approved_at'],
    unique: ['provider_reference', 'payment_id'], mappingField: 'mapping_status', numeric: ['amount'],
  }),
  schema({
    file: 'debt-allocation.csv', domain: 'DEBT_ALLOCATION', sourceId: 'payment_reference',
    fields: ['payment_reference', 'customer_id', 'invoice_id', 'allocated_amount', 'remaining_amount', 'allocation_rule', 'approval_status', 'approved_by', 'approved_at'],
    required: ['payment_reference', 'customer_id', 'allocated_amount', 'remaining_amount', 'allocation_rule', 'approval_status', 'approved_by', 'approved_at'],
    unique: ['payment_reference', 'invoice_id'], approvalField: 'approval_status', numeric: ['allocated_amount', 'remaining_amount'],
  }),
  schema({
    file: 'accounting-mapping.csv', domain: 'ACCOUNTING', sourceId: 'source_reference',
    fields: ['source_reference', 'transaction_type', 'account_code', 'debit', 'credit', 'currency', 'posting_date', 'tenant_id', 'approval_status', 'approved_by', 'approved_at'],
    required: ['source_reference', 'transaction_type', 'account_code', 'debit', 'credit', 'currency', 'posting_date', 'tenant_id', 'approval_status', 'approved_by', 'approved_at'],
    unique: ['source_reference', 'account_code', 'posting_date'], approvalField: 'approval_status', numeric: ['debit', 'credit'],
  }),
  schema({
    file: 'payroll-mapping.csv', domain: 'PAYROLL', sourceId: 'employee_source_id',
    fields: ['employee_source_id', 'employee_target_id', 'period', 'formula_reference', 'salary_source', 'commission_source', 'allowance_source', 'deduction_source', 'total_source', 'mapping_status', 'approval_status', 'approved_by', 'approved_at'],
    required: ['employee_source_id', 'employee_target_id', 'period', 'formula_reference', 'mapping_status', 'approval_status', 'approved_by', 'approved_at'],
    unique: ['employee_source_id', 'employee_target_id', 'period'],
    uniqueGroups: [['employee_source_id', 'employee_target_id', 'period']], mappingField: 'mapping_status', approvalField: 'approval_status', numeric: ['total_source'],
  }),
]);

export const OWNER_DATA_MANIFEST_FIELDS = Object.freeze(['dataset_id', 'version', 'source', 'created_at', 'created_by', 'snapshot_date', 'approval_status']);

const parseCsvLine = (line) => {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) { cells.push(cell.trim()); cell = ''; }
    else cell += character;
  }
  cells.push(cell.trim());
  return cells;
};

export const parseOwnerCsv = (text) => {
  const lines = `${text || ''}`.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim() !== '');
  if (!lines.length) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    return { rowNumber: index + 2, values: Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] || ''])) };
  });
  return { headers, rows };
};

const normalizeForCompare = (value) => `${value ?? ''}`.trim().toLocaleLowerCase('en-US');
const nonEmpty = (value) => `${value ?? ''}`.trim() !== '';
const addIssue = (issues, issue) => issues.push(issue);
const rowReference = (schemaDefinition, row) => row.values[schemaDefinition.sourceId] || `row-${row.rowNumber}`;
const isNonNegativeDecimal = (value) => /^\d+(?:\.\d+)?$/.test(`${value}`.trim());
const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(`${value}`.trim());

const issue = (schemaDefinition, row, code, detail, field = '') => {
  const rawValue = field ? row.values[field] || '' : '';
  return {
  source_record_id: rowReference(schemaDefinition, row), domain: schemaDefinition.domain, reason_code: code,
  reason_detail: detail, field, original_value: (FORBIDDEN_PATTERN.test(field) || FORBIDDEN_PATTERN.test(rawValue)) ? '[REDACTED]' : rawValue,
  candidate_value: '', status: 'QUARANTINED', row_number: row.rowNumber,
  };
};

const validateRow = (schemaDefinition, row) => {
  const issues = [];
  for (const field of schemaDefinition.required) {
    if (!nonEmpty(row.values[field])) addIssue(issues, issue(schemaDefinition, row, REASON_CODES.MISSING_FIELD, `${field} is required.`, field));
  }
  for (const [field, value] of Object.entries(row.values)) {
    if (FORBIDDEN_PATTERN.test(field) || FORBIDDEN_PATTERN.test(value)) addIssue(issues, issue(schemaDefinition, row, REASON_CODES.SENSITIVE_FIELD, 'Credential-like content is not accepted.', field));
  }
  for (const field of schemaDefinition.numeric || []) {
    if (!nonEmpty(row.values[field])) continue;
    if (!isNonNegativeDecimal(row.values[field])) addIssue(issues, issue(schemaDefinition, row, field.includes('weight') ? REASON_CODES.INVALID_WEIGHT : field.includes('quantity') ? REASON_CODES.INVALID_QUANTITY : REASON_CODES.INVALID_AMOUNT, `${field} must be a non-negative decimal.`, field));
  }
  for (const field of ['snapshot_date', 'effective_date', 'payment_date', 'posting_date']) {
    if (nonEmpty(row.values[field]) && !isIsoDate(row.values[field])) addIssue(issues, issue(schemaDefinition, row, REASON_CODES.CONFLICT, `${field} must use ISO-8601 format.`, field));
  }
  if (nonEmpty(row.values.approved) && !APPROVAL_VALUES.has(row.values.approved.toUpperCase())) addIssue(issues, issue(schemaDefinition, row, REASON_CODES.MISSING_APPROVAL, 'approved must be TRUE or FALSE.', 'approved'));
  if (schemaDefinition.mappingField && nonEmpty(row.values[schemaDefinition.mappingField])) {
    const status = row.values[schemaDefinition.mappingField].toUpperCase();
    if (!MAPPING_STATUSES.has(status) && !RECORD_STATUSES.has(status)) addIssue(issues, issue(schemaDefinition, row, REASON_CODES.INVALID_STATUS, `Unsupported mapping status: ${status}.`, schemaDefinition.mappingField));
    if (['CONFLICT', 'QUARANTINED', 'REJECTED', 'UNMAPPED'].includes(status)) addIssue(issues, issue(schemaDefinition, row, REASON_CODES.AMBIGUOUS_MAPPING, `${status} is not migration-ready.`, schemaDefinition.mappingField));
    if (schemaDefinition.targetFields && ['EXACT', 'AUTO_MAPPED', 'OWNER_APPROVED', 'CONVERTED'].includes(status)) {
      for (const field of schemaDefinition.targetFields) {
        if (!nonEmpty(row.values[field])) addIssue(issues, issue(schemaDefinition, row, REASON_CODES.MISSING_TARGET, `${field} is required for ${status} mapping.`, field));
      }
      if (nonEmpty(row.values.target_active) && !APPROVAL_VALUES.has(row.values.target_active.toUpperCase())) addIssue(issues, issue(schemaDefinition, row, REASON_CODES.CONFLICT, 'target_active must be TRUE or FALSE.', 'target_active'));
      if (row.values.target_active?.toUpperCase() === 'FALSE') addIssue(issues, issue(schemaDefinition, row, REASON_CODES.CONFLICT, 'Approved mapping points to an inactive target.', 'target_active'));
    }
  }
  if (schemaDefinition.statusField && nonEmpty(row.values[schemaDefinition.statusField]) && !RECORD_STATUSES.has(row.values[schemaDefinition.statusField].toUpperCase())) addIssue(issues, issue(schemaDefinition, row, REASON_CODES.INVALID_STATUS, 'Unsupported record status.', schemaDefinition.statusField));
  if (schemaDefinition.approvalField && nonEmpty(row.values[schemaDefinition.approvalField]) && !APPROVAL_STATUSES.has(row.values[schemaDefinition.approvalField].toUpperCase())) addIssue(issues, issue(schemaDefinition, row, REASON_CODES.INVALID_STATUS, 'Unsupported approval status.', schemaDefinition.approvalField));
  if (schemaDefinition.mappingField && row.values[schemaDefinition.mappingField]?.toUpperCase() === 'CONVERTED' && (!nonEmpty(row.values.conversion_factor) || !isNonNegativeDecimal(row.values.conversion_factor) || Number(row.values.conversion_factor) <= 0)) addIssue(issues, issue(schemaDefinition, row, REASON_CODES.INVALID_CONVERSION, 'CONVERTED mapping requires a positive conversion_factor.', 'conversion_factor'));
  if (schemaDefinition.domain === 'UOM' && nonEmpty(row.values.conversion_direction) && !['SOURCE_TO_TARGET', 'TARGET_TO_SOURCE', 'NONE'].includes(row.values.conversion_direction.toUpperCase())) addIssue(issues, issue(schemaDefinition, row, REASON_CODES.INVALID_CONVERSION, 'conversion_direction is invalid.', 'conversion_direction'));
  if (schemaDefinition.domain === 'PRODUCT_UOM') {
    if (!nonEmpty(row.values.base_uom)) addIssue(issues, issue(schemaDefinition, row, REASON_CODES.MISSING_UOM, 'base_uom is required; no base unit is inferred.', 'base_uom'));
    if (!nonEmpty(row.values.transaction_uom)) addIssue(issues, issue(schemaDefinition, row, REASON_CODES.MISSING_UOM, 'transaction_uom is required; no transaction unit is inferred.', 'transaction_uom'));
  }
  if (schemaDefinition.domain === 'OPENING_INVENTORY' && nonEmpty(row.values.weight_kg) && Number(row.values.weight_kg) < 0) addIssue(issues, issue(schemaDefinition, row, REASON_CODES.INVALID_WEIGHT, 'weight_kg cannot be negative.', 'weight_kg'));
  if (schemaDefinition.domain === 'DEBT' && !nonEmpty(row.values.customer_id) && !nonEmpty(row.values.supplier_id)) addIssue(issues, issue(schemaDefinition, row, REASON_CODES.OWNER_DATA_REQUIRED, 'customer_id or supplier_id is required.', 'customer_id'));
  if (schemaDefinition.domain === 'POULTRY' && nonEmpty(row.values.input_weight) && nonEmpty(row.values.output_weight) && nonEmpty(row.values.yield_percent)) {
    const expected = Number(row.values.output_weight) / Number(row.values.input_weight) * 100;
    if (Math.abs(expected - Number(row.values.yield_percent)) > 0.01) addIssue(issues, issue(schemaDefinition, row, REASON_CODES.INCONSISTENT_RULE, 'yield_percent does not match input/output weight; no value was corrected.', 'yield_percent'));
  }
  if (schemaDefinition.domain === 'PAYROLL' && !nonEmpty(row.values.formula_reference)) addIssue(issues, issue(schemaDefinition, row, REASON_CODES.BUSINESS_DECISION_REQUIRED, 'A payroll formula reference is required; no formula is inferred.', 'formula_reference'));
  const tenantIds = ['source_tenant_id', 'target_tenant_id', 'tenant_id'].map((field) => row.values[field]).filter(nonEmpty).map(normalizeForCompare);
  if (new Set(tenantIds).size > 1) addIssue(issues, issue(schemaDefinition, row, REASON_CODES.TENANT_MISMATCH, 'Source, target and package tenant identifiers differ.', 'target_tenant_id'));
  return issues;
};

const validateSchemaRows = (schemaDefinition, text) => {
  const { headers, rows } = parseOwnerCsv(text);
  const issues = [];
  const missingHeaders = schemaDefinition.fields.filter((field) => !headers.includes(field));
  missingHeaders.forEach((field) => addIssue(issues, { source_record_id: '', domain: schemaDefinition.domain, reason_code: REASON_CODES.MISSING_FIELD, reason_detail: `Missing required header: ${field}.`, field, original_value: '', candidate_value: '', status: 'QUARANTINED', row_number: 1 }));
  if (!rows.length) return { headers, rows, issues };
  const seen = new Map();
  for (const row of rows) {
    for (const group of schemaDefinition.uniqueGroups) {
      const values = group.map((field) => normalizeForCompare(row.values[field]));
      if (values.some((value) => !value)) continue;
      const key = `${group.join('+')}:${values.join('\u001f')}`;
      const previous = seen.get(key);
      if (previous) addIssue(issues, issue(schemaDefinition, row, REASON_CODES.DUPLICATE, `Duplicate ${group.join('+')}; first seen on row ${previous}.`, group[0]));
      else seen.set(key, row.rowNumber);
    }
    if (!missingHeaders.length) issues.push(...validateRow(schemaDefinition, row));
  }
  return { headers, rows, issues };
};

const crossRowIssues = (schemaDefinition, result, allResults) => {
  const issues = [];
  if (schemaDefinition.domain === 'UOM') {
    const conversionRows = result.rows.filter((row) => row.values.mapping_status?.toUpperCase() === 'CONVERTED' && nonEmpty(row.values.source_uom) && nonEmpty(row.values.target_uom) && row.values.conversion_direction?.toUpperCase() !== 'NONE');
    const edges = conversionRows.map((row, index) => {
      const reverse = row.values.conversion_direction.toUpperCase() === 'TARGET_TO_SOURCE';
      return { row, index, from: normalizeForCompare(reverse ? row.values.target_uom : row.values.source_uom), to: normalizeForCompare(reverse ? row.values.source_uom : row.values.target_uom) };
    });
    const outgoing = new Map();
    for (const edge of edges) outgoing.set(edge.from, [...(outgoing.get(edge.from) || []), edge]);
    const cycleIndexes = new Set();
    const visit = (node, nodes, pathEdges) => {
      for (const edge of outgoing.get(node) || []) {
        const cycleStart = nodes.indexOf(edge.to);
        if (cycleStart >= 0) {
          for (const cycleEdge of [...pathEdges.slice(cycleStart), edge]) cycleIndexes.add(cycleEdge.index);
        } else visit(edge.to, [...nodes, edge.to], [...pathEdges, edge]);
      }
    };
    for (const edge of edges) visit(edge.from, [edge.from], []);
    for (const index of cycleIndexes) issues.push(issue(schemaDefinition, edges[index].row, REASON_CODES.CONFLICT, 'UOM conversion graph contains a circular conversion; no rule was selected.', 'conversion_direction'));

    const byMapping = new Map();
    for (const row of result.rows) {
      const key = [row.values.source_uom, row.values.target_uom, row.values.product_scope, row.values.tenant_scope].map(normalizeForCompare).join('|');
      if (!key.replaceAll('|', '')) continue;
      const rows = [...(byMapping.get(key) || []), row];
      byMapping.set(key, rows);
    }
    for (const rows of byMapping.values()) {
      const factors = new Set(rows.map((row) => normalizeForCompare(row.values.conversion_factor)).filter(Boolean));
      if (rows.length > 1 && factors.size > 1) for (const row of rows) issues.push(issue(schemaDefinition, row, REASON_CODES.CONFLICT, 'Multiple conversion factors exist for the same UOM scope.', 'conversion_factor'));
    }
  }
  if (schemaDefinition.domain === 'PRODUCT_UOM') {
    const uomResult = allResults['uom-crosswalk.csv'];
    const allowed = new Set();
    for (const row of uomResult?.rows || []) {
      const status = row.values.mapping_status?.toUpperCase();
      if (!['CONFLICT', 'QUARANTINED', 'REJECTED', 'UNMAPPED'].includes(status)) {
        if (nonEmpty(row.values.source_uom)) allowed.add(normalizeForCompare(row.values.source_uom));
        if (nonEmpty(row.values.target_uom)) allowed.add(normalizeForCompare(row.values.target_uom));
      }
    }
    for (const row of result.rows) {
      for (const field of ['base_uom', 'transaction_uom']) {
        if (nonEmpty(row.values[field]) && !allowed.has(normalizeForCompare(row.values[field]))) addIssue(issues, issue(schemaDefinition, row, REASON_CODES.INVALID_UOM, `${field} is not present in an accepted UOM crosswalk.`, field));
      }
    }
    const baseByProduct = new Map();
    for (const row of result.rows) {
      const key = `${normalizeForCompare(row.values.product_id)}|${normalizeForCompare(row.values.tenant_id)}`;
      if (!key.replace('|', '')) continue;
      const entry = baseByProduct.get(key) || { bases: new Set(), rows: [] };
      entry.bases.add(normalizeForCompare(row.values.base_uom));
      entry.rows.push(row);
      baseByProduct.set(key, entry);
    }
    for (const entry of baseByProduct.values()) if (entry.bases.size > 1) for (const row of entry.rows) issues.push(issue(schemaDefinition, row, REASON_CODES.CONFLICT, 'A product has conflicting base UOM values within one tenant.', 'base_uom'));
  }
  return issues;
};

const manifestIssue = (code, detail, field = '') => ({
  source_record_id: 'owner-data-manifest', domain: 'PACKAGE', reason_code: code,
  reason_detail: detail, field, original_value: '', candidate_value: '', status: 'QUARANTINED', row_number: 0,
});

const validateManifest = (manifest, required = false) => {
  if (!manifest) return required ? [manifestIssue(REASON_CODES.OWNER_DATA_REQUIRED, 'owner-data-manifest.json is required for an intake package.')] : [];
  const issues = [];
  for (const field of OWNER_DATA_MANIFEST_FIELDS) {
    if (!nonEmpty(manifest[field])) issues.push(manifestIssue(REASON_CODES.MISSING_FIELD, `Manifest field ${field} is required.`, field));
  }
  if (nonEmpty(manifest.approval_status) && !APPROVAL_STATUSES.has(`${manifest.approval_status}`.toUpperCase())) issues.push(manifestIssue(REASON_CODES.INVALID_STATUS, 'Manifest approval_status must be PENDING, APPROVED, or REJECTED.', 'approval_status'));
  if (nonEmpty(manifest.version) && !/^\d+$/.test(`${manifest.version}`)) issues.push(manifestIssue(REASON_CODES.CONFLICT, 'Manifest version must be a positive integer string.', 'version'));
  for (const [field, value] of Object.entries(manifest)) {
    if (FORBIDDEN_PATTERN.test(field) || FORBIDDEN_PATTERN.test(value)) issues.push(manifestIssue(REASON_CODES.SENSITIVE_FIELD, 'Credential-like content is not accepted in the manifest.', field));
  }
  return issues;
};

export const validateOwnerData = (files, options = {}) => {
  const domains = [];
  const quarantine = [...validateManifest(options.manifest, options.requireManifest), ...(options.manifestError ? [manifestIssue(REASON_CODES.CONFLICT, 'Manifest is not valid JSON.')] : [])];
  const results = Object.fromEntries(OWNER_DATA_SCHEMAS.map((schemaDefinition) => [schemaDefinition.file, validateSchemaRows(schemaDefinition, files?.[schemaDefinition.file] || '')]));
  for (const schemaDefinition of OWNER_DATA_SCHEMAS) {
    const result = results[schemaDefinition.file];
    const rows = result.rows.length;
    const rowIssues = [...result.issues, ...crossRowIssues(schemaDefinition, result, results)];
    quarantine.push(...rowIssues);
    const mapped = result.rows.filter((row) => ['EXACT', 'AUTO_MAPPED', 'OWNER_APPROVED', 'CONVERTED'].includes((row.values[schemaDefinition.mappingField] || '').toUpperCase())).length;
    const approved = result.rows.filter((row) => row.values.approved?.toUpperCase() === 'TRUE' || row.values.approval_status?.toUpperCase() === 'APPROVED').length;
    const valid = rows - rowIssues.filter((entry) => entry.row_number > 1).map((entry) => entry.row_number).filter((value, index, all) => all.indexOf(value) === index).length;
    const migrationReady = rowIssues.length ? 0 : result.rows.filter((row) => {
      const rowHasError = rowIssues.some((entry) => entry.row_number === row.rowNumber);
      const mappingStatus = (row.values.mapping_status || row.values.status || row.values.approval_status || '').toUpperCase();
      const approval = (row.values.approved || row.values.approval_status || '').toUpperCase();
      return !rowHasError && (mappingStatus === 'EXACT' || mappingStatus === 'OWNER_APPROVED' || mappingStatus === 'AUTO_MAPPED' || mappingStatus === 'APPROVED') && (approval === 'TRUE' || approval === 'APPROVED');
    }).length;
    domains.push({ file: schemaDefinition.file, domain: schemaDefinition.domain, total: rows, valid: Math.max(0, valid), mapped, auto_mapped: result.rows.filter((row) => row.values.mapping_status?.toUpperCase() === 'AUTO_MAPPED').length, owner_approved: approved, quarantined: rowIssues.length ? new Set(rowIssues.filter((entry) => entry.row_number > 1).map((entry) => entry.row_number)).size : 0, rejected: result.rows.filter((row) => row.values.mapping_status?.toUpperCase() === 'REJECTED' || row.values.status?.toUpperCase() === 'REJECTED').length, conflict: result.rows.filter((row) => row.values.mapping_status?.toUpperCase() === 'CONFLICT').length, migration_ready: migrationReady, status: rowIssues.length ? 'QUARANTINED' : (rows ? 'VALIDATED' : 'PENDING') });
  }
  const manifestApproved = !options.requireManifest || `${options.manifest?.approval_status || ''}`.toUpperCase() === 'APPROVED';
  const status = quarantine.length || domains.some((domain) => domain.status === 'QUARANTINED') ? 'BLOCKED' : domains.every((domain) => domain.total > 0 && domain.migration_ready === domain.total) && manifestApproved ? 'MIGRATION_READY' : 'PARTIAL';
  return { status, domains, quarantine, reconciliation: buildReconciliation(domains), manifest: options.manifest || null };
};

const buildReconciliation = (domains) => domains.map((domain) => ({ domain: domain.domain, source_count: domain.total, target_count: domain.migration_ready, match_count: domain.migration_ready, missing_source: 0, missing_target: Math.max(0, domain.total - domain.migration_ready), duplicate: domain.quarantined, conflict: domain.conflict, quarantined: domain.quarantined, difference: domain.domain === 'PAYMENT' || domain.domain === 'DEBT' || domain.domain === 'ACCOUNTING' ? 'OWNER_DATA_REQUIRED' : '' }));

const csvEscape = (value) => {
  const text = `${value ?? ''}`;
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const writeCsv = (file, rows) => {
  const headers = rows.length ? Object.keys(rows[0]) : ['status'];
  fs.writeFileSync(file, `${headers.join(',')}\n${rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')).join('\n')}\n`, { mode: 0o600 });
};

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--input-dir') args.inputDir = argv[++index];
    else if (argv[index] === '--output-dir') args.outputDir = argv[++index];
    else if (argv[index] === '--manifest') args.manifest = argv[++index];
    else if (argv[index] === '--help') args.help = true;
  }
  return args;
};

export const runOwnerDataGate = ({ inputDir, outputDir, manifest: manifestArg }) => {
  if (!inputDir || !outputDir) throw new Error('--input-dir and --output-dir are required.');
  const inputPath = path.resolve(inputDir);
  const outputPath = path.resolve(outputDir);
  if (inputPath === outputPath) throw new Error('Input and output directories must be different.');
  const files = Object.fromEntries(OWNER_DATA_SCHEMAS.map((definition) => {
    const file = path.join(inputPath, definition.file);
    return [definition.file, fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''];
  }));
  const manifestPath = path.resolve(manifestArg || path.join(inputPath, 'owner-data-manifest.json'));
  let manifest;
  let manifestError = false;
  if (fs.existsSync(manifestPath)) {
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
    catch { manifestError = true; }
  }
  const result = validateOwnerData(files, { manifest, manifestError, requireManifest: true });
  fs.mkdirSync(outputPath, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(outputPath, 'owner-data-summary.json'), `${JSON.stringify({ status: result.status, domains: result.domains }, null, 2)}\n`, { mode: 0o600 });
  writeCsv(path.join(outputPath, 'owner-data-quarantine.csv'), result.quarantine);
  writeCsv(path.join(outputPath, 'owner-data-reconciliation.csv'), result.reconciliation);
  return result;
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.inputDir || !args.outputDir) {
    console.log('Usage: node scripts/owner-data-gate.mjs --input-dir <owner-csv-dir> --output-dir <local-report-dir> [--manifest <owner-data-manifest.json>]');
    process.exit(args.help ? 0 : 2);
  }
  const result = runOwnerDataGate(args);
  console.log(`OWNER_DATA_GATE=${result.status}`);
  console.log(`DOMAINS=${result.domains.length}`);
  console.log(`QUARANTINED=${result.quarantine.length}`);
  process.exit(result.status === 'BLOCKED' ? 1 : 0);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
