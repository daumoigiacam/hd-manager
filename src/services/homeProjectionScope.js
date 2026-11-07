// A retained report is usable only in the same verified data/permission scope.
// Source identity differences still leave it pending until recalculated.
export const hasSameDashboardProjectionScope=(previous,next)=>Boolean(previous&&next
 &&previous.company?.id===next.company?.id
 &&previous.employee?.id===next.employee?.id
 &&previous.dashboardDayKey===next.dashboardDayKey
 &&previous.dashboardClockScope===next.dashboardClockScope
 &&(typeof next.privacyScope==='string'
  ?Boolean(next.privacyScope)&&previous.privacyScope===next.privacyScope
  :previous.privacyScope===undefined&&previous.company===next.company&&previous.employee===next.employee));
