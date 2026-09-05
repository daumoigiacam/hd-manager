import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  findIdentitySessionOwner,
  getIdentityAccountScope,
  getIdentityNetworkErrorMessage,
  isIdentityTenantValidationReady,
  readTrustedDeviceSecret,
  removeTrustedDeviceSecret,
  shouldInvalidateIdentitySession,
  storeTrustedDeviceSecret,
} = await import('../src/services/identityCenter.js');
const {
  DEFAULT_FIRST_LOGIN_PASSWORD,
  buildPhoneVariants,
  createRecoveryToken,
  getRecoveryIdentityIdFromToken,
  isOwnerIdentity,
  normalizePhone,
  normalizeUsername,
  validatePassword,
  validatePin,
  verifyLegacyPassword,
} = require('../functions/identityCenter.js');

const legacyHash = (password, salt = 'identity-test-salt') => {
  const crypto = require('node:crypto');
  return `pbkdf2-sha256-v1$120000$${Buffer.from(salt).toString('hex')}$${crypto.pbkdf2Sync(password, Buffer.from(salt), 120000, 32, 'sha256').toString('hex')}`;
};

assert.equal(DEFAULT_FIRST_LOGIN_PASSWORD, '12345678');
assert.equal(isOwnerIdentity({ role: 'super_admin' }), true);
assert.equal(isOwnerIdentity({ role: 'owner' }), true);
assert.equal(isOwnerIdentity({ role: 'Chủ doanh nghiệp' }), true);
assert.equal(isOwnerIdentity({ role: 'employee' }), false);
assert.equal(normalizePhone('84 978 194 836'), '0978194836');
assert.equal(normalizePhone('0978.194.836'), '0978194836');
assert.ok(buildPhoneVariants('0978194836').includes('84978194836'));
assert.equal(normalizeUsername(' Nguyen Van.A '), 'nguyenvan.a');
assert.equal(validatePassword('abcd1234'), '');
assert.notEqual(validatePassword('12345678'), '');
assert.equal(validatePin('123456'), '');
assert.notEqual(validatePin('12345'), '');
assert.equal(verifyLegacyPassword('Abcd1234', legacyHash('Abcd1234')), true);
assert.equal(verifyLegacyPassword('Wrong1234', legacyHash('Abcd1234')), false);
const recoveryToken = createRecoveryToken('employee_emp_123');
assert.equal(getRecoveryIdentityIdFromToken(recoveryToken), 'employee_emp_123');
assert.equal(getRecoveryIdentityIdFromToken('legacy-token-without-routing'), '');
assert.equal(getRecoveryIdentityIdFromToken('bad.identity.extra.parts'), '');

assert.equal(getIdentityAccountScope({ identityKey: 'employee_emp_a' }), 'employee_emp_a');
assert.notEqual(
  getIdentityAccountScope({ accountType: 'employee', companyId: 'company_a', id: 'employee_a' }),
  getIdentityAccountScope({ accountType: 'employee', companyId: 'company_b', id: 'employee_b' }),
);
assert.equal(isIdentityTenantValidationReady({ loadedTenantId: 'company_a', sessionTenantId: 'company_b', coreDataLoaded: true }), false);
assert.equal(isIdentityTenantValidationReady({ loadedTenantId: 'company_b', sessionTenantId: 'company_b', coreDataLoaded: true }), true);
const legacySessionOwner = findIdentitySessionOwner([
  { id: 'employee_other', companyId: 'company_a', phone: '0900000000' },
  { employee_id: 'employee_a', company_id: 'company_a', phone: '0978194836' },
], { id: 'employee_a', companyId: 'company_a', phone: '0978194836' });
assert.equal(legacySessionOwner?.employee_id, 'employee_a');
assert.equal(findIdentitySessionOwner([], { id: 'employee_a', companyId: 'company_a' }), null);
assert.equal(shouldInvalidateIdentitySession({ firebaseAuthenticated: true, ownerRecord: null }), false);
assert.equal(shouldInvalidateIdentitySession({ firebaseAuthenticated: false, ownerRecord: { isArchived: true } }), false);
assert.equal(shouldInvalidateIdentitySession({ firebaseAuthenticated: true, ownerRecord: { isArchived: true } }), true);
assert.equal(shouldInvalidateIdentitySession({ firebaseAuthenticated: true, companyRecord: { status: 'blocked' } }), true);
assert.equal(
  getIdentityNetworkErrorMessage(new TypeError('Load failed'), '/api/identity/register-company'),
  'Không thể kết nối máy chủ để tạo tài khoản mới. Vui lòng kiểm tra mạng và thử lại.',
);
assert.equal(
  getIdentityNetworkErrorMessage(new DOMException('Aborted', 'AbortError'), '/api/identity/login'),
  'Máy chủ tài khoản phản hồi chậm. Vui lòng kiểm tra mạng và thử lại.',
);
assert.equal(getIdentityNetworkErrorMessage(new Error('Invalid password'), '/api/identity/login'), '');

