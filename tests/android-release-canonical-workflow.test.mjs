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
