import HomeWorker from './personalHomeWorker.js?worker';
// Vite emits the configured classic IIFE. WebView 74 cannot construct a module
// worker, even when the fetched bundle itself contains no ES module imports.
export const createPersonalHomeWorker=()=>new HomeWorker();
