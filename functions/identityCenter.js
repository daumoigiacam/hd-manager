const crypto = require('crypto');

const IDENTITY_ACCOUNT_COLLECTION = 'identity_accounts';
const IDENTITY_AUDIT_COLLECTION = 'identity_audit_logs';
const IDENTITY_RATE_LIMIT_COLLECTION = 'identity_rate_limits';
const IDENTITY_OWNER_RESET_REQUEST_COLLECTION = 'identity_owner_reset_requests';
const LEGACY_HASH_SCHEME = 'pbkdf2-sha256-v1';
const LEGACY_HASH_ITERATIONS = 120000;
const PASSWORD_HASH_SCHEME = 'scrypt-v1';
const DEFAULT_FIRST_LOGIN_PASSWORD = '12345678';
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;
const OWNER_RESET_REQUEST_COOLDOWN_MS = 10 * 60 * 1000;
const OWNER_RESET_APPROVAL_LEASE_MS = 2 * 60 * 1000;
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
const normalizeRoleKey = (value = '') => `${value || ''}`
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/[\s-]+/g, '_');
const isOwnerIdentity = (identity = {}) => [
  'super_admin',
  'owner',
  'business_owner',
  'chu_doanh_nghiep'
].includes(normalizeRoleKey(identity.role));
const isPhoneIdentifier = (value = '') => {
  const raw = `${value || ''}`.trim();
  return /^[+\d\s().-]+$/.test(raw) && normalizePhone(raw).length >= 9;
};
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
      if (!(await verifyPassword(password, identity.passwordHash))) return { error: 'Số điện thoại hoặc mật khẩu không đúng.' };
      return { identityId, identity };
    }

    const legacyVerified = legacyHash ? verifyLegacyPassword(password, legacyHash) : password === DEFAULT_FIRST_LOGIN_PASSWORD;
    if (!legacyVerified) return { error: 'Số điện thoại hoặc mật khẩu không đúng.' };

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

  const issueSession = async ({ identityId, identity, device, loginRateRef = null }) => {
    const now = new Date();
    const cleanDevice = sanitizeDevice(device);
    const deviceRef = getIdentityRef(identityId).collection('devices').doc(cleanDevice.deviceId);
    const deviceSnapshotPromise = deviceRef.get();
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
    const customTokenPromise = admin.auth().createCustomToken(firebaseUid, claims);
    const deviceSnap = await deviceSnapshotPromise;
    const currentDevice = deviceSnap.exists ? deviceSnap.data() : {};
    const batch = db.batch();
    batch.set(deviceRef, {
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
    batch.set(getIdentityRef(identityId), {
      updatedAt: now,
      updatedAtIso: now.toISOString(),
      lastLoginAt: now,
      lastLoginAtIso: now.toISOString()
    }, { merge: true });
    batch.set(db.collection(IDENTITY_AUDIT_COLLECTION).doc(), {
      accountId: identityId,
      action: 'login',
      metadata: { deviceId: cleanDevice.deviceId, platform: cleanDevice.platform },
      createdAt: now,
      createdAtIso: now.toISOString(),
      immutable: true
    });
    if (loginRateRef) {
      batch.set(loginRateRef, {
        attempts: 0,
        blockedUntil: null,
        updatedAt: now
      }, { merge: true });
    }
    const [customToken] = await Promise.all([
      customTokenPromise,
      batch.commit()
    ]);
    return {
      customToken,
      identityKey: identityId,
      identity: { ...buildPublicIdentity(identity), identityKey: identityId },
      device: { ...cleanDevice, trusted: Boolean(currentDevice.trusted) },
      requiresSetup: Boolean(identity.requiresPasswordChange || !identity.setup?.pinSet || !identity.setup?.trustedDevice),
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
    const snapshot = await ref.get();
    const data = snapshot.exists ? snapshot.data() : {};
    const blockedUntil = data.blockedUntil?.toMillis?.() || 0;
    return blockedUntil > now
      ? { blocked: true, waitMs: blockedUntil - now, ref }
      : { blocked: false, ref };
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
        return { success: false, statusCode: 401, message: 'Số điện thoại hoặc mật khẩu không đúng.' };
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
      return { success: false, statusCode: 401, message: 'Số điện thoại hoặc mật khẩu không đúng.' };
    }
    const session = await issueSession({ identityId, identity, device, loginRateRef: rate.ref });
    return { success: true, ...session };
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
    let normalizedUsername = normalizeUsername(identity.username || '');
    const requestedUsername = normalizeUsername(username || '');
    if (requestedUsername) {
      if (requestedUsername.length < 3 || !/^[a-z0-9._-]+$/.test(requestedUsername)) {
        throw Object.assign(new Error('Username gồm 3-40 ký tự: chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang.'), { statusCode: 400 });
      }
      const usernameTaken = await db.collection(IDENTITY_ACCOUNT_COLLECTION).where('usernameNormalized', '==', requestedUsername).limit(1).get();
      if (!usernameTaken.empty && usernameTaken.docs[0].id !== identityId) throw Object.assign(new Error('Username này đã được sử dụng.'), { statusCode: 409 });
      normalizedUsername = requestedUsername;
      updates.username = normalizedUsername;
      updates.usernameNormalized = normalizedUsername;
      nextSetup.usernameSet = true;
    }
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

  const ownerResetEmployeePassword = async ({ authorization, employeeId, appId, approvalRequestId = '' }) => {
    const { identityId: ownerIdentityId, identity: ownerIdentity } = await getVerifiedIdentity(authorization);
    if (ownerIdentity.accountType !== 'employee' || !isOwnerIdentity(ownerIdentity)) {
      throw Object.assign(new Error('Chỉ chủ doanh nghiệp được đặt lại đăng nhập cho nhân sự.'), { statusCode: 403 });
    }

    const targetEmployeeId = safeIdPart(employeeId);
    if (!targetEmployeeId || targetEmployeeId !== `${employeeId || ''}`) {
      throw Object.assign(new Error('Nhân sự cần đặt lại không hợp lệ.'), { statusCode: 400 });
    }

    const resolvedAppId = getAppId(appId);
    const employeeRef = db.doc(publicPath(resolvedAppId, 'employees', targetEmployeeId));
    const targetIdentityId = identityIdForPublicAccount('employee', targetEmployeeId);
    if (targetIdentityId === ownerIdentityId) {
      throw Object.assign(new Error('Không thể dùng chức năng này để đặt lại tài khoản chủ doanh nghiệp.'), { statusCode: 400 });
    }

    const targetIdentityRef = getIdentityRef(targetIdentityId);
    const [employeeSnap, targetIdentitySnap, devicesSnap, resetTokensSnap] = await Promise.all([
      employeeRef.get(),
      targetIdentityRef.get(),
      targetIdentityRef.collection('devices').get(),
      targetIdentityRef.collection('reset_tokens').get()
    ]);
    if (!employeeSnap.exists) {
      throw Object.assign(new Error('Không tìm thấy nhân sự cần đặt lại.'), { statusCode: 404 });
    }

    const employee = employeeSnap.data() || {};
    const employeeCompanyId = `${employee.companyId || employee.company_id || ''}`;
    if (!employeeCompanyId || employeeCompanyId !== `${ownerIdentity.companyId || ''}`) {
      throw Object.assign(new Error('Không được đặt lại tài khoản ngoài doanh nghiệp.'), { statusCode: 403 });
    }
    if (employee.isArchived || `${employee.status || 'active'}` === 'blocked') {
      throw Object.assign(new Error('Tài khoản nhân sự đang bị khóa hoặc đã lưu trữ.'), { statusCode: 409 });
    }
    if (isOwnerIdentity(employee)) {
      throw Object.assign(new Error('Không thể đặt lại tài khoản chủ doanh nghiệp từ hồ sơ nhân sự.'), { statusCode: 400 });
    }

    const existingIdentity = targetIdentitySnap.exists ? targetIdentitySnap.data() : null;
    if (existingIdentity && `${existingIdentity.companyId || ''}` !== employeeCompanyId) {
      throw Object.assign(new Error('Tài khoản xác thực không thuộc doanh nghiệp hiện tại.'), { statusCode: 403 });
    }
    if (existingIdentity && isOwnerIdentity(existingIdentity)) {
      throw Object.assign(new Error('Không thể đặt lại một tài khoản chủ doanh nghiệp.'), { statusCode: 400 });
    }
    if (existingIdentity?.status === 'blocked' || existingIdentity?.lockedAt) {
      throw Object.assign(new Error('Tài khoản đang bị khóa. Hãy mở khóa trước khi đặt lại mật khẩu.'), { statusCode: 409 });
    }

    const safeApprovalRequestId = safeIdPart(approvalRequestId);
    if (approvalRequestId && safeApprovalRequestId !== `${approvalRequestId}`) {
      throw Object.assign(new Error('Yêu cầu cấp lại tài khoản không hợp lệ.'), { statusCode: 400 });
    }
    // A retry after the password was already reset must not revoke sessions or
    // create duplicate audit records a second time.
    if (safeApprovalRequestId && existingIdentity?.ownerResetRequestId === safeApprovalRequestId) {
      return {
        success: true,
        requiresPasswordChange: true,
        idempotent: true,
        message: 'Tài khoản này đã được cấp lại. Nhân sự cần tạo mật khẩu và PIN mới khi đăng nhập.'
      };
    }

    const now = new Date();
    const normalizedPhone = normalizePhone(employee.phone || existingIdentity?.phone || '');
    if (!normalizedPhone) {
      throw Object.assign(new Error('Nhân sự chưa có số điện thoại đăng nhập hợp lệ.'), { statusCode: 400 });
    }
    const defaultPasswordHash = await hashPassword(DEFAULT_FIRST_LOGIN_PASSWORD);
    const nextSetup = {
      ...(existingIdentity?.setup || {}),
      passwordChanged: false,
      pinSet: false,
      biometricEnabled: false,
      trustedDevice: false
    };
    const identityPayload = {
      id: targetIdentityId,
      accountType: 'employee',
      publicCollection: 'employees',
      publicId: targetEmployeeId,
      appUserId: targetEmployeeId,
      customerId: null,
      companyId: employeeCompanyId,
      role: employee.role || existingIdentity?.role || 'employee',
      name: employee.name || existingIdentity?.name || '',
      phone: employee.phone || existingIdentity?.phone || normalizedPhone,
      phoneNormalized: normalizedPhone,
      username: existingIdentity?.username || normalizeUsername(employee.username || ''),
      usernameNormalized: existingIdentity?.usernameNormalized || normalizeUsername(employee.username || ''),
      passwordHash: defaultPasswordHash,
      requiresPasswordChange: true,
      setup: nextSetup,
      status: existingIdentity?.status || 'active',
      updatedAt: now,
      updatedAtIso: now.toISOString(),
      ownerResetAt: now,
      ownerResetAtIso: now.toISOString(),
      ownerResetBy: ownerIdentityId,
      ...(safeApprovalRequestId ? {
        ownerResetRequestId: safeApprovalRequestId,
        ownerResetRequestApprovedAt: now,
        ownerResetRequestApprovedAtIso: now.toISOString()
      } : {}),
      ...(existingIdentity ? {} : {
        createdAt: now,
        createdAtIso: now.toISOString(),
        initializedByOwnerReset: true
      })
    };

    const batch = db.batch();
    if (existingIdentity) {
      batch.set(targetIdentityRef, {
        ...identityPayload,
        pinHash: admin.firestore.FieldValue.delete()
      }, { merge: true });
    } else {
      batch.create(targetIdentityRef, identityPayload);
    }
    batch.set(employeeRef, {
      identityId: targetIdentityId,
      password_hash: admin.firestore.FieldValue.delete(),
      passwordHash: admin.firestore.FieldValue.delete(),
      identityResetAt: now.toISOString()
    }, { merge: true });
    devicesSnap.docs.forEach(deviceDoc => batch.set(deviceDoc.ref, {
      trusted: false,
      biometricEnabled: false,
      revokedAt: now,
      revokedAtIso: now.toISOString(),
      deviceSecretHash: admin.firestore.FieldValue.delete(),
      updatedAt: now,
      updatedAtIso: now.toISOString()
    }, { merge: true }));
    resetTokensSnap.docs.forEach(resetDoc => {
      if (resetDoc.data()?.usedAt) return;
      batch.set(resetDoc.ref, {
        usedAt: now,
        usedAtIso: now.toISOString(),
        revokedReason: 'owner_reset'
      }, { merge: true });
    });
    batch.set(db.collection(IDENTITY_AUDIT_COLLECTION).doc(), {
      accountId: targetIdentityId,
      action: 'password_reset_by_owner',
      metadata: { ownerIdentityId, ownerName: ownerIdentity.name || '' },
      createdAt: now,
      createdAtIso: now.toISOString(),
      immutable: true
    });
    batch.set(db.collection(IDENTITY_AUDIT_COLLECTION).doc(), {
      accountId: ownerIdentityId,
      action: 'employee_password_reset',
      metadata: { targetIdentityId, employeeId: targetEmployeeId, employeeName: employee.name || '' },
      createdAt: now,
      createdAtIso: now.toISOString(),
      immutable: true
    });
    try {
      await admin.auth().revokeRefreshTokens(`identity_${safeIdPart(targetIdentityId)}`);
    } catch (error) {
      if (error?.code !== 'auth/user-not-found') throw error;
    }
    await batch.commit();

    return {
      success: true,
      temporaryPassword: DEFAULT_FIRST_LOGIN_PASSWORD,
      requiresPasswordChange: true,
      message: 'Đã đặt lại đăng nhập. Nhân sự phải đổi mật khẩu và tạo PIN mới ở lần đăng nhập tiếp theo.'
    };
  };

  const requestOwnerPasswordReset = async ({ identifier, appId }) => {
    const genericSuccess = {
      success: true,
      message: 'Nếu tài khoản hợp lệ, yêu cầu đã được gửi tới chủ doanh nghiệp.'
    };
    const identity = await findIdentity(identifier);
    if (!identity || identity.accountType !== 'employee' || identity.status !== 'active' || identity.lockedAt || isOwnerIdentity(identity)) {
      return genericSuccess;
    }

    const targetEmployeeId = safeIdPart(identity.appUserId || identity.publicId || '');
    if (!targetEmployeeId || targetEmployeeId !== `${identity.appUserId || identity.publicId || ''}`) return genericSuccess;
    const resolvedAppId = getAppId(appId);
    const employeeRef = db.doc(publicPath(resolvedAppId, 'employees', targetEmployeeId));
    const [employeeSnap, companyIdentitySnap] = await Promise.all([
      employeeRef.get(),
      db.collection(IDENTITY_ACCOUNT_COLLECTION).where('companyId', '==', `${identity.companyId || ''}`).get()
    ]);
    if (!employeeSnap.exists) return genericSuccess;

    const employee = employeeSnap.data() || {};
    const companyId = `${employee.companyId || employee.company_id || ''}`;
    if (!companyId || companyId !== `${identity.companyId || ''}` || employee.isArchived || `${employee.status || 'active'}` === 'blocked') {
      return genericSuccess;
    }

    const ownerIdentities = companyIdentitySnap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((item) => item.accountType === 'employee' && item.status === 'active' && !item.lockedAt && isOwnerIdentity(item));
    const ownerIdentityIds = [...new Set(ownerIdentities.map((item) => item.id).filter(Boolean))];
    const ownerEmployeeIds = [...new Set(ownerIdentities.map((item) => `${item.appUserId || item.publicId || ''}`).filter(Boolean))];
    if (!ownerIdentityIds.length || !ownerEmployeeIds.length) {
      return {
        success: false,
        statusCode: 409,
        message: 'Chưa tìm thấy chủ doanh nghiệp có thể xác nhận yêu cầu này.'
      };
    }

    const requestId = safeIdPart(identity.id);
    const requestRef = db.collection(IDENTITY_OWNER_RESET_REQUEST_COLLECTION).doc(requestId);
    const now = new Date();
    const transactionResult = await db.runTransaction(async (transaction) => {
      const existingSnap = await transaction.get(requestRef);
      const existing = existingSnap.exists ? (existingSnap.data() || {}) : {};
      const requestedAtMs = typeof existing.requestedAt?.toMillis === 'function'
        ? existing.requestedAt.toMillis()
        : new Date(existing.requestedAt || existing.requestedAtIso || 0).getTime();
      const isRecentPending = existing.status === 'pending'
        && Number.isFinite(requestedAtMs)
        && now.getTime() - requestedAtMs < OWNER_RESET_REQUEST_COOLDOWN_MS;
      if (isRecentPending) return { alreadyPending: true };

      const requestCount = Math.max(0, Number(existing.requestCount || 0)) + 1;
      transaction.set(requestRef, {
        id: requestId,
        identityId: identity.id,
        employeeId: targetEmployeeId,
        companyId,
        appId: resolvedAppId,
        status: 'pending',
        requestCount,
        ownerIdentityIds,
        ownerEmployeeIds,
        requesterName: identity.name || employee.name || '',
        requesterPhone: identity.phone || employee.phone || '',
        requestedAt: now,
        requestedAtIso: now.toISOString(),
        updatedAt: now,
        updatedAtIso: now.toISOString(),
        processingBy: admin.firestore.FieldValue.delete(),
        processingStartedAt: admin.firestore.FieldValue.delete(),
        processingStartedAtIso: admin.firestore.FieldValue.delete(),
        lastFailureCode: admin.firestore.FieldValue.delete(),
        ...(existing.createdAt ? {} : { createdAt: now, createdAtIso: now.toISOString() })
      }, { merge: true });

      ownerEmployeeIds.forEach((ownerEmployeeId) => {
        const notificationId = `identity_owner_reset_${requestId}_${safeIdPart(ownerEmployeeId)}`;
        transaction.set(db.doc(publicPath(resolvedAppId, 'notifications', notificationId)), {
          id: notificationId,
          companyId,
          type: 'identity_owner_reset_request',
          actionType: 'identity_owner_reset_request',
          identityResetRequestId: requestId,
          targetEmployeeId: ownerEmployeeId,
          targetEmployeeIds: [ownerEmployeeId],
          audience: 'employee',
          isGlobal: true,
          tone: 'amber',
          title: 'Yêu cầu cấp lại mã PIN và mật khẩu',
          message: `${identity.name || employee.name || 'Một nhân sự'} yêu cầu chủ doanh nghiệp cấp lại mã PIN và mật khẩu.`,
          requesterName: identity.name || employee.name || '',
          requesterPhone: identity.phone || employee.phone || '',
          status: 'unread',
          isArchived: false,
          createdAt: now,
          createdAtIso: now.toISOString(),
          updatedAt: now,
          updatedAtIso: now.toISOString()
        }, { merge: true });
      });
      return { alreadyPending: false };
    });

    if (!transactionResult?.alreadyPending) {
      await logAudit(identity.id, 'owner_password_reset_requested', { companyId, employeeId: targetEmployeeId });
    }
    return {
      ...genericSuccess,
      alreadyPending: Boolean(transactionResult?.alreadyPending)
    };
  };

  const approveOwnerPasswordReset = async ({ authorization, requestId, appId }) => {
    const { identityId: ownerIdentityId, identity: ownerIdentity } = await getVerifiedIdentity(authorization);
    if (ownerIdentity.accountType !== 'employee' || !isOwnerIdentity(ownerIdentity)) {
      throw Object.assign(new Error('Chỉ chủ doanh nghiệp được xác nhận cấp lại tài khoản.'), { statusCode: 403 });
    }

    const safeRequestId = safeIdPart(requestId);
    if (!safeRequestId || safeRequestId !== `${requestId || ''}`) {
      throw Object.assign(new Error('Yêu cầu cấp lại tài khoản không hợp lệ.'), { statusCode: 400 });
    }
    const requestRef = db.collection(IDENTITY_OWNER_RESET_REQUEST_COLLECTION).doc(safeRequestId);
    const now = new Date();
    const reservation = await db.runTransaction(async (transaction) => {
      const requestSnap = await transaction.get(requestRef);
      if (!requestSnap.exists) return { error: 'Không tìm thấy yêu cầu cấp lại tài khoản.' };
      const request = requestSnap.data() || {};
      if (!request.companyId || request.companyId !== `${ownerIdentity.companyId || ''}`) {
        return { error: 'Bạn không có quyền xác nhận yêu cầu của doanh nghiệp khác.' };
      }
      if (!request.employeeId || !request.identityId) return { error: 'Yêu cầu cấp lại tài khoản thiếu thông tin cần thiết.' };
      if (request.status === 'approved') return { alreadyApproved: true, request };
      if (request.status !== 'pending' && request.status !== 'processing') {
        return { error: 'Yêu cầu này không còn ở trạng thái chờ xác nhận.' };
      }
      const processingStartedAtMs = typeof request.processingStartedAt?.toMillis === 'function'
        ? request.processingStartedAt.toMillis()
        : new Date(request.processingStartedAt || request.processingStartedAtIso || 0).getTime();
      const hasActiveLease = request.status === 'processing'
        && Number.isFinite(processingStartedAtMs)
        && now.getTime() - processingStartedAtMs < OWNER_RESET_APPROVAL_LEASE_MS;
      if (hasActiveLease && request.processingBy !== ownerIdentityId) {
        return { error: 'Yêu cầu đang được một chủ doanh nghiệp khác xử lý.' };
      }

      transaction.set(requestRef, {
        status: 'processing',
        processingBy: ownerIdentityId,
        processingStartedAt: now,
        processingStartedAtIso: now.toISOString(),
        updatedAt: now,
        updatedAtIso: now.toISOString()
      }, { merge: true });
      return { request };
    });
    if (reservation?.error) throw Object.assign(new Error(reservation.error), { statusCode: 409 });
    if (reservation?.alreadyApproved) {
      return { success: true, idempotent: true, message: 'Yêu cầu này đã được cấp lại trước đó.' };
    }

    const request = reservation?.request || {};
    const resolvedAppId = getAppId(request.appId || appId);
    try {
      const resetResult = await ownerResetEmployeePassword({
        authorization,
        employeeId: request.employeeId,
        appId: resolvedAppId,
        approvalRequestId: safeRequestId
      });
      if (!resetResult?.success) throw new Error(resetResult?.message || 'Không thể cấp lại tài khoản.');

      const completedAt = new Date();
      await db.runTransaction(async (transaction) => {
        const latestRequestSnap = await transaction.get(requestRef);
        if (!latestRequestSnap.exists) throw new Error('Yêu cầu cấp lại tài khoản không còn tồn tại.');
        const latestRequest = latestRequestSnap.data() || {};
        if (latestRequest.status === 'approved') return;
        if (latestRequest.processingBy !== ownerIdentityId) {
          throw new Error('Yêu cầu đang được xử lý bởi phiên khác.');
        }
        transaction.set(requestRef, {
          status: 'approved',
          approvedBy: ownerIdentityId,
          approvedAt: completedAt,
          approvedAtIso: completedAt.toISOString(),
          updatedAt: completedAt,
          updatedAtIso: completedAt.toISOString()
        }, { merge: true });
        (Array.isArray(latestRequest.ownerEmployeeIds) ? latestRequest.ownerEmployeeIds : []).forEach((ownerEmployeeId) => {
          const notificationId = `identity_owner_reset_${safeRequestId}_${safeIdPart(ownerEmployeeId)}`;
          transaction.set(db.doc(publicPath(resolvedAppId, 'notifications', notificationId)), {
            status: 'resolved',
            isArchived: true,
            resolvedAt: completedAt,
            resolvedAtIso: completedAt.toISOString(),
            updatedAt: completedAt,
            updatedAtIso: completedAt.toISOString()
          }, { merge: true });
        });
      });
      await logAudit(ownerIdentityId, 'owner_password_reset_approved', {
        requestId: safeRequestId,
        employeeId: request.employeeId,
        targetIdentityId: request.identityId
      });
      return {
        success: true,
        message: 'Đã cấp lại tài khoản. Mật khẩu mặc định là 12345678 và PIN cũ đã được hủy.'
      };
    } catch (error) {
      const failedAt = new Date();
      await requestRef.set({
        status: 'pending',
        processingBy: admin.firestore.FieldValue.delete(),
        processingStartedAt: admin.firestore.FieldValue.delete(),
        processingStartedAtIso: admin.firestore.FieldValue.delete(),
        lastFailureCode: 'owner_reset_failed',
        updatedAt: failedAt,
        updatedAtIso: failedAt.toISOString()
      }, { merge: true }).catch(() => undefined);
      throw error;
    }
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
    ownerResetEmployeePassword,
    requestOwnerPasswordReset,
    approveOwnerPasswordReset,
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
  IDENTITY_OWNER_RESET_REQUEST_COLLECTION,
  buildPhoneVariants,
  createRecoveryToken,
  getRecoveryIdentityIdFromToken,
  normalizePhone,
  normalizeUsername,
  isOwnerIdentity,
  validatePassword,
  validatePin,
  verifyLegacyPassword,
  createIdentityCenter
};