const localSecretStore = new Map();
globalThis.window = {
  localStorage: {
    getItem: key => localSecretStore.get(key) || null,
    setItem: (key, value) => localSecretStore.set(key, `${value}`),
    removeItem: key => localSecretStore.delete(key),
  },
};
const sharedDeviceId = 'shared-device-001';
await storeTrustedDeviceSecret({ deviceId: sharedDeviceId, accountScope: 'employee_account_a', secret: 'secret-a' });
await storeTrustedDeviceSecret({ deviceId: sharedDeviceId, accountScope: 'employee_account_b', secret: 'secret-b' });
assert.equal(await readTrustedDeviceSecret({ deviceId: sharedDeviceId, accountScope: 'employee_account_a' }), 'secret-a');
assert.equal(await readTrustedDeviceSecret({ deviceId: sharedDeviceId, accountScope: 'employee_account_b' }), 'secret-b');
await removeTrustedDeviceSecret(sharedDeviceId, 'employee_account_a');
assert.equal(await readTrustedDeviceSecret({ deviceId: sharedDeviceId, accountScope: 'employee_account_a' }), '');
assert.equal(await readTrustedDeviceSecret({ deviceId: sharedDeviceId, accountScope: 'employee_account_b' }), 'secret-b');
delete globalThis.window;

