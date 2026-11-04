import fs from 'node:fs/promises';
import {makeRichSyntheticFixture} from '../performance/upgrade-20261103/rich-synthetic-fixture.mjs';
const root='test-results/performance-upgrade-20261103',original=JSON.parse(await fs.readFile(root+'/home-model-business-source-unchanged.json'));
const ab=JSON.parse(await fs.readFile(root+'/home-model-native-ab-v13-40-completed.json'));
if(original.status!=='MISMATCH_NOT_PASS'||original.collections.filter(row=>!row.equal).map(row=>row.collection).join()!=='bankTransactions')throw Error('Unexpected mismatch requires review');
const expected=makeRichSyntheticFixture().data.bankTransactions;
function decode(f){if('stringValue'in f)return f.stringValue;if('integerValue'in f)return Number(f.integerValue);if('doubleValue'in f)return f.doubleValue;if('booleanValue'in f)return f.booleanValue;if('nullValue'in f)return null;throw Error('Unexpected bank field shape')}
const response=await fetch('http://127.0.0.1:8185/v1/projects/demo-hdm-perf-verification/databases/(default)/documents/artifacts/verification-fixture/public/data:runQuery',
 {method:'POST',redirect:'error',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({structuredQuery:{from:[{collectionId:'bankTransactions'}]}}),signal:AbortSignal.timeout(5000)});
if(!response.ok)throw Error('Fictional bank inspection failed');
const records=(await response.json()).filter(row=>row.document).map(({document})=>{
 const id=document.name.split('/').at(-1),actual=Object.fromEntries(Object.entries(document.fields||{}).map(([k,v])=>[k,decode(v)])),baseline=expected[id];
 const added=Object.keys(actual).filter(k=>!Object.hasOwn(baseline||{},k));
 const fieldsEqual=baseline&&Object.entries(baseline).every(([key,value])=>Object.is(actual[key],value));
 const oldMetadata=added.every(key=>['autoReconcileCheckedAt','autoReconcileStatus'].includes(key))
  &&actual.autoReconcileStatus==='no_order_code_match'&&Number.isFinite(Date.parse(actual.autoReconcileCheckedAt))
  &&Date.parse(document.updateTime)<Date.parse(ab.at)&&Date.parse(actual.autoReconcileCheckedAt)<Date.parse(ab.at);
 return{id,fieldsEqual:Boolean(fieldsEqual),addedFields:added,authoritativeUpdateTime:document.updateTime,metadataCheckedAt:actual.autoReconcileCheckedAt,metadataPredatesControlledAB:oldMetadata};
});
const ok=records.length===100&&records.every(row=>row.fieldsEqual&&row.metadataPredatesControlledAB);
const report={at:new Date().toISOString(),status:ok?'ORIGINAL_BUSINESS_VALUES_PRESERVED_WITH_PREEXISTING_BANK_METADATA':'REVIEW_REQUIRED_NOT_PASS',readOnly:true,productionRequests:0,
 originalMismatchPreserved:root+'/home-model-business-source-unchanged.json',controlledABStartedAt:ab.at,unchangedOriginalCollections:original.collections.filter(row=>row.equal).length,
 originalDocumentCount:original.collections.reduce((n,row)=>n+row.actualCount,0),bankRecords:records,
 qualification:'The original strict whole-document comparison is NOT relabelled PASS. All original bank fields (including amounts and payment links) match; the only added fields are reconciliation metadata with authoritative update times before controlled A/B. Other original seeded collection digests match exactly. Unseeded collections and production data are outside this check.'};
await fs.writeFile(root+'/home-model-business-integrity-qualified.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,documents:report.originalDocumentCount,bankCount:records.length,bankUpdateMin:records.map(x=>x.authoritativeUpdateTime).sort()[0],bankUpdateMax:records.map(x=>x.authoritativeUpdateTime).sort().at(-1)}));if(!ok)throw Error('Unexpected bank mutation');
