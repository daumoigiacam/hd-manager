import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const HOME_READ_MODEL_PILOT_PROJECT='demo-hdm-perf-verification';
const branch='return props.primaryMode ? <PriorityExecutiveDashboardView {...props}/> : <FullExecutiveDashboardView {...props}/>;';
const plan="if(tab==='home'&&companyHome&&primaryHome&&!detailsRequested)return COMPANY_HOME_PRIMARY_COLLECTIONS;";
const replaceOnce=(source,needle,replacement)=>{
 if(source.split(needle).length!==2)throw Error('Local Home pilot source contract changed: '+needle);
 return source.replace(needle,replacement);
};

// Main explicitly installs this in its fictional QA build. No environment flag
// alone activates it, and neither the App file nor the production plan is edited.
export function createHomeReadModelPilotPlugin({enabled=false,fixtureOnly=false,projectId,receipts=[]}={}){
 if(enabled&&(!fixtureOnly||projectId!==HOME_READ_MODEL_PILOT_PROJECT))throw Error('Local Home pilot requires the explicit fictional QA project');
 const root=fileURLToPath(new URL('../../',import.meta.url));
 const app=path.resolve(root,'src/App.jsx').replaceAll('\\','/');
 const contract=path.resolve(root,'src/services/homeDataContract.js').replaceAll('\\','/');
 const view=path.resolve(root,'performance/upgrade-20261103/pilots/LocalHomeReadModelView.jsx').replaceAll('\\','/');
 const transformed=new Set();
 return {name:'hd-local-home-read-model-pilot',enforce:'pre',apply:'build',
  configResolved(config){if(enabled&&(config.command!=='build'||config.mode!=='emulator'))throw Error('Local Home pilot requires an emulator QA build')},
  transformIndexHtml(html){return enabled?{html,tags:[{tag:'script',children:'window.__hdLocalHomeReadModelPilot=true;',injectTo:'head-prepend'}]}:null},
  transform(source,id){
   if(!enabled)return null;
   const file=id.split('?')[0].replaceAll('\\','/');
   if(file===app){
    const code=replaceOnce(source,branch,'return props.primaryMode ? <LocalHomeReadModelView {...props}/> : <FullExecutiveDashboardView {...props}/>;');
    transformed.add('view');receipts.push({kind:'local-home-read-model-view',file});return {code:`import LocalHomeReadModelView from ${JSON.stringify(view)};\n${code}`,map:null};
   }
   if(file===contract){
    const code=replaceOnce(source,plan,"if(tab==='home'&&companyHome&&primaryHome)return empty;");
    transformed.add('plan');receipts.push({kind:'local-home-read-model-plan',file});return {code,map:null};
   }
   return null;
  },
  buildEnd(error){if(enabled&&!error&&(!transformed.has('view')||!transformed.has('plan')))throw Error('Local Home pilot requires both view and read-plan transforms')},
 };
}

// Verification builder owns the explicit flag and after-home-model-* cohort.
export function homeReadModelPilotPlugin({enabled=false,project,receipts=[]}={}){
 return createHomeReadModelPilotPlugin({enabled,fixtureOnly:enabled,projectId:project,receipts});
}
