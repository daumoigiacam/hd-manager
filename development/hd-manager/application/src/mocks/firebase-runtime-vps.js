export const resolveFirebaseRuntimeConfig = () => ({});

export const resolveDataAppId = () => (
  import.meta.env.VITE_DATA_MODE === 'vps-production'
    ? 'hd-manager-vps-production'
    : 'hd-manager-vps-staging'
);
