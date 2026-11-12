import {inspectPayrollSnapshot} from '../../utils/payrollSnapshotIntegrity.js';
import {normalizeSearchText} from '../../services/searchEngine.js';

// Main lazily supplies the EXISTING database/session/authorizer. This helper has
// no connection, schema, write, subscription or global source-loading lifecycle.
// financials is absent from the finalized directory, so only that bounded read
// and one employee/month's original frozen payroll source are implemented here.
export const HR_PAGE_SIZE = 40;
const MAX_BODY = 512 * 1024;
const scopeFields = ['tenantId','principalId','permissionRevision','sessionId'];
const checkpointFields = [...scopeFields,'generation','seq','capturedAt','dayKey','sourceProfile'];
const fail = (code,message) => { throw Object.assign(Error(message),{code}); };
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
export const validHRMonth = value => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
export const sameHRCheckpoint = (a,b) => !!a && !!b && checkpointFields.every(key => a[key] === b[key]);
const pendingStates = ['LOCAL_ONLY','PENDING_SYNC','SYNCING','SYNC_FAILED','CONFLICT','CONFLICT_REQUIRES_REVIEW'];
export const pendingHRSource = value => value?.__pendingFirebaseSync === true || value?.__pendingLocalSync === true
  || pendingStates.includes(value?.localSyncState);
const financialTypes = ['bonus','penalty','advance','allowance','employee_purchase'];
const field = key => `json_extract(body,'$.${key}')`;

export function hrMonthRange(monthKey) {
  if (!validHRMonth(monthKey)) fail('invalid-argument','Tháng nhân sự không hợp lệ.');
  const next = new Date(monthKey+'-01T00:00:00Z');
  next.setUTCMonth(next.getUTCMonth()+1);
  return {from:monthKey+'-01',to:next.toISOString().slice(0,10)};
}

// Fixed Unicode map, not source data. A finite recursive replace avoids native
// SQLite's parser-depth limit; full selected search fields are folded in SQL.
const mapping = [];
for (let n=0xc0;n<=0x1eff;n++) {
  const c=String.fromCharCode(n),v=c.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if (/^[a-zA-Z]$/.test(v) && c!==v) mapping.push([c,v]);
}
mapping.push(['đ','d'],['Đ','D']);
for(let n=768;n<=879;n++)mapping.push([String.fromCharCode(n),' ']);
const chars=mapping.map(([c])=>c).join(''),replacements=mapping.map(([,v])=>v).join('');
function folded(sql) {
  return `(WITH RECURSIVE f(i,v) AS (SELECT 1,COALESCE(${sql},'') UNION ALL
    SELECT i+1,replace(v,substr('${chars}',i,1),CASE WHEN unicode(substr('${chars}',i,1)) BETWEEN 768 AND 879
    THEN '' ELSE substr('${replacements}',i,1) END) FROM f WHERE i<=${mapping.length})
    SELECT lower(v) FROM f ORDER BY i DESC LIMIT 1)`;
}

// addFinancialRecord stores document.date; never substitute createdAt/today.
// ISO wall times are already Vietnam time; explicit offsets and numeric/Timestamp
// instants convert to +07. The date is used identically for filtering and sorting.
const dateValue=field('date');
const financialInstant=`CASE WHEN instr(${dateValue},'.')>0 THEN substr(${dateValue},1,instr(${dateValue},'.')-1)||
  CASE WHEN lower(substr(${dateValue},-1))='z' THEN 'Z'
    WHEN substr(${dateValue},-6) GLOB '[+-][0-9][0-9]:[0-9][0-9]' THEN substr(${dateValue},-6) ELSE '' END ELSE ${dateValue} END`;
const financialDay = `CASE
  WHEN json_type(body,'$.date') IN ('integer','real') THEN date(${field('date')}/1000.0,'unixepoch','+7 hours')
  WHEN json_type(body,'$.date')='object' THEN date(COALESCE(json_extract(body,'$.date.seconds'),json_extract(body,'$.date._seconds')),'unixepoch','+7 hours')
  WHEN json_type(body,'$.date')='text' AND substr(${field('date')},1,10) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND date(substr(${field('date')},1,10),'+0 days')=substr(${field('date')},1,10)
    THEN CASE WHEN length(${field('date')})=10 THEN ${field('date')}
      WHEN substr(${field('date')},11,1) IN ('T',' ') THEN CASE
        WHEN substr(${field('date')},11) GLOB '*[Zz]' OR substr(${field('date')},11) GLOB '*[+-][0-9][0-9]:[0-9][0-9]'
        THEN date(${financialInstant},'+7 hours') ELSE date(${financialInstant}) END END END`;
