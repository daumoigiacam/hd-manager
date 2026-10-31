// Frozen installed9b6f622a mapper, permission predicates and stable timestamp ordering.
export default function frozenVisibleRequests({latestOrderRequests,canEmployeeViewRequest,resolveOrderRequestDateKey,getVisibleRequest,requestCustomerLookup,requestProductLookup,requestWorkingDate,canViewAllRequests,isSales,salesVisibleEmployeeIdSet,getEntityTimestamp}) {
const useMemo = f => f();
  const visibleRequests = useMemo(() => latestOrderRequests
    .filter(request => !request.isArchived)
    .filter(request => canEmployeeViewRequest(request))
    .map(request => {
      const primaryItem = (request.items || [])[0] || null;
      const requestDateKey = resolveOrderRequestDateKey(request);
      return getVisibleRequest(
        request,
        requestDateKey,
        requestCustomerLookup.get(request.customerId) || null,
        primaryItem?.productId ? requestProductLookup.get(primaryItem.productId) || null : null
      );
    })
    .sort((a, b) => (getEntityTimestamp(b) || 0) - (getEntityTimestamp(a) || 0)), [getVisibleRequest, latestOrderRequests, requestCustomerLookup, requestProductLookup, requestWorkingDate, canViewAllRequests, isSales, salesVisibleEmployeeIdSet]);

return visibleRequests;
}
