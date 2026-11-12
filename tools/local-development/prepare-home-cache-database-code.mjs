import fs from 'node:fs/promises';
import path from 'node:path';
import {workspace} from './environment.mjs';
const done=JSON.parse(await fs.readFile(path.join(workspace,'.local-dev/runtime/dev35-final50-verification.json'),'utf8'));
if(done.status!=='COMPLETED_MEASURED_NOT_AUTOMATIC_ACCEPTANCE')throw Error('Finish frozen dev35 measurement first');
const file=path.join(workspace,'development/hd-manager/application/src/data/nativeOfflineCustomerPlatform.js');
const backup=path.join(workspace,'.local-dev/source-backups/home-cache-dev35-rollback');await fs.mkdir(backup,{recursive:true});await fs.copyFile(file,path.join(backup,'nativeOfflineCustomerPlatform.js'));
let source=(await fs.readFile(file,'utf8')).replace(/\r\n/g,'\n');
for(const line of ["import {CapacitorSQLite,SQLiteConnection,SQLiteDBConnection} from '@capacitor-community/sqlite';", "import {openNativeOfflineDatabase} from './nativeOfflineDatabase.js';", "import schema from '../../performance/offline-first/schema-v1.sql?raw';"]){if(!source.includes(line))throw Error('Expected static import');source=source.replace(line+'\n','');}
source=source.replace(' let opening=null;',' let opening=null,CapacitorSQLite,SQLiteDBConnection,databaseCode=null;');
const old=' const sqlite=new SQLiteConnection(nativeTransport);';if(!source.includes(old))throw Error('Expected single SDK registry');
source=source.replace(old,` // One lazy JS registry, still backed by the same existing native SDK owner.
 // No schema/database code is needed to verify the signed encrypted session.
 const loadDatabaseCode=()=>databaseCode||(databaseCode=(async()=>{
  const finish=startupSpan('sqlite.code-load');
  const [sdk,native,{default:schema}]=await Promise.all([import('@capacitor-community/sqlite'),import('./nativeOfflineDatabase.js'),import('../../performance/offline-first/schema-v1.sql?raw')]);
  CapacitorSQLite=sdk.CapacitorSQLite;SQLiteDBConnection=sdk.SQLiteDBConnection;
  const sqlite=new sdk.SQLiteConnection(nativeTransport);finish();
  return{sqlite,openNativeOfflineDatabase:native.openNativeOfflineDatabase,schema};
 })().catch(error=>{databaseCode=null;throw error;}));`);
source=source.replace('if(packet)await CapacitorSQLite.closeConnection({database:packet.databaseName,readonly:false});','if(packet){await loadDatabaseCode();await CapacitorSQLite.closeConnection({database:packet.databaseName,readonly:false});}');
const marker='  async openDatabase(identity,isCurrent,verifiedDatabaseBinding){';if(!source.includes(marker))throw Error('Expected authenticated database boundary');
source=source.replace(marker,marker+'\n   const {sqlite,openNativeOfflineDatabase,schema}=await loadDatabaseCode();');
await fs.writeFile(file,source);
const build=path.join(workspace,'tools/local-development/build-android.mjs');await fs.copyFile(build,path.join(backup,'build-android.mjs'));await fs.writeFile(build,(await fs.readFile(build,'utf8')).replaceAll('1.0.12-local-dev.35','1.0.12-local-dev.36').replaceAll('26111145','26111146'));
console.log(JSON.stringify({status:'SOURCE_PREPARED_NOT_MEASURED',version:'dev36',change:'Lazy SDK JS/schema code only; same one SQLCipher owner and security checks'}));
