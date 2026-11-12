import {companyHomeDomainPlugin} from './scripts/helpers/company-home-domain.mjs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import {employeeHomeDomainPlugin} from './scripts/helpers/employee-home-domain-extraction.mjs';
import {selectVendorChunk} from './scripts/helpers/vendor-chunks.mjs';
import {createHash} from 'node:crypto';
import {offlineShellPlugin} from './scripts/helpers/offline-shell-plugin.mjs';
import {resolveOfflineRuntimeEnvironment} from './src/config/offlineRuntimeEnvironment.js';

// Keep this implementation in the inventoried config, not an untracked helper.
// These are the four existing effect imports; links never invoke the effect.
export const NATIVE_STARTUP_CORE_ROOTS = Object.freeze([
  'src/data/nativeOfflineCustomerPlatform.js',
  'src/data/bootstrapOfflineCustomer.js',
  'src/data/offlineAppSession.js',
  'src/data/offlineCustomerTransport.js',
]);
const CORE_SOURCE_MODULES = new Set([
  'src/config/offlineRuntimeEnvironment.js',
  'src/config/offlineRuntimeBuildConfig.js',
  'src/services/webOfflineShell.js',
  'src/layout/WebOfflineNotice.jsx',
  ...NATIVE_STARTUP_CORE_ROOTS,
  'performance/offline-first/schema-v1.sql?raw',
  'src/data/crmSearchTrace.js',
  'src/data/customerDeltaCoordinator.js',
  'src/data/customerPageCoordinator.js',
  'src/data/exactSQLiteSchema.js', // Pure injected-owner helper; never a preload root.
  'src/data/nativeOfflineDatabase.js',
  'src/data/offlineCommandRepository.js',
  'src/data/offlineCustomerGrant.js',
  'src/data/offlineCustomerHistory.js',
  'src/data/offlineCustomerQuery.js',
  'src/data/offlineCustomerRepository.js',
  'src/data/offlineCustomerWriteBridge.js',
  'src/data/offlineDatabaseBinding.js',
  'src/data/offlineReadLease.js',
  'src/data/offlineScopeOwnership.js',
  'src/data/offlineSecureSessionStore.js',
  'src/data/offlineSyncEngine.js',
  'src/data/sqliteDirectoryReadMemo.js',
  'src/data/verifiedDataSession.js',
  // Audited existing entry/backedge only. No src/App.jsx or feature views.
  'src/main.jsx',
  'src/design-system/ThemeProvider.jsx',
  'src/design-system/themePreferences.js',
  'src/design-system/foundation.css',
  'src/index.css',
  'src/layout/AppShell.jsx',
  'src/layout/CoreWorkspaceEntry.jsx',
  'src/layout/NativeBusinessRoute.jsx', // Existing lazy route coordinator.
  'src/layout/PreloadedWorkspace.jsx',
  'src/layout/RestoredLocalWorkspace.jsx',
  'src/layout/WorkingHome.jsx',
  'src/layout/working-home.css',
  'src/services/adaptivePerformance.js',
  'src/services/businessSearchForegroundGate.js', // Import-free factory, static bootstrap dependency.
  'src/services/detachedEditorCleanup.js',
  'src/services/legacyRuntime.js',
  'src/services/offlineStartupTrace.js',
  'src/services/performanceMonitor.js',
  'src/services/releaseFreshness.js',
  'src/services/scopedNativeListener.js',
  'src/services/startupTelemetry.js',
  'src/services/useNativeOfflineWorkspace.js',
  'src/utils/businessDate.js',
  'src/utils/keyboardViewport.js',
  'src/utils/preloadableModule.js',
]);
const CORE_SDK_PACKAGES = new Set([
  '@capacitor/core', '@capacitor/app', '@capacitor-community/sqlite',
  '@capgo/capacitor-native-biometric', 'react', 'react-dom', 'scheduler', 'lucide-react',
]);
const CORE_VIRTUAL_MODULES = new Set([
  '\0vite/modulepreload-polyfill.js', '\0vite/preload-helper.js', '\0commonjsHelpers.js',
]);
const normalizeCoreId = id => id.replaceAll('\\', '/').replace(/^[A-Z]:/, drive => drive.toLowerCase());
const corePreloadError = reason => { throw Error(`Native startup core preload: ${reason}`); };

