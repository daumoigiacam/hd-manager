export function localQueueNeedsAttention({rows=[],hasMore=false,error=false}){
 return Boolean(error||hasMore||rows.some(row=>row.state!=='SYNCED'||row.receipt?.outcome!=='accepted'));
}
