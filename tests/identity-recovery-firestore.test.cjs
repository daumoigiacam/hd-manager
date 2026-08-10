const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const admin = require('../functions/node_modules/firebase-admin');
const {
  IDENTITY_ACCOUNT_COLLECTION,
  createIdentityCenter,
  createRecoveryToken,
} = require('../functions/identityCenter');

const projectId = process.env.GCLOUD_PROJECT || 'hd-manager-identity-recovery-test';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST is required. Run this test through Firebase Emulator.');
}

const app = admin.apps.length ? admin.app() : admin.initializeApp({ projectId });
const db = app.firestore();
const identityCenter = createIdentityCenter({
  db,
  admin,
  getAppId: () => 'hd-manager-production',
});

const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const identityId = `employee_recovery_${suffix}`;
const username = `recovery_${suffix}`;
const identityRef = db.collection(IDENTITY_ACCOUNT_COLLECTION).doc(identityId);

const seedResetToken = async ({ token, deviceId = 'device-a', expiresAt, docId = tokenHash(token) }) => {
  await identityRef.collection('reset_tokens').doc(docId).set({
    identityId,
    tokenHash: tokenHash(token),
    createdAt: new Date(),
    expiresAt: expiresAt || new Date(Date.now() + 10 * 60 * 1000),
    usedAt: null,
    deviceId,
  });
};

const run = async () => {
  await identityRef.set({
    id: identityId,
    identityKey: identityId,
    accountType: 'employee',
    companyId: 'company-recovery-test',
    appId: 'hd-manager-production',
    username,
    usernameNormalized: username,
    phone: '0399999999',
    phoneNormalized: '0399999999',
    status: 'active',
  });

  const routedToken = createRecoveryToken(identityId);
  await seedResetToken({ token: routedToken });
  const completed = await identityCenter.completeRecovery({
    resetToken: routedToken,
    password: 'Recovery1234',
    identifier: username,
    device: { deviceId: 'device-a' },
  });
  assert.equal(completed.success, true);
  const updatedIdentity = (await identityRef.get()).data();
  assert.match(updatedIdentity.passwordHash, /^scrypt-v1\$/);
  assert.ok((await identityRef.collection('reset_tokens').doc(tokenHash(routedToken)).get()).data().usedAt);

  const reused = await identityCenter.completeRecovery({
    resetToken: routedToken,
    password: 'Recovery5678',
    identifier: username,
    device: { deviceId: 'device-a' },
  });
  assert.equal(reused.success, false);
  assert.equal(reused.statusCode, 400);

  const wrongDeviceToken = createRecoveryToken(identityId);
  await seedResetToken({ token: wrongDeviceToken, deviceId: 'device-a' });
  const wrongDevice = await identityCenter.completeRecovery({
    resetToken: wrongDeviceToken,
    password: 'Recovery5678',
    identifier: username,
    device: { deviceId: 'device-b' },
  });
  assert.equal(wrongDevice.success, false);
  assert.equal(wrongDevice.statusCode, 400);

  const expiredToken = createRecoveryToken(identityId);
  await seedResetToken({ token: expiredToken, expiresAt: new Date(Date.now() - 1000) });
  const expired = await identityCenter.completeRecovery({
    resetToken: expiredToken,
    password: 'Recovery5678',
    identifier: username,
    device: { deviceId: 'device-a' },
  });
  assert.equal(expired.success, false);
  assert.equal(expired.statusCode, 400);

  const legacyToken = `legacy_${suffix}`;
  await seedResetToken({ token: legacyToken, docId: `legacy_doc_${suffix}` });
  const legacyIdentityLookup = await db.collection(IDENTITY_ACCOUNT_COLLECTION)
    .where('usernameNormalized', '==', username)
    .limit(1)
    .get();
  assert.equal(legacyIdentityLookup.empty, false, 'Legacy identifier must resolve to its identity account');
  const legacyTokenLookup = await identityRef.collection('reset_tokens')
    .where('tokenHash', '==', tokenHash(legacyToken))
    .limit(1)
    .get();
  assert.equal(legacyTokenLookup.empty, false, 'Legacy reset token must be discoverable inside its account');
  const legacyCompleted = await identityCenter.completeRecovery({
    resetToken: legacyToken,
    password: 'Recovery9012',
    identifier: username,
    device: { deviceId: 'device-a' },
  });
  assert.equal(legacyCompleted.success, true, JSON.stringify(legacyCompleted));

  console.log('Identity recovery Firestore integration checks passed.');
};

run()
  .finally(async () => {
    await db.recursiveDelete(identityRef);
    await app.delete();
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
