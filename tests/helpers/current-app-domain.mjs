import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse=traverseModule.default||traverseModule;

// Resolve the actual pure declaration graph without importing the React/Firebase
// application. Missing or external dependencies fail instead of being stubbed.
export function currentAppDomain(){
  const app=fileURLToPath(new URL('../../development/hd-manager/application/src/App.jsx',import.meta.url));
  const modules=new Map(),values=new Map(),resolving=new Set();
  const globals={Array,Object,Map,Set,WeakMap,WeakSet,Number,String,Boolean,Math,Intl,Date,RegExp,JSON,
    BigInt,Error,TypeError,RangeError,parseInt,parseFloat,isNaN,isFinite,undefined,NaN,Infinity,structuredClone};
  function module(file){
    if(modules.has(file))return modules.get(file);
    const source=fs.readFileSync(file,'utf8'),declarations=new Map(),imports=new Map(),exports=new Map();
    for(const statement of parse(source,{sourceType:'module',plugins:['jsx']}).program.body){
      if(statement.type==='ImportDeclaration')for(const entry of statement.specifiers)imports.set(entry.local.name,{entry,target:statement.source.value});
      const row=statement.type==='ExportNamedDeclaration'?statement.declaration:statement;
      if(row?.type==='VariableDeclaration')for(const entry of row.declarations)if(entry.id.type==='Identifier')declarations.set(entry.id.name,entry.init);
      if(row?.type==='FunctionDeclaration')declarations.set(row.id.name,row);
      if(statement.type==='ExportNamedDeclaration'){
        if(row?.type==='VariableDeclaration')for(const entry of row.declarations)exports.set(entry.id.name,entry.id.name);
        if(row?.type==='FunctionDeclaration')exports.set(row.id.name,row.id.name);
        for(const entry of statement.specifiers||[])exports.set(entry.exported.name,entry.local.name);
      }
    }
    const result={source,declarations,imports,exports};modules.set(file,result);return result;
  }
  function resolve(name,file=app){
    const key=file+':'+name;if(values.has(key))return values.get(key);
    assert.ok(!resolving.has(key),'Circular actual domain dependency: '+key);
    const m=module(file);resolving.add(key);let result;
    if(m.imports.has(name)){
      const {entry,target}=m.imports.get(name);assert.equal(entry.type,'ImportSpecifier','Pure named helper only: '+name);
      assert.ok(target.startsWith('.'),'External/UI dependency forbidden: '+target);
      const imported=path.resolve(path.dirname(file),target),local=module(imported).exports.get(entry.imported.name);
      assert.ok(local,'Actual exported helper missing: '+name);result=resolve(local,imported);
    }else{
      const node=m.declarations.get(name);assert.ok(node,'Actual declaration missing: '+key);
      const expression=m.source.slice(node.start,node.end),fragment=`const ${name}=(${expression});`,dependencies=new Set();
      traverse(parse(fragment,{sourceType:'module'}),{ReferencedIdentifier(ref){if(!ref.scope.hasBinding(ref.node.name,true))dependencies.add(ref.node.name);}});
      const bindings=[...dependencies].map(dep=>Object.hasOwn(globals,dep)?globals[dep]:resolve(dep,file));
      result=Function(...dependencies,'"use strict";'+fragment+`return ${name};`)(...bindings);
    }
    resolving.delete(key);values.set(key,result);return result;
  }
  return resolve;
}
