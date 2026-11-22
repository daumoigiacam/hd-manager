import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {parse} from '@babel/parser';
import {transformSync} from 'esbuild';
import * as icons from 'lucide-react';
import {hooks, nodes} from './helpers/react-hook-frame.mjs';
import {updateAssetCostDraft} from '../src/utils/assetCostDraft.js';
import {parseAssetNumber} from '../src/utils/assetMutationIntegrity.js';
import * as model from '../src/features/assets/assetManagementModel.js';

const require=createRequire(import.meta.url);
function compile(relative,name,captureNames,environment) {
  const source=fs.readFileSync(new URL(relative,import.meta.url),'utf8');
  const tree=parse(source,{sourceType:'module',plugins:['jsx']});
  const declarations=new Map();
  function visit(node){if(!node||typeof node!=='object')return;
    if(node.type==='FunctionDeclaration')declarations.set(node.id.name,node);
    if(node.type==='VariableDeclarator'&&node.id?.name)declarations.set(node.id.name,node.init);
    for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value?.type)visit(value);
  }visit(tree);
  const n=declarations.get(name);assert.ok(n,name);
  let code=source.slice(n.start,n.end);
  if(captureNames){const ret=n.body.body.findLast(row=>row.type==='ReturnStatement');
    code=source.slice(n.start,ret.start)+`capture({${captureNames}});\n`+source.slice(ret.start,n.end);}
  else if(n.type!=='FunctionDeclaration')code=`const ${name} = ${code};`;
  const bindings=Object.entries(environment).filter(([key])=>/^[A-Za-z_$][\w$]*$/.test(key)&&key!=='default');
  return Function('require',...bindings.map(([key])=>key),`${transformSync(code,{loader:'jsx',jsx:'automatic',format:'cjs'}).code};return ${name};`)(require,...bindings.map(([,value])=>value));
}
const app='../src/App.jsx',workspace='../src/features/assets/AssetManagementWorkspace.jsx';
const asset={id:'asset-qa',companyId:'qa',name:'QA truck',type:'Xe tải',updatedAt:'2026-11-22T00:00:00Z',assignedDriverIds:[],status:'active'};
function frameFixture(name,source,extra={}) {
  const frame=hooks(),f={};
  const env={...frame,...icons,...model,updateAssetCostDraft,parseAssetNumber,
    useModalScrollLock(){},useAppScreenBack(){},projectAssetExpenses:logs=>logs,isCashflowOfficial:()=>true,
    getAssetMetrics:()=>({fuelCost:0,maintenanceCost:0,totalKm:0,totalCost:0,driverScore:100}),
    isEmployeeDeliveryParticipant:()=>false,getAssetEmployeeNames:()=>'',getPrimaryDeliveryAssignmentId:()=>'',getDeliveryAssignmentIds:row=>row.assignedDriverIds||[],
    getAssetCostTypeLabel:value=>value,getAssetStatusLabel:value=>value,getAssetEmployeeName:()=>'',
    formatCurrency:String,getTodayString:()=> '2026-11-22',parseLooseMoneyValue:Number,parseLooseQuantityValue:Number,
    getFriendlyFirebaseErrorMessage:error=>error.message,window:{confirm:()=>true},AssetManagementWorkspace:()=>null,
    getAssetIcon:()=>icons.Truck,AssetImage:()=>null,StatusBadge:()=>null,DetailTabs:()=>null,
    OverviewTab:()=>null,CostsTab:()=>null,MaintenanceTab:()=>null,DocumentsTab:()=>null,HistoryTab:()=>null,
    capture:api=>{f.api=api;},formatDate:String,...extra};
  delete env.default;
  if(source===app)for(const helper of ['getAssetFormDefaults','getAssetCostFormDefaults'])env[helper]=compile(app,helper,'',env);
  const names=source===app?'openAssetForm,closeAssetForm,openCostForm,closeCostForm,handleAssetSubmit,handleAssetDelete,handleCostSubmit,handleCostDelete,setAssetForm,setCostForm,assetForm,costForm':
    'openDraft,closeDraft,saveMaintenance,saveDocument,setMaintenanceDraft,setDocumentDraft,maintenanceDraft,documentDraft';
  const View=compile(source,name,names,env);
  f.props=source===app?{employee:{id:'owner',companyId:'qa'},readIdentity:'session-qa',assets:[asset],
    canViewAssets:true,canCreateAsset:true,canEditAsset:true,canDeleteAsset:true,canCreateAssetCostLog:true,canEditAssetCostLog:true,canDeleteAssetCostLog:true,
    onAddAsset:async()=> 'asset-qa',onEditAsset:async()=>({success:true}),onDeleteAsset:async()=>({success:true}),
    onAddAssetCostLog:async()=> 'log-qa',onEditAssetCostLog:async()=>({success:true}),onDeleteAssetCostLog:async()=>({success:true})}:
    {asset,metrics:{},assetCostLogs:[],canEditAsset:true,canViewAssetCostLogs:true,canCreateAssetCostLog:true,canEditAssetCostLog:true,
      getAssigneeName:()=>'',getCostTypeLabel:String,formatCurrency:String,onUpdateAsset:async()=>({success:true})};
  f.render=()=>{let again,count=0;do{assert.ok(count++<12);frame.begin();f.tree=View(f.props);again=frame.commit();}while(again);return f.tree;};
  f.dialog=()=>nodes(f.tree,node=>node.props.role==='dialog')[0];f.unmount=()=>frame.unmount();f.render();return f;
}
const event={preventDefault(){}};

