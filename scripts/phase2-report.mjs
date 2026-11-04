import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const out='docs/reports/phase2-performance-20261102',raw='test-results/phase2-performance-20261102';
await fs.mkdir(out,{recursive:true});
const optional=async(file)=>{try{return JSON.parse(await fs.readFile(file,'utf8'))}catch{return null}};
const text=async(file)=>{try{return await fs.readFile(file,'utf8')}catch{return ''}};
const escape=value=>String(value??'CHƯA ĐO').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const audit=await optional(`${out}/data-engine-integration.json`),browser=await optional(`${raw}/browser-baseline.json`),micro=await optional(`${raw}/cursor-local-before-after.json`);
const finished=await optional(`${raw}/native-memory-result.json`),progress=await optional(`${raw}/native-memory-progress.json`),native=finished||progress;
const observationHealth=await optional(`${raw}/observation-health.json`);
const uiDiagnostic=await optional(`${raw}/ui-diagnostic-summary.json`);
const macro=await optional(`${raw}/macro-state.json`);
const macroComplete=macro?.status==='SYNTHETIC_MACRO_TESTS_COMPLETED';
const macroBenchmarks=[];
for(const file of macro?.outputFiles||[]){
 if(!/^[A-Za-z0-9_.-]+\.json$/.test(file))continue;
 const data=await optional(`${raw}/${file}`);for(const benchmark of data?.benchmarks||[])macroBenchmarks.push({name:benchmark.name,metrics:benchmark.metrics,file});
}
const rows=(headers,data)=>`<div class="scroll"><table><thead><tr>${headers.map(x=>`<th>${escape(x)}</th>`).join('')}</tr></thead><tbody>${data.map(r=>`<tr>${r.map(x=>`<td>${escape(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const bullets=items=>`<ul>${items.map(x=>`<li>${escape(x)}</li>`).join('')}</ul>`;
const p=value=>`<p>${escape(value)}</p>`;
const link=(href,label)=>`<a href="${escape(href)}">${escape(label)}</a>`;
const evidence=(file,label)=>link('../../../'+file,label||file);
const logSummary=async file=>{
 const s=await text(file);return {file,tests:Number(s.match(/ℹ tests (\d+)/)?.[1])||null,pass:Number(s.match(/ℹ pass (\d+)/)?.[1])||null,
  fail:s.match(/ℹ fail (\d+)/)?Number(s.match(/ℹ fail (\d+)/)[1]):null,
  emulatorSuccess:s.includes('Script exited successfully (code 0)'),cursorSuccess:s.includes('Firestore cursor pagination: deterministic pages, tenant scope, dedupe and termination PASS.')};
};
const regression=await Promise.all(['test-results/phase2-core-regression.log','test-results/phase2-local-regression.log','test-results/phase2-cursor-before.log','test-results/phase2-cursor-after.log','test-results/phase2-cursor-isolated.log','test-results/phase2-inventory-repeat.log'].map(logSummary));
const memorySamples=native?.samples||[];
function memoryRange(kind,key){const values=memorySamples.flatMap(s=>(s.processes||[]).filter(p=>p.kind===kind).map(p=>p[key])).filter(Number.isFinite);return values.length?`${Math.min(...values)}–${Math.max(...values)} KB (${values.length} mẫu)`:'CHƯA ĐO'}
const pages=[];
function report(name,title,status,body){pages.push({name,title,status,body})}
report('data-engine-integration','1. Data Engine Integration Report','AUDIT + LOCAL FIX; CHƯA TÍCH HỢP KIẾN TRÚC',
 p(`Đã phân tích AST ${audit?.files} tệp src; ${audit?.modules.filter(m=>m.collections!==null).length} kế hoạch nguồn theo module và ${audit?.modules.filter(m=>m.collections===null).length} giá trị tab bổ sung (có cả tab con tài sản, không gọi tất cả là module độc lập).`)+
 rows(['Module / tab','Nguồn','Owner / phân trang','Trạng thái'],(audit?.modules||[]).map(m=>[m.module,m.collections?.join(', ')||'Chưa có foreground contract; cần phân biệt tab con',m.readOwner+(m.pagination?' • '+m.pagination:''),m.runtimeCoverage]))+
 '<h2>Engine, truy vấn trực tiếp và request trùng</h2>'+p('instantDataEngine / useInstantPage chưa reachable qua đồ thị import tương đối từ main.jsx; requestAdmission đã reachable. Đây là kiểm toán mã nguồn, không phải xác nhận toàn bộ alias/chunk của bản phát hành. Không thêm TanStack Query hoặc source cache thứ hai.')+
 rows(['Vị trí','Owner','API / loại'],(audit?.sdkReadSites||[]).filter(r=>!r.mock).map(r=>[`${r.file}:${r.line}`,r.owner,r.api+(r.facade?' (App facade)':' (SDK)')]))+
 p('Không cộng các site wrapper và SDK thành số request thực. firestorePageTransport còn gọi read/watch qua tham số inject; App còn có đường REST phân trang. Các nguồn trùng collection được App session manager dùng chung trong active listener map, nhưng backup, phục hồi write bị từ chối, payroll kỳ khóa và tác vụ quản trị có purpose riêng. Chưa chứng minh mọi request toàn app không trùng.')+
 '<h2>Ownership và scope</h2>'+rows(['Tầng','Owner / scope','Giới hạn / hủy / invalidation'],[
 ['App subscription manager','Phiên và tenant; công ty đọc một doc; business collection companyId ==; inbox nhân viên hai query, manager limit 200','LRU live 8 native / 12 web; overflow có thể đọc REST nhiều trang; cleanup session hủy worker, timers, controllers và unsubscribe'],
 ['Read worker','UID + project/app/company/accountType; token identity kiểm tra trước publish. Persistent namespace có UID; permission revision chưa nằm trong namespace persistent','SDK memory/persistent snapshot + main decoded state + tối đa 8 reopen baselines; bound theo số collection, chưa bound tổng bytes'],
 ['Module projection caches','WeakMap theo source identity; company/employee/permission/period/clock; cache kết quả dẫn xuất hoàn chỉnh','4 scope mỗi source tuple; không phải 4 source tuple toàn cục; không giữ draft/write ACK. WeakMap không tự chứng minh hết retention'],
 ['Instant engine (chưa nối module)','Một engine mỗi verified principal/tenant/permissionRevision; query + cursor + policy binding','80 page / 100 resource / 2 concurrent mặc định; transient read retry tối đa 3; RPC không thật sự cancel được; live failure cần retry rõ ràng'],
 ['Local device / legacy','loadRealtimeCollectionCache xóa cache nghiệp vụ cũ rồi trả Map rỗng; không hydrate số tài chính cũ','Hàng đợi pending writes là command ownership riêng, không đưa vào read cache; không xóa hàng đợi để giảm RAM'],
 ])+
 '<h2>Lỗi đã tái hiện và sửa</h2>'+p('readTenantCursorPage dùng {id: snapshot.id, ...data}, nên data.id ghi đè ID đường dẫn. Fixture Emulator cố ý có hai data.id giống nhau: trước sửa thiếu 1 (106/107); sau sửa và chạy lại riêng giữ đủ 107/107. Chỉ đảo thứ tự spread để ID thật authoritative. Không sửa chứng từ trên Firebase, không sửa công thức kho/giá vốn.')+
 p('Rollback chỉ riêng helper: dùng bản sao đã lưu và đối chiếu diff; không reset toàn repository vì đã có nhiều thay đổi trước task.')+
 evidence(`${raw}/rollback/firestoreCursorPagination.js`,'Bản helper trước sửa')+' · '+evidence('src/services/firestoreCursorPagination.js','Helper hiện tại')+
 '<h2>Kế hoạch cần duyệt trước khi nối</h2>'+rows(['Bước','Thay đổi','Gate'],(audit?.integrationPlan||[]).map(r=>[r.step+' • '+r.approval,r.change,r.gate]))+
 '<h2>Danh sách listener/timer và cleanup để kiểm tra tiếp</h2>'+p(`AST ghi nhận ${audit?.listenerAndTimerSites.length} site cấp phát và ${audit?.cleanupSites.length} site cleanup. Hai con số không phải phép ghép cặp và không chứng minh không leak. Test local kiểm tra sharing/cancel/revoke/close; trace toàn module và soak vẫn là gate riêng.`)+link('data-engine-integration.json','Toàn bộ inventory, source hashes, call sites và cleanup sites'));

const browserRows=(browser?.runs||[]).map(r=>[r.role,r.shellMs?.toFixed(1)||'KHÔNG CÓ',r.clickAcknowledgementMs?.toFixed(1)||'CHƯA ĐO',r.mockCoreWitnessMs?.toFixed(1)||'CHƯA ĐO',r.homeDataReadyMs?.toFixed(1)||'CHƯA ĐO',r.failure||`${r.errors.length} page errors`]);
report('home-startup-breakdown','2. Home Startup Breakdown','BASELINE GIẢ LẬP; CHƯA ĐẠT NGHIỆM THU',
 rows(['Cohort desktop','Shell ms','Pointerdown → click capture ms','Mock core witness ms','Home data ready','Lỗi'],browserRows)+
 p('Shell là thời điểm công cụ thấy DOM main/nav, bao gồm độ trễ polling; click capture chỉ là xử lý input, không phải INP, phản hồi đã vẽ hay Home interactive đầy đủ. Các lượt dùng claims giả khởi tạo trước ứng dụng, KHÔNG đo từ bấm đăng nhập/mật khẩu. Home data ready nếu có là mock source-confirmed contract + không còn projection pending nhìn thấy + 2 RAF; chưa chứng minh revision mới từ Firestore thật. Customer bootstrap không thay thế financial-source gate. Không dùng số 0.x ms để tuyên bố mọi thao tác dưới 100 ms. Lượt desktop ban đầu đo từ trước Playwright.click đã được thay bằng đo pointerdown; log cũ được giữ, không so chéo hai định nghĩa.')+
 rows(['Tầng','Dữ liệu / khả năng sử dụng','Định nghĩa witness và ưu tiên'],[
 ['Critical','Identity đã xác thực, company đúng scope, hồ sơ/quyền cần thiết cho route','Shell dựng độc lập; nav phản hồi được khi dữ liệu phụ chưa về. Không coi nhận Auth là đã thấy Home'],
 ['Important','Company Home: 15 nguồn business + core; Personal Home: 13 nguồn + core; Customer Home bootstrap có contract riêng','Cần server-confirmed sources → decoded payload → đúng React commit → projection hoàn chỉnh → frame. Không thay bằng loadedCollections/core witness'],
 ['Background','Thông báo khi chưa mở, lịch sử module không ở trước, chat, sao lưu, điểm thưởng / maintenance','Barrier và idle admission hiện có; notification có deadline 60 giây. Deadline chỉ nhả ưu tiên, không được đánh dấu dữ liệu đã sẵn sàng'],
 ])+
 '<h2>Bottleneck đã có bằng chứng</h2>'+bullets([
 'Home data-ready phụ thuộc nhiều nguồn khớp cả tenant; worker vẫn truy vấn cả tập khớp, truyền mọi dòng và chờ ACK. Client pagination không giới hạn khối lượng upstream.',
 'Source → worker SDK snapshot → encode/chunk/ACK → main decode/collection merge → React commit → payroll/report projection đều có chi phí. Worker không loại bỏ network/clone/heap.',
 'Bằng chứng lịch sử ngày 02/11: warm remembered-session shell 1005.1 ms, data ready 16775 ms; không phải cold/password login và không dùng làm benchmark sau sửa task này.',
 'Bản synthetic container Android đầu tiên thấy shell sau 1955.4 ms (poll 100 ms, từ đầu inline script); khác TTID và khác Capacitor release. Không dùng desktop nhanh để che Android chậm.',
 'Retained read-only projection có aria-busy khi cũ; trạng thái trực quan của từng card cần kiểm tra trước khi chấp nhận hiển thị stale. Không được giấu mọi trạng thái rồi gọi số cũ là số mới.',
 ])+
 p('Đề xuất P0 cần duyệt: contract identity tối thiểu cho shell; fan-out foreground theo dependency đã chứng minh; các card tài chính chờ đúng input của card, hiện pending/error/stale rõ ràng. Không tự chia nguồn hay bỏ payroll/COGS để đạt mốc thời gian. Một read model tổng hợp phía server là phương án kiến trúc/backend, chưa triển khai.')+
 evidence(`${raw}/browser-baseline.json`,'Số đo desktop thô')+' · '+link('data-engine-integration.json','Contract và source map'));

report('memory-leak-report','3. Memory Leak Report',finished?'OBSERVATION ENDED; CHƯA ĐỦ BẰNG CHỨNG LEAK/PASS':observationHealth?.status==='STALE_OR_STOPPED'?'BỘ ĐO ĐÃ DỪNG / CHƯA ĐỦ THỜI GIAN; KHÔNG PASS':'ĐO DÀI HẠN ĐANG CHẠY; KHÔNG PASS',
 p(`Cửa sổ hợp lệ hiện có: ${native?Math.round(native.elapsedMs/1000)+' giây':'chưa có'} / yêu cầu 7200 giây; ${memorySamples.length} mẫu. APK fixture độc lập, không debugger, không tài khoản thật. Lượt harness hỏng do inline script được lưu riêng và loại khỏi chứng cứ.`)+
 p(`Long-task lớn nhất đã ghi qua heartbeat fixture: ${(progress?.events||[]).filter(e=>Number.isFinite(e.longTaskMax)).reduce((max,e)=>Math.max(max,e.longTaskMax),0).toFixed(1)} ms. Đây là thời lượng long-task PerformanceObserver, không phải latency của mọi thao tác. Nếu lớn hơn 100 ms thì không thể dùng lượt này để khẳng định đã hết tác vụ vượt ngưỡng.`)+
 rows(['Chỉ số','Native main','Renderer xác minh thuộc app'],[
 ['PSS',memoryRange('native-main','totalPssKb'),memoryRange('owned-renderer','totalPssKb')],
 ['RSS (không cộng hai process thành tổng RAM)',memoryRange('native-main','rssKb'),memoryRange('owned-renderer','rssKb')],
 ['Native heap PSS',memoryRange('native-main','nativeHeapPssKb'),memoryRange('owned-renderer','nativeHeapPssKb')],
 ['Native heap allocated',memoryRange('native-main','nativeHeapAllocatedKb'),memoryRange('owned-renderer','nativeHeapAllocatedKb')],
 ['JS heap','Không áp dụng vào Java main','performance.memory trong heartbeat nếu có: có thể làm tròn/chia sẻ, chưa là heap snapshot retained graph'],
 ['Worker heap','CHƯA ĐO','Preview mock read worker; không dùng JS heap main thay worker heap'],
 ['Bitmap memory','CHƯA ĐO','Graphics PSS không phải bitmap bytes; không dùng Graphics=0 để kết luận không có bitmap'],
 ])+
 rows(['Workload','Tình trạng / phạm vi'],[
 ['Chuyển module','Native fixture yêu cầu vòng 22 route, 15 giây/lần; cần xem routeCallbackFound, module thực tế và errorCount, không coi yêu cầu route là đã kiểm thử chức năng route'],
 ['Tìm kiếm','Chỉ input[type=search] nếu tồn tại. Chưa phủ đầy đủ search box dùng type=text; không báo PASS toàn bộ tìm kiếm'],
 ['Danh sách lớn','1000 khách hàng + 1000 sản phẩm, 200 đơn (items rỗng) + 200 khoản chi, hoàn toàn tự sinh; DOM thực tế ghi theo heartbeat. Fixture nhẹ, chưa đại diện lịch sử nghiệp vụ lớn/nhiều dòng hàng'],
 ['30 phút / 2 giờ','Đang đo; phải đủ thời gian thực, không ngoại suy vài phút thành hai giờ'],
 ['Background / foreground','Mỗi ~10 phút, về launcher 5 giây rồi mở lại cùng package; ghi lifecycle, không clear data / force reload'],
 ['Logout / login','CHƯA ĐO trên native soak. Desktop ba context role là thử riêng, không thay thế churn login trên cùng process'],
 ])+
 p('Chưa xác định một memory leak mới đủ chắc chắn để sửa production. RSS tăng có thể do cache/JIT/GC/SDK; cần so cùng phase sau warm-up, giữ nguyên PID hoặc ghi restart, đo retained graph và xem slope cuối mỗi vòng. Không dùng eviction/xóa dữ liệu để ép đồ thị đi xuống. Không cấp PASS 30 phút/hai giờ khi mới có vài phút.')+
 evidence(`${raw}/native-memory-progress.json`,'Tiến trình đo / toàn bộ mẫu')+' · '+evidence(`${raw}/native-memory-harness-invalid.json`,'Lượt harness không hợp lệ, giữ để đối chiếu')+
 p('Watcher cục bộ tự cập nhật 7 báo cáo khoảng 30 giây/lần, bao gồm mốc 30 phút và khi đủ 2 giờ. Nếu tiến trình dừng bất thường, mốc cuối trong JSON là dữ liệu thật cuối cùng; không tự tính thời gian đã hoàn tất.'));

report('android-macrobenchmark-report','4. Android Macrobenchmark Report',macroComplete?'MACRO TRÊN FIXTURE ĐÃ CHẠY; CHƯA NGHIỆM THU RELEASE':macro?.status==='INSTRUMENTATION_FAILED'?'INSTRUMENTATION FAILED; KHÔNG PASS':'HARNESS ĐÃ BUILD; INSTRUMENT ĐỢI SAU SOAK',
 p(`Trạng thái AndroidX harness: ${macro?.status||'CHƯA BUILD'}. Bộ test độc lập đã compile với androidx.benchmark:benchmark-macro-junit4:1.4.1; test APK ${macro?.apkBytes??'chưa có'} bytes, không tăng bundle của HD Manager. Lượt instrument được xếp SAU soak để cold-start không phá phép đo memory.`)+
 p('Đã build offline và cài com.hdmanager.perflab riêng: non-debuggable, profileable, ký test, cùng frontend preview; không có quyền INTERNET. Giữ nguyên HD Manager Acceptance và các phiên thật. Container WebView này không phải Capacitor đầy đủ; kết quả không phải chứng nhận APK production.')+
 rows(['Metric','Witness cần thiết','Hiện trạng'],[
 ['TTID','StartupTimingMetric/Perfetto first frame trong release-like HD Manager',macroComplete?'Đã có lượt AndroidX trên container giả, xem JSON thô; chưa phải Capacitor HD Manager release.':'Chưa có lượt instrument hoàn tất. am start -W TotalTime chỉ ghi raw, không đổi tên thành TTID'],
 ['TTFD','Activity.reportFullyDrawn sau critical content đúng contract và vẽ frame','Không gọi giả reportFullyDrawn khi timer hết; TTFD chưa đo'],
 ['Home interactive','Trusted input → committed usable UI; ghi riêng với data-ready','Click capture desktop không thay thế native interactive'],
 ['Home data ready','Đúng nguồn server-confirmed + React commit + complete projection + frame','Native fixture không có Firebase transport thật; chưa đo release-like all-source Home'],
 ])+
 (macroBenchmarks.length?rows(['Tên test','TTID median ms','TTFD median ms / chưa có callback'],macroBenchmarks.map(b=>[b.name,b.metrics?.timeToInitialDisplayMs?.median??'Xem JSON thô',b.metrics?.timeToFullDisplayMs?.median??'CHƯA ĐO'])):'')+
 (macro?.error?p('Lỗi instrumentation: '+macro.error):'')+
 '<h2>Bộ harness cần hoàn thiện trước nghiệm thu</h2>'+bullets([
 'Đã compile module Java Macrobenchmark riêng, 10 cold + 10 warm; dependency chỉ ở test module, không vào HD Manager. MacrobenchmarkSpec.kt còn là bản tham khảo; code thực thi là StartupBenchmark.java. Có build APK chưa có nghĩa test đã chạy.',
 'Gắn đầy đủ metric với build variant cô lập dùng demo Firebase Emulator/fixture, giữ Capacitor/plugins/runtime cùng release candidate. Native timing bridge chỉ ở variant thử.',
 'Pin phiên bản harness; kiểm tra API 24–29 và capability theo OS. Compilation mode không hỗ trợ phải ghi không áp dụng, không cài đè/xóa phiên thật để đo.',
 'Warm-up, ít nhất 10 cold + 10 warm iterations, bộ dữ liệu/hash/OS/WebView/timezone/CPU config cố định; chạy A/B đổi thứ tự, lưu mọi failure.',
 'Cần điện thoại Android yếu thật ngoài emulator. Không suy từ Pixel giả lập Android 10 sang toàn Android 7–10 hoặc mọi máy.',
 ])+
 evidence('performance/phase2/android-lab/macrobenchmark/src/main/java/com/hdmanager/perflab/benchmark/StartupBenchmark.java','Macrobenchmark đã compile')+' · '+evidence('performance/phase2/android-lab/app/src/main/java/com/hdmanager/perflab/MainActivity.java','Container diagnostic')+' · '+evidence(`${raw}/macro-state.json`,'Trạng thái instrument')+' · '+evidence(`${raw}/native-run.json`,'Cấu hình và trạng thái phép đo'));

report('adaptive-performance-design','5. Adaptive Performance Design','PROTOTYPE THỬ CỤC BỘ; CHƯA NỐI APP',
 p('Không thêm framework hoặc cache mới. Prototype chỉ trả cấu hình đề xuất; không evict, đổi query/quyền, công thức hay dữ liệu. Nối vào cache/worker/scheduler là thay đổi kiến trúc cần duyệt.')+
 rows(['Policy','Cache page budget','Batch rows','Worker concurrency','Prefetch','Overscan','Background delay ms'],[
 ['conservative',20,8,1,0,2,1500],['balanced',40,16,2,1,4,500],
 ])+
 bullets([
 'Mặc định conservative. Nâng sau 10 cửa sổ liên tiếp response p95 <30 ms và memoryPressure <0.55; hạ sau 3 cửa sổ >80 ms hoặc pressure >0.8.',
 'Dwell tối thiểu 60 giây, hysteresis hai ngưỡng, tín hiệu NaN/thiếu/sai quay về conservative; reset khi đổi session.',
 'Không hardcode tên máy. memoryPressure phải có định nghĩa/nguồn đo hợp lệ, không suy từ RSS tổng hoặc deviceMemory không có trên WebView cũ. Tín hiệu không hỗ trợ → fallback.',
 'Cache page count chưa là memory byte budget. Trước tích hợp cần ước tính encoded/decoded byte có bound; ưu tiên evict projection không có consumer, không xóa source nghiệp vụ hoặc pending command.',
 'Giảm worker concurrency không đổi tính đầy đủ của output, không bỏ deadline lỗi hoặc ACK. Overscan chỉ áp dụng list đã chứng minh tương thích; không virtualize grouped rowSpan/export một cách mù quáng.',
 'Background chỉ hạ ưu tiên compute/prefetch khi typing/hidden; không chặn xác nhận write, auth revoke hoặc xử lý công nợ đã được yêu cầu.',
 ])+
 p('Đã test hysteresis, dwell, giới hạn, fallback và reset. Chưa có benchmark trước/sau của việc áp dụng policy vào App; không tuyên bố lợi ích RAM/CPU hoặc PASS Android từ unit test của prototype.')+
 evidence('performance/phase2/adaptive-policy-prototype.mjs','Prototype không có production import')+' · '+evidence('test-results/phase2-adaptive-tests.log','Kết quả test thiết kế'));

report('controlled-pilot-report','6. Controlled Pilot Report','CHƯA ÁP DỤNG THƯ VIỆN; CHƯA ĐỦ A/B',
 '<h2>Profiling view thật bằng fixture</h2>'+rows(['Route yêu cầu','Route thực tế','DOM nodes (toàn trang)'],(uiDiagnostic?.routes||[]).map(r=>[r.requestedModule,r.actualModule,r.nodes]))+
 p('CPU diagnostic có source map đã chạy 14 route bằng dữ liệu giả. Customer/Product khoảng 900 DOM node toàn trang ở fixture này; chưa chứng minh cần virtualizer thay pagination hiện có. Profile có overhead, điều hướng programmatic bypass navigate làm chạy nhánh reset-scroll dự phòng. Frame useModuleScrollReset:31 có 41.967 ms tổng sample intervals ở lượt này, không phải một tác vụ 41.967 ms, không đủ kết luận là nguyên nhân lag trong thao tác thật. Không sửa module đã PASS dựa trên probe này.')+
 evidence(`${raw}/ui-diagnostic-summary.json`,'CPU diagnostic và DOM baseline')+
 rows(['Pilot','Baseline hiện có','Điều kiện chạy / quyết định'],[
 ['TanStack Virtual','Synthetic native ghi DOM node theo route; danh sách hiện có pagination/chunked list. Chưa tách DOM row và CPU render của đúng customer/product view','Chưa cài. Chọn một view có DOM lớn thật và p95 render gây nghẽn; so với pagination hiện có trước, giữ global search/scroll focus/export/row identity'],
 ['React Compiler','Đã có baseline Home desktop + long-task Android fixture, chưa có CPU flamegraph chứng minh pure component đích','Chưa cài compiler/chưa đổi Vite. Chọn pure component đã profile; kiểm tra dynamic config hook/closure correctness trước bật compiler đúng component'],
 ])+
 rows(['Gate bắt buộc mỗi pilot','Trạng thái'],[
 ['Baseline + A/B cùng hash fixture/device/config','Chưa thực hiện A/B'],['CPU / RAM / bundle / response','Chưa có delta công nghệ; không thay bằng kết quả audit hoặc microbenchmark helper'],
 ['Data correctness / chức năng / hồi quy','Bộ local hiện có đã chạy cho lỗi cursor; chưa phải pilot regression'],['Android 7–10 / WebView cũ + thiết bị thật','Fixture đã chạy WebView74/API29; chưa chứng minh library compatibility hay Android7'],
 ['Rollback','Nếu pilot được duyệt: flag default-off + entry riêng, baseline asset/hash giữ nguyên; gỡ dependency/plugin và module import của pilot, không rollback dữ liệu'],
 ])+
 p('Chỉ áp dụng sau khi pilot đem lại lợi ích đo được và không mất chức năng. Không ép hai pilot thành PASS bằng benchmark component giả đơn giản thay view thật; không thêm Query/Zustand/Dexie để “hỗ trợ” thí nghiệm này.'));

report('regression-report','7. Regression Report','LOCAL GATES ĐẠT SAU KIỂM TRA LẠI; OVERALL NOT PASS',
 rows(['Log','Test / pass / fail','Kết luận giới hạn'],regression.map(r=>[r.file,`${r.tests??'—'} / ${r.pass??'—'} / ${r.fail??'—'}`,
  r.file.includes('before')?'Fail 106/107: tái hiện lỗi trước sửa':r.emulatorSuccess?'Runner emulator kết thúc thành công':r.fail===0?'Local suite đạt':r.cursorSuccess?'Cursor đạt; runner rộng thất bại ở giao dịch kho':'Xem log; không mặc định đạt']))+
 p('394 core tests (gồm .mjs và .cjs) và 70 targeted tests là hai lượt có phần trùng nhau, không cộng thành 464 test độc lập. Ca kho lần đầu có INVALID_ARGUMENT: Transaction is invalid or closed; lượt chạy lại riêng 6/6 đạt, chưa có bằng chứng để đổi nghiệp vụ kho. Mọi log lỗi được giữ. Node 25 ở runner đầu, Node 22 ở lượt tách; đây là khác biệt môi trường cần giữ trong đánh giá, không gọi là cùng điều kiện A/B.')+
 '<h2>Benchmark lỗi cursor</h2>'+rows(['Phiên bản','Unique identity / 200 dòng','Helper bundle cô lập'],micro?['before','after'].map(name=>[name,micro.samples.find(s=>s.name===name)?.uniquePathIdentities,micro.helperBytes[name]+' bytes']):[])+
 p('Helper microbenchmark dùng mock transport trên Node, dữ liệu và số vòng giống nhau, đảo thứ tự trước/sau; file lưu CPU usage và process heap/RSS từng mẫu. Không đại diện transport Firestore, app bundle hay RAM Android. Chi phí CPU rất nhỏ và có độ hạt đồng hồ, không dùng để tuyên bố tăng tốc. Sửa correctness, không tuyên bố giải quyết toàn bộ startup.')+
 '<h2>Safety và rollback</h2>'+bullets([
 'Không deploy, không push main, không sửa backend/Security Rules, không migration, không chạy load production, không đăng nhập tài khoản thật cho các benchmark này.',
 'Chỉ sửa runtime helper định danh cursor; phần còn lại là audit, prototype/test, runner emulator và app diagnostic riêng. Không cài thư viện mới vào package/lock hay đổi kiến trúc dữ liệu đang chạy.',
 'Rollback helper từ bản sao trước sửa sau khi so diff đúng phạm vi. Giữ test tái hiện để tránh tái phát. Không git reset vì workspace có thay đổi lịch sử chưa commit.',
 'Dừng observer theo PID đúng script trong native-run.json; chỉ force-stop/gỡ com.hdmanager.perflab nếu muốn bỏ lab, không động vào com.hdmanager.app/acceptance hay dữ liệu thật.',
 ])+
 p('Còn chặn nghiệm thu: all-source Home interactive/data-ready với synthetic transport release-like đầy đủ; profiler retained graph tách worker/bitmap; hoàn tất soak 30 phút/2 giờ và login churn; Macrobenchmark thật + điện thoại yếu thật; A/B pilot; duyệt kiến trúc trước tích hợp Data Layer/Adaptive. Không có căn cứ công bố toàn app <100 ms hoặc login ≤1 giây / dữ liệu ≤5 giây.')+
 evidence(`${raw}/cursor-local-before-after.json`,'Raw microbenchmark')+' · '+evidence('test-results/phase2-core-regression.log','Core regression')+' · '+evidence('test-results/phase2-cursor-isolated.log','Cursor Emulator'));

const style=`body{font:16px/1.6 system-ui,sans-serif;color:#19324a;background:#f3f6fb;margin:0}main{max-width:1180px;margin:auto;padding:28px}h1{font-size:30px;line-height:1.25}h2{font-size:21px;margin-top:30px}a{color:#2059b2}p,li{max-width:100ch}.banner{padding:14px 18px;border-left:5px solid #d28a17;background:#fff4d9;border-radius:8px}.card,article{background:white;border:1px solid #dce5ef;border-radius:14px;padding:22px;margin:18px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}.grid .card{margin:0}table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:12px;text-align:left;vertical-align:top;border:1px solid #dce5ef;overflow-wrap:anywhere}th{background:#edf3fc}.scroll{overflow:auto}small{color:#5b6a80}code{overflow-wrap:anywhere}@media(max-width:600px){main{padding:14px}h1{font-size:25px}article{padding:14px}}@media print{body{background:white}article{border:0;padding:0}.scroll{overflow:visible}}`;
const generatedAt=new Date().toISOString();
const wrap=(title,body)=>`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>${style}</style></head><body><main><small>HD MANAGER • PHASE 2 • 02/11/2026 • cập nhật ${generatedAt}</small><h1>${escape(title)}</h1>${body}</main></body></html>`;
for(const report of pages)await fs.writeFile(`${out}/${report.name}.html`,wrap(report.title,link('index.html','← Danh sách báo cáo')+`<div class="banner">${escape(report.status)}</div><article>${report.body}</article>`));
await fs.writeFile(`${out}/index.html`,wrap('Phase 2 Performance Engineering',
 '<div class="banner"><b>CHƯA NGHIỆM THU TOÀN BỘ.</b> Đã sửa lỗi cursor có chứng cứ; thiết kế Data Layer/Adaptive chưa tích hợp. Không triển khai Production.</div>'+
 p('Báo cáo tiếp nối Technology Adoption Audit, không nghiên cứu lại 20 công nghệ. Kết quả dưới đây phân biệt static audit, test cục bộ, synthetic benchmark, phép đo đang chạy và phần cần duyệt kiến trúc.')+
 `<div class="grid">${pages.map(report=>`<section class="card"><h2>${link(report.name+'.html',report.title)}</h2><p>${escape(report.status)}</p></section>`).join('')}</div>`+
 '<article><h2>Bằng chứng chính</h2>'+bullets(['24 foreground source plans; 11 giá trị tab bổ sung cần phân loại, không mặc định đầy đủ runtime coverage.','Cursor: 106/107 trước sửa → 107/107 sau sửa trên demo Firestore Emulator.','394 core và 70 targeted tests đạt, có test trùng; ghi rõ lỗi Emulator lần đầu và lượt chạy lại riêng.','Android 10/WebView74: APK synthetic riêng không có INTERNET; đo PSS/RSS/native heap/CPU theo PID đúng owner.','Soak native 2 giờ đang chạy nếu chưa có native-memory-result.json; không tính lượt harness lỗi thành kết quả.'])+
 evidence(`${raw}/native-memory-progress.json`,'Live raw progress')+' · '+link('data-engine-integration.json','Source inventory JSON')+'</article>'));
const manifest={generatedAt,overall:'NOT_PASS',runtimeFix:'cursor path identity only',reports:pages.map(({name,title,status})=>({name,title,status})),
 nativeElapsedMs:native?.elapsedMs??null,nativeRequestedMs:7200000,nativeObservationComplete:Boolean(finished&&finished.elapsedMs>=7200000),
 productionDeployments:0,productionBenchmarkReads:0,realAccountsUsed:0,newRuntimeLibraries:0,architectureIntegrated:false,
 regression,artifacts:{}};
for(const file of ['index.html',...pages.map(p=>p.name+'.html')]){const b=await fs.readFile(`${out}/${file}`);manifest.artifacts[file]={bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')}}
await fs.writeFile(`${out}/status.json`,JSON.stringify(manifest,null,2));
console.log(JSON.stringify({reports:pages.length,overall:manifest.overall,nativeElapsedMs:manifest.nativeElapsedMs}));
