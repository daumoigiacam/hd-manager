import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from '@babel/parser';
import {getRegionalIdentityAuthUrl} from '../src/config/identityAuthRegion.js';

test('regional auth is opt-in, project-scoped, and never redirects emulator or unrelated endpoints',()=>{
  assert.equal(getRegionalIdentityAuthUrl('/api/identity/login'), '');
  const env={VITE_IDENTITY_AUTH_REGION:'asia-southeast1',VITE_FIREBASE_PROJECT_ID:'demo-regional-auth'};
  assert.equal(getRegionalIdentityAuthUrl('/api/identity/login',env),'https://asia-southeast1-demo-regional-auth.cloudfunctions.net/identityLoginRegional');
  assert.equal(getRegionalIdentityAuthUrl('/api/identity/biometric-login',env),'https://asia-southeast1-demo-regional-auth.cloudfunctions.net/identityBiometricLoginRegional');
  assert.equal(getRegionalIdentityAuthUrl('/api/identity/logout',env),'');
  assert.equal(getRegionalIdentityAuthUrl('/api/customer/bootstrap',env),'');
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
    const options=Object.fromEntries(regional.arguments[0].properties.map(p=>[p.key.name,p.value.value]));
    assert.deepEqual(options,{region:'asia-southeast1',memory:'256MiB',concurrency:4,minInstances:0});
    const declaration=ast.program.body.flatMap(n=>n.type==='VariableDeclaration'?n.declarations:[]).find(n=>n.id.name===handler);
    assert.equal(declaration.init.callee.name,'runIdentityRequest');
    assert.match(source.slice(declaration.start,declaration.end),/identityCenter\.(login|biometricLogin)\(/);
  }
});
