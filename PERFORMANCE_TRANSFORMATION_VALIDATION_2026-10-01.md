# HD Manager performance transformation validation

Date: 2026-10-01, Asia/Saigon. Resumed after the power interruption.
Source base: `67bb1ffe8bae636014f4761441259b0b18587118` plus the preserved working-tree changes. No unrelated changes were reverted.

## Acceptance Decision

**Verified local/browser/emulator scope; NOT full production acceptance.** The reproduced save, render, queue and keyboard defects below were fixed and tested. The final installed-APK run finished with exit code 0, 243 samples, no assertion failures and no page errors. This does not satisfy the mandatory authorized isolated real-cloud Firebase gate or prove complete UI CRUD coverage for all 22 modules.

No production deployment, production data access, production database/rules change, VPS change, secret copying, Flutter migration or production APK/AAB release was performed. The installed APK is a separate debug-only acceptance package, `com.hdmanager.app.acceptance`, with synthetic data. It must not be distributed as a production app. Local SDK tests wrote only to the Firestore emulator.

This report supersedes the outstanding issues in the September 30 reports where the new evidence below explicitly demonstrates a fix. It does not erase their raw results or convert their unmeasured boundaries into PASS.

## Root Causes And Fixes

| Root cause | Evidence | Fix | Regression evidence / result |
| --- | --- | --- | --- |
| Customer/debt calculations repeatedly scan orders and payments during unrelated root updates, including request-price saves | Retained request-price CPU profiles; 1,800 orders and 900 payments; earlier profiled root render average 103.22 ms | Collection-identity-based ledger indexes; parse dates once per index; reuse lookups without changing full-dataset totals | `customer-ledger-index.test.mjs`; final profiled request-price root render average 12.58 ms. This is a chronological comparison, not a controlled device SLO |
| Long order/customer/finance views construct thousands of DOM nodes | Earlier order view: 1,802 cards / 50,820 DOM nodes | Paginate rendered rows, not the business dataset; retain full totals and full search/filter input | 50 visible cards / 1,805 nodes in retained after run; last-page order checks and finance totals remain correct |
| Pricing editors can receive older realtime/ACK props while a newer local revision is being edited | Actual-handler regression tests reproduce stale revisions and overlapping saves | Draft-revision guards and synchronous submit locks; ACK patches only the acknowledged document | `save-integrity-regressions.test.mjs`; five price edits persisted and survived reload in every final runtime |
| Blur or IME resize between press and release moves the command away from the pointer | Retained native event traces include pointerdown on BUTTON and pointerup on DIV; failed Save did not reach the handler | Shared command-focus guard prevents premature blur, captures the active pointer, then blurs after the real React command. Inline delivery toggles intentionally retain input focus | Unit tests plus real browser press/resize/release regression; 18 final native keyboard/layout captures PASS |
| Clearing a successful form can allow the second click of a double submit to hit a reset form | Delivery save/error-state regression and double-click UI checks | Guard duplicate submit clicks after the first form changes; retain intentional repeat actions such as steppers; handler-level locks and command IDs remain authoritative | Double-submit assertions check exactly one customer, expense, delivery command or payment, not just a hidden form |
| Modal height and keyboard offset were previously published in separate frames; tiny native width rounding reset the stable baseline | Installer-level unit tests; native width changes of 1-2 px; retained wrong portrait restoration | One shared RAF viewport update; distinguish stable app height from visible modal height; tolerate native rounding without ignoring actual orientation changes | `keyboard-viewport.test.mjs`; shell stays about 891 px during IME, actions follow the visible 555 px viewport, then restore to 891 px |
| The create-customer child page and normal app scrollport can extend underneath IME | Native failed save and geometry: stable root about 891 px, visible viewport about 555 px | Shared child-page header/body/actions frame; bounded app-content scrollport; one primary body scroll; remove inherited child margins that added extra height | Customer page screenshots at nine widths; real native text/phone keyboard Save and dismiss PASS |
| UI timeout can release a write lock while the real SDK request is still in flight | Deferred-promise tests reproduce overlapping writes after a UI deadline | Keep the lock until actual SDK completion; communicate pending state rather than inventing success; rollback only the rejected revision | Timeout, newer-revision, rejected-write and permanent-error tests PASS |
| Retry can replay monetary side effects or overwrite notification read/sent state | Replayed command, permission denial, competing delivery decision and later-edit tests | Durable command IDs; atomic groups; conditional create/replay; finite automatic retries; tenant/actor-scoped queue; visible manual retry/error state | Actual SDK emulator atomic rollback/idempotency checks plus local queue/source-handler tests PASS |
| Linked asset/delivery cashflows were not safely decoupled from the primary save | Partial-failure and duplicate-command fixtures | Submit linked records as one durable monetary command; reject conflicting replay; protect later order edits | Asset cost/expense and delivery/report/payment/expense rollback verified with actual SDK; final native compound-save UI checks PASS |
| Quote bulk-save could describe queued work as server-confirmed success and accept overlapping apply commands | Actual extracted bulk handler with queued, confirmed and denied receipts | Aggregate receipts and report saved-locally/pending accurately; synchronous batch apply lock | Queued/confirmed/denied/double-submit tests; five native quote applications PASS |
| A cached resolved Promise still entered the React.lazy retry path on module return | Preload/lazy unit tests and retained navigation evidence | Shared preloadable module with a cached public thenable and explicit rejection handling | `preloadable-module.test.mjs`; all 22 warm module opens below 300 ms in the final four runtime/viewports |
| Share encoding work can monopolize the main thread or duplicate in-flight preparation | Worker/fallback pixel comparisons and invoice edit/cache integration | Join existing cache preparation; invalidate by content revision; encode canvas commands in a worker when available, preserving native/HTML fallback | Pixel mismatches 0, identical 14,351-byte PNG outputs, four PDF page inputs; invoice edit/persist/reload and QR decode checks PASS |

