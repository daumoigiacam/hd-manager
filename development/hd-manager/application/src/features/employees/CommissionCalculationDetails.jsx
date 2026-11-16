import {useState} from 'react';
import {COMMISSION_METHODS,COMMISSION_BASES} from '../../utils/commissionPolicy.js';
const money=value=>Number(value||0).toLocaleString('vi-VN',{maximumFractionDigits:2});
export default function CommissionCalculationDetails({calculation}) {
  const [page,setPage]=useState(0);
  if(!calculation)return null;
  const evidence=calculation.sourceEvidence||{},rows=evidence.rows||[],shown=rows.slice(page*20,page*20+20);
  return <div className="col-span-2 space-y-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-950">
    {!calculation.ready&&<p role="alert" className="font-bold text-rose-700">Chưa đủ căn cứ đối soát hoa hồng. Không được chốt bảng lương: {(evidence.blockers||[]).join(' ')}</p>}
    <details><summary className="cursor-pointer font-bold">Chi tiết hoa hồng và đối soát doanh thu</summary><div className="mt-2 space-y-2">
      <p>{COMMISSION_METHODS[calculation.method]} · {COMMISSION_BASES[calculation.revenueBasis]}</p>
      {calculation.revenueNotEvaluated?<p>Chính sách đang tạm dừng hoặc ngoài kỳ áp dụng; không phát sinh hoa hồng theo chính sách này.</p>:<p>Doanh thu hợp lệ: {money(calculation.actualRevenue)} đ · KPI: {money(calculation.revenueTarget)} đ · Vượt: {money(calculation.revenueExcess)} đ</p>}
      {(calculation.rows||[]).map((row,index)=><p key={row.id}>Bậc {index+1}{row.enabled===false?' (đang tắt)':''}: {money(row.amountWithinTier)} đ × {money(row.enabled===false?0:row.rate*100)}%{row.fixedBonus?` + ${money(row.fixedBonus)} đ`:''} = <strong>{money(row.commission)} đ</strong></p>)}
      {!!calculation.roundingAdjustment&&<p>Điều chỉnh làm tròn sau cộng: {money(calculation.roundingAdjustment)} đ</p>}
      <p>Làm tròn sau khi cộng toàn bộ các bậc; kỳ đã khóa đọc lại đúng kết quả trong snapshot.</p>
      <p>Nguồn: {rows.length} dòng; đã loại {(evidence.excluded||[]).length} đơn chưa đủ điều kiện.</p>
      <ul className="space-y-1">{shown.map(row=><li key={`${row.orderId}:${row.paymentId||''}`}>{row.date} · Đơn {row.orderId}{row.paymentId?` · Phiếu thu ${row.paymentId}`:''}: {money(row.amount)} đ</li>)}</ul>
      {rows.length>20&&<div className="flex items-center gap-3"><button type="button" disabled={!page} onClick={()=>setPage(value=>value-1)} className="min-h-9 rounded border px-2 disabled:opacity-40">Nguồn trước</button><span>{page+1}/{Math.ceil(rows.length/20)}</span><button type="button" disabled={(page+1)*20>=rows.length} onClick={()=>setPage(value=>value+1)} className="min-h-9 rounded border px-2 disabled:opacity-40">Nguồn tiếp</button></div>}
      {!!evidence.excluded?.length&&<details><summary>Đơn không tính hoa hồng</summary>{evidence.excluded.map(row=><p key={row.orderId}>{row.orderId}: {row.reason}</p>)}</details>}
    </div></details>
  </div>;
}
