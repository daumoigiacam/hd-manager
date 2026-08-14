# Customer Messaging Improvement Report

## Scope

This change improves only the customer account inbox, notifications, and customer-to-sales chat. It reuses the existing `messages` and `notifications` collections. No new backend service, dependency, payment flow, order calculation, or business data model was introduced.

## Previous implementation

- `CustomerPortalView` in `src/App.jsx` displayed customer messages in a large popup sheet.
- The customer portal filtered already-loaded message and notification arrays in the UI.
- The previous approach did not enforce the full customer inbox scope as part of the realtime query and did not give the customer a conversation-list experience.

## Implemented customer inbox

- The customer message button now opens a dedicated inbox screen instead of the previous popup sheet.
- The inbox shows a conversation list, preview, latest timestamp, unread badge, category icon, and an individual conversation view.
- Customer-to-sales messages use the existing `messages` collection with `conversationType: customer_support`.
- Existing customer notifications use the existing `notifications` collection with `recipientType: customer`.
- Supported notification category labels include order, payment, payment reconciliation, debt, price, delivery, system, and sales chat.
- Opening an inbox item writes only the permitted read-state fields and immediately updates the unread badge.
- Sending a customer message takes its `companyId` and `customerId` from the authenticated customer session, not from caller-supplied form data.

## Realtime scope and performance

- Customer realtime inbox subscriptions are bounded to two collections: `notifications` and `messages`.
- Each inbox query requires the authenticated tenant and customer scope:
  - Notifications: `companyId`, `customerId`, `recipientType: customer`, newest 100 records.
  - Messages: `companyId`, `customerId`, `conversationType: customer_support`, newest 100 records.
- This prevents a customer inbox listener from subscribing to tenant-wide customer messages or notifications.
- Conversation grouping is derived on the client only after the already-scoped realtime result is received.

## Firestore security enforcement

The customer rules now require all customer inbox operations to match the Firebase custom-claim `companyId` and `customerId`.

- A customer may read only own `notifications` with `recipientType: customer`.
- A customer may read only own `messages` with `conversationType: customer_support`.
- A customer may create only own customer-portal messages with an allowed customer message type.
- A customer cannot create notifications.
- A customer may update only own read-state fields; it cannot edit message content, snapshots, ownership, or notification payloads.
- Employee and company-side paths remain outside this customer-specific rule path.

## Required Firestore indexes

The following composite indexes were added to `firestore.indexes.json` and must be deployed together with `firestore.rules` before the new customer inbox is enabled in production:

1. `notifications`: `companyId`, `customerId`, `recipientType`, `createdAt DESC`.
2. `messages`: `companyId`, `customerId`, `conversationType`, `createdAt DESC`.

## Files changed for this scope

- `src/App.jsx`
- `src/utils/customerMessaging.js`
- `firestore.rules`
- `firestore.indexes.json`
- `tests/customer-messaging.test.mjs`
- `tests/firestore-customer-messaging-rules.test.mjs`
- `package.json`

## Verification performed

| Check | Result |
| --- | --- |
| Customer UI data-scope and read-state unit tests | PASS |
| Existing customer portal security tests | PASS (8 tests) |
| Firestore Rules direct read and scoped-query tests | PASS |
| Customer A/B isolation | PASS |
| Customer message creation authorization | PASS |
| Customer read-state authorization | PASS |
| Realtime scoped listener test | PASS |
| Customer messaging Rules test suite | PASS (6 tests) |
| Targeted ESLint | PASS |
| Production build (`npm.cmd run build`) | PASS |

The Firestore Emulator was run from an ASCII-only temporary workspace junction because the local Java Emulator could not read the Vietnamese workspace path correctly. This did not change repository data or production data.

## Test coverage details

The Rules suite verifies that customer A can access its own scoped notification and message records, but cannot directly read, query, create, or update customer B records. It also verifies that a realtime listener for customer A receives a new A record and does not expose a B record.

The UI utility suite verifies exact customer ownership, exclusion of internal and generic tenant notifications, unread detection, permitted read patches, and a customer sales conversation when a responsible contact is available.

## Compatibility and remaining risks

- Legacy notification/message records that do not have `companyId`, `customerId`, the required inbox type, or `createdAt` are intentionally excluded from the new scoped inbox. They are not silently backfilled or reassigned.
- The new composite indexes and Rules have not been deployed in this task. Production must deploy both together; deploying Rules without the indexes can cause scoped ordered queries to fail until indexes are ready.
- No production customer account or human mobile-browser end-to-end scenario was performed in this task. Automated unit, Rules Emulator, lint, and production build checks passed.
- A customer sales message can be sent only when the customer profile has a responsible-sales contact. Profiles without a reliable responsible employee mapping need normal business-data setup before a meaningful recipient route is available.

## Completion state

Code validation for the scoped customer inbox is complete. No commit, push, deploy, data migration, or production Rules/index deployment was performed.
