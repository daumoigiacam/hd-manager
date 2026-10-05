import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatDispatchNumberInput } from '../src/features/warehouse/dispatchNumberInput.js';
import { runDispatchEditorCommand } from '../src/features/warehouse/runDispatchEditorCommand.js';
import { shareDispatchSheet } from '../src/features/warehouse/shareDispatchSheet.js';

test('dispatch view contains no speech capture, transcription or auto-apply timer', () => {
  const source = readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  const view = source.slice(source.indexOf('function WarehouseDispatchView('), source.indexOf('function ',source.indexOf('function WarehouseDispatchView(')+10));
  assert(view.length > 1000);
  assert.doesNotMatch(view,/SpeechRecognition|MediaRecorder|recognitionRef|voiceTranscriptAutoApply|applyVoiceTranscript|requestMicrophoneAccess|transcribeRecordedVoice|warehouseVoiceOrderCustomers/);
  assert.match(view,/onReset=\{resetDispatchDraft\}/);
  assert.match(view,/runDispatchEditorCommand/);
  assert.match(view,/shareDispatchSheet\(sourceRows, targetDate/);
});

test('manual quantity formatting retains decimal comma and positive-number rules', () => {
  for (const [input, expected] of [[5,'5'],['2,567','2.57'],[0,''],[-1,''],[null,''],['abc',''],[Infinity,'']]) {
    assert.equal(formatDispatchNumberInput(input),expected);
  }
});

test('editor save/delete share a synchronous lock until operation settles; rejected command can retry', async () => {
  let reject;
  const pending = new Promise((_, fail) => {reject = fail;});
  const lock = {current:false}; const busy = []; const errors = []; let count = 0;
  const ports = {allowed:true,lock,setBusy:v=>busy.push(v),execute:()=>{count++;return pending;},setError:e=>errors.push(e),errorMessage:e=>e.message};
  const first = runDispatchEditorCommand(ports);
  await runDispatchEditorCommand(ports);
  assert.equal(count,1); assert.equal(lock.current,true);
  reject(new Error('ACK timeout')); await first;
  assert.deepEqual(errors,['ACK timeout']); assert.deepEqual(busy,[true,false]);
  await runDispatchEditorCommand({...ports,execute:async()=>{count++;}});
  await runDispatchEditorCommand({...ports,allowed:false});
  assert.equal(count,2); assert.equal(lock.current,false);
});

test('share frees canvas on blob failure, reports error and unlocks; repeated tap is ignored', async () => {
  const lock = {current:false}; const errors=[]; const busy=[];
  const canvas = {width:1080,height:544};
  let reject;
  const pending = new Promise((_, fail)=>{reject=fail;});
  let renders=0;
  const ports={lock,canShare:true,setDispatchActionError:e=>errors.push(e),setIsDispatchExporting:v=>busy.push(v),
    splitDispatchSharePages:rows=>[rows],renderDispatchSheetCanvas:async()=>{renders++;return canvas;},canvasToBlob:()=>pending,
    buildDispatchSheetFilename:()=> 'dispatch',shareBlobFile:async()=>({status:'shared'}),
    Capacitor:{getPlatform:()=> 'web'},CapacitorShare:{canShare:async()=>({value:false})},
    writeBlobToShareCache:async()=>({uri:''}),saveBlobFile:async()=>({status:'saved'}),
    isShareCancelled:()=>false,getFriendlyFirebaseErrorMessage:e=>e.message};
  const first=shareDispatchSheet([{}],'2026-10-06',ports);
  await shareDispatchSheet([{}],'2026-10-06',ports);
  reject(new Error('encode failed'));await first;
  assert.equal(renders,1);assert.equal(canvas.width,0);assert.equal(canvas.height,0);
  assert.equal(lock.current,false);assert.deepEqual(busy,[true,false]);assert.equal(errors.at(-1),'encode failed');
  await shareDispatchSheet([{}],'2026-10-06',{...ports,canShare:false});
  assert.equal(renders,1);
});
