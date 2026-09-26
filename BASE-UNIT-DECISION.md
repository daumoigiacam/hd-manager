# Base Unit Decision

Source evidence: immutable Product snapshot `7df19e4f049e1863002b93af37ecf60078044d27ee99dd1c7af3958a23d7e949`.

The source has `unit` and `stockUnit`, but no authoritative `baseUnit` or `baseUnitId`. Twenty-two Products have different values in those two fields. The target Product/UOM contract supports base, purchase, sales, and inventory roles; no role is selected here.

## Approved Policy Applied

- `B1` live poultry: base quantity semantics are `Con`; weight is `Kg` as an
  independent measurement.
- `C3` processed poultry: base quantity semantics are `Con`; weight is `Kg` as
  an independent measurement.
- `D1` by-products: preserve the Product's actual source unit semantics. No
  automatic conversion is introduced.

The updated decision CSV records these approved semantics as proposals only.
It does not create `ProductUnit`, `UnitOfMeasure`, or `StockLedger` rows.

## Owner Input Per Product

Complete the corresponding row in `PRODUCT-OWNER-DECISION-PACK.csv`:

| Field | Required owner input |
|---|---|
| `product_code` | Stable target code, under the approved code policy |
| `base_unit` | Approved base UOM for this Product |
| `unit_semantics_decision` | For mismatches, identify transaction/sales UOM and inventory UOM; state whether both are retained |
| `target_product_decision` | `KEEP_EXISTING_TARGET`, `CREATE_TARGET`, `OWNER_REVIEW`, or `REJECT` |
| `owner_decision` | Final row decision after code, UOM and target decisions are complete |
| `approved_by` | Named approver |
| `approved_at` | Approval timestamp |

For Products whose group is still ambiguous, or whose source `unit` and
`stockUnit` conflict without an approved actual-unit interpretation, owner
review remains required. If multiple UOMs are needed, also provide approved
roles:

```text
base_uom: OWNER_REQUIRED
purchase_uom: OWNER_REQUIRED
sales_uom: OWNER_REQUIRED
inventory_uom: OWNER_REQUIRED
conversion_numerator: OWNER_REQUIRED
conversion_denominator: OWNER_REQUIRED
conversion_direction: OWNER_REQUIRED
```

Do not infer `con = kg`, `bao = kg`, or `thùng = kg`. The approved poultry
policy explicitly keeps quantity and weight independent; it does not create a
conversion such as `1 con = X kg`.

## Gate

`BASE_UNIT = PARTIAL`. Approved live/processed semantics are recorded, while
ambiguous Product groups, conflicting source unit semantics, target mapping,
and any non-identity conversion remain unresolved. No UOM or ProductUnit is
created by this document.
