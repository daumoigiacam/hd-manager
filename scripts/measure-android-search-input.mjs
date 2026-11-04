import {mkdir,writeFile} from 'node:fs/promises';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
import {normalizeTrustedInputTimestamp} from './helpers/browser-interaction-timing.mjs';
const output=process.env.HD_SEARCH_INPUT_OUTPUT;
if(!output?.startsWith('test-results/'))throw Error('A local output is required.');
const keyCount=Number(process.env.HD_SEARCH_INPUT_KEYS||3);
if(!Number.isInteger(keyCount)||keyCount<3||keyCount>30)throw Error('Native key sample count must be from3through30.');
const testText=Array.from({length:keyCount},(_,index)=>'qzx'[index%3]).join('');
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(expression){const deadline=Date.now()+20000;while(Date.now()<deadline){const value=await c.evaluate(expression);if(value)return value;await sleep(100)}throw Error('Readonly search precondition timed out');}
const tap=position=>c.shell('shell','input','tap',String(Math.round(position.x)),String(Math.round(position.y)));
async function navigation(label,selector){const position=await c.evaluate(`(function(){var root=document.querySelector(${JSON.stringify(selector)}),button=root&&Array.from(root.querySelectorAll('button')).find(function(b){return (b.getAttribute('aria-label')||b.innerText).trim()===${JSON.stringify(label)}});if(!button)throw Error('Readonly navigation unavailable');button.scrollIntoView({block:'center'});var r=button.getBoundingClientRect();return {x:(r.x+r.width/2)*devicePixelRatio,y:(r.y+r.height/2)*devicePixelRatio}})()`);tap(position);}
let installed=false;const samples=[];
try{
  await navigation('Thêm','[data-hd-navigation="bottom"]');await wait('!!document.querySelector("main[data-hd-module=more]")');
  await navigation('Khách hàng','main');await wait('!!document.querySelector("main[data-hd-module=customers]")');
  const visible=()=>c.evaluate(`Array.from(document.querySelectorAll('input[data-hd-search-input="true"]')).some(function(n){var r=n.getBoundingClientRect();return r.width>0&&r.height>0&&!n.disabled&&!n.readOnly})`);
  if(!await visible()){
    const position=await c.evaluate(`(function(){var button=Array.from(document.querySelectorAll('header button')).find(function(b){return /^Tìm kiếm/.test(b.getAttribute('aria-label')||b.title||'')});if(!button)throw Error('Explicit search control unavailable');var r=button.getBoundingClientRect();return {x:(r.x+r.width/2)*devicePixelRatio,y:(r.y+r.height/2)*devicePixelRatio}})()`);tap(position);
  }
  await wait(`Array.from(document.querySelectorAll('input[data-hd-search-input="true"]')).some(function(n){var r=n.getBoundingClientRect();return r.width>0&&r.height>0})`);
  const position=await c.evaluate(`(function(){var field=Array.from(document.querySelectorAll('input[data-hd-search-input="true"]')).find(function(n){var r=n.getBoundingClientRect();return r.width>0&&r.height>0&&!n.disabled&&!n.readOnly});if(!field||field.value!=='')throw Error('Empty readonly search field required');
    var normalize=${normalizeTrustedInputTimestamp.toString()},rows=[];
    function input(event){if(event.target!==field||!event.isTrusted)return;var at=performance.now(),stamp=normalize(event.timeStamp,at,performance.timeOrigin,true),length=field.value.length;
      requestAnimationFrame(function(){requestAnimationFrame(function(){rows.push({inputAt:stamp,capturedAt:at,feedbackAt:performance.now(),length:length,echoRetained:field.value.length===length})})});}
    field.addEventListener('input',input);
    var expected=${JSON.stringify(testText)};
    window.__hdSearchInputProbe={read:function(){return {rows:rows,module:document.querySelector('main[data-hd-module]').getAttribute('data-hd-module'),pageAgeMs:performance.now(),backgroundPending:!!document.querySelector('[data-hd-read-refreshing]')}},prepareCleanup:function(){if(field.isConnected&&field.value.length>0&&field.value.length<=expected.length&&expected.slice(0,field.value.length)===field.value){field.focus();field.select();return true}return false},restore:function(){field.removeEventListener('input',input);if(field.isConnected&&field.value===''&&document.activeElement===field)field.blur();delete window.__hdSearchInputProbe}};
    var r=field.getBoundingClientRect();return {x:(r.x+r.width/2)*devicePixelRatio,y:(r.y+r.height/2)*devicePixelRatio};
  })()`);installed=true;tap(position);await sleep(500);
  for(const letter of testText){
    c.shell('shell','input','text',letter);const count=samples.length;
    const state=await wait(`window.__hdSearchInputProbe.read().rows.length>${count}&&window.__hdSearchInputProbe.read()`);
    if(state.rows.length!==count+1)throw Error('Unexpected native input sequence');
    const row=state.rows[count];samples.push({...row,inputToTwoFrameMs:row.inputAt===null?null:row.feedbackAt-row.inputAt});
  }
  const state=await c.evaluate('window.__hdSearchInputProbe.read()');
  await mkdir(output,{recursive:true});const result={at:new Date().toISOString(),status:'TRUSTED_SEARCH_INPUT_FEEDBACK_PROXY',samples,
    context:{module:state.module,pageAgeMs:state.pageAgeMs,backgroundPending:state.backgroundPending,keyCount,keyboardSettlingMs:500},
    scope:'Native Android keys in an initially empty, explicitly marked readonly search field. Length and retained echo only; no user text, business record or credential exported. Two RAF callbacks are not compositor paint/INP, keyboard-opening latency or completed search-result readiness. Cloud background work remains active; no business-save control used. One search field does not certify all app inputs.'};
  await writeFile(output+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){await mkdir(output,{recursive:true});await writeFile(output+'/incomplete-result.json',JSON.stringify({at:new Date().toISOString(),status:'INCOMPLETE_NOT_PASS',samples,error:error.message},null,2));throw error;}
finally{
  try{if(installed){if(await c.evaluate('window.__hdSearchInputProbe&&window.__hdSearchInputProbe.prepareCleanup()'))c.shell('shell','input','keyevent','67');await c.evaluate('window.__hdSearchInputProbe&&window.__hdSearchInputProbe.restore()')}}finally{c.close()}
}
