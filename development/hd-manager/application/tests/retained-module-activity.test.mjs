import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import {build} from 'esbuild';
import {parse} from '@babel/parser';
const require=createRequire(import.meta.url),React=require('react');
const compiled=await build({entryPoints:[fileURLToPath(new URL('../src/layout/RetainedModuleActivity.jsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external:['react'],logLevel:'silent'});
function fixture(){let slots=[],index=0,effects=[];const mock={...React,useState:initial=>{const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>{slots[i]=v;}];},useLayoutEffect:work=>effects.push(work)},module={exports:{}};Function('require','module','exports',compiled.outputFiles[0].text)(name=>name==='react'?mock:require(name),module,module.exports);return props=>{index=0;effects=[];const view=module.exports.default(props);for(const effect of effects)effect();return view;};}
test('unvisited or revoked views never mount; fifty hide/show cycles keep one Activity and only active content receives new props',()=>{
 const render=fixture(),a=React.createElement('div',null,'A'),b=React.createElement('div',null,'B');
 assert.equal(render({active:false,allowed:true,children:a}),null);
 for(let i=0;i<50;i++){
  const visible=render({active:true,allowed:true,children:a});assert.equal(visible.type,React.Activity);assert.equal(visible.props.mode,'visible');
  const hidden=render({active:false,allowed:true,children:b});assert.equal(hidden.type,React.Activity);assert.equal(hidden.props.mode,'hidden');
  const memo=visible.props.children.type;assert(memo.compare(visible.props.children.props,hidden.props.children.props),'unrelated hidden props are not recomputed');
  assert(!memo.compare(hidden.props.children.props,visible.props.children.props),'reactivation uses current authorized props');
 }
 assert.equal(render({active:false,allowed:false,children:a}),null);assert.equal(render({active:false,allowed:true,children:b}),null,'regrant cannot resurrect revoked hidden form');
});
test('actual App retains one original Pricing view under the permission owner and keeps direct navigation denied without access',()=>{
 const text=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8'),ast=parse(text,{sourceType:'module',plugins:['jsx']});
 const matches=[];function walk(n){if(!n||typeof n!=='object')return;if(n.type==='JSXOpeningElement'&&['SimplePricingEngineView','RetainedModuleActivity'].includes(n.name?.name))matches.push(n);for(const[k,v]of Object.entries(n))if(!['loc','start','end'].includes(k)){if(Array.isArray(v))for(const x of v)walk(x);else if(v&&typeof v==='object')walk(v);}}walk(ast);
 assert.equal(matches.filter(n=>n.name.name==='SimplePricingEngineView').length,1,'no duplicate pricing instance');const activity=matches.find(n=>n.name.name==='RetainedModuleActivity');
 const attr=name=>text.slice(activity.attributes.find(n=>n.name?.name===name).start,activity.attributes.find(n=>n.name?.name===name).end);
 assert.equal(attr('key'),'key={`pricing:${dashboardPrivacyScope}`}');assert.match(attr('allowed'),/tabPermissions\.pricing&&canAccess\('pricing'\)/);
 // Home is an adjacent keyed sibling. Equal owner scopes must NEVER produce
 // equal sibling keys, or React can duplicate the old Home tree on updates.
 const pricingKey=activity.attributes.find(n=>n.name?.name==='key').value.expression;
 for(const dashboardPrivacyScope of ['owner-a','owner-b','["tenant-a","session-a"]']){
  const key=Function('dashboardPrivacyScope','return '+text.slice(pricingKey.start,pricingKey.end))(dashboardPrivacyScope);
  assert.notEqual(key,dashboardPrivacyScope);assert(key.endsWith(dashboardPrivacyScope));
 }
 assert.match(text,/case 'pricing': return null;/);assert.match(text,/\{renderPricingWorkspace\(\)\}/);
});
