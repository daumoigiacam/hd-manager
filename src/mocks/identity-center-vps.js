const blocked = (operation) => {
  const error = new Error(`${operation} is not available in VPS staging.`);
  error.code = 'legacy-firebase-flow-blocked-in-vps-staging';
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
  reason: 'vps-staging',
});

export const getIdentityDevice = () => ({
  deviceId: 'hd-manager-vps-staging-web',
  name: 'HD Manager VPS staging',
  platform: 'web',
  os: 'web',
  appVersion: 'vps-staging',
});

export const shouldInvalidateIdentitySession = () => false;
export const warmIdentityLoginService = () => Promise.resolve(false);

export const identityLogin = () => blocked('Legacy Firebase login');
export const identityRegisterCompany = () => blocked('Legacy Firebase registration');
export const identityCompleteSetup = () => blocked('Legacy Firebase identity setup');
export const identityRequestRecovery = () => blocked('Legacy Firebase password recovery');
export const identityCompleteRecovery = () => blocked('Legacy Firebase password recovery');
export const identityOwnerResetPassword = () => blocked('Legacy Firebase owner password reset');
export const identityVerifyPin = () => blocked('Legacy Firebase PIN verification');
export const identityListDevices = () => blocked('Legacy Firebase session management');
export const identityRevokeDevices = () => blocked('Legacy Firebase session management');
export const identitySetBiometric = () => blocked('Legacy Firebase biometric setup');
export const identityLogout = () => blocked('Legacy Firebase logout');
export const identityListAudit = () => blocked('Legacy Firebase audit lookup');
export const customerPortalBootstrap = () => blocked('Legacy Firebase customer portal');
export const customerRedeemPoints = () => blocked('Legacy Firebase customer points');
export const customerCreateDebtPayment = () => blocked('Legacy Firebase debt payment');
export const requestAiGenerateContent = () => blocked('Legacy Firebase AI proxy');
export const getIdentityApiUrlForDiagnostics = () => '';
