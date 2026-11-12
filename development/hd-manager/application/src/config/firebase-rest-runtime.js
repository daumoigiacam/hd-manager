import { getFirestoreRestOrigin } from './firebase-endpoints.js';

export const buildFirebaseRestDocumentUrl = (
  projectId,
  appId,
  collectionName,
  documentId,
  { merge = false, fieldPaths = [] } = {},
) => {
  if (!projectId || !appId || !collectionName || !documentId) return '';

  const baseUrl = `${getFirestoreRestOrigin(projectId)}/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/artifacts/${encodeURIComponent(appId)}/public/data/${encodeURIComponent(collectionName)}/${encodeURIComponent(documentId)}`;
  if (!merge || fieldPaths.length === 0) return baseUrl;

  const encodedFields = fieldPaths
    .map((fieldPath) => `updateMask.fieldPaths=${encodeURIComponent(fieldPath)}`)
    .join('&');
  return `${baseUrl}?${encodedFields}`;
};

export const buildFirebaseRestCollectionQueryUrl = (projectId, appId) => {
  if (!projectId || !appId) return '';
  return `${getFirestoreRestOrigin(projectId)}/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/artifacts/${encodeURIComponent(appId)}/public/data:runQuery`;
};
