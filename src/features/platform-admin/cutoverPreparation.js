const TRUE = 'TRUE';
const PAYMENT_DISPOSITIONS = new Set(['KEEP_SEPARATE', 'MERGE', 'REVIEW', 'DO_NOT_POST']);

export const CUTOVER_INPUTS = [
  {
    key: 'identity-input.csv',
    label: 'Identity onboarding',
    description: 'Verified email, invitation and approved initial role for the 13 source identities.',
    requiredHeaders: ['source_identity_id', 'source_company_id', 'source_crosswalk_fingerprint', 'verified_email', 'verification_method', 'initial_role_code', 'invitation_required', 'approved', 'approved_by', 'approved_at', 'approval_reference', 'target_company_uuid'],
    requiredFields: ['source_identity_id', 'source_company_id', 'source_crosswalk_fingerprint', 'verified_email', 'verification_method', 'initial_role_code', 'invitation_required', 'approved', 'approved_by', 'approved_at', 'approval_reference'],
    uniqueField: 'source_identity_id',
  },
  {
    key: 'warehouse-input.csv',
    label: 'Warehouse mapping',
    description: 'Authoritative warehouse master and source-to-target mappings for blocked references.',
    requiredHeaders: ['row_type', 'source_entity_type', 'source_record_id', 'source_company_id', 'source_crosswalk_fingerprint', 'source_warehouse_reference', 'target_warehouse_code', 'target_warehouse_name', 'branch_source_id', 'mapping_basis', 'active', 'approved', 'approved_by', 'approved_at', 'approval_reference', 'target_company_uuid', 'target_warehouse_uuid'],
    requiredFields: ['row_type', 'source_entity_type', 'source_record_id', 'source_company_id', 'source_crosswalk_fingerprint', 'target_warehouse_code', 'target_warehouse_name', 'mapping_basis', 'active', 'approved', 'approved_by', 'approved_at', 'approval_reference'],
    uniqueField: 'source_record_id',
  },
  {
    key: 'inventory-opening-input.csv',
    label: 'Inventory opening balance',
    description: 'Signed final cut-off snapshot; quantity is never inferred by the console.',
    requiredHeaders: ['final_cut_off_at', 'final_snapshot_id', 'final_snapshot_sha256', 'company_source_id', 'warehouse_code', 'product_source_id', 'product_crosswalk_fingerprint', 'unit_code', 'quantity', 'source_snapshot_record_id', 'reconciliation_reference', 'approved', 'approved_by', 'approved_at', 'approval_reference', 'target_company_uuid', 'target_warehouse_uuid', 'target_product_uuid', 'target_unit_uuid'],
    requiredFields: ['final_cut_off_at', 'final_snapshot_id', 'final_snapshot_sha256', 'company_source_id', 'warehouse_code', 'product_source_id', 'product_crosswalk_fingerprint', 'unit_code', 'quantity', 'source_snapshot_record_id', 'reconciliation_reference', 'approved', 'approved_by', 'approved_at', 'approval_reference'],
    uniqueField: 'source_snapshot_record_id',
  },
  {
    key: 'debt-opening-input.csv',
    label: 'Debt opening balance',
    description: 'Approved opening balance at the final cut-off with explicit no-double-count confirmation.',
    requiredHeaders: ['final_cut_off_at', 'final_snapshot_id', 'final_snapshot_sha256', 'company_source_id', 'counterparty_type', 'counterparty_source_id', 'counterparty_crosswalk_fingerprint', 'opening_balance', 'currency_code', 'source_statement_reference', 'no_double_count_payment_confirmed', 'approved', 'approved_by', 'approved_at', 'approval_reference', 'target_company_uuid', 'target_counterparty_uuid'],
    requiredFields: ['final_cut_off_at', 'final_snapshot_id', 'final_snapshot_sha256', 'company_source_id', 'counterparty_type', 'counterparty_source_id', 'counterparty_crosswalk_fingerprint', 'opening_balance', 'currency_code', 'source_statement_reference', 'no_double_count_payment_confirmed', 'approved', 'approved_by', 'approved_at', 'approval_reference'],
    uniqueField: 'counterparty_source_id',
  },
  {
    key: 'payment-collision-decisions.csv',
    label: 'Payment collision decisions',
    description: 'One approved disposition for each of the 36 collision groups; no automatic merge or posting.',
    requiredHeaders: ['final_snapshot_id', 'collision_group_id', 'company_source_id', 'external_reference', 'source_payment_ids', 'source_record_count', 'disposition', 'approved', 'approved_by', 'approved_at', 'approval_reference', 'notes'],
    requiredFields: ['final_snapshot_id', 'collision_group_id', 'company_source_id', 'external_reference', 'source_payment_ids', 'source_record_count', 'disposition', 'approved', 'approved_by', 'approved_at', 'approval_reference'],
    uniqueField: 'collision_group_id',
  },
];

