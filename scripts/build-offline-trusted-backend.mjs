// Bundle canonical pure business modules into the existing Firebase Functions
// package. Build only: no upload, credentials, project mutation or deployment.
import fs from 'node:fs/promises';import path from 'node:path';import Module from 'node:module';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {build} from 'esbuild';
const outfile='functions/offlineTrustedBackend.bundle.cjs';
const result=await build({entryPoints:['functions/offlineTrustedBackend.mjs'],outfile,bundle:true,platform:'node',target:'node22',format:'cjs',packages:'external',define:{'import.meta.url':'__hdBundleUrl'},banner:{js:"const __hdBundleUrl=require('node:url').pathToFileURL(__filename).href;"},metafile:true,logLevel:'silent'});
const inputs=Object.keys(result.metafile.inputs).sort();
if(inputs.some(file=>file.startsWith('test-results/')||file.endsWith('App.jsx')||file.includes('node_modules/react/')))throw Error('UI or source snapshot entered the backend artifact');
const code=await fs.readFile(outfile),runtime=new Module(path.resolve(outfile));runtime.paths=Module._nodeModulePaths(path.resolve('functions'));runtime._compile(code.toString(),path.resolve(outfile));
if(typeof runtime.exports.createTrustedOfflineBackend!=='function')throw Error('Bundled backend factory missing');
const files=await Promise.all(inputs.map(async file=>({file,sha256:createHash('sha256').update(await fs.readFile(file)).digest('hex')})));
const manifest={at:new Date().toISOString(),baseCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),status:'BUILD_AND_FACTORY_LOAD_PASS_NOT_DEPLOYED',file:outfile,sha256:createHash('sha256').update(code).digest('hex'),inputDigest:createHash('sha256').update(JSON.stringify(files)).digest('hex'),files,privateCredentialsIncluded:false,deployed:false};
await fs.writeFile('functions/offlineTrustedBackend.bundle.manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({...manifest,files:files.length}));
