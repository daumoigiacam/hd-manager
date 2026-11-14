export default [
  {
    files: ['development/hd-manager/application/src/features/customers/productCRMShared.jsx'],
    languageOptions: {ecmaVersion:'latest',sourceType:'module',parserOptions:{ecmaFeatures:{jsx:true}}},
    rules: {'no-unreachable':'error','no-dupe-keys':'error'}
  },
  {
    files: ['development/hd-manager/application/src/layout/CoreWorkspaceEntry.jsx', 'development/hd-manager/application/src/layout/RestoredLocalWorkspace.jsx', 'development/hd-manager/application/src/layout/NativeBusinessRoute.jsx'],
    languageOptions: {ecmaVersion:'latest',sourceType:'module',parserOptions:{ecmaFeatures:{jsx:true}}},
    rules: {'no-unreachable':'error','no-dupe-keys':'error'}
  },
  {
    // The canonical legacy App uses the same syntax-only policy as src/App.jsx.
    files: ['development/hd-manager/application/src/App.jsx'],
    languageOptions: {ecmaVersion:'latest',sourceType:'module',parserOptions:{ecmaFeatures:{jsx:true}}}
  },
  {
    files: ['development/hd-manager/application/src/services/workspacePresentation.js','development/hd-manager/application/src/services/realtimeReadFreshness.js','tests/workspace-presentation.test.mjs','tests/web-workspace-order-readiness.test.mjs','development/hd-manager/application/src/features/orders/orderProductAdapter.js'],
    languageOptions: {ecmaVersion:'latest',sourceType:'module'},
    rules: {'no-unused-vars':'error','no-unreachable':'error','no-dupe-keys':'error'}
  },
  {
    files: ['src/features/legacy/*.jsx', 'src/layout/PreloadedWorkspace.jsx'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: { 'no-unreachable': 'error', 'no-dupe-keys': 'error' }
  },
  {
    files: ['src/utils/supplierEntryIndex.js', 'src/utils/preloadableModule.js', 'scripts/extract-legacy-view.mjs', 'src/services/initialReadAdmission.js', 'tests/core-initial-read-admission.test.mjs', 'tests/core-read-worker-baseline-retention.test.mjs', 'scripts/measure-android-search-input.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }], 'no-unreachable': 'error', 'no-dupe-keys': 'error' }
  },
  {
    files: ['scripts/helpers/application-source.cjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs' },
    rules: { 'no-unused-vars': 'error', 'no-unreachable': 'error', 'no-dupe-keys': 'error' }
  },
  {
    files: ['src/features/business-report/*.{jsx,js}', 'src/features/products/SearchableProductPicker.jsx', 'src/features/customers/DebtBalanceShareButton.jsx', 'src/hooks/CompletedProjectionGate.jsx', 'src/features/pricing/PricingSectionShell.jsx', 'src/layout/ReadWorkerActivityNotice.jsx', 'src/features/employees/PersonalHomeProjectionGate.jsx','src/layout/RetainedReadOnlyHome.jsx'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: { 'no-unreachable': 'error', 'no-dupe-keys': 'error' }
  },
  {
    files: ['src/features/identity/*.jsx'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: { 'no-unreachable': 'error', 'no-dupe-keys': 'error' }
  },
  {
    files: ['src/features/orders/OrderSearchInput.jsx', 'src/features/orders/OrderRequestTableRows.jsx', 'src/features/orders/CoreRowPager.jsx', 'src/features/warehouse/*.{jsx,js}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: { 'no-unreachable': 'error', 'no-dupe-keys': 'error' }
  },
  {
    files: ['src/data/*.js', 'src/layout/moduleNavigation.js', 'src/layout/useModuleScrollReset.js',
      'tests/instant-data-engine.test.mjs', 'tests/instant-firestore-transport.test.mjs',
      'tests/instant-realtime.test.mjs', 'tests/instant-react.test.mjs',
      'tests/module-navigation.test.mjs', 'tests/module-scroll-reset.test.mjs',
      'scripts/audit-full-system.mjs', 'scripts/audit-approved-runtime-roles.mjs', 'scripts/run-system-data-lab.mjs',
      'scripts/report-system-transformation.mjs', 'scripts/verify-android-candidate-identity.mjs',
      'scripts/measure-android-candidate.mjs', 'scripts/measure-remembered-session-startup.mjs',
      'src/services/firestoreRestPagination.js', 'src/services/recordCalculationCache.js', 'src/services/collationCompareCache.js',
      'src/services/cooperativeTaskQueue.js', 'src/services/backupReadScheduler.js', 'src/services/searchEngine.js',
      'src/mocks/preview-store-serializer.js', 'src/mocks/firebase-firestore.js', 'src/mocks/preview-journal.js',
      'src/hooks/usePreparedSearch.js', 'src/hooks/useCooperativeProjection.js', 'src/services/cooperativeProjection.js',
      'src/services/groupedRowPage.js', 'src/utils/firstRecordLookup.js', 'src/utils/scopedRecordIdentity.js', 'src/utils/customerLedgerIndex.js',
      'src/services/realtimeSnapshotItems.js', 'src/utils/incrementalProductStock.js',
      'src/services/firestoreReadWorker*.js', 'src/services/firestoreWorkerValues.js', 'src/services/firestoreNativeWireValues.js',
      'src/services/readWorker*.js', 'src/services/workerAuthSession.js', 'src/services/personalHome*.js', 'src/services/acceptanceRememberedSession.js', 'scripts/helpers/employee-home-domain-extraction.mjs',
      'src/utils/dashboardPrivacyScope.js', 'src/utils/warehouseGroupOptions.js',
      'src/services/backgroundJsonParser.js', 'src/services/jsonParseWorker.js', 'src/services/startupSubscriptionPlan.js',
      'scripts/audit-android-webview.mjs', 'scripts/capture-android-native-health.mjs',
      'src/utils/collectionIdentity.js', 'src/utils/cooperativeCollectionIdentity.js', 'src/services/renderOptimization.js',
      'scripts/master-production-release-smoke.mjs', 'scripts/compare-master-performance.mjs',
      'scripts/master-emulator-session-regression.mjs', 'scripts/master-session-regression.mjs',
      'scripts/helpers/master-emulator-ui-crud.mjs', 'scripts/helpers/bounded-audit-process.mjs',
      'tests/takeover-bounded-audit.test.mjs',
      'tests/core-*.test.mjs', 'tests/delivery-request-index.test.mjs',
      'tests/master-*.test.mjs', 'tests/phase1-hidden-report.test.mjs',
      'tests/phase2a-preview-storage.test.mjs', 'tests/warehouse-dispatch-performance.test.mjs', 'tests/helpers/preview-storage-harness.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-unreachable': 'error', 'no-dupe-keys': 'error' }
  },
  {
    files: ['src/utils/shareCanvas*.js', 'scripts/audit-interactions.mjs', 'tests/save-integrity-regressions.test.mjs', 'tests/visual/share-canvas.encoding.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }], 'no-unreachable': 'error', 'no-dupe-keys': 'error' }
  },
  {
    ignores: [
      'android/**',
      'dist/**',
      'functions/node_modules/**',
      'node_modules/**',
      'release/**'
    ]
  },
  {
    files: ['src/App.jsx', 'src/main.jsx', 'src/design-system/ListPagination.jsx', 'src/layout/SyncQueueStatus.jsx'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } }
    }
  },
  {
    files: [
      'src/features/invoice-templates/**/*.{jsx,js}',
      'tests/invoice-templates.test.mjs',
      'tests/visual/invoice-harness.jsx',
      'tests/visual/invoice-templates.visual.mjs',
      'tests/visual/invoice-settings.integration.mjs'
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        console: 'readonly',
        document: 'readonly',
        window: 'readonly',
        Image: 'readonly',
        URL: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }]
    }
  },
  {
    files: [
      'src/features/assets/**/*.{jsx,js}',
      'src/features/delivery/**/*.{jsx,js}',
      'src/features/payroll/**/*.{jsx,js}',
      'src/design-system/ThemeProvider.jsx',
      'src/design-system/themePreferences.js',
      'src/layout/AppShell.jsx',
      'tests/asset-management-redesign.test.mjs',
      'tests/delivery-redesign-layout.test.mjs',
      'tests/design-system-foundation.test.mjs',
      'tests/theme-preferences.test.mjs'
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        console: 'readonly',
        window: 'readonly',
        document: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['src/features/platform-admin/**/*.{jsx,js}', 'src/platform/sdk/**/*.js', 'tests/platform-sdk.test.mjs', 'tests/platform-admin-cutover.test.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        console: 'readonly',
        window: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/utils/payroll*.js', 'tests/payroll*.test.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        structuredClone: 'readonly'
      }
    },
    rules: {
      'no-constant-binary-expression': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['functions/index.js', 'functions/payrollAutoLock.js', 'functions/employeeHome*.{js,cjs}', 'tests/payroll*.test.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        console: 'readonly',
        module: 'readonly',
        process: 'readonly',
        require: 'readonly',
        setTimeout: 'readonly'
      }
    }
  }
];