const forbiddenFieldPattern = /(password|passwd|pin|token|private[_ -]?key|secret)/i;

const parseCsvLine = (line) => {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
};

export const parseCsv = (text) => {
  const lines = `${text || ''}`.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim() !== '');
  if (!lines.length) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    return {
      rowNumber: index + 2,
      values: Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] || ''])),
    };
  });
  return { headers, rows };
};

const addError = (errors, message, rowNumber = 0) => {
  if (errors.length < 20) errors.push({ message, rowNumber });
};

const validateCell = (definition, row, field, errors) => {
  const value = row.values[field] || '';
  if (!value) addError(errors, `${field} is required.`, row.rowNumber);
  if (field === 'approved' && value !== TRUE) addError(errors, 'approved must be TRUE.', row.rowNumber);
  if (field === 'invitation_required' && value !== TRUE) addError(errors, 'invitation_required must be TRUE.', row.rowNumber);
  if (field === 'no_double_count_payment_confirmed' && value !== TRUE) addError(errors, 'no_double_count_payment_confirmed must be TRUE.', row.rowNumber);
  if (field === 'verified_email' && value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) addError(errors, 'verified_email must be a valid email address.', row.rowNumber);
  if (field === 'final_snapshot_sha256' && value && !/^[a-f0-9]{64}$/i.test(value)) addError(errors, 'final_snapshot_sha256 must be a SHA-256 hex value.', row.rowNumber);
  if (field === 'quantity' && value && !/^\d+(?:\.\d+)?$/.test(value)) addError(errors, 'quantity must be a non-negative decimal.', row.rowNumber);
  if (field === 'disposition' && value && !PAYMENT_DISPOSITIONS.has(value)) addError(errors, `disposition must be one of ${[...PAYMENT_DISPOSITIONS].join(', ')}.`, row.rowNumber);
  if (field === 'source_record_id' && definition.key === 'warehouse-input.csv' && value === '') addError(errors, 'source_record_id is required for every warehouse row.', row.rowNumber);
};

export const validateCutoverCsv = (filename, text) => {
  const definition = CUTOVER_INPUTS.find((input) => input.key === filename);
  if (!definition) return { status: 'BLOCKED', rowCount: 0, headers: [], preview: [], errors: [{ message: 'Unknown cutover input file.' }] };
  const { headers, rows } = parseCsv(text);
  const errors = [];
  const missingHeaders = definition.requiredHeaders.filter((header) => !headers.includes(header));
  missingHeaders.forEach((header) => addError(errors, `Missing required header: ${header}.`));
  headers.filter((header) => forbiddenFieldPattern.test(header)).forEach((header) => addError(errors, `Sensitive field is not allowed in cutover input: ${header}.`));
  const seen = new Set();
  rows.forEach((row) => {
    const uniqueValue = row.values[definition.uniqueField] || '';
    if (uniqueValue && seen.has(uniqueValue)) addError(errors, `Duplicate ${definition.uniqueField}: ${uniqueValue}.`, row.rowNumber);
    if (uniqueValue) seen.add(uniqueValue);
    if (missingHeaders.length) return;
    definition.requiredFields.forEach((field) => validateCell(definition, row, field, errors));
    Object.entries(row.values).forEach(([field, value]) => {
      if (forbiddenFieldPattern.test(field) || forbiddenFieldPattern.test(value)) addError(errors, 'Sensitive credential-like content is not allowed.', row.rowNumber);
    });
  });
  if (!rows.length) addError(errors, 'At least one input row is required.');
  return {
    status: errors.length ? 'BLOCKED' : 'PASS',
    rowCount: rows.length,
    headers,
    preview: rows.slice(0, 5),
    errors,
  };
};

export const summarizeCutoverPreparation = (files) => {
  const results = CUTOVER_INPUTS.map(({ key }) => files[key]);
  if (results.every((result) => result?.status === 'PASS')) return { status: 'PASS', label: 'Inputs locally valid' };
  if (results.some((result) => result?.status === 'BLOCKED')) return { status: 'BLOCKED', label: 'Input correction required' };
  return { status: 'PENDING', label: 'Awaiting business inputs' };
};
