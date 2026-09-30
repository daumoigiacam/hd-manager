import { replayShareCanvas } from './shareCanvasCommands.js';

let worker;
let workerUnavailable = false;
let nextId = 0;
const pending = new Map();

function encodeInWorker(payload) {
  if (!worker && !workerUnavailable) {
    try { worker = new Worker(new URL('./shareCanvas.worker.js', import.meta.url), { type: 'module' }); }
    catch (error) { workerUnavailable = true; throw error; }
    worker.onmessage = ({ data }) => {
      const job = pending.get(data.id);
      if (!job) return;
      pending.delete(data.id);
      if (data.error) job.reject(new Error(data.error));
      else if (!(data.blob instanceof Blob) || !data.blob.size) job.reject(new Error('Canvas worker returned no image'));
      else job.resolve(data.blob);
    };
    const fail = () => {
      workerUnavailable = true;
      worker?.terminate();
      worker = undefined;
      for (const job of pending.values()) job.reject(new Error('Canvas worker unavailable'));
      pending.clear();
    };
    worker.onerror = fail;
    worker.onmessageerror = fail;
  }
  if (!worker) return Promise.reject(new Error('Canvas worker unavailable'));
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    try { worker.postMessage({ ...payload, id }); }
    catch (error) { pending.delete(id); reject(error); }
  });
}

export function createRecordedShareCanvas(width, height = 150) {
  const htmlCanvas = () => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined'
    || typeof OffscreenCanvas.prototype.convertToBlob !== 'function' || workerUnavailable) return htmlCanvas();

  const measurement = new OffscreenCanvas(1, 1);
  const measurementContext = measurement.getContext('2d');
  if (!measurementContext) return htmlCanvas();
  const commands = [];
  let encodingMode = 'worker';
  // Text measurement stays local; all raster drawing and PNG encoding run off-thread.
  const context = new Proxy(measurementContext, {
    set(target, key, value) {
      commands.push(['set', key, value]);
      target[key] = value;
      return true;
    },
    get(target, key) {
      if (key === 'measureText') return target.measureText.bind(target);
      if (typeof target[key] === 'function') return (...args) => { commands.push(['call', key, args]); };
      return target[key];
    },
  });
  const reset = () => { commands.length = 0; measurement.width = 1; };
  return {
    get width() { return width; },
    set width(value) { width = value; reset(); },
    get height() { return height; },
    set height(value) { height = value; reset(); },
    get encodingMode() { return encodingMode; },
    getContext: type => type === '2d' ? context : null,
    async convertToBlob(options = { type: 'image/png' }) {
      const snapshot = { width, height, commands: commands.map(command => [...command]), options };
      try { return await encodeInWorker(snapshot); }
      catch (_error) {
        encodingMode = 'html-fallback';
        const canvas = htmlCanvas();
        canvas.width = snapshot.width;
        canvas.height = snapshot.height;
        replayShareCanvas(canvas.getContext('2d'), snapshot.commands);
        return new Promise((resolve, reject) => canvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error('Share image encoding failed'));
        }, options.type, options.quality));
      }
    },
  };
}
