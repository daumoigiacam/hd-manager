import { HdApiClient } from '../../api/client.js';

const DEFAULT_ADMIN_PATH = '/platform-admin';

/**
 * Shared client for HD Platform apps. It deliberately delegates transport,
 * token rotation, request IDs and error normalization to HdApiClient.
 */
export class HdPlatformClient {
  constructor({
    baseUrl,
    storage,
    timeoutMs,
    retryCount,
    deviceName = 'hd-platform-client',
    platform = 'hd-platform-client',
    tokenStorageNamespace = 'vps-platform',
    fetchImpl,
  } = {}) {
    this.api = new HdApiClient({
      baseUrl,
      storage,
      timeoutMs,
      retryCount,
      deviceName,
      platform,
      tokenStorageNamespace,
      fetchImpl,
    });
  }

  getAccessToken() {
    return this.api.getAccessToken();
  }

  hasSession() {
    return this.api.hasSession();
  }

  clearSession() {
    this.api.clearSession();
  }

  login(input) {
    return this.api.login(input);
  }

  refresh() {
    return this.api.refresh();
  }

  restoreSession() {
    return this.api.restoreSession();
  }

  logout() {
    return this.api.logout();
  }

  logoutAll() {
    return this.api.logoutAll();
  }

  me() {
    return this.api.getCurrentUser();
  }

  request(path, options) {
    return this.api.request(path, options);
  }

  get(path, options) {
    return this.api.get(path, options);
  }

  post(path, body, options) {
    return this.api.post(path, body, options);
  }

  tenantContext() {
    return this.me().then((user) => ({
      user,
      company: user?.company || null,
      branch: user?.branch || null,
      companyId: user?.company?.id || user?.user?.companyId || '',
      branchId: user?.branch?.id || user?.user?.branchId || '',
    }));
  }

  hasPermission(permission, user) {
    const permissions = user?.permissions
      || user?.user?.permissions
      || [];
    return permissions.includes('*') || permissions.includes(permission);
  }

  adminPath(path = '') {
    const suffix = `${path || ''}`.replace(/^\/+/, '');
    return `${DEFAULT_ADMIN_PATH}${suffix ? `/${suffix}` : ''}`;
  }

  adminOverview() {
    return this.get(this.adminPath('overview'));
  }

  adminApplications() {
    return this.get(this.adminPath('applications'));
  }

  adminDatabase() {
    return this.get(this.adminPath('database'));
  }

  adminServices() {
    return this.get(this.adminPath('services'));
  }

  adminBackup() {
    return this.get(this.adminPath('backup'));
  }

  adminDomains() {
    return this.get(this.adminPath('domains'));
  }

  adminMonitoring() {
    return this.get(this.adminPath('monitoring'));
  }

  adminRelease() {
    return this.get(this.adminPath('release'));
  }

  adminAudit(query = {}) {
    return this.get(this.adminPath('audit'), { query });
  }

  refreshAdminCache(targetResource = 'platform-admin') {
    return this.post(this.adminPath('commands'), {
      commandType: 'REFRESH_CACHE',
      targetResource,
    }, { retry: false, idempotencyKey: `admin-refresh-${Date.now()}` });
  }

  loadAdminSnapshot() {
    const calls = {
      overview: this.adminOverview(),
      applications: this.adminApplications(),
      database: this.adminDatabase(),
      services: this.adminServices(),
      backup: this.adminBackup(),
      domains: this.adminDomains(),
      monitoring: this.adminMonitoring(),
      release: this.adminRelease(),
      audit: this.adminAudit({ page: 1, limit: 10 }),
    };

    return Promise.all(Object.entries(calls).map(async ([key, promise]) => {
      try {
        return [key, { status: 'fulfilled', value: await promise }];
      } catch (error) {
        return [key, { status: 'rejected', reason: error }];
      }
    })).then((entries) => Object.fromEntries(entries));
  }
}

export const createHdPlatformClient = (options) => new HdPlatformClient(options);
