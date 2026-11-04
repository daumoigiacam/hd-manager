import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const NATIVE_LISTENER_RELEASE_BASE=Object.freeze({android:'8.4.3',core:'8.4.3',sha256:'8ecc290bdd4f54605a6851e73023d4ba5ba0e56aa1d3eba75962242482b8fb4e'});
export function patchNativeListenerRelease(source,{android,core}) {
  const sha256=crypto.createHash('sha256').update(source).digest('hex');
  if(android!==NATIVE_LISTENER_RELEASE_BASE.android||core!==NATIVE_LISTENER_RELEASE_BASE.core||sha256!==NATIVE_LISTENER_RELEASE_BASE.sha256)
    throw Error('Native callback release patch needs review for this SDK version/hash; disable the override instead of shipping an unreviewed bridge.');
  const needle="                    if (typeof postToNative === 'function') {";
  if(source.split(needle).length!==2)throw Error('Native callback release anchor is not unique');
  const inserted=`                    // HD_NATIVE_LISTENER_RELEASE_PATCH_V1: removal is RETURN_NONE.
                    // Retire JS ownership at unsubscribe intent, without invoking
                    // the listener or storing a second removal-only callback.
                    if (methodName === 'removeListener' && options && typeof options.callbackId === 'string') {
                        callbacks.delete(options.callbackId);
                        if (storedCallback && typeof storedCallback.callback === 'function') storedCallback = null;
                    }
`;
  return {code:source.replace(needle,inserted+needle),baseSha256:sha256,sha256:crypto.createHash('sha256').update(source.replace(needle,inserted+needle)).digest('hex'),revision:'native-listener-release-v1'};
}

export async function loadNativeListenerReleasePatch(workspaceRoot) {
  const android=JSON.parse(await fs.readFile(path.join(workspaceRoot,'node_modules/@capacitor/android/package.json'),'utf8')).version;
  const core=JSON.parse(await fs.readFile(path.join(workspaceRoot,'node_modules/@capacitor/core/package.json'),'utf8')).version;
  const source=await fs.readFile(path.join(workspaceRoot,'node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js'),'utf8');
  return {...patchNativeListenerRelease(source,{android,core}),android,core};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const workspaceRoot=fileURLToPath(new URL('../',import.meta.url)),outputIndex=process.argv.indexOf('--output');
  if(outputIndex<0||!process.argv[outputIndex+1])throw Error('Explicit generated asset output required');
  const output=path.resolve(process.argv[outputIndex+1]);
  const allowed=['android/app/build/generated','test-results'].some(relative=>{const p=path.relative(path.resolve(workspaceRoot,relative),output);return p!==''&&!path.isAbsolute(p)&&p!=='..'&&!p.startsWith('..'+path.sep)});
  if(!allowed||path.basename(output)!=='native-bridge.js')throw Error('Output must be the owned generated native-bridge.js asset');
  const result=await loadNativeListenerReleasePatch(workspaceRoot);
  await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,result.code);
  const {code,...receipt}=result;console.log(JSON.stringify({output,...receipt,bytes:Buffer.byteLength(code),nodeModulesModified:false}));
}
