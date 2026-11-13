import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),yaml=require('yaml');
test('release workflow builds canonical client into the shared native webDir and never triggers from push',async()=>{
 const doc=yaml.parse(await fs.readFile('.github/workflows/android-release-candidate.yml','utf8'));
 assert.deepEqual(Object.keys(doc.on),['workflow_dispatch']);assert.equal(doc.permissions.contents,'read');
 const steps=doc.jobs.release.steps,commands=steps.map(x=>x.run||'').join('\n');
 assert.match(commands,/npm ci --prefix development\/hd-manager\/application --ignore-scripts/);
 assert.match(commands,/npm --prefix development\/hd-manager\/application run build -- --mode production --outDir \.\.\/\.\.\/\.\.\/dist/);
 assert.match(commands,/npx cap sync android/);assert.match(commands,/--require-secrets/);
 assert.doesNotMatch(commands,/keytool[^\n]*-genkey|signingConfigs\.debug|firebase deploy|git push/);
 const signing=steps.find(x=>x.name==='Build officially signed APK and AAB');assert.equal(signing.env.HD_RELEASE_KEY_ALIAS,'hdmanager-upload');
 assert.equal(signing.env.HD_RELEASE_STORE_PASSWORD,'${{ secrets.HD_RELEASE_STORE_PASSWORD }}');assert.equal(signing.env.HD_RELEASE_KEY_PASSWORD,'${{ secrets.HD_RELEASE_KEY_PASSWORD }}');
 assert.match(signing.run,/assembleRelease bundleRelease/);
 const config=JSON.parse(await fs.readFile('capacitor.config.json','utf8'));assert.equal(config.webDir,'dist');assert.equal(config.appId,'com.hdmanager.app');assert(!config.server?.url);
});
test('signing proof is independent from API deployment and never builds or publishes an app',async()=>{
 const doc=yaml.parse(await fs.readFile('.github/workflows/android-signing-readiness.yml','utf8'));
 assert.deepEqual(Object.keys(doc.on),['workflow_dispatch']);assert.equal(doc.permissions.contents,'read');assert.equal(doc.jobs.verify.if,"github.ref == 'refs/heads/main'");
 const steps=doc.jobs.verify.steps,commands=steps.map(s=>s.run||'').join('\n');
 assert.match(commands,/--require-secrets/);assert.match(commands,/d5d616282282ea86ac1a99247b785fdedec9b93a399a6e3f03037693b236a43d/);
 assert.doesNotMatch(commands,/assembleRelease|bundleRelease|gradlew|git push|firebase deploy|deploy\.sh|keytool.*-genkey/);
 assert.equal(steps.find(s=>s.uses==='actions/upload-artifact@v5').with.path,'android-signing-verification.json');
 assert.equal(steps.find(s=>s.name==='Verify private-key nonce and upgrade certificate').env.HD_RELEASE_KEY_ALIAS,'hdmanager-upload');
});
