// A creation attempt can span several API calls. Keep the returned row and
// confirmed extras across retries rather than issuing another POST.
export function createDraftCreator(api, onSaved) {
  let row = null;
  let answers = {};
  return async ({ title, projectId, description, notes }) => {
    try {
      if (!row) {
        row = await api.createPrd(title, projectId);
        onSaved(row, answers);
      }
      if (description && row.description !== description) {
        row = await api.updatePrd(row.id, { revision: row.revision, description });
        onSaved(row, answers);
      }
      if (notes && answers.notes !== notes) {
        await api.saveIntakeAnswer(row.id, "notes", notes, false);
        answers = { notes };
        onSaved(row, answers);
      }
      return row;
    } catch (cause) {
      const error = new Error(row
        ? `Your draft was created, but its details could not all be saved. Retry to finish saving this draft. ${cause.message}`
        : cause.message);
      error.draftCreated = Boolean(row);
      throw error;
    }
  };
}
