import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {canonicalSourceReadPath} from '../scripts/canonical-source-reads.mjs';
import {build} from '../scripts/canonical-esbuild.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const canonical=path.join(root,'development/hd-manager/application/src/App.jsx');

test('native bundler resolves relative imports inside synthetic JSX to canonical files, including files absent from legacy source',async()=>{
  const result=await build({stdin:{contents:"import * as domain from './src/utils/deliveryCashflowTotals.js';export {domain};",resolveDir:root},bundle:true,write:false,platform:'node',format:'esm',metafile:true});
  const inputs=Object.keys(result.metafile.inputs).map(file=>file.replaceAll('\\','/'));
  assert.ok(inputs.some(file=>file.endsWith('development/hd-manager/application/src/utils/deliveryCashflowTotals.js')));
  assert.ok(!inputs.some(file=>file==='src/utils/deliveryCashflowTotals.js'));
});
test('canonical routing covers constructed file URLs, absolute/relative paths and Buffer paths without changing fixtures/server/destinations',()=>{
  const legacy=path.join(root,'src/App.jsx');
  for(const input of [legacy,pathToFileURL(legacy),Buffer.from(legacy),path.relative(process.cwd(),legacy)])assert.equal(canonicalSourceReadPath(input),canonical);
  for(const input of [12,path.join(root,'tests/fixtures/frozen.js'),path.join(root,'functions/index.js'),path.join(root,'package.json'),path.join(root,'src/no-existing-canonical-file.js'),path.join(root,'src/../package.json')])assert.equal(canonicalSourceReadPath(input),input);
});
test('registered regression process redirects all sync/async fs APIs and named imports to actual canonical source, preserving root package reads',()=>{
  const script=`import fs,{readFileSync,readFile} from 'node:fs';import fsp,{readFile as asyncRead} from 'node:fs/promises';import {createHash}from'node:crypto';
    const legacy=${JSON.stringify(path.join(root,'src/App.jsx'))},canonical=${JSON.stringify(canonical)};
    const hash=x=>createHash('sha256').update(x).digest('hex');const expected=hash(fs.readFileSync(canonical));
    const callback=await new Promise((resolve,reject)=>readFile(legacy,(error,value)=>error?reject(error):resolve(value)));
    const values=[fs.readFileSync(legacy),readFileSync(legacy),callback,await fsp.readFile(legacy),await asyncRead(legacy)];
    if(values.some(value=>hash(value)!==expected))throw Error('Stale root source read');
    const pkg=fs.readFileSync(${JSON.stringify(path.join(root,'package.json'))});
    if(hash(pkg)!==${JSON.stringify(createHash('sha256').update(readFileSync(path.join(root,'package.json'))).digest('hex'))})throw Error('Root package must not be redirected');console.log('PASS');`;
  const output=execFileSync(process.execPath,['--import',new URL('../scripts/register-canonical-source.mjs',import.meta.url).href,'--input-type=module','-e',script],{cwd:root,encoding:'utf8',timeout:15000});
  assert.match(output,/PASS/);
});
