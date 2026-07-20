import { seedData } from './seed-data.js';

const STORAGE_KEY = 'hd-manager-local-db-v2-clean-preview';
const BROADCAST_CHANNEL_NAME = `${STORAGE_KEY}-channel`;
const clone = (value) => JSON.parse(JSON.stringify(value));

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
    forEach(callback) {
      entries.forEach((entry) => {
        callback({
          id: entry.id,
          data: () => clone(entry)
        });
      });
    }
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
  const collectionName = docRef.collectionName;
  const currentCollection = store[collectionName] || {};
  const existingDoc = currentCollection[docRef.id] || { id: docRef.id };
  const nextDoc = options.merge ? { ...existingDoc, ...clone(data), id: docRef.id } : { ...clone(data), id: docRef.id };

  store[collectionName] = {
    ...currentCollection,
    [docRef.id]: nextDoc
  };

  persistStore();
  emitCollection(collectionName);
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
