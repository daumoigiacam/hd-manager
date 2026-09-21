import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();
const bundleDirectory = path.resolve(process.argv[2] || 'dist');
const expectedProjectId = 'hd-manager-c5839';
const expectedDataMode = 'cloud';

const collectFiles = (directory) => {
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filePath = path.join(current, entry.name);
      if (entry.isDirectory()) visit(filePath);
      else if (/\.(?:html|js|json)$/i.test(entry.name)) files.push(filePath);
    }
  };
  visit(directory);
  return files.sort();
};

const fail = (reason, details = {}) => {
  console.error(JSON.stringify({ status: 'FAIL', reason, ...details }, null, 2));
  process.exit(1);
};

if (`${process.env.VITE_DATA_MODE || ''}`.trim() !== expectedDataMode) {
  fail('FIREBASE_DATA_MODE_REQUIRED', {
    expected: expectedDataMode,
    actual: process.env.VITE_DATA_MODE || '',
  });
}
if (`${process.env.VITE_FIREBASE_PROJECT_ID || ''}`.trim() !== expectedProjectId) {
  fail('FIREBASE_PROJECT_MISMATCH', {
    expected: expectedProjectId,
    actual: process.env.VITE_FIREBASE_PROJECT_ID || '',
  });
}
if (process.env.VITE_API_BASE_URL || process.env.VITE_INVENTORY_VPS_ENABLED) {
  fail('PLATFORM_ENV_PRESENT', {
    apiBaseUrlConfigured: Boolean(process.env.VITE_API_BASE_URL),
    inventoryVpsConfigured: Boolean(process.env.VITE_INVENTORY_VPS_ENABLED),
  });
}
if (!fs.existsSync(bundleDirectory)) fail('BUNDLE_DIRECTORY_NOT_FOUND', { bundleDirectory });

const files = collectFiles(bundleDirectory);
const contents = files.map((filePath) => ({
  file: path.relative(workspaceRoot, filePath).replaceAll('\\', '/'),
  content: fs.readFileSync(filePath, 'utf8'),
}));
const combined = contents.map(({ content }) => content).join('\n');
const requiredMarkers = [
  expectedProjectId,
  'cloudfunctions.net',
];
const forbiddenMarkers = [
  'https://app.hdconnect.net/api/v1',
  'https://staging-api.hdconnect.net/api/v1',
  '/api/v1',
  '/platform-admin',
  'hd-connect-platform',
  'vps-production',
];

const missingMarkers = requiredMarkers.filter((marker) => !combined.includes(marker));
const forbiddenFindings = forbiddenMarkers
  .filter((marker) => combined.includes(marker))
  .map((marker) => ({
    marker,
    files: contents.filter(({ content }) => content.includes(marker)).map(({ file }) => file),
  }));

if (missingMarkers.length) fail('FIREBASE_RUNTIME_MARKER_MISSING', { missingMarkers });
if (forbiddenFindings.length) fail('PLATFORM_RUNTIME_MARKER_FOUND', { forbiddenFindings });

const versionPath = path.join(bundleDirectory, 'version.json');
if (!fs.existsSync(versionPath)) fail('VERSION_MANIFEST_MISSING');
const version = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
if (!`${version.buildId || ''}`.trim()) fail('BUILD_ID_MISSING');

console.log(JSON.stringify({
  status: 'PASS',
  architecture: 'HD Manager -> Firebase',
  firebaseProjectId: expectedProjectId,
  dataMode: expectedDataMode,
  buildId: version.buildId,
  filesInspected: files.length,
  platformRuntimeMarkers: 0,
}, null, 2));
