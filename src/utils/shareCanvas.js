import { replayShareCanvas } from './shareCanvasCommands.js';
import {createShareCanvasWorker} from './shareCanvasWorkerFactory.js';

let worker;
let workerUnavailable = false;
let nextId = 0;
const pending = new Map();
let idleTimer;
const releaseIdleWorker=()=>{if(pending.size)return;worker?.terminate();worker=undefined;clearTimeout(idleTimer)};
const scheduleIdleRelease=()=>{clearTimeout(idleTimer);if(!pending.size)idleTimer=setTimeout(releaseIdleWorker,15000)};

function encodeInWorker(payload) {
  clearTimeout(idleTimer);
  if (!worker && !workerUnavailable) {
    try { worker = createShareCanvasWorker(); }
    catch (error) { workerUnavailable = true; throw error; }
    const current=worker;
    worker.onmessage = ({ data }) => {
      if(worker!==current)return;
      const job = pending.get(data.id);
      if (!job) return;
      pending.delete(data.id);
      clearTimeout(job.timer);
      if (data.error) job.reject(new Error(data.error));
      else if (!(data.blob instanceof Blob) || !data.blob.size) job.reject(new Error('Canvas worker returned no image'));
      else job.resolve(data.blob);
      scheduleIdleRelease();
    };
    const fail = () => {
      if(worker!==current)return;
      workerUnavailable = true;
      worker?.terminate();
      worker = undefined;
      for (const job of pending.values()){clearTimeout(job.timer);job.reject(new Error('Canvas worker unavailable'))}
      pending.clear();
    };
    worker.onerror = fail;
    worker.onmessageerror = fail;
    worker.failPending=fail;
  }
  if (!worker) return Promise.reject(new Error('Canvas worker unavailable'));
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer=setTimeout(()=>worker?.failPending?.(),30000);
    pending.set(id, { resolve, reject, timer });
    try { worker.postMessage({ ...payload, id }); }
    catch (error) { clearTimeout(timer);pending.delete(id);scheduleIdleRelease();reject(error); }
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
        try {
          return await new Promise((resolve, reject) => canvas.toBlob(blob => {
            if (blob) resolve(blob);
            else reject(new Error('Share image encoding failed'));
          }, options.type, options.quality));
        } finally { canvas.width=0;canvas.height=0; }
      }
    },
  };
}
