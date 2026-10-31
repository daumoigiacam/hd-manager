import fs from 'node:fs/promises';
import {build} from 'esbuild';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
const output=process.env.HD_WIRE_LAB_OUTPUT||'test-results/android10-native-wire-lab';
await fs.mkdir(output,{recursive:true});
const imports=`import './src/services/legacyRuntime.js';
import {initializeApp,deleteApp}from'firebase/app';
import {getFirestore,Timestamp,GeoPoint,Bytes,vector,doc}from'firebase/firestore';
import {encodeFirestoreWorkerValue,decodeFirestoreWorkerValue}from'./src/services/firestoreWorkerValues.js';
import {encodeFirestoreNativeValue,decodeFirestoreNativeValue}from'./src/services/firestoreNativeWireValues.js';`;
const options={bundle:true,write:false,format:'iife',target:'chrome74',define:{'process.env.NODE_ENV':'"production"'}};
const worker=await build({...options,stdin:{resolveDir:process.cwd(),contents:imports+`
const db=getFirestore(initializeApp({projectId:'demo-native-wire-lab'},'worker-fixture'));
let rows,mode,index=0,started;
function send(){
 if(index===rows.length){self.postMessage({type:'done',workerElapsedMs:performance.now()-started});return}
 const encode=mode==='tagged'?encodeFirestoreWorkerValue:encodeFirestoreNativeValue;
 const chunk=rows.slice(index,index+64).map(row=>encode(row,db));index+=chunk.length;
 self.postMessage({type:'chunk',rows:chunk});
}
self.onmessage=e=>{
 if(e.data.type==='prepare'){
  mode=e.data.mode;rows=Array.from({length:3000},(_,i)=>({id:'fixture-'+i,amount:i,companyId:'fixture',
   customerName:'Khách thử '+i,code:'VKM',date:'2026-10-31',description:'Vịt 🦆',
   stamp:i%50===0?new Timestamp(-1,999999999):null,reference:i===0?doc(db,'fixture/reference'):null,
   edge:i===0?{n:NaN,z:-0,p:Infinity,u:undefined,geo:new GeoPoint(-20.25,106.1),bytes:Bytes.fromUint8Array(new Uint8Array([0,255,42])),vector:vector([1,2,-3.5]),date:new Date(-123)}:null,
   specialKeys:Object.fromEntries([['__proto__',{safe:true}],['kind','hd-firestore-native-value-v1']]),
   items:Array.from({length:12},(_,j)=>({quantity:j/10,amount:25000,unit:'Con',name:'Vịt 🦆',paid:false}))
  }));self.postMessage({type:'ready'});
 }else if(e.data.type==='start'){started=performance.now();send()}
 else if(e.data.type==='ack')send();
};`}});
const main=await build({...options,stdin:{resolveDir:process.cwd(),contents:imports+`
const app=initializeApp({projectId:'demo-native-wire-lab'},'main-fixture'),db=getFirestore(app);
window.__nativeWireLab={run:mode=>new Promise((resolve,reject)=>{
 const url=URL.createObjectURL(new Blob([${JSON.stringify(worker.outputFiles[0].text)}],{type:'text/javascript'}));
 const w=new Worker(url);let started,decodeMs=0,rows=0,sum=0,quantity=0,checked=0,feedback=null,timer,observer,tasks=[],last,gap=0;
 const finish=()=>{clearTimeout(timeout);clearInterval(timer);observer?.disconnect();w.terminate();URL.revokeObjectURL(url)};
 const timeout=setTimeout(()=>{finish();reject(Error('Native wire fixture timeout'))},45000);
 w.onerror=()=>{finish();reject(Error('Native wire fixture worker error'))};
 w.onmessage=e=>{const m=e.data;
  if(m.type==='ready'){
   observer=new PerformanceObserver(list=>{for(const e of list.getEntries())if(e.entryType==='longtask'&&e.startTime+e.duration>=started)tasks.push({start:e.startTime,duration:e.duration})});
   observer.observe({entryTypes:['longtask']});started=last=performance.now();
   timer=setInterval(()=>{const n=performance.now();gap=Math.max(gap,n-last);last=n},16);
   requestAnimationFrame(()=>requestAnimationFrame(()=>feedback=performance.now()-started));w.postMessage({type:'start'});
  }else if(m.type==='chunk'){
   const at=performance.now(),decode=mode==='tagged'?decodeFirestoreWorkerValue:decodeFirestoreNativeValue;
   for(const wire of m.rows){const row=decode(wire,db);rows++;sum+=row.amount;
    for(const item of row.items)quantity+=item.quantity;
    if(row.stamp){if(!(row.stamp instanceof Timestamp)||row.stamp.nanoseconds!==999999999)throw Error('Timestamp parity');checked++}
    if(row.reference&&row.reference.path!=='fixture/reference')throw Error('Reference parity');
    if(row.edge&&(!Number.isNaN(row.edge.n)||!Object.is(row.edge.z,-0)||row.edge.p!==Infinity||!Object.hasOwn(row.edge,'u')
      ||!row.edge.geo.isEqual(new GeoPoint(-20.25,106.1))||!row.edge.bytes.isEqual(Bytes.fromUint8Array(new Uint8Array([0,255,42])))
      ||!row.edge.vector.isEqual(vector([1,2,-3.5]))||row.edge.date.getTime()!==-123))throw Error('Native edge type parity');
    if(!Object.hasOwn(row.specialKeys,'__proto__')||{}.safe!==undefined)throw Error('Key parity');
   }decodeMs+=performance.now()-at;w.postMessage({type:'ack'});
  }else if(m.type==='done'){
   const ready=performance.now()-started;
   setTimeout(()=>{finish();resolve({mode,rows,amountSum:sum,quantitySum:quantity,checkedTimestamps:checked,readyMs:ready,
     mainDecodeMs:decodeMs,workerElapsedMs:m.workerElapsedMs,feedbackMs:feedback,maxTimerGapMs:gap,tasks})},100);
  }
 };w.postMessage({type:'prepare',mode});
}),close:()=>deleteApp(app)};`}});
const cdp=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});
const samples=[];
try{
 const origin=await cdp.evaluate(`(function(){${main.outputFiles[0].text};return performance.timeOrigin})()`);
 for(const mode of ['tagged','native','native','tagged']){
  const result=await cdp.evaluate(`window.__nativeWireLab.run(${JSON.stringify(mode)})`);
  if(result.rows!==3000||result.amountSum!==4498500||Math.abs(result.quantitySum-19800)>1e-6||result.checkedTimestamps!==60)throw Error('Synthetic codec result mismatch');
  samples.push(result);await fs.writeFile(output+'/progress.json',JSON.stringify({origin,samples},null,2));
 }
 await fs.writeFile(output+'/result.json',JSON.stringify({origin,samples,
  scope:'Actual Android 10/WebView 74, ABBA actual SDK/worker codec diagnostic, 3000 synthetic records, bounded 64-row ACK chunks. No business state/Auth access or Firebase requests. Background app activity may overlap. Timer gap/2RAF/Long Tasks are not INP or full-app/cloud acceptance. SDK bundle setup and fixture construction precede each timed stream.'},null,2));
 console.log(JSON.stringify(samples.map(({tasks,...row})=>({...row,over100:tasks.filter(t=>t.duration>100).length,maxTaskMs:tasks.length?Math.max(...tasks.map(t=>t.duration)):null}))));
}finally{try{await cdp.evaluate('window.__nativeWireLab&&window.__nativeWireLab.close().then(function(){delete window.__nativeWireLab})')}catch{}cdp.close()}
