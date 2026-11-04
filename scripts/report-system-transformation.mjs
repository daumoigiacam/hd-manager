import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parse } from '@babel/parser';

const output='test-results/full-system-transformation-20261101';
const read=async file=>{try{return JSON.parse(await fs.readFile(file,'utf8'))}catch{return null}};
const inventory=await read(output+'/source-inventory.json');
if(!inventory)throw Error('Run audit-full-system first.');
const source=await fs.readFile('src/App.jsx','utf8'),tree=parse(source,{sourceType:'module',plugins:['jsx']});
const sha=value=>createHash('sha256').update(value).digest('hex');
const declarations=tree.program.body.filter(node=>node.type==='VariableDeclaration').flatMap(node=>node.declarations);
const foreground=declarations.find(node=>node.id.name==='FOREGROUND_REALTIME_COLLECTIONS_BY_TAB');
const object=foreground.init.arguments[0];
const routes=object.properties.map(property=>({route:property.key.name||property.key.value,
  sourceCollections:property.value.elements.map(item=>item.value),
  migrationStatus:'NOT_MIGRATED_TO_SHARED_SERVER_PAGES',
  reason:'Root sources still supply complete history for calculations, customer visibility and reconciliation. Render pagination is not server pagination.',
  globalSearch:'Legacy dataset search remains; the new adapter explicitly refuses unsupported global search.',
  roleCrudAcceptance:'NOT_COMPLETED_FOR_EVERY_ROLE',
}));
const anchor=async(file,symbol)=>{
  const text=await fs.readFile(file,'utf8'),offset=text.indexOf(symbol);
  if(offset<0)throw Error('Missing audit evidence '+file+':'+symbol);
  return {file,line:text.slice(0,offset).split('\n').length,symbol,fileSha256:sha(text)};
};
const observations=[
  ['frontend','src/App.jsx','export default function App','Large monolithic App owns authentication, raw collections, mutations and views. Navigation is now an independent shell subscription; full module code splitting remains unfinished.'],
  ['backend','functions/inventoryTransactions.js','executeAtomicInventoryOperation','Atomic inventory server service includes idempotency and permission checks. Local conflict/replay checks run against the actual service; full real API capacity is unmeasured.'],
  ['firebase','vite.config.js','@hd/hd-connect-runtime','Normal Firebase builds alias the VPS adapter to a Firebase-only runtime. A nested VPS codebase exists but its source inventory is not proof of active production API use.'],
  ['firestore-data-model','src/App.jsx','DATA_COLLECTION_NAMES','Company-scoped collection history still feeds many calculations. Bounded read models and backend aggregates are needed before removing those inputs safely.'],
  ['component-tree','src/layout/moduleNavigation.js','useModuleNavigationSnapshot','Only the subscribing shell must render on a Firebase route change; route effects preserve source activation, session preference and maintenance lifetime. Real component fixture verifies parent render isolation.'],
  ['state-management','src/App.jsx','RAW DATA','Many raw datasets still live in the root. Moving route state alone does not complete the data/state redesign.'],
  ['data-fetching','src/data/firestorePageTransport.js','createFirestorePageTransport','New actual-SDK server-page adapter enforces tenant, authorized filters, keyset cursors and page15/20. Not wired into every active module; no range/search/aggregate cutover is claimed.'],
  ['cache','src/data/instantDataEngine.js','createInstantDataEngine','New bounded principal/tenant/revision cache deduplicates reads, rejects obsolete results and hides revoked policy data. Persistent offline cache and module-wide adoption remain unfinished.'],
  ['realtime','src/services/firestoreReadWorkerClient.js','createFirestoreReadWorkerClient','Existing active worker still reads full query history. New Data Engine has a bounded/deduplicated realtime adapter tested with the actual SDK, but active-module migration remains unfinished.'],
  ['authentication','functions/identityCenter.js','const verifyLegacyPassword','Legacy PBKDF2 verification now uses async crypto with unchanged format/work factor and timing-safe comparison. Auth network/cold-start latency is distinct from cached session restoration. No cloud auth deployment performed.'],
  ['authorization','src/utils/dashboardPrivacyScope.js','createDashboardPrivacyScope','Completed report retention is scoped by actor, tenant and effective access. The committed employee directory is inventoried separately from filtered view props; it is not an Auth account directory or all-role login acceptance.'],
  ['security-rules','firestore.rules','function canReadApplicationDocument','Current rules enforce tenant identity and selected protected collections. Generic employee reads are broad; local product-page tests do not certify every UI role restriction or all collection CRUD. No production permissions changed.'],
  ['network','src/services/firestoreRestPagination.js','DEFAULT_REST_PAGE_SIZE','Legacy full-history REST reads still have separate bulk page sizes; these are not compliant operational pages. SDK RPC abort suppresses publication but cannot physically cancel an already sent SDK request.'],
  ['memory','scripts/capture-android-native-health.mjs','RSS','Native observations collect app and emulator WebView sandbox RSS/PIDs and a limited renderer crash log query. A bounded observation without a crash does not prove absence of leaks.'],
  ['javascript','src/services/cooperativeProjection.js','createProjectionScheduler','Existing cooperative scheduling and workers yield UI work, but previous real Android cohorts exceeded100ms. New results must remain tied to the installed APK hash.'],
  ['rendering','src/layout/useModuleScrollReset.js','useModuleScrollReset','Route scrolling resets the old laid-out container before DOM replacement; restore paths retain a cancelled-on-supersession fallback. This functional fix does not itself prove paint/INP performance.'],
  ['images','src/utils/shareCanvas.js','createRecordedShareCanvas','Image/canvas share paths exist and need allocation/large payload checks across roles. No complete image-memory acceptance is claimed.'],
  ['offline','src/App.jsx','pendingFirebaseWritesRef','Existing pending-write and backup paths remain. The new engine refuses writes without an idempotent/versioned server adapter; no financial balance is inferred from a partial page. Durable unified outbox migration is incomplete.'],
  ['error-recovery','src/hooks/CompletedProjectionGate.jsx','CompletedProjectionGate','Readonly completed content is retained during same-scope recomputation while truthful busy/error/access checks stay active. The floating update label is removed without falsifying data readiness.'],
  ['build-deployment','scripts/verify-android-candidate-identity.mjs','installedMatches','Candidate APK, installed package and recognized source-map files are hash checked. Tests/debug maps remain local. No new production deployment or release authorization is implied.'],
];
const dimensions=[];
for(const [name,file,symbol,finding]of observations)dimensions.push({name,status:'PARTIAL_SEMANTIC_REVIEW_OPEN',finding,evidence:await anchor(file,symbol)});
const candidateDirectory=process.env.HD_SYSTEM_REPORT_CANDIDATE||'test-results/android10-startup-default-20261101';
const measurementDirectory=candidateDirectory+'/'+(process.env.HD_SYSTEM_REPORT_MEASUREMENTS||'measurements');
const candidate=await read(candidateDirectory+'/candidate-identity.json');
const first=await read(measurementDirectory+'/first-navigation/result.json');
const repeat=await read(measurementDirectory+'/repeat-navigation/result.json');
const startup=await read(measurementDirectory+'/startup/observed.json');
const native=await read(measurementDirectory+'/native/result.json');
const load=await read(output+'/local-protocol-load/result.json');
const realtime=await read(output+'/local-realtime/result.json');
const data=await read(output+'/data-engine-sdk/result.json');
const role=await read(output+'/approved-runtime-roles.json');
const security=await read(output+'/security-surface/result.json');
const deployedRules=await read(output+'/deployed-rules/result.json');
const deployedSecurity=await read(output+'/security-surface-deployed/result.json');
const inventoryIntegrity=await read('test-results/phase4/firestore-inventory-transaction.json');
const priorFullDirectory='test-results/android10-directory-publication-20261101';
const priorDiagnosticDirectory='test-results/android10-customer-split-20261101';
const priorSplitDirectory='test-results/android10-workspace-split-20261101';
const frames=await read(priorFullDirectory+'/native-frame-ring/result.json');
const currentInput=await read(candidateDirectory+'/search-input/result.json');
const previousInput=await read(priorFullDirectory+'/search-input/result.json');
const previousAdmissionDirectory='test-results/android10-initial-admission-20261101';
const regressionLog=await fs.readFile('test-results/full-system-regression-v27.log','utf8');
const regressionGroups=Array.from(regressionLog.matchAll(/ℹ tests (\d+)\r?\nℹ suites \d+\r?\nℹ pass (\d+)\r?\nℹ fail (\d+)\r?\nℹ cancelled (\d+)\r?\nℹ skipped (\d+)/g),match=>({tests:Number(match[1]),passed:Number(match[2]),failed:Number(match[3]),cancelled:Number(match[4]),skipped:Number(match[5])}));
const [masterGroup,instantGroup]=regressionGroups.slice(-2);
if(!masterGroup||instantGroup?.tests!==25||regressionGroups.some(group=>group.failed||group.cancelled))throw Error('Missing complete configured regression evidence.');
const serverCounts=await read(priorDiagnosticDirectory+'/server-counts/result.json');
const jsonDiagnostic=await read(priorDiagnosticDirectory+'/worker-json-diagnostic/result.json');
const sourceMismatches=[];
for(const [file,expected]of Object.entries(candidate?.sources||{})){
  try{if(sha(await fs.readFile(file))!==expected)sourceMismatches.push(file)}catch{sourceMismatches.push(file)}
}
const percentile=(values,p)=>values.length?[...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1]:null;
const summarize=record=>{
  if(!record)return {status:'UNMEASURED'};
  const values=(record.samples||[]).map(sample=>sample.inputToFeedbackMs).filter(Number.isFinite);
  return {status:'TRUSTED_INPUT_FEEDBACK_PROXY_NOT_PAINT_OR_READY',samples:values.length,p50Ms:percentile(values,.5),p95Ms:percentile(values,.95),p99Ms:percentile(values,.99),
    byModule:[...new Set((record.samples||[]).map(sample=>sample.module))].map(module=>{
      const samples=(record.samples||[]).filter(sample=>sample.module===module).map(sample=>sample.inputToFeedbackMs).filter(Number.isFinite);
      return{module,samples:samples.length,p95Ms:percentile(samples,.95),over100:samples.filter(value=>value>=100).length,
        scope:'Observed small cohort per module; not statistical certification of every role/device or paint/INP.'};
    }),
    completeDataReadySamples:(record.samples||[]).filter(sample=>Number.isFinite(sample.inputToReadyMs)).length,
    over100:values.filter(value=>value>=100).length,p95Under100:values.length?percentile(values,.95)<100:null,
    everyObservedSampleUnder100:values.length?values.every(value=>value<100):null,
    failures:record.failures?.length??null,raw:record};
};
const summarizeNative=record=>{
  if(!record)return {status:'UNMEASURED'};
  const processes=(record.samples||[]).flatMap(sample=>sample.processes||[]);
  const renderer=processes.filter(item=>item.name?.includes('sandboxed_process'));
  const application=processes.filter(item=>item.name==='com.hdmanager.app.acceptance');
  const peak=items=>items.length?Math.max(...items.map(item=>item.rssKb).filter(Number.isFinite)):null;
  return {started:record.started,ended:record.ended,samples:record.samples?.length??0,
    samplingErrors:(record.samples||[]).filter(sample=>sample.error).length,
    rendererPids:[...new Set(renderer.map(item=>item.pid))],rendererPeakRssKiB:peak(renderer),appPeakRssKiB:peak(application),
    rendererLastRssKiB:renderer.at(-1)?.rssKb??null,crashLinesInLimitedBuffer:record.crashes?.length??null,crashReadError:record.crashReadError,
    scope:'Observed Linux process RSS, not live JS heap, summed app memory or PSS. Limited log buffer and bounded observation cannot prove no crash or leak across all use.'};
};
const startupRecovery=[];
for(const [label,directory,startupPath] of [
 ['Previous 29.6s source witness','test-results/android10-employee-revenue-20261101','measurements/startup/observed.json'],
 ['Bounded JSON / commit / Home priority','test-results/android10-startup-priority-20261101','measurements/startup/observed.json'],
 ['Experimental persistent cache: first fill','test-results/android10-server-validated-cache-20261101','cache-fill/startup/observed.json'],
 ['Experimental persistent cache: JS reopen','test-results/android10-server-validated-cache-20261101','measurements/startup/observed.json'],
 ['Bounded REST parallel=2 experiment','test-results/android10-rest-parallel-20261101','measurements/startup/observed.json'],
 ['Current default: memory worker, native REST=1','test-results/android10-startup-default-20261101','measurements/startup/observed.json'],
]){
 const observation=await read(directory+'/'+startupPath),identity=await read(directory+'/candidate-identity.json');
 startupRecovery.push({label,directory,apkSha256:identity?.apkSha256??null,observation,
  scope:'Separate nonrandom real-session Android10 cohorts. JS reload with remembered session, not fresh password/cold device. A missing report witness stays unmeasured. No causal speedup percentage or all-device acceptance.'});
}
const cacheCold=await read('test-results/android10-server-validated-cache-20261101/cold-process-v2/result.json');
const report={generatedAt:new Date().toISOString(),status:'IN_PROGRESS_NOT_FULLY_ACCEPTED',productionChanges:false,
  startupRecovery:{cohorts:startupRecovery,persistentCacheColdProcess:cacheCold,
   invalidFirstColdProbe:await read('test-results/android10-server-validated-cache-20261101/cold-process/result.json'),
   persistentCacheSdk:await read('test-results/server-validated-cache-sdk-v3-20261101/result.json'),
   sourceTimingBefore:await read('test-results/startup-source-diagnostic-20261101/before/result.json'),
   sourceTimingAfter:await read('test-results/startup-source-diagnostic-20261101/json-budget/result.json'),
   persistentCacheDecision:'EXPERIMENT_ONLY_DEFAULT_OFF: first fill43.2s, JS reopen25.5s, cold process report upper-bound38.1s on this cohort. Correctness checks are not speed acceptance. Standard SDK IDB is not custom encrypted; remembered native scopes only; identity/private directory collections excluded; cache cannot satisfy server readiness.',
   parallelReadDecision:'EXPERIMENT_ONLY_DEFAULT_1: two REST requests had17.1s committed sources but22.6s report and19/115repeat feedback samples>=100ms. Not selected as default. Cohorts are nonrandom; no causal regression percentage asserted.',
   coldScope:'v1 probe was injected into a disposable Capacitor document and returned null: INVALID_NOT_PASS. v2 waits for the final application document. Its first-sampled report/source witnesses are upper bounds, not exact paint. Native am-start reported Launcher Activity, so its TotalTime is not asserted as app launch latency.',
  },
  productionImpactScope:'No deployment, database migration, intentional production fixture write, deletion or account/password/permission edit by the harness. Approved real-session navigation can run normal application background maintenance; this is not an assertion that all background writes were absent.',
  sourceInventory:{at:inventory.at,summary:inventory.summary,parseErrors:inventory.parseErrors.length,
    scope:'Repository-wide static inventory, with focused semantic findings below. Not a claim of complete manual audit.'},
  dimensions,moduleDataMatrix:routes,frontendScreenCandidates:inventory.modules.filter(module=>module.file.startsWith('src/')),
  tests:{dataEngineSdk:data,atomicInventory:inventoryIntegrity,realtimeProtocol:realtime,securitySurfaceAudit:security,
    deployedRulesSource:deployedRules,deployedRulesLocalMirror:deployedSecurity,
    securityScope:'Downloaded deployed source is pinned by SHA and tested with synthetic claims/records on a loopback demo emulator. GET-only Rules download; no real-account exploit, production permissions change or deploy. Server-only reads and a granted positive control prevent offline-cache denial from masquerading as authorization.'},
  localRegression:{command:'npm run test:all',log:'test-results/full-system-regression-v27.log',status:'PASSED',
    masterGroup,instantGroup,
    lintLog:'test-results/full-system-lint-v22.log',configuredTypecheckLog:'test-results/full-system-typecheck-v17.log',
    typecheckScope:'Payroll and Dispatch tsconfig projects; not a claim that the entire legacy App has strict typing.',
    preview:await read('test-results/server-validated-cache-preview-20261101/result.json'),
    sdkRegressionLog:'test-results/shared-admission-sdk-regression.log',
    readWorkerClientRetentionSdk:await read('test-results/client-retention-sdk-eviction/result.json'),
    nestedVpsTypecheck:{log:'test-results/vps-backend-typecheck-20261101.log',status:'PASSED_CONFIGURED_NON_SPEC_SCOPE',
      paginationFinding:'hd-connect-platform/src/common/query/pagination.ts still uses page/offset, default20/max100. Typecheck does not certify cursor compliance, production API adoption, permissions or capacity.'},
    strictThresholdObserverLog:'test-results/android-strict-threshold-observer.log',
    responsiveNavigationFixture:await read('test-results/navigation-viewport-20261101/result.json'),
    separateLegacyVpsSuite:{status:'FAILED_PREEXISTING_CONTRACT_MISMATCH',tests:10,passed:1,failed:9,
      baselineLog:'test-results/vps-domain-pre-split-baseline-fixed.log',
      scope:'Same nine assertion failures reproduced against the App before the four-workspace extraction. This independent legacy suite is not included in configured test:all. Not evidence that VPS runtime is accepted.'}},
  workspaceExtraction:await read(output+'/four-workspace-change.json'),
  baselineRetentionRegression:{before:'test-results/worker-baseline-empty-churn-before.log',
    after:'test-results/worker-baseline-empty-churn-after.log',
    actualSdkOrders:await read('test-results/chunk-worker-sdk-integration/orders/result.json'),
    actualSdkNotifications:await read('test-results/chunk-worker-sdk-integration/notifications/result.json'),
    scope:'Actual worker protocol reproduces redundant full transfer after12empty sources. Same SDK fixture now retains nonempty baseline, still transfers changed rows and keeps the eight-entry bound. Demo Emulator only; not server pagination or a performance-speedup proof.'},
  implementedChanges:[
    {change:'Bound REST JSON transfer by both row count and text work',evidence:'tests/core-background-json-parser.test.mjs',scope:'Up to16rows and32768UTF16units per multirow packet, oversized row isolated. Removes one-record ACK heuristic on four-core emulators; cancellation, malformed atomicity, unicode and exact values remain tested. Not a measured byte or parse-time guarantee.'},
    {change:'Publish readiness only after exact React source commit',evidence:'tests/core-collection-commit-witness.test.mjs',scope:'REST and main SDK generations reject stale/closed publications; source readiness is not HTTP receipt or an optimistic setter. Unchanged metadata needs a previously published server baseline. Delayed commit and cancellation regressions pass.'},
    {change:'Prioritize first Home sources; avoid reports for partial hydration',evidence:'tests/core-dashboard-cooperative-hook.test.mjs',scope:'Loyalty history queue waits while initial Home sources are pending. Report generator runs only after required committed inputs; retained old report stays pending and privacy-scoped. Source flags and report-ready witness are measured separately.'},
    {change:'Native worker packets use a bounded clone-work estimate',evidence:'tests/core-worker-transfer-budget.test.mjs',scope:'Up to16rows and16384estimated work units, individual large records isolated; ordered typed values and ACK/commit protection preserved. Bulk REST pages200 remain full histories, not operational15/20pages.'},
    {change:'Persistent native read cache was tested and failed the speed target',evidence:'test-results/server-validated-cache-sdk-v3-20261101/result.json',scope:'18actual SDK checks include scope partition, identity exclusion from IDB, reopen/server edits, revoked permission and scoped purge without main Auth loss. Actual Android cohort remains slow. Feature flag defaults OFF; no production rollout.'},
    {change:'Local bounded REST concurrency comparison',evidence:'tests/master-rest-integration.test.mjs',scope:'Native default remains1; explicit build flag2 only enables a bounded two-read experiment. Extracted real App transport returns every pinned record under both limits; no count/date/amount heuristic drops records. Choose no release from unit checks alone.'},
    {change:'Reuse employee sales revenue indexing across salespeople and unchanged reopen state',evidence:'test-results/employee-revenue-projection-after.log',
      scope:'Actual EmployeeView memo callback failed before the fix:18date visits for6eligible orders and3salespeople. It now visits6once and zero on unchanged reopen. Uses existing sales attribution helper with identical outputs, archived exclusion, negative amounts, customer assignment and month semantics. Cache is scoped by immutable source refs, actor/tenant/month/access; replacements invalidate. CPU diagnostic has real source-mapped samples in this path, not proof its entire navigation delay is caused by it.'},
    {change:'Bound UI-side read-worker reopen snapshots to eight nonempty completions',evidence:'test-results/client-retention-after.log',
      scope:'Three added client regressions failed before the fix. Eviction changes only reopen-cache references, never live assemblers, published state, readiness or pending local edits. Empty sources and emptied snapshots retain no reopen token. Full transfer is required after eviction; client/server cache completion order may differ and cause additional transfers. No claimed RAM reduction without measurement or all-module page migration.'},
    {change:'Skip completed unchanged loyalty fingerprint scans on navigation',evidence:'test-results/loyalty-navigation-scan-after.log',scope:'A real failure is retained in the before log. Current callback keeps exact fingerprint/eligibility logic, keyed by immutable sources, principal/tenant/day and policy signature. Marker is stored only after a complete scan, reset by disabled policy/new lifetime. Replacement source/policy, deferred readiness and leaving warehouse still run.47background scheduling tests pass; no production test write or altered points formula.'},
    {change:'Reuse finance order-code lookup and Vietnamese collation',evidence:'tests/core-finance-order-code-cache.test.mjs',scope:'CPU diagnostic identifies memo-token index construction in FinanceView. One-scope cache preserves original last-match precedence; source or authorization replacement rebuilds. Customer picker retains sorting/search/archived handling and30row cap. Does not certify global server search.'},
    {change:'Remove unused dispatch scans and reuse immutable workspace projections on reopen',evidence:'test-results/unused-dispatch-memo-removal-20261101.json',scope:'Babel verifies zero references for two pure dispatch memos; original source retained. Debt directory and expanded dispatch rows match frozen pre-cache callbacks. Source replacements and actor/date scopes invalidate; expanded row cache retains one scope. No financial, branch, attribute or quantity formula changed. Cold calculations still exist; no cold-latency acceptance claim.'},
    {change:'Skip CSS-hidden desktop/tablet navigation construction on phones',evidence:'src/layout/navigationViewport.js',scope:'Same768px CSS breakpoint, one matchMedia subscription with old-WebView listener support and cleanup. Hidden SVG/menu trees are not constructed; existing actor-scoped usage hydration/tracking/persistence hooks stay active. Actual React fixture checks767/768px resize, permissions, current route, draft/focus retention and parent isolation. Native performance remains separately measured.'},
    {change:'Shared abortable request admission adopted by the active REST page bridge',evidence:'src/data/requestAdmission.js',scope:'Same FIFO scheduler used by the new engine and legacy employee REST scans. One REST page active on native, two on web,64queued maximum; page timeout begins after admission. Cancelled queued reads do not obtain a token or call fetch; tenant cleanup closes admission. Physically uncancellable active SDK requests retain their slots. This is not complete engine adoption, operational page15/20 migration, or proof of lower latency.'},
    {change:'Initial SDK read admission bounded independently',evidence:'tests/core-initial-read-admission.test.mjs',scope:'Two initial worker transfers until server-complete ACK; cache-only packets do not release a slot.10source actual-SDK fixture observed peak2. Separate from REST admission and ongoing realtime; not a single global network cap or a speedup claim.'},
    {change:'Empty snapshots no longer evict nonempty read-worker baselines',evidence:'tests/core-read-worker-baseline-retention.test.mjs',scope:'Reproduced before fix; unchanged data survives12empty module sources without another full row transfer. Changed/deleted records still require fresh server confirmation. Eight-entry memory bound unchanged; full-collection migration remains open.'},
    {change:'Four further lazy workspaces and unreachable UI removal',evidence:'src/features/legacy/view-manifest.json',scope:'Order Requests, Orders, Warehouse Import and Delivery moved behind explicit-retry lazy boundaries. Main source reduced from4134714 to3284717 bytes;11970 unreachable bytes removed after an unconditional return. Byte reduction is not a startup-speed acceptance claim. Configured regression and isolated App preview rerun.'},
    {change:'Customer CRM code splitting',evidence:'src/features/legacy/CustomerCRMView.jsx',scope:'One real workspace moved into a lazy bundle. Remaining large root and other modules still need migration.'},
    {change:'Supplier index and reused Vietnamese collation',evidence:'tests/core-customer-supplier-projection.test.mjs',scope:'Matches frozen grouping/order/amounts and privacy flags; no financial formula changed.'},
    {change:'Customer name/date filtering',evidence:'tests/core-customer-directory-filter.test.mjs',scope:'Exact stable sort/filter equivalence; date activity scanned once per customer per projection.'},
    {change:'Retry cancelled snapshot publication',evidence:'tests/core-snapshot-publication-retry.test.mjs',scope:'Two genuine failures reproduced before the fix. Five race/union cases now pass; busy is not cleared without the actual publication witness.'},
    {change:'Local customer search input state',evidence:'tests/core-customer-search-isolation.test.mjs',scope:'Actual wrapper and shared input tested with React: no parent render per key/commit, focus/draft retained, old-scope timers cancelled. Search commit waits120ms and existing filtering debounce160ms; this is not a claim of search-result readiness under100ms.'},
  ],
  android:{candidateDirectory,candidate,startup,coldProcess:await read(candidateDirectory+'/cold-process/result.json'),firstNavigation:summarize(first),repeatNavigation:summarize(repeat),native,
    currentAppSourceMatchesCandidate:candidate?.sources?.['src/App.jsx']===sha(source),
    allRecognizedCurrentSourcesMatchCandidate:Boolean(candidate)&&sourceMismatches.length===0,sourceMismatches,
    input:currentInput,
    previousInput:{directory:priorFullDirectory,result:previousInput},
    nativeFrameRing:{directory:priorFullDirectory,result:frames},
    currentNativeFrameRing:await read(candidateDirectory+'/native-frame-ring/result.json'),
    currentReadinessAfterNavigation:await read(candidateDirectory+'/readiness-after-navigation/result.json'),
    passiveSoak:await read(candidateDirectory+'/passive-soak/result.json'),
    nativeAggregate:{navigation:summarizeNative(native),passiveSoak:summarizeNative(await read(candidateDirectory+'/passive-soak/native/result.json'))},
    previousClientRetentionCohort:{directory:'test-results/android10-client-retention-20261101',
      identity:await read('test-results/android10-client-retention-20261101/candidate-identity.json'),
      startup:await read('test-results/android10-client-retention-20261101/measurements/startup/observed.json'),
      firstNavigation:summarize(await read('test-results/android10-client-retention-20261101/measurements/first-navigation/result.json')),
      repeatNavigation:summarize(await read('test-results/android10-client-retention-20261101/measurements/repeat-navigation/result.json')),
      input:await read('test-results/android10-client-retention-20261101/search-input/result.json'),
      native:summarizeNative(await read('test-results/android10-client-retention-20261101/measurements/native/result.json')),
      cpuEmployees:'test-results/android10-client-retention-20261101/cpu-employees/mapped.json',
      scope:'Preceding pinned candidate before employee revenue-index reuse.115repeats P95=121.3ms,11>=100ms;30keys P95=64ms. Client cache bound passed correctness but this cohort did not prove latency or RAM reduction. CPU trace collected after clean measurements and is diagnostic only.'},
    previousMaintenanceDedupCohort:{directory:'test-results/android10-maintenance-dedup-20261101',
      identity:await read('test-results/android10-maintenance-dedup-20261101/candidate-identity.json'),
      startup:await read('test-results/android10-maintenance-dedup-20261101/measurements/startup/observed.json'),
      firstNavigation:summarize(await read('test-results/android10-maintenance-dedup-20261101/measurements/first-navigation/result.json')),
      repeatNavigation:summarize(await read('test-results/android10-maintenance-dedup-20261101/measurements/repeat-navigation/result.json')),
      input:await read('test-results/android10-maintenance-dedup-20261101/search-input/result.json'),
      passiveSoak:await read('test-results/android10-maintenance-dedup-20261101/passive-soak/result.json'),
      nativeAggregate:await read('test-results/android10-maintenance-dedup-20261101/native-summary.json'),
      scope:'Pinned previous APK before client retention bound.115repeats P95=101.1ms,7>=100ms;30keys P95=62.2ms. Ten-minute passive same-document/PID window had no observed global error or logout. Navigation renderer RSS peak786404KiB; high memory pressure remains. Neither passive observation nor RSS is proof of no memory leak or full stability.'},
    previousWorkspaceReopenCohort:{directory:'test-results/android10-workspace-reopen-20261101',
      identity:await read('test-results/android10-workspace-reopen-20261101/candidate-identity.json'),
      firstNavigation:summarize(await read('test-results/android10-workspace-reopen-20261101/measurements/first-navigation/result.json')),
      repeatNavigation:summarize(await read('test-results/android10-workspace-reopen-20261101/measurements/repeat-navigation/result.json')),
      input:await read('test-results/android10-workspace-reopen-20261101/search-input/result.json'),
      scope:'Pinned preceding APK before finance lookup/loyalty dedup changes.115repeats P95=118.9ms,8over100; Warehouse Dispatch and Debt had no warm sample over100 in five rounds. Not current APK or proof of every-device acceptance.'},
    previousVisibleNavigationCohort:{directory:'test-results/android10-visible-navigation-20261101',
      identity:await read('test-results/android10-visible-navigation-20261101/candidate-identity.json'),
      firstNavigation:summarize(await read('test-results/android10-visible-navigation-20261101/measurements/first-navigation/result.json')),
      repeatNavigation:summarize(await read('test-results/android10-visible-navigation-20261101/measurements/repeat-navigation/result.json')),
      startup:await read('test-results/android10-visible-navigation-20261101/measurements/startup/observed.json'),
      input:await read('test-results/android10-visible-navigation-20261101/search-input/result.json'),
      scope:'Preceding pinned APK before unused-memo removal and workspace reopen caches.115repeats P95=126.1ms with10over100; separate30key search P95=58.5ms. Preserved independently, not assigned to current APK.'},
    extendedRepeatNavigation:summarize(await read(candidateDirectory+'/measurements-repeat5/repeat-navigation/result.json')),
    extendedRepeatPlan:await read(candidateDirectory+'/measurements-repeat5/plan.json'),
    intermediateSharedAdmissionCohort:{directory:'test-results/android10-shared-admission-20261101',
      identity:await read('test-results/android10-shared-admission-20261101/candidate-identity.json'),
      firstNavigation:summarize(await read('test-results/android10-shared-admission-20261101/measurements/first-navigation/result.json')),
      repeatNavigation:summarize(await read('test-results/android10-shared-admission-20261101/measurements-repeat5/repeat-navigation/result.json')),
      startup:await read('test-results/android10-shared-admission-20261101/measurements/startup/observed.json'),
      input:await read('test-results/android10-shared-admission-20261101/search-input/result.json'),
      scope:'Pinned preceding APK before responsive navigation fix.115extended repeats P95=127.5ms,15over100;30search keys P95=66.8ms. Workload and state differ from the earliest candidate; no randomized causal claim.'},
    incompleteFirstNavigation:await read(measurementDirectory+'/first-navigation/incomplete-result.json'),
    incompleteRepeatNavigation:await read(measurementDirectory+'/repeat-navigation/incomplete-result.json'),
    previousAdmissionCohort:{directory:previousAdmissionDirectory,
      firstNavigation:summarize(await read(previousAdmissionDirectory+'/measurements/first-navigation/result.json')),
      repeatNavigation:summarize(await read(previousAdmissionDirectory+'/measurements/repeat-navigation/result.json')),
      startup:await read(previousAdmissionDirectory+'/measurements/startup/observed.json'),
      input:await read(previousAdmissionDirectory+'/search-input/result.json'),
      native:await read(previousAdmissionDirectory+'/measurements/native/result.json'),
      scope:'Preceding independently pinned APK.138/138navigation feedback proxy samples exceeded100ms;30input keys measured separately. Preserved failure cohort, not assigned to current APK.'},
    previousIncompleteBaselineCohort:{directory:'test-results/android10-baseline-retention-20261101',
      firstNavigation:await read('test-results/android10-baseline-retention-20261101/measurements/first-navigation/incomplete-result.json'),
      scope:'Navigation precondition failed before any sample; an incomplete run must not be treated as zero-ms PASS or hidden as simply unmeasured.'},
    priorSplitCandidateCohort:{directory:priorSplitDirectory,
      firstNavigation:summarize(await read(priorSplitDirectory+'/measurements/first-navigation/result.json')),
      repeatNavigation:summarize(await read(priorSplitDirectory+'/measurements/repeat-navigation/result.json')),
      input:await read(priorSplitDirectory+'/search-input/result.json'),
      scope:'Separate preceding APK, before the empty-baseline fix. Not a randomized paired comparison; no causal speedup claim.'},
    priorCurrentDataLayerAllModuleCohort:{directory:priorFullDirectory,
      firstNavigation:summarize(await read(priorFullDirectory+'/measurements-all-modules/first-navigation/result.json')),
      native:await read(priorFullDirectory+'/measurements-all-modules/native/result.json'),
      scope:'23 routes measured before the latest header/search state change; no claim those observations are of the new APK.'},
    plan:await read(measurementDirectory+'/plan.json'),
    priorTargetedCohort:{directory:'test-results/android10-customer-projection-20261101/measurements-frozen',
      firstNavigation:summarize(await read('test-results/android10-customer-projection-20261101/measurements-frozen/first-navigation/result.json')),
      repeatNavigation:summarize(await read('test-results/android10-customer-projection-20261101/measurements-frozen/repeat-navigation/result.json'))},
    priorAllModuleCohort:{directory:'test-results/android10-navigation-store-20261101',
      firstNavigation:summarize(await read('test-results/android10-navigation-store-20261101/measurements/first-navigation/result.json')),
      repeatNavigation:summarize(await read('test-results/android10-navigation-store-20261101/measurements/repeat-navigation/result.json')),
      startup:await read('test-results/android10-navigation-store-20261101/measurements/startup/observed.json')},
    newEngineBundledIntoActiveApp:false,
  },
  roleInventory:role,load,diagnostics:{serverCounts,jsonDiagnostic,
    committedPayloadShape:await read(previousAdmissionDirectory+'/committed-payload-shape/result.json'),
    cpuOrderRequest:await read(previousAdmissionDirectory+'/cpu-order-request-direct/mapped.json'),
    isolatedInputCalibration:await read('test-results/android10-static-input-control/result.json'),
    sourceReadinessBefore:await read(priorDiagnosticDirectory+'/readiness-after-navigation/result.json'),
    sourceReadinessLater:await read(priorDiagnosticDirectory+'/readiness-after-parser/result.json'),
    scope:'Read-only approved tenant diagnostics, not clean latency acceptance. Counts/lengths/states only; no credential or document payload exported.'},
  blockers:[
    {id:'MODULE_DATA_CUTOVER',kind:'IMPLEMENTATION_OPEN',detail:'All operational modules must replace root full-history sources. Canonical server aggregate/read/search contracts are required first; do not compute finances or debt from20 records.'},
    {id:'UNIFIED_ENGINE_ADOPTION',kind:'IMPLEMENTATION_OPEN',detail:'New engine, React lifecycle and bounded realtime are tested infrastructure. Durable offline outbox, write adapters, complete global search and all-module integration remain open.'},
    {id:'BACKEND_ROLE_ENFORCEMENT',kind:'HIGH_SECURITY_FINDING',detail:'Both repository Rules and downloaded deployed Rules permit generic same-tenant employee expense read/create with finance grants=false in isolated fixtures. Deployed Rules differ from repository content. Foreign/anonymous denial and granted positive controls pass. Align collection/action/scope contracts and Home/Asset/driver read models before migration/release; do not guess or modify actual user permissions.'},
    {id:'MEMORY_PRESSURE',kind:'IMPLEMENTATION_AND_ACCEPTANCE_OPEN',detail:'Previous pinned candidate renderer reached786404KiB RSS on a2GB emulator while navigating; full-history source retention remains. RSS is not live heap/PSS or confirmed leak. The client reopen-cache bound does not bound all active datasets; mixed-workload long soak and all-module read-model migration remain required.'},
    {id:'ANDROID_TARGET',kind:'ACCEPTANCE_OPEN',detail:'Previous real Android cohorts failed100ms. Only this pinned candidate’s actual observations may be used; feedback proxy is not full ready/paint/INP.'},
    {id:'ROLE_ACCOUNT_COVERAGE',kind:'AUTHORIZED_TEST_ACCESS_MISSING',detail:'One approved employee/super_admin session is available. Other roles have local synthetic tests only; do not log into real unapproved accounts or relabel those tests as actual role logins.'},
    {id:'LEGACY_VPS_SUITE',kind:'PREEXISTING_TEST_FAILURE',detail:'An independently invoked VPS-specific contract suite has9failures/10tests, also reproduced against the pre-extraction App. Configured test:all passing does not certify this suite or the VPS cutover.'},
    {id:'CLOUD_CAPACITY',kind:'STAGING_INFRASTRUCTURE_REQUIRED',detail:'Firebase QA project creation was reported quota blocked. No approved production write load or significant infrastructure spend;500–5000 cloud/VPS mixed load, cost, deployed auth and long soak remain uncertified.'},
    {id:'PRODUCTION_RELEASE',kind:'APPROVAL_AFTER_TESTING',detail:'Latest directive forbids production deployment without testing and release approval. Regional auth deployment was explicitly declined; local code only.'},
  ],
  rollback:{database:'No production migration, intentional test record write/deletion or account/permission edit was performed. Approved real-app sessions may run normal background maintenance. No database restore was performed or inferred necessary; never revert real business updates based on timing tests.',
    application:'Test-only Acceptance package is separate from production package. Prior immutable ACK candidate remains available for local install-r rollback; verify its hash before reinstalling.',
    priorCandidate:'test-results/android10-ack-scheduler-20261101/HD-Manager-Acceptance-debug.apk',
    priorSha256:'fabf7855885c5d3b1bca9809125c17451f3854e121bbb8cef7887e56d67a2d92',
    code:'Do not reset the dirty workspace or private reports. Candidate source-map hashes and VCS baseline identify the tested revisions; preserve current source before any selective rollback.'},
};
report.acceptanceObservations={
  rememberedStartup:{sourceConfirmedMs:startup?.probe?.homeServerConfirmedAt??null,
    visibleCommittedReportMs:startup?.probe?.homeCommittedReportReadyAt??null,
    under100:Boolean(Number.isFinite(startup?.probe?.homeCommittedReportReadyAt)&&startup.probe.homeCommittedReportReadyAt<100),
    scope:'Same-process JS reload, remembered session; server-committed sources and no-busy visible report witness remain distinct from fresh password login, cold process and compositor paint.'},
  repeatNavigation:{p95Under100:report.android.repeatNavigation.p95Under100,
    status:report.android.repeatNavigation.p95Under100?'TARGET_OBSERVED_IN_THIS_AGGREGATE_COHORT_ONLY':'NOT_OBSERVED_OR_UNMEASURED',
    scope:'Repeated accessible-route feedback proxy only. Per-module samples are small; slower observed samples and first-load failures remain. Not all-role/device, paint, INP or complete readiness acceptance.'},
  firstNavigation:{p95Under100:report.android.firstNavigation.p95Under100},
  input:{samples:currentInput?.samples?.length??0,p95Ms:percentile((currentInput?.samples||[]).map(row=>row.inputToTwoFrameMs).filter(Number.isFinite),.95),
    scope:'One explicit readonly search input; not all input/form/tab/dialog/scroll/update surfaces.'},
  operationalServerPages:'NOT_ADOPTED_ALL_MODULES',cloudServerReadP95:'UNMEASURED',cloud500To5000MixedWorkload:'NOT_CERTIFIED',
  productionRoleSecurity:'OPEN_HIGH_FINDING_LOCAL_MIRROR_OF_DEPLOYED_RULES',fullSystem:'NOT_ACCEPTED',
};
await fs.mkdir(output,{recursive:true});await fs.writeFile(output+'/engineering-status.json',JSON.stringify(report,null,2));
const esc=value=>String(value??'Chưa đo').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const timing=value=>Number.isFinite(value)?value.toFixed(1):'Chưa đo';
const rows=(load?.tiers||[]).map(tier=>`<tr><td>${tier.virtualUsers}</td><td>${tier.sessionsCompleted??'Chưa chạy'}</td><td>${tier.sessionsFailed??'—'}</td><td>${timing(tier.roundTripAllCompletedAttempts?.auth?.p95Ms)}</td><td>${timing(tier.roundTripAllCompletedAttempts?.page?.p95Ms)}</td><td>${timing(tier.roundTripAllCompletedAttempts?.search?.p95Ms)}</td></tr>`).join('');
const html=`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HD Manager — Kiểm toán và chuyển đổi hệ thống</title>
<style>body{margin:0;background:#f4f7fb;color:#1b2c43;font:16px/1.6 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:28px}h1{font-size:27px;line-height:1.25}h2{font-size:21px;margin-top:0}.card{padding:22px;background:white;border:1px solid #dfe6ef;border-radius:15px;margin:18px 0}.status{color:#a92236;font-weight:700}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:10px;border-bottom:1px solid #e4eaf2;text-align:left}th{background:#edf3fa}.scroll{overflow:auto}code{overflow-wrap:anywhere}a{color:#175ca0}.muted{color:#52647b}li{margin:9px 0}@media(max-width:600px){main{padding:14px}.card{padding:15px}h1{font-size:23px}}</style><main>
<h1>HD Manager — Kiểm toán và chuyển đổi hệ thống</h1><p class="status">ĐANG THỰC HIỆN — CHƯA ĐẠT NGHIỆM THU TOÀN BỘ</p><p class="muted">${esc(report.generatedAt)} · Không tạo/xóa chứng từ thử production · Chưa phát hành production</p>
<section class="card"><h2>Phạm vi và bằng chứng</h2><p>Đã lập danh mục ${inventory.summary.files} tệp nguồn/cấu hình của HD Manager và repository VPS lồng bên trong; ${inventory.parseErrors.length} lỗi phân tích cú pháp. Đây là kiểm kê tĩnh, không thay thế kiểm toán ngữ nghĩa hoặc số request runtime.</p><p><a href="engineering-status.json">Báo cáo máy đọc</a> · <a href="source-inventory.json">Danh mục nguồn</a> · <a href="approved-runtime-roles.json">Role đã quan sát</a></p></section>
<section class="card"><h2>Android thực tế — chưa đạt nghiệm thu</h2><p>Pixel 4 máy ảo Android 10/API 29, 4 CPU, khoảng 2 GB RAM, WebView 74. Chỉ dùng phiên đã được phê duyệt; không suy rộng kết quả sang mọi điện thoại.</p>
<p>APK: <code>${esc(candidate?.apkSha256)}</code> · ${candidate?Object.keys(candidate.sources).length:"Chưa xác minh"} nguồn nhận diện. Nguồn hiện hành khớp toàn bộ source map: <strong>${esc(report.android.allRecognizedCurrentSourcesMatchCandidate)}</strong>.</p>
<p>Lượt đầu ${esc(report.android.firstNavigation.samples)} mẫu, ${esc(report.android.firstNavigation.over100)} vượt 100 ms. Lượt lặp ${esc(report.android.repeatNavigation.samples)} mẫu, ${esc(report.android.repeatNavigation.over100)} vượt 100 ms; P95 ${esc(report.android.repeatNavigation.p95Ms?.toFixed(1))} ms. Không suy ra cache hit từ số vòng lặp. Số mẫu có dữ liệu đầy đủ đã đo: ${esc(report.android.firstNavigation.completeDataReadySamples)}; không có mẫu không đồng nghĩa đạt 0 ms.</p>
<p><a href="../${esc(measurementDirectory).replace(/^test-results\//,'')}/first-navigation/result.json">Điều hướng đầu</a> · <a href="../${esc(measurementDirectory).replace(/^test-results\//,'')}/repeat-navigation/result.json">Điều hướng lặp</a>. Nếu có tệp incomplete, lượt đó chưa hoàn tất: ${esc(report.android.incompleteFirstNavigation?.status||report.android.incompleteRepeatNavigation?.status||"Không có incomplete của lượt hiện tại")}. Lượt baseline trước thất bại ngay ở điều kiện chuẩn bị vẫn được giữ trong JSON, không tính PASS.</p>
<p>Đây là proxy từ pointerdown Android thật đến DOM module và hai callback animation frame, không phải compositor paint, EventTiming/INP hay dữ liệu server hoàn tất. Calibration HTML tĩnh riêng từng ghi nhận pointerdown và click có độ trễ khác nhau; không dùng calibration để bỏ các mẫu chậm của app.</p>

<p>Khôi phục phiên sau JS reload: shell ${esc(startup?.probe?.shellAt?.toFixed(1))} ms, core ${esc(startup?.probe?.coreAt?.toFixed(1))} ms; core chỉ gồm danh tính công ty/nhân sự. Các nguồn Home chưa xác nhận trong cửa sổ quan sát: ${esc(startup?.probe?.homeServerMissing?.join(", "))}. Số long task vượt 100 ms: ${esc(startup?.probe?.over100)}; tối đa ${esc(startup?.probe?.maxTaskMs?.toFixed(1))} ms. Đây không phải đăng nhập mật khẩu hay cold launch. Cờ server xác nhận không chứng minh báo cáo dẫn xuất đã commit cùng phiên bản.</p>
<p>Nhập tìm kiếm: ${esc(currentInput?.samples?.length)} phím; P95 proxy hai frame ${esc(percentile((currentInput?.samples||[]).map(row=>row.inputToTwoFrameMs).filter(Number.isFinite),.95)?.toFixed(1))} ms. Chỉ một ô tìm kiếm, không phải tốc độ kết quả search hoặc mở bàn phím. <a href="../${esc(candidateDirectory).replace(/^test-results\//,'')}/search-input/result.json">Dữ liệu nhập</a>. HWUI frame ring được lưu riêng trong JSON, không gán thành WebView paint/INP.</p>
<p>Bản trước SHA 98acfd… có 138/138 mẫu điều hướng vượt 100 ms; P95 lặp 1.993,6 ms, nhập 30 phím P95 408,1 ms. Giữ nguyên kết quả này, không gán cho APK mới hoặc suy ra cải thiện khi workload khác nhau. Native recorder giới hạn 900 giây; không chứng nhận toàn bộ thời gian sử dụng hay không rò bộ nhớ.</p></section>
<section class="card"><h2>Nguyên nhân đã có bằng chứng</h2><p>Nguồn hiện hành còn đăng ký lịch sử toàn collection. Đếm server bằng phiên và tenant đã được phê duyệt ghi nhận: ${(serverCounts?.rows||[]).filter(row=>row.status==='COUNT_CONFIRMED').map(row=>`${esc(row.collection)}: ${esc(row.count)}`).join('; ')}. Đây là số lượng bản ghi, không phải tốc độ server hoặc tải đồng thời.</p><p>Probe chẩn đoán riêng ghi nhận ${esc(jsonDiagnostic?.aggregate?.stats?.calls)} lần JSON.parse trong ${esc(jsonDiagnostic?.aggregate?.elapsedMs?.toFixed(1))} ms quan sát, với ${esc(jsonDiagnostic?.aggregate?.stats?.inputCharacters)} ký tự đầu vào. Chỉ lưu số đếm/độ dài/thời gian; không lưu chuỗi hoặc dữ liệu chứng từ. Tác vụ nền và descheduling có thể ảnh hưởng thời gian quanh parse; không coi tổng đó là CPU chính xác. <a href="../android10-customer-split-20261101/worker-json-diagnostic/result.json">Probe parser</a> · <a href="../android10-customer-split-20261101/server-counts/result.json">Đếm server</a>.</p><p>Đã sửa nhóm nhà cung cấp bằng index, dùng lại bộ so sánh tiếng Việt, tính mốc ngày một lần/khách, tách lazy bundle Khách hàng và khắc phục lần công bố bị hủy bị coi nhầm là đã áp dụng. Ô tìm kiếm hiện dùng state cục bộ theo actor/quyền; các kiểm thử giữ nguyên thứ tự và số tiền đã đạt. Đã tái hiện và sửa thêm việc12nguồn rỗng đẩy baseline có dữ liệu ra khỏi cache tám mục, gây truyền lại toàn bộ các dòng không đổi; kiểm thử SDK Emulator xác nhận bản sửa mà vẫn kiểm tra cập nhật/xóa và hủy gói. Data Engine mới vẫn chưa được tích hợp vào mọi module, nên chưa được tuyên bố đã loại bỏ toàn bộ truy vấn không giới hạn.</p></section>
<section class="card"><h2>Hồi quy và giới hạn</h2><p><code>npm run test:all</code> đạt. Nhóm master: ${masterGroup.passed} đạt, ${masterGroup.skipped} bài chủ động bỏ qua; Data Engine: ${instantGroup.passed} đạt. Lint, typecheck của Payroll/Dispatch và preview toàn App với danh tính giả lập cũng đạt. Đây không phải nghiệm thu đăng nhập/CRUD mọi tài khoản thật.</p><p>Không sửa/xóa chứng từ production, không đổi mật khẩu/PIN hoặc quyền thực tế, chưa triển khai production. Vẫn còn việc chuyển toàn bộ module sang trang server 15–20 bản ghi, tổng hợp/search đầy đủ, xử lý finding phân quyền và kiểm chứng tải cloud thật.</p></section>
<section class="card"><h2>Tải local — năm mức báo riêng</h2><p>Auth Emulator và Firestore Emulator loopback, danh tính thử dùng chung, không gọi production. Đăng nhập giao thức thử → trang20bản ghi → truy vấn khách hàng trên toàn bộ tập dữ liệu bằng điều kiện chính xác.</p><div class="scroll"><table><thead><tr><th>Phiên đồng thời</th><th>Hoàn tất</th><th>Lỗi</th><th>Auth P95ms</th><th>Đọc P95ms</th><th>Tìm P95ms</th></tr></thead><tbody>${rows}</tbody></table></div><p>Pool tối đa64socket/mỗi origin; hàng đợi máy khách được tính vào thời gian. Các con số này không phải thời gian xử lý riêng của server. Lượt mở kết nối không giới hạn bị ECONNREFUSED được giữ trong báo cáo chẩn đoán. Không suy ra Firebase/VPS thật chịu được5.000người từ Emulator.</p><p><a href="local-protocol-load/result.json">Số liệu, hàng đợi và tài nguyên máy sinh tải</a> · <a href="local-protocol-load/first-unbounded-run.json">Lượt đầu có lỗi</a> · <a href="local-protocol-load-unbounded-diagnostic/result.json">Chẩn đoán socket</a></p></section>
<section class="card"><h2>Bộ nhớ và độ ổn định — giới hạn quan sát</h2><p>APK hiện tại: ${esc(report.android.nativeAggregate.navigation.samples)} mẫu native, renderer RSS cao nhất ${esc(report.android.nativeAggregate.navigation.rendererPeakRssKiB)} KiB; ${esc(report.android.nativeAggregate.navigation.rendererPids?.length)} PID renderer được quan sát. Lượt thụ động riêng: ${esc(report.android.passiveSoak?.state?.elapsedMs?.toFixed(0))} ms, trạng thái ${esc(report.android.passiveSoak?.status)}. RSS không phải live heap/PSS; không dùng để kết luận không rò bộ nhớ.</p><p>Lượt thụ động 10 phút của APK trước (SHA 6fceea…): cùng document và PID, không ghi nhận lỗi toàn cục hoặc đăng xuất trong cửa sổ; bộ nhớ renderer lúc điều hướng từng đạt 786.404 KiB. Đây không phải soak hỗn hợp hoặc chứng nhận APK hiện tại. Chi tiết đầy đủ được giữ riêng theo SHA trong JSON.</p></section>
<section class="card"><h2 class="status">Blocker bảo mật mức cao</h2><p>Đã tải chỉ đọc Rules đang phát hành từ Firebase, SHA <code>${esc(deployedRules?.deployedSha256)}</code>. Nội dung khác Rules repository. Chạy bản tải về trên Emulator cô lập vẫn cho phép đọc/tạo phiếu chi với fixture có quyền Thu chi tắt; tenant khác và người chưa đăng nhập bị từ chối, đối chứng bật quyền thành công.</p><p>Đây là bằng chứng hành vi của Rules triển khai được tái hiện bằng dữ liệu giả; không thực hiện khai thác tài khoản thật. Chưa đổi Rules hay phân quyền production. Không thể chỉ chặn mọi phiếu chi mà bỏ qua nhu cầu tổng hợp Trang chủ, chi phí tài sản và phạm vi tài xế; cần đồng bộ hợp đồng truy vấn và quyền ở backend.</p><p><a href="deployed-rules/result.json">Rules đã xác minh</a> · <a href="security-surface-deployed/result.json">Kiểm thử quyền bằng đọc server</a></p></section>
<section class="card"><h2>20 chiều kiểm toán — còn mở</h2>${dimensions.map(item=>`<p><strong>${esc(item.name)}</strong> — ${esc(item.finding)}<br><small>${esc(item.evidence.file)}:${item.evidence.line}</small></p>`).join('')}</section>
<section class="card"><h2>Các điều kiện chưa hoàn thành</h2><ul>${report.blockers.map(item=>`<li><strong>${esc(item.id)}</strong> — ${esc(item.detail)}</li>`).join('')}</ul></section>
<section class="card"><h2>Rollback</h2><p>Không thực hiện migration hoặc ghi/xóa chứng từ thử production. Phiên app thật có thể chạy bảo trì nền bình thường; không tự hoàn tác cập nhật kinh doanh. APK Acceptance tách khỏi gói production; giữ bản ACK cũ có SHA <code>${esc(report.rollback.priorSha256)}</code> để quay lại kiểm thử nếu cần. Không reset workspace đang có thay đổi và báo cáo riêng của người dùng.</p></section></main></html>`;
const seconds=value=>Number.isFinite(value)?(value/1000).toFixed(2)+' s':'Chưa đo';
const startupRows=startupRecovery.map(row=>`<tr><td>${esc(row.label)}</td><td>${esc(seconds(row.observation?.probe?.shellAt))}</td><td>${esc(seconds(row.observation?.probe?.homeServerConfirmedAt))}</td><td>${esc(seconds(row.observation?.probe?.homeCommittedReportReadyAt))}</td><td>${esc(row.observation?.probe?.over100)}</td></tr>`).join('');
const startupHtml=`<section class="card"><h2>Kiểm chứng mốc 29,6 giây — chưa nghiệm thu</h2><div class="scroll"><table><thead><tr><th>Lượt riêng trên Android 10</th><th>Shell</th><th>Nguồn Home commit</th><th>Báo cáo hiện đủ</th><th>Long task ≥100ms</th></tr></thead><tbody>${startupRows}</tbody></table></div><p>Các lượt dùng phiên được nhớ sau JS reload, không phải đăng nhập mật khẩu hoặc thí nghiệm ngẫu nhiên. Không dùng số shell để thay cho thời gian dữ liệu sẵn sàng. Mốc báo cáo là quan sát DOM không busy, chưa phải compositor paint.</p><p>Cache thử nghiệm: lần đóng/mở tiến trình quan sát báo cáo sau ${esc(seconds(cacheCold?.observation?.homeReportObservedAt))} (cận trên lấy mẫu). Lượt probe đầu mất context được giữ là INVALID, không tính PASS. am-start trả Activity Launcher nên không dùng TotalTime đó để báo tốc độ app.</p><p>Cache IndexedDB chuẩn SDK không phải dữ liệu mã hóa tùy biến. Chỉ thử trên native có nhớ phiên; danh tính/danh bạ riêng không lưu IDB. 18 kiểm tra SDK đạt, nhưng Android vẫn chậm nên cờ cache mặc định TẮT. Cờ thử REST song song cũng chưa được chọn làm mặc định.</p><p>Phải thay phụ thuộc tải toàn bộ lịch sử bằng read model tổng hợp có phân quyền và đồng bộ đúng nghiệp vụ để giải quyết tận gốc; không lấy một trang20dòng để tính số tiền và không gắn nhãn dữ liệu cũ là mới.</p></section>`;
await fs.writeFile(output+'/report.html',html.replace('<section class="card"><h2>Phạm vi',startupHtml+'<section class="card"><h2>Phạm vi'));
console.log(JSON.stringify({output,status:report.status,dimensions:dimensions.length,routes:routes.length,productionChanges:false}));
