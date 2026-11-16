import test from 'node:test';import assert from 'node:assert/strict';
import {retainedScopedPage} from '../src/services/retainedScopedPage.js';
test('same signed query retains the original rows during checkpoint refresh but cannot perform current-source actions',()=>{
 const runtime={isCurrent:()=>true},directory={},result={items:[{id:'a',amount:67000}]};
 const input={runtime,directory,loaded:{key:'signed-a:today',requestKey:'seq1',directory,result},queryKey:'signed-a:today',requestKey:'seq1'};
 assert.deepEqual(retainedScopedPage(input),{result,refreshing:false,fresh:true});
 for(const changed of [{checkpointChanged:true},{pending:true},{requestKey:'seq2'},{directory:{}}])assert.deepEqual(retainedScopedPage({...input,...changed}),{result,refreshing:true,fresh:false});
 assert.equal(result.items[0].amount,67000);
 for(const changed of [{invalid:true},{runtime:{isCurrent:()=>false}},{queryKey:'signed-b:today'},{queryKey:'signed-a:yesterday'}])assert.deepEqual(retainedScopedPage({...input,...changed}),{result:null,refreshing:false,fresh:false});
});
