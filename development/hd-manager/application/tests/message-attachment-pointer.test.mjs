import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import{parse}from'@babel/parser';import{build}from'esbuild';import{createRequire}from'node:module';import{fileURLToPath}from'node:url';
const require=createRequire(import.meta.url),React=require('react');
const compiled=await build({entryPoints:[fileURLToPath(new URL('../src/features/messaging/MessagingUi.jsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external:['react','lucide-react'],loader:{'.css':'empty'},logLevel:'silent'}),module={exports:{}};
Function('require','module','exports',compiled.outputFiles[0].text)(require,module,module.exports);
const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8'),ast=parse(app,{sourceType:'module',plugins:['jsx']}),vars=new Map();
function visit(n){if(!n||typeof n!=='object')return;if(n.type==='VariableDeclarator'&&n.id.type==='Identifier')vars.set(n.id.name,n.init);for(const[k,v]of Object.entries(n)){if(['loc','comments','extra'].includes(k))continue;if(Array.isArray(v))v.forEach(visit);else if(v?.type)visit(v);}}visit(ast);
const compile=(name,bindings)=>Function(...Object.keys(bindings),'return ('+app.slice(vars.get(name).start,vars.get(name).end)+')')(...Object.values(bindings));
test('actual attachment button survives the real capture-phase outside handler, while outside clicks still dismiss and cleanup removes the exact listener',()=>{
 let selected=0,closed=0,listener,removed;
 const panel=module.exports.AttachmentPanel({actions:[{id:'order',label:'Đơn hàng',allowed:true}],onSelect:()=>selected++,onClose:()=>closed++});
 const buttons=React.Children.toArray(panel.props.children).find(n=>n.props?.className==='hd-chat-attachment-grid').props.children;
 const button=React.Children.toArray(buttons)[0];
 class Element {constructor(inside){this.inside=inside;}closest(selector){assert.equal(selector,'[data-search-zone="true"]');return this.inside&&panel.props['data-search-zone']==='true'?panel:null;}}
 const isInsideSearchZone=compile('isInsideSearchZone',{Element,SEARCH_ZONE_SELECTOR:'[data-search-zone="true"]'});
 let cleanup;const document={addEventListener:(type,fn,capture)=>{assert.equal(type,'pointerdown');assert.equal(capture,true);listener=fn;},removeEventListener:(type,fn,capture)=>{removed={type,fn,capture};}};
 const hook=compile('useDismissSearchOnOutsideClick',{useEffect:fn=>{cleanup=fn();},document,isInsideSearchZone});
 hook(true,()=>closed++);listener({target:new Element(true)});assert.equal(closed,0,'the panel must remain mounted through pointerup/click');button.props.onClick();assert.equal(selected,1);
 listener({target:new Element(false)});assert.equal(closed,1);cleanup();assert.deepEqual(removed,{type:'pointerdown',fn:listener,capture:true});
});