Earlier shared fixes remain in place: reused number formatters, no closed-search data preparation, conservative equal-snapshot reference retention, build-scoped report caches, one verified durable queue write instead of two, frozen off-route report props, and lazy list image decoding. Tests retain validation, permissions and the financial calculation dataset.

Removed code: 34 unreachable order-view UI lines, not order business logic or data. The Node-only customer messaging test's ineffective WebChannel long-polling settings and misleading comments were removed. No working business feature, business data or active permission was deleted to obtain a faster result.

## Measurement Boundaries

- UI timing starts at a captured DOM interaction event and ends after the expected DOM state and two animation-frame opportunities. It excludes automation positioning and pre-event ADB transport time. It is not a compositor-paint/FPS metric, cold data readiness, or a remote server ACK.
- Final UI fixtures retain 600 generated products, 360 generated customers plus the selected customer, 1,800 orders, 900 payments and one controlled request-price record, with normal preview seed records. Fixture counts are stored in each summary. These runs do not demonstrate thousands of order requests or production concurrency.
- Five samples per ordinary action are small samples; empirical p95 equals the maximum. Single/triple-sample cases are marked in the raw summaries. No population p95 or universal response-time guarantee follows from these numbers.
- Final full UI runs disable the React render profiler. Their summary render value of 0 means **not instrumented**, not zero rendering.
- SDK-operation counts count wrapped operations, not HTTP requests. Local mock durations are not network/TTFB/database durations.
- Native ordinary locator interactions are trusted CDP browser events in the installed WebView. Request-create commands and pricing-rule saves use actual Android `adb shell input tap`, with enabled/occlusion checks. IME, rotation and Back use actual Android controls. Double-click tests in WebView must not be represented as comprehensive physical-finger double-tap coverage.
- Native deletion timings include native confirmation XML capture/read/tap automation. Their whole measured durations are retained; they cannot be used as post-confirmation app latency.

## Before / After

