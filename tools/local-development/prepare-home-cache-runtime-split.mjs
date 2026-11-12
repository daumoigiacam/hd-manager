import fs from 'node:fs/promises';
import path from 'node:path';
import {workspace} from './environment.mjs';
const root=path.join(workspace,'development/hd-manager/application');
const read=f=>fs.readFile(path.join(workspace,f),'utf8');
const completed=JSON.parse(await read('.local-dev/runtime/dev34-final50-verification.json'));
if(completed.status!=='COMPLETED_MEASURED_NOT_AUTOMATIC_ACCEPTANCE')throw Error('Finish dev34 measurement first');
const backup=path.join(workspace,'.local-dev/source-backups/home-cache-dev34-rollback');
await fs.mkdir(backup,{recursive:true});
const file=path.join(root,'src/data/bootstrapOfflineCustomer.js');
await fs.copyFile(file,path.join(backup,'bootstrapOfflineCustomer.js'));
// Restore the pre-foreground-yield bootstrap; this experiment changes only
// when existing runtime factory CODE is loaded, not encryption or ownership.
let source=await read('.local-dev/source-backups/home-cache-dev33-rollback/src/data/bootstrapOfflineCustomer.js');
const factories=['createOfflineCoreQueueFacade','createCustomerDeltaCoordinator','createOfflineCustomerRepository','createOfflineSyncEngine','registerOfflineCustomerWriter','createCustomerPageCoordinator','createOfflineCustomerHistoryRepository','createSQLiteDirectoryReadMemo'];
const exports=[];
for(const name of factories){
 const regex=new RegExp("^import \\{"+name+"\\} from '([^']+)';\\r?\\n",'m');
 const match=source.match(regex);if(!match)throw Error('Expected static factory '+name);
 exports.push('export {'+name+"} from '"+match[1]+"';");source=source.replace(regex,'');
}
const marker=" try{\n  if(!readLease";
// Normalize this one edited file before building; never normalize a measured build.
source=source.replace(/\r\n/g,'\n');
if(!source.includes(marker))throw Error('Expected protected runtime initialization boundary');
source=source.replace(marker," try{\n  // Existing factories initialize only after the authenticated database opens.\n  // Signed session/cache access never imports customer mutation/sync machinery.\n  const {"+factories.join(',')+"}=await import('./offlineCustomerRuntimeFactories.js');\n  if(!readLease");
await fs.writeFile(file,source);
await fs.writeFile(path.join(root,'src/data/offlineCustomerRuntimeFactories.js'),exports.join('\n')+'\n');
const buildFile=path.join(workspace,'tools/local-development/build-android.mjs');
await fs.copyFile(buildFile,path.join(backup,'build-android.mjs'));
await fs.writeFile(buildFile,(await fs.readFile(buildFile,'utf8')).replaceAll('1.0.12-local-dev.34','1.0.12-local-dev.35').replaceAll('26111144','26111145'));
console.log(JSON.stringify({status:'SOURCE_PREPARED_NOT_MEASURED',version:'dev35',factoryCount:factories.length,securityChanged:false,newRuntime:false,newDatabase:false}));
