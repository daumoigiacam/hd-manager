import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import{fileURLToPath}from'node:url';import{createRequire}from'node:module';import{build}from'esbuild';
import{createLocalCommitTiming}from'../src/services/localCommitTiming.js';
const require=createRequire(import.meta.url),React=require('react');
const file=fileURLToPath(new URL('../src/features/assets/AssetManagementWorkspace.jsx',import.meta.url));
const compiled=await build({stdin:{contents:fs.readFileSync(file,'utf8')+'\nexport {AssetListScreen};',resolveDir:path.dirname(file),loader:'jsx'},jsx:'automatic',bundle:true,write:false,platform:'node',format:'cjs',external:['react','react-dom','lucide-react'],loader:{'.css':'empty'},logLevel:'silent'});
function fixture(){let slots=[],index=0,effects=[],cleanups=[];const mock={...React,useState:initial=>{const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useRef:initial=>{const i=index++;return slots[i]||(slots[i]={current:initial});},useMemo:fn=>fn(),useDeferredValue:v=>v,useCallback:fn=>fn,useEffect:fn=>effects.push(fn),useLayoutEffect:fn=>effects.push(fn)},module={exports:{}};
 Function('require','module','exports',compiled.outputFiles[0].text)(name=>name==='react'?mock:require(name),module,module.exports);
 return props=>{index=0;effects=[];const view=module.exports.AssetListScreen(props);for(const fn of effects){const cleanup=fn();if(cleanup)cleanups.push(cleanup);}return view;};}
function nodes(tree,predicate,result=[]){if(!React.isValidElement(tree))return result;if(predicate(tree))result.push(tree);React.Children.forEach(tree.props.children,child=>nodes(child,predicate,result));return result;}
const rows=Array.from({length:1000},(_,i)=>({id:'asset-'+i,name:'Xe thử '+i,type:'truck',status:'active'}));
const props={assets:rows,metricsByAsset:{},getAssigneeName:row=>row.id==='asset-999'?'Nguyễn Trần':'',canViewAssets:true,canCreateAsset:true,onCreateAsset(){},onOpenAsset(){}};
test('actual 1000-asset screen searches beyond first page immediately without a debounce timer and clear restores original bounds',()=>{
 const render=fixture();let tree=render(props);assert.equal(nodes(tree,n=>n.type?.name==='AssetCard').length,24);
 const input=nodes(tree,n=>n.type==='input')[0];input.props.onChange({target:{value:'999'}});tree=render(props);
 assert.deepEqual(nodes(tree,n=>n.type?.name==='AssetCard').map(n=>n.props.asset.id),['asset-999']);
 nodes(tree,n=>n.props['aria-label']==='Xóa tìm kiếm')[0].props.onClick();tree=render(props);assert.equal(nodes(tree,n=>n.type?.name==='AssetCard').length,24);
 nodes(tree,n=>n.type==='input')[0].props.onChange({target:{value:'nguyen tran'}});tree=render(props);assert.deepEqual(nodes(tree,n=>n.type?.name==='AssetCard').map(n=>n.props.asset.id),['asset-999']);
});
test('local search cannot change asset records, amounts or source identities',()=>{
 const immutable=rows.map(row=>Object.freeze({...row,purchasePrice:123456})),before=JSON.stringify(immutable),render=fixture();let tree=render({...props,assets:immutable});
 for(const value of ['khong co','99','xe thu','0']){nodes(tree,n=>n.type==='input')[0].props.onChange({target:{value}});tree=render({...props,assets:immutable});}
 assert.equal(JSON.stringify(immutable),before);
});
test('commit diagnostics retain slow/superseded/cancelled samples and emit metadata only',()=>{
 let at=0;const result=[],trace=createLocalCommitTiming({enabled:true,clock:()=>at,emit:value=>result.push(value)});
 trace.start();at=180;trace.commit(1000);trace.start();at=200;trace.start();at=207;trace.commit(1);trace.start();at=999;trace.close();
 assert.deepEqual(result.map(r=>r.status),['committed','superseded','committed','cancelled']);assert.equal(result[0].durationMs,180);assert.equal(result[2].durationMs,7);
 assert(result.every(r=>r.scope==='handler-to-react-commit-not-frame'));assert(result.every(r=>Object.keys(r).sort().join(',')==='action,count,durationMs,id,module,scope,status'));
});
test('Production/disabled diagnostics do not read the clock or emit data',()=>{
 const trace=createLocalCommitTiming({enabled:false,clock(){throw Error('clock');},emit(){throw Error('emit');}});trace.start();trace.commit(20);trace.close();
});
