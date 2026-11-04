// Parse Android dumpsys/proc output only. No ADB command or device side effect.
export function parseAndroidProcessMetrics(memory,status,stat){
 const number=(text,regex)=>{const m=String(text).match(regex);return m?Number(m[1]):null};
 const end=String(stat).lastIndexOf(')'),fields=end>=0?String(stat).slice(end+1).trim().split(/\s+/):[];
 const tick=i=>fields.length>i&&/^\d+$/.test(fields[i])?Number(fields[i]):null;
 const nativeRow=String(memory).split(/\r?\n/).find(line=>/^\s*Native Heap\s+\d/.test(line));
 const native=nativeRow?.trim().split(/\s+/).slice(2).map(Number);
 return{pssKb:number(memory,/TOTAL:\s*(\d+)/),rssKb:number(status,/^VmRSS:\s*(\d+)/m),
  nativeHeapAllocatedKb:native?.length>=3&&Number.isFinite(native.at(-2))?native.at(-2):null,
  userTicks:tick(11),systemTicks:tick(12)};
}
