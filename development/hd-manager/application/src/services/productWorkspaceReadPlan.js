// A catalog is not an inventory report. Keep the existing stock formula and
// its complete source gate, but request history only for the inventory tab.
const catalog=Object.freeze(['products']);
const inventory=Object.freeze(['products','orders','warehouseImports','warehouseDispatches']);
export const getProductWorkspaceReadCollections=inventoryRequested=>inventoryRequested===true?inventory:catalog;
export const shouldPrepareProductInventory=({tab,sourceReady,cacheComplete})=>sourceReady===true
 &&(tab==='inventory'||cacheComplete===true);
