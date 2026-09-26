# PHASE 3 TARGET MASTER DATA DEPENDENCY

**Mode:** read-only / plan-only. No target master data was created.

## Dependency graph

`TENANT (Company)`
 ↓
`WAREHOUSE`
 ↓
`UOM (UnitOfMeasure)`
 ↓
`PRODUCT`
 ↓
`PRODUCT-UOM (ProductUnit)`
 ↓
`OPENING INVENTORY`
 ↓
`STOCK LEDGER`

## Node status

| Node | Status | Evidence | Blocking condition |
|---|---|---|---|
| TENANT / Company | BLOCKED | Source companies found; target Company UUID/code not verified. | Owner target identity and scope confirmation. |
| WAREHOUSE | BLOCKED | 2,679 operational records; no warehouse master or identity fields. | Official warehouse master and deterministic source mapping. |
| UOM | BLOCKED | Six source labels profiled; target rows not queried. | Owner target UOM identity and conversion/role decisions. |
| PRODUCT | BLOCKED | 36 source products profiled; target tenant/product identity unresolved. | Tenant and target product action/identity. |
| PRODUCT-UOM | BLOCKED | Approved semantics preserved; target UOM IDs/roles unresolved. | Target UOM rows and explicit role/conversion approval. |
| OPENING INVENTORY | BLOCKED | No target warehouse/UOM/product dimensions available. | Approved cutoff snapshot and complete dimensions. |
| STOCK LEDGER | BLOCKED | Target ledger requires concrete product/warehouse/unit IDs. | Master data and replay/opening evidence. |

## Safe order

1. Owner supplies and approves target Company identity.
2. Owner/kho supplies official warehouse master and source-record mapping.
3. Owner approves target UOM rows, roles and only evidenced/approved conversions.
4. Owner approves target Product action and target identity per source product.
5. Build staging-only crosswalk validation; no production writes.
6. Prepare opening inventory only after all dimensions are approved.
7. Prepare stock ledger/replay only after opening and movement evidence pass.

## Service/non-inventory

Observed candidates include `Phí Ship`, `Thùng Xốp` and `Đá`; source usage is not enough to classify them. They remain OWNER_REVIEW and must not be silently transformed.

**TARGET MASTER DATA = BLOCKED**
**PRODUCT MIGRATION = BLOCKED**
**Production/Firebase/PostgreSQL = unchanged; migration/deploy/commit/push = none.
