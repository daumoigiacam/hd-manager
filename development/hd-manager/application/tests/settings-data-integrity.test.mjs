import test from 'node:test';
import assert from 'node:assert/strict';
import {settingsAppFunction,settingsDataFixture} from './helpers/settings-data-fixture.mjs';

const metadata=id=>({clientCommandId:id,clientMutationAt:'2026-11-22T00:00:00.000Z'});
const backup=(collections,sourceCompanyId='source')=>({sourceCompanyId,collections});
const order=(id,total=100)=>({id,companyId:'source',total});

test('actual restore migrates source data, preserves financial amounts, and never migrates authority',async()=>{
  const f=settingsDataFixture(),input=backup({companies:[{id:'source',name:'Migrated',ownerId:'old-owner',rolePermissions:{sales:{settings:true}},billingPlan:'old-plan'}],
    orders:[order('a',2032000)],payments:[{id:'p',companyId:'source',amount:929000,matchedOrderId:'a'}]});
  const before=structuredClone(input),result=await f.restore(input,metadata('migrate'));
  assert.equal(result.confirmed,true);assert.equal(result.queued,false);assert.equal(result.restoredCount,2);
  assert.equal(f.docs.get('orders/a').companyId,'target');assert.equal(f.docs.get('orders/a').total,2032000);assert.equal(f.docs.get('payments/p').amount,929000);
  assert.equal(f.docs.get('companies/target').ownerId,'original-owner');assert.equal(f.docs.get('companies/target').name,'Migrated');
  assert.equal(Object.hasOwn(f.docs.get('companies/target'),'rolePermissions'),false);assert.equal(Object.hasOwn(f.docs.get('companies/target'),'billingPlan'),false);
  assert.deepEqual(input,before);
});

test('foreign existing collisions, mixed-tenant source rows and same-tenant authority changes reject before any business writes',async()=>{
  for(const kind of ['collision','foreign-row','authority']){
    const f=settingsDataFixture();let input=backup({orders:[order('a'),order('b')]});
    if(kind==='collision')f.docs.set('orders/b',{id:'b',companyId:'foreign',total:999});
    if(kind==='foreign-row')input.collections.orders[1].companyId='unrelated-tenant';
    if(kind==='authority')input=backup({companies:[{id:'target',name:'Attack',ownerId:'attacker'}],orders:[{id:'a',companyId:'target',total:1}]},'target');
    await assert.rejects(f.restore(input,metadata(kind)));assert.equal(f.businessWrites.length,0);
  }
});

test('existing locked payroll may be identical but cannot be changed or freshly forged',async()=>{
  const locked={id:'lock',companyId:'target',status:'locked',closingBalance:809666};
  const f=settingsDataFixture();f.docs.set('payrollSnapshots/lock',structuredClone(locked));
  await f.restore(backup({payrollSnapshots:[{...locked,companyId:'source'}]}),metadata('same-locked'));
  assert.deepEqual(f.docs.get('payrollSnapshots/lock'),locked);assert.equal(f.businessWrites.length,0);
  for(const row of [{...locked,closingBalance:0},{...locked,id:'forged-lock'}]){
    const g=settingsDataFixture();g.docs.set('payrollSnapshots/lock',structuredClone(locked));
    await assert.rejects(g.restore(backup({orders:[order('a')],payrollSnapshots:[{...row,companyId:'source'}]}),metadata('locked')),{code:'settings_data_protected'});
    assert.equal(g.businessWrites.length,0);
  }
});

test('restore partial-prefix retry skips confirmed chunks and preserves later edits to that prefix',async()=>{
  const f=settingsDataFixture({chunkSize:2}),input=backup({orders:[order('a'),order('b'),order('c')]}),options=metadata('prefix');
  f.flags.failChunk=2;await assert.rejects(f.restore(input,options),error=>error.confirmedChunks===1);
  f.docs.get('orders/a').total=777;f.flags.failChunk=0;
  const receipt=await f.restore(input,options);assert.equal(receipt.confirmed,true);assert.equal(f.docs.get('orders/a').total,777);assert.equal(f.docs.get('orders/c').total,100);
  const before=structuredClone([...f.docs]);assert.equal((await f.restore(input,options)).replay,true);assert.deepEqual([...f.docs],before);
});

test('server revision changes after preflight conflict atomically instead of overwriting live data',async()=>{
  const f=settingsDataFixture();f.docs.set('orders/a',{id:'a',companyId:'target',total:50});
  f.flags.onPrepared=()=>{f.docs.get('orders/a').total=999;};
  await assert.rejects(f.restore(backup({orders:[order('a')]}),metadata('race')),{code:'settings_data_conflict'});
  assert.equal(f.docs.get('orders/a').total,999);assert.equal(f.businessWrites.length,0);
});

