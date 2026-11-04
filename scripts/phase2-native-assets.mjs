import fs from 'node:fs/promises';
import path from 'node:path';
import {Script} from 'node:vm';
import {makeFixture,installFixture} from '../performance/phase2/synthetic-fixture.mjs';
const root='test-results/phase2-performance-20261102',target=`${root}/native-assets/public`;
await fs.mkdir(target,{recursive:true});await fs.cp(`${root}/preview`,target,{recursive:true});
let html=await fs.readFile(`${target}/index.html`,'utf8');
const fixture=`(${installFixture.toString()})(${JSON.stringify(makeFixture('manager',1000))});`;
const observer=`(function(){var begin=performance.now(),sent=false,route=0;
 var timer=setInterval(function(){var m=document.querySelector('main[data-hd-module]');if(m&&!sent){sent=true;HDPerfLab.metrics(JSON.stringify({kind:'synthetic-shell',ms:performance.now()-begin,module:m.getAttribute('data-hd-module')}));}
 },100);
 setTimeout(function(){clearInterval(timer);HDPerfLab.metrics(JSON.stringify({kind:'synthetic-observation-end',shellSeen:sent,longTasks:window.__phase2Observed.longTasks.length,errors:window.__phase2Observed.errors.slice(0,5)}));},30000);
 if(location.search.indexOf('soak=1')>=0){
 setInterval(function(){var main=document.querySelector('main[data-hd-module]'),key=main&&Object.keys(main).find(function(k){return k.indexOf('__reactFiber$')===0}),f=key&&main[key],ok=false;
 for(var d=0;f&&d<100;d++,f=f.return){var p=f.memoizedProps;if(p&&typeof p.setActiveTab==='function'){
 p.setActiveTab(['home','customers','products','orders','finance','debt','asset_management','payroll','order_requests','warehouse_import','warehouse_dispatch','delivery_reports','employees','employee_reviews','company_attendance','pricing','price_quotes','messages','settings','bank_payments','points','executive_dashboard'][route++%22]);ok=true;break;}}
 var search=document.querySelector('main input[type="search"]');if(search){var setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(search,route%2?'Synthetic':'');search.dispatchEvent(new Event('input',{bubbles:true}));}
 var s=window.__phase2Observed;HDPerfLab.metrics(JSON.stringify({kind:'synthetic-soak',elapsedMs:performance.now()-begin,route:route,routeCallbackFound:ok,module:main&&main.getAttribute('data-hd-module'),nodes:document.getElementsByTagName('*').length,longTaskCount:s.longTaskCount||0,longTaskMax:s.longTaskMax||0,jsHeap:performance.memory?performance.memory.usedJSHeapSize:null,errorCount:s.errors.length}));
 },15000);}
})();`;
// Fixture initialization precedes all module scripts; no real auth or sources.
// Callback replacement preserves literal $' in the React-fiber probe; a string
// replacement would expand it to the HTML suffix and corrupt the inline script.
new Script(fixture+observer);
html=html.replace('<head>',()=>'<head><script>'+fixture+observer+'</script>');await fs.writeFile(`${target}/index.html`,html);
new Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
await fs.writeFile('performance/phase2/android-lab/local.properties','sdk.dir=D\\:\\\\HD-DEV\\\\android\\\\sdk\n');
console.log(JSON.stringify({target:path.resolve(target),productionTraffic:false,fixtureOnly:true}));