| Measurement | Before | Intermediate / after | Boundary |
| --- | ---: | ---: | --- |
| Request-price save average / max | 305.50 / 352.60 ms | 268.70 / 303.70 ms after ledger work; 61.62 / 68.90 ms in final profiled run | Android emulator Chrome, React production profiling, same fixture counts. Chronological runs, not a randomized paired experiment; earlier CPU profiles are retained separately |
| Request-price root React average | 103.22 ms | 77.12 ms intermediate; 12.58 ms final | Root commits beginning inside the captured interaction window only; layout/paint not included |
| Wrapped SDK operations during request-price save | maximum 2 | maximum 1 | Earlier overlapping `setDoc` and `runTransaction`; final `setDoc`. Not proof of the HTTP request count or attribution of all overlapping work |
| Request-price SDK operation, first sample | `setDoc` 58.6 ms plus later `runTransaction` 18 ms | `setDoc` 22.7 ms | Isolated preview backend only; no real API duration claimed |
| Format 6,000 amounts, median | 84.59 ms | 1.85 ms | Retained Node actual-helper benchmark |
| Closed search preparation, 9,000 rows | 53.25 ms | below 0.01 ms | Retained actual-helper benchmark; no work while closed |
| Dashboard build, 6,000 orders / 1,200 customers | 256.20 ms | 58.11 ms | Retained Node benchmark; financial parity tests |
| Equal 6,000-row snapshot, including fixture clone | 9.18 ms | 15.01 ms | Comparison costs more CPU; avoids downstream invalidation. Tradeoff retained, not hidden |
| Durable enqueue storage writes | 2 | 1 | Verified write/readback retained |
| Keyboard restoration / clipped Save | Lost presses and incorrect/clipped geometry in retained failures | Final native 18 captures PASS; shared press/resize/release regression PASS | Actual Android emulator IME plus separate browser simulation, not real iOS |

Profile artifacts: `test-results/full-interaction/zero-request-before`, `zero-ledger-after`, and `resume-final-profile-request-ready`. The final profiled targeted run has 15 samples, zero failures/errors and exit code 0. Its first setup attempt, `resume-final-profile-request`, failed before measurements because emulator Chrome was not running; it is not counted as a measured result.

### Final Warm UI Runs

| Runtime / viewport | Samples | Warm navigation maximum | Assertion / page failures |
| --- | ---: | ---: | --- |
| Installed debug APK / Capacitor WebView | 243 | 104.0 ms | 0 / 0; process exit 0 |
| Android emulator Chrome | 243 | 116.4 ms | 0 / 0; process exit 0 |
| Desktop Chrome, mobile viewport | part of 486 combined | 48.9 ms | 0 / 0 |
| Desktop Chrome, desktop viewport | part of 486 combined | 46.6 ms | 0 / 0; combined process exit 0 |

Raw directories: `resume-native-final-adb`, `resume-accepted-android-chrome`, `resume-accepted-browser`, under `test-results/full-interaction/`. They use the final production-source preview bundle in `resume-pointer-native/app`. Later changes affect only test controls, test isolation and this report, not that app bundle.

### Final Installed-APK Save Results

| Action | Samples | Mean / maximum ms | Maximum wrapped SDK operations |
| --- | ---: | ---: | ---: |
| Product edit | 5 | 68.84 / 75.1 | 1 |
| Request-price edit | 5 | 38.48 / 53.9 | 1 |
| Product create | 5 | 259.46 / 279.0 | 1 |
| Employee profile edit | 5 | 33.48 / 42.6 | 1 |
| Customer create, double-click guard | 3 | 96.93 / 112.1 | 1 |
| Customer edit | 3 | 87.47 / 96.3 | 1 |
| Request create, actual Android taps | 5 | 75.28 / 83.1 | 1 |
| Finance edit | 5 | 65.98 / 75.2 | 1 |
| Expense create, double-click guard | 3 | 111.97 / 133.3 | 1 |
| Quote bulk price apply | 5 | 98.78 / 176.3 | 1 |
| Pricing-rule save, actual Android taps | 5 | 84.90 / 87.1 | 1 |
| Warehouse import with linked expense | 5 | 172.40 / 185.6 | 2 |
| Asset create | 1 | 40.00 / 40.0 | 1 |
| Asset cost with linked expense | 5 | 56.30 / 82.8 | 1 |
| Delivery report/cashflows, double-click guard | 3 | 62.20 / 70.1 | 1 |
| Standalone delivery expense | 1 | 47.70 / 47.7 | 1 |
| Debt payment, double-click guard | 5 | 70.46 / 105.1 | 1 |
| Product archive, including native confirmation automation | 5 | 2,395.28 / 2,483.5 | 1 |
| Customer archive, including native confirmation automation | 3 | 4,541.27 / 4,572.3 | 1 |

Do not hide Android Chrome outliers: product-create maximum 534.7 ms, product archive 420.7 ms, customer create 527.8 ms, expense create 410.6 ms, pricing-rule save 366.5 ms and warehouse compound save 422.2 ms. These isolated completion observations are below one second but do not satisfy an all-actions-below-300-ms claim. No server-latency guarantee is made.

