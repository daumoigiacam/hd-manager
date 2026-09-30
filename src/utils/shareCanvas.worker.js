import { replayShareCanvas } from './shareCanvasCommands.js';

let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  // One bitmap at a time bounds memory when a share contains many pages.
  queue = queue.then(async () => {
    const { id, width, height, commands, options } = data;
    try {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas worker has no 2D context');
      replayShareCanvas(context, commands);
      const blob = await canvas.convertToBlob(options);
      self.postMessage({ id, blob });
    } catch (error) {
      self.postMessage({ id, error: error?.message || String(error) });
    }
  });
};
