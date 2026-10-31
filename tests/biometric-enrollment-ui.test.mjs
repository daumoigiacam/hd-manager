import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

test('password-authenticated enrollment can continue without enrollment, including after OS failure, and cannot race an active prompt', { timeout: 30000 }, async () => {
  const output = await build({ stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import Enrollment from './src/features/identity/BiometricEnrollment.jsx';
    window.result=[];window.enrollCalls=0;window.logoutCalls=0;
    createRoot(document.getElementById('root')).render(React.createElement(Enrollment,{
      identity:{id:'test'},getToken:async()=>'fixture',onDone:r=>window.result.push(r),onCancel:()=>window.logoutCalls++
    }));`, resolveDir: process.cwd(), loader: 'jsx' }, bundle: true, write: false, format: 'iife', jsx: 'automatic',
    plugins: [{ name: 'isolated-enrollment-api', setup(b) {
      b.onResolve({ filter: /services\/identityCenter\.js$/ }, () => ({ path: 'identity-fixture', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
        export async function getBiometricAvailability(){return {available:window.scenario==='pending',label:'Vân tay'}}
        export async function identitySetBiometric(){window.enrollCalls++;await new Promise(r=>window.finishPrompt=r);throw Error('OS cancelled')}
      ` }));
    } }] });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome'), headless: true });
  try {
    for (const scenario of ['unavailable', 'pending']) {
      const page = await browser.newPage();
      await page.setContent('<div id="root"></div>');
      await page.evaluate(s => { window.scenario = s; }, scenario);
      await page.addScriptTag({ content: output.outputFiles[0].text });
      const skip = page.getByRole('button', { name: 'Tiếp tục bằng mật khẩu', exact: true });
      const enable = page.getByRole('button', { name: 'Bật ngay', exact: true });
      await skip.waitFor();
      if (scenario === 'unavailable') assert.equal(await enable.isDisabled(), true);
      else {
        await enable.click();
        assert.equal(await skip.isDisabled(), true);
        await page.evaluate(() => window.finishPrompt());
        await page.getByRole('alert').waitFor();
      }
      await skip.click();
      assert.deepEqual(await page.evaluate(() => ({ result:window.result,calls:window.enrollCalls,logout:window.logoutCalls })), {
        result:[{enabled:false}], calls:scenario==='pending'?1:0, logout:0,
      });
      await page.close();
    }
  } finally { await browser.close(); }
});
