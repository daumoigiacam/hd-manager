import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');

assert.match(workflow, /push:\s*\r?\n\s+branches:\s*\r?\n\s+- main/);
assert.match(workflow, /VITE_DATA_MODE:\s+cloud/);
assert.match(workflow, /VITE_FIREBASE_PROJECT_ID:\s+hd-manager-c5839/);
assert.match(workflow, /VITE_HD_APP_ID:\s+hd-manager-production/);
assert.match(workflow, /npm run verify:firebase-production-bundle/);
assert.doesNotMatch(workflow, /VITE_API_BASE_URL|VITE_INVENTORY_VPS_ENABLED|VITE_DATA_MODE:\s+vps-production/);
assert.match(workflow, /github\.event_name == 'push' \|\| \(github\.event_name == 'workflow_dispatch' && inputs\.confirm_production_release == true\)/);
assert.match(workflow, /host: \$\{\{ secrets\.VPS_HOST \}\}/);
assert.match(workflow, /\/home\/hdmanager\/deploy\.sh/);
assert.match(workflow, /https:\/\/app\.hdconnect\.net\/index\.html\?release=\$\{GITHUB_SHA\}/);
assert.match(workflow, /SERVED_BUILD_ID.*GITHUB_SHA/);
assert.match(workflow, /https:\/\/hd-manager-c5839\.web\.app\//);
assert.doesNotMatch(workflow, /app\.hdconnect\.net\/api\/v1|hd-connect-platform/);

console.log('Production deployment workflow safety checks passed.');
