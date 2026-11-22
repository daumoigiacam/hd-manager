import assert from 'node:assert/strict';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
test('development report worker resolves the same audited payroll domain as the build worker',async()=>{
  const previous=process.cwd(),root=fileURLToPath(new URL('../',import.meta.url));let server;
  try{
    process.chdir(root);
    server=await createServer({root,configFile:root+'vite.config.js',mode:'emulator',server:{host:'127.0.0.1',port:0},logLevel:'silent'});
    await server.listen();const port=server.httpServer.address().port;
    const response=await fetch(`http://127.0.0.1:${port}/src/services/onlineHomeProjectionWorker.js?worker_file&type=classic`);
    const source=await response.text();assert.equal(response.status,200,source.slice(0,300));
    const url=source.match(/from\s+["']([^"']*online-home-payroll[^"']*)["']/)?.[1];assert.ok(url,'Worker imports the audited payroll domain');
    assert.ok(url.startsWith('/'),'Bare virtual import was resolved');
    const domain=await fetch(`http://127.0.0.1:${port}${url}`);assert.equal(domain.status,200);
    const code=await domain.text();assert.match(code,/buildDashboardPayrollCostRows/);assert.doesNotMatch(code,/from\s+["'](?:react|firebase)/);
  }finally{await server?.close();process.chdir(previous);}
});
