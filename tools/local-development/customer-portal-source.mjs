// Local transport for the existing Customer Portal bootstrap contract. Uses
// the same public-field sanitizers and tenant authorizer as functions/index.js.
// It never grants employee/offline privileges to a customer.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {authorizeTenantRequest}=require('../../functions/requestAuthorization.js');
const {sanitizeCompanyForCustomer,sanitizeCustomerProfileForClient,sanitizeCustomerAccountForClient,sanitizeProductForCustomer,sanitizeRewardForCustomer,sanitizePromotionForCustomer}=require('../../functions/customerPortalSecurity.js');
export function createLocalCustomerPortalSource({db,auth,configuration:c}){
 if(c.name!=='local'||!/^demo-hdmanager-/.test(c.projectId)||process.env.FIRESTORE_EMULATOR_HOST!==c.firestore.host+':'+c.firestore.port||db.projectId!==c.projectId)throw Error('Only approved Local Customer Portal transport is permitted');
 const deny=()=>Object.assign(Error('Customer Portal current authority denied'),{code:'permission-denied'}),ref=(source,id)=>db.doc(`artifacts/${c.appId}/public/data/${source}/${id}`);
 return async({authorization,appId})=>{
  if(typeof authorization!=='string'||!authorization.startsWith('Bearer '))throw deny();const claims=await auth.verifyIdToken(authorization.slice(7),true);
  const decision=authorizeTenantRequest({claims,appId,allowedAppId:c.appId});
  if(!decision.allowed||claims.aud!==c.projectId||claims.iss!=='https://securetoken.google.com/'+c.projectId||claims.accountType!=='customer'||!claims.appUserId||!claims.customerId)throw deny();
  const identity=(await db.doc('identity_accounts/'+claims.identityId).get()).data();
  if(!identity||identity.status!=='active'||identity.lockedAt||identity.accountType!=='customer'||identity.companyId!==claims.companyId||identity.appUserId!==claims.appUserId||identity.customerId!==claims.customerId)throw deny();
  const tenant=claims.companyId,catalog=async(source,sanitize)=>{const rows=await db.collection(`artifacts/${c.appId}/public/data/${source}`).where('companyId','==',tenant).limit(501).get();if(rows.size>500)throw Error('Customer catalog requires paginated transport beyond 500 records');return rows.docs.map(d=>sanitize(d.data(),d.id));};
  const [company,customer,account,products,rewardCatalog,promotions]=await Promise.all([ref('companies',tenant).get(),ref('customers',claims.customerId).get(),ref('customer_accounts',claims.appUserId).get(),catalog('products',sanitizeProductForCustomer),catalog('reward_catalog',sanitizeRewardForCustomer),catalog('promotions',sanitizePromotionForCustomer)]);
  if(!company.exists||!customer.exists||customer.data().companyId!==tenant||customer.data().isArchived||(account.exists&&(account.data().companyId!==tenant||account.data().customerId!==claims.customerId||account.data().isArchived)))throw deny();
  return {success:true,company:sanitizeCompanyForCustomer(company.data(),company.id),customer:sanitizeCustomerProfileForClient(customer.data(),customer.id),customerAccount:account.exists?sanitizeCustomerAccountForClient(account.data(),account.id):null,products,rewardCatalog,promotions};
 };
}
