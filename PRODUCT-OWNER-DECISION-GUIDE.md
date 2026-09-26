# Product Owner Decision Guide

This guide is for the 36 Products found in the immutable source snapshot. The source values already filled in the CSV are evidence and do not need to be re-entered:

- `tenant_id`
- `source_product_id`
- `source_name`
- `category`
- `source_unit`
- `source_stock_unit`

## Approved Policy

The following decisions are already approved and are reflected in the CSV:

- Product codes may be generated deterministically by group.
- Live poultry keeps quantity `Con` and weight `Kg` as independent values.
- Processed poultry keeps quantity `Con` and weight `Kg` as independent values.
- By-products preserve the actual Product unit; no automatic conversion is
  applied.
- All three `Vịt Không Móc` source records stay separate. They are not merged.

These approvals do not approve target tenant/Product mapping or database
writes.

## What Still Requires Review

For each CSV row:

1. **Ambiguous code group**: review rows marked `OWNER_REVIEW` in
   `PRODUCT-CODE-PROPOSAL.csv`.
2. **Target mapping**: choose `KEEP_EXISTING_TARGET`, `CREATE_TARGET`,
   `OWNER_REVIEW`, or `REJECT` for each source Product.
3. **Tenant mapping**: approve source tenant to target tenant IDs.
4. **Unit semantics**: resolve the remaining 22 source `unit` versus
   `stockUnit` conflicts where the approved policy does not identify the
   actual source unit.
5. **Conversion**: if a non-identity conversion is required, provide
   numerator, denominator, direction, evidence, and approver. Do not estimate
   weights or yields.
6. **Base/purchase/sales/inventory UOM roles**: complete them only where the
   source group or target contract still requires clarification.

## How To Fill The CSV

Replace only `OWNER_REQUIRED` values. Keep source fields unchanged. Use one row per `source_product_id`. Do not add a row, delete a row, change a source ID, or merge rows.

Required approval fields:

```text
approved_by: full name or approved role
approved_at: ISO-8601 timestamp
owner_decision: APPROVED or REJECTED
```

## Current Evidence Summary

- 36 Products total; 36 active and 0 inactive.
- 0/36 have a populated Product code or barcode.
- 0/36 have a populated source base unit.
- 22/36 have different `source_unit` and `source_stock_unit` values.
- Three records share the name `Vịt Không Móc`; two are in the same source tenant and require explicit duplicate handling.

## Migration Gate

A row is not migration-ready while any required code proposal, base UOM,
unit semantics, tenant/target mapping, conversion approval, or final owner
approval remains unresolved. This pack prepares decisions only; it does not
create target Products, UOMs, UUIDs, conversions, or migration data.
