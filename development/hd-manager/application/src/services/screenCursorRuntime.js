import { DEFAULT_CURSOR_PAGE_SIZE } from './firestoreCursorPagination.js';
import { createTenantListReadModel } from './tenantListReadModel.js';

export const SCREEN_CURSOR_MUTATION_EVENT = 'hd-manager:screen-cursor-mutation';
export const SCREEN_CURSOR_PAGE_SIZE = DEFAULT_CURSOR_PAGE_SIZE;

export const SCREEN_CURSOR_COLLECTIONS_BY_TAB = Object.freeze({
  orders: Object.freeze(['orders']),
  order_requests: Object.freeze(['orderRequests']),
  warehouse_dispatch: Object.freeze(['warehouseDispatches']),
  customers: Object.freeze(['customers']),
  products: Object.freeze(['products']),
  pricing: Object.freeze(['products', 'pricingInputs']),
  price_quotes: Object.freeze(['customers', 'products']),
});

// Cursor items are only a visible page. Screens listed here also need the
// authoritative collection for cross-record reconciliation and totals.
export const SCREEN_CURSOR_AUTHORITATIVE_COLLECTIONS_BY_TAB = Object.freeze({
  warehouse_dispatch: Object.freeze(['warehouseDispatches']),
});

export const getScreenCursorCollections = (tab = '') => (
  SCREEN_CURSOR_COLLECTIONS_BY_TAB[tab] || []
);

export const getScreenCursorAuthoritativeCollections = (tab = '') => (
  SCREEN_CURSOR_AUTHORITATIVE_COLLECTIONS_BY_TAB[tab] || []
);

const emptyCollectionState = () => ({
  items: [],
  cursor: null,
  hasMore: true,
  loaded: false,
  loading: false,
  documentsRead: 0,
  requests: 0,
  error: '',
});

const sortByStableId = (items = []) => [...items].sort((left, right) => (
  `${left?.id || ''}`.localeCompare(`${right?.id || ''}`)
));

export function createScreenCursorRuntime({
  db,
  appId,
  pageSize = SCREEN_CURSOR_PAGE_SIZE,
  modelFactory = createTenantListReadModel,
} = {}) {
  if (!db || !appId) throw new Error('Screen cursor runtime requires Firebase and app scope.');

  let generation = 0;
  let activeTab = '';
  let companyId = '';
  let disposed = false;
  let collections = {};
  const models = new Map();
  const inFlight = new Map();
  const subscribers = new Set();

  const snapshot = () => ({
    activeTab,
    companyId,
    pageSize,
    collections: Object.fromEntries(Object.entries(collections).map(([name, state]) => [
      name,
      { ...state, items: [...state.items] },
    ])),
  });

  const emit = () => {
    if (disposed) return;
    const next = snapshot();
    subscribers.forEach(listener => listener(next));
  };

  const disposeModels = () => {
    generation += 1;
    models.forEach(model => model.dispose());
    models.clear();
    inFlight.clear();
  };

  const setCollectionState = (collectionName, nextState) => {
    if (disposed || !collections[collectionName]) return;
    collections = {
      ...collections,
      [collectionName]: {
        ...collections[collectionName],
        ...nextState,
      },
    };
    emit();
  };

  const runModelRead = (collectionName, operation) => {
    if (disposed || !models.has(collectionName)) return Promise.resolve(snapshot());
    const existing = inFlight.get(collectionName);
    if (existing) return existing;
    const currentGeneration = generation;
    const model = models.get(collectionName);
    setCollectionState(collectionName, { loading: true, error: '' });
    const read = Promise.resolve()
      .then(() => operation(model))
      .then((modelState) => {
        if (disposed || currentGeneration !== generation || !models.has(collectionName)) return snapshot();
        setCollectionState(collectionName, { ...modelState, loading: false, error: '' });
        return snapshot();
      })
      .catch((error) => {
        if (!disposed && currentGeneration === generation && models.has(collectionName)) {
          setCollectionState(collectionName, {
            loading: false,
            error: error?.message || 'Không tải được trang dữ liệu.',
          });
        }
        throw error;
      })
      .finally(() => {
        if (inFlight.get(collectionName) === read) inFlight.delete(collectionName);
      });
    inFlight.set(collectionName, read);
    return read;
  };

  const activate = async ({ tab = '', tenantId = '' } = {}) => {
    const normalizedTenantId = `${tenantId || ''}`.trim();
    const collectionNames = getScreenCursorCollections(tab);
    if (disposed) return snapshot();
    if (tab === activeTab && normalizedTenantId === companyId && models.size === collectionNames.length) {
      return snapshot();
    }

    disposeModels();
    activeTab = tab;
    companyId = normalizedTenantId;
    collections = {};
    if (!companyId || collectionNames.length === 0) {
      emit();
      return snapshot();
    }

    collectionNames.forEach((collectionName) => {
      collections[collectionName] = emptyCollectionState();
      models.set(collectionName, modelFactory({
        db,
        appId,
        companyId,
        collectionName,
        pageSize,
      }));
    });
    emit();
    await Promise.all(collectionNames.map(collectionName => (
      runModelRead(collectionName, model => model.next())
    )));
    return snapshot();
  };

  const loadMore = (collectionName) => runModelRead(collectionName, model => model.next());
  const refresh = (collectionName = '') => {
    const names = collectionName ? [collectionName] : Array.from(models.keys());
    return Promise.all(names.filter(name => models.has(name)).map(name => (
      runModelRead(name, model => model.refresh())
    ))).then(() => snapshot());
  };

  const applyLocalMutation = ({ collectionName, documentId, action = 'set', payload = {} } = {}) => {
    const state = collections[collectionName];
    if (!state || !documentId) return snapshot();
    if (action === 'delete') {
      setCollectionState(collectionName, {
        items: state.items.filter(item => item?.id !== documentId),
      });
      return snapshot();
    }
    const byId = new Map(state.items.map(item => [`${item?.id || ''}`, item]));
    const previous = byId.get(`${documentId}`) || {};
    byId.set(`${documentId}`, { ...previous, ...(payload || {}), id: documentId });
    setCollectionState(collectionName, { items: sortByStableId(Array.from(byId.values())) });
    return snapshot();
  };

  return {
    snapshot,
    activate,
    loadMore,
    refresh,
    applyLocalMutation,
    subscribe(listener) {
      if (typeof listener !== 'function' || disposed) return () => {};
      subscribers.add(listener);
      listener(snapshot());
      return () => subscribers.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposeModels();
      disposed = true;
      subscribers.clear();
      collections = {};
    },
  };
}
