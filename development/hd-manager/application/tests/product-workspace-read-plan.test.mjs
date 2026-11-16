import test from'node:test';import assert from'node:assert/strict';
import{getProductWorkspaceReadCollections,shouldPrepareProductInventory}from'../src/services/productWorkspaceReadPlan.js';
test('catalog and group browsing do not demand transaction history',()=>{
 for(const request of [false,undefined,null,'inventory'])assert.deepEqual(getProductWorkspaceReadCollections(request),['products']);
 assert.deepEqual(getProductWorkspaceReadCollections(true),['products','orders','warehouseImports','warehouseDispatches']);
 assert.equal(getProductWorkspaceReadCollections(true),getProductWorkspaceReadCollections(true));
 assert(Object.isFrozen(getProductWorkspaceReadCollections(true)));
});
test('inventory waits for complete scoped sources and the catalog can reuse an already completed calculation',()=>{
 for(const tab of ['products','groups','inventory'])for(const cacheComplete of [false,true])assert.equal(shouldPrepareProductInventory({tab,cacheComplete,sourceReady:false}),false);
 assert.equal(shouldPrepareProductInventory({tab:'products',sourceReady:true,cacheComplete:false}),false);
 assert.equal(shouldPrepareProductInventory({tab:'groups',sourceReady:true,cacheComplete:false}),false);
 assert.equal(shouldPrepareProductInventory({tab:'inventory',sourceReady:true,cacheComplete:false}),true);
 assert.equal(shouldPrepareProductInventory({tab:'products',sourceReady:true,cacheComplete:true}),true);
});
