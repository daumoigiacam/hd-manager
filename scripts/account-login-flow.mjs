import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {resolveAccountLoginReadinessContract} from './helpers/account-login-readiness-contract.mjs';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
import {installAccountLoginFlowObserver} from './helpers/account-login-flow-observer.mjs';
const mode=process.argv[2],account=process.argv[3],output=process.env.HD_ACCOUNT_LOGIN_OUTPUT;
if(!['arm','collect'].includes(mode)||!['employee','customer'].includes(account)||!output?.startsWith('test-results/'))throw Error('Use arm|collect employee|customer and a local output.');
await fs.mkdir(output,{recursive:true});
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});
try{
 if(mode==='arm'){
  const contract=resolveAccountLoginReadinessContract(readFileSync('src/App.jsx','utf8'),account),required=contract.required;
  const loginDeadline=Date.now()+15000;let loginVisible=false;
  do{loginVisible=await c.evaluate('!!document.querySelector("input[type=tel]")');if(loginVisible)break;await new Promise(resolve=>setTimeout(resolve,100));}while(Date.now()<loginDeadline);
  if(!loginVisible)throw Error('Login screen is required before arming.');
  const result=await c.evaluate(`(${installAccountLoginFlowObserver.toString()})(${JSON.stringify({expectedAccount:account,required})})`);
  await fs.writeFile(output+'/armed.json',JSON.stringify({at:new Date().toISOString(),...result,required,contract},null,2));console.log(JSON.stringify(result));
 }else{
  const deadline=Date.now()+240000;let state;
  do{
   state=await c.evaluate('window.__hdAccountLoginFlow&&window.__hdAccountLoginFlow.state');
   if(!state)throw Error('Login observer context missing; do not treat this as a measured zero.');
   if(state.expectedAccount!==account)throw Error('Wrong account observer.');
   if(state.endReason)break;
   await new Promise(resolve=>setTimeout(resolve,500));
  }while(Date.now()<deadline);
  const elapsed=key=>Number.isFinite(state.inputAt)&&Number.isFinite(state[key])?state[key]-state.inputAt:null;
  const times={toShellMs:elapsed('shellAt'),toEnabledNavigationMs:elapsed('enabledActionAt'),toCommittedSourcesMs:elapsed('sourceReadyAt'),toHomeReadyMs:elapsed('homeReadyAt'),toTwoFramesAfterReadyMs:elapsed('twoFramesAfterReadyAt')};
  const measured=state.endReason==='home-ready-observed'&&state.roleMatches===true&&state.clickTrusted&&Number.isFinite(state.inputAt);
  const phases=await c.evaluate(`(function(){var p=window.__hdAccountLoginFlow,s=p&&p.state;if(!s||s.submitEpoch===null)return [];return (window.__HD_STARTUP_TIMING__||[]).filter(function(e){return e.atEpochMs>=s.submitEpoch&&(/^(auth\\.identity_login\\.(started|api_completed|persistence_ready|custom_token_completed|shell_released|completed|failed)|auth\\.user\\.restored|data\\.core\\.available|shell\\.rendered|first\\.ui\\.rendered|background\\.sync\\.core_ready)$/.test(e.name))}).map(function(e){return {name:e.name,fromInputMs:e.atEpochMs-s.origin-s.inputAt,reportedStageDurationMs:e.detail&&typeof e.detail.durationMs==='number'?e.detail.durationMs:null}})})()`);
  const targets={homeShellMaximumMs:1000,completeHomeMaximumMs:5000,uiInteractionMaximumMs:100};
  const targetChecks={homeShell:measured?times.toShellMs<=targets.homeShellMaximumMs:null,
   completeHome:measured?times.toTwoFramesAfterReadyMs<=targets.completeHomeMaximumMs:null};
  const result={at:new Date().toISOString(),account,status:measured?'MEASURED_REAL_PASSWORD_LOGIN':'INCOMPLETE_NOT_PASS',targets,targetChecks,
   acceptance:measured&&targetChecks.homeShell&&targetChecks.completeHome?'PASS_THIS_SINGLE_LOGIN_ONLY':'NOT_PASS',
   times,state,phases,
   scope:'Real trusted on-device login-button input to actual Home DOM, tenant-matching required source commit flags and no busy/loading marker, followed by two RAF callbacks. Sources come from current App route declaration. No phone/password/token/request or document contents recorded. This is a complete-source UI readiness witness, not compositor paint, INP, server write ACK or every possible Home action. Only the one account actually logged in is measured.'};
  await fs.writeFile(output+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify({account,status:result.status,times,acceptance:result.acceptance,targetChecks,missing:state.missing,roleGroup:state.roleGroup}));
  if(!measured)process.exitCode=1;
 }
}finally{c.close()}
