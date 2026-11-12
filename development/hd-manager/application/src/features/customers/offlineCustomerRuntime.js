import {createContext, useContext} from 'react';
import {trustedOfflineEnabled} from '../../config/offlineRuntimeBuildConfig.js';

// One identity shared by startup and the lazily loaded CRM adapter.
// Keep this module independent of business views and database initialization.
export const OfflineCustomerRuntimeContext = createContext(null);

export function useOfflineCustomerRuntime() {
  const runtime = useContext(OfflineCustomerRuntimeContext);
  return trustedOfflineEnabled || (import.meta.env.MODE === 'emulator'
    && import.meta.env.VITE_OFFLINE_CUSTOMER_PILOT === 'true'
    && /^demo-[a-z0-9-]+$/.test(import.meta.env.VITE_FIREBASE_PROJECT_ID || '')) ? runtime : null;
}
