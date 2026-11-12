// One encrypted native connection, one serialized transaction owner. Deliberately
// no browser/unencrypted fallback: callers must show an actionable storage error.
import {currentSearchTrace,searchMark} from './crmSearchTrace.js';
import {startupSpan,startupMark} from '../services/offlineStartupTrace.js';
const activeOwners=new Set();
export function inspectNativeOfflineDatabaseOwners() {
  return Object.freeze({activeOwners:activeOwners.size});
}
export async function openNativeOfflineDatabase({ sqlite, databaseName, schema, isCurrent, recoverConnection, openWithState, createIncludesOpen=false, verifiedScope, preparedBeforeCreate=false }) {
  if (!/^hd_offline_[a-f0-9]{64}$/.test(databaseName)) throw new TypeError('Hashed account database name required');
  // The platform provisions/checks the secret once. Native encrypted open
  // independently rejects a missing/empty secret; don't decrypt it once more
  // solely for this redundant JS preflight.
  if(activeOwners.has(databaseName))throw new Error('Offline database already has a live JavaScript owner');
  activeOwners.add(databaseName);
  let connection,alreadyOpen=false;
  const createFinish=createIncludesOpen?startupSpan(preparedBeforeCreate?'sqlite.sdk-adopt-prepared':'sqlite.native-create-open-config'):null;
  try{connection=await sqlite.createConnection(databaseName,true,'secret',1,false);}
  catch(error){try{if(!recoverConnection||!String(error?.message||error).includes(databaseName)||!String(error?.message||error).includes('already exists'))throw error;const recovered=await recoverConnection(databaseName);connection=recovered.connection;alreadyOpen=recovered.alreadyOpen;startupMark('sqlite.orphan-connection-recovered');}catch(failure){activeOwners.delete(databaseName);throw failure;}}
  let closed=false, tail=Promise.resolve(),schemaVersion,databaseState,writeRevision=0;
  // Conservative SQL classification, not a security boundary: all write APIs
  // invalidate before execution. Quoted text/identifiers/comments cannot turn
  // a read into a write; the scalar REPLACE(...) function is a read operation.
  const isReadOnly=sql=>{
    const tokens=String(sql).replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|--[^\r\n]*|\/\*[\s\S]*?\*\//g,' ');
    return /^\s*(SELECT|WITH|EXPLAIN)\b/i.test(tokens)
      &&! /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|ATTACH|DETACH|VACUUM|REINDEX)\b|\bREPLACE\b(?!\s*\()/i.test(tokens);
  };
  const wrote=()=>{if(writeRevision>=Number.MAX_SAFE_INTEGER)throw Error('Database revision exhausted');writeRevision++;};
  const check=()=>{if(closed || !isCurrent())throw Object.assign(new Error('Offline database scope closed'),{code:'permission-denied'});};
  try {
    check();const combined=Boolean(openWithState&&!alreadyOpen),openFinished=startupSpan(preparedBeforeCreate?'sqlite.prepared-config-verified':combined?'sqlite.native-open-and-config':'sqlite.native-open');
    if(!alreadyOpen){
      if(combined){const result=await openWithState(databaseName);databaseState=result?.workspaceState;if(!databaseState)throw Error('Native workspace state protocol unavailable');}
      else await connection.open();
    }
    openFinished({reused:alreadyOpen,configurationIncluded:combined});createFinish?.({reused:alreadyOpen});check();
    if(!combined){
    await connection.query('PRAGMA journal_mode=WAL');
    await connection.execute('PRAGMA foreign_keys=ON;\nPRAGMA synchronous=FULL;',false);
    databaseState=(await connection.query(`SELECT
      (SELECT user_version FROM pragma_user_version) AS version,
      (SELECT foreign_keys FROM pragma_foreign_keys) AS foreignKeys,
      (SELECT synchronous FROM pragma_synchronous) AS synchronous,
      (SELECT journal_mode FROM pragma_journal_mode) AS journalMode,
      (SELECT file FROM pragma_database_list WHERE name='main') AS path,
      (SELECT json_group_object(name,sql) FROM sqlite_master WHERE type='table' AND name IN ('offline_customer_delta','offline_customer_sync_seen','offline_customer_conflicts','offline_customer_cursors','offline_customers')) AS customerSchema`)).values?.[0];
    }
    if(!databaseState||!Number.isInteger(databaseState.version)||databaseState.version<0||databaseState.foreignKeys!==1||databaseState.synchronous!==2||databaseState.journalMode!=='wal'||!databaseState.path)throw Error('Encrypted database configuration verification failed');
    const version=databaseState.version;
    schemaVersion=version;
    if(version>1)throw new Error('Offline schema is newer than this application');
    if(version===0){
      await connection.beginTransaction();
      try {
        await connection.execute(schema.replace(/^PRAGMA .*;$/gm,''),false);
        check();await connection.execute('PRAGMA user_version=1;',false);
        await connection.commitTransaction();schemaVersion=1;
      } catch(error){await connection.rollbackTransaction();throw error;}
    }
  }catch(error){await sqlite.closeConnection(databaseName,false).catch(()=>{});activeOwners.delete(databaseName);throw error;}
  let metadata;
  try{metadata={databaseName,version:schemaVersion,path:databaseState.path,foreignKeys:databaseState.foreignKeys,synchronous:databaseState.synchronous,journalMode:databaseState.journalMode,customerSchema:Object.freeze(JSON.parse(databaseState.customerSchema||'{}'))};}
  catch(error){await sqlite.closeConnection(databaseName,false).catch(()=>{});activeOwners.delete(databaseName);throw error;}
  // A one-use snapshot from the SAME opened connection, invalidated before ANY
  // transaction can write. It cannot become a long-lived Outbox count cache.
  let pendingAtOpen=verifiedScope&&databaseState.pendingScope&&['projectId','tenantId','principalId','permissionRevision','sessionId','deviceId'].every(k=>databaseState.pendingScope[k]===verifiedScope[k])&&Number.isSafeInteger(databaseState.pendingAtOpen)&&databaseState.pendingAtOpen>=0
    ?{scope:databaseState.pendingScope,count:databaseState.pendingAtOpen}:null;
  console.info('CUSTOMER_SQLITE_READY '+JSON.stringify(metadata));
  return Object.freeze({
    metadata:Object.freeze(metadata),
    takeInitialPending(scope){
      check();const snapshot=pendingAtOpen;pendingAtOpen=null;
      return snapshot&&['tenantId','principalId','permissionRevision','sessionId','deviceId'].every(k=>snapshot.scope[k]===scope[k])?snapshot.count:null;
    },
    // A SELECT is atomic in SQLite itself. Serialize it on the same owner queue
    // as writes, without two extra native BEGIN/COMMIT calls per cursor page.
    supportsReadRevision:true,
    readQuery(sql,params=[],{traceId=currentSearchTrace(),prepare,observed}={}) {
      searchMark(traceId,'read-db-enqueue');
      const task=tail.then(async()=>{
        searchMark(traceId,'read-db-dequeue');
        check();const revision=writeRevision;
        const plan=prepare?.(revision)||{statement:sql,params};
        if(typeof plan.statement!=='string'||!Array.isArray(plan.params))throw Error('Invalid prepared read');
        if(!isReadOnly(plan.statement))wrote();
        searchMark(traceId,'read-native-start');
        const result=await connection.query(plan.statement,plan.params);
        searchMark(traceId,'read-native-return',{rows:result.values?.length||0});check();
        observed?.(writeRevision);
        return result.values || [];
      });
      tail=task.catch(()=>{});return task;
    },
    transaction(work,{traceId=0}={}) {
      pendingAtOpen=null;
      searchMark(traceId,'db-enqueue');
      const task=tail.then(async()=>{
        searchMark(traceId,'db-dequeue');
        check();await connection.beginTransaction();
        searchMark(traceId,'db-begin-done');
        try {
          const adapter={
            async query(sql,params=[]){check();if(!isReadOnly(sql))wrote();searchMark(traceId,'native-query-start');const result=await connection.query(sql,params);searchMark(traceId,'native-query-return',{rows:result.values?.length||0});return result.values || [];},
            async run(sql,params=[]){check();wrote();return connection.run(sql,params,false);},
            async execute(sql){check();wrote();return connection.execute(sql,false);},
            async runSet(set){check();wrote();return connection.executeSet(set,false);},
          };
          const result=await work(adapter);check();searchMark(traceId,'db-commit-start');await connection.commitTransaction();searchMark(traceId,'db-commit-done');return result;
        }catch(error){await connection.rollbackTransaction();throw error;}
      });
      tail=task.catch(()=>{});return task;
    },
    async close(){closed=true;await tail;try{await sqlite.closeConnection(databaseName,false);}finally{activeOwners.delete(databaseName);}},
  });
}
