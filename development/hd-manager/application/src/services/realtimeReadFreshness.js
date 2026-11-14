// A recent server response alone does not prove that its data reached the UI.
// A cancelled publication, reopened stream, or changed owner must read again.
export function hasCommittedServerSnapshot({readiness,principalId,tenantId,ownerKey,collection,pending}) {
  return !pending && Boolean(principalId && tenantId && ownerKey && collection)
    && readiness?.actorUid === principalId
    && readiness.serverConfirmed?.tenantId === tenantId
    && readiness.serverConfirmed?.ownerKey === ownerKey
    && readiness.serverConfirmed.collections?.[collection] === true;
}
