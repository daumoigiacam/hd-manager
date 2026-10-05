/**
 * @param {{allowed: boolean, lock: {current: boolean}, setBusy: (busy: boolean) => void,
 * execute: () => Promise<unknown>, setError: (error: string) => void,
 * errorMessage: (error: unknown) => string}} ports
 */
export async function runDispatchEditorCommand({allowed, lock, setBusy, execute, setError, errorMessage}) {
  if (!allowed || lock.current) return;
  lock.current = true;
  setBusy(true);
  try { await execute(); }
  catch (error) { setError(errorMessage(error)); }
  finally { lock.current = false; setBusy(false); }
}
