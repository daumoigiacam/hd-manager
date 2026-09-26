export default [
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
    files: ['src/App.jsx'],
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
