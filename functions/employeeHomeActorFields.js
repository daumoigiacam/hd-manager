// Only the public actor authorization boundary uses this mask. Financial,
// payroll and display inputs still come from the complete source snapshot.
// Keep every flag read by employeeHomeApi.matchesActor/active, including legacy
// accountStatus. An omitted/unknown field must never weaken a lock check.
const EMPLOYEE_HOME_ACTOR_READ_OPTIONS=Object.freeze({fieldMask:Object.freeze([
 'companyId','isArchived','disabled','lockedAt','status','accountStatus',
])});
module.exports={EMPLOYEE_HOME_ACTOR_READ_OPTIONS};
