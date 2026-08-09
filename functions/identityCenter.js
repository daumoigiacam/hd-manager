const crypto = require('crypto');

const IDENTITY_ACCOUNT_COLLECTION = 'identity_accounts';
const IDENTITY_AUDIT_COLLECTION = 'identity_audit_logs';
const IDENTITY_RATE_LIMIT_COLLECTION = 'identity_rate_limits';
const LEGACY_HASH_SCHEME = 'pbkdf2-sha256-v1';
const LEGACY_HASH_ITERATIONS = 120000;
const PASSWORD_HASH_SCHEME = 'scrypt-v1';
const DEFAULT_FIRST_LOGIN_PASSWORD = '12345678';
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_BLOCK_MS = 10 * 60 * 1000;
const COMPANY_REGISTRATION_SETTING_KEYS = new Set([
  'bankId',
  'bankName',
  'bankAccountName',
  'bankAccountNumber',
  'invoiceQrTemplate',
  'autoReconcileByOrderCode',
  'customerLoyaltyEnabled',
  'loyaltyEarnAmountPerPoint',
  'loyaltyRedeemValuePerPoint',
  'customerCareReminderEnabled',
  'customerCareInactiveDays',
  'salaryAdvancePercent',
  'salaryAdvancePercentByDepartment',
  'rolePermissions'
]);

const normalizePhone = (value = '') => {
  const digits = `${value || ''}`.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('84') && digits.length >= 10) return `0${digits.slice(2)}`;
  if (!digits.startsWith('0') && digits.length === 9) return `0${digits}`;
  return digits;
};

const buildPhoneVariants = (value = '') => {
  const digits = `${value || ''}`.replace(/\D/g, '');
  const canonical = normalizePhone(value);
  const stripped = digits.replace(/^0+/, '');
  const values = new Set([digits, canonical, stripped].filter(Boolean));
  if (canonical.startsWith('0')) values.add(`84${canonical.slice(1)}`);
  if (stripped) {
    values.add(`0${stripped}`);
    values.add(`84${stripped}`);
  }
  return [...values].slice(0, 10);
};

