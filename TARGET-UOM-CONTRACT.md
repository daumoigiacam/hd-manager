# TARGET UOM CONTRACT

**Read-only contract evidence.** No target UnitOfMeasure or ProductUnit rows were queried or created.

Source: `hd-connect-platform/prisma/schema.prisma`, `UnitOfMeasure` around lines 3111-3151 and `ProductUnit` around lines 4806-4830.

## UnitOfMeasure

- Primary key: UUID.
- Required: companyId UUID, code, name.
- Optional: baseUnitId UUID, symbol, description.
- Conversion fields: conversionNumerator and conversionDenominator, Decimal(18,6), default 1.
- Status: MasterDataStatus, default ACTIVE; deletedAt is supported.
- Tenant scope: companyId relation to Company with Restrict.
- Uniqueness: [companyId, code].
- Indexes: [companyId, baseUnitId], [companyId, status], [companyId, deletedAt].

## ProductUnit

- Required: companyId UUID, productId UUID, unitId UUID.
- Role: ProductUnitRole, default ALTERNATE; supported role enum must be confirmed from target contract before assignment.
- Conversion fields: conversionNumerator, conversionDenominator, optional conversionRule JSON.
- Lifecycle: isDefault, status, deletedAt.
- Uniqueness: [productId, unitId, role].

## Product dependency

Product has optional baseUnitId, purchaseUnitId, salesUnitId and inventoryUnitId, all target UUIDs. Stock ledger records require concrete unitId. Source labels `Con`, `Kg`, `Bộ`, `Cái`, `Bao`, `Chuyến` do not establish target IDs, roles or conversion.

**Status:** UOM SOURCE = PASS; UOM TARGET CONTRACT = PASS; UOM TARGET MAPPING = BLOCKED pending owner-approved target rows and conversion decisions.
