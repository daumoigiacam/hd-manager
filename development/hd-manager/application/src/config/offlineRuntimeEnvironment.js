// Explicit build-time trust configuration. This selects infrastructure; it
// never supplies a user, tenant, role, capability or signed permission.
const trusted = new WeakSet();
const local = new WeakSet();
const fail = () => { throw new Error('Invalid trusted Offline environment'); };
function https(value) {
  let url; try { url = new URL(value); } catch { fail(); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || !/^[a-z0-9.-]+$/.test(host) || !host.includes('.') || host.endsWith('.localhost')
    || host.endsWith('.local') || host.endsWith('.internal') || /^[\d.]+$/.test(host)
    || ['localhost','localhost.localdomain'].includes(host)) fail();
  return url;
}
export function resolveOfflineRuntimeEnvironment({projectId, appId, apiBaseUrl, appOrigin, publicKey, environment, maxOfflineMs = 3600000}) {
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId || '') || projectId.startsWith('demo-')
    || !/^[a-zA-Z0-9_-]{1,160}$/.test(appId || '') || !['development','production','isolated-qa'].includes(environment)
    || !Number.isSafeInteger(maxOfflineMs) || maxOfflineMs < 60000 || maxOfflineMs > 86400000) fail();
  const api = https(apiBaseUrl), app = https(appOrigin);
  if (app.pathname !== '/' || (environment === 'development' && projectId === 'hd-manager-c5839')
    || (environment === 'production' && (projectId !== 'hd-manager-c5839' || appId !== 'hd-manager-production'
      || app.origin !== 'https://app.hdconnect.net'))) fail();
  if(environment==='isolated-qa'&&(projectId!=='hd-manager-c5839'||appId!=='hd-manager-release-qa-20261114'||app.origin==='https://app.hdconnect.net'))fail();
  if (!publicKey || publicKey.kty !== 'RSA' || publicKey.e !== 'AQAB' || publicKey.alg !== 'RS256'
    || typeof publicKey.n !== 'string' || !/^[A-Za-z0-9_-]{342,}$/.test(publicKey.n)
    || Object.keys(publicKey).some(k => ['d','p','q','dp','dq','qi','oth'].includes(k))) fail();
  const value = Object.freeze({version:1,projectId,appId,apiBaseUrl:api.href.endsWith('/')?api.href:api.href+'/',
    appOrigin:app.origin,environment,maxOfflineMs,publicKey:Object.freeze({...publicKey})});
  trusted.add(value); return value;
}
export function assertOfflineRuntimeEnvironment(value, projectId, origin) {
  if ((!trusted.has(value)&&!local.has(value)) || value.projectId !== projectId || (origin && value.apiBaseUrl !== new URL(origin).href)) fail();
  return value;
}
// Explicit local adapter trust, never a Production trust descriptor. Only an
// Emulator build may construct it; the remote validator above remains strict.
export function resolveLocalOfflineRuntimeEnvironment({mode,projectId,appId,apiBaseUrl,appOrigin,publicKey,maxOfflineMs=3600000}){
 if(mode!=='emulator'||!/^demo-hdmanager-[a-z0-9-]+$/.test(projectId||'')||!/^hd-manager-(local|development)$/.test(appId||'')||!Number.isSafeInteger(maxOfflineMs)||maxOfflineMs<60000||maxOfflineMs>86400000)fail();
 const api=new URL(apiBaseUrl),app=new URL(appOrigin);
 for(const u of [api,app])if(u.protocol!=='http:'||!['127.0.0.1','localhost'].includes(u.hostname)||u.username||u.password||u.search||u.hash)fail();
 if(app.pathname!=='/'||!publicKey||publicKey.kty!=='RSA'||publicKey.e!=='AQAB'||publicKey.alg!=='RS256'||! /^[A-Za-z0-9_-]{342,}$/.test(publicKey.n||'')||['d','p','q','dp','dq','qi','oth'].some(k=>Object.hasOwn(publicKey,k)))fail();
 const value=Object.freeze({version:1,projectId,appId,apiBaseUrl:api.href.endsWith('/')?api.href:api.href+'/',appOrigin:app.origin,environment:'local',readinessClass:'LOCAL_ONLY',maxOfflineMs,publicKey:Object.freeze({...publicKey})});local.add(value);return value;
}
export function assertOfflineProject(projectId, environment) {
  if (environment) return assertOfflineRuntimeEnvironment(environment, projectId);
  if (!/^demo-[a-z0-9-]+$/.test(projectId || '')) throw new Error('Offline project requires an explicit trusted environment');
  return null;
}
