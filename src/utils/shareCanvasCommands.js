export function replayShareCanvas(context, commands) {
  for (const [kind, key, value] of commands) {
    if (kind === 'set') context[key] = value;
    else context[key](...value);
  }
}
