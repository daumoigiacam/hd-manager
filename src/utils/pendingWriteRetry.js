export const MAX_AUTOMATIC_WRITE_ATTEMPTS = 6;

export const isRetryableWriteError = error => {
  const code = String(error?.code || '').toLowerCase().replace(/^firestore\//, '');
  return ['unavailable', 'deadline-exceeded', 'resource-exhausted', 'aborted',
    'cancelled', 'internal', 'unknown', 'hd_timeout', 'rest-write-failed'].includes(code)
    || (!code && /network|fetch|offline|timeout|connection/i.test(String(error?.message || '')));
};

export function pendingWriteFailure(write, error, now = Date.now(), random = Math.random) {
  const attempts = (Number(write.attempts) || 0) + 1;
  const retryable = isRetryableWriteError(error);
  const sample=Number(random()),jitter=Number.isFinite(sample)?Math.max(0,Math.min(1,sample)):.5;
  const delay=Math.min(60000,1500*2**Math.min(attempts-1,6))*(.5+jitter);
  return {
    attempts,
    lastErrorCode: error?.code || 'write-failed',
    syncState: !retryable ? 'blocked' : attempts >= MAX_AUTOMATIC_WRITE_ATTEMPTS ? 'paused' : 'queued',
    nextRetryAt: retryable ? now + Math.round(delay) : null,
  };
}

export const canAutomaticallyRetryWrite = (write, actorUid, now = Date.now()) => (
  !['blocked', 'paused'].includes(write.syncState)
  && (Number(write.attempts) || 0) < MAX_AUTOMATIC_WRITE_ATTEMPTS
  && (!write.nextRetryAt || write.nextRetryAt <= now)
  && (!write.actorUid || write.actorUid === actorUid)
  && (!write.payload?.actorUid || write.payload.actorUid === actorUid)
);
