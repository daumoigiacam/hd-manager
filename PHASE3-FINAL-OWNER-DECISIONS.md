# PHASE 3 FINAL OWNER DECISIONS

This is a plan-only decision pack generated from existing Phase 3 evidence. Owner answers are intentionally blank. No target identity, UUID, approval, conversion or migration record was created.

## How to answer

- Answer only the `owner_answer` column in the CSV or the corresponding decision below.
- Do not change source IDs/names or enter passwords, tokens, keys or connection strings.
- A recommendation is not an approval. Migration remains blocked until the answer is supplied, checked and formally approved.
- `Con` and `Kg` remain independent. Do not enter a fixed `Con ↔ Kg` conversion.

## Priority order

### 1. P3-OWNER-001 — TENANT

**Question:** Which approved target tenant identity/action applies to each of the 11 source companies?

**Affected records:** 11 source companies; see TENANT-EVIDENCE-MATRIX.csv and Tenant sheet

**Evidence:** TENANT-EVIDENCE-MATRIX.csv; TENANT-MAPPING-MATRIX.csv; TENANT-RECONSTRUCTION-PLAN.csv; source scope=11 companies

**Evidence type/status:** FACT source ownership + UNKNOWN target identity; **OWNER_REVIEW**

**Recommended option:** Provide target tenant ID/name and choose KEEP_EXISTING, CREATE_TARGET or OWNER_REVIEW per source company

**Alternative options:** REJECT a source company if it is outside migration scope

**Business impact:** Determines tenant isolation and ownership for every downstream Product, Customer, Order and stock record.

**Risk if wrong:** Cross-tenant data exposure or records assigned to the wrong company.

**Owner answer:** `OWNER_REQUIRED`

**Approval required:** YES

### 2. P3-OWNER-002 — WAREHOUSE

**Question:** What is the official warehouse master and deterministic mapping for the 2,679 operational records?

**Affected records:** 2,679 imports/dispatches/stock-count operational records; source master not found

**Evidence:** WAREHOUSE-EVIDENCE-MATRIX.csv; WAREHOUSE-SOURCE-PROFILE.csv; WAREHOUSE-MASTER-CANDIDATES.csv; warehouse identity fields are absent in the current snapshot

**Evidence type/status:** FACT source master absent + UNKNOWN target warehouse identity; **OWNER_REVIEW**

**Recommended option:** Supply official warehouse master plus source-record-to-warehouse mapping

**Alternative options:** Quarantine records whose warehouse cannot be proven; do not derive warehouses from operational rows

**Business impact:** Controls stock location, inventory balances, dispatch/receipt attribution and tenant isolation.

**Risk if wrong:** Incorrect stock balances, impossible reconciliation or stock assigned to a fabricated warehouse.

**Owner answer:** `OWNER_REQUIRED`

**Approval required:** YES

### 3. P3-OWNER-003 — UOM

**Question:** How should the four unresolved source labels Bao, Bộ, Cái and Chuyến map to approved target UOM identity/type?

**Affected records:** Bao, Bộ, Cái, Chuyến; Con/Kg semantics already remain independent

**Evidence:** UOM-EVIDENCE-MATRIX.csv; UOM-SOURCE-PROFILE.csv; UOM-RECONSTRUCTION-PLAN.csv; labels=Bao|Bộ|Cái|Chuyến|Con|Kg

**Evidence type/status:** FACT source labels + UNKNOWN target UOM identity/type; **OWNER_REVIEW**

**Recommended option:** Provide approved target UOM ID/code, type and tenant scope for each of the four labels; no conversion

**Alternative options:** OWNER_REVIEW or REJECT a label if it is not a valid target UOM

**Business impact:** Defines quantity/weight semantics and ProductUnit validation.

**Risk if wrong:** Incorrect quantities, pricing or inventory movements; especially dangerous if packaging/service labels are treated as stock units.

**Owner answer:** `OWNER_REQUIRED`

**Approval required:** YES

### 4. P3-OWNER-004 — PRODUCT

**Question:** For each of the 36 source products, which target tenant/product action is approved, and are the 24 deterministic code proposals accepted as proposals?

**Affected records:** 36 source products; 24 deterministic code proposals; 12 ambiguous code groups

**Evidence:** PRODUCT-EVIDENCE-MATRIX.csv; PRODUCT-FINAL-OWNER-ACTIONS.csv; PRODUCT-OWNER-DECISION-PACK.csv; source scope=36 products; source IDs=prod_1779104073246|prod_1779104101173|prod_1779104118174|prod_1779104146701|prod_1779104170597|prod_1779104205565|prod_1779104224062|prod_1779104241550|prod_1779104268878|prod_1779104293541|prod_1779104313397|prod_1779104330830|prod_1779104342214|prod_1779104360773|prod_1779104371789|prod_1779104388678|prod_1779104406958|prod_1779104421262|prod_1779104434102|prod_1779104446485|prod_1779104459006|prod_1779104474430|prod_1779104486206|prod_1779104526942|prod_1779104541910|prod_1779104561166|prod_1779104571278|prod_1779104605054|prod_1779104619174|prod_1781562583964|prod_1781656503918|prod_1782399766159|prod_1782399802559|prod_1782977822236|prod_1786785535576|prod_1786785560787

**Evidence type/status:** FACT source fields + INFERRED code proposals + UNKNOWN target identity; **OWNER_REVIEW**

**Recommended option:** Approve one target action per source product; accept deterministic proposals only as non-written proposals; never merge by name

**Alternative options:** KEEP_EXISTING | CREATE_TARGET | OWNER_REVIEW | REJECT per source product

