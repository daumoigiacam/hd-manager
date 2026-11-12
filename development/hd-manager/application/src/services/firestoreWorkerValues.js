import { Timestamp, GeoPoint, Bytes, DocumentReference, VectorValue, vector, doc, refEqual } from 'firebase/firestore';
export { decodeFirestoreNativeValue } from './firestoreNativeWireValues.js';

// Every value is tagged, including ordinary maps/arrays, so user field names
// cannot collide with transport markers. No private SDK fields are inspected.
export function encodeFirestoreWorkerValue(value, db, depth = 0) {
  if (depth > 64) throw new TypeError('Firestore worker value nesting exceeds the supported depth.');
  if (value === null) return [0];
  if (typeof value === 'string') return [1, value];
  if (typeof value === 'number') return [2, value];
  if (typeof value === 'boolean') return [3, value];
  if (value === undefined) return [4];
  if (value instanceof Timestamp) return [5, value.seconds, value.nanoseconds];
  if (value instanceof GeoPoint) return [6, value.latitude, value.longitude];
  if (value instanceof Bytes) return [7, value.toBase64()];
  if (value instanceof DocumentReference) {
    if (value.firestore !== db || value.converter) throw new TypeError('Unsupported Firestore worker document reference.');
    return [8, value.path];
  }
  if (value instanceof Date) return [9, value.getTime()];
  if (value instanceof VectorValue) return [10, value.toArray()];
  if (Array.isArray(value)) return [11, value.map(item => encodeFirestoreWorkerValue(item, db, depth + 1))];
  if (typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    return [12, Object.entries(value).map(([key, item]) => [key, encodeFirestoreWorkerValue(item, db, depth + 1)])];
  }
  throw new TypeError('Unsupported Firestore worker value.');
}

export function decodeFirestoreWorkerValue(wire, db, depth = 0) {
  if (!Array.isArray(wire) || depth > 64) throw new TypeError('Invalid Firestore worker value.');
  switch (wire[0]) {
    case 0: return null;
    case 1: if (typeof wire[1] === 'string') return wire[1]; break;
    case 2: if (typeof wire[1] === 'number') return wire[1]; break;
    case 3: if (typeof wire[1] === 'boolean') return wire[1]; break;
    case 4: return undefined;
    case 5: return new Timestamp(wire[1], wire[2]);
    case 6: return new GeoPoint(wire[1], wire[2]);
    case 7: return Bytes.fromBase64String(wire[1]);
    case 8: return doc(db, wire[1]);
    case 9: return new Date(wire[1]);
    case 10: return vector(wire[1]);
    case 11:
      if (Array.isArray(wire[1])) return wire[1].map(item => decodeFirestoreWorkerValue(item, db, depth + 1));
      break;
    case 12:
      if (Array.isArray(wire[1]) && wire[1].every(pair => Array.isArray(pair) && pair.length === 2 && typeof pair[0] === 'string')) {
        return Object.fromEntries(wire[1].map(([key, item]) => [key, decodeFirestoreWorkerValue(item, db, depth + 1)]));
      }
      break;
  }
  throw new TypeError('Invalid Firestore worker value.');
}

// Only the known public SDK value classes get value equality. Unknown object
// instances remain changed. Called per transferred row, outside React render.
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
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index], present = Object.hasOwn(previous, key);
    const before = present ? previous[key] : undefined, after = next[key];
    const value = present ? retainFirestoreWorkerValue(before, after, depth + 1) : after;
    if (equal && (!present || !Object.is(value, before))) {
      equal = false;
      // The unchanged prefix can use previous children without recomputing
      // them. Avoid copying every unchanged object just to discard the copy.
      for (let prior = 0; prior < index; prior++) {
        const prefixKey = keys[prior], retained = previous[prefixKey];
        if (Object.is(retained, next[prefixKey])) continue;
        if (result === next) result = array ? next.slice() : Object.setPrototypeOf({ ...next }, Object.getPrototypeOf(next));
        Object.defineProperty(result, prefixKey, { value: retained, enumerable: true, configurable: true, writable: true });
      }
    }
    if (!equal && !Object.is(value, after)) {
      if (result === next) result = array ? next.slice() : Object.setPrototypeOf({ ...next }, Object.getPrototypeOf(next));
      Object.defineProperty(result, key, { value, enumerable: true, configurable: true, writable: true });
    }
  }
  return equal ? previous : result;
}
