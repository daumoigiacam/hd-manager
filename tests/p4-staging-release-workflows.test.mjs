import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseId = 'p4-vps-staging-20260829T072544Z';
const artifactName = 'hd-manager-p4-vps-staging-20260829T072544Z.zip';
const artifactSha256 = '08A6FB1849F0448AEA9B01A65480DEACBAD58FD81A3F8FEA03075C4AF582BB18';
const releaseDirectory = path.join(root, 'release', releaseId);

test('the versioned P4 manifest pins the approved artifact bytes', async () => {
  const manifest = JSON.parse(await readFile(path.join(releaseDirectory, 'manifest.json'), 'utf8'));
  const artifact = await readFile(path.join(releaseDirectory, artifactName));

  assert.equal(manifest.releaseId, releaseId);
  assert.equal(manifest.buildId, releaseId);
  assert.equal(manifest.artifact.file, artifactName);
  assert.equal(manifest.artifact.sha256, artifactSha256);
  assert.equal(createHash('sha256').update(artifact).digest('hex').toUpperCase(), artifactSha256);
});

test('the P4 producer only publishes the approved artifact and never deploys', async () => {
  const workflow = await readFile(path.join(root, '.github', 'workflows', 'publish-p4-staging-artifact.yml'), 'utf8');

  assert.match(workflow, /^\s*workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s*push:/m);
  assert.doesNotMatch(workflow, /^\s*environment:/m);
  assert.doesNotMatch(workflow, /(?:appleboy\/(?:ssh|scp)-action|STAGING_DEPLOY_)/i);
  assert.match(workflow, new RegExp(`name: ${artifactName}`));
  assert.match(workflow, new RegExp(`EXPECTED_ARTIFACT_SHA256: ${artifactSha256}`));
});

test('the staging release resolver supports a no-deploy provenance check', async () => {
  const workflow = await readFile(path.join(root, '.github', 'workflows', 'release-staging.yml'), 'utf8');

  assert.match(workflow, /- verify-artifact/);
  assert.match(workflow, /if: inputs\.mode == 'release' \|\| inputs\.mode == 'verify-artifact'/);
  assert.match(workflow, /if: inputs\.mode != 'verify-artifact'/);
  assert.match(workflow, /Multiple immutable P4 artifacts match the exact manifest; refusing to select a latest or fallback artifact/);
  assert.doesNotMatch(workflow, /resolution=latest-name-and-sha256-match/);
  assert.doesNotMatch(workflow, /sort -r/);
  assert.match(workflow, new RegExp(`EXPECTED_ARTIFACT_NAME: ${artifactName}`));
  assert.match(workflow, new RegExp(`EXPECTED_ARTIFACT_SHA256: ${artifactSha256}`));
  assert.match(workflow, /if: inputs\.mode == 'release'/);
});

test('ordinary pushes cannot invoke a production deployment', async () => {
  const workflow = await readFile(path.join(root, '.github', 'workflows', 'deploy.yml'), 'utf8');

  assert.match(workflow, /^\s*workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s*push:/m);
  assert.doesNotMatch(workflow, /github\.event_name == 'push'/);
  assert.match(workflow, /confirm_production_release:/);
  assert.match(workflow, /inputs\.confirm_production_release == true/);
});
