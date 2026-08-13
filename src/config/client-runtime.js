export const resolveClientRuntime = () => ({
  googleMapsApiKey: `${import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''}`.trim(),
  googleMapsMapId: `${import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || ''}`.trim(),
  goongMapTilesApiKey: `${import.meta.env.VITE_GOONG_MAPTILES_KEY || import.meta.env.VITE_GOONG_MAP_KEY || ''}`.trim(),
  goongRestApiKey: `${import.meta.env.VITE_GOONG_REST_API_KEY || import.meta.env.VITE_GOONG_API_KEY || import.meta.env.VITE_GOONG_MAP_KEY || ''}`.trim(),
  legacyPaymentApiBaseUrl: `${import.meta.env.VITE_SEPAY_API_BASE_URL || import.meta.env.VITE_PAYOS_API_BASE_URL || ''}`.trim(),
});

export const resolveLegacyPaymentApiBaseUrl = () => {
  const configured = resolveClientRuntime().legacyPaymentApiBaseUrl;
  return (configured || 'https://hd-manager-c5839.web.app').replace(/\/+$/, '');
};