**Business impact:** Determines the authoritative product catalog, tenant ownership and downstream UOM/order/stock references.

**Risk if wrong:** Duplicate products, wrong tenant ownership, broken order history or incorrect stock mapping.

**Owner answer:** `OWNER_REQUIRED`

**Approval required:** YES

### 5. P3-OWNER-005 — PRODUCT

**Question:** How should the 12 ambiguous product code groups be resolved without merging source records?

**Affected records:** 12 source products: prod_1779104118174|prod_1779104224062|prod_1779104313397|prod_1779104388678|prod_1779104526942|prod_1779104571278|prod_1779104605054|prod_1779104619174|prod_1782399766159|prod_1782399802559|prod_1786785535576|prod_1786785560787

**Evidence:** PRODUCT-EVIDENCE-MATRIX.csv; PRODUCT-CODE-PROPOSAL.csv; PRODUCT-OWNER-DECISION-PACK.csv; unresolved IDs=prod_1779104118174|prod_1779104224062|prod_1779104313397|prod_1779104388678|prod_1779104526942|prod_1779104571278|prod_1779104605054|prod_1779104619174|prod_1782399766159|prod_1782399802559|prod_1786785535576|prod_1786785560787

**Evidence type/status:** OWNER_REVIEW; **OWNER_REVIEW**

**Recommended option:** KEEP_SEPARATE and provide an owner-approved code/group decision; the three Vịt Không Móc records stay separate under E1

**Alternative options:** OWNER_REVIEW_CODE_GROUP or REJECT; no automatic merge

**Business impact:** Preserves product identity and stable references for order, dispatch and inventory history.

**Risk if wrong:** Different products may be merged, causing irrecoverable historical ambiguity.

**Owner answer:** `OWNER_REQUIRED`

**Approval required:** YES

### 6. P3-OWNER-006 — PRODUCT-UOM

**Question:** Which target UOM IDs and ProductUnit roles apply to the 36 product relationships?

**Affected records:** 36 Product-UOM relationships; 17 policy rows have approved no-conversion semantics; 19 role rows remain unresolved

**Evidence:** PRODUCT-UOM-EVIDENCE-MATRIX.csv; PRODUCT-UOM-RECONSTRUCTION-PLAN.csv; PRODUCT-OWNER-DECISION-PACK.csv; scope=36 source product relationships; product IDs=prod_1779104073246|prod_1779104101173|prod_1779104118174|prod_1779104146701|prod_1779104170597|prod_1779104205565|prod_1779104224062|prod_1779104241550|prod_1779104268878|prod_1779104293541|prod_1779104313397|prod_1779104330830|prod_1779104342214|prod_1779104360773|prod_1779104371789|prod_1779104388678|prod_1779104406958|prod_1779104421262|prod_1779104434102|prod_1779104446485|prod_1779104459006|prod_1779104474430|prod_1779104486206|prod_1779104526942|prod_1779104541910|prod_1779104561166|prod_1779104571278|prod_1779104605054|prod_1779104619174|prod_1781562583964|prod_1781656503918|prod_1782399766159|prod_1782399802559|prod_1782977822236|prod_1786785535576|prod_1786785560787

**Evidence type/status:** FACT approved policy rows + UNKNOWN target UOM IDs/roles; **OWNER_REVIEW**

**Recommended option:** Provide target UOM IDs and BASE/SALES/PURCHASE/INVENTORY roles; keep poultry CON and KG independent with no fixed conversion

**Alternative options:** OWNER_REVIEW or REJECT an unsupported relationship; only explicitly approved conversions may be entered

**Business impact:** Controls order quantity, purchase quantity, stock quantity and inventory valuation semantics.

**Risk if wrong:** Silent unit conversion errors, incorrect stock or financial totals.

**Owner answer:** `OWNER_REQUIRED`

**Approval required:** YES

### 7. P3-OWNER-007 — NON-INVENTORY

**Question:** Should Phí Ship, Thùng Xốp and Đá be treated as inventory or non-inventory?

**Affected records:** 3 source products: Phí Ship, Thùng Xốp, Đá

**Evidence:** NON-INVENTORY-EVIDENCE-MATRIX.csv; PRODUCT-EVIDENCE-MATRIX.csv; stock/purchase exclusion is not directly proven

**Evidence type/status:** OWNER_REVIEW; **OWNER_REVIEW**

**Recommended option:** Classify each product from stock/purchase business behavior; do not change product type by name alone

**Alternative options:** INVENTORY | NON_INVENTORY | OWNER_REVIEW per product

**Business impact:** Determines whether the records enter stock ledger, purchasing and reconciliation flows.

**Risk if wrong:** Non-stock charges can distort inventory, or physical goods can disappear from stock control.

**Owner answer:** `OWNER_REQUIRED`

**Approval required:** YES

## Final gate

- Before: 93 owner scope records.
- Current: 7 grouped owner questions.
- Final decisions requiring owner: 7.
- AUTO_RESOLVED: 19 field-level evidence assertions; no target approval.
- INFERRED: 24 deterministic code proposals; no target approval.
- OWNER_REVIEW: 50 field-level unresolved rows.
- UNKNOWN: 0 record-level rows; target gaps remain explicitly documented.
- MIGRATION_READY: BLOCKED until all seven decisions, target masters and approvals are supplied/validated.

- Production: UNCHANGED
- Firebase: UNCHANGED
- PostgreSQL: UNCHANGED
- Migration: NONE
- Deploy: NONE
- Commit: NONE
- Push: NONE