## Android, Keyboard And Sharing

Device: authorized `emulator-5554`, Pixel_7_Pro AVD, Android 17 x86_64, 16 KB page size, software GPU. This is not a Samsung physical-device result and does not prove release-signature/cold-start behavior.

Final `native-keyboard.json`: 18 PASS captures. Portrait shell about 891 px; text/number IME keeps shell about 891 px while modal/actions fit 555 px visible height; dismiss and portrait restoration return actions to 891 px. Landscape actions bottom 376.14 px fits 411.43 px visible height. Customer child-page actions bottom 795 px normally and 555 px during IME. Price modal actions bottom 450.63 px fits 555.43 px IME viewport. Body scrolling stays locked for modal captures. Native safe top/bottom in the final capture are 42/24 px.

Additional actual-tap checks: 15 request-create rounds / 30 measured samples in `resume-native-adb-choice`, no failures/errors, exit 0; five pricing-rule saves in `resume-adb-pricing-final`, mean 81.16 ms, max 87.1 ms, exit 0. Values are checked in persisted storage, not only visible input text.

Native sharing smoke PASS: PNG, CSV and text each opened the Android chooser and were cancelled. No external recipient received a message in this test. Actual Zalo/email/other-recipient delivery success remains unverified and cannot be guaranteed by a chooser test.

Share encoding PASS: worker/native/blocked-worker HTML fallback produced matching pixels, zero mismatches, 14,351-byte PNGs and four PDF page inputs. Browser invoice integration verifies edit/save, cache invalidation, prepared share content/QR decoding and reload. Its share API is mocked, so that test is not native recipient-delivery evidence.

### Retained Failed Runs And Harness Boundaries

- Earlier native runs reproduced real clipping, pointer-release and delivery duplicate-submit defects. Their screenshots/traces remain available; they were not removed from the evidence.
- `resume-native-final-exit`: 236 samples and one request customer-choice timeout with CDP mouse input. Not counted as PASS. Real Android-tap request creation subsequently passed 15 rounds and the full final 243-sample run. The test controls now use Android input for this flow; this is not evidence that every possible WebView/CDP input anomaly is fixed in app code.
- `resume-native-choice-trace`: interrupted during product choice. Android system log explicitly says `stop com.google.android.webview due to killDueToPackageUpdate` and kills the acceptance process. It is an OS WebView package-update interruption, not an observed application Java exception. Logs are retained in `resume-native-choice-system.log` and `resume-native-choice-crash.log`.
- The emulator crash log also contains repeated unrelated `android.hardware.uwb-service` crashes. These are not relabeled as HD Manager crashes or silently removed. They limit extrapolation from this Android 17 emulator to real-device stability.
- An earlier successful 243-sample native run wrote its complete summary but its Playwright Android input driver kept the runner alive. Only the identified audit processes were stopped. Switching that helper to ADB shell input subsequently produced normal exit 0 in targeted and final full runs. The old forced-cleanup run is not the final process-exit result.

## Actual Firestore SDK Evidence

Local emulator 1.20.4, `127.0.0.1:8180`, English locale for the Java process only. Repository security rules unchanged. Two actual SDK clients verify create/edit and server readback for ten collections. Each collection has three create and three edit samples. This exercises SDK persistence/rules, not every module's complete UI workflow.

| SDK target collection | Create median / max ms | Edit median / max ms |
| --- | ---: | ---: |
| customers | 15 / 172 | 18 / 34 |
| products | 9 / 10 | 11 / 11 |
| orders | 7 / 9 | 7 / 10 |
| orderRequests | 7 / 8 | 7 / 8 |
| warehouseImports | 6 / 6 | 7 / 7 |
| warehouseDispatches | 6 / 7 | 8 / 8 |
| expenses | 6 / 9 | 6 / 7 |
| payments | 6 / 6 | 6 / 7 |
| deliveryReports | 5 / 5 | 5 / 5 |
| employees | 5 / 5 | 4 / 5 |

Emulator checks PASS: offline latest revision retained; reconnect confirmation 19 ms in this fixture; coalesced replay equals sequential writes; wrong-tenant writes denied; grouped invoice/payment/expense rejection rolls back; asset-cost/expense rollback; delivery compound/penalty rollback; competing delivery decisions rejected; replay preserves later order edits; conditional payment replay preserves read/sent status; command ID reused with another payment amount rejected.

