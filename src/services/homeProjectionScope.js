// A retained report is usable only in the same verified data/permission scope.
// Source identity differences still leave it pending until recalculated.
export const hasSameDashboardProjectionScope=(previous,next)=>Boolean(previous&&next
 &&typeof next.privacyScope==='string'&&next.privacyScope
 &&typeof next.dashboardDayKey==='string'&&next.dashboardDayKey
 &&previous.privacyScope===next.privacyScope
 &&previous.company?.id===next.company?.id
 &&previous.employee?.id===next.employee?.id
 &&previous.dashboardDayKey===next.dashboardDayKey
 &&previous.dashboardClockScope===next.dashboardClockScope);
