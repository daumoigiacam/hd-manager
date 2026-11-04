// Isolated preview presentation test transport. This file is never imported by
// App or its normal build configuration and cannot authenticate production.
export * from '../../src/mocks/identity-center-vps.js';
export const customerPortalBootstrap=async()=>{
 const response=await fetch('/fixture/customer-bootstrap',{method:'POST'});
 if(!response.ok)throw new Error('Fixture bootstrap unavailable');
 return response.json();
};
