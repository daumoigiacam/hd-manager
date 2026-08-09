# HD Manager

HD Manager is a React + Vite business management application delivered as a web app, a Capacitor Android app, and an Electron Windows app. Production data and identity use the configured Firebase project; local preview data is available only through the explicit preview build mode.

## Local development

```powershell
npm install
npm run dev
```

Vite normally serves the app at `http://127.0.0.1:5173`.

## Quality gates

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

Additional suites are available through the `test:*` scripts in `package.json`.

## Production builds

```powershell
npm run build
npm run android:apk:debug
npm run android:apk:release
npm run desktop:dist:win
```

Environment values must be supplied through ignored local environment files or deployment secrets. Never commit passwords, private keys, service-account credentials, or production tokens.

## Architecture notes

- Main UI entry: `src/App.jsx`
- Firebase Cloud Functions: `functions/`
- Firestore rules: `firestore.rules`
- Explicit preview-only Firebase adapters: `src/mocks/`
- Android native project: `android/`
- Electron entry: `electron/main.mjs`

The preview adapters are required by the configured preview mode and must not be treated as production fallback data.
