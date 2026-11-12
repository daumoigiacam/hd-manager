// A short, memory-only resume window. Never restores an account from disk.
export const WARM_RESUME_WINDOW_MS = 5 * 60 * 1000;

export async function unlockWarmSession({ lease, user, scope, currentUser, authenticate, now = Date.now }) {
  const valid = () => Boolean(lease && user && !user.isAnonymous && currentUser() === user
    && lease.user === user && lease.scope === scope
    && now() >= lease.lockedAt && now() - lease.lockedAt < WARM_RESUME_WINDOW_MS);
  if (!valid()) return { fallback: true };
  const token = await user.getIdTokenResult(false);
  const expiresAt = Date.parse(token.expirationTime);
  if (!valid() || !Number.isFinite(expiresAt) || expiresAt <= now() + 30000) return { fallback: true };
  const authenticated = await authenticate();
  if (!authenticated || !valid() || expiresAt <= now() + 30000) return { success: false };
  return { success: true, warm: true };
}
