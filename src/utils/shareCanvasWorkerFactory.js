import ShareCanvasWorker from './shareCanvas.worker.js?worker';
// Vite emits a classic IIFE; Android 7–10 WebViews before Chrome 80 cannot
// construct the module worker used by the old inline URL constructor.
export const createShareCanvasWorker=()=>new ShareCanvasWorker();
