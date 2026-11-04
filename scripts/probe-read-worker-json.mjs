import {mkdir,writeFile} from 'node:fs/promises';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
const output=process.env.HD_WORKER_JSON_PROBE_OUTPUT;
if(!output?.startsWith('test-results/'))throw Error('A local output is required.');
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});
const pending=new Map();let session,sequence=0;
const off=c.onEvent(event=>{
  if(event.method==='Target.attachedToTarget'&&event.params.targetInfo.type==='worker'&&/\/firestoreReadWorker[^/]*\.js$/.test(new URL(event.params.targetInfo.url).pathname))session=event.params.sessionId;
  if(event.method==='Target.receivedMessageFromTarget'&&event.params.sessionId===session){
    const message=JSON.parse(event.params.message),task=pending.get(message.id);
    if(task){pending.delete(message.id);clearTimeout(task.timer);if(message.error||message.result?.exceptionDetails)task.reject(Error('Worker diagnostic evaluation failed'));else task.resolve(message.result?.result?.value);}
  }
});
const evaluate=expression=>new Promise((resolve,reject)=>{
  const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Worker diagnostic timed out'));},30000);
  pending.set(id,{resolve,reject,timer});
  void c.send('Target.sendMessageToTarget',{sessionId:session,message:JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true}})}).catch(reject);
});
let installed=false;
try{
  await c.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:false});
  const deadline=Date.now()+10000;while(!session&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,100));
  if(!session)throw Error('Existing Firestore worker unavailable');
  await evaluate(`(function(){
    if(self.__hdJsonAggregateProbe){self.__hdJsonAggregateProbe.restore();delete self.__hdJsonAggregateProbe;}
    var original=JSON.parse,started=performance.now(),timer,restored=false;
    var stats={calls:0,inputCharacters:0,maxInputCharacters:0,elapsedParseMs:0,maxParseMs:0,errors:0,bins:[0,0,0,0,0,0]};
    function wrapped(){var input=arguments[0],length=typeof input==='string'?input.length:0,at=performance.now();
      stats.calls++;stats.inputCharacters+=length;stats.maxInputCharacters=Math.max(stats.maxInputCharacters,length);
      stats.bins[length<1000?0:length<10000?1:length<100000?2:length<1000000?3:length<10000000?4:5]++;
      try{return original.apply(this,arguments)}catch(error){stats.errors++;throw error}
      finally{var duration=performance.now()-at;stats.elapsedParseMs+=duration;stats.maxParseMs=Math.max(stats.maxParseMs,duration)}
    }
    function restore(){if(!restored){restored=true;if(JSON.parse===wrapped)JSON.parse=original;clearTimeout(timer)}}
    self.__hdJsonAggregateProbe={read:function(){return {stats:stats,elapsedMs:performance.now()-started,restored:restored}},restore:restore};
    JSON.parse=wrapped;timer=setTimeout(restore,20000);
    return true;
  })()`);installed=true;
  await new Promise(resolve=>setTimeout(resolve,12000));
  const aggregate=await evaluate('self.__hdJsonAggregateProbe.read()');
  await mkdir(output,{recursive:true});
  const result={at:new Date().toISOString(),status:'DIAGNOSTIC_ONLY_NOT_ACCEPTANCE',aggregate,
    scope:'Temporary transparent JSON.parse wrapper in the already-authorized Firestore read worker. Counts/timings/length bins only; never retains input/output strings, tokens or documents. Original return/reviver/error behavior preserved. Finally restores the wrapper; a 20-second safety timer also restores it if the tool disconnects. Diagnostic overhead; not clean performance acceptance.'};
  await writeFile(output+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{
  try{if(installed)await evaluate('(function(){if(self.__hdJsonAggregateProbe){self.__hdJsonAggregateProbe.restore();delete self.__hdJsonAggregateProbe}return JSON.parse.toString().indexOf("[native code]")>=0})()')}finally{
    for(const task of pending.values())clearTimeout(task.timer);off();
    try{await c.send('Target.setAutoAttach',{autoAttach:false,waitForDebuggerOnStart:false,flatten:false})}finally{c.close()}
  }
}
