// Storage owns atomic leases and command/receipt transitions. Transport must
// use an authenticated, server-idempotent endpoint, never direct blind writes.
export function createOfflineSyncEngine({ repository, transport, session, online,
  now = Date.now, random = Math.random, maxAttempts = 8, leaseMs = 60000,
  requestTimeoutMs = 20000, schedule = setTimeout, cancel = clearTimeout }) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20
    || requestTimeoutMs <= 0 || leaseMs <= requestTimeoutMs) throw new TypeError('Invalid sync limits');
  let stopped = false, running = null, timer = null, controller = null, notified=false;
  const scope = Object.freeze({ ...session.scope });
  const usable = () => !stopped && session.isCurrent(scope) && online();
  const wake = (delay = 0) => {
    if (stopped) return;
    if (timer !== null) cancel(timer);
    timer = schedule(() => { timer = null; void drain().catch(() => wake(5000)); }, delay);
  };
  async function send(command) {
    controller = new AbortController();
    const signal = controller.signal;
    let timeout;
    try {
      return await Promise.race([
        transport.send(command, { scope, signal }),
        new Promise((_, reject) => {
          timeout = schedule(() => {
            controller?.abort();
            reject(Object.assign(new Error('Sync request timed out'), {code:'deadline-exceeded'}));
          }, requestTimeoutMs);
        }),
      ]);
    } finally { cancel(timeout); controller = null; }
  }
  async function run() {
    while (usable()) {
      // claimDue must atomically lease one command whose dependencies are SYNCED.
      // It also recovers expired leases without changing the idempotency key.
      const command = await repository.claimDue(scope, {now:now(),leaseMs,maxAttempts});
      if (!command) { if (usable()&&(!repository.countRetryable||await repository.countRetryable())) wake(5000); return; }
      if (!usable()) return; // lease is recoverable; never switch it to another user.
      if (!['commandId','idempotencyKey','payloadDigest'].every(key => typeof command[key] === 'string' && command[key].length > 0)
        || !Number.isInteger(command.attempts) || command.attempts < 1 || command.attempts > maxAttempts) {
        throw new TypeError('Invalid leased command');
      }
      let result;
      try { result = await send(command); }
      catch (error) {
        if (!session.isCurrent(scope) || stopped) return;
        const transient = new Set(['unavailable','deadline-exceeded','resource-exhausted','network-error']);
        const retry = transient.has(error?.code) && command.attempts < maxAttempts;
        const delay = Math.round(Math.min(300000, 1000 * 2 ** Math.min(command.attempts, 18))
          * (0.75 + Math.max(0, Math.min(1, random())) * 0.5));
        await repository.failLease(scope, command, {
          state: retry ? 'PENDING_SYNC' : 'SYNC_FAILED',
          code: transient.has(error?.code) ? error.code : 'sync-rejected',
          nextAttemptAt: retry ? now() + delay : null,
        });
        continue;
      }
      if (!session.isCurrent(scope) || stopped) return;
      // HTTP 200 alone is not acknowledgement. Bind receipt to exact intent.
      if (result?.commandId !== command.commandId || result?.idempotencyKey !== command.idempotencyKey
        || result?.tenantId !== scope.tenantId || result?.principalId !== scope.principalId
        || result?.payloadDigest !== command.payloadDigest
        || !['accepted','conflict','rejected'].includes(result?.outcome)) {
        await repository.failLease(scope, command, {state:'SYNC_FAILED',code:'invalid-receipt',nextAttemptAt:null});
      } else {
        try { await repository.applyReceipt(scope, command, result); }
        catch (_error) {
          if (!session.isCurrent(scope) || stopped) return;
          // A failed local receipt transaction must leave the original intent
          // intact. Replay that same key; the server already owns its receipt.
          try {
            await repository.failLease(scope, command, {
              state: command.attempts < maxAttempts ? 'PENDING_SYNC' : 'SYNC_FAILED',
              code: 'receipt-local-commit-failed',
              nextAttemptAt: now() + 5000,
            });
          } catch {
            // Storage may still be unavailable. Keep the recoverable lease;
            // never manufacture an acknowledgement in memory.
          }
          if (usable()) wake(5000);
          return;
        }
      }
      // Yield between commands; no eager full-queue materialization.
      await new Promise(resolve => schedule(resolve, 0));
    }
  }
  function drain() {
    if (running) return running;
    if (!usable()) return Promise.resolve();
    notified=false;
    running = run().finally(() => { running = null;if(notified&&usable())wake(); });
    return running;
  }
  // Explicit user intent, serialized with this SAME engine's automatic drain.
  // One send only; failure stays terminal. Attempts/history are never reset.
  function retryFailedCommand(request) {
    if (!usable()) return Promise.reject(Object.assign(Error('Sync owner offline or closed'),{code:'unavailable'}));
    if (running) return Promise.reject(Object.assign(Error('Sync owner busy'),{code:'busy'}));
    if (typeof repository.claimFailed!=='function') return Promise.reject(Error('Explicit retry unavailable'));
    const task=(async()=>{
      const command=await repository.claimFailed(scope,request,{now:now(),leaseMs});
      if (!usable()) return; // Lease remains recoverable; no send under another owner.
      if (!command || command.commandId!==request.commandId || command.entityId!==request.entityId || command.payloadDigest!==request.payloadDigest
        || command.idempotencyKey!==command.commandId || !Number.isSafeInteger(command.attempts) || command.attempts<1) throw Error('Invalid explicit retry lease');
      let result;
      try { await repository.authorizeExplicitRetry(scope,command);if(!usable())return;result=await send(command); }
      catch(error) {
        if (!session.isCurrent(scope)||stopped) return;
        const transient=new Set(['unavailable','deadline-exceeded','resource-exhausted','network-error']);
        await repository.failLease(scope,command,{state:'SYNC_FAILED',code:transient.has(error?.code)?error.code:'sync-rejected',nextAttemptAt:null});
        return {commandId:command.commandId,state:'SYNC_FAILED',serverConfirmed:false};
      }
      if (!session.isCurrent(scope)||stopped) return;
      if (result?.commandId!==command.commandId || result?.idempotencyKey!==command.idempotencyKey || result?.tenantId!==scope.tenantId
        || result?.principalId!==scope.principalId || result?.payloadDigest!==command.payloadDigest || !['accepted','conflict','rejected'].includes(result?.outcome)) {
        await repository.failLease(scope,command,{state:'SYNC_FAILED',code:'invalid-receipt',nextAttemptAt:null});
        return {commandId:command.commandId,state:'SYNC_FAILED',serverConfirmed:false};
      }
      try { await repository.applyReceipt(scope,command,result); }
      catch(error) {
        if (!session.isCurrent(scope)||stopped) return;
        const acceptedTransient=result.outcome==='accepted'&&['SQLITE_BUSY','SQLITE_LOCKED','SQLITE_IOERR'].includes(error?.code);
        const code=acceptedTransient?'receipt-accepted-local-transient':result.outcome==='conflict'?'receipt-conflict-local-failed':result.outcome==='rejected'?'receipt-rejected-local-failed':'receipt-local-invalid';
        await repository.failLease(scope,command,{state:'SYNC_FAILED',code,nextAttemptAt:null});
        return {commandId:command.commandId,state:'SYNC_FAILED',serverConfirmed:false};
      }
      const state={accepted:'SYNCED',conflict:'CONFLICT_REQUIRES_REVIEW',rejected:'SYNC_FAILED'}[result.outcome];
      return {commandId:command.commandId,state,serverConfirmed:state==='SYNCED'};
    })();
    running=task.finally(()=>{running=null;if(usable())wake();});
    return running;
  }

  function stop() {
    stopped = true;
    if (timer !== null) cancel(timer);
    timer = null; controller?.abort();
    unsubscribe();
  }
  const unsubscribe = session.subscribe(() => { if (!session.isCurrent(scope)) stop(); });
  return Object.freeze({start:()=>wake(),drain,retryFailedCommand,notifyConnectivity:()=>{notified=true;wake();},stop});
}
