// HD Manager's existing Firestore expenses are the money-movement authority.
// This adapter creates no account balance, chart of accounts or second ledger.
const {createHash}=require('node:crypto');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=message=>{throw Object.assign(Error(message),{code:'failed-precondition'});};
const SOURCE='payroll_settlement';
const sources=new WeakMap();
function createPayrollCashflowSource({db,appId,getCompanyBankAccounts}){
 if(typeof getCompanyBankAccounts!=='function')throw Error('Original company bank-account resolver required');
 const root=`artifacts/${appId}/public/data`,voucher=id=>db.doc(`${root}/expenses/${id}`);
 const source={
  async read(tx,actor,snapshot){
   // Never silently repost or reinterpret the earlier Local-only payments.
   const legacy=await tx.get(db.collection('payrollSettlementPayments').where('tenantId','==',actor.tenantId).where('snapshotId','==',snapshot.id).limit(1));
   if(!legacy.empty&&legacy.size)fail('Legacy salary payment needs explicit financial reconciliation; no automatic repost');
   const rows=await tx.get(db.collection(root+'/expenses').where('companyId','==',actor.tenantId).where('payrollSnapshotId','==',snapshot.id).limit(201));
   if(rows.size>200)fail('Salary voucher history exceeds reviewed transaction bound');
   const payments=rows.docs.map(row=>{
    const expense=row.data(),payment=expense.payrollSettlement;
    if(expense.sourceType!==SOURCE||expense.isArchived||expense.requiresApproval!==false||expense.approvalStatus!=='approved'||expense.handoverStatus!=='confirmed'
      ||!payment||payment.expenseId!==row.id||payment.tenantId!==actor.tenantId||payment.snapshotId!==snapshot.id||payment.periodId!==snapshot.periodId
      ||payment.employeeId!==snapshot.employeeId||payment.monthKey!==snapshot.monthKey||payment.amountVnd!==expense.amount
      ||expense.payrollPaymentId!==payment.id||!Number.isSafeInteger(expense.amount)||expense.amount<=0)fail('Salary financial voucher is missing, unconfirmed or inconsistent');
    return {...payment,expenseId:row.id,financialSource:'expenses'};
   });
   if(new Set(payments.map(p=>p.referenceKey)).size!==payments.length||new Set(payments.map(p=>p.id)).size!==payments.length)fail('Duplicate salary financial voucher');
   const company=(await tx.get(db.doc(root+'/companies/'+actor.tenantId))).data();
   if(!company||company.isArchived)fail('Salary funding company unavailable');
   const fundingAccounts=actor.pay?getCompanyBankAccounts(company).filter(a=>a&&typeof a.id==='string'&&a.bankAccountNumber&&!a.isArchived&&!['inactive','blocked','deleted'].includes(a.status)).map(a=>({id:a.id,bankName:a.bankName||'',bankAccountName:a.bankAccountName||'',bankAccountNumber:a.bankAccountNumber})):[];
   return {payments,fundingAccounts};
  },
  async pay(tx,actor,ctx,command,p,at,event){
   if(!actor.approveFinancial)throw Object.assign(Error('Current finance approval permission required before money is recorded as paid'),{code:'permission-denied'});
   const account=p.method==='Chuyển khoản'?ctx.fundingAccounts.find(a=>a.id===p.fundingAccountId):null;
   if(p.method==='Chuyển khoản'&&!account||p.method==='Tiền mặt'&&p.fundingAccountId!=null&&p.fundingAccountId!=='cash')fail('Select a current company funding account');
   const expenseId='payroll_payment_'+hash([appId,actor.tenantId,command.commandId]);
   const ref=voucher(expenseId);
   if((await tx.get(ref)).exists)fail('Financial voucher already exists without matching salary receipt');
   const referenceKey=hash([appId,actor.tenantId,p.reference.trim().toUpperCase()]);
   const reference=db.doc('payrollSettlementReferences/'+referenceKey);
   if((await tx.get(reference)).exists)fail('Payment reference already used');
   const payment={id:command.commandId,expenseId,tenantId:actor.tenantId,snapshotId:ctx.source.id,periodId:ctx.source.periodId,monthKey:ctx.source.monthKey,
    employeeId:ctx.source.employeeId,amountVnd:p.amountVnd,reference:p.reference.trim(),referenceKey,method:p.method,note:p.note.trim(),
    fundingAccountId:account?.id||'cash',fundingAccount:account||null,sourceFingerprint:ctx.sourceFingerprint,
    paidAt:at,paidBy:actor.employeeId,paidByPrincipalId:actor.principalId,receivedAt:null,receivedBy:null,history:[event]};
   // Financial day uses the same fixed Vietnam business timezone as Home.
   const date=new Date(Date.parse(at)+7*60*60*1000).toISOString().slice(0,10);
   const document={id:expenseId,companyId:actor.tenantId,empId:actor.employeeId,amount:p.amountVnd,date,note:p.note.trim(),category:'Thanh toán lương',method:p.method,
    sourceType:SOURCE,payrollSnapshotId:ctx.source.id,payrollPaymentId:command.commandId,payrollSettlement:payment,
    requiresApproval:false,approvalStatus:'approved',handoverStatus:'confirmed',approvedAt:at,approvedByEmployeeId:actor.employeeId,
    createdAt:at,createdByPrincipalId:actor.principalId,createdByRole:actor.position||'staff',isArchived:false,offlineCashflowRevision:1};
   return {payment,writes:[[ref,document],[reference,{tenantId:actor.tenantId,paymentId:command.commandId,snapshotId:ctx.source.id,expenseId}]]};
  },
  async acknowledge(tx,payment,update){
   const ref=voucher(payment.expenseId),saved=await tx.get(ref);
   if(!saved.exists||saved.data().payrollPaymentId!==payment.id)fail('Confirmed salary voucher unavailable');
   const stored={...update};delete stored.financialSource;
   return [ref,{...saved.data(),payrollSettlement:stored}];
  }
 };
 sources.set(source,{db,appId});return Object.freeze(source);
}
module.exports={createPayrollCashflowSource,isPayrollCashflowSource:(value,db,appId)=>sources.get(value)?.db===db&&sources.get(value)?.appId===appId,PAYROLL_CASHFLOW_SOURCE:SOURCE};
