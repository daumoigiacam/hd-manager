import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();
const bundleDirectory = path.resolve(process.argv[2] || 'dist');
const reportFile = path.resolve(
  process.argv[3] || 'hd-connect-platform/migration/g13/FRONTEND-VPS-PRODUCTION-BUNDLE.json',
);
const requiredDataMode = 'vps-production';
const sourceAssertions = [
  {
    name: 'VPS_STAGING_AND_PRODUCTION_USE_THE_API_ONLY_RUNTIME',
    file: 'vite.config.js',
    pattern: /const isVpsStagingBuild = vpsDataMode === 'vps-staging';/,
  },
  {
    name: 'VPS_PRODUCTION_EXCLUDES_THE_LEGACY_FIREBASE_RUNTIME',
    file: 'vite.config.js',
    pattern: /const useCloudData = !usePreviewData && !isVpsApiBuild;/,
  },
  {
    name: 'FIREBASE_INITIALIZATION_IS_DISABLED_FOR_VPS_BUILDS',
    file: 'src/App.jsx',
    pattern: /if \(isVpsMode\) \{[\s\S]*?isFirebaseConfigured = false;[\s\S]*?firebase\.initialization\.skipped/,
  },
  {
    name: 'VPS_API_REMAINS_AVAILABLE_FOR_EXPLICIT_CAPABILITIES',
    file: 'src/api/hdConnectStaging.js',
    pattern: /export const isVpsApiMode = isVpsStagingMode \|\| isVpsProductionMode;/,
  },
  {
    name: 'PRODUCTION_TOKEN_NAMESPACE_REMAINS_ISOLATED',
    file: 'src/api/hdConnectStaging.js',
    pattern: /tokenStorageNamespace: isVpsProductionMode \? 'vps-production' : 'vps-staging'/,
  },
  {
    name: 'INVENTORY_VPS_GUARD_IS_EXPOSED_TO_THE_VPS_BUILD',
    file: 'vite.config.js',
    pattern: /'VITE_INVENTORY_VPS_ENABLED'/,
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
const firebaseRuntimeFiles = bundleContents
  .filter(({ content }) => content.includes('hd-manager-c5839'))
  .map(({ file }) => file);
const firebaseRuntimeAssets = bundleFiles
  .map(relativePath)
  .filter((file) => /(?:^|\/)vendor-firebase[-.]/i.test(file));
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
  status:
    firebaseRuntimeFiles.length === 0 &&
    firebaseRuntimeAssets.length === 0 &&
    failedAssertions.length === 0
      ? 'PASS'
      : 'FAIL',
  generatedAt: new Date().toISOString(),
  dataMode: requiredDataMode,
  bundleDirectory: relativePath(bundleDirectory),
  bundleFiles: bundleFiles.length,
  corePath: {
    api: 'VPS API is the only core data and identity runtime',
    firebaseFallback: 'disabled',
    firebaseInitialization: 'skipped',
    tokenNamespace: 'hdconnect.vps-production.*',
  },
  assertions: assertionFindings,
  firebaseRuntimeFiles,
  firebaseRuntimeAssets,
};

fs.mkdirSync(path.dirname(reportFile), { recursive: true });
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
process.exit(report.status === 'PASS' ? 0 : 1);
