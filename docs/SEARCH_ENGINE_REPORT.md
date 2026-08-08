# Search Engine Upgrade

## Scope

The shared search service at `src/services/searchEngine.js` provides normalized,
token-based, order-independent search for customers, products, orders/invoices,
and employees. It does not write, rename, migrate, or otherwise change business
data.

## Previous behavior

Search behavior was mixed across `src/App.jsx`. Several customer, debt, order,
and employee searches used one full-string `includes()` check. This made a query
such as `xoai tam` fail for a name containing `Anh Tam Dong Xoai` even though
both words existed in the record. Product lookup had a separate partial helper.

## New behavior

- Normalizes Vietnamese accents, `d/D`, casing, Unicode composition, and spaces.
- Splits a query into independent tokens. Every token must match an exact token,
  a prefix, or a digit sequence in a searchable field.
- Ranks exact full-name/code matches, exact token matches, all-token matches,
  prefix matches, phone numbers, codes, and supporting fields in that order.
- Searches customer name, phone, code, store/company/contact name, address,
  route/area, group, manager, and notes when those fields are available.
- Keeps source data untouched and returns stable ordering when scores tie.

## Firestore and performance

The application already keeps real-time collections in memory, so the new search
performs no Firestore query and creates no per-keystroke document reads. Existing
views retain their 160 ms debounce and chunked rendering where present.

For a future dataset of tens of thousands of customers, the current all-data
real-time subscription should be replaced by a server-maintained normalized token
index and prefix query endpoint. `buildSearchIndexTokens` is supplied for that
future index but is intentionally not persisted by this sprint, preserving the
existing Firestore schema and data.

### Measured local lookup cost

The shared customer search was measured with 10,000 in-memory records and the
multi-token query `tam xoai` over ten runs. Results: minimum **97.24 ms**,
maximum **115.97 ms**, average **100.71 ms**. This is a pure local filter with
zero Firestore reads. Production screens retain their existing debounce where
it was already present; the customer CRM and debt views therefore do not run
the filter for every physical keystroke.

| Check | Before | After |
| --- | --- | --- |
| `xoai tam` against `Anh Tam Dong Xoai` | Full-string `includes()` paths could return no result | One ranked customer result |
| Firestore reads while typing | 0 | 0 |
| 10,000-record multi-token local lookup | Not comparable: old matching did not implement the same semantics | 100.71 ms average over 10 runs |
| Per-key re-render instrumentation | Not collected before this sprint | Not added solely for search; existing debounced/memoized paths are retained |

The timing is an algorithm benchmark, not a full screen-frame benchmark. It is
reported separately to avoid incorrectly claiming a React render improvement
that was not directly measured in a browser profiler.

## Integrated screens

- Customer CRM search and ranking, including aliases, phone, route, manager,
  fixed products, and permitted location text.
- Customer picker used by order requests and manual order creation.
- Main order list and customer order-history search.
- Product management and existing product lookup/picker flows.
- Debt customer list with its existing payment/date filtering preserved.
- Employee attendance list.
- Warehouse dispatch customer/product picker, while preserving its existing
  fuzzy voice-search fallback when a strict token match is unavailable.

Each integration only replaces the local matching and ranking step. Existing
access checks, filters, sort rules, item selection, mutations, and Firestore
subscriptions remain unchanged.

## Verified cases

`tests/search-engine.test.mjs` covers accent-insensitive, whitespace-insensitive,
reordered-token, prefix, phone, code, product, invoice, employee, empty-query,
single-character, and no-result cases.
