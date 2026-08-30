import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(repositoryRoot, '.github', 'workflows', 'release-staging.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');

const EXPECTED_BUILD_ID = 'p4-vps-staging-20260829T072544Z';
const EXPECTED_ARTIFACT_NAME = 'hd-manager-p4-vps-staging-20260829T072544Z.zip';
const EXPECTED_ARTIFACT_SHA256 = '08A6FB1849F0448AEA9B01A65480DEACBAD58FD81A3F8FEA03075C4AF582BB18';
const PREVIOUS_GOOD_BUILD_ID = 'p32-vps-staging-finance-refresh-20260829T090000Z';

function isServedBuildAccepted(versionJson, mode = 'release') {
  if (!versionJson || typeof versionJson.buildId !== 'string') return false;
  return mode === 'release'
    ? versionJson.buildId === EXPECTED_BUILD_ID
    : versionJson.buildId === PREVIOUS_GOOD_BUILD_ID;
}

function isArtifactProvenanceAccepted({ runId, artifactName, artifactSha256 }) {
  return /^[1-9][0-9]*$/.test(String(runId ?? ''))
    && artifactName === EXPECTED_ARTIFACT_NAME
    && String(artifactSha256 ?? '').toUpperCase() === EXPECTED_ARTIFACT_SHA256;
}

test('served P4 version accepts the exact buildId and rejects an incorrect buildId', () => {
  assert.equal(isServedBuildAccepted({ buildId: EXPECTED_BUILD_ID }), true);
  assert.equal(isServedBuildAccepted({ buildId: 'p4-vps-staging-unapproved' }), false);
});

test('served P4 version rejects a missing or non-string buildId', () => {
  assert.equal(isServedBuildAccepted({}), false);
  assert.equal(isServedBuildAccepted({ buildId: null }), false);
  assert.equal(isServedBuildAccepted({ buildId: 123 }), false);
});

test('artifact provenance requires a positive run ID, exact filename, and approved SHA-256', () => {
  const valid = {
    runId: 33260050787,
    artifactName: EXPECTED_ARTIFACT_NAME,
    artifactSha256: EXPECTED_ARTIFACT_SHA256,
  };
  assert.equal(isArtifactProvenanceAccepted(valid), true);
  assert.equal(isArtifactProvenanceAccepted({ ...valid, artifactSha256: '0'.repeat(64) }), false);
  assert.equal(isArtifactProvenanceAccepted({ ...valid, artifactName: 'latest.zip' }), false);
  assert.equal(isArtifactProvenanceAccepted({ ...valid, runId: 0 }), false);
  assert.equal(isArtifactProvenanceAccepted({ ...valid, runId: '' }), false);
});

test('workflow verifies the artifact SHA before staging transfer and uses buildId for served read-back', () => {
  const artifactShaStep = workflow.indexOf('- name: Verify artifact SHA-256 before transfer');
  const transferStep = workflow.indexOf('- name: Transfer exact P4 artifact to staging only');
  const servedStep = workflow.indexOf('- name: Verify served staging bundle and API');

  assert.ok(artifactShaStep >= 0);
  assert.ok(artifactShaStep < transferStep);
  assert.ok(transferStep < servedStep);
  assert.match(workflow, /test "\$\{actual\}" = "\$\{EXPECTED_ARTIFACT_SHA256\}"/);
  assert.match(workflow, /test "\$\{ARTIFACT_SHA256\^\^\}" = "\$\{EXPECTED_ARTIFACT_SHA256\}"/);
  assert.match(workflow, /jq -er '\.buildId \| select\(type == "string"\)'/);
  assert.match(workflow, /test "\$\{served_build_id\}" = "\$\{EXPECTED_BUILD_ID\}"/);
  assert.doesNotMatch(workflow, /\.artifactSha256/);
  assert.doesNotMatch(workflow, /served_artifact_sha256/);
});

test('workflow remains staging-only and keeps the rollback allow-list', () => {
  assert.match(workflow, /environment:\s*\n\s+name: staging/);
  assert.match(workflow, /STAGING_APP_DOMAIN: staging-app\.hdconnect\.net/);
  assert.match(workflow, /STAGING_API_URL: https:\/\/staging-api\.hdconnect\.net\/api\/v1/);
  assert.match(workflow, /Refusing a production-looking deployment host/);
  assert.match(workflow, /test "\$\{ROLLBACK_BUILD_ID\}" = "\$\{PREVIOUS_GOOD_BUILD_ID\}"/);
  assert.match(workflow, /--allow-only \$\{PREVIOUS_GOOD_BUILD_ID\}/);
});
