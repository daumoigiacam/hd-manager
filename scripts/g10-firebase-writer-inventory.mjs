import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();
const outputDirectory = path.join(workspaceRoot, 'hd-connect-platform', 'migration', 'g10');
const outputFile = path.join(outputDirectory, 'FIREBASE-WRITER-INVENTORY.csv');

const scanRoots = [
  'src',
  'functions',
  'electron',
  'ios-expo',
  'android',
  'platform',
  'firebase.json',
  'firestore.rules',
  'storage.rules',
  'package.json',
  'vite.config.js',
];

const supportedExtensions = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.rules', '.gradle', '.kt', '.java', '.xml',
]);
const ignoredDirectoryNames = new Set([
  '.git', 'node_modules', 'dist', 'build', '.next', 'coverage', 'release', 'artifacts', 'test-results',
]);

const patterns = [
  { pattern: /(?:from\s+['"]firebase(?:\/[\w-]+)?['"]|require\(['"]firebase(?:\/[\w-]+)?['"]\))/, access: 'READ', service: 'Firebase SDK', label: 'firebase-sdk-import' },
  { pattern: /(?:initializeApp\(|getAuth\(|onAuthStateChanged\(|signInWith|signOut\(|sendPasswordResetEmail\(|createUserWithEmailAndPassword\()/i, access: 'WRITE', service: 'Firebase Auth', label: 'firebase-auth' },
  { pattern: /(?:onSnapshot\(|firebaseOnSnapshot\(|getDoc\(|getDocs\(|firebaseGetDoc\(|firebaseGetDocs\(|getFirestore\(|initializeFirestore\(|firebaseQuery\(|firebaseWhere\(|collection\()/i, access: 'READ', service: 'Cloud Firestore', label: 'firestore-read' },
  { pattern: /(?:setDoc\(|firebaseSetDoc\(|updateDoc\(|deleteDoc\(|firebaseDeleteDoc\(|runTransaction\(|firebaseRunTransaction\(|batch\.commit\(|writeBatch\()/i, access: 'WRITE', service: 'Cloud Firestore', label: 'firestore-write' },
  { pattern: /firestore\.googleapis\.com|data:runQuery|documents\/artifacts/i, access: 'READ/WRITE', service: 'Firestore REST API', label: 'firestore-rest' },
  { pattern: /(?:firebase\/storage|getStorage\(|uploadBytes\(|uploadString\(|getDownloadURL\(|deleteObject\()/i, access: 'READ/WRITE', service: 'Firebase Storage', label: 'firebase-storage' },
  { pattern: /(?:firebase-functions|onCall\(|onRequest\(|httpsCallable\(|cloudfunctions\.net)/i, access: 'READ/WRITE', service: 'Firebase Functions', label: 'firebase-functions' },
  { pattern: /(?:firebase\.json|firebaseapp\.com|web\.app|Firebase Hosting)/i, access: 'READ', service: 'Firebase Hosting', label: 'firebase-hosting' },
  { pattern: /(?:PayOS|SePay|VietQR|\/api\/(?:sepay|payos)\/|customerCreateDebtPayment|createSepayPaymentRequest|createPayosPaymentLink|sepayWebhook|payosWebhook)/i, access: 'READ/WRITE', service: 'Payment helper', label: 'payment-helper' },
  { pattern: /(?:offline persistence|offline queue|pendingFirebaseWrite|BroadcastChannel)/i, access: 'READ/WRITE', service: 'Offline synchronization', label: 'offline-sync' },
];

const csvEscape = (value) => {
  const normalized = `${value ?? ''}`.replace(/\r?\n/g, ' ').trim();
  return /[",]/.test(normalized) ? `"${normalized.replaceAll('"', '""')}"` : normalized;
};

const normalizePath = (filePath) => path.relative(workspaceRoot, filePath).replaceAll('\\', '/');

const isGeneratedDirectory = (directory) => {
  const relativeDirectory = normalizePath(directory);
  return relativeDirectory === 'android/app/src/main/assets'
    || relativeDirectory.startsWith('android/app/src/main/assets/')
    || relativeDirectory === 'ios-expo/.expo'
    || relativeDirectory.startsWith('ios-expo/.expo/');
};

const collectFiles = (relativeEntry) => {
  const absoluteEntry = path.join(workspaceRoot, relativeEntry);
  if (!fs.existsSync(absoluteEntry)) return [];
  const stats = fs.statSync(absoluteEntry);
  if (stats.isFile()) return [absoluteEntry];

  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const childDirectory = path.join(directory, entry.name);
        if (!ignoredDirectoryNames.has(entry.name) && !isGeneratedDirectory(childDirectory)) visit(childDirectory);
        continue;
      }
      if (supportedExtensions.has(path.extname(entry.name).toLowerCase())) {
        files.push(path.join(directory, entry.name));
      }
    }
  };
  visit(absoluteEntry);
  return files;
};

const inferFunction = (line, current = 'module scope') => {
  const match = line.match(/(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/)
    || line.match(/(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>/)
    || line.match(/exports\.([A-Za-z0-9_$]+)\s*=/)
    || line.match(/(?:async\s+)?([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{/);
  return match?.[1] || current;
};

const inferDomain = (context) => {
  const value = context.toLowerCase();
  if (/auth|identity|password|pin|session|device/.test(value)) return 'Auth / Identity';
  if (/customer|client|contact/.test(value)) return 'Customer';
  if (/product|catalog|unit|price/.test(value)) return 'Product';
  if (/order|quotation|dispatch|delivery/.test(value)) return 'Order';
  if (/payment|payos|sepay|vietqr|bank/.test(value)) return 'Payment';
  if (/inventory|warehouse|stock|batch|lot/.test(value)) return 'Inventory';
  if (/debt|loan|receivable|payable/.test(value)) return 'Debt';
  if (/employee|attendance|payroll|salary|hr/.test(value)) return 'Employee / HR';
  if (/storage|upload|attachment|media/.test(value)) return 'Storage';
  if (/notification|message|zalo|campaign/.test(value)) return 'Notification';
  return 'Platform / Other';
};

const replacementFor = (domain) => ({
  'Auth / Identity': '/api/v1/auth/* and /api/v1/identity/*',
  Customer: '/api/v1/master-data/customers',
  Product: '/api/v1/products and /api/v1/master-data/units',
  Order: '/api/v1/sales/orders only after target customer, warehouse, product, and unit IDs resolve',
  Payment: '/api/v1/cx-suite/payments is read-only; PaymentPosting is blocked',
  Inventory: 'BLOCKED: no approved target inventory semantics or opening balance',
  Debt: 'BLOCKED: no approved target debt semantics or opening balance',
  'Employee / HR': 'TRANSITIONAL: VPS target contract is not verified',
  Storage: 'TRANSITIONAL: Firebase Storage remains until an object-storage policy is approved',
  Notification: 'TRANSITIONAL: Notification provider migration is not approved',
  'Platform / Other': 'TRANSITIONAL: legacy Firebase dependency',
}[domain]);

const statusFor = (relativePath, domain, access) => {
  if (relativePath.startsWith('src/mocks/')) return 'VPS_STAGING_GUARD';
  if (relativePath.startsWith('functions/')) return 'LEGACY_FIREBASE_FUNCTION';
  if (domain === 'Auth / Identity' || domain === 'Customer' || domain === 'Product') {
    return access.includes('WRITE') ? 'BLOCKED_IN_VPS_STAGING' : 'VPS_STAGING_ADAPTER_OR_LEGACY_READ';
  }
  if (domain === 'Order' || domain === 'Payment' || domain === 'Inventory' || domain === 'Debt') {
    return 'BLOCKED_OR_TRANSITIONAL_IN_VPS_STAGING';
  }
  return 'TRANSITIONAL_FIREBASE_DEPENDENCY';
};

const currentBehavior = (label, access) => {
  if (label === 'firestore-write') return 'Legacy Firestore mutation path; guarded to fail before write in VPS staging.';
  if (label === 'firestore-rest') return 'Legacy Firestore REST helper; URL builder returns empty in VPS staging.';
  if (label === 'firebase-auth') return 'Legacy Firebase Auth flow; VPS staging aliases it and uses the VPS Identity API.';
  if (label === 'firebase-functions') return 'Legacy Firebase Function integration; not available to VPS staging runtime.';
  if (label === 'payment-helper') return 'Legacy payment helper; direct provider/Firebase Hosting flow is blocked in VPS staging.';
  if (label === 'offline-sync') return 'Legacy offline synchronization; no VPS dual-write is allowed.';
  return `${access} dependency found in legacy source.`;
};

const accessFor = (descriptor, line) => {
  const value = `${line || ''}`;
  if (descriptor.label === 'firebase-auth') {
    return /signInWith|signOut\(|sendPasswordResetEmail\(|createUserWithEmailAndPassword\(/i.test(value)
      ? 'WRITE'
      : 'READ';
  }
  if (descriptor.label === 'firestore-rest') {
    return /PATCH|method:\s*['"]POST['"]|writeFirestore/i.test(value) ? 'WRITE' : 'READ';
  }
  if (descriptor.label === 'payment-helper') {
    return /fetch\(|create(?:Sepay|Payos)|customerCreateDebtPayment|sync(?:Sepay|Payos)|Webhook/i.test(value)
      ? 'WRITE'
      : 'READ';
  }
  return descriptor.access;
};

const rows = [];
for (const filePath of scanRoots.flatMap(collectFiles).sort()) {
  const relativePath = normalizePath(filePath);
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  let currentFunction = 'module scope';

  lines.forEach((line, index) => {
    currentFunction = inferFunction(line, currentFunction);
    const context = `${currentFunction} ${line} ${lines.slice(Math.max(0, index - 3), index + 4).join(' ')}`;
    for (const descriptor of patterns) {
      if (!descriptor.pattern.test(line)) continue;
      const domain = inferDomain(context);
      const access = accessFor(descriptor, line);
      rows.push({
        file: relativePath,
        line: index + 1,
        function: currentFunction,
        domain,
        access,
        service: descriptor.service,
        behavior: currentBehavior(descriptor.label, access),
        replacement: replacementFor(domain),
        status: statusFor(relativePath, domain, access),
      });
    }
  });
}

const header = [
  'FILE',
  'LINE',
  'FUNCTION',
  'DOMAIN',
  'READ/WRITE',
  'FIREBASE_SERVICE',
  'CURRENT_BEHAVIOR',
  'VPS_REPLACEMENT',
  'STATUS',
];
const content = [
  header.join(','),
  ...rows.map((row) => [
    row.file,
    row.line,
    row.function,
    row.domain,
    row.access,
    row.service,
    row.behavior,
    row.replacement,
    row.status,
  ].map(csvEscape).join(',')),
].join('\n');

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(outputFile, `${content}\n`);

const writerCount = rows.filter((row) => row.access.includes('WRITE')).length;
console.log(JSON.stringify({ outputFile: normalizePath(outputFile), dependencies: rows.length, writers: writerCount }, null, 2));
