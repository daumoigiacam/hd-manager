import {MAX_COMMISSION_TIERS} from './salesCommissionTiers.js';
import {buildEmployeePayrollPolicyUpdate} from './payrollPolicyHistory.js';

export const COMMISSION_METHODS = Object.freeze({fixed:'Tỷ lệ cố định trên doanh thu',above_kpi:'Tỷ lệ trên phần vượt KPI',progressive:'Lũy tiến từng bậc',retrospective:'Hồi tố theo bậc đạt được'});
export const COMMISSION_BASES = Object.freeze({recognized_net:'Doanh thu đơn hợp lệ sau giảm giá',collected:'Doanh thu thực thu đã phân bổ vào đơn'});
const fail = message => {throw Error(message);};
const amount = (value,label) => {
  const number=Number(value);
  if(value===''||value===null||!Number.isSafeInteger(number)||number<0)fail(`${label} phải là số tiền nguyên, không âm.`);
  return number;
};
export function parseCommissionPercent(value) {
  const text=String(value??'').trim().replace(/\s*%$/,'').trim().replace(',','.');
  if(!/^\d+(\.\d{1,6})?$/.test(text))fail('Nhập tỷ lệ từ 0 đến 100%, ví dụ 2%, 2.5% hoặc 2,5%.');
  const rate=Number(text)/100;
  if(rate>1)fail('Tỷ lệ hoa hồng không được vượt 100%.');
  return rate;
}
function date(value,label) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))fail(`${label} chưa hợp lệ.`);
  const parsed=new Date(`${value}T00:00:00Z`);
  if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)fail(`${label} chưa hợp lệ.`);
  return value;
}
export function normalizeCommissionPolicy(input) {
  if(!input||input.schemaVersion!==2||!Object.hasOwn(COMMISSION_METHODS,input.method)||!Object.hasOwn(COMMISSION_BASES,input.revenueBasis))fail('Chính sách hoa hồng không hợp lệ.');
  if(input.cycle!=='months')fail('Chu kỳ quý/năm cần quy tắc phân bổ vào bảng lương tháng trước khi áp dụng.');
  if(typeof input.policyId!=='string'||!/^[-\w]{1,100}$/.test(input.policyId))fail('Thiếu mã phiên bản chính sách hoa hồng.');
  if(!['draft','active','paused'].includes(input.status))fail('Trạng thái chính sách chưa hợp lệ.');
  const effectiveFrom=date(input.effectiveFrom,'Ngày bắt đầu');
  if(!effectiveFrom.endsWith('-01'))fail('Chính sách hoa hồng theo tháng phải bắt đầu từ ngày đầu tháng; không tự chia KPI giữa tháng.');
  const effectiveTo=input.effectiveTo?date(input.effectiveTo,'Ngày kết thúc'):'';
  if(effectiveTo&&(effectiveTo<effectiveFrom||new Date(`${effectiveTo}T00:00:00Z`).getUTCDate()!==new Date(Number(effectiveTo.slice(0,4)),Number(effectiveTo.slice(5,7)),0).getDate()))fail('Ngày kết thúc phải là cuối tháng và không trước ngày bắt đầu.');
  const rate=Number(input.rate);
  if(!Number.isFinite(rate)||rate<0||rate>1)fail('Tỷ lệ hoa hồng phải từ 0 đến 100%.');
  const usesTiers=['progressive','retrospective'].includes(input.method);
  if(!Array.isArray(input.tiers)||input.tiers.length>MAX_COMMISSION_TIERS||(usesTiers&&!input.tiers.length))fail(`Cần từ 1 đến ${MAX_COMMISSION_TIERS} bậc cho phương pháp theo bậc.`);
  const ids=new Set();
  const tiers=input.tiers.map((tier,index)=>{
    if(typeof tier.id!=='string'||!/^[-\w]{1,100}$/.test(tier.id)||ids.has(tier.id))fail('Mã bậc bị thiếu hoặc trùng.');
    ids.add(tier.id);
    const from=amount(tier.from,'Mốc bắt đầu'),to=tier.to===null?null:amount(tier.to,'Mốc kết thúc');
    if(to!==null&&to<=from)fail(`Bậc ${index+1}: mốc kết thúc phải lớn hơn mốc bắt đầu.`);
    if(!Number.isFinite(tier.rate)||tier.rate<0||tier.rate>1||typeof tier.enabled!=='boolean')fail(`Bậc ${index+1}: tỷ lệ hoặc trạng thái không hợp lệ.`);
    return {id:tier.id,from,to,rate:tier.rate,fixedBonus:amount(tier.fixedBonus??0,'Thưởng cố định'),enabled:tier.enabled};
  }).sort((a,b)=>a.from-b.from);
  if(usesTiers)for(let i=0;i<tiers.length;i++){
    if(tiers[i].from!==(i?tiers[i-1].to:0))fail(`Bậc ${i+1}: các khoảng phải liền nhau từ 0, không được trống hoặc chồng lấn.`);
    if((tiers[i].to===null)!==(i===tiers.length-1))fail('Chỉ bậc cuối được không giới hạn; bậc cuối phải không giới hạn.');
  }
  return {schemaVersion:2,policyId:input.policyId,method:input.method,revenueBasis:input.revenueBasis,cycle:'months',status:input.status,targetRevenue:amount(input.targetRevenue,'Chỉ tiêu doanh thu'),rate,effectiveFrom,effectiveTo,tiers:usesTiers?tiers:[]};
}
export function commissionPolicyToDraft(policy) {
  if(!policy)return null;
  return {...policy,ratePercent:String(Number((policy.rate*100).toFixed(6))),tiers:policy.tiers.map(tier=>({...tier,ratePercent:String(Number((tier.rate*100).toFixed(6)))}))};
}
export function commissionPolicyFromDraft(draft) {
  return normalizeCommissionPolicy({...draft,schemaVersion:2,rate:parseCommissionPercent(draft.ratePercent),tiers:!['progressive','retrospective'].includes(draft.method)?[]:(draft.tiers||[]).map(tier=>({...tier,from:amount(tier.from,'Mốc bắt đầu'),to:tier.to===''||tier.to===null?null:amount(tier.to,'Mốc kết thúc'),rate:parseCommissionPercent(tier.ratePercent),fixedBonus:amount(tier.fixedBonus||0,'Thưởng cố định')}))});
}
export function createCommissionPolicyDraft(targetRevenue=0,baseRate=0,effectiveFrom='') {
  const start=effectiveFrom.endsWith('-01')?effectiveFrom:new Date(Date.UTC(Number(effectiveFrom.slice(0,4)),Number(effectiveFrom.slice(5,7)),1)).toISOString().slice(0,10);
  return commissionPolicyToDraft({schemaVersion:2,policyId:crypto.randomUUID(),method:'above_kpi',revenueBasis:'recognized_net',cycle:'months',status:'draft',targetRevenue:Number(targetRevenue)||0,rate:Number(baseRate)||0,effectiveFrom:start,effectiveTo:'',tiers:[]});
}
export function hdSampleCommissionPolicy(effectiveFrom) {
  return commissionPolicyToDraft({schemaVersion:2,policyId:'hd-sample-policy',method:'progressive',revenueBasis:'recognized_net',cycle:'months',status:'draft',targetRevenue:500000000,rate:0.02,effectiveFrom,effectiveTo:'',tiers:[
    {id:'hd-tier-1',from:0,to:500000000,rate:0.02,fixedBonus:0,enabled:true},
    {id:'hd-tier-2',from:500000000,to:1000000000,rate:0.025,fixedBonus:0,enabled:true},
    {id:'hd-tier-3',from:1000000000,to:null,rate:0.025,fixedBonus:0,enabled:true}
  ]});
}
const SCALE=100000000n;
const rateUnits=rate=>BigInt(Math.round(rate*Number(SCALE)));
function moneyFromUnits(units) {
  const cents=(units*100n+SCALE/2n)/SCALE;
  if(cents>BigInt(Number.MAX_SAFE_INTEGER))fail('Hoa hồng vượt giới hạn tính tiền an toàn.');
  return Number(cents)/100;
}
export function calculateCommissionPolicy(policy,revenue,{monthKey='',preview=false}={}) {
  const config=normalizeCommissionPolicy(policy),actual=amount(revenue,'Doanh thu'),excess=Math.max(0,actual-config.targetRevenue);
  const inPeriod=!monthKey||(monthKey>=config.effectiveFrom.slice(0,7)&&(!config.effectiveTo||monthKey<=config.effectiveTo.slice(0,7)));
  const payable=inPeriod&&(preview||config.status==='active');
  let total=0n;const rows=[];
  if(config.method==='fixed'||config.method==='above_kpi'){
    const basis=config.method==='fixed'?actual:excess;
    total=BigInt(basis)*rateUnits(config.rate);
    rows.push({id:'flat',from:0,to:null,amountWithinTier:basis,rate:config.rate,fixedBonus:0,commission:moneyFromUnits(total)});
  }else if(config.method==='progressive'){
    for(const tier of config.tiers){
      const within=Math.max(0,Math.min(excess,tier.to??excess)-tier.from);
      const bonus=within>0&&tier.enabled?tier.fixedBonus:0;
      const units=tier.enabled?BigInt(within)*rateUnits(tier.rate)+BigInt(bonus)*SCALE:0n;
      total+=units;rows.push({...tier,amountWithinTier:within,fixedBonus:bonus,commission:moneyFromUnits(units)});
    }
  }else{
    // Adjacent ranges are (from, to]; 500m belongs only to the first tier.
    const tier=config.tiers.find(row=>excess>row.from&&(row.to===null||excess<=row.to));
    if(tier){const bonus=tier.enabled?tier.fixedBonus:0;total=tier.enabled?BigInt(excess)*rateUnits(tier.rate)+BigInt(bonus)*SCALE:0n;rows.push({...tier,fixedBonus:bonus,amountWithinTier:excess,commission:moneyFromUnits(total)});}
  }
  const commission=payable?moneyFromUnits(total):0;
  const roundingAdjustment=payable?Math.round(commission*100-rows.reduce((sum,row)=>sum+Math.round(row.commission*100),0))/100:0;
  return {schemaVersion:2,policyId:config.policyId,method:config.method,revenueBasis:config.revenueBasis,status:config.status,monthKey,actualRevenue:actual,revenueTarget:config.targetRevenue,revenueExcess:excess,inPeriod,ready:true,commission,rows:payable?rows:[],roundingAdjustment,rounding:'sum_exact_rate_units_then_round_to_2_decimals'};
}

