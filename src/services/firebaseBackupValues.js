import { Bytes, GeoPoint, Timestamp } from 'firebase/firestore';

// Match normalizeBackupSerializableValue applied to the public SDK types in
// manual exports. Do not use the ordinary UI REST decoder: timestamps/bytes and
// GeoPoints have different backup representations. Unknown types fail closed.
export function decodeFirebaseBackupValue(value) {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid Firestore backup value.');
  if (Object.hasOwn(value, 'nullValue')) return null;
  if (Object.hasOwn(value, 'booleanValue')) return Boolean(value.booleanValue);
  if (Object.hasOwn(value, 'integerValue')) return Number(value.integerValue);
  if (Object.hasOwn(value, 'doubleValue')) return Number(value.doubleValue);
  if (Object.hasOwn(value, 'timestampValue')) {
    const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(value.timestampValue);
    const seconds = match ? Date.parse(`${match[1]}Z`) / 1000 : NaN;
    if (!Number.isFinite(seconds) || new Date(seconds * 1000).toISOString().slice(0, 19) !== match[1]) {
      throw new TypeError('Invalid Firestore backup timestamp.');
    }
    // Preserve the SDK's toDate millisecond conversion, including negative
    // epochs with fractional nanos; Date.parse alone differs at that boundary.
    return new Timestamp(seconds, Number((match[2] || '').padEnd(9, '0')));
  }
  if (Object.hasOwn(value, 'stringValue')) return value.stringValue;
  if (Object.hasOwn(value, 'bytesValue')) return Bytes.fromBase64String(value.bytesValue);
  if (Object.hasOwn(value, 'geoPointValue')) return new GeoPoint(value.geoPointValue.latitude, value.geoPointValue.longitude);
  if (Object.hasOwn(value, 'arrayValue')) return (value.arrayValue.values || []).map(decodeFirebaseBackupValue);
  if (Object.hasOwn(value, 'mapValue')) return decodeFirebaseBackupFields(value.mapValue.fields || {});
  throw new TypeError('Unsupported Firestore backup field type; automatic backup was not published.');
}

export function decodeFirebaseBackupFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeFirebaseBackupValue(value)]));
}
