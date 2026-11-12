// Exact original pure declarations extracted from App.jsx. No App/React/Firebase initialization.
import {normalizeCustomerProductIds} from "./dispatchOriginalCustomerRules.js";

import {normalizeCustomerBranches} from "./dispatchOriginalCustomerRules.js";

const getCustomerBranchById = (customer = {}, branchId = '', products = []) => {
  const cleanBranchId = `${branchId || ''}`.trim();
  if (!cleanBranchId) return null;
  return normalizeCustomerBranches(customer, products).find(branch => branch.id === cleanBranchId) || null;
};

const getCustomerBranchProductConfigSource = (customer = null, branchId = '', products = []) => {
  const branch = branchId ? getCustomerBranchById(customer, branchId, products) : null;
  if (!branch) return customer;
  const customerFixedProducts = Array.isArray(customer?.fixedProducts) ? customer.fixedProducts : [];
  const branchFixedProducts = Array.isArray(branch?.fixedProducts) ? branch.fixedProducts : [];
  const customerProductIds = normalizeCustomerProductIds(customer || {}, products || []);
  const branchProductIds = normalizeCustomerProductIds(branch || {}, products || []);
  return {
    ...(customer || {}),
    ...branch,
    fixedProducts: [...customerFixedProducts, ...branchFixedProducts],
    customerProductIds: [...new Set([...customerProductIds, ...branchProductIds])]
  };
};

export {getCustomerBranchProductConfigSource};