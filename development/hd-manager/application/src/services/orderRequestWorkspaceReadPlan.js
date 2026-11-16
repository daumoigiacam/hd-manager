// The visible request list precedes historical dispatch reconciliation. No
// source is removed: reconciliation owns demand after the list is committed.
const list=Object.freeze(['orderRequests','customers','products','employees']);
const reconciled=Object.freeze([...list,'warehouseDispatches']);
export const getOrderRequestWorkspaceReadCollections=requested=>requested===true?reconciled:list;
