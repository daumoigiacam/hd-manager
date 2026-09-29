export const resolveClientRuntime = () => ({
  legacyPaymentApiBaseUrl: `${import.meta.env.VITE_SEPAY_API_BASE_URL || import.meta.env.VITE_PAYOS_API_BASE_URL || ''}`.trim(),
});

export const resolveLegacyPaymentApiBaseUrl = () => {
  const configured = resolveClientRuntime().legacyPaymentApiBaseUrl;
  return (configured || 'https://hd-manager-c5839.web.app').replace(/\/+$/, '');
};
