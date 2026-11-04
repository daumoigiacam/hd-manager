// Existing subscription owner, worker and LRU stay in charge. Admit Home's
// required sources together instead of queueing its tail as main-page REST.
// Other routes immediately return to their original listener budget.
export function getHomeCriticalReadCapacity({enabled=false,workerAvailable=false,tab,baseLimit,requestedNames=[],availableNames=[],baselineNames=[]}){
 if(!Number.isInteger(baseLimit)||baseLimit<0||baseLimit>32)throw new TypeError('Invalid foreground listener limit');
 if(!enabled||!workerAvailable||tab!=='home')return baseLimit;
 const available=new Set(availableNames),baseline=new Set(baselineNames);
 const required=new Set(requestedNames.filter(name=>available.has(name)&&!baseline.has(name)));
 return Math.max(baseLimit,Math.min(16,required.size));
}
