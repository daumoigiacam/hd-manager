import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const application = path.join(root, 'development/hd-manager/application');
const canonicalSourceRegister = new URL('./register-canonical-source.mjs', import.meta.url).href;
// Explicit files keep this release regression group separate from unaudited
// modules, browser acceptance and tests that require a Firestore emulator.
const tests = [
  'manual-order-integrity.test.mjs',
  'request-table-cache.test.mjs',
  'dev-report-worker-resolution.test.mjs',
  'dispatch-source-readiness.test.mjs',
  'dispatch-weight-consistency.test.mjs',
  'delivery-cashflow-integrity.test.mjs',
  'delivery-report-cashflow-coverage.test.mjs',
  'customer-manager-choices.test.mjs',
  'customer-history-presentation.test.mjs',
  'customer-loan-integrity.test.mjs',
  'customer-excel-import.test.mjs',
  'customer-batch-price-patch.test.mjs',
  'order-creation-admission.test.mjs',
  'debt-payment-allocation.test.mjs',
  'finance-rejection-dialog.test.mjs',
  'bank-priority-readiness.test.mjs',
  'pricing-draft-save.test.mjs',
  'pricing-loss-validation.test.mjs',
  'pricing-calculation-known-values.test.mjs',
  'payroll-view-integrity.test.mjs',
  'employee-review-integrity.test.mjs',
  'asset-mutation-integrity.test.mjs',
  'message-mutation-integrity.test.mjs',
  'asset-view-integrity.test.mjs',
  'message-send-ui.test.mjs',
  'customer-message-send-ui.test.mjs',
  'message-order-financials.test.mjs',
  'message-read-access-plan.test.mjs',
  'settings-save-integrity.test.mjs',
  'settings-view-integrity.test.mjs',
  'settings-mutation-integrity.test.mjs',
  'company-employee-reviews.test.mjs',
  'settings-data-integrity.test.mjs',
  'role-permission-integrity.test.mjs',
  'role-domain-generation.test.mjs',
  'role-permission-view.test.mjs',
  'native-plugin-registry.test.mjs',
  'order-creation-command.test.mjs',
  'order-archive-ui.test.mjs',
].map(name => `tests/${name}`);
const rootTests = ['tests/bank-transaction-view.test.mjs','tests/canonical-source-routing.test.mjs'];
const emulatorTests = [
  'tests/order-creation-command.emulator.mjs',
  'tests/delivery-cashflow.emulator.mjs',
  'tests/customer-loan.emulator.mjs',
  'tests/warehouse-order-reconciliation.emulator.mjs',
  'tests/asset-mutation.emulator.mjs',
  'tests/message-mutation.emulator.mjs',
  'tests/message-write-rules.emulator.mjs',
  'tests/message-read-rules.emulator.mjs',
  'tests/settings-mutation.emulator.mjs',
  'tests/settings-data.emulator.mjs',
  'tests/company-settings-write-rules.emulator.mjs',
];
const rootEmulatorTests = ['tests/firestore-customer-messaging-rules.test.mjs','tests/firestore-employee-customer-messaging-rules.test.mjs',
  'tests/sales-commission-tiers-rules.test.mjs','tests/firestore-inventory-rules.test.mjs','tests/financial-evidence-rules.emulator.mjs',
  'tests/firestore-cursor-pagination.test.mjs','tests/firestore-save-acceptance.test.mjs',
  'tests/company-wifi-rules.test.mjs','tests/company-employee-reviews-rules.test.mjs','tests/firestore-payroll-rules.test.mjs'];
