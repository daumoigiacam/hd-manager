import { readTenantCursorPage, mergeCursorItems } from './firestoreCursorPagination.js';
import { createReadArbiter } from './readArbiter.js';

// List-only state. Never substitute these partial items for business totals.
export function createTenantListReadModel(options) {
  if (!options?.companyId || !options?.collectionName) throw new Error('Tenant and collection required');
  const queryOptions = { ...options };
  const arbiter = createReadArbiter();
  let state = { items: [], cursor: null, hasMore: true, loaded: false, documentsRead: 0, requests: 0 };
  let disposed = false;
  const snapshot = () => ({ ...state, items: [...state.items] });
  const next = () => arbiter.run('page', async current => {
    if (disposed || !state.hasMore) return snapshot();
    const page = await readTenantCursorPage({ ...queryOptions, cursor: state.cursor });
    if (!current()) return snapshot();
    if (page.items.some(item => item.companyId !== queryOptions.companyId)) throw new Error('Foreign tenant page rejected');
    state = {
      items: mergeCursorItems(state.items, page.items),
      cursor: page.cursor,
      hasMore: page.hasMore,
      loaded: true,
      documentsRead: state.documentsRead + page.readCount,
      requests: state.requests + 1
    };
    return snapshot();
  });
  return {
    snapshot,
    next,
    async refresh() {
      arbiter.invalidate('page');
      return arbiter.run('page', async current => {
        const page = await readTenantCursorPage({ ...queryOptions, cursor: null });
        if (!current()) return snapshot();
        if (page.items.some(item => item.companyId !== queryOptions.companyId)) throw new Error('Foreign tenant page rejected');
        state = {
          items: mergeCursorItems([], page.items), cursor: page.cursor,
          hasMore: page.hasMore, loaded: true,
          documentsRead: state.documentsRead + page.readCount, requests: state.requests + 1
        };
        return snapshot();
      }, { force: true });
    },
    dispose() { disposed = true; arbiter.dispose(); }
  };
}