function auditedCoreModule(id, root) {
  if (CORE_VIRTUAL_MODULES.has(id)) return id.slice(1);
  const normalized = normalizeCoreId(id.replace(/^\0/, ''));
  if (normalized.split('/').some(part => part === '..' || part === '.')) corePreloadError('non-canonical module id');
  if (normalized.startsWith(root + '/')) {
    const relative = normalized.slice(root.length + 1);
    if (CORE_SOURCE_MODULES.has(relative)) return relative;
    if (relative.endsWith('.css?used') && CORE_SOURCE_MODULES.has(relative.slice(0, -5))) return relative;
  }
  const marker = normalized.lastIndexOf('/node_modules/');
  if (marker !== -1) {
    const relative = normalized.slice(marker + 14);
    const parts = relative.split('/');
    const pkg = parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
    if (CORE_SDK_PACKAGES.has(pkg) && /\.(?:js|mjs|cjs)(?:\?commonjs-(?:proxy|es-import|module|exports|entry))?$/.test(relative)) return 'node_modules/' + relative;
  }
  corePreloadError(`module outside the explicit core whitelist: ${id}`);
}

// Read Vite's generated link/script tags, not JS source or __vite__mapDeps.
// Inert comments/script/style/template text cannot suppress a real preload.
function existingCoreRequests(html) {
  const urls = new Set();
  const live = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|template|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, tag => {
    if (/^<script\b/i.test(tag)) return tag.slice(0, tag.indexOf('>') + 1);
    return '';
  });
  for (const match of live.matchAll(/<(link|script)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi)) {
    const attrs = new Map();
    for (const attr of match[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      const name = attr[1].toLowerCase();
      if (attrs.has(name)) corePreloadError('duplicate attributes in existing resource tag');
      attrs.set(name, attr[2] ?? attr[3] ?? attr[4]);
    }
    const link = match[1].toLowerCase() === 'link';
    const scheduled = link ? (attrs.get('rel') || '').toLowerCase().split(/\s+/).includes('modulepreload') : attrs.get('type')?.toLowerCase() === 'module';
    if (!scheduled) continue;
    const href = attrs.get(link ? 'href' : 'src');
    if (!href) { if (link) corePreloadError('modulepreload link without href'); else continue; }
    const url = new URL(href, 'https://core-preload.invalid/index.html');
    urls.add(url.href);
  }
  return urls;
}

