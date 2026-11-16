import {cashflowBusinessDaySql} from './cashflowDirectoryDateSql.js';
import {warehouseDispatchBusinessSortSql} from './businessDirectoryDateSql.js';
import {ORDER_FEED_KEYS_INDEX,ORDER_SEARCH_SCHEMA,runSearchStatements} from './offlineBusinessSearchProjection.js';
export const CASHFLOW_SORT_TABLE='offline_business_cashflow_sort_v1';
export const CASHFLOW_SORT_SCHEMA=Object.freeze([
 `CREATE TABLE IF NOT EXISTS offline_business_cashflow_sort_v1 (tenant_id TEXT,principal_id TEXT,generation TEXT,source TEXT,id TEXT,seq INTEGER,version INTEGER,sort_key TEXT,PRIMARY KEY(tenant_id,principal_id,generation,source,id))`,
 `CREATE INDEX IF NOT EXISTS offline_business_cashflow_sort_keys_v1 ON offline_business_cashflow_sort_v1 (tenant_id,principal_id,generation,source,version,sort_key COLLATE BINARY DESC,id COLLATE BINARY DESC,seq)`,
 ORDER_SEARCH_SCHEMA[1],
]);
// Reuse this existing derived date-key table for Dispatch too. It contains no
// amounts, stock balances or alternate business records; canonical feed/seq
// remains authoritative, and incomplete/stale keys retain the original query.
export const cashflowSortSource=source=>source==='payments'||source==='expenses'||source==='warehouseDispatches';
export async function hasCashflowSortProjection(db){return (await db.query("SELECT name FROM sqlite_master WHERE type='table' AND name=?",[CASHFLOW_SORT_TABLE])).length===1;}
async function ensure(db){
 const names=[CASHFLOW_SORT_TABLE,'offline_business_cashflow_sort_keys_v1',ORDER_FEED_KEYS_INDEX];
 const signature=sql=>sql.toLowerCase().replace(/\bif\s+not\s+exists\s+/g,'').replace(/\s+/g,'');
 for(const statement of CASHFLOW_SORT_SCHEMA)await db.run(statement);
 const rows=await db.query('SELECT type,name,sql FROM sqlite_master WHERE name IN (?,?,?)',names);
 if(rows.length!==3||rows.some(row=>{const at=names.indexOf(row.name);return at<0||row.type!==(at?'index':'table')||signature(row.sql||'')!==signature(CASHFLOW_SORT_SCHEMA[at]);}))throw Object.assign(Error('Incompatible cashflow date index'),{code:'schema-incompatible'});
}
// Reuse the completed feed's existing transaction/sequence. No amount, ledger,
// permission, receipt or business document is stored in this derived index.
export function cashflowSortUpserts(feedRows){
 const rows=feedRows.filter(row=>cashflowSortSource(row[3]));
 const result=[];
 for(let at=0;at<rows.length;at+=16){const batch=rows.slice(at,at+16);
  result.push({statement:`WITH input(tenant_id,principal_id,generation,source,id,seq,body) AS (VALUES ${batch.map(()=>'(?,?,?,?,?,?,?)').join(',')})
   INSERT INTO offline_business_cashflow_sort_v1
   SELECT r.tenant_id,r.principal_id,r.generation,r.source,r.id,r.seq,1,CASE WHEN r.source='warehouseDispatches'
    THEN ${warehouseDispatchBusinessSortSql()} ELSE COALESCE(${cashflowBusinessDaySql()},'') END FROM input r WHERE 1
   ON CONFLICT(tenant_id,principal_id,generation,source,id) DO UPDATE SET seq=excluded.seq,version=excluded.version,sort_key=excluded.sort_key
   WHERE excluded.seq>=offline_business_cashflow_sort_v1.seq`,values:batch.flat()});
 }return result;
}
export async function backfillCashflowSortPage(db,{keys,head,source,limit,check}){
 if(!cashflowSortSource(source))throw TypeError('Fixed cashflow source required');
 check();await ensure(db);check();
 // Canonical feed writers change seq with the body. Missing/stale rows alone
 // are read; an unrelated feed revision never reparses the whole history.
 const rows=await db.query(`WITH missing AS MATERIALIZED (SELECT r.id,r.seq FROM offline_home_feed_records_v1 r INDEXED BY ${ORDER_FEED_KEYS_INDEX}
  WHERE r.tenant_id=?1 AND r.principal_id=?2 AND r.generation=?3 AND r.source=?4 AND r.seq<=?5
   AND NOT EXISTS (SELECT 1 FROM offline_business_cashflow_sort_v1 p WHERE p.tenant_id=r.tenant_id AND p.principal_id=r.principal_id
    AND p.generation=r.generation AND p.source=r.source AND p.id=r.id AND p.seq=r.seq AND p.version=1) ORDER BY r.id LIMIT ?6)
  SELECT r.id,r.seq,r.body FROM missing m CROSS JOIN offline_home_feed_records_v1 r
   WHERE r.tenant_id=?1 AND r.principal_id=?2 AND r.generation=?3 AND r.source=?4 AND r.id=m.id AND r.seq=m.seq ORDER BY r.id`,[...keys,head.generation,source,head.seq,limit]);check();
 await runSearchStatements(db,cashflowSortUpserts(rows.map(r=>[...keys,head.generation,source,r.id,r.seq,r.body])));check();
 return{source,processed:rows.length,complete:rows.length<limit,generation:head.generation,seq:head.seq,version:1};
}
