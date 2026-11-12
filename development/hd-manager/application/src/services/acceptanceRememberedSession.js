// Explicitly enabled in the isolated QA package only. Reuse the established
// encrypted Firebase persistence adapter; never store a password or device key.
export async function rememberAcceptanceSession({env={},platform,getInfo,auth,expectedUser,isCurrent,mutate,remember,setPersistence}) {
 if(env.VITE_ACCEPTANCE_REMEMBER_SESSION!=='true'||platform!=='android'||!expectedUser||expectedUser.isAnonymous)return false;
 if(!isCurrent()||auth.currentUser!==expectedUser)return false;
 const info=await getInfo();
 if(info?.id!=='com.hdmanager.app.acceptance'||!isCurrent()||auth.currentUser!==expectedUser)return false;
 return mutate(async()=>{
  if(!isCurrent()||auth.currentUser!==expectedUser)return false;
  await remember(auth,setPersistence);
  return isCurrent()&&auth.currentUser===expectedUser;
 });
}
