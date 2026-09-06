import test from "node:test";
import assert from "node:assert/strict";
import { uploadVpsAssetEvidence } from "../src/api/vpsAssetEvidence.js";

const COMPANY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FILE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const session = {
  id: USER,
  companyId: COMPANY,
  permissions: ["logistics.manage", "storage.upload"],
};
const file = (patch = {}) => ({
  name: "evidence.jpg",
  type: "image/jpeg",
  size: 3,
  arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  ...patch,
});
const api = (patch = {}) => ({
  uploadStorageFile: async (body) => ({
    id: FILE,
    companyId: COMPANY,
    status: "ACTIVE",
    scanStatus: "CLEAN",
    mimeType: "image/jpeg",
    ...patch,
    body,
  }),
});

test("uploads private, tenant-scoped evidence and returns only its durable StorageFile ID", async () => {
  const calls = [];
  const result = await uploadVpsAssetEvidence(
    {
      uploadStorageFile: async (body) => {
        calls.push(body);
        return api().uploadStorageFile(body);
      },
    },
    session,
    file(),
    "HANDOVER",
  );
  assert.deepEqual(result, {
    id: FILE,
    purpose: "HANDOVER",
    mimeType: "image/jpeg",
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].fileName, /^manager-asset-handover-[0-9a-f-]+\.jpg$/);
  assert.deepEqual(calls[0].tags, ["hd-manager", "asset-evidence", "handover"]);
  assert.equal(calls[0].visibility, "PRIVATE");
  assert.equal(calls[0].metadata.purpose, "MANAGER_ASSET_EVIDENCE");
  assert.ok(calls[0].contentBase64);
});

test("rejects unsafe inputs and never sends a storage request", async () => {
  for (const candidate of [
    file({ type: "image/svg+xml" }),
    file({ size: 0 }),
    file({ size: 10_000_001 }),
    file({ arrayBuffer: undefined }),
    file({ arrayBuffer: async () => new Uint8Array([1, 2]).buffer }),
  ]) {
    await assert.rejects(
      uploadVpsAssetEvidence(api(), session, candidate, "HANDOVER"),
    );
  }
  await assert.rejects(
    uploadVpsAssetEvidence(
      api(),
      { ...session, permissions: ["logistics.manage"] },
      file(),
      "HANDOVER",
    ),
    /PERMISSION_REQUIRED/,
  );
  await assert.rejects(
    uploadVpsAssetEvidence(api(), session, file(), "UNKNOWN"),
    /PURPOSE_INVALID/,
  );
});

test("fails closed when storage does not prove an active clean file in the current tenant", async () => {
  for (const patch of [
    { companyId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
    { status: "QUARANTINED" },
    { scanStatus: "INFECTED" },
    { mimeType: "image/png" },
    { id: "legacy_file" },
  ])
    await assert.rejects(
      uploadVpsAssetEvidence(api(patch), session, file(), "REGISTRATION"),
      /RECONCILIATION_REQUIRED/,
    );
});