export function nativeStartupCorePreloadPlugin({enabled = false, mode, minimalNativeEntry = false, projectId = '', firebaseEmulators = false} = {}) {
  if (typeof enabled !== 'boolean') corePreloadError('enabled must be an explicit boolean');
  if (enabled && (mode !== 'emulator' || !minimalNativeEntry || !firebaseEmulators || !/^demo-[a-z0-9-]+$/.test(projectId))) corePreloadError('opt-in requires the Development minimal Emulator build');
  let root, evidence, htmlEntryAudit;
  return {
    name: 'hd-native-startup-core-html-preload',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      if (!enabled) return;
      if (config.command !== 'build' || config.mode !== 'emulator' || config.base !== './' || config.build.ssr) corePreloadError('unsupported build/base/SSR context');
      root = normalizeCoreId(config.root).replace(/\/$/, '');
    },
    buildStart() { evidence = undefined; htmlEntryAudit = undefined; },
    renderChunk(_code, chunk) {
      if (!enabled) return;
      const htmlId = Object.keys(chunk.modules).find(id => normalizeCoreId(id) === root + '/index.html');
      if (!htmlId) return;
      // Vite turns this HTML into a side-effect-import facade, not an arbitrary
      // approved module. Check its actual transformed AST/resolved module graph.
      const info = this.getModuleInfo(htmlId);
      if (htmlEntryAudit || !chunk.isEntry || normalizeCoreId(chunk.facadeModuleId || '') !== root + '/index.html'
        || chunk.modules[htmlId].renderedLength !== 0 || !info?.isEntry || typeof info.code !== 'string'
        || !Array.isArray(info.importedIds) || !Array.isArray(info.dynamicallyImportedIds) || info.dynamicallyImportedIds.length) corePreloadError('unverified HTML entry facade');
      const body = this.parse(info.code).body;
      const sources = body.map(node => node.type === 'ImportDeclaration' && node.specifiers.length === 0 ? node.source.value : null);
      const expectedSources = ['/src/main.jsx', 'vite/modulepreload-polyfill'];
      const resolved = info.importedIds.map(normalizeCoreId).sort();
      const expectedResolved = [root + '/src/main.jsx', '\0vite/modulepreload-polyfill.js'].sort();
      if (sources.length !== 2 || new Set(sources).size !== 2 || sources.some(source => !expectedSources.includes(source))
        || resolved.length !== 2 || resolved.some((id, i) => id !== expectedResolved[i])) corePreloadError('HTML facade is not the exact main/polyfill import-only entry');
      // renderChunk fileName still contains Rollup hash placeholders. Match the
      // stable facade + complete module set later, not that preliminary name.
      htmlEntryAudit = {module: 'index.html', chunk: null, renderChunkFile: chunk.fileName, importOnly: true, renderedLength: 0,
        ownerModulesSha256: createHash('sha256').update(Object.keys(chunk.modules).map(normalizeCoreId).sort().join('\n')).digest('hex'),
        transformedSha256: createHash('sha256').update(info.code).digest('hex'), sources,
        resolvedImports: ['src/main.jsx', 'vite/modulepreload-polyfill.js']};
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        if (!enabled) return;
        if (!root || !context.bundle || !['/index.html', 'index.html'].includes(context.path) || evidence) corePreloadError('expected one emitted index.html graph');
        const bundle = context.bundle;
        const existing = existingCoreRequests(html);
        const chunks = Object.values(bundle).filter(output => output.type === 'chunk');
        const roots = NATIVE_STARTUP_CORE_ROOTS.map(module => {
          const owners = chunks.filter(chunk => Object.keys(chunk.modules).some(id => normalizeCoreId(id) === root + '/' + module));
          if (owners.length !== 1) corePreloadError(`missing or ambiguous mandatory root: ${module}`);
          return {module, chunk: owners[0].fileName};
        });
        const seen = new Set(), graph = [], modules = new Set();
        const visit = (file, path = []) => {
          if (seen.has(file)) return;
          if (!/^[A-Za-z0-9_./-]+\.js$/.test(file) || file.split('/').some(part => !part || part === '..' || part === '.')) corePreloadError('unsafe/non-JS emitted dependency');
          const chunk = bundle[file];
          if (!chunk || chunk.type !== 'chunk' || chunk.fileName !== file || !Array.isArray(chunk.imports)) corePreloadError(`missing/external/non-chunk dependency: ${file}`);
          seen.add(file);
          if (seen.size > 24) corePreloadError('static closure exceeds 24 chunks');
          for (const id of Object.keys(chunk.modules)) {
            if (normalizeCoreId(id) === root + '/index.html') {
              const scheduled = existing.has(new URL('./' + file, 'https://core-preload.invalid/index.html').href);
              const ownerModulesSha256 = createHash('sha256').update(Object.keys(chunk.modules).map(normalizeCoreId).sort().join('\n')).digest('hex');
              if (!htmlEntryAudit || htmlEntryAudit.ownerModulesSha256 !== ownerModulesSha256 || context.chunk !== chunk || !scheduled
                || !chunk.isEntry || normalizeCoreId(chunk.facadeModuleId || '') !== root + '/index.html'
                || chunk.modules[id].renderedLength !== 0) corePreloadError('HTML facade is not the verified already-requested entry; diagnostic=' + JSON.stringify({
                  renderChunkFile: htmlEntryAudit?.renderChunkFile || null, emittedFile: file, contextFile: context.chunk?.fileName || null,
                  sameOwnerModules: htmlEntryAudit?.ownerModulesSha256 === ownerModulesSha256,
                  sameChunkObject: context.chunk === chunk, scheduled, isEntry: chunk.isEntry,
                  facadeModule: normalizeCoreId(chunk.facadeModuleId || '').replace(root + '/', ''), renderedLength: chunk.modules[id].renderedLength,
                  existingPaths: [...existing].map(url => new URL(url).pathname), staticPath: [...path, file],
                  modules: Object.keys(chunk.modules).map(module => normalizeCoreId(module).replace(root + '/', '')),
                }));
              htmlEntryAudit.chunk = file;
              modules.add('index.html');
            } else {
              try { modules.add(auditedCoreModule(id, root)); }
              catch (error) { corePreloadError(error.message + '; static chunk path: ' + [...path, file].join(' -> ')); }
            }
          }
          if (modules.size > 4096) corePreloadError('static closure exceeds module bound');
          graph.push({fileName: file, bytes: Buffer.byteLength(chunk.code), sha256: createHash('sha256').update(chunk.code).digest('hex'), imports: [...chunk.imports],
            importedBindings: chunk.importedBindings || {}, moduleIds: Object.keys(chunk.modules).map(id => normalizeCoreId(id).replace(root + '/', ''))});
          for (const dependency of chunk.imports) visit(dependency, [...path, file]); // ONLY static Rollup edges.
        };
        for (const item of roots) visit(item.chunk);
        const added = [], alreadyRequested = [];
        let addedBytes = 0;
        for (const chunk of graph) {
          const href = './' + chunk.fileName;
          const key = new URL(href, 'https://core-preload.invalid/index.html').href;
          if (existing.has(key)) { alreadyRequested.push(href); continue; }
          existing.add(key); added.push(href); addedBytes += chunk.bytes;
        }
        if (addedBytes > 256 * 1024) corePreloadError('new preload bytes exceed 256KiB');
        evidence = {schemaVersion: 1, enabled: true, developmentMinimalOnly: true, roots, staticChunks: graph, sourceModules: [...modules].sort(), htmlEntryFacade: htmlEntryAudit || null, addedLinks: added, alreadyRequested, addedBytes,
          traversal: 'OutputChunk.imports only', unknownModulesAllowed: false, businessAppCrmModulesAllowed: false, runtimeCodeInjected: false, runtimeEffectUnchanged: true};
        return {html, tags: added.map(href => ({tag: 'link', attrs: {rel: 'modulepreload', crossorigin: '', href}, injectTo: 'head-prepend'}))};
      },
    },
    generateBundle: {
      order: 'post',
      handler(options, bundle) {
        if (!enabled) return;
        if (options.format !== 'es' || !evidence || bundle['native-startup-core-preload.json']) corePreloadError('missing validated plan, unsupported output or duplicate evidence');
        this.emitFile({type: 'asset', fileName: 'native-startup-core-preload.json', source: JSON.stringify(evidence, null, 2) + '\n'});
      },
    },
  };
}

