// Fabricated fixture only. No files/accounts exported from a real installation.
export function makeFixture(role='manager',size=1000){
 const companyId='phase2-fictional',employeeId='fixture-employee',customerId='fixture-customer';
 const claims={uid:role==='customer'?customerId:employeeId,identityId:'fixture-identity',appUserId:role==='customer'?customerId:employeeId,
  companyId,accountType:role==='customer'?'customer':'employee',role:role==='manager'?'super_admin':role==='customer'?'customer':'employee',name:'Synthetic Account'};
 if(role==='customer')claims.customerId=customerId;
 const today=new Date().toLocaleDateString('sv-SE');
 const data={__replaceSeed:true,companies:{[companyId]:{id:companyId,name:'Synthetic Company'}},
  employees:{[employeeId]:{id:employeeId,companyId,name:'Synthetic Account',role:claims.role,position:'Kinh doanh'}},customers:{},products:{},orders:{},expenses:{}};
 for(let i=0;i<size;i++){
  const id=i===0?customerId:`fiction-customer-${i}`;
  data.customers[id]={id,companyId,name:`Synthetic Customer ${i}`,empId:employeeId,phone:'',isArchived:false};
  const productId=`fiction-product-${i}`;data.products[productId]={id:productId,companyId,name:`Synthetic Product ${i}`,unit:'Kg',price:10000,category:'Fixture'};
 }
 for(let i=0;i<200;i++){
  const id=`fiction-order-${i}`;data.orders[id]={id,companyId,customerId,empId:employeeId,date:today,status:'completed',total:10000,items:[],paidAmount:0};
  const expenseId=`fiction-expense-${i}`;data.expenses[expenseId]={id:expenseId,companyId,date:today,amount:1000,type:'Chi khác',status:'confirmed',description:'Synthetic only'};
 }
 return {claims,data};
}
export function installFixture({claims,data}){
 if(location.hostname!=='127.0.0.1'&&location.hostname!=='localhost'&&location.hostname!=='hd-perf.invalid')throw Error('Fixture requires isolated local origin');
 localStorage.clear();sessionStorage.clear();
 window.__initial_auth_token=`hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;
 localStorage.setItem('hd-manager-local-db-v2-clean-preview',JSON.stringify(data));
 window.__phase2Observed={started:performance.now(),raf:0,longTasks:[],errors:[],shell:null};
 window.addEventListener('error',event=>window.__phase2Observed.errors.push(String(event.message)));
 try{new PerformanceObserver(list=>{for(const e of list.getEntries()){
  const s=window.__phase2Observed;s.longTaskCount=(s.longTaskCount||0)+1;s.longTaskMax=Math.max(s.longTaskMax||0,e.duration);
  s.longTasks.push({start:e.startTime,duration:e.duration});if(s.longTasks.length>500)s.longTasks.shift();
 }}).observe({entryTypes:['longtask']})}catch{/* unsupported stays unknown */}
}