export function commissionPolicySavePatch(employee,form,{canEdit=true}={}) {
  if(!canEdit||!form)return {};
  const policy=commissionPolicyFromDraft(form);
  if(policy.status==='draft')return {commissionPolicyDraft:policy};
  const newer=(employee?.payrollPolicies||employee?.salaryPolicyHistory||[]).some(record=>!record.supersededAt&&record.effectiveFrom>policy.effectiveFrom);
  if(newer)fail('Có chính sách lương đã lưu với ngày áp dụng muộn hơn. Chọn kỳ áp dụng mới để không ghi đè lịch sử hoặc lịch chính sách hiện có.');
  const referenced=new Set((employee?.payrollPolicies||employee?.salaryPolicyHistory||[]).flatMap(record=>record.values?.commissionPolicy?.tiers?.map(tier=>tier.id)||[]));
  const nextIds=new Set(policy.tiers.map(tier=>tier.id));
  if(employee?.commissionPolicy?.policyId===policy.policyId&&(employee.commissionPolicy.tiers||[]).some(tier=>referenced.has(tier.id)&&!nextIds.has(tier.id)))fail('Bậc đã có trong lịch sử không được xóa. Hãy tắt bậc hoặc tạo chính sách phiên bản mới.');
  return {commissionPolicy:policy,commissionPolicyDraft:null,salaryPolicyEffectiveFrom:policy.effectiveFrom};
}

// Additive migration: legacy fields are never rewritten. Rollback itself is a
// new effective policy, not deletion or mutation of a historical snapshot.
export function buildCommissionRollbackPatch(employee,{effectiveFrom,changedByEmployeeId='',changedAt=new Date().toISOString()}={}) {
  date(effectiveFrom,'Ngày khôi phục');
  if(!effectiveFrom.endsWith('-01'))fail('Khôi phục công thức cũ từ ngày đầu kỳ lương tháng.');
  if((employee?.payrollPolicies||employee?.salaryPolicyHistory||[]).some(record=>!record.supersededAt&&record.effectiveFrom>effectiveFrom))fail('Không khôi phục lùi trước ngày của chính sách đã lưu.');
  const next={...employee,commissionPolicy:null,commissionPolicyDraft:null};
  return {commissionPolicy:null,commissionPolicyDraft:null,...buildEmployeePayrollPolicyUpdate({employee,nextEmployee:next,effectiveFrom,changedByEmployeeId,changedAt})};
}
