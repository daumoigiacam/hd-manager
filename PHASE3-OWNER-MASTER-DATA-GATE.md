# PHASE 3 OWNER MASTER DATA GATE

## Purpose

This gate records the readiness of the owner input form. It does not create target master data and does not run migration.

## Source Artifacts Used

- `TENANT-RECONSTRUCTION-PLAN.csv`
- `WAREHOUSE-MASTER-CANDIDATES.csv`
- `UOM-RECONSTRUCTION-PLAN.csv`
- `PRODUCT-UOM-RECONSTRUCTION-PLAN.csv`
- `PRODUCT-FINAL-OWNER-ACTIONS.csv`
- `PHASE3-OWNER-DECISIONS-NEXT.csv`

## Owner Form

- Workbook: `PHASE3-OWNER-MASTER-DATA-FORM.xlsx`
- Sheets: `Instructions`, `Tenant`, `Warehouse`, `UOM`, `Product`, `Product UOM`, `Non Inventory`, `Approval`
- Current evidence carried into the form: 11 source companies, 36 source products, 2,679 warehouse operational records, and 6 source UOM labels.
- Source IDs, source names, source units, and other source evidence are preserved as read-only context.
- `OWNER_REQUIRED` marks an input that must be replaced or completed by the owner. It is not production data and is not a target UUID.

## Gate Status

| Gate | Status | Evidence | Required before migration readiness |
|---|---|---|---|
| TENANT | BLOCKED | 11 source companies are present; target action, target tenant identity, owner note, and approval are unfilled. | Owner confirms `KEEP_EXISTING`, `CREATE_TARGET`, or `OWNER_REVIEW` for every source company and approves the result. |
| WAREHOUSE | BLOCKED | Source warehouse master identity is unavailable; the form provides 10 owner declaration rows marked `OWNER_REQUIRED`. | Owner/kho team supplies every real warehouse, tenant, type, location, active state, and approval. |
| UOM | BLOCKED | 6 source UOM labels are present; target UOM identity, type, decision, conversion policy, and approval are unfilled. | Owner confirms target UOM mapping and conversion policy without inventing conversions. |
| PRODUCT | BLOCKED | 36 source products and proposed-code context are present; final code, target action, owner decision, note, and approval are unfilled. | Owner approves each product action and final code; no duplicate code or unapproved merge. |
| PRODUCT-UOM | BLOCKED | Product/UOM rows are prepared from the reconstruction plan; role, owner decision, and approval remain unfilled. Poultry CON/KG rows are kept independent without fixed conversion. | Owner approves roles and any explicitly allowed conversion. |
| NON-INVENTORY | BLOCKED | 3 candidate products are listed: `Thùng Xốp`, `Phí Ship`, and `Đá`; classification and approval are unfilled. | Owner classifies each item and approves the result. |
| OWNER APPROVAL | BLOCKED | Section approval summary is present but not approved. | All section approvals and the overall gate are explicitly approved. |

## Validation Rules

The completed form must be rejected if any of the following is true:

- an `OWNER_REQUIRED` or required owner field remains unresolved;
- a source ID or source name has been changed;
- a conversion is negative or zero;
- a target product code is duplicated;
- a warehouse is duplicated within a tenant;
- a UOM is duplicated;
- a merge is not explicitly approved;
- a tenant mapping is inconsistent with the source tenant;
- any section has missing approval, quarantine, conflict, missing target, or tenant mismatch.

The form must not contain passwords, API keys, tokens, private keys, connection strings, or other secrets.

## Final Gate Rule

`MIGRATION_READY = PASS` is allowed only when all of the following are true:

```text
TENANT = READY
WAREHOUSE = READY
UOM = READY
PRODUCT = READY
PRODUCT-UOM = READY
NON-INVENTORY = READY
OWNER APPROVAL = PASS
```

Until then:

```text
MIGRATION_READY = BLOCKED
```

## Safety Status

- Production PostgreSQL writes: NONE
- Production Firebase/Firestore writes: NONE
- Migration: NONE
- Deployment/restart: NONE
- Commit: NONE
- Push: NONE

## Current Conclusion

`OWNER FORM = READY FOR OWNER`

`MIGRATION_READY = BLOCKED — owner master-data input and approvals are not yet supplied.`