test('fuel totals follow changed litres/price while explicit invoice overrides and invalid inputs are preserved',()=>{
  const old={type:'fuel',liters:'2,5',unitPrice:'20.000',amount:50000};
  const next=updateAssetCostDraft(old,'unitPrice','22.000');assert.equal(next.amount,55000);
  assert.equal(updateAssetCostDraft(next,'liters','3').amount,66000);
  const manual=updateAssetCostDraft(next,'amount','53.000');assert.equal(updateAssetCostDraft(manual,'liters','4').amount,'53.000');
  assert.equal(updateAssetCostDraft({...old,amount:53000},'unitPrice','22000').amount,53000);
  const invalid=updateAssetCostDraft(old,'liters','-2.5');assert.equal(invalid.liters,'-2.5');assert.equal(invalid.amount,'');
  assert.equal(updateAssetCostDraft(old,'amount','-50000').amount,'-50000');
});

test('actual asset form locks duplicate submits, retains failed draft and retries the same entity/command',async()=>{
  const f=frameFixture('AssetManagementView',app);let reject;const calls=[];
  f.props.onAddAsset=data=>{calls.push(structuredClone(data));return new Promise((_,r)=>{reject=r;});};
  f.api.openAssetForm();f.render();f.api.setAssetForm(row=>({...row,name:'Retry asset'}));f.render();
  const first=f.api.handleAssetSubmit(event);await f.api.handleAssetSubmit(event);assert.equal(calls.length,1);
  f.api.closeAssetForm();f.render();assert.ok(f.dialog());assert.equal(nodes(f.tree,n=>n.type==='fieldset')[0].props.disabled,true);
  reject(Error('QA rejected'));await first;f.render();assert.equal(f.api.assetForm.name,'Retry asset');assert.ok(f.dialog());
  f.props.onAddAsset=async data=>{calls.push(structuredClone(data));return 'confirmed';};f.render();await f.api.handleAssetSubmit(event);f.render();
  assert.deepEqual(calls[1],calls[0]);assert.equal(f.dialog(),undefined);
});

test('actual cost form passes raw negative input to validation and retains rejected/queued drafts',async()=>{
  for(const result of [false,{queued:true},Error('invalid amount')]){
    const f=frameFixture('AssetManagementView',app);let captured;
    f.props.onAddAssetCostLog=async data=>{captured=data;if(result instanceof Error)throw result;return result;};
    f.api.openCostForm({assetId:asset.id});f.render();f.api.setCostForm(row=>({...row,amount:'-50000'}));f.render();
    await f.api.handleCostSubmit(event);f.render();assert.equal(captured.amount,'-50000');assert.equal(f.api.costForm.amount,'-50000');assert.ok(f.dialog());
  }
});