test('reset scans only server tenant data; scan failures and stale local foreign IDs cannot authorize deletion',async()=>{
  const f=settingsDataFixture();f.env.products=[{id:'foreign',companyId:'target'}];
  f.docs.set('products/foreign',{id:'foreign',companyId:'foreign',name:'Do not delete'});f.flags.scanFail=true;
  await assert.rejects(f.reset(['products'],metadata('scan')),/Server scan failed/);assert.equal(f.businessWrites.length,0);assert.ok(f.docs.has('products/foreign'));
  f.flags.scanFail=false;f.docs.set('products/own',{id:'wrong-payload-id',companyId:'target',name:'Delete server ID'});
  await f.reset(['products'],metadata('own'));assert.ok(f.docs.has('products/foreign'));assert.equal(f.docs.has('products/own'),false);
  for(const request of f.scans)assert.deepEqual(request.filter,['companyId','==','target']);
});

test('reset retries its durable original target list and never deletes a recreated confirmed-prefix document',async()=>{
  const f=settingsDataFixture({chunkSize:2});for(const id of ['a','b','c'])f.docs.set('products/'+id,{id,companyId:'target'});
  const options=metadata('reset-prefix');f.flags.failChunk=2;await assert.rejects(f.reset(['products'],options),error=>error.confirmedChunks===1);
  f.docs.set('products/a',{id:'a',companyId:'target',name:'Recreated later'});f.flags.failChunk=0;
  assert.equal((await f.reset(['products'],options)).confirmed,true);assert.equal(f.docs.get('products/a').name,'Recreated later');assert.equal(f.docs.has('products/c'),false);
  const before=structuredClone([...f.docs]);assert.equal((await f.reset(['products'],options)).replay,true);assert.deepEqual([...f.docs],before);
  await assert.rejects(f.reset(['orders'],options),{code:'settings_command_conflict'});
});

test('restore/reset require live catalog grants and stable scope; unknown scopes and invalid dates never mutate',async()=>{
  const actor={id:'staff',companyId:'target',role:'employee',position:'Tài xế'};
  for(const action of ['restore','reset']){
    const f=settingsDataFixture({actor});
    await assert.rejects(action==='restore'?f.restore(backup({orders:[order('a')]}),metadata('no-right')):f.reset(['products'],metadata('no-right')),{code:'permission-denied'});
    assert.equal(f.businessWrites.length,0);
  }
  const f=settingsDataFixture();f.env.readOwnerRef.current='other';await assert.rejects(f.restore(backup({orders:[order('a')]}),metadata('scope')),{code:'settings_scope_changed'});
  const g=settingsDataFixture();for(const scopes of [['unknown'],false])await assert.rejects(g.reset(scopes,metadata('scope')));
  for(const dateFrom of ['2026-02-30','nonsense'])await assert.rejects(g.reset(['products'],{...metadata('date'),dateFrom}));assert.equal(g.businessWrites.length,0);
});

test('salary percent parser accepts decimal commas and boundaries and rejects minus, overflow and trailing junk',()=>{
  const parse=settingsAppFunction('parseSalaryAdvancePercentSettingInput');
  for(const[value,percent]of [[0,0],[100,100],['2,5',2.5],['',null],[null,null]])assert.deepEqual(parse(value),{isUnlimited:percent===null,percent,invalid:false});
  for(const value of [-5,150,Infinity,NaN,'-0','10abc','1e2','2.5.1','50%'])assert.equal(parse(value).invalid,true,String(value));
});

test('reset links expenses using tenant-scoped server records and never cached foreign links',async()=>{
  const f=settingsDataFixture();f.docs.set('warehouseImports/import',{id:'import',companyId:'target'});
  f.docs.set('expenses/own',{id:'own',companyId:'target',sourceWarehouseImportId:'import',amount:10});
  f.docs.set('expenses/foreign',{id:'foreign',companyId:'foreign',sourceWarehouseImportId:'import',amount:999});
  f.env.expenses=[{id:'foreign',companyId:'target',sourceWarehouseImportId:'import'}];
  await f.reset(['warehouseImports'],metadata('links'));
  assert.equal(f.docs.has('warehouseImports/import'),false);assert.equal(f.docs.has('expenses/own'),false);assert.ok(f.docs.has('expenses/foreign'));
});

test('live restore permission revocation and scope change after business ACK cannot report success',async()=>{
  const actor={id:'staff',companyId:'target',role:'employee',position:'Kế toán'};
  const company={employeeRolePermissions:{staff:{settings:true}},employeeRolePermissionActions:{staff:{settings:{restore_data:true,backup_restore_data:false}}}};
  const f=settingsDataFixture({actor,company});f.docs.get('companies/target').employeeRolePermissionActions.staff.settings.restore_data=false;
  await assert.rejects(f.restore(backup({orders:[order('a')]}),metadata('revoked')),{code:'permission-denied'});assert.equal(f.businessWrites.length,0);
  const g=settingsDataFixture();g.flags.hold=true;let success=false;
  const pending=g.restore(backup({orders:[order('a')]}),metadata('late')).then(result=>{success=true;return result;});
  const rejection=assert.rejects(pending,{code:'settings_scope_changed'});
  for(let index=0;index<100&&!g.acks.length;index++)await new Promise(resolve=>setTimeout(resolve,1));
  assert.equal(g.acks.length,1);g.env.readOwnerRef.current='other';g.acks[0]();await rejection;assert.equal(success,false);
});
