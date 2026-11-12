// Bounded schema metadata only, through the caller's existing authorized owner.
// No connection, global readiness cache, migration policy or data reset.
const incompatible=()=>Object.assign(new Error('Unsupported existing Home schema'),{code:'schema-incompatible'});
function signature(sql){
  if(typeof sql!=='string')throw incompatible();
  const tokens=sql.match(/'(?:[^']|'')*'|"(?:[^"]|"")*"|`(?:[^`]|``)*`|\[[^\]]*\]|[A-Za-z_][A-Za-z0-9_]*|[0-9]+|[^\s]/g)||[];
  const normalized=tokens.map(token=>/^[A-Za-z_]/.test(token)?token.toLowerCase():token);
  if(normalized.slice(0,5).join(' ')==='create table if not exists')normalized.splice(2,3);
  if(normalized.at(-1)===';')normalized.pop();
  return normalized.join('\0');
}
export async function ensureExactSQLiteTables({statements,read,transaction,afterCreate}){
  if(!Array.isArray(statements)||!statements.length||statements.length>16||typeof transaction!=='function')throw new TypeError('Bounded schema definitions and existing owner required');
  const definitions=statements.map(sql=>{
    const match=/^CREATE TABLE IF NOT EXISTS ([a-z_][a-z0-9_]*)\s*\(/i.exec(sql);
    if(!match)throw new TypeError('Only fixed table definitions supported');
    return {name:match[1],signature:signature(sql)};
  });
  if(new Set(definitions.map(row=>row.name)).size!==definitions.length)throw new TypeError('Duplicate schema definition');
  const names=definitions.map(row=>row.name);
  const query='SELECT type,name,sql FROM sqlite_master WHERE name IN ('+names.map(()=>'?').join(',')+')';
  const ready=rows=>{
    if(!Array.isArray(rows)||rows.length>definitions.length)throw incompatible();
    const seen=new Set();
    for(const row of rows){const expected=definitions.find(item=>item.name===row.name);
      if(!expected||seen.has(row.name)||row.type!=='table'||signature(row.sql)!==expected.signature)throw incompatible();seen.add(row.name);
    }
    return seen.size===definitions.length;
  };
  if(read&&ready(await read(query,names)))return {created:false};
  // Missing supported tables take the original additive creation path. Existing
  // incompatible definitions never pass via CREATE IF NOT EXISTS. Recheck in
  // the same transaction so races/errors roll back, including afterCreate.
  await transaction(async db=>{
    ready(await db.query(query,names));
    for(const sql of statements)await db.run(sql);
    if(afterCreate)await afterCreate(db);
    if(!ready(await db.query(query,names)))throw incompatible();
  });
  return {created:true};
}
