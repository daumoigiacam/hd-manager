// Pure identities used by the Activity-retained route. Effect attachment is not
// a query change and must never reset pagination, selection or an editor draft.
export const ordersRelevantTopic=topic=>['orders','home','home-data','home-checkpoint'].includes(topic);
export const ordersQueryKey=(scope,search,filters)=>JSON.stringify([scope.tenantId,scope.principalId,scope.permissionRevision,scope.sessionId,search,filters]);
export const retainedPagination=(saved,key)=>saved.key===key?saved:{key,cursors:[null],index:0};
export const ordersPageMatches=(page,key,cursor)=>page?.queryKey===key&&page?.positionKey===JSON.stringify(cursor);
