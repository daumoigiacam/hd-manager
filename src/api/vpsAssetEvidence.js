import { HdApiError } from "./client.js";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_BYTES = 10_000_000;

const fail = (code, message = code) => {
  throw new HdApiError(message, { code });
};

const isUuid = (value) => typeof value === "string" && UUID.test(value);

const binaryToBase64 = (bytes) => {
  if (typeof globalThis.btoa !== "function")
    fail("MANAGER_ASSET_EVIDENCE_ENCODING_UNAVAILABLE");
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return globalThis.btoa(binary);
};

export async function uploadVpsAssetEvidence(api, session, file, purpose) {
  if (
    !api?.uploadStorageFile ||
    !isUuid(session?.companyId) ||
    !isUuid(session?.id) ||
    !session.permissions?.includes("logistics.manage") ||
    !session.permissions?.includes("storage.upload")
  ) {
    fail("MANAGER_ASSET_EVIDENCE_PERMISSION_REQUIRED");
  }
  if (!["HANDOVER", "REGISTRATION", "INSPECTION"].includes(purpose))
    fail("MANAGER_ASSET_EVIDENCE_PURPOSE_INVALID");
  if (
    !file ||
    typeof file.name !== "string" ||
    !MIME_EXTENSIONS[file.type] ||
    !Number.isSafeInteger(file.size) ||
    file.size < 1 ||
    file.size > MAX_BYTES ||
    typeof file.arrayBuffer !== "function"
  ) {
    fail("MANAGER_ASSET_EVIDENCE_FILE_INVALID");
  }

  const body = new Uint8Array(await file.arrayBuffer());
  if (!body.length || body.length !== file.size || body.length > MAX_BYTES)
    fail("MANAGER_ASSET_EVIDENCE_FILE_INVALID");
  const fileName = `manager-asset-${purpose.toLowerCase()}-${crypto.randomUUID()}.${MIME_EXTENSIONS[file.type]}`;
  const uploaded = await api.uploadStorageFile({
    fileName,
    mimeType: file.type,
    contentBase64: binaryToBase64(body),
    namespaceCode: "DEFAULT",
    visibility: "PRIVATE",
    versioning: true,
    tags: ["hd-manager", "asset-evidence", purpose.toLowerCase()],
    metadata: { purpose: "MANAGER_ASSET_EVIDENCE", evidenceType: purpose },
  });
  if (
    !isUuid(uploaded?.id) ||
    uploaded.companyId !== session.companyId ||
    uploaded.status !== "ACTIVE" ||
    !["CLEAN", "SKIPPED"].includes(uploaded.scanStatus) ||
    uploaded.mimeType !== file.type
  ) {
    fail("MANAGER_ASSET_EVIDENCE_UPLOAD_RECONCILIATION_REQUIRED");
  }
  return { id: uploaded.id, purpose, mimeType: file.type };
}
