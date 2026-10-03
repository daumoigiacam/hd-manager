import { build, preview } from 'vite';
const deadline = setTimeout(() => { console.error('Navigation timeout 180s'); process.exit(1); }, 180000);
Object.assign(process.env, { VITE_DATA_MODE: 'preview', VITE_ALLOW_PREVIEW_BUILD: 'true' });
const outDir = 'test-results/navigation-preview';
await build({ build: { outDir, minify: process.env.HD_NAV_READABLE === '1' ? false : 'esbuild' }, logLevel: 'error', plugins: process.env.HD_NAV_DIAG === '1' ? [{
  name: 'navigation-cache-diagnostic', enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('/src/App.jsx')) return;
    return code.replace('const previous = cache[key];', "const previous = cache[key]; if(previous) console.log('cache-miss-check',key,dependencies.map((v,i)=>Object.is(v,previous.dependencies[i])?null:i).filter(v=>v!==null));");
  },
}] : [] });
const server = await preview({ build: { outDir }, preview: { host: '127.0.0.1', port: 0 } });
process.env.HD_MANAGER_NAV_PERF_URL = `http://127.0.0.1:${server.httpServer.address().port}/`;
try { await import('./navigation-performance.visual.mjs'); }
finally { await new Promise(resolve => server.httpServer.close(resolve)); clearTimeout(deadline); }
