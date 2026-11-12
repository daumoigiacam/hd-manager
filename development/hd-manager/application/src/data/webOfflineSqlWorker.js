import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import {createWebEncryptedVault} from './webEncryptedVault.js';

let sql,vault,db,name,releaseLock,transaction=false,durableBytes=null,tail=Promise.resolve();
const config=()=>db.run('PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;');
const rows=(statement,values=[])=>{const s=db.prepare(statement);try{s.bind(values);const out=[];while(s.step())out.push(s.getAsObject());return out;}finally{s.free();}};
async function persist(){
  const candidate=db.export();config();
  try{await vault.put('database:'+name,candidate);durableBytes=candidate;}
  catch(error){db.close();db=new sql.Database(durableBytes||undefined);config();throw error;}
}
async function handle({method,args=[]}){
  if(method==='open'){
    if(db)throw Error('Browser SQLite already open');
    name=args[0];if(!/^hd_offline_[a-f0-9]{64}$/.test(name))throw Error('Invalid scoped browser database');
    let accept,reject;const locked=new Promise((a,b)=>{accept=a;reject=b;});
    void navigator.locks.request('hd-offline-sqlite:'+name,{ifAvailable:true},async lock=>{
      if(!lock){reject(Error('Dữ liệu đang mở ở tab khác. Vui lòng sử dụng tab đó.'));return;}
      await new Promise(resolve=>{releaseLock=resolve;accept();});
    }).catch(reject);
    await locked;
    try{
      [sql,vault]=await Promise.all([initSqlJs({locateFile:()=>wasmUrl}),createWebEncryptedVault()]);
      durableBytes=await vault.get('database:'+name);db=new sql.Database(durableBytes||undefined);config();
      const version=rows('PRAGMA user_version')[0].user_version;
      if(version>1)throw Error('Offline browser schema is newer than this application');
      if(version===0){
        if(durableBytes)throw Error('Existing database has no recognized schema; không tạo database trắng.');
        db.run('BEGIN IMMEDIATE');
        try{db.run(args[1].replace(/^PRAGMA .*;$/gm,''));db.run('PRAGMA user_version=1; COMMIT;');await persist();}
        catch(error){if(db&&transaction)db.run('ROLLBACK');throw error;}
      }
      return {version:1,path:'indexeddb://'+name,storage:'encrypted-indexeddb-sqlite-v1',foreignKeys:rows('PRAGMA foreign_keys')[0].foreign_keys};
    }catch(error){db?.close();db=null;vault?.close();releaseLock?.();throw error;}
  }
  if(!db)throw Error('Browser SQLite is not open');
  if(method==='query')return rows(args[0],args[1]);
  if(method==='begin'){if(transaction)throw Error('Nested browser transaction');db.run('BEGIN IMMEDIATE');transaction=true;return;}
  if(method==='run'){if(!transaction)throw Error('Write requires owner transaction');db.run(args[0],args[1]);return {changes:{changes:db.getRowsModified()}};}
  if(method==='execute'){if(!transaction)throw Error('Write requires owner transaction');db.run(args[0]);return;}
  if(method==='runSet'){if(!transaction)throw Error('Write requires owner transaction');for(const r of args[0])db.run(r.statement,r.values||[]);return;}
  if(method==='commit'){if(!transaction)throw Error('No browser transaction');db.run('COMMIT');transaction=false;await persist();return;}
  if(method==='rollback'){if(transaction){db.run('ROLLBACK');transaction=false;}return;}
  if(method==='close'){if(transaction)db.run('ROLLBACK');db.close();db=null;vault.close();releaseLock?.();return;}
  throw Error('Unsupported browser SQLite operation');
}
self.onmessage=event=>{
  const message=event.data;
  tail=tail.then(async()=>{try{const result=await handle(message);self.postMessage({id:message.id,result});}catch(error){self.postMessage({id:message.id,error:{message:error.message,code:error.code||'local-storage-error'}});}});
};
