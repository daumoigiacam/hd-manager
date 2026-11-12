import {startupSpan} from '../services/offlineStartupTrace.js';
import {ownsStoredOfflineSession} from './offlineScopeOwnership.js';

// One owner per secure-storage key, including overlapping old/new bootstrap
// instances in the same JS runtime. Never cache a grant or skip its checks.
const queues = new Map();
export function createOfflineSecureSessionStore({key, read, write, readReserved, acceptReservation, reservationUntil}) {
  let revision=0;
  const exclusive = work => {
    const queued=startupSpan('permission.store-queue-wait');
    const task = (queues.get(key) || Promise.resolve()).then(()=>{queued();return work();});
    const tail = task.catch(() => {});
    queues.set(key, tail);
    void tail.then(() => {if (queues.get(key) === tail) queues.delete(key);});
    return task;
  };
  return Object.freeze({
    revision:()=>revision,
    reservedUntil:record=>reservationUntil?.(record) ?? null,
    load: read,
    async readIdentity() {const record = await read();return record && !record.revoked ? record.identity : null;},
    // Signature, scope, lifetime and capability validation run while the same
    // queue excludes replacement/revocation, then persist the watermark. Thus
    // the native store needs one read + one write instead of read/read/write.
    withRecord: (verify,options) => exclusive(async () => {
      const loaded=startupSpan('permission.record-load');
      let record;try{record = await (readReserved || read)(options);}finally{loaded();}
      return verify(record, async (grant, at) => {
        if (!record || record.revoked || record.signedGrant !== grant) throw new Error('Customer session changed');
        // Only a process-local attestation from a completed native durable
        // reservation can satisfy this acknowledgement. Never a stored flag.
        if (acceptReservation?.(record, grant, at) === true) return;
        await write({...record, highWaterMs: Math.max(at, record.highWaterMs)});
      });
    }),
    advanceHighWater: (grant, at) => exclusive(async () => {
      const record = await read();
      if (!record || record.revoked || record.signedGrant !== grant) throw new Error('Customer session changed');
      await write({...record, highWaterMs: Math.max(at, record.highWaterMs)});
    }),
    // Optional immutable database locator, protected by the SAME native
    // encrypted session record. It grants no access and changes no permission.
    attachDatabaseBinding: (expected, binding) => exclusive(async () => {
      const record = await read();
      if (!ownsStoredOfflineSession(record, expected) || record.revoked) throw new Error('Database binding session changed');
      if (!binding || binding.version !== 1 || !/^hd_offline_[a-f0-9]{64}$/.test(binding.databaseName)
        || ['projectId','tenantId','principalId','permissionRevision'].some(key => binding[key] !== expected[key])) throw new Error('Database binding identity mismatch');
      await write({...record, databaseBinding: {...binding}});
    }),
    replace: record => {revision++;return exclusive(() => write(record));},
    revoke: expected => {revision++;return exclusive(async () => {
      const record = await read();
      if (!ownsStoredOfflineSession(record, expected)) return false;
      await write({...record, revoked: true});return true;
    });},
  });
}
