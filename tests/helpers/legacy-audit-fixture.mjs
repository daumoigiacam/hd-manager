import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const repositoryRoot=fileURLToPath(new URL('../../',import.meta.url));
export const legacyAuditScope='LEGACY_ROOT_TOOLING_ONLY; NOT_CANONICAL_FIREBASE_ACCEPTANCE';

// Deliberate, local exception to canonical read routing. File descriptors are
// not source-path rewrites. Never change the global router or read Git as live
// source: these tests explicitly cover the retained legacy VPS/audit tooling.
export function readLegacyAuditSource(relative){
  assert.match(relative,/^src\/[A-Za-z0-9_./-]+\.(?:js|jsx)$/);
  const target=path.resolve(repositoryRoot,relative),sourceRoot=path.join(repositoryRoot,'src');
  assert.ok(!path.relative(sourceRoot,target).startsWith('..'));
  const fd=fs.openSync(target,'r');
  try{return fs.readFileSync(fd,'utf8');}finally{fs.closeSync(fd);}
}

const execute=promisify(execFile);
export async function createLegacyAuditFixture(){
  const parent=path.resolve(tmpdir()),directory=await mkdtemp(path.join(parent,'hd-legacy-audit-'));
  const dispose=async()=>{
    // Delete only this freshly-created, resolved fixture directory.
    assert.equal(path.dirname(directory),parent);assert.ok(path.basename(directory).startsWith('hd-legacy-audit-'));
    await rm(directory,{recursive:true,force:true});
  };
  const run=async script=>{
    assert.match(script,/^scripts\/[a-z0-9-]+\.mjs$/);
    // No canonical loader in this child: both its source fixture and imported
    // legacy helper are intentionally historical, never Firebase acceptance.
    return execute(process.execPath,[path.join(repositoryRoot,script)],{
      cwd:directory,encoding:'utf8',timeout:60000,maxBuffer:1024*1024,
      env:{...process.env,NODE_OPTIONS:''},
    });
  };
  try{
    await mkdir(path.join(directory,'src'),{recursive:true});
    await writeFile(path.join(directory,'src/App.jsx'),readLegacyAuditSource('src/App.jsx'));
    await writeFile(path.join(directory,'firestore.indexes.json'),await readFile(path.join(repositoryRoot,'firestore.indexes.json')));
    await run('scripts/audit-module-paths.mjs');
    await run('scripts/phase2-collection-inventory.mjs');
    await writeFile(path.join(directory,'test-results/harness-scope.json'),JSON.stringify({scope:legacyAuditScope,source:'src/App.jsx',productionAccess:false}));
    return {directory,run,dispose,read:relative=>readFile(path.join(directory,relative),'utf8')};
  }catch(error){await dispose();throw error;}
}