const sources = [
  'src/App.jsx',
  'src/features/legacy/OrderManagementView.jsx',
  'src/features/legacy/OrderRequestView.jsx',
  'src/features/legacy/ProductManagementView.jsx',
  'src/features/legacy/SalaryView.jsx',
  'src/features/legacy/DeliveryReportView.jsx',
  'src/features/legacy/CustomerCRMController.jsx',
  'src/features/legacy/CustomerDetailRender.jsx',
  'src/features/customers/productCRMShared.jsx',
  'src/features/warehouse/dispatchEditableRows.js',
  'src/features/warehouse/dispatchWeightModel.js',
  'src/services/moduleProjectionCaches.js',
  'src/utils/nativePluginRegistry.js',
  'src/utils/orderCreationCommand.js',
  'src/services/orderCreationAdmission.js',
  'src/hooks/useOrderCreationAdmission.js',
  'src/utils/atomicSave.js',
  'src/utils/assetMutationIntegrity.js',
  'src/utils/messageMutationIntegrity.js',
  'src/utils/assetCostDraft.js',
  'src/services/messageSendController.js',
  'src/services/messageReadAccessPlan.js',
  'scripts/helpers/employee-home-domain-extraction.mjs',
  'src/services/settingsSaveController.js',
  'src/hooks/useSettingsSave.js',
  'src/utils/settingsFormValidation.js',
  'src/utils/settingsMutationIntegrity.js',
  'src/utils/settingsDataIntegrity.js',
  'src/features/legacy/SettingsView.jsx',
  'src/features/settings/CompanyBankAccounts.jsx',
  'src/features/settings/CustomerCareSettings.jsx',
  'src/features/settings/companyBankAccounts.js',
  'src/features/legacy/MessageCenterView.jsx',
  'src/features/legacy/CustomerPortalView.jsx',
  'src/features/messaging/MessagingUi.jsx',
  'src/features/assets/AssetManagementWorkspace.jsx',
  'src/utils/deliverySavePlan.js',
  'src/utils/deliveryCashflow.js',
  'src/utils/deliveryCashflowTotals.js',
  'src/utils/customerManagerChoices.js',
  'src/utils/customerHistoryPresentation.js',
  'src/utils/customerLoanIntegrity.js',
  'src/utils/customerBatchPricePatch.js',
  'src/utils/bankTransactionView.js',
  'src/services/bankWorkspaceReadPlan.js',
  'src/utils/pricingLossValidation.js',
];
const run = (args, cwd, env = process.env) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit', shell: false });
  child.once('error', reject);
  child.once('close', (code, signal) => resolve(signal ? 1 : (code ?? 1)));
});

const [mode, ...extra] = process.argv.slice(2);
if (extra.length || !['test', 'lint', 'emulator'].includes(mode)) {
  throw new Error('Usage: node scripts/canonical-broad-audit.mjs <test|lint|emulator>');
}
if (mode === 'test') {
  const generated = await run([path.join(root,'scripts/build-payroll-original-domain.mjs'),'--check'],root);
  process.exitCode = generated || await run(['--import', canonicalSourceRegister, '--test', '--test-concurrency=2', '--test-timeout=60000', ...tests, ...rootTests.map(file => path.join(root, file))], application);
} else if (mode === 'lint') {
  const require = createRequire(import.meta.url);
  const eslint = path.join(path.dirname(require.resolve('eslint/package.json')), 'bin/eslint.js');
  const files = [...sources, ...tests, ...emulatorTests, 'tests/helpers/warehouse-order-emulator.mjs', 'tests/helpers/settings-data-fixture.mjs', 'tests/helpers/settings-parent-fixture.mjs', 'tests/helpers/role-permission-domain.mjs']
    .map(file => `development/hd-manager/application/${file}`);
  process.exitCode = await run([eslint, '--max-warnings=0', 'scripts/canonical-broad-audit.mjs','scripts/canonical-source-reads.mjs','scripts/canonical-esbuild.mjs',
    'scripts/build-payroll-original-domain.mjs','scripts/build-offline-original-domain.mjs','scripts/helpers/employee-home-domain-extraction.mjs', ...files, ...rootTests, ...rootEmulatorTests,
    'tests/export-restore-scope.test.mjs', 'tests/firestore-resilience.test.mjs', 'tests/loyalty-settings-save.test.mjs'], root);
} else {
  // This command connects only to an explicitly chosen, already running local
  // emulator. The individual suites also own per-process demo project IDs.
  const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^(?:127\.0\.0\.1|localhost):8185$/.test(endpoint || '')) {
    throw new Error('Set FIRESTORE_EMULATOR_HOST explicitly to 127.0.0.1:8185 or localhost:8185; no emulator is started automatically');
  }
  const projects = [process.env.GCLOUD_PROJECT, process.env.GOOGLE_CLOUD_PROJECT].filter(value => value !== undefined);
  if (projects.some(project => !/^demo-[a-z0-9-]+$/.test(project)) || new Set(projects).size > 1) {
    throw new Error('Emulator project variables must agree and contain only an isolated demo-* project');
  }
  const project = projects[0] || `demo-canonical-broad-audit-${process.pid}`;
  console.log(`Canonical emulator gate: 127.0.0.1:8185; demo environment ${project}; suites use their own demo project IDs`);
  process.exitCode = await run(['--import', canonicalSourceRegister, '--test', '--test-concurrency=1', '--test-timeout=60000', ...emulatorTests, ...rootEmulatorTests.map(file=>path.join(root,file))], application, {
    ...process.env, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8185', GCLOUD_PROJECT: project, GOOGLE_CLOUD_PROJECT: project,
    HD_CURSOR_TEST_PROJECT: `demo-canonical-cursor-${process.pid}`, HD_CURSOR_EXISTING_RULES: '0',
    HD_SAVE_ACCEPTANCE_PROJECT: `demo-canonical-save-${process.pid}`,
  });
}
