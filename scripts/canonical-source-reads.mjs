import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {syncBuiltinESMExports} from 'node:module';

const root=fileURLToPath(new URL('../',import.meta.url));
const legacy=path.join(root,'src'),canonical=path.join(root,'development/hd-manager/application/src');
const exists=fs.existsSync;

// Regression tests also read source via constructed URLs and path.resolve.
// Redirect only reads of existing legacy src files, never writes, Git's frozen
// output, fixtures, server code, or paths outside this checkout.
export function canonicalSourceReadPath(input){
  if(typeof input!=='string'&&!(input instanceof URL)&&!Buffer.isBuffer(input))return input;
  const original=input instanceof URL?fileURLToPath(input):Buffer.isBuffer(input)?input.toString():input;
  const absolute=path.resolve(original),relative=path.relative(legacy,absolute);
  if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))return input;
  const target=path.join(canonical,relative);
  return exists(target)&&fs.statSync(target).isFile()?target:input;
}

let installed=false;
export function installCanonicalSourceReads(){
  if(installed)return;
  installed=true;
  for(const key of ['readFileSync','readFile']){
    const original=fs[key];
    fs[key]=function(input,...args){return original.call(this,canonicalSourceReadPath(input),...args);};
  }
  const read=fsp.readFile;
  fsp.readFile=function(input,...args){return read.call(this,canonicalSourceReadPath(input),...args);};
  syncBuiltinESMExports();
}
