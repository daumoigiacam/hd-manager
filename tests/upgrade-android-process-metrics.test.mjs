import test from 'node:test';import assert from 'node:assert/strict';
import {parseAndroidProcessMetrics} from '../scripts/helpers/android-process-metrics.mjs';
test('Android10 memory and CPU counters preserve reported zeros and comm fields containing parentheses/spaces',()=>{
 const fields=['S',...Array(10).fill('9'),'123','456',...Array(8).fill('0')];
 const row=parseAndroidProcessMetrics(' Native Heap 10 11 12 13 14 15 16 170 180 190\n TOTAL: 0 TOTAL SWAP PSS: 2','VmRSS:\t0 kB\n','10 (name (with) spaces) '+fields.join(' '));
 assert.deepEqual(row,{pssKb:0,rssKb:0,nativeHeapAllocatedKb:180,userTicks:123,systemTicks:456});
 assert.deepEqual(parseAndroidProcessMetrics('','',''),{pssKb:null,rssKb:null,nativeHeapAllocatedKb:null,userTicks:null,systemTicks:null});
});
