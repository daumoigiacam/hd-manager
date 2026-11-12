// One entry per immutable record; recreate the cache when external sources change.
export function createRecordCalculationCache(calculate) {
  const cache = new WeakMap();
  return (record, ...context) => {
    if (!record || typeof record !== 'object') return calculate(record, ...context);
    const previous = cache.get(record);
    if (previous && previous.context.length === context.length
      && context.every((value, index) => Object.is(value, previous.context[index]))) {
      return previous.value;
    }
    const value = calculate(record, ...context);
    cache.set(record, { context, value });
    return value;
  };
}