const normalizeUsername = (value = '') => `${value || ''}`.trim().toLowerCase().replace(/\s+/g, '');
const isPhoneIdentifier = (value = '') => /\d/.test(`${value || ''}`) && normalizePhone(value).length >= 9;
const safeIdPart = (value = '') => `${value || ''}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
const asIso = (value = new Date()) => value instanceof Date ? value.toISOString() : new Date(value).toISOString();
const timingSafeTextEqual = (left = '', right = '') => {
  const leftBuffer = Buffer.from(`${left || ''}`);
  const rightBuffer = Buffer.from(`${right || ''}`);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};
const hashOpaqueSecret = (value = '') => crypto.createHash('sha256').update(`${value || ''}`).digest('hex');
const makeOpaqueSecret = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const createRecoveryToken = (identityId = '') => {
  const safeIdentityId = safeIdPart(identityId);
  if (!safeIdentityId || safeIdentityId !== identityId) throw new Error('Invalid recovery identity.');
  return `${Buffer.from(safeIdentityId, 'utf8').toString('base64url')}.${makeOpaqueSecret(32)}`;
};
const getRecoveryIdentityIdFromToken = (resetToken = '') => {
  const [encodedIdentityId, secret, ...extraParts] = `${resetToken || ''}`.split('.');
  if (!encodedIdentityId || !secret || extraParts.length > 0 || secret.length < 32) return '';
  try {
    const identityId = Buffer.from(encodedIdentityId, 'base64url').toString('utf8');
    return identityId && safeIdPart(identityId) === identityId ? identityId : '';
  } catch {
    return '';
  }
};
const sanitizeCompanyRegistrationSettings = (settings = {}) => Object.fromEntries(
  Object.entries(settings && typeof settings === 'object' ? settings : {})
    .filter(([key]) => COMPANY_REGISTRATION_SETTING_KEYS.has(key))
);

const validatePassword = (password = '') => {
  const value = `${password || ''}`;
  if (value.length < 8) return 'Mật khẩu cần ít nhất 8 ký tự.';
  if (!/[A-Za-zÀ-ỹ]/u.test(value) || !/\d/.test(value)) return 'Mật khẩu cần có ít nhất 1 chữ cái và 1 chữ số.';
  return '';
};

const validatePin = (pin = '') => /^\d{6}$/.test(`${pin || ''}`) ? '' : 'PIN phải gồm đúng 6 chữ số.';

const hashPassword = async (password = '') => {
  const salt = crypto.randomBytes(16);
  const hash = await new Promise((resolve, reject) => {
    crypto.scrypt(`${password}`, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 }, (error, value) => error ? reject(error) : resolve(value));
  });
  return `${PASSWORD_HASH_SCHEME}$${salt.toString('base64url')}$${Buffer.from(hash).toString('base64url')}`;
};

const verifyPassword = async (password = '', storedHash = '') => {
  const [scheme, saltText, expectedText] = `${storedHash || ''}`.split('$');
  if (scheme !== PASSWORD_HASH_SCHEME || !saltText || !expectedText) return false;
  try {
    const actual = await new Promise((resolve, reject) => {
      crypto.scrypt(`${password}`, Buffer.from(saltText, 'base64url'), 64, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 }, (error, value) => error ? reject(error) : resolve(value));
    });
    return timingSafeTextEqual(Buffer.from(actual).toString('base64url'), expectedText);
  } catch (error) {
    return false;
  }
};

const verifyLegacyPassword = (password = '', storedHash = '') => {
  const [scheme, iterationsText, saltHex, expectedHex] = `${storedHash || ''}`.split('$');
  const iterations = Number(iterationsText);
  if (scheme !== LEGACY_HASH_SCHEME || !Number.isInteger(iterations) || iterations < 100000 || !/^[0-9a-f]+$/i.test(saltHex || '') || !/^[0-9a-f]+$/i.test(expectedHex || '')) return false;
  try {
    const actual = crypto.pbkdf2Sync(`${password}`, Buffer.from(saltHex, 'hex'), iterations, 32, 'sha256').toString('hex');
    return timingSafeTextEqual(actual, expectedHex);
  } catch (error) {
    return false;
  }
};

const sanitizeDevice = (device = {}) => ({
  deviceId: safeIdPart(device.deviceId) || `device_${crypto.randomUUID()}`,
  name: `${device.name || 'Thiết bị chưa đặt tên'}`.slice(0, 120),
  os: `${device.os || 'unknown'}`.slice(0, 60),
  platform: `${device.platform || 'web'}`.slice(0, 30),
  appVersion: `${device.appVersion || 'web'}`.slice(0, 60)
});

const publicPath = (appId, collectionName, id) => `artifacts/${appId}/public/data/${collectionName}/${id}`;

const findPublicDocumentsByField = async (db, appId, collectionName, field, values = []) => {
  const chunks = [];
  for (let index = 0; index < values.length; index += 10) chunks.push(values.slice(index, index + 10));
  const snapshots = await Promise.all(chunks.map(chunk => db.collection(`artifacts/${appId}/public/data/${collectionName}`).where(field, 'in', chunk).get()));
  const results = [];
  snapshots.forEach(snapshot => snapshot.docs.forEach(doc => results.push({ id: doc.id, data: doc.data(), ref: doc.ref })));
  return results;
};

const identityIdForPublicAccount = (accountType, publicId) => `${accountType}_${safeIdPart(publicId)}`;

const getPublicAccountFromIdentifier = async ({ db, appId, identifier }) => {
  const raw = `${identifier || ''}`.trim();
  const isPhone = isPhoneIdentifier(raw);
  const values = isPhone ? buildPhoneVariants(raw) : [raw, normalizeUsername(raw)].filter(Boolean);
  const field = isPhone ? 'phone' : 'username';
  const employees = await findPublicDocumentsByField(db, appId, 'employees', field, values);
  const employee = employees.find(({ data }) => !data?.isArchived && `${data?.status || 'active'}` !== 'blocked');
  if (employee) {
    return {
      accountType: 'employee',
      publicCollection: 'employees',
      publicId: employee.id,
      publicRef: employee.ref,
      data: employee.data,
      appUser: {
        id: employee.id,
        companyId: employee.data.companyId || employee.data.company_id || '',
        role: employee.data.role || 'employee',
        name: employee.data.name || '',
        phone: employee.data.phone || ''
      }
    };
  }

  const accounts = await findPublicDocumentsByField(db, appId, 'customer_accounts', field, values);
  const customerAccount = accounts.find(({ data }) => !data?.isArchived && `${data?.status || 'active'}` !== 'blocked');
  if (customerAccount) {
    const customerId = customerAccount.data.customerId || customerAccount.data.customer_id || '';
    const customerRef = customerId ? db.doc(publicPath(appId, 'customers', customerId)) : null;
    const customerSnap = customerRef ? await customerRef.get() : null;
    const customer = customerSnap?.exists ? customerSnap.data() : {};
    return {
      accountType: 'customer',
      publicCollection: 'customer_accounts',
      publicId: customerAccount.id,
      publicRef: customerAccount.ref,
      data: customerAccount.data,
      appUser: {
        id: customerAccount.id,
        accountId: customerAccount.id,
        customerId,
        companyId: customerAccount.data.companyId || customerAccount.data.company_id || customer.companyId || '',
        role: 'customer',
        name: customer.name || '',
        phone: customerAccount.data.phone || customer.phone || ''
      }
    };
  }

  const customers = await findPublicDocumentsByField(db, appId, 'customers', field, values);
  const customer = customers.find(({ data }) => !data?.isArchived);
  if (!customer) return null;
  const accountId = `ca_${customer.id}`;
  return {
    accountType: 'customer',
    publicCollection: 'customers',
    publicId: customer.id,
    publicRef: customer.ref,
    data: customer.data,
    appUser: {
      id: accountId,
      accountId,
      customerId: customer.id,
      companyId: customer.data.companyId || customer.data.company_id || '',
      role: 'customer',
      name: customer.data.name || '',
      phone: customer.data.phone || ''
    }
  };
};

const buildPublicIdentity = (identity = {}) => ({
  id: identity.appUserId || '',
  accountId: identity.accountType === 'customer' ? identity.appUserId : undefined,
  customerId: identity.customerId || undefined,
  companyId: identity.companyId || '',
  role: identity.role || 'employee',
  name: identity.name || '',
  phone: identity.phone || '',
  username: identity.username || '',
  accountType: identity.accountType || 'employee'
});

const createIdentityCenter = ({ db, admin, getAppId }) => {
  const getIdentityRef = id => db.collection(IDENTITY_ACCOUNT_COLLECTION).doc(id);
  const logAudit = async (accountId, action, metadata = {}) => {
    const now = new Date();
    await db.collection(IDENTITY_AUDIT_COLLECTION).add({
      accountId,
      action,
      metadata,
      createdAt: now,
      createdAtIso: now.toISOString(),
      immutable: true
    });
  };

  const createOrMigrateIdentity = async ({ publicAccount, password, identifier }) => {
    const identityId = identityIdForPublicAccount(publicAccount.accountType, publicAccount.publicId);
    const identityRef = getIdentityRef(identityId);
    const existing = await identityRef.get();
    const legacyHash = publicAccount.data.password_hash || publicAccount.data.passwordHash || '';
    const username = normalizeUsername(publicAccount.data.username || '');
    const phone = normalizePhone(publicAccount.appUser.phone || publicAccount.data.phone || identifier);

    if (existing.exists) {
      const identity = existing.data();
      if (identity.status === 'blocked' || identity.lockedAt) return { error: 'Tài khoản đang bị khóa. Vui lòng liên hệ quản trị.' };
      if (!(await verifyPassword(password, identity.passwordHash))) return { error: 'Tên đăng nhập hoặc mật khẩu không đúng.' };
      return { identityId, identity };
    }

    const legacyVerified = legacyHash ? verifyLegacyPassword(password, legacyHash) : password === DEFAULT_FIRST_LOGIN_PASSWORD;
    if (!legacyVerified) return { error: 'Tên đăng nhập hoặc mật khẩu không đúng.' };

    const now = new Date();
    const identity = {
      id: identityId,
      accountType: publicAccount.accountType,
      publicCollection: publicAccount.publicCollection,
      publicId: publicAccount.publicId,
      appUserId: publicAccount.appUser.id,
      customerId: publicAccount.appUser.customerId || null,
      companyId: publicAccount.appUser.companyId,
      role: publicAccount.appUser.role,
      name: publicAccount.appUser.name,
      phone: publicAccount.appUser.phone,
      phoneNormalized: phone,
      username,
      usernameNormalized: username,
      passwordHash: await hashPassword(password),
      requiresPasswordChange: !legacyHash,
      setup: {
        passwordChanged: Boolean(legacyHash),
        usernameSet: Boolean(username),
        pinSet: false,
        biometricEnabled: false,
        trustedDevice: false
      },
      status: 'active',
      createdAt: now,
      createdAtIso: now.toISOString(),
      updatedAt: now,
      updatedAtIso: now.toISOString(),
      migratedFromLegacyPassword: Boolean(legacyHash)
    };
    const batch = db.batch();
    batch.create(identityRef, identity);
    if (legacyHash) {
      batch.update(publicAccount.publicRef, {
        password_hash: admin.firestore.FieldValue.delete(),
        passwordHash: admin.firestore.FieldValue.delete(),
        identityMigratedAt: now.toISOString()
      });
    }
    await batch.commit();
    await logAudit(identityId, legacyHash ? 'identity_password_migrated' : 'identity_first_login_initialized', { accountType: publicAccount.accountType });
    return { identityId, identity };
  };

  const findIdentity = async (identifier = '') => {
    const raw = `${identifier || ''}`.trim();
    if (!raw) return null;
    const field = isPhoneIdentifier(raw) ? 'phoneNormalized' : 'usernameNormalized';
    const value = field === 'phoneNormalized' ? normalizePhone(raw) : normalizeUsername(raw);
    const snapshot = await db.collection(IDENTITY_ACCOUNT_COLLECTION).where(field, '==', value).limit(1).get();
    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  };

  const issueSession = async ({ identityId, identity, device }) => {
    const now = new Date();
    const cleanDevice = sanitizeDevice(device);
    const deviceRef = getIdentityRef(identityId).collection('devices').doc(cleanDevice.deviceId);
    const deviceSnap = await deviceRef.get();
    const currentDevice = deviceSnap.exists ? deviceSnap.data() : {};
    const claims = {
      identityId,
      companyId: identity.companyId || '',
      appUserId: identity.appUserId || '',
      customerId: identity.customerId || '',
      role: identity.role || 'employee',
      accountType: identity.accountType || 'employee',
      name: identity.name || '',
      phone: identity.phone || '',
      username: identity.username || ''
    };
    const firebaseUid = `identity_${safeIdPart(identityId)}`;

    // Persist the same tenant claims used by the custom token. This keeps
    // refreshed Firebase ID tokens company-scoped instead of reverting to a
    // claim-less session after the original custom token expires.
    try {
      await admin.auth().setCustomUserClaims(firebaseUid, claims);
    } catch (error) {
      if (error?.code !== 'auth/user-not-found') throw error;
      try {
        await admin.auth().createUser({ uid: firebaseUid });
      } catch (createError) {
        if (createError?.code !== 'auth/uid-already-exists') throw createError;
      }
      await admin.auth().setCustomUserClaims(firebaseUid, claims);
    }
    const customToken = await admin.auth().createCustomToken(firebaseUid, claims);
    await deviceRef.set({
      ...cleanDevice,
      trusted: Boolean(currentDevice.trusted),
      revokedAt: null,
      lastLoginAt: now,
      lastLoginAtIso: now.toISOString(),
      createdAt: currentDevice.createdAt || now,
      createdAtIso: currentDevice.createdAtIso || now.toISOString(),
      updatedAt: now,
      updatedAtIso: now.toISOString()
    }, { merge: true });
    await getIdentityRef(identityId).set({ updatedAt: now, updatedAtIso: now.toISOString(), lastLoginAt: now, lastLoginAtIso: now.toISOString() }, { merge: true });
    await logAudit(identityId, 'login', { deviceId: cleanDevice.deviceId, platform: cleanDevice.platform });
    return {
      customToken,
      identityKey: identityId,
      identity: { ...buildPublicIdentity(identity), identityKey: identityId },
      device: { ...cleanDevice, trusted: Boolean(currentDevice.trusted) },
      requiresSetup: Boolean(identity.requiresPasswordChange || !identity.setup?.usernameSet || !identity.setup?.pinSet || !identity.setup?.trustedDevice),
      setup: identity.setup || {}
    };
  };

  const registerCompany = async ({ companyName, phone, password, device, appId, companySettings = {} }) => {
    const normalizedName = `${companyName || ''}`.trim().replace(/\s+/g, ' ');
    const normalizedPhone = normalizePhone(phone);
    const resolvedAppId = getAppId(appId);
    const passwordError = validatePassword(password);
    if (normalizedName.length < 2 || normalizedName.length > 160) {
      return { success: false, statusCode: 400, message: 'Ten doanh nghiep khong hop le.' };
    }
    if (normalizedPhone.length < 9 || normalizedPhone.length > 11) {
      return { success: false, statusCode: 400, message: 'So dien thoai khong hop le.' };
    }
    if (passwordError) return { success: false, statusCode: 400, message: passwordError };

    const [existingIdentity, existingPublicAccount] = await Promise.all([
      findIdentity(normalizedPhone),
      getPublicAccountFromIdentifier({ db, appId: resolvedAppId, identifier: normalizedPhone })
    ]);
    if (existingIdentity || existingPublicAccount) {
      return { success: false, statusCode: 409, message: 'So dien thoai nay da duoc dang ky.' };
    }

    const now = new Date();
    const companyId = `comp_${safeIdPart(crypto.randomUUID())}`;
    const employeeId = `emp_${safeIdPart(crypto.randomUUID())}`;
    const identityId = identityIdForPublicAccount('employee', employeeId);
    const phoneReservationId = hashOpaqueSecret(`${resolvedAppId}|phone|${normalizedPhone}`);
    const phoneReservationRef = db.collection('identity_unique_keys').doc(phoneReservationId);
    const companyRef = db.doc(publicPath(resolvedAppId, 'companies', companyId));
    const employeeRef = db.doc(publicPath(resolvedAppId, 'employees', employeeId));
    const identityRef = getIdentityRef(identityId);
    const passwordHash = await hashPassword(password);
    const safeSettings = sanitizeCompanyRegistrationSettings(companySettings);
    const company = {
      id: companyId,
      companyId,
      name: normalizedName,
      ownerPhone: normalizedPhone,
      createdAt: now.toISOString().slice(0, 10),
      createdAtIso: now.toISOString(),
      status: 'trial',
      expiresAt: new Date(now.getTime() + (14 * 24 * 60 * 60 * 1000)).toISOString(),
      ...safeSettings
    };
    const employee = {
      id: employeeId,
      companyId,
      phone: normalizedPhone,
      name: 'Chu doanh nghiep',
      position: 'Chu doanh nghiep',
      role: 'super_admin',
      startDate: now.toISOString().slice(0, 10),
      probationDuration: 0,
      probationUnit: 'days',
      probationRate: 100,
      basicSalary: 0,
      supportSalary: 0,
      responsibilitySalary: 0,
      experienceSalary: 0,
      experienceSalaryPeriod: 'months',
      commissionRate: 0,
      targetRevenue: 0,
      overtimeRate: 0,
      latePenaltyRate: 0,
      identityId,
      identityMigratedAt: now.toISOString()
    };
    const identity = {
      id: identityId,
      accountType: 'employee',
      publicCollection: 'employees',
      publicId: employeeId,
      appUserId: employeeId,
      customerId: null,
      companyId,
      role: 'super_admin',
      name: employee.name,
      phone: normalizedPhone,
      phoneNormalized: normalizedPhone,
      username: '',
      usernameNormalized: '',
      passwordHash,
      requiresPasswordChange: false,
      setup: {
        passwordChanged: true,
        usernameSet: false,
        pinSet: false,
        biometricEnabled: false,
        trustedDevice: false
      },
      status: 'active',
      createdAt: now,
      createdAtIso: now.toISOString(),
      updatedAt: now,
      updatedAtIso: now.toISOString(),
      registeredByIdentityCenter: true
    };

    await db.runTransaction(async transaction => {
      const reservationSnapshot = await transaction.get(phoneReservationRef);
      if (reservationSnapshot.exists) {
        throw Object.assign(new Error('So dien thoai nay da duoc dang ky.'), { statusCode: 409 });
      }
      transaction.create(phoneReservationRef, {
        type: 'phone',
        appId: resolvedAppId,
        normalizedValueHash: phoneReservationId,
        identityId,
        companyId,
        createdAt: now
      });
      transaction.create(companyRef, company);
      transaction.create(employeeRef, employee);
      transaction.create(identityRef, identity);
    });

    await logAudit(identityId, 'company_registered', { companyId, appId: resolvedAppId });
    return {
      success: true,
      company: { id: companyId, name: company.name },
      ...(await issueSession({ identityId, identity, device }))
    };
  };

  const enforceLoginRateLimit = async (identifier = '') => {
    const key = hashOpaqueSecret(`${normalizePhone(identifier) || normalizeUsername(identifier)}|login`);
    const ref = db.collection(IDENTITY_RATE_LIMIT_COLLECTION).doc(key);
    const now = Date.now();
    const result = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      const data = snapshot.exists ? snapshot.data() : {};
      const blockedUntil = data.blockedUntil?.toMillis?.() || 0;
      if (blockedUntil > now) return { blocked: true, waitMs: blockedUntil - now };
      return { blocked: false };
    });
    return { ...result, ref };
  };

  const recordLoginAttempt = async (ref, success) => {
    const now = new Date();
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      const data = snapshot.exists ? snapshot.data() : {};
      if (success) {
        transaction.set(ref, { attempts: 0, blockedUntil: null, updatedAt: now }, { merge: true });
        return;
      }
      const attempts = Number(data.attempts || 0) + 1;
      transaction.set(ref, {
        attempts,
        blockedUntil: attempts >= MAX_LOGIN_ATTEMPTS ? new Date(now.getTime() + LOGIN_BLOCK_MS) : null,
        updatedAt: now
      }, { merge: true });
    });
  };

  const getVerifiedIdentity = async (authorization = '') => {
    const token = `${authorization || ''}`.replace(/^Bearer\s+/i, '').trim();
    if (!token) throw Object.assign(new Error('Phiên đăng nhập không hợp lệ.'), { statusCode: 401 });
    const decoded = await admin.auth().verifyIdToken(token, true);
    const identityId = `${decoded.identityId || ''}`;
    if (!identityId) throw Object.assign(new Error('Phiên đăng nhập không thuộc Identity Center.'), { statusCode: 401 });
    const identitySnap = await getIdentityRef(identityId).get();
    if (!identitySnap.exists) throw Object.assign(new Error('Không tìm thấy tài khoản xác thực.'), { statusCode: 401 });
    const identity = identitySnap.data();
    if (identity.status !== 'active' || identity.lockedAt) throw Object.assign(new Error('Tài khoản đã bị khóa.'), { statusCode: 403 });
    return { identityId, identity, decoded };
  };

  const login = async ({ identifier, password, device, appId }) => {
    const rate = await enforceLoginRateLimit(identifier);
    if (rate.blocked) return { success: false, statusCode: 429, message: `Đăng nhập bị tạm khóa. Vui lòng thử lại sau ${Math.ceil(rate.waitMs / 60000)} phút.` };
    // The documented first-login password is intentionally allowed only for the
    // one-time migration path. Every replacement password still uses the
    // regular strength policy below.
    const isInitialDefaultPassword = `${password || ''}` === DEFAULT_FIRST_LOGIN_PASSWORD;
    const passwordError = validatePassword(password);
    if (passwordError && !isInitialDefaultPassword) return { success: false, statusCode: 400, message: passwordError };
    let identity = await findIdentity(identifier);
    let identityId = identity?.id;
    if (!identity) {
      const publicAccount = await getPublicAccountFromIdentifier({ db, appId: getAppId(appId), identifier });
      if (!publicAccount) {
        await recordLoginAttempt(rate.ref, false);
        return { success: false, statusCode: 401, message: 'Tên đăng nhập hoặc mật khẩu không đúng.' };
      }
      const migrated = await createOrMigrateIdentity({ publicAccount, password, identifier });
      if (migrated.error) {
        await recordLoginAttempt(rate.ref, false);
        return { success: false, statusCode: 401, message: migrated.error };
      }
      identity = migrated.identity;
      identityId = migrated.identityId;
    } else if (identity.status !== 'active' || identity.lockedAt || !(await verifyPassword(password, identity.passwordHash))) {
      await recordLoginAttempt(rate.ref, false);
      return { success: false, statusCode: 401, message: 'Tên đăng nhập hoặc mật khẩu không đúng.' };
    }
    await recordLoginAttempt(rate.ref, true);
    return { success: true, ...(await issueSession({ identityId, identity, device })) };
  };

  const completeSetup = async ({ authorization, device, password, username, pin, biometricEnabled, trustDevice = false }) => {
    const { identityId, identity } = await getVerifiedIdentity(authorization);
    const cleanDevice = sanitizeDevice(device);
    const updates = { updatedAt: new Date(), updatedAtIso: new Date().toISOString() };
    const nextSetup = { ...(identity.setup || {}) };
    if (password !== undefined && `${password}`.length) {
      const error = validatePassword(password);
      if (error) throw Object.assign(new Error(error), { statusCode: 400 });
      updates.passwordHash = await hashPassword(password);
      updates.requiresPasswordChange = false;
      nextSetup.passwordChanged = true;
    }
    const normalizedUsername = normalizeUsername(username || identity.username || '');
    if (!normalizedUsername || normalizedUsername.length < 3 || !/^[a-z0-9._-]+$/.test(normalizedUsername)) {
      throw Object.assign(new Error('Username gồm 3-40 ký tự: chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang.'), { statusCode: 400 });
    }
    const usernameTaken = await db.collection(IDENTITY_ACCOUNT_COLLECTION).where('usernameNormalized', '==', normalizedUsername).limit(1).get();
    if (!usernameTaken.empty && usernameTaken.docs[0].id !== identityId) throw Object.assign(new Error('Username này đã được sử dụng.'), { statusCode: 409 });
    updates.username = normalizedUsername;
    updates.usernameNormalized = normalizedUsername;
    nextSetup.usernameSet = true;
    if (pin !== undefined && `${pin}`.length) {
      const error = validatePin(pin);
      if (error) throw Object.assign(new Error(error), { statusCode: 400 });
      updates.pinHash = await hashPassword(pin);
      nextSetup.pinSet = true;
    }
    let deviceSecret = '';
    if (trustDevice) {
      deviceSecret = makeOpaqueSecret();
      const deviceRef = getIdentityRef(identityId).collection('devices').doc(cleanDevice.deviceId);
      await deviceRef.set({
        ...cleanDevice,
        trusted: true,
        ...(typeof biometricEnabled === 'boolean' ? { biometricEnabled: Boolean(biometricEnabled) } : {}),
        trustedAt: new Date(),
        trustedAtIso: new Date().toISOString(),
        deviceSecretHash: hashOpaqueSecret(deviceSecret),
        revokedAt: null,
        updatedAt: new Date(),
        updatedAtIso: new Date().toISOString()
      }, { merge: true });
      nextSetup.trustedDevice = true;
    }
    if (typeof biometricEnabled === 'boolean') {
      nextSetup.biometricEnabled = biometricEnabled;
      await getIdentityRef(identityId).collection('devices').doc(cleanDevice.deviceId).set({
        biometricEnabled: Boolean(biometricEnabled),
        updatedAt: new Date(),
        updatedAtIso: new Date().toISOString()
      }, { merge: true });
    }
    updates.setup = nextSetup;
    await getIdentityRef(identityId).set(updates, { merge: true });
    const auditActions = [];
    if (password !== undefined && `${password}`.length) auditActions.push('password_changed');
    if (normalizedUsername !== `${identity.username || ''}`) auditActions.push('username_changed');
    if (pin !== undefined && `${pin}`.length) auditActions.push('pin_changed');
    if (typeof biometricEnabled === 'boolean') auditActions.push(biometricEnabled ? 'biometric_enabled' : 'biometric_disabled');
    if (trustDevice) auditActions.push('trusted_device_registered');
    if (!auditActions.length) auditActions.push('identity_setup_completed');
    await Promise.all(auditActions.map(action => logAudit(identityId, action, { deviceId: cleanDevice.deviceId })));
    // Refresh Firebase custom claims immediately after first-time setup or a
    // username change so auto-login never restores an outdated identity.
    const refreshedIdentity = { ...identity, ...updates, username: normalizedUsername, setup: nextSetup };
    const refreshedSession = await issueSession({ identityId, identity: refreshedIdentity, device: cleanDevice });
    return {
      success: true,
      deviceSecret,
      setup: nextSetup,
      identityKey: identityId,
      identity: { ...buildPublicIdentity(refreshedIdentity), identityKey: identityId, username: normalizedUsername },
      customToken: refreshedSession.customToken
    };
  };

  const requestRecovery = async ({ identifier, device, deviceSecret, pin = '', biometricProof = false }) => {
    const identity = await findIdentity(identifier);
    const generic = { success: false, statusCode: 403, message: 'Thiết bị chưa được xác minh. Vui lòng đăng nhập trên thiết bị đã tin cậy hoặc liên hệ quản trị.' };
    if (!identity || identity.status !== 'active') return generic;
    const cleanDevice = sanitizeDevice(device);
    const deviceSnap = await getIdentityRef(identity.id).collection('devices').doc(cleanDevice.deviceId).get();
    const saved = deviceSnap.exists ? deviceSnap.data() : null;
    if (!saved?.trusted || saved?.revokedAt || !deviceSecret || !timingSafeTextEqual(saved.deviceSecretHash || '', hashOpaqueSecret(deviceSecret))) return generic;
    // A protected Keychain/Keystore read is accepted as the biometric proof. When
    // biometric is unavailable, the device secret alone is not sufficient: PIN is
    // verified server-side before a recovery token is issued.
    const biometricConfirmed = Boolean(biometricProof && identity.setup?.biometricEnabled && saved.biometricEnabled);
    if (!biometricConfirmed && (!identity.pinHash || !(await verifyPassword(pin, identity.pinHash)))) {
      return { success: false, statusCode: 401, message: 'Nhập PIN 6 số để xác minh thiết bị tin cậy.' };
    }
    const token = createRecoveryToken(identity.id);
    const tokenHash = hashOpaqueSecret(token);
    const now = new Date();
    const resetRef = getIdentityRef(identity.id).collection('reset_tokens').doc(tokenHash);
    await resetRef.create({ identityId: identity.id, tokenHash, createdAt: now, expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS), usedAt: null, deviceId: cleanDevice.deviceId });
    await logAudit(identity.id, 'password_reset_requested', { deviceId: cleanDevice.deviceId });
    return { success: true, resetToken: token, expiresInSeconds: RESET_TOKEN_TTL_MS / 1000, message: 'Xác minh thành công. Bạn có thể đặt mật khẩu mới.' };
  };

  const completeRecovery = async ({ resetToken, password, device, identifier = '' }) => {
    const passwordError = validatePassword(password);
    if (passwordError) return { success: false, statusCode: 400, message: passwordError };
    const tokenHash = hashOpaqueSecret(resetToken);
    const tokenIdentityId = getRecoveryIdentityIdFromToken(resetToken);
    const matchedIdentity = tokenIdentityId ? { id: tokenIdentityId } : await findIdentity(identifier);
    if (!matchedIdentity?.id) return { success: false, statusCode: 400, message: 'Phiên đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.' };

    const identityId = matchedIdentity.id;
    const identityRef = getIdentityRef(identityId);
    const resetCollection = identityRef.collection('reset_tokens');
    let resetDoc = await resetCollection.doc(tokenHash).get();
    if (!resetDoc.exists) {
      // Tokens issued before this fix used random document IDs. Limit the lookup
      // to the already-identified account so no collection-group index is needed.
      const legacyResets = await resetCollection.where('tokenHash', '==', tokenHash).limit(1).get();
      if (legacyResets.empty) return { success: false, statusCode: 400, message: 'Phiên đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.' };
      resetDoc = legacyResets.docs[0];
    }

    const cleanDevice = sanitizeDevice(device);
    const nextPasswordHash = await hashPassword(password);
    const now = new Date();
    const auditRef = db.collection(IDENTITY_AUDIT_COLLECTION).doc();
    const transactionResult = await db.runTransaction(async transaction => {
      const [freshResetDoc, identitySnap] = await Promise.all([
        transaction.get(resetDoc.ref),
        transaction.get(identityRef)
      ]);
      if (!freshResetDoc.exists || !identitySnap.exists) return { error: 'Phiên đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.' };

      const reset = freshResetDoc.data();
      const expiresAtMs = typeof reset.expiresAt?.toMillis === 'function'
        ? reset.expiresAt.toMillis()
        : new Date(reset.expiresAt || 0).getTime();
      if (
        reset.usedAt
        || !Number.isFinite(expiresAtMs)
        || expiresAtMs <= Date.now()
        || (reset.identityId && reset.identityId !== identityId)
        || (reset.deviceId && reset.deviceId !== cleanDevice.deviceId)
      ) {
        return { error: 'Phiên đặt lại mật khẩu đã hết hạn. Vui lòng xác minh lại.' };
      }

      const identity = identitySnap.data();
      const nextSetup = { ...(identity.setup || {}), passwordChanged: true };
      transaction.update(freshResetDoc.ref, { usedAt: now, usedAtIso: now.toISOString() });
      transaction.update(identityRef, {
        passwordHash: nextPasswordHash,
        requiresPasswordChange: false,
        setup: nextSetup,
        updatedAt: now,
        updatedAtIso: now.toISOString()
      });
      transaction.set(auditRef, {
        accountId: identityId,
        action: 'password_reset_completed',
        metadata: { deviceId: cleanDevice.deviceId },
        createdAt: now,
        createdAtIso: now.toISOString(),
        immutable: true
      });
      return { success: true };
    });
    if (transactionResult?.error) return { success: false, statusCode: 400, message: transactionResult.error };
    return { success: true, message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.' };
  };

  const verifyPin = async ({ authorization, pin }) => {
    const { identityId, identity } = await getVerifiedIdentity(authorization);
    if (!identity.pinHash || !(await verifyPassword(pin, identity.pinHash))) return { success: false, statusCode: 401, message: 'PIN không đúng.' };
    await logAudit(identityId, 'pin_verified');
    return { success: true };
  };

  const listDevices = async ({ authorization }) => {
    const { identityId } = await getVerifiedIdentity(authorization);
    const snapshot = await getIdentityRef(identityId).collection('devices').orderBy('lastLoginAt', 'desc').get();
    return {
      success: true,
      devices: snapshot.docs.map(doc => {
        const data = doc.data();
        return { deviceId: doc.id, name: data.name || '', os: data.os || '', platform: data.platform || '', appVersion: data.appVersion || '', trusted: Boolean(data.trusted), biometricEnabled: Boolean(data.biometricEnabled), createdAt: asIso(data.createdAt || new Date()), lastLoginAt: asIso(data.lastLoginAt || new Date()), revokedAt: data.revokedAt ? asIso(data.revokedAt) : null };
      })
    };
  };

  const revokeDevices = async ({ authorization, deviceId = '', all = false }) => {
    const { identityId } = await getVerifiedIdentity(authorization);
    const collection = getIdentityRef(identityId).collection('devices');
    const snapshot = all ? await collection.get() : await collection.where(admin.firestore.FieldPath.documentId(), '==', safeIdPart(deviceId)).get();
    const batch = db.batch();
    const now = new Date();
    snapshot.docs.forEach(doc => batch.set(doc.ref, { trusted: false, revokedAt: now, revokedAtIso: now.toISOString(), deviceSecretHash: admin.firestore.FieldValue.delete(), updatedAt: now }, { merge: true }));
    await batch.commit();
    // Firebase sessions are scoped to the Firebase UID rather than a physical device.
    // A global revoke is therefore the only authoritative way to end every persisted
    // Firebase session after the user chooses "log out all devices".
    if (all) await admin.auth().revokeRefreshTokens(`identity_${safeIdPart(identityId)}`);
    await logAudit(identityId, all ? 'all_devices_revoked' : 'device_revoked', { deviceId: all ? null : safeIdPart(deviceId) });
    return { success: true };
  };

  const logout = async ({ authorization, device }) => {
    const { identityId } = await getVerifiedIdentity(authorization);
    const cleanDevice = sanitizeDevice(device);
    await logAudit(identityId, 'logout', { deviceId: cleanDevice.deviceId, platform: cleanDevice.platform });
    return { success: true };
  };

  const listAudit = async ({ authorization }) => {
    const { identityId } = await getVerifiedIdentity(authorization);
    const snapshot = await db.collection(IDENTITY_AUDIT_COLLECTION).where('accountId', '==', identityId).orderBy('createdAt', 'desc').limit(50).get();
    return { success: true, entries: snapshot.docs.map(doc => ({ id: doc.id, action: doc.data().action, metadata: doc.data().metadata || {}, createdAt: asIso(doc.data().createdAt) })) };
  };

  return {
    registerCompany,
    login,
    completeSetup,
    requestRecovery,
    completeRecovery,
    verifyPin,
    listDevices,
    revokeDevices,
    logout,
    listAudit,
    getVerifiedIdentity,
    validatePassword,
    validatePin
  };
};

module.exports = {
  DEFAULT_FIRST_LOGIN_PASSWORD,
  IDENTITY_ACCOUNT_COLLECTION,
  IDENTITY_AUDIT_COLLECTION,
  buildPhoneVariants,
  createRecoveryToken,
  getRecoveryIdentityIdFromToken,
  normalizePhone,
  normalizeUsername,
  validatePassword,
  validatePin,
  verifyLegacyPassword,
  createIdentityCenter
};
