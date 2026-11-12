export function createScopedBackupSink(plugin, filename) {
  let handle = null;
  return {
    async write(data) {
      if (handle) throw new Error('Backup sink already started.');
      const opened = await plugin.start({ filename });
      if (!opened?.handle || typeof opened.handle !== 'string') throw new Error('Invalid backup handle.');
      handle = opened.handle;
      await plugin.append({ handle, data });
    },
    async append(data) {
      if (!handle) throw new Error('Backup sink not started.');
      await plugin.append({ handle, data });
    },
    async commit() {
      if (!handle) throw new Error('Backup sink not started.');
      const result = await plugin.commit({ handle });
      if (!result?.path || typeof result.path !== 'string') throw new Error('Backup publication was not confirmed.');
      handle = null;
      return result;
    },
    async abort() {
      if (!handle) return;
      const pending = handle;
      handle = null;
      await plugin.abort({ handle: pending });
    }
  };
}