const firebaseConfig = JSON.parse(await readFile(new URL('../firebase.json', import.meta.url), 'utf8'));
const identityClientSource = await readFile(new URL('../src/services/identityCenter.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const identityFunctionSource = await readFile(new URL('../functions/identityCenter.js', import.meta.url), 'utf8');
const functionsIndexSource = await readFile(new URL('../functions/index.js', import.meta.url), 'utf8');
const identityRewriteSources = firebaseConfig.hosting.rewrites
  .filter(item => `${item.source || ''}`.startsWith('/api/identity/'))
  .map(item => item.source);
for (const expectedPath of [
  '/api/identity/login',
  '/api/identity/register-company',
  '/api/identity/complete-setup',
  '/api/identity/request-recovery',
  '/api/identity/complete-recovery',
  '/api/identity/owner-reset-password',
  '/api/identity/request-owner-reset',
  '/api/identity/approve-owner-reset',
  '/api/identity/verify-pin',
  '/api/identity/devices',
  '/api/identity/revoke-devices',
  '/api/identity/logout',
  '/api/identity/audit',
]) {
  assert.ok(identityRewriteSources.includes(expectedPath), `Missing hosting rewrite: ${expectedPath}`);
}
assert.match(identityClientSource, /https:\/\/us-central1-hd-manager-c5839\.cloudfunctions\.net/);
assert.match(identityClientSource, /VITE_IDENTITY_API_BASE_URL/);
assert.doesNotMatch(identityClientSource, /VITE_SEPAY_API_BASE_URL/);
assert.match(identityClientSource, /'\/api\/identity\/login': 'identityLogin'/);
assert.match(identityClientSource, /export const warmIdentityLoginService/);
assert.match(identityClientSource, /'\/api\/identity\/register-company': 'identityRegisterCompany'/);
assert.match(identityClientSource, /export const identityRegisterCompany/);
assert.match(identityClientSource, /getIdentityApiUrl\(path\)/);
assert.match(identityClientSource, /identityCompleteRecovery = \(\{ resetToken, password, identifier \}\)/);
assert.match(identityClientSource, /'\/api\/identity\/owner-reset-password': 'identityOwnerResetPassword'/);
assert.match(identityClientSource, /export const identityOwnerResetPassword/);
assert.match(identityClientSource, /export const identityRequestOwnerReset/);
assert.match(identityClientSource, /export const identityApproveOwnerReset/);
assert.match(identityClientSource, /accountScope/);
assert.match(identityClientSource, /rememberIdentitySessionAccount\(result\)/);
assert.match(identityClientSource, /resetToken,\s*password,\s*identifier,\s*device:/);
const passwordLoginStart = identityFunctionSource.indexOf('const login = async');
const passwordLoginEnd = identityFunctionSource.indexOf('const completeSetup = async', passwordLoginStart);
const passwordLoginSource = identityFunctionSource.slice(passwordLoginStart, passwordLoginEnd);
assert.ok(passwordLoginStart >= 0 && passwordLoginEnd > passwordLoginStart, 'Identity password login must exist');
assert.doesNotMatch(passwordLoginSource, /\.trusted|deviceSecret|biometric/i, 'Trusted-device state must never block normal password login');
assert.match(appSource, /auth\.bootstrap\.not_required/);
assert.match(appSource, /findIdentitySessionOwner\(rawEmployees, currentUser\)/);
assert.match(appSource, /shouldInvalidateIdentitySession\(\{/);
assert.match(appSource, /loadedCollectionsTenantId === effectiveSessionCompanyId/);
assert.match(appSource, /firebaseAuthenticated: isSessionRevocationDataReady/);
assert.doesNotMatch(appSource, /auth\.bootstrap\.anonymous/);
assert.doesNotMatch(appSource, /if \(false\) return undefined;/);
assert.match(
  appSource,
  /auth = initializeAuth\(app, \{[\s\S]*?persistence: \[indexedDBLocalPersistence, browserLocalPersistence\]/,
  'Firebase Auth must configure supported persistence during construction'
);
assert.match(appSource, /firebaseAuthPersistencePromise = Promise\.resolve\('indexedDB-or-localStorage'\)/);
assert.match(appSource, /firebaseAuthPersistencePromise = configureFirebaseAuthPersistence\(auth\)/);
assert.match(appSource, /const expectedCachedFirebaseUid = cachedFirebaseUid \|\|/);
assert.match(appSource, /`identity_\$\{cachedIdentityKey\}`/);
assert.match(appSource, /const cachedSessionBoundToAuth = Boolean\(/);
assert.match(appSource, /auth\.identity_cache_released/);
assert.match(appSource, /firebaseUid: credential\.user\?\.uid \|\| ''/);

const anonymousSignInCalls = appSource.match(/signInAnonymously\(auth\)/g) || [];
assert.equal(anonymousSignInCalls.length, 0, 'Anonymous Auth must never run in login or startup paths');
assert.doesNotMatch(appSource, /anonymousBootstrapAllowedRef/);
assert.match(appSource, /if \(u\.isAnonymous\)/);
assert.match(appSource, /identityRegisterCompany\(\{/);
const authTimeoutStart = appSource.indexOf('const authTimeout = window.setTimeout');
const authTimeoutEnd = appSource.indexOf('const restoreIdentityFromClaims', authTimeoutStart);
const authTimeoutSource = appSource.slice(authTimeoutStart, authTimeoutEnd);
assert.ok(authTimeoutStart >= 0 && authTimeoutEnd > authTimeoutStart, 'Auth restore timeout guard must exist');
assert.doesNotMatch(authTimeoutSource, /clearAppSession|setCurrentUser\(null\)/, 'Slow Auth restoration must not delete a valid cached session');
assert.match(
  appSource,
  /if \(!isVpsApiMode && !firebaseUser && currentUser\)/,
  'Cached app state must be protected until Firebase Auth confirms the user'
);

const logoutHandlerStart = appSource.indexOf('const handleLogout = async () =>');
const logoutHandlerEnd = appSource.indexOf('const handleSwitchToCustomerLogin = async () =>', logoutHandlerStart);
const logoutHandlerSource = appSource.slice(logoutHandlerStart, logoutHandlerEnd);
assert.ok(logoutHandlerStart >= 0 && logoutHandlerEnd > logoutHandlerStart, 'Fast logout handler must exist');
assert.match(logoutHandlerSource, /startIdentityLogoutAudit\(auth\?\.currentUser\)/);
assert.match(logoutHandlerSource, /signOut\(auth\)\.catch/);
assert.match(logoutHandlerSource, /setFirebaseUser\(null\)/);
assert.match(logoutHandlerSource, /clearAppSession\(\)/);
assert.match(logoutHandlerSource, /void Promise\.allSettled/);
assert.doesNotMatch(
  logoutHandlerSource.slice(logoutHandlerSource.indexOf("if (isVpsStagingMode)") + 1),
  /await identityLogout|await signOut/,
  'Firebase network audit and sign-out must not block the production logout UI'
);

assert.doesNotMatch(appSource, /isCompanyDashboardServerReady/);
assert.doesNotMatch(appSource, /Đang đồng bộ dữ liệu mới nhất/);
assert.doesNotMatch(appSource, /Đang nạp dữ liệu tài khoản từ Cloud/);
assert.match(appSource, /const renderExecutiveDashboard = \(\) => \([\s\S]*?<ExecutiveDashboardView/);

const identitySessionStart = appSource.indexOf('const establishIdentitySession = async');
const identitySessionEnd = appSource.indexOf('const handleIdentityLogin = async');
const identitySessionSource = appSource.slice(identitySessionStart, identitySessionEnd);
assert.match(identitySessionSource, /runFirebaseAuthMutation\(\(\) => signInWithCustomToken/);
assert.match(identitySessionSource, /auth\.identity_login\.custom_token_completed/);
assert.match(identitySessionSource, /auth\.identity_login\.shell_released/);
assert.match(identityFunctionSource, /setCustomUserClaims\(firebaseUid, claims\)/);
assert.match(identityFunctionSource, /const \[customToken\] = await Promise\.all\([\s\S]*?batch\.commit\(\)/);
assert.match(identityFunctionSource, /loginRateRef: rate\.ref/);
assert.match(identityFunctionSource, /const registerCompany = async/);
assert.match(identityFunctionSource, /await db\.runTransaction/);
assert.match(identityFunctionSource, /transaction\.create\(companyRef, company\)/);
assert.match(identityFunctionSource, /transaction\.create\(employeeRef, employee\)/);
assert.match(identityFunctionSource, /transaction\.create\(identityRef, identity\)/);
const registerStart = identityFunctionSource.indexOf('const registerCompany = async');
const registerEnd = identityFunctionSource.indexOf('const enforceLoginRateLimit = async');
const registerSource = identityFunctionSource.slice(registerStart, registerEnd);
assert.doesNotMatch(registerSource, /password_hash\s*:/);
assert.ok(
  identityFunctionSource.indexOf('setCustomUserClaims(firebaseUid, claims)')
    < identityFunctionSource.indexOf('createCustomToken(firebaseUid, claims)'),
  'Persistent Firebase claims must be synchronized before issuing a custom token'
);
assert.match(appSource, /firestore\.write\.rest_token_refresh/);
assert.match(appSource, /firestore\.write\.sdk_token_refresh/);
assert.match(appSource, /authenticatedUser\.getIdToken\(forceRefreshToken\)/);
assert.match(appSource, /await firebaseUser\.getIdToken\(true\)/);
assert.doesNotMatch(identityFunctionSource, /collectionGroup\('reset_tokens'\)/);
assert.match(identityFunctionSource, /collection\('reset_tokens'\)\.doc\(tokenHash\)/);
assert.doesNotMatch(functionsIndexSource, /functions\.runWith\(/, 'Functions SDK v7 no longer exposes the legacy runWith API');
assert.match(functionsIndexSource, /functions\.https\.onRequest\(\{[\s\S]*?memory: '1GiB'/, 'Gen 2 runtime options must use the onRequest options overload');
assert.match(identityFunctionSource, /db\.runTransaction\(async transaction/);
assert.match(identityFunctionSource, /completeRecovery = async \(\{ resetToken, password, device, identifier = '' \}\)/);
const recoveryFunctionStart = identityFunctionSource.indexOf('const completeRecovery = async');
const recoveryFunctionEnd = identityFunctionSource.indexOf('const verifyPin = async', recoveryFunctionStart);
const recoveryFunctionSource = identityFunctionSource.slice(recoveryFunctionStart, recoveryFunctionEnd);
assert.doesNotMatch(recoveryFunctionSource, /issueSession\(/);
assert.match(recoveryFunctionSource, /password_reset_completed/);
const recoveryUiHandlerStart = appSource.indexOf('const handleIdentityCompleteRecovery = async');
const recoveryUiHandlerEnd = appSource.indexOf('const handleLogin = async', recoveryUiHandlerStart);
const recoveryUiHandlerSource = appSource.slice(recoveryUiHandlerStart, recoveryUiHandlerEnd);
assert.doesNotMatch(recoveryUiHandlerSource, /establishIdentitySession/);
assert.match(recoveryUiHandlerSource, /identityCompleteRecovery\(\{ resetToken, password, identifier \}\)/);

const ownerResetStart = identityFunctionSource.indexOf('const ownerResetEmployeePassword = async');
const ownerResetEnd = identityFunctionSource.indexOf('const verifyPin = async', ownerResetStart);
const ownerResetSource = identityFunctionSource.slice(ownerResetStart, ownerResetEnd);
assert.ok(ownerResetStart >= 0 && ownerResetEnd > ownerResetStart, 'Owner password-reset handler must exist');
assert.match(ownerResetSource, /ownerIdentity\.accountType !== 'employee' \|\| !isOwnerIdentity\(ownerIdentity\)/);
assert.match(ownerResetSource, /employeeCompanyId !== `\$\{ownerIdentity\.companyId \|\| ''\}`/);
assert.match(ownerResetSource, /existingIdentity && isOwnerIdentity\(existingIdentity\)/);
assert.match(ownerResetSource, /hashPassword\(DEFAULT_FIRST_LOGIN_PASSWORD\)/);
assert.match(ownerResetSource, /requiresPasswordChange: true/);
assert.match(ownerResetSource, /pinHash: admin\.firestore\.FieldValue\.delete\(\)/);
assert.match(ownerResetSource, /trusted: false/);
assert.match(ownerResetSource, /biometricEnabled: false/);
assert.match(ownerResetSource, /revokedReason: 'owner_reset'/);
assert.match(ownerResetSource, /action: 'password_reset_by_owner'/);
assert.match(ownerResetSource, /action: 'employee_password_reset'/);
assert.match(ownerResetSource, /revokeRefreshTokens/);
assert.match(functionsIndexSource, /exports\.identityOwnerResetPassword/);
assert.match(functionsIndexSource, /approvalRequestId: req\.body\?\.approvalRequestId/);
assert.match(identityFunctionSource, /const requestOwnerPasswordReset = async/);
assert.match(identityFunctionSource, /const approveOwnerPasswordReset = async/);
assert.match(identityFunctionSource, /identity_owner_reset_request/);
assert.match(identityFunctionSource, /ownerResetRequestId: safeApprovalRequestId/);
assert.match(identityFunctionSource, /temporaryPassword: DEFAULT_FIRST_LOGIN_PASSWORD/);
assert.match(appSource, /const handleOwnerResetEmployeePassword = async/);
assert.match(appSource, /canResetEmployeePassword=\{isOwnerAccount\}/);
assert.match(appSource, /handleIdentityOwnerResetRequest/);
assert.match(appSource, /identityResetRequestId/);

const loginViewStart = appSource.indexOf('function LoginRegisterView');
const loginViewSource = appSource.slice(loginViewStart, loginViewStart + 25000);
assert.ok(loginViewStart >= 0, 'LoginRegisterView must exist');
assert.match(
  loginViewSource,
  /\{!showForgotPassword && <>[\s\S]*?type="tel"[\s\S]*?autoComplete="username"[\s\S]*?autoComplete="current-password"[\s\S]*?<\/>,?\}/,
  'Login credentials must be hidden while password recovery is open'
);
assert.match(
  loginViewSource,
  /\{!showForgotPassword && \([\s\S]*?<button[\s\S]*?type="submit"[\s\S]*?disabled=\{isLoggingIn\}[\s\S]*?<\/button>[\s\S]*?\)\}/,
  'Login submit action must be hidden while password recovery is open'
);
assert.match(loginViewSource, /<form onSubmit=\{handleAuthFormSubmit\}/);
assert.match(loginViewSource, /void warmIdentityLoginService\(\)/);
assert.match(loginViewSource, /if \(!showForgotPassword\) return handleLoginSubmit\(event\)/);
assert.match(loginViewSource, /if \(!recoveryToken\) return handleForgotPasswordSubmit\(event\)/);
assert.match(loginViewSource, /setRequestOwnerReset\(false\)/);
assert.match(loginViewSource, /checked=\{requestOwnerReset\}/);
assert.match(loginViewSource, /onRequestOwnerReset/);
assert.match(loginViewSource, /Xin lại mật khẩu/);
assert.match(loginViewSource, /setLoginPhone\(nextLoginIdentifier\)/);
assert.match(loginViewSource, /setLoginPassword\(nextLoginPassword\)/);
assert.match(loginViewSource, /setShowForgotPassword\(false\)/);
assert.match(loginViewSource, /placeholder="Số điện thoại" autoComplete="username" inputMode="tel"/);
assert.doesNotMatch(loginViewSource, /vpsStagingMode \? 'email' : 'tel'/);
assert.match(loginViewSource, /Mã Công Ty \(VD: HDCO\)/);
assert.match(loginViewSource, /const normalizedCompanyCode = regCompanyCode\.trim\(\)\.toUpperCase\(\)/);

const identitySetupStart = appSource.indexOf('function IdentitySetupWizard');
const identitySetupEnd = appSource.indexOf('function LoginRegisterView', identitySetupStart);
const identitySetupSource = appSource.slice(identitySetupStart, identitySetupEnd);
assert.ok(identitySetupStart >= 0 && identitySetupEnd > identitySetupStart, 'Identity setup wizard must exist');
assert.doesNotMatch(identitySetupSource, /mustSetUsername|placeholder="Username|Vui lòng đặt Username/);
assert.doesNotMatch(identitySetupSource, /Keychain\/Keystore|Khóa thiết bị được lưu/);
assert.doesNotMatch(
  identityFunctionSource,
  /requiresSetup:\s*Boolean\([^\n]*usernameSet/,
  'Username must not block first-time setup completion'
);
assert.match(identityFunctionSource, /const requestedUsername = normalizeUsername\(username \|\| ''\)/);

console.log('Identity Center unit checks passed.');
