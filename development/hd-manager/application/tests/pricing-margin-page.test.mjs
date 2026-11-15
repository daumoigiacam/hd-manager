import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const require=createRequire(import.meta.url),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const compiled=await build({entryPoints:[fileURLToPath(new URL('../src/features/pricing/PricingProductMarginList.jsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external:['react'],logLevel:'silent'});
const code=compiled.outputFiles[0].text;
function fixture(){
 let rows=Array.from({length:1000},(_,i)=>({productKey:'p'+i,productName:i===999?'Vịt đặc biệt':'Product '+i,targetMargin:'20'})),slots=[],index=0;
 const state=initial=>{const at=index++;if(!(at in slots))slots[at]=initial;return[slots[at],v=>slots[at]=typeof v==='function'?v(slots[at]):v];};
 const mock={...React,useState:state,useMemo:fn=>fn()},module={exports:{}};
 Function('require','module','exports',code)(name=>name==='react'?mock:require(name),module,module.exports);
 const Component=module.exports.default;
 const render=()=>{index=0;return Component({rows,groupLabel:'Gà',canEdit:true,onChange:(key,field,value)=>{rows=rows.map(row=>row.productKey===key?{...row,[field]:value}:row);}});};
 function nodes(tree,p,out=[]){if(!tree||typeof tree!=='object')return out;if(p(tree))out.push(tree);React.Children.forEach(tree.props?.children,child=>nodes(child,p,out));return out;}
 return {render,nodes,get rows(){return rows;}};
}
test('actual margin component renders twenty inputs for a thousand products, keeps every page and unsaved edits',()=>{
 const f=fixture();let view=f.render();const inputs=()=>f.nodes(view,n=>n.type==='input'&&n.props.inputMode==='decimal');
 assert.equal(inputs().length,20);assert.equal((renderToStaticMarkup(view).match(/inputMode="decimal"/g)||[]).length,20);
 inputs()[0].props.onChange({target:{value:'27,5'}});view=f.render();
 const seen=new Set();for(let page=0;page<50;page++){
  for(const input of inputs())seen.add(input.props['aria-label']);
  const next=f.nodes(view,n=>n.type==='button'&&n.props.children==='Trang sau')[0];
  assert.equal(next.props.disabled,page===49);if(page<49){next.props.onClick();view=f.render();}
 }
 assert.equal(seen.size,1000,'pagination never omits or duplicates a product');assert.equal(f.rows[0].targetMargin,'27,5','draft stays with parent outside the visible page');
});
test('actual margin search folds Vietnamese, resets the page and preserves exact keyed edits',()=>{
 const f=fixture();let view=f.render();f.nodes(view,n=>n.type==='button'&&n.props.children==='Trang sau')[0].props.onClick();view=f.render();
 f.nodes(view,n=>n.type==='input'&&n.props.type==='search')[0].props.onChange({target:{value:'vit dac biet'}});view=f.render();
 const inputs=f.nodes(view,n=>n.type==='input'&&n.props.inputMode==='decimal');assert.equal(inputs.length,1);assert.equal(inputs[0].props['aria-label'],'Biên lợi nhuận Vịt đặc biệt');
 inputs[0].props.onChange({target:{value:'31'}});assert.equal(f.rows[999].targetMargin,'31');assert(f.rows.slice(0,999).every(row=>row.targetMargin==='20'));
});
