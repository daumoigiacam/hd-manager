# Local data and storage audit

Baseline `5f162f5c`; 2026-10-02. Inventory from source searches for localStorage/sessionStorage/indexedDB, storage wrappers, native file writes and cache owners. No secrets or browser/company storage contents were read. Actual production bytes and storage duration are UNKNOWN; growth below is source-derived, not guessed measurements.

Legend: A = authoritative server data; C = cache/derived; T = temporary/local intent; P = local user preference/device metadata. Incremental possibilities are proposals only. App references mean `src/App.jsx`.

## Persistence paths

| Owner / path / source | Purpose and authority | Growth, read/write frequency | Serialization / whole store? | Incremental possibility and duplication |
|---|---|---|---|---|
| Preview Firestore, firebase-firestore.js:3,43,61 | Isolated test database C; never cloud A | Whole seed plus all preview writes; load at initialization/storage broadcast; persist on mutations | JSON.stringify(store), synchronous localStorage setItem; YES all collections. Snapshot clone also JSON roundtrip :11 | Could change test storage independently, but would change baseline cost. Store + snapshots + seed duplicate data; retain current benchmark definition |
| Pending Firebase writes, App:1110,1149,12273,12308 | Durable unsent command T; must not lose intent | Per-tenant queue; normal storage writes retain last500; durable path serializes next queue and reads back; startup/retry/updates | Whole queue JSON, NOT whole company store. O(queue payload bytes) | Per-command storage possible only with durability/migration review; duplicates optimistic raw records and recent-write overlays |
| Legacy pending queue migration :1119 | Compatibility T | Startup tenant read/migration, partition legacy entries | Whole remaining legacy array and tenant array JSON | Keep until old queues accounted for; no deletion in Phase0 |
| Realtime collection cache :1165 | Legacy C cleanup | Scans localStorage keys on cache initialization; removes stale cache keys and returns empty Map | No active full collection persistence from this function | Do not mistake name for current persistent database; currently memory refs replace it |
| Customer bootstrap cache :13929 | Legacy C cleanup | Removes scoped key after server-confirmed readiness | Remove only, no current writer found in src | Historical schema retained; source search does not authorize deletion |
| Firebase Auth :581,:633 | SDK-managed authentication persistence, not business DB | Init/session changes; SDK controls details | IndexedDB preferred, localStorage fallback; app does not serialize all business data | Security-sensitive; SDK internal write costs not measured; local session metadata is separate |
| App session / login mode :9521,:9544,:9568 | Session recovery metadata C/P | Read on startup; save on currentUser/currentCompany/activeTab changes :13115 | Session object JSON; login mode scalar in local+sessionStorage | Could reduce redundant metadata writes after measurement; duplicates user/company display data, not proof of authentication |
| Share image DB :5969,:5987,:6017,:6060 | IndexedDB hd-manager-share-image-cache/assets C | Read per asset lookup; write per generated asset;64 retained records,30-day read TTL, bytes depend on images | Structured clone of Blob payload; put one record, but getAll+sort+prune reads all cached records during write; no full JSON | Incremental metadata eviction possible; memory Blob cache/native files duplicate asset |
| Automatic backup state :7498,:7525,:7536 | Completion metadata P/C | Per company/date; reads schedule/start, writes success/failure; key-count growth with dates | Whole backup-state object JSON, not backup payload | Per-date state possible; current retention not measured |
| Backup file :17154,:17304; native folder HDManager/AutoBackups | Export snapshot, not live A | Full collection fetch on backup, JSON of entire selected company export; auto attempts daily in this code | Full backup JSON, pretty printed; native file/download fallback | Incremental backup would change restore contract; do not introduce inPhase0; duplicates server records intentionally |
| Share/export native files :4106,:4194,:4644 | Temporary PDF/image/share T/C | Per export/share; size scales image/PDF; device retention unknown | Blob/base64/file materialization, not DB JSON | Cache/cleanup requires native lifecycle evidence; some assets also in IndexedDB/memory |
| IdentityCenter.js:6-12,69,78,329-385 | Device ID, account index, biometric profile P; opaque device secret security material | Read on identity flow, write enrollment/revocation; index grows by account/device | Metadata JSON; web secret string per origin. NativeBiometric secure storage on native | Keep boundaries; no values inspected. Server revocation authoritative; do not conflate web fallback with native keystore |
| api/client.js:61,175 | VPS session tokens T | Only alternate API-client session flow; set/clear on login/logout/refresh | sessionStorage scalars; no company dataset JSON | Not active Firebase baseline; keep compatibility; never print tokens |
| Footer usage :23766,:23794 | P counts/preferences | Read scoped user key; write on navigation/usage | Whole small usage object JSON | Incremental by key possible but not measured hotspot |
| Notification read/shown/prompt keys :23956-24039,:24466 | P/C watermarks | Read session init, write view/read/prompt events | Scalar timestamps/flags | Duplicate remote notification state only as local watermark, no authoritative message payload |
| Conversation watermarks :44978,:44990 | P/C | Read on scope load; write on read-map changes; grows with conversations | Whole watermark map JSON | Per-conversation update possible; not measured |
| Delivery categories :48237,:49942 | P | Read view init; write category edit, last30 | Whole bounded array JSON | Already bounded; no business store duplication |
| Delivery expansion :48267,:48291 | P | Session read/write on expansion per employee | Scalar in sessionStorage | No need to optimize without evidence |
| Payroll notice :78398,:78496 | P | Read per scoped view, write dismiss | Scalar localStorage | Constant payload, no measured concern |
| themePreferences.js:1,12,21 | P theme | Init read/change write | Scalar | Keep |
| dashboardWidgetPreferences.js:55,66 | P dashboard layout | Read scope/init, write user preference | Small ID/preference JSON | Scope count grows by company/employee/dashboard; no large ledger |
| globalSearch.js:37,49 | P search history | Read/write on search history changes | Bounded normalized history JSON (see utility limit) | No full catalog serialization |
| releaseFreshness.js:1,38,68 | P installed build/reload guard | Init and version-check changes | Scalar local/sessionStorage | Guard prevents repeat reload of same remote build; no data store |
| App:525, main.jsx:482, performanceMonitor.js:81, startupTelemetry.js:19 | Debug/telemetry enable flags P | Startup/config reads | Scalar, source has no bulk data writer here | Not a business cache |
| electron/main.cjs:523-556 hd-machine.json | P machine identity | Read once then in-memory; create if absent | Small JSON via synchronous fs | Constant metadata; no evidence of entry-time bottleneck |
| electron/main.cjs:635 write-access probe | T file-system capability check | Explicit capability path | Tiny file, not company store | Not a measured hotspot; no files deleted by audit |

