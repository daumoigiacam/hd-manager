import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');

assert.match(workflow, /push:\s*\r?\n\s+branches:\s*\r?\n\s+- main/);
assert.match(workflow, /VITE_DATA_MODE:\s+vps-production/);
assert.match(workflow, /VITE_API_BASE_URL:\s+https:\/\/app\.hdconnect\.net\/api\/v1/);
assert.match(workflow, /VITE_INVENTORY_VPS_ENABLED:\s+'true'/);
assert.match(workflow, /github\.event_name == 'push' \|\| \(github\.event_name == 'workflow_dispatch' && inputs\.confirm_production_release == true\)/);
assert.match(workflow, /host: \$\{\{ secrets\.VPS_HOST \}\}/);
assert.match(workflow, /\/home\/hdmanager\/deploy\.sh/);
assert.match(workflow, /https:\/\/app\.hdconnect\.net\/index\.html\?release=\$\{GITHUB_SHA\}/);
assert.match(workflow, /SERVED_BUILD_ID.*GITHUB_SHA/);
assert.match(workflow, /https:\/\/app\.hdconnect\.net\/api\/v1\/health/);
assert.match(workflow, /hd-connect-platform/);

console.log('Production deployment workflow safety checks passed.');
