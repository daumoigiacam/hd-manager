import fs from 'node:fs/promises';import path from 'node:path';import {workspace} from './environment.mjs';
const root=path.join(workspace,'development/hd-manager/application');
const files=['vite.config.js','src/layout/CoreWorkspaceEntry.jsx','src/layout/RestoredLocalWorkspace.jsx','src/data/offlineCustomerGrant.js','src/data/offlineSecureSessionStore.js','src/services/offlineStartupTrace.js'];
const backup=path.join(workspace,'.local-dev/source-backups/startup-dev38-two-stage');
for(const file of files){const dest=path.join(backup,file);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(path.join(root,file),dest,fs.constants.COPYFILE_EXCL);}
async function edit(file,fn){const f=path.join(root,file);await fs.writeFile(f,fn((await fs.readFile(f,'utf8')).replace(/\r\n/g,'\n')));}
await fs.writeFile(path.join(root,'src/layout/StartupWorkspaceShell.jsx'),`import React,{useLayoutEffect} from 'react';
import {startupMark} from '../services/offlineStartupTrace.js';
import './startup-workspace-shell.css';
// Public structure only: no identity, tenant, report, repository or cache reads.
export default function StartupWorkspaceShell({onLogout,error=''}){
 useLayoutEffect(()=>{startupMark('shell.react-commit');},[]);
 return <main className="hd-startup-workspace" data-hd-startup-shell="true" aria-label="Đang khởi tạo Workspace" aria-busy="true">
  <header><strong>HD Manager</strong>{onLogout&&<button type="button" onClick={onLogout}>Đăng xuất</button>}</header>
  <section><h1>Không gian làm việc</h1><p role="status">Đang khôi phục phiên và xác minh quyền truy cập…</p><p>Dữ liệu chỉ mở sau khi xác minh tài khoản và doanh nghiệp.</p>{error&&<p role="alert">{error}</p>}</section>
  <nav aria-label="Điều hướng đang khởi tạo">{['Trang chủ','Khách hàng','Đơn hàng','Chức năng'].map(label=><button disabled key={label}>{label}</button>)}</nav>
 </main>;
}
`);
const css=`.hd-startup-workspace{min-height:100vh;background:#f7faf9;color:#163b35;font-family:system-ui,sans-serif;display:flex;flex-direction:column}.hd-startup-workspace header{background:#164e40;color:white;padding:24px 20px;display:flex;justify-content:space-between;align-items:center}.hd-startup-workspace header strong{font-size:24px}.hd-startup-workspace header button{background:transparent;border:1px solid #a7c8bc;color:white;padding:8px 12px;border-radius:8px}.hd-startup-workspace section{padding:28px 20px;flex:1}.hd-startup-workspace h1{font-size:24px;margin:0 0 14px}.hd-startup-workspace p{font-size:15px;line-height:1.6;color:#536b62}.hd-startup-workspace nav{display:flex;padding:14px 8px 24px;border-top:1px solid #dce5e0;background:white;gap:6px}.hd-startup-workspace nav button{flex:1;border:0;border-radius:8px;padding:14px 2px;color:#71877d;background:#eff4f1;font-size:13px;opacity:1}`;
await fs.writeFile(path.join(root,'src/layout/startup-workspace-shell.css'),css+'\n');
await edit('vite.config.js',t=>{
 const a=t.indexOf("    const style='<style data-local-critical-shell>"),b=t.indexOf('    // Only the Local HTML changes:',a);if(a<0||b<0)throw Error('Expected existing Local HTML shell');
 const markup='<main class="hd-startup-workspace" data-hd-startup-shell="true" aria-label="Đang khởi tạo Workspace" aria-busy="true"><header><strong>HD Manager</strong></header><section><h1>Không gian làm việc</h1><p role="status">Đang khôi phục phiên và xác minh quyền truy cập…</p><p>Dữ liệu chỉ mở sau khi xác minh tài khoản và doanh nghiệp.</p></section><nav aria-label="Điều hướng đang khởi tạo"><button disabled>Trang chủ</button><button disabled>Khách hàng</button><button disabled>Đơn hàng</button><button disabled>Chức năng</button></nav></main>';
 return t.slice(0,a)+'    const style='+JSON.stringify('<style data-local-critical-shell>html,body{margin:0}*,*:before,*:after{box-sizing:border-box}'+css+'</style>')+';\n    html=html.replace(\'<head>\',\'<head>\'+style+script).replace(\'<div id="root"></div>\','+JSON.stringify('<div id="root">'+markup+'</div><script>window.__hdStartupDocument.shellMarkupAt=performance.now();</script>')+');\n'+t.slice(b);
});
await edit('src/layout/CoreWorkspaceEntry.jsx',t=>{
 t="import StartupWorkspaceShell from './StartupWorkspaceShell.jsx';\n"+t;
 const old=' return <AppShell><main className="p-4"><WorkingHome ready={false}/>{(error||offlineWorkspace.error)&&<p role="alert">{error||offlineWorkspace.error}</p>}<p>Chỉ mở dữ liệu sau khi xác minh phiên và quyền Offline còn hiệu lực. Giao dịch đang chờ vẫn được giữ trên thiết bị.</p></main></AppShell>;';
 if(!t.includes(old))throw Error('Expected unverified fallback');return t.replace(old," return <AppShell><StartupWorkspaceShell onLogout={offlineWorkspace.controller?logout:undefined} error={error||offlineWorkspace.error}/></AppShell>;");
});
await edit('src/layout/RestoredLocalWorkspace.jsx',t=>t.replace('return <AppShell><header','return <AppShell data-hd-verified-tenant={context.scope.tenantId} data-hd-verified-principal={context.scope.principalId}><header'));
await edit('src/services/offlineStartupTrace.js',t=>t.replace("if(enabled){startupMark('runtime.trace-module');","if(enabled){if(globalThis.__hdStartupDocument?.shellMarkupAt)startupMark('shell.markup-ready',{at:globalThis.__hdStartupDocument.shellMarkupAt});startupMark('runtime.trace-module');"));
await edit('src/data/offlineSecureSessionStore.js',t=>{
 t="import {startupSpan} from '../services/offlineStartupTrace.js';\n"+t;
 t=t.replace("const task = (queues.get(key) || Promise.resolve()).then(work);","const queued=startupSpan('permission.store-queue-wait');\n    const task = (queues.get(key) || Promise.resolve()).then(()=>{queued();return work();});");
 t=t.replace('const record = await (readReserved || read)(options);',"const loaded=startupSpan('permission.record-load');\n      let record;try{record = await (readReserved || read)(options);}finally{loaded();}");return t;
});
await fs.writeFile(path.join(root,'src/data/pinnedVerificationKey.js'),`// Only a pinned PUBLIC CryptoKey is reused. Never store claims/grants or a
// successful authorization result. Every call retains full signature/policy checks.
const providers=new WeakMap();
export function importPinnedVerificationKey(publicKey,crypto=globalThis.crypto){
 const provider=crypto.subtle;let keys=providers.get(provider);if(!keys){keys=new Map();providers.set(provider,keys);}
 const serialized=JSON.stringify(publicKey);
 if(keys.has(serialized))return keys.get(serialized);
 const pending=provider.importKey('jwk',JSON.parse(serialized),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 keys.set(serialized,pending);if(keys.size>4)keys.delete(keys.keys().next().value);
 void pending.catch(()=>{if(keys.get(serialized)===pending)keys.delete(serialized);});return pending;
}
`);
await edit('src/data/offlineCustomerGrant.js',t=>{
 t="import {importPinnedVerificationKey} from './pinnedVerificationKey.js';\n"+t;
 t=t.replace("const key=await crypto.subtle.importKey('jwk',publicKey,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);imported();", "const reuse=import.meta.env?.MODE==='emulator'&&import.meta.env?.VITE_NATIVE_VERIFY_KEY_REUSE==='true';\n const key=await (reuse?importPinnedVerificationKey(publicKey,crypto):crypto.subtle.importKey('jwk',publicKey,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']));imported();");
 t=t.replace("if(Object.entries(expected).some(([k,v])=>grant[k]!==v))throw new Error('Offline grant identity mismatch');", "const identityChecked=startupSpan('permission.identity-validation');\n   try{if(Object.entries(expected).some(([k,v])=>{const tenant=k==='tenantId'?startupSpan('permission.tenant-validation'):null;try{return grant[k]!==v;}finally{tenant?.();}}))throw new Error('Offline grant identity mismatch');}finally{identityChecked();}");
 t=t.replace("if(!Number.isSafeInteger(grant.issuedAtMs)","const lifetimeChecked=startupSpan('permission.session-validity');\n   try{if(!Number.isSafeInteger(grant.issuedAtMs)");
 t=t.replace("if(kind==='app.session'){","}finally{lifetimeChecked();}\n   const capabilityChecked=startupSpan('permission.capability-validation');\n   try{if(kind==='app.session'){");
 t=t.replace("// Recheck native login ownership", "}finally{capabilityChecked();}\n   // Recheck native login ownership");return t;
});
const buildFile=path.join(workspace,'tools/local-development/build-web.mjs');await fs.copyFile(buildFile,path.join(backup,'build-web.mjs'));
await fs.writeFile(buildFile,(await fs.readFile(buildFile,'utf8')).replace('VITE_NATIVE_DURABLE_GRANT_STORE:',"VITE_NATIVE_VERIFY_KEY_REUSE:process.env.HD_EXPERIMENT_VERIFY_KEY_REUSE==='true'?'true':'false',VITE_NATIVE_DURABLE_GRANT_STORE:"));
const android=path.join(workspace,'tools/local-development/build-android.mjs');await fs.copyFile(android,path.join(backup,'build-android.mjs'));await fs.writeFile(android,(await fs.readFile(android,'utf8')).replaceAll('1.0.12-local-dev.38','1.0.12-local-dev.39').replaceAll('26111148','26111149'));
console.log(JSON.stringify({status:'PREPARED',backup,version:'dev39',publicKeyReuseDefault:false,shellHasNoProtectedData:true}));
