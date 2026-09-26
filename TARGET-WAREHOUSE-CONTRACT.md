# TARGET WAREHOUSE CONTRACT

**Read-only contract evidence.** No target Warehouse rows were queried and no warehouse was created.

Source: `hd-connect-platform/prisma/schema.prisma`, `Warehouse` model around lines 3243-3287.

| Field/relationship | Contract |
|---|---|
| Primary key | `id String @id @default(uuid()) @db.Uuid` |
| Tenant FK | `companyId String @db.Uuid`; required relation to Company with `onDelete: Restrict` |
| Required master identity | `code String`, `name String` |
| Optional ownership | branchId, managerUserId |
| Location | address, provinceId, districtId, wardId, latitude, longitude |
| Type/status | `type WarehouseType @default(MAIN)`; `status WarehouseStatus @default(ACTIVE)`; deletedAt supports soft deletion |
| Operational relations | zones, bins, stock ledgers/balances, batches, reservations, transfers, stock counts, sales/purchase/goods receipt flows |
| Uniqueness | `@@unique([companyId, code])` |

## Reconstruction constraint

The current immutable source snapshot contains 2,679 operational records with companyId but no warehouseId, warehouseName, location, stockLocation or warehouse master file. Those records cannot be converted into warehouse master rows.

**Status:** WAREHOUSE MASTER = NOT FOUND; WAREHOUSE RECONSTRUCTION = BLOCKED; WAREHOUSE_MASTER = OWNER_INPUT_REQUIRED.
