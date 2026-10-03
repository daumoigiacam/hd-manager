export default [
  {
    files: ['src/features/identity/*.jsx'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: { 'no-unreachable': 'error', 'no-dupe-keys': 'error' }
  },
  {
    files: ['src/features/orders/OrderSearchInput.jsx', 'src/features/orders/OrderRequestTableRows.jsx', 'src/features/orders/CoreRowPager.jsx', 'src/features/warehouse/DispatchTableBody.jsx'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: { 'no-unreachable': 'error', 'no-dupe-keys': 'error' }
  },
  {
    files: ['src/services/firestoreRestPagination.js', 'src/services/recordCalculationCache.js', 'src/services/collationCompareCache.js',
      'src/services/cooperativeTaskQueue.js', 'src/services/backupReadScheduler.js', 'src/services/searchEngine.js',
      'src/mocks/preview-store-serializer.js', 'src/mocks/firebase-firestore.js', 'src/mocks/preview-journal.js',
      'src/hooks/usePreparedSearch.js', 'src/hooks/useCooperativeProjection.js', 'src/services/cooperativeProjection.js',
      'src/services/groupedRowPage.js', 'src/utils/firstRecordLookup.js',
      'src/services/realtimeSnapshotItems.js', 'src/utils/incrementalProductStock.js',
      'src/utils/collectionIdentity.js', 'src/services/renderOptimization.js',
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
    files: ['functions/index.js', 'functions/payrollAutoLock.js', 'tests/payroll*.test.cjs'],
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
