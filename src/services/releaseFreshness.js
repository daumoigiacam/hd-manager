const RELEASE_RELOAD_GUARD_KEY = 'hd-manager-release-reload-v1';
const INSTALLED_RELEASE_KEY = 'hd-manager-installed-build';

export const normalizeReleaseId = (value = '') => `${value || ''}`.trim();

export const shouldReloadForRelease = ({
  currentReleaseId,
  remoteReleaseId,
  guardedReleaseId = ''
} = {}) => {
  const current = normalizeReleaseId(currentReleaseId);
  const remote = normalizeReleaseId(remoteReleaseId);
  const guarded = normalizeReleaseId(guardedReleaseId);
  return Boolean(remote && current && remote !== current && remote !== guarded);
};

export const buildReleaseManifestUrl = (origin = '', now = Date.now()) => {
  const base = normalizeReleaseId(origin);
  if (!base) return '';
  const url = new URL('/version.json', base);
  url.searchParams.set('t', `${Number(now) || Date.now()}`);
  return url.toString();
};

export const installReleaseFreshnessMonitor = ({
  buildId,
  enabled = true,
  initialDelayMs = 900,
  fetchImpl = globalThis.fetch,
  windowRef = globalThis.window,
  documentRef = globalThis.document
} = {}) => {
  const currentReleaseId = normalizeReleaseId(buildId);
  if (!windowRef || !documentRef || !currentReleaseId) return () => {};

  windowRef.HD_MANAGER_BUILD = currentReleaseId;
  try {
    windowRef.localStorage?.setItem(INSTALLED_RELEASE_KEY, currentReleaseId);
  } catch {
    // Storage can be unavailable in private browsing; freshness still works.
  }

  const isRemoteWeb = /^https?:$/.test(windowRef.location?.protocol || '');
  if (!enabled || !isRemoteWeb || typeof fetchImpl !== 'function') return () => {};

  let disposed = false;
  let inFlight = null;
  let initialTimer = 0;

  const checkForRelease = async () => {
    if (disposed || inFlight) return inFlight;
    const manifestUrl = buildReleaseManifestUrl(windowRef.location.origin);
    if (!manifestUrl) return null;

    inFlight = (async () => {
      try {
        const response = await fetchImpl(manifestUrl, {
          cache: 'no-store',
          credentials: 'same-origin',
          headers: {
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache'
          }
        });
        if (!response?.ok) return null;
        const manifest = await response.json();
        const remoteReleaseId = normalizeReleaseId(manifest?.buildId);
        const guardedReleaseId = windowRef.sessionStorage?.getItem(RELEASE_RELOAD_GUARD_KEY) || '';
        if (!shouldReloadForRelease({ currentReleaseId, remoteReleaseId, guardedReleaseId })) {
          if (remoteReleaseId === currentReleaseId) {
            windowRef.sessionStorage?.removeItem(RELEASE_RELOAD_GUARD_KEY);
          }
          return remoteReleaseId;
        }

        windowRef.sessionStorage?.setItem(RELEASE_RELOAD_GUARD_KEY, remoteReleaseId);
        const nextUrl = new URL(windowRef.location.href);
        nextUrl.searchParams.set('release', remoteReleaseId);
        windowRef.location.replace(nextUrl.toString());
        return remoteReleaseId;
      } catch (error) {
        console.warn('Khong the kiem tra phien ban HD Manager moi:', error);
        return null;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };

  const handlePageShow = (event) => {
    if (event?.persisted) void checkForRelease();
  };

  initialTimer = windowRef.setTimeout(() => {
    void checkForRelease();
  }, Math.max(0, Number(initialDelayMs) || 0));
  windowRef.addEventListener('pageshow', handlePageShow, { passive: true });

  return () => {
    disposed = true;
    if (initialTimer) windowRef.clearTimeout(initialTimer);
    windowRef.removeEventListener('pageshow', handlePageShow);
  };
};
