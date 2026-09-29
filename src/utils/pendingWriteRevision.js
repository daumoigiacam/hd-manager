// Acknowledging an older request must never remove a newer local edit.
export const isSamePendingWriteRevision = (candidate, sent) => {
  if (!candidate || !sent || candidate.key !== sent.key || candidate.companyId !== sent.companyId) return false;
  if (candidate.revision || sent.revision) return candidate.revision === sent.revision;
  return candidate.updatedAt === sent.updatedAt
    && JSON.stringify(candidate.payload) === JSON.stringify(sent.payload)
    && JSON.stringify(candidate.options) === JSON.stringify(sent.options);
};
