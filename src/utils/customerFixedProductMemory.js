const cleanId = (value = '') => `${value || ''}`.trim();

const uniqueIds = (values = [], validProductIds = null) => {
  const validIds = validProductIds instanceof Set
    ? validProductIds
    : new Set((validProductIds || []).map(cleanId).filter(Boolean));
  return [...new Set((Array.isArray(values) ? values : []).map(cleanId).filter(Boolean))]
    .filter(productId => validIds.size === 0 || validIds.has(productId));
};

const getBranchId = (branch = {}, index = 0) => cleanId(
  branch.id || branch.branchId || branch.code || `branch_${index + 1}`
);

export const buildCustomerFixedProductMemoryPatch = ({
  customer = null,
  requests = [],
  validProductIds = [],
} = {}) => {
  const customerId = cleanId(customer?.id);
  if (!customerId) {
    return { patch: null, addedProductIds: [], skippedBranchIds: [] };
  }

  const validIds = new Set((validProductIds || []).map(cleanId).filter(Boolean));
  const rootProductIds = uniqueIds(customer?.customerProductIds, validIds);
  const rawBranches = Array.isArray(customer?.branches)
    ? customer.branches
    : (Array.isArray(customer?.customerBranches) ? customer.customerBranches : []);
  const branches = rawBranches.map((branch = {}, index) => ({
    ...branch,
    id: getBranchId(branch, index),
    customerProductIds: uniqueIds(branch.customerProductIds, validIds),
  }));
  const addedProductIds = new Set();
  const skippedBranchIds = new Set();
  let rootChanged = false;
  let branchesChanged = false;

  (Array.isArray(requests) ? requests : []).forEach((request = {}) => {
    if (cleanId(request.customerId) !== customerId) return;
    const requestedProductIds = uniqueIds(
      (Array.isArray(request.items) ? request.items : []).map(item => item?.productId),
      validIds,
    );
    if (requestedProductIds.length === 0) return;

    const branchId = cleanId(request.branchId || request.customerBranchId);
    if (!branchId) {
      requestedProductIds.forEach((productId) => {
        if (rootProductIds.includes(productId)) return;
        rootProductIds.push(productId);
        addedProductIds.add(productId);
        rootChanged = true;
      });
      return;
    }

    const branchIndex = branches.findIndex((branch, index) => getBranchId(branch, index) === branchId);
    if (branchIndex < 0) {
      skippedBranchIds.add(branchId);
      return;
    }

    // A branch without its own list inherits the customer's current fixed products.
    // Preserve that inherited list before adding its first branch-specific product.
    const branchProductIds = branches[branchIndex].customerProductIds.length > 0
      ? [...branches[branchIndex].customerProductIds]
      : [...rootProductIds];
    requestedProductIds.forEach((productId) => {
      if (branchProductIds.includes(productId)) return;
      branchProductIds.push(productId);
      addedProductIds.add(productId);
      branchesChanged = true;
    });
    branches[branchIndex] = {
      ...branches[branchIndex],
      customerProductIds: branchProductIds,
    };
  });

  const patch = {};
  if (rootChanged) patch.customerProductIds = rootProductIds;
  if (branchesChanged) patch.branches = branches;

  return {
    patch: Object.keys(patch).length > 0 ? patch : null,
    addedProductIds: [...addedProductIds],
    skippedBranchIds: [...skippedBranchIds],
  };
};
