import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from '@babel/parser';

test('independently loaded shells share one native plugin proxy and cannot register inherited object keys accidentally',()=>{
  const source=readFileSync(new URL('../src/utils/nativePluginRegistry.js',import.meta.url),'utf8');
  const declaration=parse(source,{sourceType:'module'}).program.body.find(row=>row.type==='ExportNamedDeclaration').declaration;
  const owner={},calls=[];
  const load=()=>Function('globalThis','registerPlugin',source.slice(declaration.start,declaration.end)+';return getCapacitorPlugin;')(owner,name=>{calls.push(name);return {name};});
  const first=load(),second=load();
  assert.equal(first('SystemBars'),second('SystemBars'));
  assert.equal(first('ContactPicker'),second('ContactPicker'));
  assert.deepEqual(calls,['SystemBars','ContactPicker']);
  assert.deepEqual(first('constructor'),{name:'constructor'});
  assert.equal(first('constructor'),second('constructor'));
  const restored=readFileSync(new URL('../src/layout/RestoredLocalWorkspace.jsx',import.meta.url),'utf8');
  const shared=readFileSync(new URL('../src/features/customers/productCRMShared.jsx',import.meta.url),'utf8');
  assert.match(restored,/getCapacitorPlugin\('SystemBars'\)/);
  assert.match(restored,/from '..\/utils\/nativePluginRegistry.js'/);
  assert.match(shared,/from '..\/..\/utils\/nativePluginRegistry.js'/);
  assert.doesNotMatch(restored,/registerPlugin\(/);
});
