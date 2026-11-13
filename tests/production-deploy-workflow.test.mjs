import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {createRequire} from 'node:module';
const {parse}=createRequire(import.meta.url)('yaml');

const workflow = await readFile(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');

assert.match(workflow, /push:\s*\r?\n\s+branches:\s*\r?\n\s+- main/);
assert.match(workflow, /VITE_DATA_MODE:\s+cloud/);
assert.match(workflow, /VITE_FIREBASE_PROJECT_ID:\s+hd-manager-c5839/);
assert.match(workflow, /VITE_HD_APP_ID:\s+hd-manager-production/);
assert.match(workflow, /npm run verify:firebase-production-bundle/);
assert.equal((workflow.match(/VITE_FIRESTORE_READ_WORKER: 'true'/g) || []).length, 2, 'build and verification must use tested worker mode');
assert.equal((workflow.match(/VITE_WORKER_TRANSFER_PROFILE: 'balanced-64k'/g) || []).length, 2, 'build and static verification use the same measured bounded transfer profile');
assert.equal((workflow.match(/VITE_IDENTITY_AUTH_REGION: ''/g) || []).length, 2, 'regional endpoints remain disabled until separately deployed');
assert.doesNotMatch(workflow, /VITE_API_BASE_URL|VITE_INVENTORY_VPS_ENABLED|VITE_DATA_MODE:\s+vps-production/);
assert.doesNotMatch(workflow, /if:.*github\.event_name == 'push'/);
const guardedNames=[
  'Require same-source HTTPS Offline readiness before deployment',
  'Validate readiness and prepare trusted Production configuration',
  'Create deployment package','Calculate build SHA',
  'Preserve active frontend release before activation',
  'Prepare VPS deployment package path','Upload frontend to VPS',
  'Deploy frontend to VPS','Verify production static compression',
  'Verify production serves this release','Verify production entry-point assets',
];
const steps=parse(workflow).jobs.deploy.steps;
const manualGuard="github.event_name == 'workflow_dispatch' && inputs.confirm_production_release == true";
for(const name of guardedNames)assert.equal(steps.find(step=>step.name===name)?.if,manualGuard,name+' must remain manually authorized');
for(const step of steps.filter(step=>/appleboy\/(ssh|scp)-action/.test(step.uses||'')))if(step.name!=='Restore previous frontend if release verification fails')assert.equal(step.if,manualGuard,'Remote action cannot run on push');
assert.match(workflow, /name: Verify production static compression\s+if: github\.event_name == 'workflow_dispatch' && inputs\.confirm_production_release == true\s+run: node scripts\/verify-static-compression\.mjs --production/);
assert.match(workflow, /host: \$\{\{ secrets\.VPS_HOST \}\}/);
assert.match(workflow, /\/home\/hdmanager\/deploy\.sh/);
assert.match(workflow, /https:\/\/app\.hdconnect\.net\/index\.html\?release=\$\{GITHUB_SHA\}/);
assert.match(workflow, /SERVED_BUILD_ID.*GITHUB_SHA/);
assert.match(workflow, /https:\/\/hd-manager-c5839\.web\.app\//);
assert.match(workflow, /node scripts\/master-production-release-smoke\.mjs --production --expected-commit "\$\{GITHUB_SHA\}" --local-dist dist/);
assert.match(workflow, /path: test-results\/master-production-release-smoke\/\*\.json/);
assert.doesNotMatch(workflow, /app\.hdconnect\.net\/api\/v1|hd-connect-platform/);

console.log('Production deployment workflow safety checks passed.');

assert.match(workflow,/id: home_release_backup/);
assert.match(workflow,/if: failure\(\) && steps\.home_release_backup\.outcome == 'success'/);
assert(workflow.indexOf('Preserve active frontend')<workflow.indexOf('Deploy frontend to VPS'));
assert.match(workflow,/test -w "\$BASE"/);
assert.match(workflow,/mv -Tf "\$BASE\/\.rollback-\$RUN_ID" "\$BASE\/current"/);
