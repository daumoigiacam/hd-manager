// Presentation only. Pending, failed, conflicting or incomplete receipts must
// remain visible; only a durably accepted receipt belongs in folded history.
export function cashflowQueueGroups(rows){
 const pending=[],confirmed=[];
 for(const row of rows)(row.state==='SYNCED'&&row.receipt?.outcome==='accepted'?confirmed:pending).push(row);
 return {pending,confirmed};
}