## Memory stores and serialized snapshots

| Owner | Data / growth | Invalidation / serialization | Role / duplication |
|---|---|---|---|
| App raw arrays, lastStableCollectionDataRef, sourceItemsByIndex :12115,:14332 | Full active tenant collections | Snapshot/optimistic updates; source normalization; no localStorage full-array writer in current realtime path | C copies/references to remote records; optimistic overlay T |
| Recent local writes/deletes and pending promise refs :12485,:12676 | In-flight/recent records and promises | Mutation, acknowledgment, cleanup; queue copy serialized separately | T/C; preserve anti-stale-snapshot protection |
| Per-view Maps, grouped rows, filtered lists | O(records+items), multiple representations | useMemo dependency changes; ephemeral field indexing during search | C; derived balances never replace authoritative movements |
| localPaymentQrDataUrlCache :3503 |160 entries,10-minute TTL | Generate/read; memory DataURL | C duplicate generated QR image |
| paymentQrImageDataUrlCache :4231 |80 entries plus pending-promise map | Fetch/generate; memory image | C; cost depends image bytes, not recorded |
| orderShareAssetCache :6128 |32 entries,30-day TTL, pending maps | Fingerprints from related records :6181; Blob/native asset lookup | C duplicate IndexedDB assets |
| Request sheet cache :62285 |4 in-memory sets plus in-flight promises | Fingerprint at60621; canvas/Blob work and per-asset IndexedDB write | C; can be prepared without explicit Share click |
| Backup object :17154 |All exported collection records | Concurrent reads -> normalization -> full JSON once per backup | Temporary full snapshot; grows with company history |
| Performance monitor / startup events |Diagnostic events and samples | Instrumented/profile mode; memory sampling timer | C diagnostics, not business source; profiling overhead in baseline |

No application-owned service-worker CacheStorage path was found in `src/main.jsx`/`public` source search. Browser HTTP cache/WebView data and SDK-internal cache quotas remain runtime-owned and unmeasured. This statement does not certify device storage cleanup.

## Conclusions

Measured preview persistence includes full mock-store JSON, not production Firebase serialization. The production queue still uses synchronous whole-queue JSON and is a plausible bounded cost, not an isolated measured production cause. IndexedDB sharing avoids full-store JSON but its getAll eviction can read all Blobs. Backups materialize a full separate snapshot. Do not change any storage/schema/durability behavior in Phase0; later measurements must separate these owners rather than combining all as 'Firebase lag'.
