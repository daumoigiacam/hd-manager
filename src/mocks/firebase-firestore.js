import { seedData } from './seed-data.js';

const STORAGE_KEY = 'hd-manager-local-db-v2-clean-preview';
const BROADCAST_CHANNEL_NAME = `${STORAGE_KEY}-channel`;
class MockIncrementSentinel {
  constructor(amount) {
    this.amount = Number(amount) || 0;
  }
}

const clone = (value) => {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
};

function createInitialStore() {
  return Object.fromEntries(
    Object.entries(seedData).map(([name, docs]) => [name, clone(docs)])
  );
}

function normalizeStore(parsedStore = {}) {
  const initialStore = createInitialStore();
  const collectionNames = new Set([
    ...Object.keys(initialStore),
    ...Object.keys(parsedStore || {})
  ]);

  return Object.fromEntries(
    [...collectionNames].map((name) => [
      name,
      {
        ...(initialStore[name] || {}),
        ...(parsedStore?.[name] || {})
      }
    ])
  );
}

function loadStore() {
  const initialStore = createInitialStore();

  if (typeof window === 'undefined') {
    return initialStore;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return initialStore;
    }

    const parsed = JSON.parse(raw);
    return normalizeStore(parsed);
  } catch (error) {
    console.warn('Failed to load local preview data, using seed data instead.', error);
    return initialStore;
  }
}

function persistStore() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  if (broadcastChannel) {
    broadcastChannel.postMessage({ type: 'store-updated', at: Date.now() });
  }
}

let store = loadStore();

const collectionListeners = new Map();
const broadcastChannel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel(BROADCAST_CHANNEL_NAME)
    : null;
let syncListenersBound = false;

function emitCollection(name) {
  const listeners = collectionListeners.get(name);
  if (!listeners) return;

  const snapshot = createSnapshot(name);
  for (const listener of listeners) {
    listener(snapshot);
  }
}

function createSnapshot(name) {
  const entries = Object.values(store[name] || {});
  return {
    docs: entries.map((entry) => ({
      id: entry.id,
      exists: () => true,
      data: () => clone(entry)
    })),
    empty: entries.length === 0,
    size: entries.length,
    forEach(callback) {
      entries.forEach((entry) => {
        callback({
          id: entry.id,
          exists: () => true,
          data: () => clone(entry)
        });
      });
    }
  };
}

function createDocumentSnapshot(docRef) {
  const entry = store[docRef.collectionName]?.[docRef.id];
  return {
    id: docRef.id,
    exists: () => Boolean(entry),
    data: () => (entry ? clone(entry) : undefined)
  };
}

function applyFirestoreValue(value, existingValue) {
  if (value instanceof MockIncrementSentinel) {
    const current = Number(existingValue) || 0;
    return current + value.amount;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => applyFirestoreValue(item, existingValue?.[index]));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        applyFirestoreValue(nestedValue, existingValue?.[key])
      ])
    );
  }
  return value;
}

function applySetDoc(docRef, data, options = {}) {
  const collectionName = docRef.collectionName;
  const currentCollection = store[collectionName] || {};
  const existingDoc = currentCollection[docRef.id] || { id: docRef.id };
  const appliedData = applyFirestoreValue(data, existingDoc);
  const nextDoc = options.merge ? { ...existingDoc, ...clone(appliedData), id: docRef.id } : { ...clone(appliedData), id: docRef.id };

  store[collectionName] = {
    ...currentCollection,
    [docRef.id]: nextDoc
  };
}

function emitAllCollections() {
  const collectionNames = new Set([
    ...Object.keys(store || {}),
    ...collectionListeners.keys()
  ]);

  for (const name of collectionNames) {
    emitCollection(name);
  }
}

function reloadStoreFromStorage() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    store = normalizeStore(parsed);
    emitAllCollections();
  } catch (error) {
    console.warn('Failed to sync local preview data from storage.', error);
  }
}

function bindSyncListeners() {
  if (syncListenersBound || typeof window === 'undefined') {
    return;
  }

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    reloadStoreFromStorage();
  });

  if (broadcastChannel) {
    broadcastChannel.addEventListener('message', (event) => {
      if (event?.data?.type !== 'store-updated') return;
      reloadStoreFromStorage();
    });
  }

  syncListenersBound = true;
}

bindSyncListeners();

export function getFirestore(app) {
  return { app };
}

export function initializeFirestore(app) {
  return getFirestore(app);
}

export function collection(_, ...segments) {
  return {
    kind: 'collection',
    path: segments.join('/'),
    name: segments.at(-1)
  };
}

export function doc(_, ...segments) {
  return {
    kind: 'doc',
    path: segments.join('/'),
    collectionName: segments.at(-2),
    id: segments.at(-1)
  };
}

export async function setDoc(docRef, data, options = {}) {
  applySetDoc(docRef, data, options);
  persistStore();
  emitCollection(docRef.collectionName);
}

export async function deleteDoc(docRef) {
  const collectionName = docRef.collectionName;
  const currentCollection = { ...(store[collectionName] || {}) };
  delete currentCollection[docRef.id];
  store[collectionName] = currentCollection;
  persistStore();
  emitCollection(collectionName);
}

export function onSnapshot(ref, onNext) {
  if (ref.kind !== 'collection') {
    throw new Error('Preview mock currently supports collection snapshots only.');
  }

  const listeners = collectionListeners.get(ref.name) || new Set();
  listeners.add(onNext);
  collectionListeners.set(ref.name, listeners);
  queueMicrotask(() => onNext(createSnapshot(ref.name)));

  return () => {
    const current = collectionListeners.get(ref.name);
    if (!current) return;
    current.delete(onNext);
    if (current.size === 0) {
      collectionListeners.delete(ref.name);
    }
  };
}

export async function getDocs(ref) {
  if (ref.kind !== 'collection') {
    throw new Error('Preview mock currently supports getDocs(collection) only.');
  }
  return createSnapshot(ref.name);
}

export function increment(amount) {
  return new MockIncrementSentinel(amount);
}

export async function enableNetwork() {
  return undefined;
}

export async function runTransaction(_, updateFunction) {
  const touchedCollections = new Set();
  const transaction = {
    async get(docRef) {
      return createDocumentSnapshot(docRef);
    },
    set(docRef, data, options = {}) {
      applySetDoc(docRef, data, options);
      touchedCollections.add(docRef.collectionName);
      return transaction;
    },
    update(docRef, data) {
      applySetDoc(docRef, data, { merge: true });
      touchedCollections.add(docRef.collectionName);
      return transaction;
    },
    delete(docRef) {
      const currentCollection = { ...(store[docRef.collectionName] || {}) };
      delete currentCollection[docRef.id];
      store[docRef.collectionName] = currentCollection;
      touchedCollections.add(docRef.collectionName);
      return transaction;
    }
  };

  const result = await updateFunction(transaction);
  if (touchedCollections.size > 0) {
    persistStore();
    touchedCollections.forEach((collectionName) => emitCollection(collectionName));
  }
  return result;
}
