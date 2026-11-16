import {useState} from 'react';
import {commissionTiersFromDraft,salesCommissionBreakdown,MAX_COMMISSION_TIERS} from '../../utils/salesCommissionTiers.js';

const money=value=>new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2}).format(value);
export default function CommissionTierEditor({rows=[],onChange,basePercent='',targetRevenue=0,disabled=false}) {
  const [revenue,setRevenue]=useState('');
  const [preview,setPreview]=useState(null);
  const [error,setError]=useState('');
  const previewKey=JSON.stringify([rows,basePercent,targetRevenue,revenue]);
  const update=(index,patch)=>onChange(rows.map((row,i)=>i===index?{...row,...patch}:row));
  const calculate=()=>{
    try {
      const base=Number(String(basePercent||'0').replace(',','.'))/100;
      const tiers=commissionTiersFromDraft(rows,base);
      if (!String(revenue).trim()) throw Error('Nhập doanh thu thực tế để tính thử.');
      setPreview({key:previewKey,...salesCommissionBreakdown(Number(revenue),Number(targetRevenue||0),base,tiers)});setError('');
    } catch(failure) {setPreview(null);setError(failure.message);}
  };
  return <section aria-label="Mốc hoa hồng theo phần vượt chỉ tiêu" className="space-y-3 border-t border-emerald-200 pt-3">
    <h5 className="text-sm font-bold text-emerald-900">Mốc tăng tỷ lệ hoa hồng</h5>
    <p className="text-xs leading-5 text-emerald-800">Mốc được xét trên phần doanh thu vượt chỉ tiêu. Tỷ lệ của mốc cao nhất đã đạt áp dụng cho toàn bộ phần vượt, không tính lũy tiến. Dưới mốc đầu tiên dùng % hoa hồng cơ bản.</p>
    {rows.map((row,index)=><div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,.6fr)_auto] items-end gap-2">
      <label className="min-w-0 text-xs font-semibold">Phần vượt từ (đ)
        <input aria-label={`Mốc hoa hồng ${index+1}`} type="text" inputMode="numeric" value={row.minExcessRevenue===''?'':money(Number(row.minExcessRevenue)||0)} disabled={disabled}
          onChange={event=>update(index,{minExcessRevenue:event.target.value.replace(/\D/g,'')})} className="mt-1 w-full rounded-lg border border-emerald-200 p-2 disabled:opacity-60"/>
      </label>
      <label className="min-w-0 text-xs font-semibold">Tỷ lệ (%)
        <input aria-label={`Tỷ lệ mốc ${index+1}`} type="text" inputMode="decimal" value={row.ratePercent} disabled={disabled}
          onChange={event=>update(index,{ratePercent:event.target.value})} className="mt-1 w-full rounded-lg border border-emerald-200 p-2 disabled:opacity-60"/>
      </label>
      <button type="button" aria-label={`Xóa mốc hoa hồng ${index+1}`} disabled={disabled} onClick={()=>onChange(rows.filter((_,i)=>i!==index))} className="rounded-lg p-2 text-sm text-rose-700 disabled:opacity-40">Xóa</button>
    </div>)}
    <button type="button" disabled={disabled||rows.length>=MAX_COMMISSION_TIERS} onClick={()=>onChange([...rows,{minExcessRevenue:'',ratePercent:''}])} className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-bold text-emerald-800 disabled:opacity-40">Thêm mốc hoa hồng</button>
    <p className="text-xs text-emerald-800">Không có mốc: giữ công thức hiện tại. Mốc được lưu theo ngày áp dụng chính sách lương; không sửa kỳ đã chốt.</p>
    <div className="space-y-2 rounded-lg bg-white p-3">
      <label className="block text-xs font-semibold">Doanh thu thực tế để tính thử (đ)
        <input aria-label="Doanh thu tính thử hoa hồng" type="text" inputMode="numeric" value={revenue===''?'':money(Number(revenue)||0)} onChange={event=>{setRevenue(event.target.value.replace(/\D/g,''));setPreview(null);setError('');}} className="mt-1 w-full rounded-lg border border-emerald-200 p-2"/>
      </label>
      <button type="button" onClick={calculate} className="text-xs font-bold text-emerald-800 underline">Tính thử hoa hồng</button>
      <p className="text-xs text-slate-500">Chỉ tính thử, không lưu bảng lương hoặc tạo chứng từ.</p>
      {preview?.key===previewKey&&<p role="status" className="text-sm font-bold text-emerald-900">Phần vượt {money(preview.excessRevenue)} đ × {money(preview.rate*100)}% = {money(preview.amount)} đ</p>}
      {error&&<p role="alert" className="text-xs text-rose-700">{error}</p>}
    </div>
  </section>;
}
