export const PERSONAL_HOME_INPUT_KINDS=Object.freeze({employee:'scalar',employees:'array',attendance:'map',financials:'array',
 performance:'map',customers:'array',orders:'array',payments:'array',holidays:'array',employeeReviews:'array',deliveryReports:'array'});
const invalid=()=>{throw new TypeError('Invalid personal Home projection transfer.');};

export function* personalHomeInputRows(input,encode) {
 for(const [name,kind] of Object.entries(PERSONAL_HOME_INPUT_KINDS)){
  const value=input[name];
  if(kind==='array'){
   if(!Array.isArray(value))invalid();
   for(let index=0;index<value.length;index++)yield {name,key:index,value:encode(value[index])};
  }else if(kind==='map'){
   if(!value||typeof value!=='object'||Array.isArray(value))invalid();
   for(const key of Object.keys(value))yield {name,key,value:encode(value[key])};
  }else yield {name,key:0,value:encode(value)};
 }
}

export function getPersonalHomeInputCounts(input) {
 return Object.fromEntries(Object.entries(PERSONAL_HOME_INPUT_KINDS).map(([name,kind])=>{
  const value=input[name];
  if(kind==='array'&&!Array.isArray(value)||kind==='map'&&(!value||typeof value!=='object'||Array.isArray(value)))invalid();
  return [name,kind==='scalar'?1:kind==='array'?value.length:Object.keys(value).length];
 }));
}

export function createPersonalHomeInputAssembler({decode,monthKey,expectedCounts}) {
 if(typeof decode!=='function'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey))invalid();
 const input={monthKey},counts={};let index=0,closed=false;
 if(!expectedCounts||Object.keys(expectedCounts).length!==Object.keys(PERSONAL_HOME_INPUT_KINDS).length)invalid();
 for(const [name,kind] of Object.entries(PERSONAL_HOME_INPUT_KINDS)){
  if(!Number.isSafeInteger(expectedCounts[name])||expectedCounts[name]<0||kind==='scalar'&&expectedCounts[name]!==1)invalid();
  input[name]=kind==='array'?[]:kind==='map'?Object.create(null):null;counts[name]=0;
 }
 return {
  chunk(message){
   if(closed||message.index!==index++||!Array.isArray(message.rows)||!message.rows.length||message.rows.length>64)invalid();
   for(const row of message.rows){
    if(!row||!Object.hasOwn(PERSONAL_HOME_INPUT_KINDS,row.name))invalid();
    const kind=PERSONAL_HOME_INPUT_KINDS[row.name],value=decode(row.value);
    if(kind==='array'){if(row.key!==counts[row.name])invalid();input[row.name].push(value)}
    else if(kind==='map'){
     if(typeof row.key!=='string'||Object.hasOwn(input[row.name],row.key))invalid();
     Object.defineProperty(input[row.name],row.key,{value,writable:true,enumerable:true,configurable:true});
    }else{if(row.key!==0||counts[row.name])invalid();input[row.name]=value}
    if(++counts[row.name]>expectedCounts[row.name])invalid();
   }
  },
  finish(message){
   if(closed||message.chunks!==index||!message.counts||Object.keys(message.counts).length!==Object.keys(counts).length)invalid();
   for(const [name,count] of Object.entries(counts))if(message.counts[name]!==count||count!==expectedCounts[name])invalid();
   if(counts.employee!==1||!input.employee?.id)invalid();closed=true;return input;
  },
 };
}
