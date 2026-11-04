import fs from 'node:fs/promises';import {spawn,execFileSync} from 'node:child_process';
import {assertNoActiveUpgradeSoak} from './helpers/upgrade-observation-barrier.mjs';
import {assertVerificationFixtureReady} from './helpers/verification-fixture-preflight.mjs';
const root='test-results/performance-upgrade-20261103',label=process.argv[2]||'01';
if(!/^\d{2}$/.test(label))throw Error('Explicit trace observation number required');
const out=root+'/native-auth-system-trace-'+label;
await assertNoActiveUpgradeSoak();await assertVerificationFixtureReady();await fs.mkdir(out);
const adb='D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial='emulator-5554',remote='/data/misc/perfetto-traces/hdm-auth-system-'+label+'.perfetto-trace';
const call=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',timeout:30000,windowsHide:true}).trim();
const state={at:new Date().toISOString(),status:'STARTING',productionRequests:0,package:'com.hdmanager.caplab.diag',conditions:'Native sched/binder/view/WebView trace, own Android10 demo workload only. No Android log data source, CPU sampler, forcedGC or business writes. Diagnostic overhead; not latency acceptance.'};
const write=()=>fs.writeFile(out+'/state.json',JSON.stringify(state,null,2));await write();
const config=`buffers { size_kb: 32768 fill_policy: RING_BUFFER }
duration_ms: 65000
data_sources { config { name: "linux.ftrace" ftrace_config {
 ftrace_events: "sched/sched_switch" ftrace_events: "sched/sched_waking" ftrace_events: "power/cpu_frequency"
 atrace_categories: "view" atrace_categories: "webview" atrace_categories: "gfx" atrace_categories: "am"
 atrace_categories: "wm" atrace_categories: "input" atrace_categories: "binder_driver" atrace_categories: "dalvik"
 atrace_apps: "com.hdmanager.caplab.diag"
} } }
data_sources { config { name: "linux.process_stats" process_stats_config { scan_all_processes_on_start: true } } }
`;
await fs.writeFile(out+'/config.pbtxt',config);
const fd=await fs.open(out+'/perfetto.log','wx'),trace=spawn(adb,['-s',serial,'shell','perfetto','--txt','-c','-','-o',remote],{stdio:['pipe',fd.fd,fd.fd],windowsHide:true});
trace.stdin.on('error',error=>{state.stdinError=error.message});trace.stdin.end(config);
const traceDone=new Promise((resolve,reject)=>{trace.once('error',reject);trace.once('exit',resolve)});
try{
 state.status='TRACING';state.tracePid=trace.pid;await write();await new Promise(resolve=>setTimeout(resolve,1500));
 const log=await fs.open(out+'/driver.log','wx');
 const driver=spawn(process.execPath,['scripts/upgrade-run-android-ab.mjs','after-listener-scope','--startup-only','--fixture-rich','--paired-tap','--network-diagnostic','--run-label=native-auth-system-trace-'+label],{stdio:['ignore',log.fd,log.fd],windowsHide:true});
 state.driverPid=driver.pid;await write();try{state.driverExitCode=await new Promise((resolve,reject)=>{driver.once('error',reject);driver.once('exit',resolve)})}finally{await log.close()}
 state.traceExitCode=await traceDone;if(state.traceExitCode!==0)throw Error('Native trace command failed');
 call('pull',remote,out+'/native-auth.perfetto-trace');state.traceBytes=(await fs.stat(out+'/native-auth.perfetto-trace')).size;
 state.status=state.driverExitCode===0?'NATIVE_TRACE_CAPTURED_NOT_ACCEPTANCE':'TRACE_WITH_PRESERVED_DRIVER_FAILURE';
}catch(error){state.status='FAILED';state.error=error.message;process.exitCode=1}
finally{await traceDone.catch(()=>{});await fd.close();state.endedAt=new Date().toISOString();await write();console.log(JSON.stringify(state))}
