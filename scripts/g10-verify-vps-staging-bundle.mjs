import fs from 'node:fs';
import path from 'node:path';

const bundleDirectory = path.resolve(process.argv[2] || 'dist');
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

const files = [];
const visit = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      visit(fullPath);
      continue;
    }
    if (/\.(?:js|css|html)$/i.test(entry.name)) files.push(fullPath);
  }
};

if (!fs.existsSync(bundleDirectory)) {
  console.error(JSON.stringify({ status: 'FAIL', reason: 'BUNDLE_DIRECTORY_NOT_FOUND', bundleDirectory }));
  process.exit(1);
}

visit(bundleDirectory);
const findings = forbiddenMarkers.flatMap((marker) => files
  .filter((filePath) => fs.readFileSync(filePath, 'utf8').includes(marker))
  .map((filePath) => ({ marker, file: path.relative(process.cwd(), filePath).replaceAll('\\', '/') })));

console.log(JSON.stringify({
  status: findings.length === 0 ? 'PASS' : 'FAIL',
  bundleDirectory: path.relative(process.cwd(), bundleDirectory).replaceAll('\\', '/'),
  scannedFiles: files.length,
  findings,
}));

process.exit(findings.length === 0 ? 0 : 1);
