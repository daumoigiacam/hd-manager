// Business calendar, isolated lexical Date binding. Never changes global Date,
// authentication clocks, timestamps on disk, or the device timezone.
const NativeDate=globalThis.Date,OFFSET=7*60*60*1000;
export class BusinessDate extends NativeDate {
 constructor(...args){
  if(typeof args[0]==='string')args[0]=args[0].replace(/^(\d{4}-\d{2}-\d{2}) /,'$1T');
  if(args.length>=2){super(NativeDate.UTC(...args)-OFFSET);return;}
  if(typeof args[0]==='string'&&/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/.test(args[0]))args[0]+=(args[0].includes('T')?'':'T00:00:00')+'+07:00';
  super(...args);
 }
 getTimezoneOffset(){return -420;}
 toLocaleString(locale,options){return super.toLocaleString(locale,{timeZone:'Asia/Ho_Chi_Minh',...options});}
 toLocaleDateString(locale,options){return super.toLocaleDateString(locale,{timeZone:'Asia/Ho_Chi_Minh',...options});}
 toLocaleTimeString(locale,options){return super.toLocaleTimeString(locale,{timeZone:'Asia/Ho_Chi_Minh',...options});}
}
for(const part of ['FullYear','Month','Date','Day','Hours','Minutes','Seconds','Milliseconds']){
 Object.defineProperty(BusinessDate.prototype,'get'+part,{value:function(){return new NativeDate(this.getTime()+OFFSET)['getUTC'+part]();}});
 if(part!=='Day')Object.defineProperty(BusinessDate.prototype,'set'+part,{value:function(...args){const view=new NativeDate(this.getTime()+OFFSET);view['setUTC'+part](...args);return this.setTime(view.getTime()-OFFSET);}});
}
export const businessDayKey=value=>{const d=new BusinessDate(value);return Number.isNaN(d.getTime())?'':`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
// Same stored-date contract used by the Development history API. Payload dates
// remain unchanged; only the SQLite business-date index uses this key.
export function storedLocalBusinessDayKey(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?)?$/.test(value))return '';
 const key=value.slice(0,10),date=new NativeDate(key+'T00:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===key?key:'';
}
