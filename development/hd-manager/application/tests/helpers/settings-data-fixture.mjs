import {readFileSync} from 'node:fs';
import {parse} from '@babel/parser';
import * as integrity from '../../src/utils/settingsMutationIntegrity.js';
import * as data from '../../src/utils/settingsDataIntegrity.js';
import {hasCompanyRolePermissionAction} from '../../src/features/payroll/payrollOriginalDomain.js';

const source=readFileSync(new URL('../../src/App.jsx',import.meta.url),'utf8'),nodes=new Map();
function walk(node){
  if(!node||typeof node!=='object')return;
  if(node.type==='VariableDeclarator'&&node.id?.name)nodes.set(node.id.name,node.init);
  for(const[key,value]of Object.entries(node)){
    if(['loc','comments','extra'].includes(key))continue;
    if(Array.isArray(value))value.forEach(walk);else if(value?.type)walk(value);
  }
}
walk(parse(source,{sourceType:'module',plugins:['jsx']}));
export function settingsAppFunction(name,env={}){
  const node=nodes.get(name);if(!node)throw Error('Missing actual settings source: '+name);
  return Function(...Object.keys(env),`return (${source.slice(node.start,node.end)});`)(...Object.values(env));
}
export const settingsCollections=settingsAppFunction('DATA_COLLECTION_NAMES').filter(name=>name!=='companies');
export const settingsResetScopes=settingsAppFunction('RESET_DATA_SCOPE_OPTIONS');
const normalizeResetDateKey=settingsAppFunction('normalizeResetDateKey');
const getResetRecordDateKey=settingsAppFunction('getResetRecordDateKey',{normalizeResetDateKey});
const isResetRecordInDateRange=settingsAppFunction('isResetRecordInDateRange',{normalizeResetDateKey,getResetRecordDateKey});
const clone=value=>structuredClone(value);
export function settingsDataFixture({actor={id:'owner',companyId:'target',role:'owner',position:'Chủ doanh nghiệp'},company={},chunkSize=80}={}){
  const base={id:'target',name:'Current',ownerId:'original-owner',...company};
  const docs=new Map([['companies/target',clone(base)],['employees/'+actor.id,clone(actor)]]),businessWrites=[],scans=[],acks=[];
  const flags={scanFail:false,scanForeign:false,failChunk:0,businessChunks:0,lostAck:false,hold:false,onPrepared:null};
  const env={...integrity,...data,firebaseUser:{uid:actor.id},myCompanyId:'target',currentCompany:clone(base),appCurrentEmployee:actor,currentUser:actor,
    readOwnerKey:'owner-scope',readOwnerRef:{current:'owner-scope'},activeTenantScopeRef:{current:'target'},db:{},appId:'settings-data-only',
    hasCompanyRolePermissionAction,BACKUP_DATA_COLLECTIONS:settingsCollections,RESET_DATA_SCOPE_OPTIONS:settingsResetScopes,
    normalizeResetDateKey,isResetRecordInDateRange,doc:(_db,...path)=>path.slice(-2).join('/'),collection:(_db,...path)=>path.at(-1),
    firebaseWhere:(...args)=>args,firebaseQuery:(name,filter)=>({name,filter}),
    firebaseGetDocFromServer:async ref=>({exists:()=>docs.has(ref),data:()=>clone(docs.get(ref))}),
    firebaseGetDocsFromServer:async request=>{
      scans.push(clone(request));if(flags.scanFail)throw Error('Server scan failed');
      const rows=[...docs].filter(([key,row])=>key.startsWith(request.name+'/')&&(flags.scanForeign||row.companyId===request.filter[2]));
      return {forEach:callback=>rows.forEach(([key,row])=>callback({id:key.slice(request.name.length+1),data:()=>clone(row)}))};
    },
    runTransaction:async(_db,callback)=>{
      const staged=[];
      const result=await callback({get:async ref=>({exists:()=>docs.has(ref),data:()=>clone(docs.get(ref))}),
        set:(ref,payload,options)=>staged.push([ref,options?.merge?{...docs.get(ref),...clone(payload)}:clone(payload)]),
        update:(ref,patch)=>staged.push([ref,{...docs.get(ref),...clone(patch)}]),delete:ref=>staged.push([ref,null])});
      const business=staged.filter(([ref])=>!ref.startsWith('companyDataCommands/'));
      if(business.length){flags.businessChunks++;if(flags.failChunk===flags.businessChunks)throw Error('Business chunk rejected');}
      for(const[ref,payload]of staged){if(payload===null)docs.delete(ref);else docs.set(ref,payload);}
      businessWrites.push(...clone(business));
      if(staged.some(([ref,payload])=>ref.startsWith('companyDataCommands/')&&!ref.includes('__part_')&&payload.status==='prepared'))flags.onPrepared?.();
      if(business.length&&flags.lostAck)throw Error('Lost business ACK');
      if(business.length&&flags.hold)await new Promise(resolve=>acks.push(resolve));
      return result;
    },
    commitSettingsDataCommand:args=>data.commitSettingsDataCommand({...args,chunkSize})};
  return {docs,flags,env,scans,businessWrites,acks,
    restore:(payload,options)=>settingsAppFunction('handleRestoreCompanyBackup',env)(payload,options),
    reset:(scopes,options)=>settingsAppFunction('handleResetCompanyDemoData',env)(scopes,options)};
}