test('asset scope change clears drafts and late cost ACK cannot close or change the next company form',async()=>{
  const f=frameFixture('AssetManagementView',app);let finish;
  f.props.onAddAssetCostLog=()=>new Promise(r=>{finish=r;});f.api.openCostForm({assetId:asset.id});f.render();
  const pending=f.api.handleCostSubmit(event);f.props.readIdentity='different-session';f.render();assert.equal(f.dialog(),undefined);
  f.api.openCostForm({assetId:asset.id});f.render();f.api.setCostForm(row=>({...row,note:'Next session draft'}));f.render();
  finish('confirmed');await pending;f.render();assert.ok(f.dialog());assert.equal(f.api.costForm.note,'Next session draft');
});

test('actual permission revocation blocks cost and asset entry points, including delivery-owned logs',()=>{
  const f=frameFixture('AssetManagementView',app);f.props.canCreateAsset=false;f.props.canEditAsset=false;f.props.canCreateAssetCostLog=false;f.props.canEditAssetCostLog=false;f.render();
  f.api.openAssetForm();f.api.openAssetForm(asset);f.api.openCostForm();f.api.openCostForm({id:'cost'});f.render();assert.equal(f.dialog(),undefined);
  f.props.canEditAssetCostLog=true;f.render();f.api.openCostForm({id:'delivery',relatedDeliveryReportId:'dr'});f.render();assert.equal(f.dialog(),undefined);
});

test('maintenance and document forms await exact success, retain failures, prevent duplicate sends and keep revision/command',async()=>{
  for(const kind of ['maintenance','documents']){
    const f=frameFixture('AssetDetailScreen',workspace);let reject;const calls=[];
    f.props.onUpdateAsset=(...args)=>{calls.push(args);return new Promise((_,r)=>{reject=r;});};
    f.api.openDraft(kind);f.render();const setter=kind==='maintenance'?'setMaintenanceDraft':'setDocumentDraft';
    f.api[setter](row=>({...row,[kind==='maintenance'?'title':'type']:'Keep draft'}));f.render();
    const save=()=>f.api[kind==='maintenance'?'saveMaintenance':'saveDocument']();const pending=save();await save();assert.equal(calls.length,1);
    f.api.closeDraft();f.render();assert.ok(f.api.maintenanceDraft||f.api.documentDraft);
    reject(Error('CAS conflict'));await pending;f.render();assert.ok(f.api.maintenanceDraft||f.api.documentDraft);
    f.props.onUpdateAsset=async(...args)=>{calls.push(args);return {confirmed:true};};f.render();await save();f.render();
    assert.deepEqual(calls[1],calls[0]);assert.equal(calls[0][1].expectedAssetUpdatedAt,asset.updatedAt);
    assert.equal(f.api.maintenanceDraft,null);assert.equal(f.api.documentDraft,null);
  }
});

test('maintenance rejects negative kilometres before mutation and retains correction draft',async()=>{
  const f=frameFixture('AssetDetailScreen',workspace);let calls=0;f.props.onUpdateAsset=async()=>{calls++;};
  f.api.openDraft('maintenance');f.render();f.api.setMaintenanceDraft(row=>({...row,title:'Oil QA',dueKm:'-12000'}));f.render();
  await f.api.saveMaintenance();f.render();assert.equal(calls,0);assert.equal(f.api.maintenanceDraft.dueKm,'-12000');
  assert.ok(nodes(f.tree,n=>n.props.role==='alert').length);
});

test('cost rows enforce edit permission and delivery/finance ownership in the actual component',()=>{
  const frame=hooks(),env={...frame,Plus:icons.Plus,formatDate:String};
  const View=compile(workspace,'CostsTab','',env),logs=[{id:'a',assetId:asset.id,amount:100,type:'fuel'},
    {id:'b',assetId:asset.id,amount:200,type:'fuel',relatedDeliveryReportId:'dr'},
    {id:'c',assetId:asset.id,amount:300,financeProjection:true}];
  const render=canEdit=>{frame.begin();return View({asset,assetCostLogs:logs,formatCurrency:String,getCostTypeLabel:String,
    canViewAssetCostLogs:true,canCreateAssetCostLog:false,canEditAssetCostLog:canEdit,onEditCost(){}});};
  assert.ok(nodes(render(false),n=>n.type==='button').every(n=>n.props.disabled));
  const rows=nodes(render(true),n=>n.type==='button');assert.equal(rows[0].props.disabled,false);assert.equal(rows[1].props.disabled,true);assert.equal(rows[2].props.disabled,true);
});
