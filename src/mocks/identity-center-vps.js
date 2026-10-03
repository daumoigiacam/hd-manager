const isPreviewMode = import.meta.env.VITE_DATA_MODE === 'preview';

const blocked = (operation) => {
  const error = new Error(isPreviewMode
    ? 'This UI preview cannot sign in. Open the Firebase cloud app to use your account.'
    : `${operation} is not available in VPS staging.`);
  error.code = isPreviewMode
    ? 'identity-unavailable-in-ui-preview'
    : 'legacy-firebase-flow-blocked-in-vps-staging';
  return Promise.reject(error);
};

export const findIdentitySessionOwner = (records = [], identity = {}) => (
  (Array.isArray(records) ? records : []).find((record) => (
    record?.id === identity?.id
    || record?.employeeId === identity?.id
    || record?.customerId === identity?.id
  )) || null
);

export const getBiometricAvailability = async () => ({
  supported: false,
  available: false,
  reason: isPreviewMode ? 'ui-preview' : 'vps-staging',
});
export const authenticateBiometric = async () => ({
  success: false,
  message: isPreviewMode
    ? 'Biometric login is unavailable in this UI preview.'
    : 'Biometric login is unavailable in VPS staging.',
});
export const getBiometricAutoLoginProfile = () => null;
export const getIdentityAccountScope = (identity = {}) => {
  const identityKey = `${identity?.identityKey || ''}`.trim();
  if (identityKey) return identityKey;
  const accountType = `${identity?.accountType || identity?.role || 'account'}`.trim().toLowerCase();
  const companyId = `${identity?.companyId || ''}`.trim();
  const accountId = `${identity?.id || identity?.accountId || identity?.customerId || ''}`.trim();
  return accountId ? `${accountType}:${companyId}:${accountId}` : '';
};
export const shouldRequireBiometricUnlock = () => false;
export const suppressBiometricAutoLoginForSession = () => undefined;
export const clearBiometricAutoLoginSuppression = () => undefined;

export const getIdentityDevice = () => ({
  deviceId: isPreviewMode ? 'hd-manager-ui-preview-web' : 'hd-manager-vps-staging-web',
  name: isPreviewMode ? 'HD Manager UI preview' : 'HD Manager VPS staging',
  platform: 'web',
  os: 'web',
  appVersion: isPreviewMode ? 'ui-preview' : 'vps-staging',
});

export const shouldInvalidateIdentitySession = () => false;
export const warmIdentityLoginService = () => Promise.resolve(false);

export const identityLogin = () => blocked('Legacy Firebase login');
export const identityBiometricLogin = async () => ({ success: false, unavailable: true });
export const getQuickLoginAvailability = async () => ({ available: false, native: false });
export const identityRegisterPasskey = () => blocked('Passkey registration');
export const identityListPasskeys = () => blocked('Passkey list');
export const identityRevokePasskey = () => blocked('Passkey revocation');
export const identityRegisterCompany = () => blocked('Legacy Firebase registration');
export const identityCompleteSetup = () => blocked('Legacy Firebase identity setup');
export const identityRequestRecovery = () => blocked('Legacy Firebase password recovery');
export const identityCompleteRecovery = () => blocked('Legacy Firebase password recovery');
export const identityRequestOwnerReset = () => blocked('Legacy Firebase owner password reset');
export const identityApproveOwnerReset = () => blocked('Legacy Firebase owner password reset');
export const identityOwnerResetPassword = () => blocked('Legacy Firebase owner password reset');
export const identityVerifyPin = () => blocked('Legacy Firebase PIN verification');
export const identityListDevices = () => blocked('Legacy Firebase session management');
export const identityRevokeDevices = () => blocked('Legacy Firebase session management');
export const identityDeleteAccount = () => blocked('Legacy Firebase account deletion');
export const identitySetBiometric = () => blocked('Legacy Firebase biometric setup');
export const identityRecordAttendance = () => blocked('Legacy Firebase attendance');
export const identityLogout = () => blocked('Legacy Firebase logout');
export const identityListAudit = () => blocked('Legacy Firebase audit lookup');
export const customerPortalBootstrap = () => blocked('Legacy Firebase customer portal');
export const customerRedeemPoints = () => blocked('Legacy Firebase customer points');
export const customerCreateDebtPayment = () => blocked('Legacy Firebase debt payment');
export const requestAiGenerateContent = () => blocked('Legacy Firebase AI proxy');
export const getIdentityApiUrlForDiagnostics = () => '';
