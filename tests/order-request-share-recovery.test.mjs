import assert from 'node:assert/strict';
import {appFunction} from './helpers/app-source-function.mjs';
import {hasCompleteOrderRequestShareBlobSet} from '../src/utils/orderRequestShare.js';
const blobs=[1,2,3,4].map(n=>new Blob([`page-${n}`],{type:'image/png'}));
let calls=0;
const share=appFunction('shareOrderRequestSheetBlobs',{
 buildOrderRequestSheetFilename:()=> 'orders',hasCompleteOrderRequestShareBlobSet,
 shareBlobFile:async({entries})=>{calls++;assert.equal(entries.length,4);assert.deepEqual(entries.map(e=>e.blob),blobs);throw Error('recipient failed');}
},{scope:'OrderRequestView'});
await assert.rejects(share(blobs),/recipient failed/);assert.equal(calls,1);
await assert.rejects(share([new Blob([])]),/chưa đầy đủ/);assert.equal(calls,1);
console.log('Order request routes complete set through one recoverable delivery: PASS');
