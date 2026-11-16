import test from 'node:test';import assert from 'node:assert/strict';
import{localAndroidCapacitorConfig}from'../tools/local-development/android-config.mjs';
test('a Local APK cannot inherit QA/Production WebView origins, even after a cloud build',()=>{
 const original={appId:'com.hdmanager.app.acceptance',server:{hostname:'app.hdconnect.net',androidScheme:'https',allowNavigation:['app.hdconnect.net']},android:{captureInput:true},plugins:{CapacitorSQLite:{androidIsEncryption:true}}};
 const before=structuredClone(original),local=localAndroidCapacitorConfig(original);
 assert.equal(local.appId,'com.hdmanager.app.localdev');assert.equal(new URL(`${local.server.androidScheme}://${local.server.hostname}`).origin,'http://localhost');
 assert.deepEqual(local.server,{hostname:'localhost',androidScheme:'http',cleartext:true});
 assert.deepEqual(local.plugins,before.plugins);assert.equal(local.android.captureInput,true);
 assert.deepEqual(original,before,'the existing QA/Production configuration is never modified');
});
test('a Local APK rejects an injected remote asset server instead of silently overriding it',()=>{
 for(const url of ['https://app.hdconnect.net','https://staging-api.hdconnect.net','http://127.0.0.1:5221'])assert.throws(()=>localAndroidCapacitorConfig({server:{url}}),/bundled assets/);
});
