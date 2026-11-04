import fs from 'node:fs/promises';
let source=await fs.readFile('scripts/verification-capacitor-soak.mjs','utf8');
const change=(old,next)=>{if(!source.includes(old))throw Error('Soak template changed: '+old.slice(0,60));source=source.replace(old,next)};
change("import fs from 'node:fs/promises';","import fs from 'node:fs/promises';\nimport crypto from 'node:crypto';");
change("const root='test-results/phase2-verification-20261102'","const root='test-results/performance-upgrade-20261103/soak-integrated'");
change("status:'WAITING_FOR_MACRO'","status:'VERIFYING_CANDIDATE'");
change("workloadRevision:'explicit-cdp-failure-observation-v4'","workloadRevision:'upgrade-current-repositories-resource-policy-v1'");
const barrierStart=source.indexOf('await write();const queueStart='),barrierEnd=source.indexOf('let cdp,lastDocumentOrigin');
if(barrierStart<0||barrierEnd<barrierStart)throw Error('Macro barrier unavailable');
source=source.slice(0,barrierStart)+`await fs.mkdir(root,{recursive:true});
const apk='test-results/performance-upgrade-20261103/after-integrated/capacitor-project/app/build/outputs/apk/diagnostic/app-diagnostic.apk';
const installed=command('shell','pm','path',pkg).trim().replace(/^package:/,'');
if(!installed.startsWith('/data/app/')||!installed.includes(pkg)||!installed.endsWith('/base.apk'))throw Error('Unexpected installed fixture path');
state.apkSha256=crypto.createHash('sha256').update(await fs.readFile(apk)).digest('hex');
if(command('shell','sha256sum',installed).trim().split(/\\s+/)[0]!==state.apkSha256)throw Error('Installed candidate hash mismatch');
state.buildIdentity=JSON.parse(await fs.readFile('test-results/performance-upgrade-20261103/after-integrated/capacitor-build-identity.json','utf8'));
await write();
`+source.slice(barrierEnd);
change("const read=async file=>{try{return JSON.parse(await fs.readFile(file,'utf8'))}catch{return null}};\n",'');
change("state.initialCondition='Warm existing synthetic app after preserved incomplete v2/v3. Local demo service restarted and identical fixture reseeded before cohort. No clear, reinstall, reload or GC at start; previous durations are NOT added. Page-wide counters stay intact and cohort counters are segmented by baseline. CDP failure recovery does not reset app; failures invalidate clean acceptance.';",
 "state.initialCondition='After-integrated candidate with Adaptive policy ON; real SDK/demo fixture. Independent two-hour span, no duration from older cohorts added. No reinstall/GC/restart by collector. Other Windows workload may run: this is stability stress, not isolated UI speed acceptance.';");
// Use stable route IDs and the actual permitted menu. Do not manufacture
// coverage for a sales role by clicking owner-only labels that are absent.
change("const targets=['Khách hàng','Sản phẩm','Đơn hàng','Thu chi','Sổ nợ','Tài sản','Bảng lương','Xuất kho','Nhập Xuất Tồn','Trang chủ'];",
 "let targets=['home'];let targetIndex=0;");
change("const label=targets[i%targets.length];let clicked=await clickText(label);if(!clicked){await clickText('Thêm');for(let attempt=0;attempt<8&&!clicked;attempt++){await wait(250);clicked=await clickText(label)}}",
 `await clickText('Thêm');await wait(150);
   const permitted=await cdp.evaluate("Array.from(document.querySelectorAll('button[data-hd-more-module]')).filter(e=>e.getClientRects().length&&!e.disabled).map(e=>e.getAttribute('data-hd-more-module'))");
   if(permitted.length)targets=['home',...permitted.filter(id=>id!=='home')];
   const label=targets[targetIndex++%targets.length];
   const point=await cdp.evaluate("(()=>{var list=Array.from(document.querySelectorAll('button[data-hd-more-module]')),e=list.find(function(b){return b.getAttribute('data-hd-more-module')===LABEL});if(LABEL==='home')e=Array.from(document.querySelectorAll('button')).find(function(b){return b.getAttribute('aria-label')==='Trang chủ'});if(!e)return null;e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);return h&&(h===e||e.contains(h))?{x:x,y:y}:null})()".replaceAll('LABEL',JSON.stringify(label)));
   let clicked=false;if(point){await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});clicked=true;}
   if(!clicked)throw Error('Permitted route unavailable: '+label);`);
change("label==='Sản phẩm'","label==='products'");
change("await cdp.send('Input.insertText',{text:value});return true;",
 "await cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});await cdp.send('Input.insertText',{text:value});return await cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}).value===${JSON.stringify(value)}`);");
await fs.writeFile('scripts/upgrade-android-soak.mjs',source);
