import assert from 'node:assert/strict';
import {appExpression,appFunction} from './app-source-function.mjs';
import {normalizePricingMarginByProduct} from '../../src/utils/pricingProductMargins.js';
import {assertPricingLossStandards} from '../../src/utils/pricingLossValidation.js';
import * as assetIntegrity from '../../src/utils/assetMutationIntegrity.js';
import {ATOMIC_SAVE_COLLECTION,commitAtomicWrites,validateAtomicWrites} from '../../src/utils/atomicSave.js';
import {isRetryableWriteError} from '../../src/utils/pendingWriteRetry.js';
import {roleDomain} from '../../development/hd-manager/application/tests/helpers/role-permission-domain.mjs';

// Pure current App declarations, in their actual dependency order. No copied
// pricing formula or UI/network module enters this isolated handler harness.
const pricingNames=['parseLooseQuantityValue','parseLooseMoneyValue','viNumberFormatter','formatCurrency','formatPricingVnd',
 'LOOKUP_NORMALIZATION_MAX_LENGTH','LOOKUP_NORMALIZATION_CACHE_LIMIT','lookupNormalizationCache','normalizeLookupText',
 'PRICING_LOSS_GROUP_PRESETS','PRICING_CUT_PART_GROUP_PRESETS','createPricingMarginByGroupDefaults',
 'createPricingCutPartGroupDefaults','createPricingLossStageGroupDefaults','createDefaultPricingRuleDraft',
 'normalizePricingLossStageDrafts','normalizePricingLossStageGroups','normalizePricingCutPartDrafts','normalizePricingCutPartGroups',
 'normalizePricingProductFormulaChildren','normalizePricingProductFormulas','normalizePricingMarginByGroup',
 'normalizeTodayInputPriceOverrides','normalizePricingRuleDraft','applyPricingInputWeightToLossStages',
 'pricingLossStageDraftsToRules','pricingCutPartDraftsToRules'];
export const pricingHelpers=Function('normalizePricingMarginByProduct',pricingNames.map(name=>`const ${name}=(${appExpression(name)});`).join('\n')
 +`\nreturn {${pricingNames.join(',')}};`)(normalizePricingMarginByProduct);

export function pricingDraftContext(savedRules={targetMargin:60}){
 const guard={current:null},rulesDraftRef={current:pricingHelpers.normalizePricingRuleDraft(savedRules)};
 const lossStageGroupsDraftRef={current:pricingHelpers.normalizePricingLossStageGroups(rulesDraftRef.current.lossStageGroups,rulesDraftRef.current.lossStages)};
 const cutPartGroupsDraftRef={current:pricingHelpers.normalizePricingCutPartGroups(rulesDraftRef.current.cutPartGroups,rulesDraftRef.current.cutParts)};
 const env={...pricingHelpers,assertPricingLossStandards,rulesDraftRef,lossStageGroupsDraftRef,cutPartGroupsDraftRef,
  activeLossGroupKeyRef:{current:'duck'},EMPTY_PRICING_DRAFT_ROWS:Object.freeze([]),
  pricingSaveContextRef:{current:{pricingGroupRows:[],latestWarehouseInputsByGroup:{}}},pricingDraftRevisionRef:guard,
  savedRules:pricingHelpers.normalizePricingRuleDraft(savedRules),setActiveLossGroupKey(){},replaceRulesDraftState(){},replaceLossStageGroupsDraftState(){},replaceCutPartGroupsDraftState(){}};
 for(const name of ['replaceRulesDraft','replaceLossStageGroupsDraft','replaceCutPartGroupsDraft','setRulesDraft','buildPricingRulesFromDrafts']){
  env[name]=appFunction(name,env,{scope:'SimplePricingEngineView',memoCallback:true});
 }
 env.buildCurrentPricingRulesForSave=appFunction('buildCurrentPricingRulesForSave',env,{scope:'SimplePricingEngineView'});
 env.hydrate=appFunction('syncPricingDraftFromSavedRules',env,{scope:'SimplePricingEngineView'});
 return {env,guard,rulesDraftRef};
}

export function assetSaveContext(){
 const actor={id:'e',companyId:'a',role:'owner',position:'Chủ doanh nghiệp'},asset={id:'truck',companyId:'a',name:'Truck'};
 const documents=new Map([['assets/truck',asset]]),commands=[],acks=[];
 const env={...assetIntegrity,firebaseUser:{uid:'u'},myCompanyId:'a',currentCompany:{id:'a'},currentUser:actor,appCurrentEmployee:actor,
  rawAssets:[structuredClone(asset)],rawAssetCostLogs:[],rawExpenses:[],readOwnerKey:'read-a',readOwnerRef:{current:'read-a'},activeTenantScopeRef:{current:'a'},
  hasCompanyRolePermissionAction:roleDomain.hasCompanyRolePermissionAction,getDeliveryAssignmentIds:appFunction('getDeliveryAssignmentIds'),
  getAssetDisplayLabel:row=>row.name,getAssetCostTypeLabel:value=>value==='fuel'?'Đổ xăng/dầu':value,
  normalizeExpenseCategoryLabel:value=>value,ATOMIC_SAVE_COLLECTION,isRetryableWriteError,withTimeout:promise=>promise,
  saveAtomicDocuments:(key,writes)=>{validateAtomicWrites(writes,'a');commands.push({key,writes});return {queued:true,companyId:'a'};},
  flushPendingFirebaseWriteNow:(...args)=>new Promise((resolve,reject)=>acks.push({args,resolve,reject}))};
 env.requireSharedWriteConfirmation=appFunction('requireSharedWriteConfirmation',env);
 const refresh=()=>{
  for(const [field,collection]of [['rawAssets','assets'],['rawAssetCostLogs','assetCostLogs'],['rawExpenses','expenses']]){
   env[field]=[...documents.entries()].filter(([key])=>key.startsWith(collection+'/')).map(([,value])=>structuredClone(value));
  }
 };
 const ready=async index=>{
  const deadline=Date.now()+5000;
  while((!commands[index]||!acks[index])&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,1));
  assert.ok(commands[index],`Expected planned command ${index}`);assert.ok(acks[index],`Expected exact ACK wait ${index}`);
 };
 const confirm=async index=>{
  await ready(index);const staged=[];
  const receipt=await commitAtomicWrites({writes:commands[index].writes,companyId:'a',reference:write=>`${write.collectionName}/${write.documentId}`,
   transaction:async callback=>{const result=await callback({get:async key=>({exists:()=>documents.has(key),data:()=>structuredClone(documents.get(key))}),
    set:(key,payload)=>staged.push([key,structuredClone(payload)])});
    for(const [key,payload]of staged)documents.set(key,{...documents.get(key),...payload});return result;}});
  acks[index].resolve(receipt);return receipt;
 };
 return {env,documents,commands,acks,refresh,ready,confirm,call:(name,...args)=>appFunction(name,env)(...args)};
}
