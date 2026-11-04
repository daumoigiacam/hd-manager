export const CUSTOMER_BOOTSTRAP_COMMIT_COLLECTIONS=Object.freeze(['companies','products','reward_catalog','promotions','customers','customer_accounts']);
export function prepareCustomerBootstrapPublication(payload,{companyId,customerId}) {
 if(!companyId||!customerId||payload?.company?.id!==companyId||payload?.customer?.id!==customerId
  ||payload.customer.companyId!==companyId)throw Object.assign(new Error('Danh mục trả về không đúng phiên khách hàng.'),{code:'bootstrap-scope-mismatch'});
 for(const key of ['products','rewardCatalog','promotions'])if(!Array.isArray(payload[key]))
  throw Object.assign(new Error('Danh mục khách hàng chưa đầy đủ.'),{code:'bootstrap-incomplete'});
 const account=payload.customerAccount;
 if(account&&(account.customerId||account.customer_id)&&(account.customerId||account.customer_id)!==customerId)
  throw Object.assign(new Error('Hồ sơ tài khoản không đúng khách hàng.'),{code:'bootstrap-scope-mismatch'});
 return {companies:[payload.company],products:payload.products,reward_catalog:payload.rewardCatalog,
  promotions:payload.promotions,customers:[payload.customer],customer_accounts:account?[account]:[]};
}
export function isCustomerBootstrapCommitted(expected,states) {
 return Boolean(expected&&CUSTOMER_BOOTSTRAP_COMMIT_COLLECTIONS.every(name=>Array.isArray(expected[name])&&states[name]===expected[name]));
}
