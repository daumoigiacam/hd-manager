// A display-only allowlist for the proposed employee Home read model. No raw
// employee/customer/order/attendance documents, credentials or arbitrary fields
// are copied. This module does not fetch, publish or mark any source as loaded.
const invalid=()=>{throw new TypeError('Invalid employee Home display model.');};
const number=value=>typeof value==='number'&&Number.isFinite(value)?value:invalid();
const text=value=>typeof value==='string'&&value.length<=4096?value:invalid();
const flag=value=>typeof value==='boolean'?value:invalid();
const shape=(value,keys)=>{
 if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).length!==keys.length
  ||keys.some(key=>!Object.hasOwn(value,key)))invalid();
};
const list=(value,max,check)=>{
 if(!Array.isArray(value)||value.length>max)invalid();value.forEach(check);
};

export function validateEmployeeHomeScreenDto(value){
 shape(value,['version','monthKey','positionLabel','reviewStars','salary','sales','assets','attendance','delivery']);
 if(value.version!==1||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.monthKey))invalid();
 text(value.positionLabel);if(value.reviewStars!==null&&(number(value.reviewStars)<0||value.reviewStars>5))invalid();
 const salary=value.salary;shape(salary,['netSalary','workDays','salesRevenue','rows']);
 ['netSalary','workDays','salesRevenue'].forEach(key=>number(salary[key]));
 list(salary.rows,12,row=>{shape(row,['label','amount','tone']);text(row.label);number(row.amount);text(row.tone)});
 const sales=value.sales;shape(sales,['show','orderCount','customerCount']);flag(sales.show);number(sales.orderCount);number(sales.customerCount);
 const assets=value.assets;shape(assets,['show','count','monthCost','latest','rows']);flag(assets.show);number(assets.count);number(assets.monthCost);
 if(assets.latest!==null){shape(assets.latest,['label','amount']);text(assets.latest.label);number(assets.latest.amount)}
 list(assets.rows,3,row=>{shape(row,['id','label','statusLabel','monthCost']);text(row.id);text(row.label);text(row.statusLabel);number(row.monthCost)});
 const attendance=value.attendance;shape(attendance,['status','tone','shiftLabel','in','out','lateMinutes','autoOvertimeMinutes']);
 ['status','tone','shiftLabel'].forEach(key=>text(attendance[key]));
 for(const key of ['in','out']){const row=attendance[key];shape(row,['value','source','tone']);text(row.value);text(row.source);text(row.tone)}
 number(attendance.lateMinutes);number(attendance.autoOvertimeMinutes);
 const delivery=value.delivery;shape(delivery,['income','expense','reportCount','rows']);
 ['income','expense','reportCount'].forEach(key=>number(delivery[key]));
 list(delivery.rows,8,row=>{shape(row,['date','reportCount','income','expense']);text(row.date);number(row.reportCount);number(row.income);number(row.expense)});
 return value;
}

export function buildEmployeeHomeScreenDto(model,{date,employee},helpers){
 const {parseLooseMoneyValue,getAssetDisplayLabel,getAssetStatusLabel,formatShiftRangeLabel,
  formatAttendanceMomentForWorkDate,getAttendanceCompactSource}=helpers;
 const assetRows=model.employeeAssignedAssets.slice(0,3).map(asset=>({
  id:`${asset.id||''}`,label:getAssetDisplayLabel(asset),statusLabel:getAssetStatusLabel(asset.status),
  monthCost:[...model.employeeAssetCostRows.filter(row=>`${row.assetId||''}`===`${asset.id||''}`),
   ...model.employeeAssetExpenseRows.filter(row=>`${row.assetId||row.deliveryExpenseAssetId||''}`===`${asset.id||''}`)]
   .reduce((sum,row)=>model.isAssetRowInCurrentMonth(row)?sum+parseLooseMoneyValue(row.amount):sum,0),
 }));
 const record=model.todayRecord;
 const moment=(kind)=>({value:record?.[kind]?formatAttendanceMomentForWorkDate(record[kind],date,employee,kind):'-',
  source:getAttendanceCompactSource(record,kind),tone:record?.[kind]?'good':kind==='checkIn'?'bad':'warn'});
 return validateEmployeeHomeScreenDto({version:1,monthKey:model.monthKey,positionLabel:model.positionLabel,
  reviewStars:model.reviewSummary?model.reviewSummary.stars:null,
  salary:{netSalary:model.details.netSalary,workDays:model.details.workDays,salesRevenue:model.details.salesRevenue||0,
   rows:model.payrollSummaryRows.map(row=>({label:row.label,amount:row.amount,tone:row.tone||(row.amount===0?'slate':row.group==='deduction'?'bad':'good')}))},
  sales:{show:model.shouldShowSalesHomeStats,orderCount:model.salesOrderCount,customerCount:model.salesCustomerCount},
  assets:{show:model.shouldShowAssetHomeTile,count:model.employeeAssignedAssets.length,monthCost:model.employeeAssetMonthCost,
   latest:model.latestEmployeeAssetCost?{label:model.latestEmployeeAssetCostLabel||'Chi phí tài sản',amount:parseLooseMoneyValue(model.latestEmployeeAssetCost.amount)}:null,
   rows:assetRows},
  attendance:{status:model.attendanceStatus,tone:model.attendanceTone,shiftLabel:`${model.employeeShiftPolicy.shiftName} • ${formatShiftRangeLabel(model.employeeShiftPolicy)}`,
   in:moment('checkIn'),out:moment('checkOut'),lateMinutes:model.todayAttendanceTiming.lateMinutes,autoOvertimeMinutes:model.todayAttendanceTiming.autoOvertimeMinutes},
  delivery:{income:model.employeeDeliveryMonthSummary.income,expense:model.employeeDeliveryMonthSummary.expense,
   reportCount:model.employeeDeliveryMonthSummary.reportCount,rows:model.employeeDeliveryMonthSummary.rows.slice(0,8)
    .map(row=>({date:row.date,reportCount:row.reportCount,income:row.income,expense:row.expense}))},
 });
}
