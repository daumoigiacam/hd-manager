import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {describeProcessSamples,summarizeSdkSoak,observationCoverage,processCpuIntervals} from '../performance/phase2-verification/soak-analysis.mjs';
const raw='test-results/phase2-verification-20261102',old='test-results/phase2-performance-20261102',out='docs/reports/phase2-verification-20261102';
await fs.mkdir(out,{recursive:true});
const read=async file=>{try{return JSON.parse(await fs.readFile(file,'utf8'))}catch{return null}};
const text=async file=>{try{return await fs.readFile(file,'utf8')}catch{return ''}};
const esc=x=>String(x??'NOT VERIFIED').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const p=x=>`<p>${esc(x)}</p>`,list=xs=>`<ul>${xs.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
const table=(h,rows)=>`<div class="scroll"><table><thead><tr>${h.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const link=(file,label)=>`<a href="../../../${esc(file)}">${esc(label||file)}</a>`;
const oldProgress=await read(`${old}/native-memory-progress.json`),oldDone=await read(`${old}/native-memory-result.json`),oldData=oldDone||oldProgress;
const sdkProgress=await read(`${raw}/sdk-soak-progress.json`),sdkDone=await read(`${raw}/sdk-soak-result.json`),sdk=sdkDone||sdkProgress;
const abortedSdk=await read(`${raw}/attempts/sdk-v2-adb-timeout-97min/sdk-soak-result.json`);
const abortedSdk3=await read(`${raw}/attempts/sdk-v3-cdp-timeout-65min/sdk-soak-result.json`);
const postMemory=await read(`${raw}/post-soak-diagnostic.json`),postNavigation=await read(`${raw}/post-soak-navigation.json`),nativeEvents=await read(`${raw}/native-bridge-events.json`);
const diagnostic=await read(`${raw}/capacitor-diagnostic-result.json`),trace=await read(`${raw}/capacitor-trace-summary.json`),macro=await read(`${raw}/capacitor-macro-state.json`);
const failedAttempt=await read(`${raw}/attempts/initial-harness-failures/capacitor-run-status.json`);
const fixture=await read(`${raw}/fixture-manifest.json`),identity=await read(`${raw}/capacitor-build-identity.json`),cursor=await read('test-results/phase4/firestore-cursor-pagination.json');
const oldContinuity=observationCoverage(oldData?.samples,oldData?.elapsedMs),sdkContinuity=observationCoverage(sdk?.samples,sdk?.state?.elapsedMs);
const oldComplete=Boolean(oldDone?.elapsedMs>=7200000&&oldContinuity.observedWithoutLargeGaps),sdkComplete=Boolean(sdkDone?.state?.elapsedMs>=7200000&&sdkDone.state.status==='TWO_HOUR_OBSERVATION_COMPLETE_NOT_ACCEPTANCE'&&sdkContinuity.observedWithoutLargeGaps);
const median=a=>{const b=[...a].sort((x,y)=>x-y);return b.length?b.length%2?b[(b.length-1)/2]:(b[b.length/2-1]+b[b.length/2])/2:null};
function describe(samples,kind,key){
 const byPid=new Map();for(const sample of samples||[])for(const process of sample.processes||[]){if(process.kind!==kind||!Number.isFinite(process[key]))continue;
  if(!byPid.has(process.pid))byPid.set(process.pid,[]);byPid.get(process.pid).push({t:sample.elapsedMs,value:process[key]});}
 return [...byPid].map(([pid,series])=>{
  const buckets=new Map();for(const s of series.filter(s=>s.t>=1200000)){const id=Math.floor(s.t/300000);if(!buckets.has(id))buckets.set(id,[]);buckets.get(id).push(s.value)}
  const points=[...buckets].map(([bucket,values])=>({t:(bucket+.5)*300000,value:median(values)}));
  const mx=points.reduce((n,p)=>n+p.t/3600000,0)/(points.length||1),my=points.reduce((n,p)=>n+p.value,0)/(points.length||1);
  const denominator=points.reduce((n,p)=>n+(p.t/3600000-mx)**2,0);
  const slope=points.length>=4&&denominator>0?points.reduce((n,p)=>n+(p.t/3600000-mx)*(p.value-my),0)/denominator:null;
  const values=series.map(s=>s.value);return{pid,kind,metric:key,count:series.length,min:Math.min(...values),max:Math.max(...values),lateFiveMinuteMedians:points,
   descriptiveSlopeKbPerHour:slope,qualification:'Descriptive slope of five-minute medians after 20-minute warm-up; no causal leak diagnosis or confidence interval from serially correlated samples.'};
 });
}
const trends=[...describeProcessSamples(oldData?.samples,'original-container'),...describeProcessSamples(sdk?.samples,'capacitor-sdk')];
const sdkAnalysis=summarizeSdkSoak(sdk);
const sdkLast=sdk?.samples?.at(-1),sdkMaxTask=sdkLast?.probe?.cohortMaxTaskMs??null;
const sdkHeap=sdkAnalysis.metrics.find(row=>row.metric==='mainJsHeapUsedBytes');
const sdkCpu=processCpuIntervals(sdk?.samples,sdk?.state?.device?.clockTicksPerSecond);
await fs.writeFile(`${raw}/process-cpu.json`,JSON.stringify({at:new Date().toISOString(),sdkCpu},null,2));
const heartbeats=(oldProgress?.events||[]).filter(e=>e.kind==='synthetic-soak');
const oldCohortIntegrity={sampleErrors:(oldData?.samples||[]).filter(s=>s.error).length,
 appPids:[...new Set((oldData?.samples||[]).map(s=>s.appPid).filter(Boolean))],
 rendererPids:[...new Set((oldData?.samples||[]).flatMap(s=>(s.processes||[]).filter(p=>p.kind==='owned-renderer').map(p=>p.pid)))],
 missingRendererOwnershipSamples:(oldData?.samples||[]).filter(s=>!s.ownershipKnown).length,
 heartbeatClockRegressions:heartbeats.filter((e,i)=>i>0&&e.elapsedMs<heartbeats[i-1].elapsedMs).length,
 qualification:'15-second samples can miss a short process restart; zero observed PID changes is not proof of no crash.'};
await fs.writeFile(`${raw}/memory-trends.json`,JSON.stringify({at:new Date().toISOString(),oldCohortComplete:oldComplete,sdkCohortComplete:sdkComplete,oldCohortIntegrity,oldContinuity,sdkContinuity,trends,sdkAnalysis,verdict:'LEAK_STATUS_NOT_VERIFIED; SDK/worker retained graph and full cohort coverage still required'},null,2));
const jumps=[];let maximum=0;
for(const e of oldProgress?.events||[])if(e.kind==='synthetic-soak'&&e.longTaskMax>maximum){maximum=e.longTaskMax;jumps.push(e)}
const event551=jumps.find(e=>Math.abs(e.longTaskMax-551.6)<.1);
const window551={event:event551||null,observedWindowJsMs:event551?[event551.elapsedMs-15000,event551.elapsedMs]:null,
 triggerRoute:event551?'Previous requested warehouse_import; new warehouse_dispatch request is issued before heartbeat. Cannot assign the historical task to either route without a trace.':null,
 originalCpuStack:null,exactRoot:'NOT_VERIFIED',reason:'Duration and heartbeat only; first observed max is not task start/end. Native process CPU sampled over ~15 seconds cannot split a single 551.6 ms task.'};
await fs.writeFile(`${raw}/historical-long-task-window.json`,JSON.stringify(window551,null,2));
const latestHeartbeat=(oldProgress?.events||[]).filter(e=>e.kind==='synthetic-soak').at(-1);
const regLog=await text('test-results/verification-regression.log'),lintLog=await text('test-results/verification-lint.log');
const regression={tests:Number(regLog.match(/ℹ tests (\d+)/)?.[1])||null,pass:Number(regLog.match(/ℹ pass (\d+)/)?.[1])||null,fail:regLog.match(/ℹ fail (\d+)/)?Number(regLog.match(/ℹ fail (\d+)/)[1]):null};
const reports=[];const add=(name,title,status,body)=>reports.push({name,title,status,body});
add('soak-test','1. Soak Test Report',sdkComplete?'ĐỦ 2 GIỜ QUAN SÁT — CHƯA PASS HIỆU NĂNG':'ĐANG CHẠY / CHƯA XÁC MINH ĐỦ',
 p(`Capacitor SDK cohort: ${sdk?.state?.status||'NOT VERIFIED'}; elapsed ${sdk?.state?.elapsedMs??'NOT VERIFIED'} ms; ${sdk?.samples?.length??0} mẫu. Workload revision: ${sdk?.state?.workloadRevision||'NOT VERIFIED'}.`)+
 table(['Kết quả SDK cohort hiện tại','Số liệu thực ghi'],[
  ['Long-task tối đa trong cohort',sdkMaxTask===null?'NOT VERIFIED':`${sdkMaxTask.toFixed(1)} ms — chưa đạt 100 ms`],
  ['Long-task count tăng trong cohort',sdkLast?.probe?.cohortLongTaskTotal??'NOT VERIFIED'],
  ['Collector / native-sampling failures',`${sdk?.failures?.length??'NOT VERIFIED'} / ${sdk?.nativeSamplingErrors?.length??'NOT VERIFIED'}`],
  ['Reload / JS errors / unhandled rejection',`${sdk?.documentReloads?.length??'NOT VERIFIED'} / ${sdkLast?.probe?.errors?.length??'NOT VERIFIED'} / ${sdkLast?.probe?.rejections??'NOT VERIFIED'}`],
  ['Thao tác được gọi',JSON.stringify(sdkAnalysis.coverage)],
  ['Bấm → hai RAF',JSON.stringify(sdkAnalysis.clicks)],
 ])+
 table(['Cohort','Thời gian thực đã ghi','Điều kiện','Giới hạn'],[
  ['WebView container ban đầu',oldData?`${(oldData.elapsedMs/60000).toFixed(1)} phút / 120`:'chưa có','API29 / WebView74; UI React thật, source mock; không debugger','Không thay bản Capacitor; thiếu listener/worker tracking và logout/login'],
  ['Capacitor SDK v2 — INCOMPLETE',abortedSdk?.state?.elapsedMs?`${(abortedSdk.state.elapsedMs/60000).toFixed(1)} phút / 120`:'Xem archive','Collector dừng vì adb.exe ETIMEDOUT; không ghi đủ lệnh gây timeout','Giữ nguyên bằng chứng; không cộng thời gian vào v3, không kết luận app crash từ lỗi collector'],
  ['Capacitor SDK v3 — INCOMPLETE',abortedSdk3?.state?.elapsedMs?`${(abortedSdk3.state.elapsedMs/60000).toFixed(1)} phút / 120`:'Xem archive','Collector dừng vì Runtime.evaluate timeout 30 giây; app trả lời lại ở chẩn đoán sau đó','Không chứng minh app vẫn phản hồi trong lúc timeout. Không cộng thời gian vào v4.'],
  ['Capacitor + SDK thật / demo Emulator',sdk?.state?.elapsedMs?`${(sdk.state.elapsedMs/60000).toFixed(1)} phút / 120`:'Đang xếp sau Macrobenchmark','Native plugins gốc; SDK worker thật; loopback fixture identity; không CPU profiler trong soak','Diagnostic build có CDP metadata overhead; không phải kiểm thử thủ công trên điện thoại thật'],
 ])+
 table(['Workload','Bằng chứng / trạng thái'],[
  ['Tính liên tục của quan sát',`Container max gap ${oldContinuity.maxGapMs??'NOT VERIFIED'} ms; SDK max gap ${sdkContinuity.maxGapMs??'NOT VERIFIED'} ms. Nếu có khoảng không quan sát >60 giây, không dùng riêng đồng hồ elapsed để xác nhận đủ hai giờ; ngưỡng này chỉ xét coverage, không phải ngưỡng PASS UI.`],
  ['Chuyển module',`Container: ${new Set((oldProgress?.events||[]).filter(e=>e.module).map(e=>e.module)).size} module label đã thấy. Không coi 22 route request là 22 màn đã dùng được.`],
  ['Tìm kiếm / danh sách lớn',`Fixture ${fixture?.records??'chưa seed'} chứng từ: 1000 khách, 1000 sản phẩm, 200 đơn items rỗng và 200 chi. Các ô search type=text phải tìm theo placeholder, không chỉ type=search. Xem actions.exercised để biết lượt thật sự nhập được.`],
  ['Background / foreground',`Container ghi ${oldData?.lifecycle?.length??0} lượt; về launcher 5 giây rồi mở lại cùng package, không reset dữ liệu.`],
  ['Điều kiện bắt đầu SDK soak','Dùng lại package diagnostic sau trace/Macro, không clear/reinstall để làm RAM đẹp hơn; có thể còn cache/phiên giả. Native launch output được lưu riêng, không gọi đây là first install hoặc cold-memory baseline.'],
  ['Phân đoạn cohort hiện tại',sdk?.state?.initialCondition||'Xem raw điều kiện bắt đầu. Long-task cũ không được gán thành long-task của cohort mới.'],
  ['Lỗi UI / CDP',JSON.stringify(sdk?.failures||[])+'. V4 có thể nối lại diagnostic transport để tiếp tục quan sát đủ thời gian, nhưng không xóa lỗi, không tính reconnect là thao tác UI thành công và không restart app. Có lỗi thì clean acceptance không đạt.'],
  ['Mẫu native thiếu',`${sdk?.nativeSamplingErrors?.length??'NOT VERIFIED'} lỗi lấy mẫu. Mẫu thiếu PSS/RSS/CPU giữ null hoặc vắng trường; không thay bằng 0 hay nội suy. Chi tiết command và duration nằm trong nativeSamplingErrors.`],
  ['Logout / login','Cohort SDK dùng callback logout của component rồi UI login bằng tài khoản giả. Chưa có action record thì NOT VERIFIED, không thay bằng cold-start hoặc claims injection.'],
  ['Listener / worker / lỗi JS','Container ban đầu không ghi đủ. Cohort SDK ghi public onSnapshot counters, worker tạo/terminate, DOM event listener counters, heap và lỗi JS. Counter public SDK không phải toàn bộ network channels.'],
 ])+
 list(['Không clear dữ liệu hoặc reload để giảm RAM trong soak. pm clear chỉ ở setup cold-login của package giả Macrobenchmark, không dùng các mẫu đó để chứng minh giảm RAM.',
 'Lượt SDK ngắn đầu đã dừng và lưu ABORTED_HARNESS_REPAIR: coordinator cũ tiếp tục dù diagnostic/Macro lỗi. Rerun mới chỉ bắt đầu soak sau khi cả hai bước trước hoàn tất. Không cộng thời gian lượt ABORTED vào lượt mới.',
 'Các lần build/test trên host diễn ra đồng thời với container ban đầu; host load không được kiểm soát. Đây không phải A/B latency sạch.',
 'Nếu Native SDK soak chưa đủ 7200000 ms hoặc collector dừng, trạng thái giữ NOT VERIFIED. Không ngoại suy một giờ thành hai giờ.'])+
 table(['Màn kiểm tra bổ sung sau soak','Active UI quan sát','Readiness trên fixture giả'],(postNavigation?.moduleChecks||[]).map(row=>[row.requested,row.activeModuleObserved??false,row.status]))+
 p('Bảng bổ sung chỉ xác nhận mở được UI và hợp đồng dữ liệu giả sẵn sàng. Không thay thế hai giờ churn của từng module, customer portal, thao tác nghiệp vụ lưu/xóa hay thao tác thủ công trên điện thoại thật. Các routeNotFound trong soak vẫn giữ nguyên, không biến thành route thành công nhờ bảng kiểm tra sau đó.')+
 link(`${old}/native-memory-progress.json`,'Container raw progress')+' · '+link(`${raw}/sdk-soak-status.json`,'Capacitor SDK soak status')+' · '+link(`${raw}/attempts/sdk-v2-adb-timeout-97min/sdk-soak-result.json`,'V2 dừng ở 97 phút — không cộng vào v3'));

add('long-task-root-cause','2. Long-task Root Cause Report','551,6 MS: CHƯA XÁC ĐỊNH ĐƯỢC NGUYÊN NHÂN CHÍNH XÁC',
 p(`Heartbeat container mới nhất: max ${latestHeartbeat?.longTaskMax??'NOT VERIFIED'} ms; cumulative count ${latestHeartbeat?.longTaskCount??'NOT VERIFIED'}. 551,6 ms là một mốc lịch sử, không được báo nhầm là max của toàn lượt. Host build/browser cùng chạy nên điều kiện CPU host chưa được kiểm soát; không thể quy một peak cho app hoặc cho host khi thiếu trace đồng bộ.`)+
 p('551,6 ms được thấy lần đầu ở heartbeat khoảng 825 giây. Cửa sổ chẩn đoán là khoảng 810–825 giây theo đồng hồ JS; heartbeat không có stack, task start/end hoặc trace đồng bộ. Không thể khôi phục vị trí chính xác từ riêng một con số duration.')+
 p('Tại heartbeat đó DOM vẫn ghi warehouse_import, trong khi callback vừa yêu cầu warehouse_dispatch. Probe cũ gọi parent setActiveTab và bỏ qua navigate; có thể chạy nhánh reset-scroll dự phòng. Đây là giả thuyết cần so với thao tác UI thật, chưa là kết luận lỗi app.')+
 table(['Dữ liệu cần tách','Hiện trạng'],[
  ['Scripting / layout / paint / GC',trace?`${trace.longTasks?.length??0} task >=100 ms có trace tái hiện; xem bảng dưới`:'Chưa có trace Android đồng bộ; CPU trace desktop không thay Android'],
  ['Thread CPU / off-CPU','Chỉ dùng tdur nếu trace cung cấp; không coi sample interval hoặc wall time là CPU hàm.'],
  ['Typing / điều hướng',diagnostic?`${diagnostic.runs?.filter(r=>r.kind==='actual-ui-navigation'&&r.clicked).length??0} click UI thực theo protocol; các route parent tái hiện được gắn nhãn riêng.`:'Đợi diagnostic; không dùng capture click 0.x ms làm INP hoặc feedback đã vẽ.'],
  ['Sửa mã nghiệp vụ','Chưa có căn cứ sửa runtime để chữa 551,6 ms. Không đụng module đã PASS bằng suy đoán.'],
 ])+
 table(['Task tái hiện ms','Thread / UI?','Thread CPU ms','Scripting exclusive wall ms','Layout wall ms','Paint wall ms','GC wall ms','Frame source map đầu'],(trace?.longTasks||[]).map(t=>[t.durationMs,`${t.threadName||'NOT VERIFIED'} / ${t.rendererMainThread??'unknown'}`,t.threadCpuMs,t.scriptingExclusiveWallMs,t.layoutWallMs,t.paintWallMs,t.gcWallMs,t.frames?.find(f=>f.original?.source)?.original?JSON.stringify(t.frames.find(f=>f.original?.source).original):'chưa map được']))+
 p('Task ở DedicatedWorker thread không tự động là UI long-task. Chỉ CrRendererMain được gắn nhãn renderer-main; worker GC hoặc tác vụ mạng được giữ riêng, không gán thẳng thành độ trễ nhập liệu.')+
 p('Trace reproduction là diagnostic có profiler. Deltas >50 ms được giữ như sampling gap chưa chắc chắn, không gán toàn bộ cho hàm đang lấy mẫu. dumpsys/worker-attach được tách khỏi cửa sổ CPU trace để giảm nhiễu bộ đo.')+
 p(`Native bridge metadata sau soak: ${nativeEvents?`${nativeEvents.events?.length??0} sự kiện trong buffer, ${nativeEvents.longTasksOver100msInCohort?.length??0} long-task >100 ms còn trong buffer`:'chưa thu thập'}. Callback module là trạng thái lúc gửi, không tự chứng minh route đã gây task. Log buffer có thể thiếu sự kiện cũ; không dùng metadata duration thay CPU stack.`)+
 p(`SDK soak mới ghi long-task tối đa ${sdkMaxTask===null?'NOT VERIFIED':sdkMaxTask.toFixed(1)+' ms'}. Không dùng tên màn ở callback hoặc sự trùng thời điểm để quy nguyên nhân cho một hàm. Trace tìm kiếm dưới đây là lượt diagnostic riêng, không phải stack của đỉnh lịch sử 551,6 ms hoặc đỉnh mới.`)+
 p('Trace tái hiện có một task CrRendererMain 243,173 ms wall / 118,088 ms thread CPU / 217,754 ms scripting exclusive wall. Source-map samples trỏ vào src/services/searchEngine.js, phần normalize/index/append (dòng 26–32, 129, 191). Đây là bằng chứng đường tính tìm kiếm góp vào tác vụ tái hiện; chưa đủ để gán toàn bộ task hay sửa rồi tuyên bố chữa đúng mốc 551,6 ms.')+
 link(`${raw}/historical-long-task-window.json`,'Cửa sổ 551,6 ms')+' · '+link(`${raw}/capacitor-trace-summary.json`,'Trace tái hiện nếu đã tạo'));

const macroRows=[];for(const file of macro?.outputFiles||[]){if(!/^cap-[A-Za-z0-9_.-]+\.json$/.test(file))continue;const json=await read(`${raw}/${file}`);for(const b of json?.benchmarks||[])macroRows.push([b.name,b.metrics?.timeToInitialDisplayMs?.median??'NOT VERIFIED',b.metrics?.timeToFullDisplayMs?.median??'NOT VERIFIED',file])}
add('macrobenchmark','3. Macrobenchmark Report',macro?.status==='SYNTHETIC_CAPACITOR_MACRO_COMPLETED'?'ĐÃ ĐO 10 LƯỢT GIẢ TRÊN MÁY ẢO — CHƯA NGHIỆM THU THIẾT BỊ THẬT':macro?.status||'WAITING',
 p('Target mới là com.hdmanager.caplab, kế thừa MainActivity gốc và các plugin Capacitor/custom gốc. Release: non-debuggable, profileable, ký test riêng; diagnostic là package .diag khác. Không dùng container WebView cũ làm bằng chứng Capacitor.')+
 table(['Metric','Định nghĩa / điều kiện'],[
  ['TTID','AndroidX StartupTimingMetric timeToInitialDisplayMs; không đổi am start -W TotalTime thành TTID.'],
  ['TTFD','Callback reportFullyDrawn của subclass thử sau Home source/commit/projection + hai RAF; có thể bao gồm login trong cold-password cohort. Đây là anchor test, production chưa có callback tương đương; không trộn login-screen fully drawn với Home fully drawn.'],
  ['Home interactive','NOT VERIFIED như mốc startup riêng. Trusted protocol input → UI feedback qua hai RAF sau data-ready là proxy, không thay mốc Home interactive hoặc kết quả hoàn tất thao tác/search. Không lấy shell DOM hoặc click capture thay tương tác đầy đủ.'],
  ['Home data ready','Dựa trên actual Home collection contract đúng tenant, server-confirmed flags, không có pending projection nhìn thấy, rồi hai RAF. Customer contract chưa quan sát được không tự thay bằng bootstrap success.'],
  ['Lần đầu / mở lại / đăng nhập','5 cold-password-login (clear riêng app giả ở setup) và 5 warm-password-login. Package giả không khôi phục được Home sau Activity recreation nếu không đăng nhập lại; không sửa security/persistence để gọi sai là warm authenticated. Identity API là fixture loopback; Firestore/Auth SDK thật với demo Emulator, không phải độ trễ Production.'],
 ])+
 table(['Test','TTID median ms','TTFD median ms','Raw JSON'],macroRows)+
 table(['Phiên login giả','Home shell ms từ auth-start','Home data-ready ms từ auth-start','Mẫu đầu sau login'],sdkAnalysis.loginEpochs.map(p=>[p.epoch,p.homeShellMs,p.homeDataReadyMs,p.firstSampleMs]))+
 p('Bảng Home chỉ lấy một mẫu đầu mỗi lần login được gọi rõ ràng, không biến heartbeat lặp thành hàng trăm lượt login. Identity là loopback giả; customer portal chưa có cohort riêng, nên không chứng nhận mọi loại tài khoản.')+
 p(`Trạng thái: ${macro?.status||'WAITING'}. ${macro?.error||''}`)+
 p(`Lỗi harness đầu được giữ riêng: ${failedAttempt?.error||'xem archive nếu có'}. Optional chaining trong biểu thức CDP không tương thích WebView74 đã đổi sang kiểm tra null; Intent Macro đổi từ package-only sang component rõ ràng sau khi am start implicit tái hiện lỗi resolve. Không sửa manifest/Rules ứng dụng để làm test chạy.`)+
 link(`${raw}/attempts/initial-harness-failures/capacitor-macro-state.json`,'Macro thất bại ban đầu — giữ nguyên bằng chứng')+
 p('EMULATOR warning được suppress có ghi nhận để chạy diagnostic, không biến máy ảo thành điện thoại yếu thật. CompilationMode.None, dataset/version/sha256 và điều kiện được lưu; không suy Android7 hoặc mọi máy từ API29 này.')+
 p('Cold ở đây là cold Android process, không phải cold filesystem hoặc cold Cloud backend: drop kernel page cache không có quyền trên máy ảo user build. Không đổi animation/power/CPU settings; display 1080×2280, density 440, GPU emulation được ghi riêng. Đây không phải môi trường CPU/thermal khóa cố định.')+
 link(`${raw}/device-conditions.json`,'Cấu hình thiết bị chỉ đọc')+
 p('Home readiness được poll mỗi 100 ms rồi đợi hai RAF nên có độ trễ quan sát, không phải đồng hồ chính xác đến 0,1 ms của lúc dữ liệu vừa hoàn tất. Cold TTFD bao gồm thao tác UiAutomator điền mật khẩu và các khoảng poll; không dùng nó làm riêng thời gian API đăng nhập. Trusted input → hai RAF chỉ là proxy feedback, chưa chứng minh thao tác nghiệp vụ đã hoàn tất.')+
 p('AndroidX đã tạo đủ 5 mẫu mỗi cohort sau khi dùng component Intent, bỏ additionalTestOutputDir alias, request native redraw trong subclass thử và đợi UI idle trước khi kết thúc trace. Native redraw chỉ giúp correlating frame của mốc thử; không phải tối ưu startup và không chứng nhận TTFD bản Production.')+
 link(`${raw}/attempts/renderthread-anchor-failure/capacitor-macro-state.json`,'Lỗi trích xuất RenderThread trước sửa harness')+
 link(`${raw}/capacitor-macro-state.json`,'Điều kiện, APK hashes, instrumentation output')+' · '+link(`${raw}/capacitor-build-identity.json`,'Source/build identity')+' · '+link(`${raw}/macro-trace-manifest.json`,'10 Perfetto traces đã lưu, kích thước và SHA-256'));

add('real-device-test','4. Real Device Test Report','BLOCKED — CHƯA CÓ THIẾT BỊ PHÙ HỢP',
 p('Người dùng xác nhận hiện chưa có điện thoại Android 7–10 cấu hình thấp phù hợp để kết nối. ADB hiện chỉ thấy emulator-5554, Android 10/API29/WebView74.')+
 table(['Hạng mục','Trạng thái'],[['Không bấm được / không nhập được','NOT VERIFIED trên điện thoại thật'],['Treo / giật / tải lại sau dùng lâu','NOT VERIFIED trên điện thoại thật'],['Android7–9 / WebView provider cũ','NOT VERIFIED'],['Thao tác thủ công / bàn phím / background thật','BLOCKED — không thay bằng test máy ảo hoặc unit tests']])+
 p('Không tự cài vào điện thoại khác hoặc dùng tài khoản/dữ liệu thật. Khi có thiết bị được cho phép, dùng package fixture riêng cùng dataset/hash; ghi OS, WebView, RAM/SoC, tình trạng pin/thermal, bản APK và video thao tác thật.'));

add('memory-leak','5. Memory Leak Report','CÓ XU HƯỚNG TĂNG HEAP — CHƯA CHỨNG MINH HOẶC LOẠI TRỪ LEAK',
 table(['Cohort / Process / PID','Metric','Số mẫu','Min–max KB','Slope mô tả KB/giờ sau warm-up'],trends.map(t=>[`${t.cohort} / ${t.kind} / ${t.pid}`,t.metric,t.count,`${t.min}–${t.max}`,t.descriptiveSlopePerHour===null?'NOT VERIFIED':t.descriptiveSlopePerHour.toFixed(1)]))+
 table(['SDK metric','Số mẫu','Đơn vị','Min–max','Slope mô tả / giờ'],sdkAnalysis.metrics.map(t=>[t.metric,t.count,t.unit,t.count?`${t.min}–${t.max}`:'NOT VERIFIED',t.descriptiveSlopePerHour===null?'NOT VERIFIED':t.descriptiveSlopePerHour.toFixed(1)]))+
 p(`Coverage SDK thực ghi: ${JSON.stringify(sdkAnalysis.coverage)}. Chỉ là số lần gọi thao tác; kết quả hoàn tất phải kiểm tra riêng. Raw memory-trends.json giữ thống kê cùng module để giảm nhiễu giữa các route.`)+
 p(`Trusted pointer → hai RAF được quan sát: ${JSON.stringify(sdkAnalysis.clicks)}. Không đếm lặp cùng event qua nhiều snapshot; không gọi chỉ số này là INP hoặc thời gian hoàn tất lọc danh sách.`)+
 p(`Độ toàn vẹn collector container: ${JSON.stringify(oldCohortIntegrity)}. Không ghi nhận restart trong mẫu 15 giây không đồng nghĩa không thể có crash ngắn giữa hai mẫu.`)+
 p('Dùng chuỗi theo thời gian và median cửa sổ 5 phút sau warm-up 20 phút, chia theo PID; không nối đường qua restart. Slope là mô tả, không phải chứng minh memory leak: mẫu phụ thuộc nhau, route phase và GC gây dao động. Phải đối chiếu retained graph, listener/worker teardown và cùng phase lặp lại.')+
 p(`Cohort ${sdk?.state?.workloadRevision||'NOT VERIFIED'}: JS heap đo tự nhiên ${sdkHeap?.min??'NOT VERIFIED'}–${sdkHeap?.max??'NOT VERIFIED'} bytes; slope median cửa sổ 5 phút sau warm-up ${Number.isFinite(sdkHeap?.descriptiveSlopePerHour)?(sdkHeap.descriptiveSlopePerHour/1e6).toFixed(2):'NOT VERIFIED'} MB/giờ (đơn vị thập phân). Đây là tín hiệu cần điều tra tiếp. Mẫu sau explicit GC ${postMemory?.after?.heap?.usedSize??'NOT VERIFIED'} bytes; thiếu baseline retained graph cùng phase nên chưa được gọi phần còn lại là leak, cũng không được kết luận không leak vì GC có giải phóng một phần.`)+
 p('Không cộng JS heap, worker heap hoặc Native Heap vào PSS để tạo tổng RAM: các phép đo có thể bao hàm nhau. RSS giữa các tiến trình cũng có vùng dùng chung; báo cáo giữ riêng từng PID và đơn vị, không cộng chồng thành mức tiết kiệm bộ nhớ giả.')+
 table(['Process / PID','CPU ms qua các khoảng mẫu','Wall ms quan sát','CPU quy đổi % của 1 lõi'],sdkCpu.processes.map(p=>[`${p.kind}/${p.pid}`,p.cpuMs,p.observedWallMs,p.weightedPercentOfOneCore.toFixed(2)]))+
 p('CPU lấy từ /proc user+system ticks, gồm cả overhead collector. Một tiến trình nhiều thread có thể vượt 100% của một lõi; không gọi đây là CPU riêng của JavaScript hoặc của một thao tác UI.')+
 p('Đã đối chiếu đúng mã Chromium74/V8 của WebView thử: getDOMCounters đọc InstanceCounters; Runtime.getHeapUsage gọi GetHeapStatistics. Hai handler không gọi thu gom rác trực tiếp. Điều này không chứng minh overhead bằng 0 hoặc retained graph đã được kiểm tra.')+
 '<a href="https://chromium.googlesource.com/chromium/src/+/74.0.3729.185/third_party/blink/renderer/core/inspector/inspector_memory_agent.cc">Chromium74 InspectorMemoryAgent</a> · '+link(`${raw}/chromium74-v8-runtime-agent.cc`,'V8 handler ở đúng revision Chromium74')+
 table(['Heap / tài nguyên','Khả năng quan sát'],[
  ['JS heap container','performance.memory có thể làm tròn/chia sẻ; bucket 15.2 MB không chứng minh heap đứng yên.'],
  ['JS heap Capacitor diagnostic','Runtime.getHeapUsage + DOM counters; ghi rõ metadata/profiler overhead.'],
  ['Worker heap','Chỉ các Target attach được mới có usedSize; lỗi/unsupported phải ghi NOT VERIFIED, không điền 0.'],
  ['Native heap / bitmap','PSS Native Heap và allocated heap khác JS heap. Graphics PSS không phải bitmap bytes; bitmap vẫn NOT VERIFIED nếu chưa profile allocation.'],
  ['Mức đại diện của fixture','1000 khách và 1000 sản phẩm không có ảnh upload thực tế; 200 đơn có items rỗng. Chưa chứng nhận decoded bitmap lớn, lịch sử đơn nhiều dòng hay tải qua mạng Internet.'],
  ['Listener','SDK wrapper chỉ đếm public onSnapshot; DOM jsEventListeners lấy từ CDP. Không tự coi additions-minus-removals là mọi listener còn sống sau GC.'],
  ['Listener trong worker','Báo riêng workerPublicSdkOutstanding từ counters các worker còn được probe theo dõi. Main-thread bằng 0 không có nghĩa toàn app bằng 0. Snapshot counter được gửi bất đồng bộ, không phải census mọi channel nội bộ của SDK.'],
  ['Worker','Created/explicitly terminated và target heap là hai bằng chứng khác nhau; GC hoặc Worker.onerror không mặc định là explicit termination.'],
 ])+
 p(`Container đủ 2 giờ: ${oldComplete}. Capacitor SDK cohort đủ 2 giờ: ${sdkComplete}. Chưa đủ thời gian/worker heap/role churn thì giữ NOT VERIFIED, không kết luận không leak hoặc OOM từ một đỉnh RSS.`)+
 table(['Chẩn đoán riêng SAU soak','Bằng chứng / giới hạn'],[
  ['Explicit GC',postMemory?.status||'Chưa thực hiện; chỉ được chạy khi cohort liên tục đủ hai giờ'],
  ['JS heap trước / sau GC',postMemory?.before&&postMemory?.after?`${postMemory.before.heap.usedSize} / ${postMemory.after.heap.usedSize} bytes. Đây không phải RAM tự nhiên hoặc mức tiết kiệm sau tối ưu.`:'NOT VERIFIED'],
  ['Worker heap sau soak',postMemory?.workerProbe?JSON.stringify(postMemory.workerProbe):'NOT VERIFIED; không điền 0 khi WebView không quảng bá target'],
  ['Navigation bổ sung',postNavigation?.scope||'Chưa thực hiện. Kiểm tra riêng sau soak không thay thế coverage hai giờ.'],
 ])+
 p('Lượt v2 dừng sau 97 phút được lưu riêng. Sau khi collector đã dừng, app giữ PID và document origin, JS heap giảm tự nhiên ở mẫu chẩn đoán; điều đó chưa chứng minh không leak hoặc không mất phản hồi đúng lúc timeout. V3 không cài lại, clear hoặc ép GC để hạ RAM.')+
 link(`${raw}/memory-trends.json`,'Xu hướng và cửa sổ median')+' · '+link(`${raw}/capacitor-diagnostic-result.json`,'Heap/worker/listener diagnostic'));

add('data-integrity-regression','6. Data Integrity Regression Report',cursor?.exactPayloadParity&&cursor?.unicodeOrder?.exactSdkAndMergeParity?'ĐẠT ĐỐI CHIẾU PHÂN TRANG LOCAL — CHƯA THAY NGHIỆM THU NGHIỆP VỤ':'NOT VERIFIED',
 table(['Hạng mục','Bằng chứng'],[
  ['Đọc mới đủ 107/107',cursor?.exactPayloadParity?'Đủ 107 dòng sau khi thêm 2 chứng từ vào fixture 105 dòng; payload từng dòng khớp (id canonical từ document path)':'Chưa có kết quả mới'],
  ['Tải tiếp khi dữ liệu đổi',cursor?.resumedPayloadParity?`${cursor.resumedCursorRecords}/${cursor.resumedCursorExpectedRecords}: đủ 105 chứng từ gốc và một bản thêm sau cursor; bản thêm trước cursor chỉ có ở lượt đọc mới. Payload đã đối chiếu riêng.`:'Xem raw mutationDuringPagination; chưa có gate payload tải tiếp mới'],
  ['Trùng / thiếu / thứ tự tải tiếp',`Duplicate count: ${cursor?.duplicateCount??'NOT VERIFIED'}; strictNextPageOrder: ${cursor?.strictNextPageOrder??'NOT VERIFIED'}`],
  ['Unicode / hoa-thường',cursor?.unicodeOrder?JSON.stringify(cursor.unicodeOrder):'NOT VERIFIED'],
  ['Lỗi comparator trước sửa','localeCompare cho thứ tự khác canonical UTF-8; unit oracle dùng Buffer bytes và SDK Emulator kiểm chứng lại.'],
  ['Sửa cục bộ','mergeCursorItems dùng comparator UTF-8 đã có của REST pagination. Không sửa nghiệp vụ hay thêm cache.'],
  ['Tồn kho / giá vốn / nợ / kế toán','Không chỉnh công thức hoặc backend/Rules; unit/core regression không thay kiểm thử nghiệp vụ trên thiết bị thật.'],
 ])+
 p(`Regression mới: ${regression.pass??'chưa có'}/${regression.tests??'chưa có'}, fail ${regression.fail??'chưa có'}. Kết quả xanh chỉ là local gates. Không cộng bộ test trùng từ lượt trước thành tổng test độc lập.`)+
 p('Build Vite cục bộ hoàn tất vào thư mục correctness-build riêng, không ghi đè dist hoặc triển khai. Lint phần chỉnh sửa và typecheck payroll/dispatch được kiểm tra riêng; các bước này không chứng minh tốc độ hoặc không leak.')+
 link('test-results/verification-build.log','Build log')+' · '+link('test-results/verification-typecheck.log','Typecheck log')+' · '+link('test-results/verification-lint.log','Lint log')+
 link('test-results/verification-cursor-order-before.log','Comparator trước sửa (fail)')+' · '+link('test-results/verification-cursor-integrity-with-unicode.log','SDK Emulator sau sửa')+' · '+link(`${raw}/rollback/firestoreCursorPagination-before-unicode-order.js`,'Rollback riêng comparator'));

add('before-after-comparison','7. Before/After Performance Comparison','CHƯA CÓ BẢN SỬA HIỆU NĂNG RUNTIME ĐƯỢC BENCHMARK A/B',
 table(['So sánh','Trước','Sau','Có được kết luận tăng tốc?'],[
  ['Định danh chứng từ','106/107 ở fixture ID trùng','107/107 sau path-ID authoritative','Không; đây là correctness fix ở lượt trước'],
  ['Gộp ID Unicode','Locale collation sai thứ tự SDK','Canonical UTF-8, payload/order khớp SDK','Không; correctness fix cục bộ, không chữa long-task'],
  ['551,6 ms','Duration-only, thiếu CPU stack đồng bộ',trace?'Đã có trace tái hiện riêng':'Trace đang đợi Android diagnostic','Chưa; không có runtime perf patch được chứng minh'],
  ['Startup','Container/preview, mock sources',macro?.status||'Capacitor + SDK Emulator đang xếp lượt','Không so hai cohort khác shell/transport/điều kiện như A/B'],
  ['RAM / CPU / bundle sau perf fix','Chưa có perf fix xác định đúng nguyên nhân','Không dựng số delta giả hoặc bỏ failure','NOT VERIFIED / NOT APPLICABLE'],
 ])+
 list(['Chỉ benchmark trước/sau sửa hiệu năng khi đã xác định đúng bottleneck, cùng thiết bị/dataset/build flags và thứ tự A/B được kiểm soát.',
 'Giữ Firebase Production, Security Rules, backend và kiến trúc Data Layer nguyên trạng; không deploy, không tích hợp cache/Adaptive Engine.',
 'Nếu trace chưa chứng minh nguyên nhân thì không sửa module đã PASS. Nghiệm thu toàn bộ vẫn NOT PASS/BLOCKED, dù unit tests đều đạt.'])+
 link(`${raw}/historical-long-task-window.json`,'Evidence gap lịch sử')+' · '+link('test-results/verification-regression.log','Local regression log'));

const generatedAt=new Date().toISOString(),style=`body{font:16px/1.6 system-ui;background:#f3f6fb;color:#19324a;margin:0}main{max-width:1180px;margin:auto;padding:28px}h1{font-size:30px;line-height:1.25}h2{font-size:21px}a{color:#2059b2}p,li{max-width:105ch;overflow-wrap:anywhere}.banner{background:#fff2d6;border-left:5px solid #ce8e16;padding:15px;border-radius:8px}.card,article{background:white;border:1px solid #dce5ef;border-radius:14px;padding:22px;margin:18px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}.grid .card{margin:0}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:11px;border:1px solid #dce5ef;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#edf3fc}small{color:#5e7188}@media(max-width:600px){main{padding:14px}h1{font-size:25px}article{padding:13px}}`;
const wrap=(title,body)=>`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${style}</style></head><body><main><small>HD Manager • Phase 2 verification • started 02/11/2026 • updated ${generatedAt}</small><h1>${esc(title)}</h1>${body}</main></body></html>`;
for(const r of reports)await fs.writeFile(`${out}/${r.name}.html`,wrap(r.title,`<a href="index.html">← Danh sách báo cáo</a><div class="banner">${esc(r.status)}</div><article>${r.body}</article>`));
await fs.writeFile(`${out}/index.html`,wrap('Phase 2 — Kiểm chứng hiệu năng và độ ổn định',
 '<div class="banner"><b>OVERALL: NOT PASS.</b> Thiết bị thật BLOCKED. Các lượt chưa đủ thời gian hoặc chưa có trace giữ NOT VERIFIED; không dùng unit tests để nghiệm thu hiệu năng.</div>'+
 p(`Capacitor SDK: ${(sdk?.state?.elapsedMs/60000||0).toFixed(1)}/120 phút, ${sdk?.samples?.length??0} mẫu; long-task tối đa ${sdkMaxTask===null?'chưa ghi nhận':sdkMaxTask.toFixed(1)+' ms'}. Macrobenchmark: ${macroRows.length===2?'đủ 5 lượt cold và 5 lượt warm đăng nhập giả':'xem trạng thái chi tiết'}. Thiết bị thật chưa có; chưa đủ căn cứ kết luận không leak hoặc đã chữa long-task lịch sử.`)+
 `<div class="grid">${reports.map(r=>`<section class="card"><h2><a href="${r.name}.html">${esc(r.title)}</a></h2><p>${esc(r.status)}</p></section>`).join('')}</div>`+
 '<article>'+p('Không sử dụng tài khoản/dữ liệu kinh doanh thật, không deploy Production, không thay Rules/backend/Data Layer hoặc tích hợp Adaptive. Lỗi sort Unicode đã được tái hiện trước khi sửa; chưa có cơ sở sửa runtime để tuyên bố chữa 551,6 ms.')+link(`${raw}/capacitor-run-status.json`,'Diagnostic status')+' · '+link(`${raw}/capacitor-macro-state.json`,'Macro status')+' · '+link(`${raw}/sdk-soak-status.json`,'Capacitor soak status')+'</article>'));
const status={generatedAt,overall:'NOT_PASS',realDevice:'BLOCKED_USER_HAS_NO_SUITABLE_DEVICE',oldContainerTwoHours:oldComplete,capacitorSdkTwoHours:sdkComplete,
 historicalLongTaskExactRoot:'NOT_VERIFIED',runtimePerformancePatch:false,productionDeployments:0,productionBenchmarkRequests:0,regression,reports:reports.map(({name,title,status})=>({name,title,status})),fixture,build:identity?{project:identity.project,package:identity.package,sourceMainActivitySha256:identity.sourceMainActivitySha256}:null,artifacts:{}};
for(const file of ['index.html',...reports.map(r=>r.name+'.html')]){const b=await fs.readFile(`${out}/${file}`);status.artifacts[file]={bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')}}
await fs.writeFile(`${out}/status.json`,JSON.stringify(status,null,2));
console.log(JSON.stringify({reports:reports.length,overall:status.overall,oldContainerMinutes:(oldData?.elapsedMs||0)/60000,capacitorSdkTwoHours:sdkComplete}));
