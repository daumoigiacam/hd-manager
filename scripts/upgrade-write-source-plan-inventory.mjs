import fs from'node:fs/promises';import{parse}from'@babel/parser';
import{COMPANY_HOME_PRIMARY_COLLECTIONS,PERSONAL_HOME_COLLECTIONS}from'../src/services/homeDataContract.js';
const file='src/App.jsx',source=await fs.readFile(file,'utf8'),tree=parse(source,{sourceType:'module',plugins:['jsx']}),declarations=new Map(),reads=[];
function walk(node,owner='App module'){
 if(!node||typeof node!=='object')return;
 if(node.type==='VariableDeclarator'&&node.id.type==='Identifier'){
  declarations.set(node.id.name,node.init);
  if(['ArrowFunctionExpression','FunctionExpression'].includes(node.init?.type))owner=node.id.name;
 }
 if(['FunctionDeclaration','FunctionExpression'].includes(node.type)&&node.id)owner=node.id.name;
 if(node.type==='CallExpression'&&node.callee.type==='Identifier'&&['getDoc','getDocs','onSnapshot','getDocFromServer','getDocsFromServer'].includes(node.callee.name))reads.push({file,line:node.loc.start.line,api:node.callee.name,owner});
 for(const[key,value]of Object.entries(node)){if(['loc','comments','extra'].includes(key))continue;if(Array.isArray(value))value.forEach(child=>walk(child,owner));else if(value?.type)walk(value,owner)}
}
walk(tree);
function literal(n){if(n.type==='StringLiteral'||n.type==='NumericLiteral'||n.type==='BooleanLiteral')return n.value;if(n.type==='ArrayExpression')return n.elements.map(literal);if(n.type==='ObjectExpression')return Object.fromEntries(n.properties.map(p=>[p.key.name||p.key.value,literal(p.value)]));if(n.type==='CallExpression'&&n.callee.object?.name==='Object'&&n.callee.property.name==='freeze')return literal(n.arguments[0]);throw Error('Nonliteral source declaration');}
const plans=literal(declarations.get('FOREGROUND_REALTIME_COLLECTIONS_BY_TAB'));
const report={at:new Date().toISOString(),source:file,status:'AUDITED_NOT_UNIFIED_ROLLOUT',baseline:literal(declarations.get('BASELINE_REALTIME_COLLECTION_NAMES')),
 owner:'Existing App authenticated collection owner → bounded SDK/worker listeners or whole-history REST fallback; no second query cache introduced.',
 primaryHome:{flag:'VITE_HOME_PRIORITY_DATA=true (local QA only)',collections:COMPANY_HOME_PRIMARY_COLLECTIONS,secondary:'Existing full executive_dashboard plan only on explicit details/AI action.',nativeLiveLimit:7,personalHome:PERSONAL_HOME_COLLECTIONS},
 modules:Object.entries(plans).map(([module,collections])=>({module,collections,readOwner:'existing App scope',instantDataEngineIntegration:false,wholeHistorySdkQuery:module!=='messages',serverCursorUiPages:false,status:module==='home'?'PRIMARY_PLAN_OPT_IN_UNDER_VERIFICATION':'ROLLOUT_HELD_UNTIL_HOME_PROOF'})),
 directSdkReadSites:reads,
 limits:['This inventories declared source plans and direct App SDK call sites, not every possible side effect of external services.','Whole-history REST uses cursor pages for correct bounded transport; collecting every page still loads the full matching history and is not UI-demand pagination.','The isolated firestorePageTransport/instantDataEngine cursor implementation is tested but has no operational App-list integration. Do not mount it alongside the current owner and create duplicate listeners.','Locked-payroll snapshots, identity and backup have distinct direct read boundaries; their full owner/cancellation audit remains required.','P0 permission/authentication and P1 financial completeness cannot be skipped to meet a stopwatch target.']};
const out='performance/upgrade-20261103/reports/five-engines/source-plan-inventory.json';await fs.writeFile(out,JSON.stringify(report,null,2));console.log(JSON.stringify({modules:report.modules.length,directSdkReadSites:reads.length,out}));
