export const MAX_AUTOMATIC_WRITE_ATTEMPTS = 6;

export const isRetryableWriteError = error => {
  const code = String(error?.code || '').toLowerCase().replace(/^firestore\//, '');
  return ['unavailable', 'deadline-exceeded', 'resource-exhausted', 'aborted',
    'cancelled', 'internal', 'unknown', 'hd_timeout', 'rest-write-failed'].includes(code)
    || (!code && /network|fetch|offline|timeout|connection/i.test(String(error?.message || '')));
};

export function pendingWriteFailure(write, error, now = Date.now()) {
  const attempts = (Number(write.attempts) || 0) + 1;
  const retryable = isRetryableWriteError(error);
  return {
    attempts,
    lastErrorCode: error?.code || 'write-failed',
    syncState: !retryable ? 'blocked' : attempts >= MAX_AUTOMATIC_WRITE_ATTEMPTS ? 'paused' : 'queued',
    nextRetryAt: retryable ? now + Math.min(300000, 30000 * 2 ** (attempts - 1)) : null,
  };
}

export const canAutomaticallyRetryWrite = (write, actorUid, now = Date.now()) => (
  !['blocked', 'paused'].includes(write.syncState)
  && (Number(write.attempts) || 0) < MAX_AUTOMATIC_WRITE_ATTEMPTS
  && (!write.nextRetryAt || write.nextRetryAt <= now)
  && (!write.actorUid || write.actorUid === actorUid)
  && (!write.payload?.actorUid || write.payload.actorUid === actorUid)
);
