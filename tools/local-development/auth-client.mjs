import{localEnvironment}from'./environment.mjs';import{loadLocalQaCredentials}from'./secrets.mjs';
// Real HTTP against local Identity Center and Firebase Auth Emulator. Never
// save/print password, custom token, ID token or refresh token in test evidence.
export async function loginLocalQa(label){
 const c=await localEnvironment(),account=(await loadLocalQaCredentials()).find(a=>a.label===label);if(!account)throw Error('Unknown local QA account');
 const response=await fetch(c.apiEndpoint+c.projectId+'/us-central1/identityLogin',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:account.phone,password:account.password,appId:c.appId,device:{deviceId:'local-http-verification-'+label,platform:'web'}})});if(!response.ok)throw Error('Local Identity HTTP rejected');const identity=await response.json();if(!identity.customToken||identity.success===false)throw Error('Original Identity login failed');
 const base=`http://${c.auth.host}:${c.auth.port}/identitytoolkit.googleapis.com/v1/`;
 const firebase=await fetch(base+'accounts:signInWithCustomToken?key=local-emulator-only',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:identity.customToken,returnSecureToken:true})});if(!firebase.ok)throw Error('Firebase Auth Emulator exchange rejected');const token=await firebase.json();if(!token.idToken)throw Error('Firebase Auth token missing');
 // Custom-token exchange does not promise a localId field. Verify identity
 // using the Auth HTTP lookup, rather than guessing or trusting a caller UID.
 const lookup=await fetch(base+'accounts:lookup?key=local-emulator-only',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({idToken:token.idToken})});if(!lookup.ok||(await lookup.json()).users?.[0]?.localId!==account.uid)throw Error('Firebase Auth UID mismatch');
 return {configuration:c,account,idToken:token.idToken,refreshToken:token.refreshToken};
}
