const firebaseOnlyError = (capability) => {
  const error = new Error(
    `${capability} is unavailable in the Firebase-only HD Manager runtime.`,
  );
  error.code = 'HD_MANAGER_FIREBASE_ONLY';
  throw error;
};

export const vpsDataMode = 'cloud';
export const isVpsMode = false;
export const isVpsStagingMode = false;
export const inventoryVpsEnabled = false;

export const createVpsIdentitySecurityApi = () => firebaseOnlyError('VPS identity');
export const getHdConnectStagingApi = () => firebaseOnlyError('HD Platform API');
export const buildVpsInventoryTransaction = () => firebaseOnlyError('VPS inventory');

// These normalizers are referenced only by staging branches. Keeping them as
// inert identity functions makes accidental production use observable without
// importing the Platform adapter or its API client into the Firebase bundle.
export const normalizeVpsAttendance = (record = {}) => record;
export const normalizeVpsFinanceExpense = (record = {}) => record;
export const normalizeVpsStockMovement = (record = {}) => record;