const financialFields = ['companyId','empId','type','amount','reason','date','isArchived','status',
  '__pendingFirebaseSync','__pendingLocalSync','localSyncState'];
const projection = financialFields.map(key => `'${key}',CASE WHEN json_type(body,'$.${key}') IN ('true','false')
  THEN json(CASE WHEN json_type(body,'$.${key}')='true' THEN 'true' ELSE 'false' END)
  WHEN json_type(body,'$.${key}')='text' THEN substr(${field(key)},1,1024)
  WHEN json_type(body,'$.${key}') IN ('integer','real') THEN ${field(key)} END`).join(',');

export function createOfflineHRReadRepository({database,session,authorize,clock=Date.now}) {
  if(typeof database?.transaction!=='function'||typeof session?.isCurrent!=='function'||typeof authorize!=='function'
    ||!scopeFields.every(key=>id(session.scope?.[key])))fail('invalid-argument','Thiếu chủ sở hữu dữ liệu nhân sự.');
  const scope=Object.freeze({...session.scope});
  const current=()=>{if(!session.isCurrent(scope)||!scopeFields.every(key=>scope[key]===session.scope[key]))fail('permission-denied','Phiên nhân sự đã thay đổi.');};
  async function permission(){
    current();const grant=await authorize({scope,kind:'home.read'});current();
    if(!grant||!scopeFields.every(key=>grant[key]===scope[key])||!Number.isSafeInteger(grant.expiresAtMs)
      ||clock()>=grant.expiresAtMs||!['home.read','home.payroll.read'].every(cap=>grant.capabilities?.includes(cap))
      ||grant.appSession?.sourceProfile!==undefined)fail('permission-denied','Không có quyền nguồn nhân sự có chữ ký của hồ sơ A.');
    return grant;
  }
  async function head(query,sources){
    const h=(await query(`SELECT h.generation,h.captured_at,h.day_key,
      json_extract(h.snapshot_json,'$.feedGeneration') AS feed_generation,json_extract(h.snapshot_json,'$.feedSeq') AS seq,
      COALESCE(json_extract(h.snapshot_json,'$.sourceProfile'),'legacy-v1') AS profile,
      json_extract(h.snapshot_json,'$.availableSources') AS sources,json_extract(h.snapshot_json,'$.sourceCounts') AS counts,
      c.applied_seq,c.reported_seq FROM offline_home_head_v1 h LEFT JOIN offline_home_feed_checkpoint_v1 c
      ON c.tenant_id=h.tenant_id AND c.principal_id=h.principal_id AND c.revision=h.revision AND c.generation=h.generation
      WHERE h.tenant_id=? AND h.principal_id=? AND h.revision=? LIMIT 1`,[scope.tenantId,scope.principalId,scope.permissionRevision]))[0];
    if(!h||h.profile!=='legacy-v1'||!id(h.generation)||h.feed_generation!==h.generation||!Number.isSafeInteger(h.seq)
      ||h.seq<0||h.applied_seq!==h.seq||h.reported_seq!==h.seq||!Number.isSafeInteger(h.captured_at)
      ||!/^\d{4}-\d{2}-\d{2}$/.test(h.day_key||''))fail('stale-checkpoint','Nguồn nhân sự chưa có bản hoàn tất khớp quyền.');
    const available=JSON.parse(h.sources),counts=JSON.parse(h.counts);
    if(sources.some(source=>!available.includes(source)||!Number.isSafeInteger(counts?.[source])||counts[source]<0))fail('source-unavailable','Nguồn nhân sự chưa được lưu đầy đủ.');
    return {...scope,generation:h.generation,seq:h.seq,capturedAt:h.captured_at,dayKey:h.day_key,sourceProfile:'legacy-v1'};
  }
  async function read(sources,checkpoint,work){
    await permission();
    return database.transaction(async db=>{
      const grant=await permission();
      const check=()=>{current();if(clock()>=grant.expiresAtMs)fail('permission-denied','Quyền nhân sự đã hết hạn trong khi đọc.');};
      const query=async(sql,params=[])=>{check();const rows=await db.query(sql,params);check();return rows;};
      const cp=await head(query,sources);
      if(checkpoint&&!sameHRCheckpoint(cp,checkpoint))fail('stale-checkpoint','Bản nguồn đã đổi. Hãy tải lại danh sách.');
      const result=await work(query,cp);
      if(!sameHRCheckpoint(cp,await head(query,sources)))fail('stale-checkpoint','Bản nguồn đã đổi trong khi đọc.');
      await permission();check();return result;
    });
  }
  const metadata=(cp,source,projectionName='bounded-directory-scalars-v1')=>({source,checkpoint:cp,serverConfirmedOnly:true,
    financialCalculationAllowed:false,timeZone:'Asia/Ho_Chi_Minh',projection:projectionName,stringLimit:1024});
  function financialOptions(input={}){
    if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['monthKey','employeeId','text','type','limit','cursor','checkpoint'].includes(k)))fail('invalid-argument','Bộ lọc khoản nhân sự không hợp lệ.');
    const {monthKey,employeeId='',text='',type='',limit=HR_PAGE_SIZE,cursor=null,checkpoint=null}=input;
    if(!validHRMonth(monthKey)||typeof employeeId!=='string'||(employeeId&&!id(employeeId))||typeof text!=='string'||text.length>128
      ||typeof type!=='string'||(type&&!financialTypes.includes(type))||!Number.isInteger(limit)||limit<1||limit>HR_PAGE_SIZE
      ||(cursor!==null&&(typeof cursor!=='string'||cursor.length>8192)))fail('invalid-argument','Bộ lọc khoản nhân sự không hợp lệ.');
    const tokens=[...new Set(normalizeSearchText(text).split(' ').filter(Boolean))];
    if(tokens.length>12)fail('invalid-argument','Quá nhiều từ tìm kiếm.');
    return {monthKey,employeeId,text,tokens,type,limit,cursor,checkpoint};
  }
  async function financials(input={},exactId=null){
    const o=exactId?{checkpoint:input.checkpoint,limit:1,tokens:[]}:financialOptions(input);
    return read(['financials'],o.checkpoint,async(query,cp)=>{
      const params=[scope.tenantId,scope.principalId,cp.generation,cp.seq,scope.tenantId];
      const key=JSON.stringify([scope,exactId||null,o.monthKey,o.employeeId,o.tokens,o.type]);
      let where='';
      if(exactId){where+=' AND id=?';params.push(exactId);}
      else{
        const range=hrMonthRange(o.monthKey);where+=' AND business_date>=? AND business_date<?';params.push(range.from,range.to);
        if(o.employeeId){where+=' AND employee_id=?';params.push(o.employeeId);}
        if(o.type){where+=' AND type=?';params.push(o.type);}
        for(const token of o.tokens){where+=` AND instr(${folded('search_text')},?)>0`;params.push(token);}
      }
      if(o.cursor){
        let cursor;try{cursor=JSON.parse(o.cursor);}catch{fail('invalid-argument','Con trỏ nhân sự không hợp lệ.');}
        if(cursor?.key!==key||!sameHRCheckpoint(cp,cursor?.checkpoint))fail('stale-checkpoint','Con trỏ nhân sự thuộc bản nguồn khác.');
        if(!id(cursor.id)||typeof cursor.date!=='string'||cursor.date.length!==10)fail('invalid-argument','Con trỏ nhân sự không hợp lệ.');
        where+=' AND (business_date COLLATE BINARY,id COLLATE BINARY)<(?,?)';params.push(cursor.date,cursor.id);
      }
      params.push(o.limit+1);
      const rows=await query(`WITH scoped AS (SELECT id,seq,body,${financialDay} AS business_date,
        ${field('empId')} AS employee_id,${field('type')} AS type,
        COALESCE(${field('reason')},'')||' '||COALESCE(${field('type')},'')||' '||id AS search_text
        FROM offline_home_feed_records_v1 WHERE tenant_id=? AND principal_id=? AND generation=? AND source='financials' AND seq<=?
        AND ${field('companyId')}=? AND ${field('id')}=id)
        SELECT substr(id,1,257) AS id,seq,business_date,json_object(${projection}) AS document
        FROM scoped WHERE 1=1${where} ORDER BY business_date COLLATE BINARY DESC,id COLLATE BINARY DESC LIMIT ?`,params);
      if(rows.some(row=>!id(row.id)))fail('invalid-data','Mã khoản nhân sự quá dài.');
      const items=rows.slice(0,o.limit).map(row=>({id:row.id,seq:row.seq,document:JSON.parse(row.document),businessDate:row.business_date||null,state:'SERVER_CONFIRMED'}));
      const hasMore=rows.length>o.limit,last=items.at(-1);
      return {items,hasMore,nextCursor:hasMore?JSON.stringify({key,checkpoint:cp,date:last.businessDate,id:last.id}):null,metadata:metadata(cp,'financials')};
    });
  }
  return Object.freeze({
    async attendanceDetail(recordId,{checkpoint}={}){
      if(!id(recordId))fail('invalid-argument','Mã chấm công không hợp lệ.');
      return read(['attendance'],checkpoint,async(query,cp)=>{
        const params=[scope.tenantId,scope.principalId,cp.generation,cp.seq,scope.tenantId,recordId];
        const where="tenant_id=? AND principal_id=? AND generation=? AND source='attendance' AND seq<=? AND json_extract(body,'$.companyId')=? AND id=? AND json_extract(body,'$.id')=id";
        const found=await query(`SELECT length(CAST(body AS BLOB)) AS bytes FROM offline_home_feed_records_v1 WHERE ${where} LIMIT 1`,params);
        if(found.length!==1||found[0].bytes>65536)fail('invalid-data','Bản công thiếu hoặc quá lớn để xem an toàn.');
        // Project ONLY display fields in SQLite. Do not transfer GPS/device
        // evidence, arbitrary role payloads or an entire employee/month history.
        const roles=await query(`WITH record AS (SELECT body FROM offline_home_feed_records_v1 WHERE ${where} LIMIT 1)
          SELECT r.key AS workRole,json_extract(r.value,'$.checkIn') AS checkIn,
            json_extract(r.value,'$.checkOut') AS checkOut,json_extract(r.value,'$.status') AS status
          FROM record,json_each(CASE WHEN json_type(body,'$.workRoles')='object'
            AND EXISTS(SELECT 1 FROM json_each(json_extract(body,'$.workRoles')))
            THEN json_extract(body,'$.workRoles') ELSE json_object(COALESCE(json_extract(body,'$.workRole'),'Bản công gốc'),json(body)) END) r
          ORDER BY r.key COLLATE BINARY LIMIT 33`,params);
        if(roles.length>32||roles.some(r=>typeof r.workRole!=='string'||!r.workRole||r.workRole.length>160
          ||['checkIn','checkOut','status'].some(k=>r[k]!==null&&(typeof r[k]!=='string'||r[k].length>128))))fail('invalid-data','Chi tiết công không đúng định dạng; không hiển thị bản bị cắt.');
        return {recordId,roles,metadata:metadata(cp,'attendance','bounded-attendance-roles-v1')};
      });
    },
    pageFinancials:options=>financials(options),
    async financialDetail(recordId,{checkpoint}={}){
      if(!id(recordId))fail('invalid-argument','Mã khoản nhân sự không hợp lệ.');
      return financials({checkpoint},recordId);
    },
    async payrollDetail({employeeId,monthKey,snapshotId,checkpoint}={}){
      if(!id(employeeId)||!validHRMonth(monthKey)||(snapshotId!==undefined&&!id(snapshotId)))fail('invalid-argument','Chọn đúng nhân viên và tháng lương.');
      return read(['payrollSnapshots','payrollPeriods'],checkpoint,async(query,cp)=>{
        const params=[scope.tenantId,scope.principalId,cp.generation,cp.seq,scope.tenantId,employeeId,monthKey];
        if(snapshotId)params.push(snapshotId);
        const rows=await query(`SELECT substr(id,1,257) AS id,length(CAST(body AS BLOB)) AS bytes,
          CASE WHEN length(CAST(body AS BLOB))<=${MAX_BODY} THEN body END AS body
          FROM offline_home_feed_records_v1 WHERE tenant_id=? AND principal_id=? AND generation=? AND source='payrollSnapshots' AND seq<=?
          AND ${field('companyId')}=? AND ${field('id')}=id AND ${field('employeeId')}=? AND ${field('monthKey')}=?
          ${snapshotId?'AND id=?':''} ORDER BY id COLLATE BINARY LIMIT 2`,params);
        const meta=metadata(cp,'payrollSnapshots','original-frozen-payroll-v1');
        const unavailable=reason=>({kind:'unavailable',employeeId,monthKey,reason,details:null,metadata:meta});
        if(!rows.length)return unavailable('Tháng này chưa có kết quả lương đã chốt được lưu. Không tính lương từ trang xem trước.');
        if(rows.length!==1)fail('ambiguous-snapshot','Có nhiều bản lương cho nhân viên/tháng; cần chọn đúng mã bản chốt.');
        if(!rows[0].body)fail('record-too-large','Bản lương vượt giới hạn đọc an toàn; không trả bản bị cắt.');
        const snapshot=JSON.parse(rows[0].body);
        if(!id(rows[0].id)||snapshot.id!==rows[0].id||!id(snapshot.periodId)
          ||snapshot.employeeId!==employeeId||snapshot.monthKey!==monthKey||snapshot.employee?.id!==employeeId){
          return unavailable('Danh tính nhân viên/tháng trong bản lương gốc không khớp.');
        }
        if(snapshot.isArchived)return unavailable('Bản lương này đã được lưu trữ.');
        if(pendingHRSource(snapshot))return {...unavailable('Bản nguồn lương đang chờ đồng bộ/đối chiếu; chưa công bố tiền lương.'),kind:'pending-source'};
        if(!['LOCKED','CLOSED','AUTO_LOCKED'].includes(snapshot.status))return unavailable('Bản lương gốc chưa có trạng thái chốt hợp lệ.');
        const periodRows=await query(`SELECT CASE WHEN length(CAST(body AS BLOB))<=${MAX_BODY} THEN body END AS body
          FROM offline_home_feed_records_v1 WHERE tenant_id=? AND principal_id=? AND generation=? AND source='payrollPeriods'
          AND id=? AND seq<=? AND ${field('id')}=id AND ${field('companyId')}=? AND ${field('monthKey')}=? LIMIT 1`,
          [scope.tenantId,scope.principalId,cp.generation,snapshot.periodId,cp.seq,scope.tenantId,monthKey]);
        if(!periodRows[0]?.body)return unavailable('Không có kỳ lương đầy đủ khớp bản chốt đã chọn.');
        const period=JSON.parse(periodRows[0].body);
        if(pendingHRSource(period))return {...unavailable('Kỳ lương còn trạng thái chờ đồng bộ.'),kind:'pending-source'};
        if(period.isArchived||!['LOCKED','CLOSED','AUTO_LOCKED'].includes(period.status)
          ||(period.adjustmentCount!==undefined&&period.adjustmentCount!==0)||period.latestAdjustmentBySnapshot?.[snapshot.id]){
          return unavailable('Kỳ chưa chốt hoặc đã điều chỉnh. Nguồn payrollAdjustments chưa có trong Home feed; không suy ra lương mới.');
        }
        if(!Array.isArray(period.snapshotIds)||!period.snapshotIds.includes(snapshot.id))return unavailable('Bản lương chưa thuộc danh sách chốt của kỳ.');
        const integrity=inspectPayrollSnapshot(snapshot);
        if(!integrity.isComplete)return {...unavailable('Bản chốt thiếu hoặc lệch dữ liệu/chính sách gốc; cần kiểm tra kỳ lương.'),kind:'needs-review',issues:integrity.issues};
        const results=snapshot.calculationSnapshot.results;
        if(['grossSalary','netSalary','endingDebt'].some(key=>results[key]===null||results[key]===''||!Number.isFinite(Number(results[key])))){
          return unavailable('Kết quả tính gốc chưa có đủ giá trị tiền lương hợp lệ.');
        }
        const keys=['grossSalary','netSalary','endingDebt','workDays','baseSalaryCalc','supportSalary','responsibilitySalary','roleSalary',
          'experienceSalary','commission','overtimePay','totalBonus','evaluationBonus','totalPenalty','totalAdvance','totalEmployeePurchase','deductionTotal','openingDebtApplied'];
        const details=Object.fromEntries(keys.map(key=>{
          const value=snapshot.salaryDetails[key];
          return [key,(typeof value==='number'||(typeof value==='string'&&value.trim()!==''))&&Number.isFinite(Number(value))?Number(value):null];
        }));
        if(['grossSalary','netSalary','endingDebt'].some(key=>details[key]===null))return unavailable('Kết quả tiền lương gốc không hợp lệ.');
        return {kind:'frozen',employeeId,monthKey,snapshotId:snapshot.id,periodId:snapshot.periodId,
          employeeName:String(snapshot.employee.name||employeeId).slice(0,256),lockedAt:String(snapshot.lockedAt).slice(0,128),
          formulaVersion:String(snapshot.formulaVersion).slice(0,128),policyVersion:String(snapshot.policyVersion).slice(0,128),
          details,state:'SERVER_CONFIRMED',metadata:meta};
      });
    },
  });
}
