import {OfflineCustomerAppRoute} from './OfflineCustomerRuntimeContext.jsx';

// This wraps the existing product view and its existing SQLite adapter. The
// Home runtime remains sole owner; route visits create no database or feed.
export default function SQLiteProductCRM({View,localRuntime,localPrincipalId,...props}){
 return <OfflineCustomerAppRoute {...props} runtime={localRuntime} principalId={localPrincipalId}
  canAddCustomerPermission={localRuntime.capabilities.includes('customers.create')}
  canEditCustomer={localRuntime.capabilities.includes('customers.update')}
  canEditCustomerPhoneAddress={localRuntime.capabilities.includes('customers.update')}
  canEditCustomerLocation={localRuntime.capabilities.includes('customers.update')}
  canDeleteCustomerPermission={localRuntime.capabilities.includes('customers.archive')}
  View={View} directoryDataReady lookupDataReady financialDataReady={false}/>;
}
