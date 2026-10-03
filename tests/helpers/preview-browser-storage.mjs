import { previewJournalPrefix, readPreviewJournal } from '../../src/mocks/preview-journal.js';

export async function installPreviewReader(page) {
  const script = `(() => { ${previewJournalPrefix.toString()}\n${readPreviewJournal.toString()}\nwindow.__readPreviewStore = () => { const key = 'hd-manager-local-db-v2-clean-preview'; return readPreviewJournal(localStorage, key, JSON.parse(localStorage.getItem(key) || '{}')); }; })()`;
  await page.addInitScript(script);
  await page.evaluate(script);
}
