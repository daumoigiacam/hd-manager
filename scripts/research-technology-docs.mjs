// Read-only primary documentation research. No package install, cloud mutation,
// account cookies or HD Manager/company payload is sent to any source.
import {mkdir,writeFile,readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const output='test-results/technology-adoption-20261102';
const sources=[
 ['react-compiler','https://react.dev/learn/react-compiler/installation'],
 ['react-compiler-rollout','https://react.dev/learn/react-compiler/incremental-adoption'],
 ['virtual','https://tanstack.com/virtual/latest/docs/introduction'],
 ['query','https://tanstack.com/query/latest/docs/framework/react/installation'],
 ['query-defaults','https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults'],
 ['zustand','https://zustand.docs.pmnd.rs/getting-started/introduction'],
 ['macrobenchmark','https://developer.android.com/topic/performance/benchmarking/macrobenchmark-overview?hl=en'],
 ['baseline','https://developer.android.com/topic/performance/baselineprofiles/overview?hl=en'],
 ['baseline-create','https://developer.android.com/topic/performance/baselineprofiles/create-baselineprofile?hl=en'],
 ['workers','https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers'],
 ['firestore-offline','https://firebase.google.com/docs/firestore/manage-data/enable-offline?hl=en'],
 ['sqlite','https://www.sqlite.org/whentouse.html'],
 ['dexie','https://dexie.org/docs/Dexie/Dexie'],
 ['workbox','https://developer.chrome.com/docs/workbox'],
 ['sentry','https://docs.sentry.io/platforms/javascript/guides/capacitor/'],
 ['otel','https://opentelemetry.io/docs/languages/js/'],
 ['grafana','https://grafana.com/docs/grafana/latest/setup-grafana/installation/'],
 ['k6','https://grafana.com/docs/k6/latest/testing-guides/api-load-testing/'],
 ['app-check','https://firebase.google.com/docs/app-check?hl=en'],
 ['app-check-functions','https://firebase.google.com/docs/app-check/cloud-functions?hl=en'],
 ['idempotency','https://cloud.google.com/blog/products/serverless/cloud-functions-pro-tips-building-idempotent-functions'],
 ['outbox','https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html'],
 ['firestore-events','https://firebase.google.com/docs/functions/firestore-events?hl=en'],
 ['bullmq','https://docs.bullmq.io/guide/connections'],
 ['adaptive-native','https://developer.android.com/games/optimize/adpf/overview?hl=en'],
 ['capacitor-android','https://capacitorjs.com/docs/android'],
 ['adaptive-memory','https://developer.mozilla.org/en-US/docs/Web/API/Navigator/deviceMemory'],
 ['adaptive-idle','https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback'],
 ['firestore-transactions','https://firebase.google.com/docs/firestore/manage-data/transactions?hl=en'],
];
const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7).split(',');const chosen=only?sources.filter(([id])=>only.includes(id)):sources;
const plain=html=>{let s=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi,'');const start=s.search(/<main\b|<article\b|class="devsite-article-body/);if(start>=0)s=s.slice(start);return s.replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;|&#34;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim()};
let next=0;const rows=[];
async function worker(){while(next<chosen.length){const [id,url]=chosen[next++];try{
 const response=await fetch(url,{headers:{'Accept-Language':'en-US,en;q=0.8'},signal:AbortSignal.timeout(20000)});let bytes=0,text='';const decoder=new TextDecoder();
 for await(const chunk of response.body){bytes+=chunk.byteLength;if(bytes>4*1024*1024)throw Error('bounded-source-too-large');text+=decoder.decode(chunk,{stream:true})}text+=decoder.decode();
 const row={id,url,finalUrl:response.url,retrievedAt:new Date().toISOString(),status:response.status,verified:response.ok,title:text.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]*>/g,'').trim()||null,responseBytes:bytes,sha256:createHash('sha256').update(text).digest('hex'),text:plain(text).slice(0,100000)};rows.push(row);console.log(JSON.stringify({id,status:row.status,title:row.title,bytes}));
 }catch(error){rows.push({id,url,retrievedAt:new Date().toISOString(),verified:false,error:['TimeoutError','AbortError'].includes(error.name)?error.name:'fetch-failed'});console.log(JSON.stringify({id,verified:false}))}}}
await mkdir(output,{recursive:true});await Promise.allSettled(Array.from({length:4},()=>worker()));
if(only){const previous=JSON.parse(await readFile(output+'/primary-docs-cache.json','utf8'));rows.push(...previous.sources.filter(r=>!only.includes(r.id)))}
rows.sort((a,b)=>sources.findIndex(s=>s[0]===a.id)-sources.findIndex(s=>s[0]===b.id));
await writeFile(output+'/primary-docs-cache.json',JSON.stringify({at:new Date(),scope:'Primary public documentation only; text retained for audit, not installed/executed or shipped in the app. No credentials/company data were sent. Web search connector returned503; direct HTTPS and official GitHub connector are fallbacks.',sources:rows},null,2));
console.log(JSON.stringify({verified:rows.filter(r=>r.verified).length,total:rows.length}));
