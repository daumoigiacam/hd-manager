import { mkdir, readFile, writeFile } from 'node:fs/promises';

const read = path => readFile(path, 'utf8').catch(() => '');
const readJson = async (path, fallback = {}) => JSON.parse(await read(path) || JSON.stringify(fallback));
const [appSource, firebaseConfig, clientRuntime, stagingEvidence] = await Promise.all([
  read('src/App.jsx'),
  read('src/config/firebase-runtime.js'),
  read('src/api/hdConnectStaging.js'),
  readJson('test-results/phase2/staging-environment.json', {}),
]);

const requiredAuthVariables = [
  'G10_STAGING_EMAIL',
  'G10_STAGING_PASSWORD',
];
const authenticationConfigured = requiredAuthVariables.every(name => Boolean(process.env[name]));
const stagingHealth = stagingEvidence?.probes?.health;
const productionEvidence = {
  clientDirectFirestore: /from ['"]firebase\/firestore['"]/.test(appSource) && /onSnapshot\(/.test(appSource),
  firebaseAuth: /from ['"]firebase\/auth['"]/.test(appSource),
  cloudFunctions: /cloudfunctions\.net/.test(appSource) || /commitAtomicInventoryOperation/.test(appSource),
  firebaseStorage: /from ['"]firebase\/storage['"]/.test(appSource),
  configuredFirebaseRuntime: firebaseConfig.length > 0,
};
const stagingVpsEvidence = {
  clientModulePresent: clientRuntime.length > 0,
  apiBaseUrl: stagingEvidence.apiBaseUrl || '',
  healthStatus: stagingHealth?.status ?? null,
  postgres: stagingHealth?.data?.checks?.postgres?.status || 'UNMEASURED',
  redis: stagingHealth?.data?.checks?.cache?.status || 'UNMEASURED',
  storage: stagingHealth?.data?.checks?.storage?.data?.details?.provider
    || stagingHealth?.data?.checks?.storage?.details?.provider
    || 'UNMEASURED',
};

const matrix = [
  { layer: 'Client', production: 'React/Vite Firebase runtime', staging: 'Separate VPS staging client/API contract', match: false },
  { layer: 'Auth', production: 'Firebase Identity Center custom token', staging: authenticationConfigured ? 'Configured test credentials' : 'No test credentials configured', match: false },
  { layer: 'API', production: 'Cloud Functions plus direct Firestore reads', staging: 'Node VPS API', match: false },
  { layer: 'Firestore/Firebase', production: productionEvidence.clientDirectFirestore ? 'Active' : 'Not proven', staging: 'Not present in VPS health evidence', match: false },
  { layer: 'PostgreSQL', production: 'Not used by active Firebase client data path', staging: stagingVpsEvidence.postgres, match: false },
  { layer: 'Redis', production: 'Not used by active Firebase client data path', staging: stagingVpsEvidence.redis, match: false },
  { layer: 'Storage', production: productionEvidence.firebaseStorage ? 'Firebase Storage' : 'Not proven', staging: stagingVpsEvidence.storage, match: false },
];

const result = {
  generatedAt: new Date().toISOString(),
  scope: 'Static source verification plus previously captured read-only staging health evidence. No production access and no load generated.',
  productionEvidence,
  stagingVpsEvidence,
  authentication: {
    requiredVariables: requiredAuthVariables,
    configured: authenticationConfigured,
    login: authenticationConfigured ? 'NOT_RUN' : 'BLOCKED_MISSING_TEST_CREDENTIALS',
    token: 'BLOCKED',
    testTenant: 'BLOCKED',
    rbac: 'LOCAL_UNIT_AND_EMULATOR_ONLY',
  },
  observability: {
    healthEndpoint: stagingHealth?.status === 200 ? 'PASS_READ_ONLY' : 'UNMEASURED',
    endToEndTrace: 'BLOCKED_NOT_CONFIGURED_FOR_FIREBASE_CLIENT_PATH',
    inventoryMetrics: 'LOCAL_EMULATOR_ONLY',
  },
  matrix,
  parity: matrix.every(row => row.match) ? 'PASS' : 'BLOCKED',
  loadTestAllowed: false,
};

await mkdir('test-results/phase4', { recursive: true });
await writeFile('test-results/phase4/runtime-architecture.json', `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(result, null, 2));
