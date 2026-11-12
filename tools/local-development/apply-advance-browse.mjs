import fs from'node:fs/promises';import{workspace}from'./environment.mjs';
const root=workspace+'/development/hd-manager/application/src/',files=[root+'data/offlineBusinessDirectory.js',root+'data/offlineBusinessSearchProjection.js',root+'data/offlineSalaryAdvanceRepository.js',root+'data/bootstrapOfflineCustomer.js'],backup=workspace+'/.local-dev/source-backups/advance-browse-'+Date.now(),data=new Map();await fs.mkdir(backup,{recursive:true});for(const f of files){const s=await fs.readFile(f,'utf8');data.set(f,s);await fs.writeFile(backup+'/'+f.split('/').at(-1),s);}const rep=(f,a,b)=>{const s=data.get(f);if(!s.includes(a)||s.indexOf(a)!==s.lastIndexOf(a))throw Error('Missing/ambiguous boundary '+f+' '+a.slice(0,50));data.set(f,s.replace(a,b));};
const[directory,projection,repo,boot]=files;
rep(directory,"import {normalizeSearchText}","import{salaryAdvanceMonthSql}from'./salaryAdvanceDirectorySql.js';\nimport {normalizeSearchText}");
rep(directory,"  payrollSnapshots: {cap:","  advances: {cap:'home.payroll.read',precision:'month',dates:['salaryMonth','deductionMonth','payrollMonth','date','createdAt'],employee:['empId'],fields:['companyId','empId','amount','reason','salaryMonth','deductionMonth','payrollMonth','date','status','isArchived','linkedFinancialRecordId','financialRecordId'],search:['reason']},\n  payrollSnapshots: {cap:");
rep(directory,"const sort = s.precision === 'month' ? `COALESCE(${j('monthKey')},'')`", "const sort = s.precision === 'month' ? `COALESCE(${source==='advances'?salaryAdvanceMonthSql(j):j('monthKey')},'')`");
rep(directory,"if (o.monthKey) add(`${j('monthKey')}=?`,o.monthKey);", "if (o.monthKey) add(`${source==='advances'?salaryAdvanceMonthSql(j):j('monthKey')}=?`,o.monthKey);");
rep(projection,"  orderRequests:['customerName'", "  advances:['reason'],\n  orderRequests:['customerName'");
rep(boot,"page(source,options){return businessForeground.run(async()=>{const value=await raw.page(source,options);requestBusinessSearch(source);return value;});}","page(source,options){return businessForeground.run(async()=>{const value=await raw.page(source,options);if(source!=='advances'||options?.text)requestBusinessSearch(source);return value;});}");
rep(boot,"for(const request of plan)requestBusinessSearch(request.source);", "for(const request of plan)if(request.source!=='advances'||request.options?.text)requestBusinessSearch(request.source);");
rep(boot,"([,{createOfflineSalaryAdvanceRepository}])", "([directory,{createOfflineSalaryAdvanceRepository}])");
rep(boot,"createOfflineSalaryAdvanceRepository({database,session,projectId,development:true,employeeId:appSession.currentUser.id,deviceId:expected.deviceId,digest,uuid,authorize:fullAuthorize})", "createOfflineSalaryAdvanceRepository({database,session,projectId,development:true,employeeId:appSession.currentUser.id,deviceId:expected.deviceId,digest,uuid,authorize:fullAuthorize,authorizeRead:authorize,directory})");
rep(repo,"const grant=await authorize({scope,kind});", "const grant=await(kind==='home.read'&&options.authorizeRead?options.authorizeRead:authorize)({scope,kind});");
rep(repo,"  read:()=>tx(complete),",`  read:()=>tx(complete),
  async browse({monthKey,employeeCursor=null,advanceCursor=null,checkpoint=null}={}){
   await access();if(!options.directory?.pageBatch)fail('Chưa nối danh mục SQLite hiện có.');
   const pages=await options.directory.pageBatch([{source:'employees',options:{limit:40,cursor:employeeCursor,checkpoint}},{source:'advances',options:{limit:40,cursor:advanceCursor,checkpoint,monthKey}}]);await access();
   return{sources:{employees:pages[0].items.map(r=>r.document),advances:pages[1].items.map(r=>r.document)},pages:{employees:pages[0],advances:pages[1]}};
  },`);
for(const[f,s]of data)await fs.writeFile(f,s);await fs.writeFile(backup+'/manifest.json',JSON.stringify({at:new Date().toISOString(),files,productionChanged:false},null,2));console.log(JSON.stringify({backup,files:files.length}));
