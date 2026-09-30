export function createDraftRevision() {
  let revision = 0;
  let savedRevision = 0;
  return {
    edit() { revision += 1; },
    capture() { return revision; },
    saved(submittedRevision) {
      savedRevision = Math.max(savedRevision, Math.min(submittedRevision, revision));
    },
    isDirty() { return revision !== savedRevision; },
  };
}
