# Removed Dependencies Register

Removed: **0**. package.json and all lockfiles are unchanged.

Font packages without literal consumers remain B for owner review; absence of imports alone does not establish all packaging consumers. CLI/type/build packages can be invoked by binary names, ambient type resolution or plugins. No uninstall or install was performed.

| Manifest | Package | Evidence | Classification / Action |
| --- | --- | --- | --- |
| package.json | @capacitor/android | android/capacitor.settings.gradle | C: keep |
| package.json | @capacitor/app | android/capacitor.settings.gradle, src/App.jsx | C: keep |
| package.json | @capacitor/core | src/App.jsx, src/design-system/ThemeProvider.jsx, src/main.jsx | C: keep |
| package.json | @capacitor/filesystem | android/capacitor.settings.gradle, src/App.jsx | C: keep |
| package.json | @capacitor/geolocation | android/capacitor.settings.gradle, src/App.jsx | C: keep |
| package.json | @capacitor/local-notifications | android/capacitor.settings.gradle, src/App.jsx | C: keep |
| package.json | @capacitor/share | android/capacitor.settings.gradle, src/App.jsx | C: keep |
| package.json | @capgo/capacitor-native-biometric | android/capacitor.settings.gradle, src/services/identityCenter.js | C: keep |
| package.json | @fontsource-variable/inter | Indirect CLI/type/build use or unproven packaging dependency | B: owner review; keep |
| package.json | @fontsource-variable/roboto-flex | Indirect CLI/type/build use or unproven packaging dependency | B: owner review; keep |
| package.json | @simplewebauthn/browser | src/services/identityCenter.js, tests/visual/passkey-auth.integration.mjs | C: keep |
| package.json | @zxing/browser | src/App.jsx | C: keep |
| package.json | firebase | .env.emulator, .github/workflows/deploy.yml, .gitignore | C: keep |
| package.json | html-to-image | scripts/run-isolated-visual-acceptance.mjs, src/App.jsx, src/features/invoice-templates/InvoiceTemplateWorkspace.jsx | C: keep |
| package.json | jspdf | scripts/run-isolated-visual-acceptance.mjs, src/App.jsx, src/features/invoice-templates/InvoiceTemplateWorkspace.jsx | C: keep |
| package.json | lucide-react | src/App.jsx, src/design-system/ListPagination.jsx, src/design-system/components.jsx | C: keep |
| package.json | qrcode | ios-expo/package.json, src/App.jsx, tests/visual/invoice-harness.jsx | C: keep |
| package.json | react | ios-expo/App.js, ios-expo/package.json, scripts/audit-interactions.mjs | C: keep |
| package.json | react-dom | ios-expo/package.json, src/App.jsx, src/design-system/components.jsx | C: keep |
| package.json | read-excel-file | src/App.jsx, tests/customer-reconciliation-export.test.mjs, vite.config.js | C: keep |
| package.json | tesseract.js | src/App.jsx | C: keep |
| package.json | @capacitor/cli | Indirect CLI/type/build use or unproven packaging dependency | C: keep |
| package.json | @firebase/rules-unit-testing | scripts/verify-export-restore.mjs, tests/financial-evidence-rules.emulator.mjs, tests/firestore-cursor-pagination.test.mjs | C: keep |
| package.json | @types/node | Indirect CLI/type/build use or unproven packaging dependency | C: keep |
| package.json | @vitejs/plugin-react | vite.config.js | C: keep |
| package.json | autoprefixer | postcss.config.cjs | C: keep |
| package.json | eas-cli | ios-expo/package.json | C: keep |
| package.json | electron | electron/main.cjs, electron/preload.cjs, scripts/g10-firebase-writer-inventory.mjs | C: keep |
| package.json | electron-builder | Indirect CLI/type/build use or unproven packaging dependency | C: keep |
| package.json | eslint | .github/workflows/deploy.yml, scripts/verify-phase4b.mjs | C: keep |
| package.json | firebase-tools | scripts/firebase-performance-environment-evidence.cjs, scripts/run-firestore-emulator-test.mjs, scripts/start-local-firebase.mjs | C: keep |
| package.json | playwright-core | scripts/audit-interactions.mjs, scripts/master-emulator-session-regression.mjs, scripts/master-session-regression.mjs | C: keep |
| package.json | postcss | Indirect CLI/type/build use or unproven packaging dependency | C: keep |
| package.json | tailwindcss | postcss.config.cjs | C: keep |
| package.json | typescript | ios-expo/.gitignore, scripts/audit-save-paths.mjs | C: keep |
| package.json | vite | .gitignore, scripts/audit-interactions.mjs, scripts/g10-firebase-writer-inventory.mjs | C: keep |
| functions/package.json | @payos/node | functions/index.js | C: keep |
| functions/package.json | @simplewebauthn/server | functions/identityPasskeys.js | C: keep |
| functions/package.json | firebase-admin | functions/index.js, scripts/verify-export-restore.mjs, scripts/verify-local-inventory-e2e.mjs | C: keep |
| functions/package.json | firebase-functions | functions/index.js, scripts/g10-firebase-writer-inventory.mjs | C: keep |
| ios-expo/package.json | @react-native-async-storage/async-storage | ios-expo/App.js | C: keep |
| ios-expo/package.json | expo | .gitignore, PHASE3-FINAL-OWNER-DECISIONS.csv, android/app/src/main/AndroidManifest.xml | C: keep |
| ios-expo/package.json | expo-status-bar | ios-expo/App.js | C: keep |
| ios-expo/package.json | react | ios-expo/App.js, package.json, scripts/audit-interactions.mjs | C: keep |
| ios-expo/package.json | react-dom | package.json, src/App.jsx, src/design-system/components.jsx | C: keep |
| ios-expo/package.json | react-native | ios-expo/App.js | C: keep |
| ios-expo/package.json | react-native-web | ios-expo/App.js | C: keep |
| ios-expo/package.json | react-native-webview | ios-expo/App.js | C: keep |
| ios-expo/package.json | qrcode | package.json, src/App.jsx, tests/visual/invoice-harness.jsx | C: keep |
