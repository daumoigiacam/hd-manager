import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from '@babel/parser';
import {getRegionalIdentityAuthUrl} from '../src/config/identityAuthRegion.js';
import {createRequire} from 'node:module';
const {getStartupRuntimeOptions}=createRequire(import.meta.url)('../functions/startupRuntime.js');

test('regional auth is opt-in, project-scoped, and never redirects emulator or unrelated endpoints',()=>{
  assert.equal(getRegionalIdentityAuthUrl('/api/identity/login'), '');
  const env={VITE_IDENTITY_AUTH_REGION:'asia-southeast1',VITE_FIREBASE_PROJECT_ID:'demo-regional-auth'};
  assert.equal(getRegionalIdentityAuthUrl('/api/identity/login',env),'https://asia-southeast1-demo-regional-auth.cloudfunctions.net/identityLoginRegional');
  assert.equal(getRegionalIdentityAuthUrl('/api/identity/biometric-login',env),'https://asia-southeast1-demo-regional-auth.cloudfunctions.net/identityBiometricLoginRegional');
  assert.equal(getRegionalIdentityAuthUrl('/api/identity/logout',env),'');
  assert.equal(getRegionalIdentityAuthUrl('/api/customer/bootstrap',env),'');
  assert.equal(getRegionalIdentityAuthUrl('/api/customer/bootstrap',{...env,VITE_CUSTOMER_BOOTSTRAP_REGION:'asia-southeast1'}),
    'https://asia-southeast1-demo-regional-auth.cloudfunctions.net/customerPortalBootstrapRegional');
  assert.equal(getRegionalIdentityAuthUrl('/api/identity/login',{...env,VITE_FIREBASE_EMULATORS:'true'}),'');
  assert.throws(()=>getRegionalIdentityAuthUrl('/api/identity/login',{...env,VITE_FIREBASE_PROJECT_ID:'attacker.invalid/path'}));
  assert.throws(()=>getRegionalIdentityAuthUrl('/api/identity/login',{...env,VITE_IDENTITY_AUTH_REGION:'unsupported'}));
});

test('old and regional function exports execute the identical guarded auth handlers',()=>{
  const source=readFileSync(new URL('../functions/index.js',import.meta.url),'utf8');
  const ast=parse(source,{sourceType:'script'});
  const assignments=ast.program.body.filter(n=>n.type==='ExpressionStatement' && n.expression.type==='AssignmentExpression'
    && n.expression.left.object?.name==='exports').map(n=>n.expression);
  for(const [name,handler] of [['identityLogin','identityLoginRequest'],['identityBiometricLogin','identityBiometricLoginRequest']]){
    const legacy=assignments.find(n=>n.left.property.name===name).right;
    const regional=assignments.find(n=>n.left.property.name===name+'Regional').right;
    assert.equal(legacy.arguments.at(-1).name,handler);assert.equal(regional.arguments.at(-1).name,handler);
    assert.equal(regional.arguments[0].callee.name,'getStartupRuntimeOptions');
    assert.deepEqual(getStartupRuntimeOptions({}),{region:'asia-southeast1',memory:'256MiB',concurrency:4,minInstances:0});
    const declaration=ast.program.body.flatMap(n=>n.type==='VariableDeclaration'?n.declarations:[]).find(n=>n.id.name===handler);
    assert.equal(declaration.init.callee.name,'runIdentityRequest');
    assert.match(source.slice(declaration.start,declaration.end),/identityCenter\.(login|biometricLogin)\(/);
  }
});
test('warm-instance cost is opt-in and the customer bootstrap alias keeps the exact protected handler',()=>{
 assert.equal(getStartupRuntimeOptions({HD_STARTUP_MIN_INSTANCES:'1'}).minInstances,1);
 assert.throws(()=>getStartupRuntimeOptions({HD_STARTUP_MIN_INSTANCES:'100'}));
 const source=readFileSync(new URL('../functions/index.js',import.meta.url),'utf8');
 assert.match(source,/exports\.customerPortalBootstrap = functions\.https\.onRequest\(customerPortalBootstrapRequest\)/);
 assert.match(source,/exports\.customerPortalBootstrapRegional = functions\.https\.onRequest\(getStartupRuntimeOptions\(\{\}, \{minInstances:startupMinimumInstances\}\),customerPortalBootstrapRequest\)/);
 assert.match(source,/const customerPortalBootstrapRequest = runProtectedCustomerRequest\(/);
});

test('deployed runtime carries a bounded Firebase parameter expression instead of reading dotenv during discovery',()=>{
 const require=createRequire(new URL('../functions/index.js',import.meta.url)),{defineInt,select}=require('firebase-functions/params');
 const {onRequest}=require('firebase-functions/https');
 const parameter=defineInt('HD_STARTUP_MIN_INSTANCES_TEST',{default:0,input:select([0,1])}).equals(1).thenElse(1,0);
 const options=getStartupRuntimeOptions({}, {minInstances:parameter});
 assert.equal(options.minInstances,parameter);
 const endpoint=onRequest(options,(_request,_response)=>{}).__endpoint;
 assert.match(JSON.stringify(endpoint.minInstances),/HD_STARTUP_MIN_INSTANCES_TEST/);
 assert.match(parameter.toCEL(),/== 1/);
 assert.match(parameter.toCEL(),/\? 1 : 0/);
 assert.throws(()=>getStartupRuntimeOptions({}, {minInstances:100}),/parameter expression/);
 const source=readFileSync(new URL('../functions/index.js',import.meta.url),'utf8');
 assert.equal((source.match(/getStartupRuntimeOptions\(\{\}, \{minInstances:startupMinimumInstances\}\)/g)||[]).length,3);
 assert.match(source,/default:0,input:select\(\[0,1\]\)/);
});
