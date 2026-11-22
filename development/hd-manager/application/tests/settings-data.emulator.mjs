import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,collection,query,where,getDocFromServer,getDocsFromServer,runTransaction,setDoc,setLogLevel} from 'firebase/firestore';
import {settingsDataFixture,settingsAppFunction} from './helpers/settings-data-fixture.mjs';

const endpoint=process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8185';
if(!/^(?:127\.0\.0\.1|localhost):8185$/.test(endpoint))throw Error('Loopback Firestore port 8185 only');
const projectId=`demo-settings-data-${process.pid}`;
if(!/^demo-settings-data-\d+$/.test(projectId))throw Error('Owned demo settings data project only');
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8185';setLogLevel('silent');
const rules=fs.readFileSync(new URL('../../../../firestore.rules',import.meta.url),'utf8');
console.log(`FENCE emulator=127.0.0.1:8185 project=${projectId} rootRulesSHA256=${createHash('sha256').update(rules).digest('hex')}`);
const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8185,rules}});
const appId='settings-data-only',companyId='target';
const owner={id:'owner',companyId,role:'owner',position:'Chủ doanh nghiệp'};
const staff={id:'staff',companyId,role:'employee',position:'Kế toán'};
const client=actor=>env.authenticatedContext(actor.id,{companyId:actor.companyId,appUserId:actor.id,identityId:'identity-'+actor.id,accountType:'employee',role:actor.role}).firestore();
const a=client(owner),b=client(owner),staffDb=client(staff);
const ref=(db,name,id)=>doc(db,'artifacts',appId,'public','data',name,id);
const read=async(name,id)=>(await getDocFromServer(ref(a,name,id))).data();
const exists=async(name,id)=>(await getDocFromServer(ref(a,name,id))).exists();
const metadata=id=>({clientCommandId:id,clientMutationAt:'2026-11-22T01:02:03.000Z'});
const backup=orders=>({sourceCompanyId:'source',collections:{orders:orders.map(id=>({id,companyId:'source',total:100}))}});
async function seed(extra=[]){
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();await setDoc(ref(db,'companies',companyId),{id:companyId,name:'Original',ownerId:'original-owner',
      employeeRolePermissions:{[staff.id]:{settings:false}},employeeRolePermissionActions:{[staff.id]:{settings:{restore_data:false,backup_restore_data:false,reset_company_data:false,reset_selected_data_scopes:false}}}});
    for(const actor of [owner,staff])await setDoc(ref(db,'employees',actor.id),actor);
    for(const[name,id,row]of extra)await setDoc(ref(db,name,id),row);
  });
}
async function fixture({db=a,actor=owner,chunkSize=2}={}){
  const f=settingsDataFixture({actor,chunkSize});
  const flags={chunks:0,failChunk:0,lostAck:false,afterPrepared:null};
  const bindings={...f.env,db,appId,currentCompany:await read('companies',companyId),doc,collection,firebaseQuery:query,firebaseWhere:where,
    firebaseGetDocFromServer:getDocFromServer,firebaseGetDocsFromServer:getDocsFromServer,
    runTransaction:async(store,callback)=>{
      let business=false,prepared=false;
      const result=await runTransaction(store,async tx=>{
        business=false;prepared=false;
        const proxy={get:reference=>tx.get(reference),
          set:(reference,payload,options)=>{if(reference.parent.id!=='companyDataCommands')business=true;return options?tx.set(reference,payload,options):tx.set(reference,payload);},
          update:(reference,patch)=>{if(reference.parent.id!=='companyDataCommands')business=true;if(reference.parent.id==='companyDataCommands'&&!reference.id.includes('__part_')&&patch.status==='prepared')prepared=true;return tx.update(reference,patch);},
          delete:reference=>{business=true;return tx.delete(reference);}};
        const value=await callback(proxy);
        if(business&&flags.failChunk===flags.chunks+1)throw Error('Synthetic rejected business chunk');
        return value;
      });
      if(business)flags.chunks++;
      if(prepared&&flags.afterPrepared)await flags.afterPrepared();
      if(business&&flags.lostAck)throw Error('Synthetic lost ACK after real commit');
      return result;
    }};
  return {flags,restore:(payload,options)=>settingsAppFunction('handleRestoreCompanyBackup',bindings)(payload,options),
    reset:(scopes,options)=>settingsAppFunction('handleResetCompanyDemoData',bindings)(scopes,options)};
}
try{
  await test('actual parent migrates source records under Rules without copying company ownership or authority',{timeout:30000},async()=>{
    await seed();const f=await fixture(),input=backup(['a']);input.collections.companies=[{id:'source',name:'Migrated',ownerId:'old-owner',rolePermissions:{driver:{settings:true}}}];
    input.collections.payments=[{id:'p',companyId:'source',amount:929000,matchedOrderId:'a'}];const before=structuredClone(input);
    const receipt=await f.restore(input,metadata('migrate'));assert.equal(receipt.confirmed,true);assert.equal(receipt.queued,false);
    assert.equal((await read('orders','a')).companyId,companyId);assert.equal((await read('payments','p')).amount,929000);
    const company=await read('companies',companyId);assert.equal(company.ownerId,'original-owner');assert.equal(company.name,'Migrated');assert.equal(Object.hasOwn(company,'rolePermissions'),false);assert.deepEqual(input,before);
  });
  await test('foreign collision and locked payroll changes fail during preflight before any business prefix',{timeout:30000},async()=>{
    await seed([['orders','z',{id:'z',companyId:'foreign',total:999}]]);let f=await fixture();
    await assert.rejects(f.restore(backup(['a','z']),metadata('foreign')));assert.equal(await exists('orders','a'),false);
    const locked={id:'lock',companyId,status:'locked',closingBalance:809666};await seed([['payrollSnapshots','lock',locked]]);f=await fixture();
    const input=backup(['a']);input.collections.payrollSnapshots=[{...locked,companyId:'source',closingBalance:0}];
    await assert.rejects(f.restore(input,metadata('locked')),{code:'settings_data_protected'});assert.equal(await exists('orders','a'),false);assert.deepEqual(await read('payrollSnapshots','lock'),locked);
  });
  await test('real partial restore and lost ACK replay skip prior chunks, preserving later edits',{timeout:30000},async()=>{
    await seed();const f=await fixture(),input=backup(['a','b','c']),options=metadata('partial');
    f.flags.failChunk=2;await assert.rejects(f.restore(input,options),error=>error.confirmedChunks===1);
    await setDoc(ref(b,'orders','a'),{total:777},{merge:true});f.flags.failChunk=0;
    assert.equal((await f.restore(input,options)).confirmed,true);assert.equal((await read('orders','a')).total,777);assert.equal((await read('orders','c')).total,100);
    assert.equal((await f.restore(input,options)).replay,true);
    const g=await fixture();g.flags.lostAck=true;const lost=metadata('lost');await assert.rejects(g.restore(backup(['d']),lost),/lost ACK/);
    await setDoc(ref(b,'orders','d'),{total:888},{merge:true});g.flags.lostAck=false;await g.restore(backup(['d']),lost);assert.equal((await read('orders','d')).total,888);
  });
  await test('actual reset uses tenant server scans and durable retry targets; CAS blocks a post-preflight race',{timeout:30000},async()=>{
    await seed(['a','b','c'].map(id=>['products',id,{id,companyId}]).concat([['products','foreign',{id:'foreign',companyId:'foreign'}]]));
    const f=await fixture(),options=metadata('reset');f.flags.failChunk=2;await assert.rejects(f.reset(['products'],options),error=>error.confirmedChunks===1);
    await setDoc(ref(b,'products','a'),{id:'a',companyId,name:'Recreated later'});f.flags.failChunk=0;
    await f.reset(['products'],options);assert.equal((await read('products','a')).name,'Recreated later');assert.equal(await exists('products','c'),false);
    await f.reset(['products'],options);assert.equal((await read('products','a')).name,'Recreated later');
    await seed([['products','race',{id:'race',companyId,name:'Original'}]]);const g=await fixture();
    g.flags.afterPrepared=()=>setDoc(ref(b,'products','race'),{name:'Concurrent'},{merge:true});
    await assert.rejects(g.reset(['products'],metadata('race')),{code:'settings_data_conflict'});assert.equal((await read('products','race')).name,'Concurrent');
  });
  await test('actual parents reject revoked restore/reset catalog grants before mutation',{timeout:30000},async()=>{
    await seed();const f=await fixture({db:staffDb,actor:staff});
    await assert.rejects(f.restore(backup(['denied']),metadata('restore-denied')),{code:'permission-denied'});
    await assert.rejects(f.reset(['products'],metadata('reset-denied')),{code:'permission-denied'});
    assert.equal(await exists('orders','denied'),false);
  });
}finally{await env.cleanup();}
