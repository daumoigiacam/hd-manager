// Read only the number of callbacks owned by Capacitor's bridge. Never return
// callback contents, scope values, session credentials or application payloads.
// Diagnostic use only, after the natural soak collector has released the app.
export async function readNativeBridgeCallbackCount(client) {
  const objectGroup = 'hd-native-listener-count-' + Date.now();
  const properties = objectId => client.send('Runtime.getProperties', {
    objectId, ownProperties: true, generatePreview: false,
  });
  try {
    const response = await client.send('Runtime.evaluate', {
      expression: 'window.androidBridge && window.androidBridge.onmessage',
      objectGroup, returnByValue: false, silent: true,
    });
    if (response.exceptionDetails || response.result?.type !== 'function' || !response.result.objectId)
      throw Error('Capacitor bridge callback function is unavailable');
    const functionProperties = await properties(response.result.objectId);
    const scopes = functionProperties.internalProperties?.find(item => item.name === '[[Scopes]]')?.value;
    if (!scopes?.objectId) throw Error('Bridge closure inspection unavailable; count is unknown');
    const scopeList = await properties(scopes.objectId);
    const candidates = (scopeList.result || []).filter(item => /^\d+$/.test(item.name)
      && item.value?.objectId && /^Closure(?: \(|$)/.test(item.value.description || '')
      && (item.value.description || '').includes('initNativeBridge'));
    if (candidates.length !== 1) throw Error('Unique native bridge closure not found; count is unknown');
    // Deliberately do not inspect any Global or Script scope.
    const closure = await properties(candidates[0].value.objectId);
    const callbacks = closure.result?.find(item => item.name === 'callbacks')?.value;
    if (!callbacks?.objectId || callbacks.subtype !== 'map') throw Error('Bridge callback map not found; count is unknown');
    const size = await client.send('Runtime.callFunctionOn', {
      objectId: callbacks.objectId, functionDeclaration: 'function(){ return this.size; }',
      returnByValue: true, silent: true,
    });
    if (size.exceptionDetails || !Number.isSafeInteger(size.result?.value) || size.result.value < 0)
      throw Error('Bridge callback count is invalid');
    return size.result.value;
  } finally {
    await client.send('Runtime.releaseObjectGroup', {objectGroup});
  }
}
