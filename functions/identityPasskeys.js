const crypto = require('node:crypto');
const webauthn = require('@simplewebauthn/server');

const CREDENTIALS = 'identity_passkeys';
const CHALLENGES = 'identity_passkey_challenges';
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const fail = (message, statusCode = 401) => { throw Object.assign(new Error(message), { statusCode }); };
const asTime = value => value?.toMillis?.() ?? new Date(value).getTime();
const active = identity => identity?.status === 'active' && !identity.lockedAt;

function resolvePasskeyOrigin(origin, emulator = process.env.FUNCTIONS_EMULATOR === 'true') {
  const allowed = ['https://app.hdconnect.net', 'https://hd-manager-c5839.web.app', 'https://hd-manager-c5839.firebaseapp.com'];
  let url;
  try { url = new URL(origin); } catch { fail('Nguồn đăng nhập không hợp lệ.', 403); }
  const local = emulator && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if (origin !== url.origin || (!allowed.includes(origin) && !local)) fail('Passkey chỉ được dùng trên website HD Manager được xác thực.', 403);
  return { origin: url.origin, rpID: url.hostname };
}

function createPasskeyService({ db, getVerifiedIdentity, verifyPassword, issueSession, logAudit, validateAccount = async () => {}, api = webauthn, now = () => Date.now() }) {
  const credentials = db.collection(CREDENTIALS);
  const challenges = db.collection(CHALLENGES);
  const identityRef = id => db.collection('identity_accounts').doc(id);
  const version = identity => hash(identity.passwordHash || '');
  const credentialRef = (id, rpID) => credentials.doc(hash(`${rpID}:${id}`));

  const throttle = async (key, limit) => {
    const ref = db.collection('identity_passkey_rate_limits').doc(hash(key));
    await db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      const row = snapshot.data() || {};
      const start = Number(row.start || 0);
      const count = now() - start < 60000 ? Number(row.count || 0) : 0;
      if (count >= limit) fail('Quá nhiều yêu cầu. Vui lòng thử lại sau một phút.', 429);
      tx.set(ref, { start: count ? start : now(), count: count + 1, expiresAt: new Date(now() + 60000) });
    });
  };
  const verifiedOwner = async (authorization, password) => {
    const owner = await getVerifiedIdentity(authorization);
    await throttle(`owner:${owner.identityId}`, 12);
    if (password !== undefined && !(await verifyPassword(String(password), owner.identity.passwordHash))) fail('Mật khẩu hiện tại không đúng.');
    return owner;
  };
  const makeChallenge = async (type, options, origin, rpID, extra = {}) => {
    const challengeId = crypto.randomBytes(32).toString('base64url');
    await challenges.doc(challengeId).create({ type, challenge: options.challenge, origin, rpID, expiresAt: new Date(now() + 5 * 60000), ...extra });
    return { success: true, challengeId, options };
  };
  const readChallenge = async (tx, challengeId, type, origin, ownerId) => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(challengeId || '')) fail('Yêu cầu xác thực không hợp lệ.');
    const ref = challenges.doc(challengeId);
    const snap = tx === db ? await ref.get() : await tx.get(ref);
    const row = snap.data();
    if (!row || row.type !== type || row.origin !== origin || !(asTime(row.expiresAt) > now()) || (ownerId && row.identityId !== ownerId)) fail('Yêu cầu xác thực đã hết hạn. Vui lòng thử lại.');
    return { ref, row };
  };

  return async ({ operation, origin, authorization, body = {}, ip = '' }) => {
    const { rpID } = resolvePasskeyOrigin(origin);
    if (JSON.stringify(body).length > 65536) fail('Yêu cầu quá lớn.', 413);
    await throttle(`ip:${ip}`, 40);
    if (operation === 'register-options') {
      const { identityId, identity } = await verifiedOwner(authorization, body.password || '');
      const existing = await credentials.where('identityId', '==', identityId).where('rpID', '==', rpID).get();
      if (existing.size >= 20) fail('Đã đạt giới hạn 20 passkey. Hãy thu hồi một passkey cũ.', 400);
      const options = await api.generateRegistrationOptions({
        rpName: 'HD Manager', rpID,
        userID: new Uint8Array(crypto.createHash('sha256').update(identityId).digest()),
        userName: identity.phone || identity.username || identityId,
        userDisplayName: identity.name || identity.phone || 'HD Manager',
        attestationType: 'none', timeout: 60000,
        authenticatorSelection: { residentKey: 'required', userVerification: 'required', authenticatorAttachment: 'platform' },
        excludeCredentials: existing.docs.map(doc => ({ id: doc.data().credentialId })),
      });
      return makeChallenge('register', options, origin, rpID, { identityId, version: version(identity), label: String(body.label || 'Passkey').slice(0, 80) });
    }
    if (operation === 'register-verify') {
      const { identityId } = await verifiedOwner(authorization);
      const { row } = await readChallenge(db, body.challengeId, 'register', origin, identityId);
      let result;
      try {
        result = await api.verifyRegistrationResponse({ response: body.response, expectedChallenge: row.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
      } catch { fail('Không xác minh được passkey.'); }
      if (!result?.verified) fail('Không xác minh được passkey.');
      const { credential } = result.registrationInfo;
      const ref = credentialRef(credential.id, rpID);
      await db.runTransaction(async tx => {
        const challenge = await readChallenge(tx, body.challengeId, 'register', origin, identityId);
        const owner = (await tx.get(identityRef(identityId))).data();
        const existing = await tx.get(ref);
        if (!active(owner) || challenge.row.version !== version(owner)) fail('Tài khoản đã thay đổi. Hãy đăng nhập lại.');
        if (existing.exists) fail('Passkey này đã được đăng ký.', 409);
        await validateAccount(tx, owner);
        tx.create(ref, { identityId, rpID, credentialId: credential.id, publicKey: Buffer.from(credential.publicKey).toString('base64'), counter: credential.counter, transports: credential.transports || [], version: version(owner), label: row.label, createdAt: new Date(now()), lastUsedAt: null });
        tx.delete(challenge.ref);
      });
      await logAudit(identityId, 'passkey_registered', { passkeyId: ref.id });
      return { success: true };
    }
    if (operation === 'login-options') {
      const options = await api.generateAuthenticationOptions({ rpID, userVerification: 'required', timeout: 60000 });
      return makeChallenge('login', options, origin, rpID);
    }
    if (operation === 'login-verify') {
      const { row } = await readChallenge(db, body.challengeId, 'login', origin);
      const id = body.response?.id;
      if (typeof id !== 'string' || id.length > 2048) fail('Passkey không hợp lệ.');
      const ref = credentialRef(id, rpID);
      const saved = (await ref.get()).data();
      if (!saved) fail('Passkey chưa đăng ký hoặc đã bị thu hồi.');
      let result;
      try {
        result = await api.verifyAuthenticationResponse({ response: body.response, expectedChallenge: row.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true, credential: { id: saved.credentialId, publicKey: new Uint8Array(Buffer.from(saved.publicKey, 'base64')), counter: saved.counter, transports: saved.transports } });
      } catch { fail('Không xác minh được passkey.'); }
      if (!result?.verified) fail('Không xác minh được passkey.');
      const identity = await db.runTransaction(async tx => {
        const challenge = await readChallenge(tx, body.challengeId, 'login', origin);
        const fresh = (await tx.get(ref)).data();
        const owner = (await tx.get(identityRef(saved.identityId))).data();
        if (!fresh || fresh.counter !== saved.counter || !active(owner) || fresh.version !== version(owner)) fail('Passkey đã hết hiệu lực. Vui lòng đăng nhập bằng mật khẩu.');
        await validateAccount(tx, owner);
        tx.update(ref, { counter: result.authenticationInfo.newCounter, lastUsedAt: new Date(now()) });
        tx.delete(challenge.ref);
        return owner;
      });
      const session = await issueSession({ identityId: saved.identityId, identity, device: body.device });
      await logAudit(saved.identityId, 'passkey_login', { passkeyId: ref.id });
      return { success: true, ...session };
    }
    if (operation === 'list') {
      const { identityId, identity } = await verifiedOwner(authorization);
      const rows = await credentials.where('identityId', '==', identityId).where('rpID', '==', rpID).get();
      return { success: true, passkeys: rows.docs.map(doc => ({ id: doc.id, label: doc.data().label, active: doc.data().version === version(identity), createdAt: new Date(asTime(doc.data().createdAt)).toISOString() })) };
    }
    if (operation === 'revoke') {
      const { identityId } = await verifiedOwner(authorization, body.password || '');
      if (!/^[a-f0-9]{64}$/.test(body.id || '')) fail('Passkey không hợp lệ.', 400);
      const ref = credentials.doc(body.id);
      await db.runTransaction(async tx => {
        const saved = (await tx.get(ref)).data();
        if (!saved || saved.identityId !== identityId || saved.rpID !== rpID) fail('Không tìm thấy passkey.', 404);
        tx.delete(ref);
      });
      await logAudit(identityId, 'passkey_revoked', { passkeyId: body.id });
      return { success: true };
    }
    fail('Yêu cầu passkey không hợp lệ.', 400);
  };
}

module.exports = { createPasskeyService, resolvePasskeyOrigin };