Rules/identity suites PASS: payroll 19 cases, tenant isolation 14, employee/customer messaging 8, customer messaging 6, identity recovery integration. The customer messaging test initially had a gRPC Listen error and a later retry exposed leftover realtime fixture records. Minimal unrestricted and authenticated production-rule-shaped local listeners both passed. The test now clears only its own emulator project data before seeding; three consecutive complete runs passed without increasing timeout or removing the realtime assertion. A production transport fix is not claimed from this result. Node long-polling settings were ineffective: [Firebase transport documentation](https://firebase.google.com/docs/reference/js/v8/firebase.firestore.Settings) states that the setting does not work in Node.js.

### Network Timing Report Limits

| Required field | What is actually available |
| --- | --- |
| Request / method | Wrapped SDK operation names such as `setDoc`, `runTransaction`, atomic commit; not a complete transport-request inventory |
| Endpoint | Emulator host and collection/document paths; exact gRPC/HTTP request endpoints not captured per operation |
| Duration / status | Local SDK promise durations above; successful readback and expected permission-denied assertions |
| Payload / response size | Not captured per real-cloud save |
| Retry count | Queue control-flow retry tests; SDK transport retry count not captured |
| TTFB | Not captured |
| Database / server duration | Unknown; no server timing measurement supplied |
| Real Firebase UI/API/render trace | BLOCKED: no authorized isolated cloud tenant/config was provided; production credentials/data were not substituted |

Do not infer zero network time from preview storage, and do not infer production backend performance from localhost emulator timings. No database index/schema change was made without profiling evidence.

## 22-Module Coverage Matrix

Every module has five final warm opens in each runtime/viewpoint. READ/navigation PASS is not full CRUD PASS. The last column identifies the unverified UI/external boundary rather than inventing coverage. For read-only/derived modules, arbitrary CRUD is not a meaningful action.

| Module | Exercised UI / actual source tests | SDK / security evidence | Remaining unverified boundary |
| --- | --- | --- | --- |
| 1 Home and detailed reports | Warm opens, financial visual/filter suite, full-dataset report parity | Read/source calculation tests | Cold cloud readiness; all real-company periods and phone FPS |
| 2 Order requests | Native create, customer/product picker, price edit, local persistence/reload, UX/share source tests | Actual orderRequests create/edit/readback | Full UI delete/cancel matrix; real-cloud save/share |
| 3 Orders and invoices | Full 1,800-order dataset / last-page check; create FAB; browser invoice edit/cache/QR/reload integration | Actual orders create/edit/readback; grouped monetary rollback | Full manual create/delete/payment UI matrix in native and cloud |
| 4 Warehouse dispatch | Warm opens, grouped-row visual test; actual-handler save/bulk/price/inventory tests | Actual warehouseDispatches create/edit/readback | Full native create/edit/delete/shortage/filter matrix |
| 5 Delivery | Native report with linked cashflows and duplicate click, standalone expense; source reconciliation/decision tests | Actual deliveryReports persistence and compound rollback | Device uploads, real dispatch/photo/GPS service and full CRUD |
| 6 Warehouse inventory | Native imports with linked expense, five persisted rounds; unit/inventory tests | Actual warehouseImports persistence; generic atomic helper tests | Full native edit/delete/count workflow and cloud concurrency |
| 7 Customers / suppliers | Customer create/edit/archive, duplicate click, search; nine-width create-page and supplier directory tests | Actual customers persistence; tenant/customer authorization | Full supplier CRUD; real contact permission/provider |
| 8 Debt | Native payment create/replay, exact one record; ledger/reconciliation tests | Payment persistence and conditional retry/read-status checks | Full payment edit/delete UI; real bank confirmation |
| 9 Income / expenses | Native payment edit and expense create, duplicate click, pagination totals | Actual expenses/payments persistence; atomic rules denial | Complete approval/delete matrix and cloud ACK timing |
| 10 Banking | Warm read view; reconciliation and bank-deeplink source tests | Payment/security contract tests | Actual external bank/API/webhook delivery |
| 11 Messages | Browser four-tab/search/notification UI; warm native view | Employee/customer rules and actual customer realtime listener | Full native send/edit/delete/media/group UI and real remote recipient |
| 12 Pricing | Five actual-tap rule saves; persisted/reload checks; input/purchase/sale unit tests | Save/draft/queue actual-handler tests | Full rule combinations and cloud concurrency |
| 13 Attendance | Warm roster view, company-wide roster and payroll-source tests | Payroll/permission tests | Actual GPS/WiFi permission, device check-in/out; no fake sensor PASS |
| 14 Employee reviews | Warm view; evaluation/automation/criteria source tests | Rules/authorization source checks | Full review criteria/create/edit/delete UI and cloud automation |
| 15 Assets | Native create, five cost/linked-expense saves | Actual SDK atomic cost/expense rollback | Full archive/edit UI and real attachment/storage |
| 16 Payroll | Warm lazy-loaded workspace; lock/freeze/rollover/model tests | 19 actual rules cases including concurrent lock/history | Full native close/adjustment workflow and real-cloud payroll ACK |
| 17 Employees | Native profile edits; add FAB/form/roster tests | Actual employees persistence; identity recovery tests | Actual Firebase Auth account provisioning and full UI CRUD |
| 18 Products | Native create/edit/search/archive; product-unit visuals | Actual products persistence; unit/inventory/billing parity | Real image/media upload and cold giant-catalog behavior |
| 19 Price quotes | Five bulk price applications; queued/confirmed/denied/double-submit actual handler tests | Queue/authorization logic | Actual remote text/file delivery and cloud write timings |
| 20 Settings | Invoice/cache integration; company/form visual/source checks | Runtime/identity/permission tests | Actual backup/restore, integrations and all setting edits |
| 21 Roles | Warm view; RBAC/navigation/authorization tests | Tenant-isolation and immutable audit checks | Real permission-edit server ACK and full role UI matrix |
| 22 Subscription | Read-only plan view, warm opens | No live subscription write invoked | External billing not available; no invented CRUD or payment PASS |

## Tests And Build

| Gate | Result / evidence |
| --- | --- |
| `npm run test:all` | PASS, exit 0; `resume-final-gates-testall.log` |
| Focused viewport/save/lazy regression | 48 PASS, zero failures; `resume-final-focused-v5.log`; included again by the final normal suite |
| `npm run lint` | PASS; final extra helper/script ESLint and latest harness/test ESLint also PASS |
| `npm run typecheck` | PASS; repository `tsconfig.payroll.json` scope, not a claim that every JSX file is typed |
| `npm run build`, cloud mode | PASS; `resume-final-gates-cloud-build.log`; entry 2,468.56 kB / 658.60 kB gzip |
| Firebase production-bundle verifier | PASS, 19 files inspected, no platform-runtime markers; public project ID only; no deployment |
| Full browser visual/action suite | 21/21 PASS; `resume-accepted-visuals/results.json` |
| Full browser/mobile interactions | 486 samples, zero failures/errors, exit 0 |
| Full Android Chrome interactions | 243 samples, zero failures/errors, exit 0 |
| Full installed APK interactions | 243 samples, zero failures/errors, exit 0; 18 real IME/layout captures PASS |
| Native share smoke | PASS for chooser/cancel only; `resume-native-share-final.log` |
| Share pixel/PDF encoding | PASS; `resume-share-encoding-final.log` |
| Actual SDK/rules/identity local suites | PASS as detailed above; negative-test permission logs are expected |
| `npm run test:stress:big` | Exit 0, Node simulation; peak RSS 230.3 MB, event-loop max 30.52 ms, no simulated crash. Its estimated FPS 10.2 is a heuristic, NOT phone frame timing |
| `npm run test:performance` | Exit 0, but full-collection projection FAIL at 7/8 scales and scoped projection FAIL at 6/8 with one warning. Do NOT relabel this as capacity PASS |
| `npm run test:kpi` | Script PASS with warnings; no physical-device KPI log; advisory model failures remain |

Big-stress/model/KPI artifacts have UTC filename timestamps `2026-09-30T20-24-27-158Z`, `2026-09-30T20-24-37-804Z`, and `2026-09-30T20-24-48-160Z`; these are October 1 in Asia/Saigon. Thresholds, fixture sizes and model assumptions were not reduced to obtain PASS.

Visual coverage includes product form/units, customers/suppliers, employee/order add buttons, order request saves, header Back, keyboard search, finance/report periods, messaging, legacy delivery, dispatch grouping, shared viewport saves, navigation, invoice cache/templates, general visual QA and passkey browser fixtures. Source-only invoice-template rendering uses an explicitly isolated test environment; it is not cloud or native proof. Real iOS Safari/Capacitor is unavailable on this Windows host and remains untested, not simulated as PASS.

## Changed Files

Current transformation working-tree files are listed below. Earlier committed shared-hotpath files are described in the historical reports, not falsely attributed to this continuation.

| File | Reason |
| --- | --- |
| `src/App.jsx` | Scoped ledger/list/render work; draft and save locks; precise receipt states; durable/atomic side effects; queue/ACK reconciliation; child-page frame; shared command integration; dead order UI removal |
| `src/main.jsx` | Coherent shared viewport publication; native/mobile detection; command focus/click guards |
| `src/design-system/foundation.css` | One bounded modal/child-page frame and keyboard-aware app scrollport; remove inherited extra margins |
| `src/layout/useModalScrollLock.js` | Restore body/background scroll safely through shared modal lifecycle |
| `src/layout/commandFocus.js` | Preserve press target across blur/IME resize; defer blur until command; suppress duplicate submits without disabling repeat steppers |
| `src/layout/SyncQueueStatus.jsx` | Visible pending/error/manual-retry state, not false server success |
| `src/utils/keyboardViewport.js` | Stable baseline and native pixel-rounding tolerance |
| `src/utils/customerLedgerIndex.js` | Incremental collection-identity ledger indexes with date/aggregate parity |
| `src/utils/draftRevision.js` | Prevent old realtime/ACK values from overwriting newer drafts |
| `src/utils/pendingWriteRetry.js` | Finite, scoped automatic retry and permanent-error exclusion |
| `src/utils/atomicSave.js` | Conditional atomic replay and conflict protection |
| `src/utils/deliverySavePlan.js` | Explicit linked delivery/cashflow/penalty write plans |
| `src/utils/preloadableModule.js` | Reuse fulfilled/rejected preload state without unnecessary lazy retry |
| `src/utils/shareCanvas.js` | Worker-backed share encoding with verified fallback |
| `src/utils/shareCanvas.worker.js` | Off-main-thread canvas-command encoding |
| `src/utils/shareCanvasCommands.js` | Shared encoder command representation and replay |
| `android/app/build.gradle` | Separate debug-only acceptance assets/package; default production identity retained |
| `scripts/android-acceptance-apk.mjs` | Build/install isolated bundled-asset APK, not production credentials or live URL |
| `scripts/audit-interactions.mjs` | Capture event/render/SDK boundaries; native actual input/confirmation; persisted-state assertions and normal cleanup |
| `scripts/run-isolated-visual-acceptance.mjs` | Run existing visual suites sequentially with isolated output/environment |
| `package.json` | Include new integrity/performance regression tests in normal suite |
| `eslint.config.js` | Lint required worker/runtime globals without disabling correctness checks |
| `tests/customer-ledger-index.test.mjs` | Full dataset, date, edit/archive and identity invalidation parity |
| `tests/save-integrity-regressions.test.mjs` | Actual source-handler queue, timeout, rollback, account/quote, idempotency and command-focus regressions |
| `tests/preloadable-module.test.mjs` | Fulfilled, rejected, pending and repeated preload semantics |
| `tests/keyboard-viewport.test.mjs` | Actual installer coalescing, mobile detection, rounding and restoration tests |
| `tests/attendance-roster.test.mjs` | Roster behavior with the preload boundary retained |
| `tests/list-page.test.mjs` | Render pagination while full totals remain unchanged |
| `tests/save-critical-path.test.mjs` | Revised safe critical-path assertions |
| `tests/helpers/app-source-function.mjs` | Extract actual helper/handler source for isolated tests |
| `tests/helpers/save-queue-harness.mjs` | Isolate durable persistence/retry tests without cloud writes |
| `tests/firestore-save-acceptance.test.mjs` | Actual SDK grouped rollback, conditional replay and conflicting-decision tests |
| `tests/firestore-customer-messaging-rules.test.mjs` | Clean only its own emulator fixture before each run; retain realtime/security assertions; remove unsupported Node settings |
| `tests/android-share-native-smoke.mjs` | Real native chooser readiness/cancel/cleanup, no recipient send |
| `tests/visual/native-keyboard-acceptance.mjs` | Actual Android IME, number/text inputs, rotation, Back and customer/price saves |
| `tests/visual/interaction-action-cases.mjs` | Persisted CRUD/compound/double-click assertions; real Android request/pricing command controls |
| `tests/visual/viewport-save.audit.mjs` | Actual press, resize mid-press, release and correct persisted Save regression |
| `tests/visual/share-canvas.encoding.mjs` | Worker/fallback pixel equivalence and paginated PDF input checks |
| `tests/visual/customer-create.visual.mjs` | Shared child-page layout and save action assertions at nine sizes |
| `tests/visual/app-header-back.visual.mjs` | Updated semantic control and route assertions |
| `tests/visual/hd-manager-visual-qa.mjs` | Current layout/module/role fixtures and geometry checks |
| `tests/visual/invoice-settings.integration.mjs` | Invoice edit, persistence, cache/QR/encoding/reload and explicit share boundary |
| `tests/visual/invoice-templates.visual.mjs` | Isolate source-only Vite cache and preopt dependencies; no mid-test optimizer reload |
| `tests/visual/warehouse-dispatch-grouping.visual.mjs` | Current grouping/semantic action assertions |
| This report | Evidence, measurements, full 22-module coverage boundaries and acceptance decision |

## Remaining Acceptance Limits

1. The mandatory isolated real-cloud Firebase test cannot run without authorized isolated tenant/config. Production account/data were not used as a substitute. API endpoint timings, TTFB, bytes, SDK transport retries and database timings remain unknown.
2. Full UI CRUD/search/filter/sort/scroll coverage across all 22 modules is not complete merely because their navigation and source/unit suites pass. Specific missing workflows are identified in the matrix, including real Auth provisioning and full payroll closing UI.
3. No physical device/iOS result, release-signed APK/AAB acceptance, compositor FPS, long-duration memory-leak proof, cold-start SLO or actual recipient-share delivery result is available.
4. The entry chunk and monolithic App remain large; the advisory capacity model still fails high scales. Route-scoped listeners reduce active work but still read full permitted datasets on some routes. No unsupported database migration or wholesale rewrite was performed to hide this residual risk.
5. Android Chrome completion outliers and native confirmation-inclusive durations are preserved. Universal instant operation or 100% external delivery cannot be honestly promised from these measurements.

All audit-owned test servers/Firestore emulator processes were closed by their test lifecycle or explicitly stopped after identity verification. The user's existing localhost server and emulator were left available. No new commit/push/deploy is implied by this local validation report. The master task's full production-ready acceptance gate remains **NOT SATISFIED**, despite the verified local improvements above.

## Requested Release Follow-Up

The owner subsequently requested a GitHub push and APK/AAB packaging. Android packaging targets `com.hdmanager.app`, version `1.0.3`, versionCode `26100101`, with the existing private signing configuration outside Git. The signer matches the previous 1.0.2 APK. This is not a new claim of full production acceptance.

The initial source push `7106d839` triggered workflow 147, which stopped before deployment at the production dependency audit. The newly published advisories affect the locked DOMPurify and gRPC versions. Narrow overrides update DOMPurify to `3.4.16` and gRPC to `1.14.5` in the app/Functions dependency trees; Firebase is not downgraded and no security gate is disabled. See the maintainer advisories for [DOMPurify](https://github.com/advisories/GHSA-p98j-92pf-mc4p), [gRPC authentication](https://github.com/advisories/GHSA-m9gg-hp2v-232j), and [gRPC error disclosure](https://github.com/advisories/GHSA-f596-whhp-79r4).

After the dependency patch, the app production audit reports zero vulnerabilities; the Functions audit passes its existing high-severity threshold with three remaining moderate advisories. The full functional suite passes again. Actual SDK local-emulator tests also pass for persistence, atomic rollback, offline/reconnect, idempotency and six customer messaging/realtime cases. The earlier SDK measurement JSON is preserved as `test-results/release-1.0.3-before-sdk-patch.json`; new results and logs are separate release follow-up evidence, not replacements for the before/after timings above. The emulator server additionally emitted Netty warnings during this local run; passing client assertions do not certify the emulator implementation or production transport.

Final artifact hashes, build ID and deployment outcome belong to the release artifact record. No upload to Google Play or physical-device acceptance is implied by packaging.
