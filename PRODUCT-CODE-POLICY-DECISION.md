# Product Code Policy Decision

Source evidence: immutable Product snapshot `7df19e4f049e1863002b93af37ecf60078044d27ee99dd1c7af3958a23d7e949`.

The snapshot contains 36 Products and no populated Product code, SKU, item code, or barcode. Do not generate or assign codes before owner approval.

## Owner Approval Applied

`A1`: HD Connect may generate deterministic codes by group. This authorizes
proposal generation only. It does not write codes to Product production or
complete target mapping.

The proposal artifact is
`PRODUCT-CODE-PROPOSAL.csv`. For clear source groups it uses a stable group
prefix plus the immutable source Product ID suffix. It is reproducible and
tenant-safe for the current source set; no random value or sequence state is
used.

Products whose category/name does not prove a group remain `OWNER_REVIEW` and
receive no proposed code.

## Owner Decision

The policy choice is approved as Option B. The remaining review is limited to
ambiguous Product group classification and target tenant/Product mapping.

### OPTION A — Owner supplies each code

Provide one stable, tenant-scoped code for every `source_product_id` in `PRODUCT-OWNER-DECISION-PACK.csv`.

### OPTION B — HD Connect generates codes (APPROVED)

Use a deterministic group prefix plus the source Product ID suffix. The exact
proposal is recorded in `PRODUCT-CODE-PROPOSAL.csv`; the proposal is not a
database write and is not a target approval.

### OPTION C — Legacy has no code

Approve how the required VPS `Product.code` will be populated and used before migration. A required target field cannot remain unresolved.

## Approval Record

```text
selected_option: B
format: GROUP_PREFIX + IMMUTABLE_SOURCE_PRODUCT_ID_SUFFIX
collision_policy: SOURCE_PRODUCT_ID_SUFFIX_WITHIN_TENANT
approved_by: OWNER_PROVIDED
approved_at: OWNER_PROVIDED
```

## Gate

`PRODUCT_CODE_POLICY = APPROVED_FOR_PROPOSAL`. Ambiguous group classification,
target tenant mapping, target Product action and final approval remain open.
No Product target creation, UUID generation, or migration is authorized by
this document.
