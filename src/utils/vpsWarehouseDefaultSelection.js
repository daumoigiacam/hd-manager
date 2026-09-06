const isActiveMainWarehouse = (warehouse) => (
  warehouse
  && !warehouse.deletedAt
  && `${warehouse.status || ''}`.toUpperCase() === 'ACTIVE'
  && `${warehouse.type || ''}`.toUpperCase() === 'MAIN'
  && `${warehouse.id || ''}`.trim().length > 0
);

// Default only when there is one unambiguous tenant-scoped MAIN warehouse.
// Never use this to backfill historical records or override a user choice.
export const resolveSingleActiveMainWarehouse = (warehouses = []) => {
  const matches = (Array.isArray(warehouses) ? warehouses : [])
    .filter(isActiveMainWarehouse);
  return matches.length === 1 ? matches[0] : null;
};

export const resolveSingleActiveMainWarehouseId = (warehouses = []) => (
  resolveSingleActiveMainWarehouse(warehouses)?.id || ''
);
