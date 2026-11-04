import fs from'node:fs/promises';import{connectAndroidWebView}from'./helpers/android-webview-cdp.mjs';
import{readWorkerHeaps}from'../performance/phase2-verification/worker-heap.mjs';
const output='test-results/performance-upgrade-20261103/worker-heap-two-hour.json',pkg='com.hdmanager.caplab.diag';
const result={startedAt:new Date().toISOString(),syntheticOnly:true,conditions:'Read-only dedicated worker heap samples via temporary CDP auto-attach, never waitForDebugger/pause/GC. Separate two-hour span; no previous duration added. Target recreation is retained as separate identity.',requestedMs:7200000,samples:[],errors:[],status:'RUNNING'};
const start=performance.now();let c;
try{
 c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:pkg,port:9253});
 while(true){
  result.samples.push({at:new Date().toISOString(),elapsedMs:performance.now()-start,nativePid:c.shell('shell','pidof',pkg),documentOrigin:await c.evaluate('performance.timeOrigin'),workerHeap:await readWorkerHeaps(c)});
  await fs.writeFile(output,JSON.stringify(result,null,2));if(performance.now()-start>=7200000)break;
  await new Promise(r=>setTimeout(r,Math.min(60000,Math.max(1,7200000-(performance.now()-start)))));
 }
 result.status='TWO_HOUR_WORKER_OBSERVATION_COMPLETE_NOT_LEAK_ACCEPTANCE';
}catch(error){result.status='FAILED';result.errors.push(error.message)}
finally{c?.close();result.elapsedMs=performance.now()-start;result.endedAt=new Date().toISOString();await fs.writeFile(output,JSON.stringify(result,null,2))}
