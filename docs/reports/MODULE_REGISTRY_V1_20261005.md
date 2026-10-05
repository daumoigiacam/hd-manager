# HD Manager - Master Directive v1.0 Registry

Source baseline: `1bd05fc02f3271e37989066ef678bdfd3eb42d80`. Date: 2026-10-05.

The user explicitly confirmed retaining Firebase for this directive. References to HD Platform in the directive are applied to the existing Firebase authority boundary; no backend migration is intended.

The detailed Routes, Screens, Features, Entities, Functions/APIs, Repositories, Stores and Dependencies remain in `MODULE_REGISTRY_20261005.md` and `MODULE_DISCOVERY_SOURCE_INDEX_20261005.json`. This table applies the directive's new category vocabulary and locks the active audit scope. Categories describe the primary responsibility; shared financial/security dependencies remain in the detailed registry.

| Module | Category | Status | Priority |
| --- | --- | --- | --- |
| warehouse_dispatch | INVENTORY | BLOCKED | 1 - active; certification blocked |
| warehouse_import | PURCHASING | BLOCKED | 2 |
| finance | FINANCE | BLOCKED | 3 |
| debt | FINANCE | BLOCKED | 4 |
| orders | SALES | BLOCKED | 5 |
| order_requests | SALES | BLOCKED | 6 |
| payroll | FINANCE | BLOCKED | 7 |
| bank_payments | FINANCE | BLOCKED | 8 |
| identity | SYSTEM | BLOCKED | 9 |
| role_permissions | SYSTEM | BLOCKED | 10 |
| products | MASTER DATA | BLOCKED | 11 |
| pricing | CORE BUSINESS | BLOCKED | 12 |
| customer_portal | SALES | BLOCKED | 13 |
| delivery_reports | LOGISTICS | BLOCKED | After critical modules |
| customers | MASTER DATA | BLOCKED | After critical modules |
| company_attendance | OPERATION | BLOCKED | After critical modules |
| employee_reviews | OPERATION | BLOCKED | After critical modules |
| asset_management | OPERATION | BLOCKED | After critical modules |
| employees | MASTER DATA | BLOCKED | After critical modules |
| price_quotes | SALES | BLOCKED | After critical modules |
| home | REPORTING | BLOCKED | After critical modules |
| executive_dashboard | REPORTING | BLOCKED | After critical modules |
| messages | COMMUNICATION | BLOCKED | After critical modules |
| settings | SYSTEM | BLOCKED | After critical modules |
| billing | SYSTEM | BLOCKED | After critical modules |
| more | SYSTEM | BLOCKED | After critical modules |
| profile | SYSTEM | BLOCKED | After critical modules |

BLOCKED for unstarted modules means the required certification evidence has not been collected. It is not a finding that each module is broken. No module is certified or locked. No next module has been started.
