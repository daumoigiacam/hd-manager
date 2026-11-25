const assert=require('node:assert/strict');
const {scryptSync}=require('node:crypto');
const admin=require('../functions/node_modules/firebase-admin');
const {createIdentityCenter}=require('../functions/identityCenter');
const fs=require('node:fs/promises');
const projectId='demo-hdmanager-account-delete-20261125';
if(process.env.GCLOUD_PROJECT!==projectId||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8187'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9198')throw Error('Only the isolated local demo Auth/Firestore emulators are permitted');
const app=admin.initializeApp({projectId}),db=app.firestore(),auth=app.auth();
const appId='synthetic-account-deletion',root=`artifacts/${appId}/public/data`;
const id='employee_fixture_'+Date.now(),uid='identity_'+id,password='Fixture-only-2026';
const salt=Buffer.alloc(16,3),passwordHash=`scrypt-v1$${salt.toString('base64url')}$${scryptSync(password,salt,64).toString('base64url')}`;
async function run(){
 const identityRef=db.collection('identity_accounts').doc(id),employeeRef=db.doc(root+'/employees/'+id),orderRef=db.doc(root+'/orders/'+id),payrollRef=db.doc(root+'/payrollPeriods/'+id);
 await auth.createUser({uid});
 await auth.setCustomUserClaims(uid,{identityId:id,companyId:'fixture-company',appUserId:id,accountType:'employee'});
 const token=await auth.createCustomToken(uid,{identityId:id,companyId:'fixture-company',appUserId:id,accountType:'employee'});
 const signIn=await fetch('http://127.0.0.1:9198/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=synthetic-only',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token,returnSecureToken:true})});
 assert.equal(signIn.status,200);const {idToken}=await signIn.json();assert.ok(idToken);
 await identityRef.set({id,status:'active',passwordHash,pinHash:passwordHash,accountType:'employee',publicCollection:'employees',publicId:id,appUserId:id,companyId:'fixture-company',phone:'0000000000'});
 await employeeRef.set({name:'Synthetic fixture',companyId:'fixture-company',passwordHash,basicSalary:5000000});
 await orderRef.set({companyId:'fixture-company',total:123456});await payrollRef.set({locked:true,netSalary:5000000});
 const service=createIdentityCenter({db,admin,getAppId:()=>appId}),authorization='Bearer '+idToken;
 await assert.rejects(service.deleteAccount({authorization,currentPassword:'wrong',confirmation:'XOA TAI KHOAN'}),{statusCode:401});
 assert.equal((await identityRef.get()).data().status,'active');
 const registered=await service.completeSetup({authorization,device:{deviceId:'synthetic-device',name:'Synthetic device'},trustDevice:true});assert.equal(registered.success,true);
 assert.ok((await identityRef.collection('devices').doc('synthetic-device').get()).data().trusted);
 await db.collection('identity_passkeys').doc(id).set({identityId:id,publicKey:'synthetic'});
 assert.deepEqual(await service.deleteAccount({authorization,currentPassword:password,confirmation:'XOA TAI KHOAN'}),{success:true,deleted:true});
 await assert.rejects(auth.getUser(uid),error=>error.code==='auth/user-not-found');
 const tombstone=(await identityRef.get()).data();assert.equal(tombstone.status,'deleted');assert.equal(tombstone.passwordHash,undefined);assert.equal(tombstone.pinHash,undefined);
 assert.equal((await employeeRef.get()).data().authDisabled,true);assert.equal((await employeeRef.get()).data().basicSalary,5000000);
 assert.deepEqual((await orderRef.get()).data(),{companyId:'fixture-company',total:123456});
 assert.deepEqual((await payrollRef.get()).data(),{locked:true,netSalary:5000000});
 assert.equal((await identityRef.collection('devices').get()).size,0);assert.equal((await db.collection('identity_passkeys').doc(id).get()).exists,false);
 // Firebase Admin intentionally forces user/revocation lookup in the Auth
 // emulator even when checkRevoked=false. A deleted user's old token is
 // therefore rejected here; production JWT-only retry semantics are covered
 // separately by account-deletion.test.cjs.
 await assert.rejects(service.deleteAccount({authorization,currentPassword:password,confirmation:'XOA TAI KHOAN'}),error=>error.statusCode===401&&error.code==='auth/user-not-found');
 await assert.rejects(service.completeSetup({authorization,device:{deviceId:'after-deletion'},trustDevice:true}));
 const receipt={status:'PASS',projectId,localAuth:'127.0.0.1:9198',localFirestore:'127.0.0.1:8187',checks:['wrong password rejected','trusted device setup works','own Firebase Auth user deleted','password and PIN scrubbed','trusted devices removed','passkeys removed','business employee fields retained','orders retained','locked payroll retained','deleted token rejected by emulator forced revocation check','setup after deletion rejected'],productionRetryCoverage:'account-deletion.test.cjs',productionWrites:0};
 await fs.writeFile('.local-dev/account-deletion-20261125/emulator-result.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}
run().finally(()=>app.delete()).catch(error=>{console.error(error.code||error.message);process.exitCode=1});
