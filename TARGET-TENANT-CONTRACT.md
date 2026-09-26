# TARGET TENANT CONTRACT

**Read-only contract evidence.** The target schema uses `Company` as the tenant root; no separate `Tenant` model was identified. No target rows were queried and no target data was created.

## Model

Source: `hd-connect-platform/prisma/schema.prisma`, `Company` model around lines 1734-1800.

| Field/relationship | Contract |
|---|---|
| Primary key | `id String @id @default(uuid()) @db.Uuid` |
| Required identity | `code String @unique`, `name String` |
| Status | `status CompanyStatus @default(ACTIVE)`; `deletedAt` supports soft deletion |
| Identity metadata | optional `legalName`, `taxCode @unique`, timezone, currency, locale, business/profile JSON |
| Lifecycle/audit | createdAt, updatedAt, createdBy, updatedBy, deletedBy |
| Product relationship | `products Product[]`; Product.companyId references Company.id with Restrict |
| Warehouse relationship | `warehouses Warehouse[]`; Warehouse.companyId references Company.id with Restrict |
| User/identity relationship | users, invitations, roles, permissions, sessions, refresh tokens, reset tokens and audit logs are company-scoped relations |
| Uniqueness | Company.code globally unique; taxCode also unique when present |

## Mapping rule

Source Firestore company IDs such as `comp_*` are not target UUIDs. Source names are not sufficient to select a target Company. A target mapping is only eligible for review completion when the owner supplies the target Company UUID and code and confirms scope.

**Status:** TARGET TENANT CONTRACT = PASS; TENANT RECONSTRUCTION = BLOCKED pending target identity and owner scope confirmation.
