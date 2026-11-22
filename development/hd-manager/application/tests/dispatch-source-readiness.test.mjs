import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {parse} from '@babel/parser';
const source=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');let expression;
function visit(node){if(!node||typeof node!=='object')return;if(node.type==='VariableDeclarator'&&node.id?.name==='dispatchShortageReady')expression=source.slice(node.init.start,node.init.end);for(const [key,value]of Object.entries(node)){if(['loc','comments','extra'].includes(key))continue;if(Array.isArray(value))value.forEach(visit);else if(value?.type)visit(value);}}
visit(parse(source,{sourceType:'module',plugins:['jsx']}));assert.ok(expression);
const ready=Function('sourceReady','dispatchShortageProjection','return ('+expression+')');
test('completed empty projection cannot enable dispatch Save before tenant sources are confirmed',()=>{
  assert.equal(ready(false,{pending:false,error:null}),false);
  assert.equal(ready(true,{pending:true,error:null}),false);
  assert.equal(ready(true,{pending:false,error:Error('read failed')}),false);
  assert.equal(ready(true,{pending:false,error:null}),true);
  assert.match(source,/<WarehouseDispatchView sourceReady=\{isVpsMode\|\|isPreviewDataMode\|\|moduleSourcesReady\}/);
});
