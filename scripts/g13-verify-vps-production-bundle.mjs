import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();
const bundleDirectory = path.resolve(process.argv[2] || 'dist');
const reportFile = path.resolve(
  process.argv[3] || 'hd-connect-platform/migration/g13/FRONTEND-VPS-PRODUCTION-BUNDLE.json',
);
const requiredDataMode = 'vps-production';
const forbiddenMarkers = [
  'hd-manager-c5839',
  'cloudfunctions.net',
  'firestore.googleapis.com',
  'firebaseapp.com',
  'firebasestorage.app',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'api-merchant.payos.vn',
  'api.payos.vn',
  'AIza',
];
const legacyMarkers = ['firebase', 'firestore', 'cloud functions', 'firebase storage'];
const sourceAssertions = [
  {
    name: 'VPS_PRODUCTION_MODE_SUPPORTED',
    file: 'vite.config.js',
    pattern: /vpsDataMode === 'vps-staging' \|\| vpsDataMode === 'vps-production'/,
  },
  {
    name: 'FIREBASE_INITIALIZATION_SKIPPED_IN_VPS_MODE',
    file: 'src/App.jsx',
    pattern: /if \(isVpsMode\) \{[\s\S]*?isFirebaseConfigured = false;[\s\S]*?firebase\.initialization\.skipped/,
  },
  {
    name: 'FIREBASE_WRITES_BLOCKED_IN_VPS_MODE',
    file: 'src/App.jsx',
    pattern: /const assertFirebaseWriteAllowed = \(operation, context = \{\}\) => \{[\s\S]*?if \(isVpsMode\) throw createVpsStagingFirebaseWriteError/,
  },
  {
    name: 'PRODUCTION_TOKEN_NAMESPACE_ISOLATED',
    file: 'src/api/hdConnectStaging.js',
    pattern: /tokenStorageNamespace: isVpsProductionMode \? 'vps-production' : 'vps-staging'/,
  },
];

const relativePath = (filePath) => path.relative(workspaceRoot, filePath).replaceAll('\\', '/');

const collectBundleFiles = (directory) => {
  const files = [];
  const visit = (currentDirectory) => {
    for (const entry of fs.readdirSync(currentDirectory, { withFileTypes: true })) {
      const filePath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        visit(filePath);
      } else if (/\.(?:js|css|html|json)$/i.test(entry.name)) {
        files.push(filePath);
      }
    }
  };
  visit(directory);
  return files.sort();
};

if (`${process.env.VITE_DATA_MODE || ''}`.trim() !== requiredDataMode) {
  console.error(JSON.stringify({
    status: 'FAIL',
    reason: 'VPS_PRODUCTION_MODE_REQUIRED',
    expected: requiredDataMode,
    actual: process.env.VITE_DATA_MODE || '',
  }));
  process.exit(1);
}

if (!fs.existsSync(bundleDirectory)) {
  console.error(JSON.stringify({
    status: 'FAIL',
    reason: 'BUNDLE_DIRECTORY_NOT_FOUND',
    bundleDirectory,
  }));
  process.exit(1);
}

const bundleFiles = collectBundleFiles(bundleDirectory);
const bundleContents = bundleFiles.map((filePath) => ({
  file: relativePath(filePath),
  content: fs.readFileSync(filePath, 'utf8'),
}));
const forbiddenFindings = forbiddenMarkers.flatMap((marker) => bundleContents
  .filter(({ content }) => content.includes(marker))
  .map(({ file }) => ({ marker, file })));
const legacyReferences = legacyMarkers.flatMap((marker) => bundleContents
  .filter(({ content }) => content.toLowerCase().includes(marker))
  .map(({ file }) => ({ marker, file })));
const assertionFindings = sourceAssertions.map((assertion) => {
  const filePath = path.join(workspaceRoot, assertion.file);
  const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  return {
    name: assertion.name,
    file: assertion.file,
    status: assertion.pattern.test(content) ? 'PASS' : 'FAIL',
  };
});
const failedAssertions = assertionFindings.filter(({ status }) => status !== 'PASS');
const report = {
  status: forbiddenFindings.length === 0 && failedAssertions.length === 0 ? 'PASS' : 'FAIL',
  generatedAt: new Date().toISOString(),
  dataMode: requiredDataMode,
  bundleDirectory: relativePath(bundleDirectory),
  bundleFiles: bundleFiles.length,
  corePath: {
    api: 'VPS API only',
    firebaseFallback: 'blocked',
    firebaseInitialization: 'skipped',
    tokenNamespace: 'hdconnect.vps-production.*',
  },
  assertions: assertionFindings,
  forbiddenRuntimeReferences: forbiddenFindings,
  legacyReferencesClassified: legacyReferences,
};

fs.mkdirSync(path.dirname(reportFile), { recursive: true });
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
process.exit(report.status === 'PASS' ? 0 : 1);
