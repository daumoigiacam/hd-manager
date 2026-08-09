import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  authorizeTenantRequest,
  authorizeTenantOrderAccess
} = require('../functions/requestAuthorization.js');

const allowedAppId = 'hd-manager-production';
const employeeClaims = {
  identityId: 'employee_employee-01',
  companyId: 'company-01',
  appUserId: 'employee-01',
  accountType: 'employee'
};
const customerClaims = {
  identityId: 'customer_customer-01',
  companyId: 'company-01',
  appUserId: 'account-01',
  customerId: 'customer-01',
  accountType: 'customer'
};
const ownOrder = { id: 'order-01', companyId: 'company-01', customerId: 'customer-01' };

assert.equal(authorizeTenantRequest({ claims: employeeClaims, appId: allowedAppId, allowedAppId }).allowed, true);
assert.equal(authorizeTenantOrderAccess({ claims: employeeClaims, appId: allowedAppId, allowedAppId, order: ownOrder }).allowed, true);
assert.equal(authorizeTenantOrderAccess({ claims: customerClaims, appId: allowedAppId, allowedAppId, order: ownOrder }).allowed, true);

for (const decision of [
  authorizeTenantRequest({ claims: {}, appId: allowedAppId, allowedAppId }),
  authorizeTenantRequest({ claims: { ...employeeClaims, identityId: '' }, appId: allowedAppId, allowedAppId }),
  authorizeTenantRequest({ claims: { ...employeeClaims, firebase: { sign_in_provider: 'anonymous' } }, appId: allowedAppId, allowedAppId }),
  authorizeTenantRequest({ claims: employeeClaims, appId: 'other-app', allowedAppId }),
  authorizeTenantOrderAccess({ claims: employeeClaims, appId: allowedAppId, allowedAppId, order: { ...ownOrder, companyId: 'company-02' } }),
  authorizeTenantOrderAccess({ claims: customerClaims, appId: allowedAppId, allowedAppId, order: { ...ownOrder, customerId: 'customer-02' } }),
]) {
  assert.equal(decision.allowed, false);
  assert.ok([401, 403].includes(decision.statusCode));
}

console.log('Tenant request authorization checks passed.');
