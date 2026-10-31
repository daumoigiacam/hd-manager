// Frozen retain function from APK 9e0be28c; unrelated codecs omitted.
import { Timestamp, GeoPoint, Bytes, DocumentReference, VectorValue, vector, doc, refEqual } from 'firebase/firestore';
export function retainFirestoreWorkerValue(previous, next, depth = 0) {
  if (Object.is(previous, next)) return previous;
  if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object' || depth > 64) return next;
  for (const Type of [Timestamp, GeoPoint, Bytes, VectorValue]) {
    if (previous instanceof Type || next instanceof Type) {
      return previous instanceof Type && next instanceof Type && previous.isEqual(next) ? previous : next;
    }
  }
  if (previous instanceof DocumentReference || next instanceof DocumentReference) {
    return previous instanceof DocumentReference && next instanceof DocumentReference && refEqual(previous, next) ? previous : next;
  }
  if (previous instanceof Date || next instanceof Date) {
    return previous instanceof Date && next instanceof Date && Object.is(previous.getTime(), next.getTime()) ? previous : next;
  }
  const array = Array.isArray(next);
  if (array !== Array.isArray(previous)) return next;
  if (!array && (![Object.prototype, null].includes(Object.getPrototypeOf(previous))
    || Object.getPrototypeOf(previous) !== Object.getPrototypeOf(next))) return next;
  if (array && previous.length !== next.length) return next;
  const keys = Object.keys(next);let equal = keys.length === Object.keys(previous).length, result = next;
  for (const key of keys) {
    if (!Object.hasOwn(previous, key)) { equal = false;continue; }
    const value = retainFirestoreWorkerValue(previous[key], next[key], depth + 1);
    if (!Object.is(value, previous[key])) equal = false;
    if (!Object.is(value, next[key])) {
      if (result === next) result = array ? next.slice() : Object.setPrototypeOf({ ...next }, Object.getPrototypeOf(next));
      Object.defineProperty(result, key, { value, enumerable: true, configurable: true, writable: true });
    }
  }
  return equal ? previous : result;
}