const previewFirebaseConfig = {
  apiKey: 'preview-api-key',
  projectId: 'preview-project',
  appId: 'preview-app-id'
};

const defaultCloudFirebaseConfig = {
  apiKey: 'AIzaSyArlXDv5D_u1nSsZfK_hiytCZP5ifRczVs',
  authDomain: 'hd-manager-c5839.firebaseapp.com',
  projectId: 'hd-manager-c5839',
  storageBucket: 'hd-manager-c5839.firebasestorage.app',
  messagingSenderId: '644131886856',
  appId: '1:644131886856:web:f8d9b0713c4ba842d97ebd',
  measurementId: 'G-VL3C6P5RH4'
};
const defaultProductionAppId = 'hd-manager-production';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  if(env.VITE_OFFLINE_RUNTIME==='local-v1'&&(mode!=='emulator'||!/^demo-hdmanager-/.test(env.VITE_FIREBASE_PROJECT_ID||'')||env.VITE_FIREBASE_EMULATORS!=='true'))throw Error('Local Offline build cannot target a remote Firebase or Production mode');
  const minimalNativeEntry=env.VITE_NATIVE_MINIMAL_ENTRY==='true'&&((mode==='emulator'&&env.VITE_OFFLINE_CUSTOMER_PILOT==='true')||env.VITE_OFFLINE_RUNTIME==='trusted-v1');
  if(env.VITE_OFFLINE_RUNTIME==='trusted-v1')resolveOfflineRuntimeEnvironment({projectId:env.VITE_FIREBASE_PROJECT_ID,appId:env.VITE_HD_APP_ID,apiBaseUrl:env.VITE_OFFLINE_API_BASE_URL,appOrigin:env.VITE_OFFLINE_APP_ORIGIN,publicKey:JSON.parse(env.VITE_OFFLINE_VERIFYING_JWK||'null'),environment:env.VITE_OFFLINE_ENVIRONMENT,maxOfflineMs:Number(env.VITE_OFFLINE_MAX_MS||3600000)});
  if(env.VITE_OFFLINE_RUNTIME==='trusted-v1'&&env.VITE_OFFLINE_ENVIRONMENT==='development'){
    // Never combine a Development project ID with the default Production
    // Auth domain/key/app. These public settings must come from that project.
    if(!env.VITE_FIREBASE_API_KEY||env.VITE_FIREBASE_API_KEY===defaultCloudFirebaseConfig.apiKey||env.VITE_FIREBASE_AUTH_DOMAIN!==`${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`||!/^1:\d+:web:[a-f0-9]+$/.test(env.VITE_FIREBASE_APP_ID||'')||env.VITE_FIREBASE_APP_ID.split(':')[1]!==env.VITE_FIREBASE_MESSAGING_SENDER_ID||!env.VITE_FIREBASE_STORAGE_BUCKET?.startsWith(env.VITE_FIREBASE_PROJECT_ID+'.'))throw Error('Complete matching Development Firebase Web configuration required; Production fallback forbidden');
  }
  if(minimalNativeEntry&&env.VITE_OFFLINE_RUNTIME!=='trusted-v1'&&!/^demo-/.test(env.VITE_FIREBASE_PROJECT_ID||''))throw Error('Minimal native startup requires an approved Emulator or explicit trusted environment');
  const nativeStartupEntryPlugin={name:'hd-existing-runtime-native-entry',enforce:'pre',resolveId(request,importer){
    if(request==='@hd/native-bootstrap-core')return fileURLToPath(new URL(mode==='emulator'&&minimalNativeEntry&&env.VITE_NATIVE_STATIC_BOOTSTRAP==='true'?'./src/data/nativeStartupCoreEager.js':'./src/data/nativeStartupCoreDeferred.js',import.meta.url));
    if(minimalNativeEntry&&request==='./App.jsx'&&importer?.replaceAll('\\','/').endsWith('/src/main.jsx'))return fileURLToPath(new URL('./src/layout/CoreWorkspaceEntry.jsx',import.meta.url));
  }};
  const localStartupShell={name:'hd-local-critical-shell',transformIndexHtml:{order:'post',handler(html){
    if(mode!=='emulator'||!minimalNativeEntry||env.VITE_NATIVE_CRITICAL_SHELL!=='true')return html;
    const script=`<script>(function(){var b=new Uint8Array(16);crypto.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;var id=Array.prototype.map.call(b,function(x){return('0'+x.toString(16)).slice(-2)}).join('');id=id.slice(0,8)+'-'+id.slice(8,12)+'-'+id.slice(12,16)+'-'+id.slice(16,20)+'-'+id.slice(20);var d={traceId:id,initialScriptAt:performance.now(),timeOrigin:performance.timeOrigin,paints:[]};window.__hdStartupDocument=d;try{var o=new PerformanceObserver(function(l){l.getEntries().forEach(function(e){d.paints.push({name:e.name,at:e.startTime})});if(d.paints.some(function(e){return e.name==='first-contentful-paint'}))o.disconnect()});o.observe({type:'paint',buffered:true})}catch(e){}})();</script>`;
    const style="<style data-local-critical-shell>html,body{margin:0}*,*:before,*:after{box-sizing:border-box}.hd-startup-workspace{min-height:100vh;background:#f7faf9;color:#163b35;font-family:system-ui,sans-serif;display:flex;flex-direction:column}.hd-startup-workspace header{background:#164e40;color:white;padding:24px 20px;display:flex;justify-content:space-between;align-items:center}.hd-startup-workspace header strong{font-size:24px}.hd-startup-workspace header button{background:transparent;border:1px solid #a7c8bc;color:white;padding:8px 12px;border-radius:8px}.hd-startup-workspace section{padding:28px 20px;flex:1}.hd-startup-workspace h1{font-size:24px;margin:0 0 14px}.hd-startup-workspace p{font-size:15px;line-height:1.6;color:#536b62}.hd-startup-workspace nav{display:flex;padding:14px 8px 24px;border-top:1px solid #dce5e0;background:white;gap:6px}.hd-startup-workspace nav button{flex:1;border:0;border-radius:8px;padding:14px 2px;color:#71877d;background:#eff4f1;font-size:13px;opacity:1}</style>";
    html=html.replace('<head>','<head>'+style+script).replace('<div id="root"></div>',"<div id=\"root\"><main class=\"hd-startup-workspace\" data-hd-startup-shell=\"true\" aria-label=\"Đang khởi tạo Workspace\" aria-busy=\"true\"><header><strong>HD Manager</strong></header><section><h1>Không gian làm việc</h1><p role=\"status\">Đang khôi phục phiên và xác minh quyền truy cập…</p><p>Dữ liệu chỉ mở sau khi xác minh tài khoản và doanh nghiệp.</p></section><nav aria-label=\"Điều hướng đang khởi tạo\"><button disabled>Trang chủ</button><button disabled>Khách hàng</button><button disabled>Đơn hàng</button><button disabled>Chức năng</button></nav></main></div><script>window.__hdStartupDocument.shellMarkupAt=performance.now();</script>");
    // Only the Local HTML changes: fetch global business styles in parallel
    // instead of making the unprivileged first shell wait for them.
    return html.replace(/<link\s+rel="stylesheet"([^>]+)>/g,(_,attrs)=>'<link rel="preload" as="style"'+attrs+' onload="this.onload=null;this.rel=\'stylesheet\'">'+'<noscript><link rel="stylesheet"'+attrs+'></noscript>');
  }}};
  const earlyBootstrap=mode==='emulator'&&minimalNativeEntry&&env.VITE_NATIVE_EARLY_BOOTSTRAP==='true';
  const earlyPlugin={name:'hd-existing-bootstrap-early-entry',transformIndexHtml:{order:'post',handler(html,ctx){
   if(!earlyBootstrap||!ctx.bundle)return html;
   const entry=Object.values(ctx.bundle).find(c=>c.type==='chunk'&&c.isEntry&&c.facadeModuleId?.replaceAll('\\','/').endsWith('/src/native-early-entry.js'));
   if(!entry)throw Error('Early existing bootstrap entry missing');
   const seen=new Set(),modules=[];function visit(name){if(seen.has(name))return;seen.add(name);const c=ctx.bundle[name];if(c?.type!=='chunk')throw Error('Missing early chunk');modules.push(...Object.keys(c.modules));for(const dep of c.imports)visit(dep);}visit(entry.fileName);
   if(modules.some(id=>/(?:node_modules[\\/](?:react|react-dom|scheduler)[\\/]|\.jsx$)/.test(id)))throw Error('UI dependency in early bootstrap');
   ctx.bundle['native-startup-graph.json']={type:'asset',fileName:'native-startup-graph.json',source:JSON.stringify({entry:entry.fileName,staticChunks:[...seen],modules},null,2)};
   return html.replace('</script>','</script><script type="module" async crossorigin src="./'+entry.fileName+'"></script>');
  }}};
  const nativeStartupCorePreload = nativeStartupCorePreloadPlugin({
    enabled: env.VITE_NATIVE_STARTUP_CORE_PRELOAD === 'true', mode, minimalNativeEntry,
    projectId: env.VITE_FIREBASE_PROJECT_ID || '', firebaseEmulators: env.VITE_FIREBASE_EMULATORS === 'true',
  });
  const builtAt = new Date().toISOString();
  const buildId = `${env.GITHUB_SHA || env.VITE_HD_BUILD_ID || `${env.npm_package_version || 'local'}-${Date.now()}`}`
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-');
  const allowPreviewBuild = env.VITE_ALLOW_PREVIEW_BUILD === 'true';
  const usePreviewData = env.VITE_DATA_MODE === 'preview' && (mode !== 'production' || allowPreviewBuild);
  // Opt-in diagnostic build only. Never ship the profiling React runtime to cloud users.
  const profileInteractions = usePreviewData && env.VITE_PERFORMANCE_PROFILE === 'true';
  const vpsDataMode = `${env.VITE_DATA_MODE || ''}`.trim();
  const devApiProxyTarget = `${env.HD_MANAGER_DEV_API_PROXY_TARGET || ''}`
    .trim()
    .replace(/\/+$/, '');
  // Only staging is allowed to replace the legacy Firebase core. A production
  // VPS flag is a compatibility mode: it keeps Firebase Auth/Firestore live so
  // unsupported VPS resources can never make the whole application unavailable.
  const isVpsStagingBuild = vpsDataMode === 'vps-staging';
  const useCloudData = !usePreviewData && !isVpsStagingBuild;
  const readWorkerEnabled = useCloudData && env.VITE_FIRESTORE_READ_WORKER === 'true';
  if (isVpsStagingBuild && !`${env.VITE_API_BASE_URL || ''}`.trim()) {
    throw new Error('VITE_API_BASE_URL is required when VITE_DATA_MODE=vps-staging.');
  }
  const cloudFirebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY || defaultCloudFirebaseConfig.apiKey,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || defaultCloudFirebaseConfig.authDomain,
    projectId: env.VITE_FIREBASE_PROJECT_ID || defaultCloudFirebaseConfig.projectId,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || defaultCloudFirebaseConfig.storageBucket,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || defaultCloudFirebaseConfig.messagingSenderId,
    appId: env.VITE_FIREBASE_APP_ID || defaultCloudFirebaseConfig.appId,
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || defaultCloudFirebaseConfig.measurementId
  };
  const firebaseConfig = useCloudData
    ? cloudFirebaseConfig
    : (usePreviewData ? previewFirebaseConfig : {});
  const dataAppId = usePreviewData
    ? (env.VITE_HD_APP_ID || 'preview-app')
    : (isVpsStagingBuild ? 'hd-manager-vps-staging' : (env.VITE_HD_APP_ID || defaultProductionAppId));
  const firebaseAliases = useCloudData
    ? {}
    : {
        'firebase/app': fileURLToPath(new URL('./src/mocks/firebase-app.js', import.meta.url)),
        'firebase/auth': fileURLToPath(new URL('./src/mocks/firebase-auth.js', import.meta.url)),
        'firebase/firestore': fileURLToPath(new URL('./src/mocks/firebase-firestore.js', import.meta.url)),
        'firebase/performance': fileURLToPath(new URL('./src/mocks/firebase-performance.js', import.meta.url)),
        './services/identityCenter.js': fileURLToPath(new URL('./src/mocks/identity-center-vps.js', import.meta.url))
      };
  const identityCenterAlias = fileURLToPath(new URL(
    (usePreviewData || isVpsStagingBuild) ? './src/mocks/identity-center-vps.js' : './src/services/identityCenter.js',
    import.meta.url,
  ));
  const runtimeAliases = {
    ...firebaseAliases,
    '@hd/personal-home-worker': fileURLToPath(new URL(
      useCloudData&&env.VITE_PERSONAL_HOME_WORKER==='true' ? './src/services/personalHomeWorkerFactory.js' : './src/mocks/personalHomeWorkerFactory.js',import.meta.url,
    )),
    '@hd/personal-home-values': fileURLToPath(new URL(
      useCloudData ? './src/services/firestoreNativeWireValues.js' : './src/mocks/personalHomeValues.js',import.meta.url,
    )),
    '@hd/firestore-read-worker': fileURLToPath(new URL(
      readWorkerEnabled ? './src/services/firestoreReadWorkerFactory.js' : './src/mocks/firestoreReadWorkerFactory.js', import.meta.url,
    )),
    '@hd/firestore-worker-values': fileURLToPath(new URL(
      readWorkerEnabled ? './src/services/firestoreWorkerValues.js' : './src/mocks/firestoreWorkerValues.js', import.meta.url,
    )),
    ...(profileInteractions ? {
      'react-dom/client': fileURLToPath(new URL('./node_modules/react-dom/profiling.js', import.meta.url)),
    } : {}),
    '@hd/identity-center': identityCenterAlias,
    '@hd/hd-connect-runtime': fileURLToPath(new URL(
      isVpsStagingBuild ? './src/api/hdConnectStaging.js' : './src/config/firebase-only-runtime.js',
      import.meta.url,
    )),
    '@hd/firebase-runtime': fileURLToPath(new URL(
      isVpsStagingBuild ? './src/mocks/firebase-runtime-vps.js' : './src/config/firebase-runtime.js',
      import.meta.url,
    )),
    '@hd/client-runtime': fileURLToPath(new URL(
      isVpsStagingBuild ? './src/mocks/client-runtime-vps.js' : './src/config/client-runtime.js',
      import.meta.url,
    )),
    '@hd/firebase-rest-runtime': fileURLToPath(new URL(
      isVpsStagingBuild ? './src/mocks/firebase-rest-runtime-vps.js' : './src/config/firebase-rest-runtime.js',
      import.meta.url,
    )),
    '@hd/firebase-backup-values': fileURLToPath(new URL(
      useCloudData ? './src/services/firebaseBackupValues.js' : './src/mocks/firebase-backup-values.js',
      import.meta.url,
    )),
  };
  const releaseManifestPlugin = {
    name: 'hd-manager-release-manifest',
    transformIndexHtml(html) {
      return html.replaceAll('__HD_MANAGER_BUILD_ID__', buildId);
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify({ buildId, builtAt })}\n`
      });
    }
  };

  return {
    plugins: [nativeStartupEntryPlugin, localStartupShell, earlyPlugin, react(), employeeHomeDomainPlugin('@hd/company-home-domain',['buildOrderDuplicateSignature']), releaseManifestPlugin, nativeStartupCorePreload, offlineShellPlugin({enabled:env.VITE_OFFLINE_RUNTIME==='trusted-v1'||(mode==='emulator'&&env.VITE_OFFLINE_RUNTIME==='local-v1')})],
    base: './',
    // Only the API-only staging bundle omits the legacy Firebase/provider
    // surface. Production compatibility mode keeps the proven Firebase path.
    envPrefix: isVpsStagingBuild
      ? ['VITE_API_BASE_URL', 'VITE_DATA_MODE', 'VITE_HD_BUILD_ID']
      : 'VITE_',
    define: {
      __firebase_config: JSON.stringify(JSON.stringify(firebaseConfig)),
      __app_id: JSON.stringify(dataAppId),
      'import.meta.env.VITE_HD_BUILD_ID': JSON.stringify(buildId)
    },
    resolve: {
      alias: runtimeAliases
    },
    worker: { format: 'iife', plugins:()=>[companyHomeDomainPlugin(),employeeHomeDomainPlugin(),employeeHomeDomainPlugin('@hd/online-home-payroll',['buildDashboardPayrollCostRows','getDateKeyFromAnyValue','normalizeEmployeeReviewMonthKey'])], rollupOptions: { output: { inlineDynamicImports: true } } },
    // This workspace also contains installers, backups and other websites.
    // Scan only HD Manager's entry, while still discovering its imported deps.
    optimizeDeps: {
      entries: ['index.html']
    },
    build: {
      // The Android 10 acceptance device ships WebView 74. Lower optional
      // chaining/nullish coalescing too, before that runtime parses any module.
      target: ['chrome74', 'es2019'],
      chunkSizeWarningLimit: 3200,
      cssCodeSplit: true,
      minify: 'esbuild',
      sourcemap: profileInteractions,
      rollupOptions: {
        ...(earlyBootstrap?{input:{index:fileURLToPath(new URL('./index.html',import.meta.url)),nativeEarly:fileURLToPath(new URL('./src/native-early-entry.js',import.meta.url))}}:{}),
        output: {
          onlyExplicitManualChunks:true,
          manualChunks:selectVendorChunk
        }
      }
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      proxy: devApiProxyTarget
        ? {
            '/api': {
              target: devApiProxyTarget,
              changeOrigin: true,
              secure: true
            }
          }
        : undefined,
      watch: {
        ignored: [
          '**/android/**',
          '**/dist/**',
          '**/release/**',
          '**/backups/**',
          '**/node_modules/**',
          '**/.firebase/**',
          '**/.gradle-home/**',
          '**/.gradle/**',
          '**/test-results/**',
          '**/tmp-*/**',
          '**/*.apk',
          '**/*.exe'
        ]
      }
    }
  };
});
