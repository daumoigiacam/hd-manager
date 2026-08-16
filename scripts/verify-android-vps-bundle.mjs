import crypto from 'node:crypto';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const artifactArgument = process.argv[2] || process.env.ANDROID_ARTIFACT_PATH || '';
const artifactPath = artifactArgument ? path.resolve(artifactArgument) : '';
const forbiddenMarkers = [
  'hd-manager-c5839',
  'staging-api.hdconnect.net',
  'staging-app.hdconnect.net',
  'firebaseapp.com',
  'firebaseio.com',
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'AIza',
  'private_key',
  'client_email',
];
const textExtensions = new Set(['.js', '.mjs', '.cjs', '.json', '.xml', '.html', '.css', '.txt', '.properties']);

const relative = (filePath) => path.relative(process.cwd(), filePath).replaceAll('\\', '/');
const blocked = (reason, extra = {}) => {
  const report = {
    status: 'BLOCKED',
    generatedAt: new Date().toISOString(),
    reason,
    artifact: artifactPath ? relative(artifactPath) : null,
    ...extra,
  };
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
};

if (!artifactPath) blocked('SIGNED_AAB_PATH_REQUIRED');
if (!fs.existsSync(artifactPath)) blocked('SIGNED_AAB_NOT_FOUND');
if (fs.statSync(artifactPath).size === 0) blocked('SIGNED_AAB_EMPTY');
if (path.extname(artifactPath).toLowerCase() !== '.aab') {
  blocked('SIGNED_AAB_REQUIRED', { actualExtension: path.extname(artifactPath) });
}

const digest = crypto.createHash('sha256').update(fs.readFileSync(artifactPath)).digest('hex');
const signatureCheck = childProcess.spawnSync(
  'jarsigner',
  ['-verify', '-certs', artifactPath],
  { encoding: 'utf8', stdio: 'pipe' },
);
if (signatureCheck.error) blocked('JARSIGNER_NOT_AVAILABLE');
if (signatureCheck.status !== 0) {
  blocked('SIGNED_AAB_SIGNATURE_INVALID', {
    verifier: 'jarsigner',
    exitCode: signatureCheck.status,
  });
}

const report = {
  status: 'PASS',
  generatedAt: new Date().toISOString(),
  artifact: relative(artifactPath),
  bytes: fs.statSync(artifactPath).size,
  sha256: digest,
  signature: 'PASS',
  productionMode: 'vps-production',
  requiredRuntimeBaseUrl: 'https://app.hdconnect.net/api/v1',
  forbiddenMarkers,
  note: 'AAB exists, has a valid jarsigner signature, and is hashed. Content policy scanning remains a separate release gate.',
};

console.log(JSON.stringify(report, null, 2));
