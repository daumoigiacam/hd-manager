import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatchTrustedTap,dispatchTrustedKeyPair,assertNativeTapProtocolProof} from '../scripts/helpers/trusted-input-pair.mjs';
test('down/up queue in wire order before delayed down ACK; no manufactured timestamp',async()=>{
 const calls=[];let resolve;
 const client={send(method,args){calls.push({method,args});return calls.length===1?new Promise(r=>{resolve=r}):Promise.resolve()}};
 const done=dispatchTrustedTap(client,{x:40,y:60});assert.deepEqual(calls.map(c=>c.args.type),['mousePressed','mouseReleased']);
 assert.ok(calls.every(c=>!('timestamp' in c.args)));resolve();await done;
});
test('key release is also queued on a failed/down-delayed transport and both rejections are handled',async()=>{
 const calls=[];const client={send(method,args){calls.push({method,args});return Promise.reject(Error(args.type))}};
 await assert.rejects(dispatchTrustedKeyPair(client,{key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8}),/rawKeyDown/);
 assert.deepEqual(calls.map(c=>c.args.type),['rawKeyDown','keyUp']);
});

test('native protocol adoption requires actual complete trusted target-version calibration',()=>{
 const make=()=>({status:'NATIVE_PAIRED_TAP_PROTOCOL_VERIFIED_NOT_APP_BENEFIT',device:{api:'29',webview:'Current WebView package (name, version): (com.google.android.webview, 74.0.3729.185)'},trials:['serial','paired','paired','serial','serial','paired'].map(variant=>{const gap=variant==='serial'?150:1;return{variant,downUpGapMs:gap,events:[{name:'pointerdown',at:1,trusted:true},{name:'pointerup',at:1+gap,trusted:true},{name:'click',at:1+gap,trusted:true}]}})});
 assert.doesNotThrow(()=>assertNativeTapProtocolProof(make()));
 for(const mutate of [p=>p.status='FAILED',p=>p.device.api='28',p=>p.trials.pop(),p=>p.trials[0].events[0].trusted=false,p=>p.trials[1].downUpGapMs=0]){const proof=make();mutate(proof);assert.throws(()=>assertNativeTapProtocolProof(proof));}
});
