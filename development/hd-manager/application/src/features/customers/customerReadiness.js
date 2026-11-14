// Select a reader; this never grants access. The SQLite adapter still checks
// principal/tenant and the signed runtime before every protected read.
export function customerReadiness({localFirstRequired=false, runtimeCurrent=false,
  supplementsRequested=false, online=true, setupError=''}={}) {
  if(localFirstRequired && (!supplementsRequested || !online)) {
    if(runtimeCurrent)return 'sqlite';
    return !online || setupError ? 'authorization-unavailable' : 'restoring';
  }
  // A cloud directory response is not a durable, authorized Offline snapshot.
  if(!online)return 'offline-not-configured';
  return 'cloud';
}
