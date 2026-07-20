const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
async function delay(ms){ return new Promise(r => setTimeout(r, ms)); }
async function main(){
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-codex-'));
  const port = 9223;
  const proc = spawn(edge, ['--headless=new','--disable-gpu',`--remote-debugging-port=${port}`,`--user-data-dir=${userDataDir}`,'about:blank'], { stdio: 'ignore' });
  try {
    let targets;
    for (let i=0;i<40;i++){
      try { const res = await fetch(`http://127.0.0.1:${port}/json`); targets = await res.json(); if (Array.isArray(targets)) break; } catch {}
      await delay(250);
    }
    const target = targets.find(t=>t.type==='page') || targets[0];
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    const pending = new Map(); let id = 0; const events = [];
    ws.onmessage = ev => { const msg = JSON.parse(ev.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(msg.error) : p.resolve(msg.result); } else if (msg.method) events.push(msg); };
    await new Promise((resolve,reject)=>{ ws.onopen=resolve; ws.onerror=reject; });
    const send = (method, params={}) => new Promise((resolve,reject)=>{ const msgId = ++id; pending.set(msgId, {resolve,reject}); ws.send(JSON.stringify({id:msgId,method,params})); });
    const evalExpr = async expression => { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return result.result ? result.result.value : undefined; };
    await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
    await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
    await delay(2500);
    console.log('HOME_START'); console.log(String(await evalExpr('document.body.innerText')).slice(0,1200)); console.log('HOME_END');
    await evalExpr(`(() => { const loginTab = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('Đăng nhập')); if (loginTab) loginTab.click(); const input = document.querySelector('input'); if (!input) return 'no-input'; const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value'); desc.set.call(input, '0909000001'); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); const enterBtn = Array.from(document.querySelectorAll('button')).find(b => /vao ung dung|vào ứng dụng/i.test((b.innerText||'').normalize('NFD').replace(/[\u0300-\u036f]/g,''))); if (enterBtn) enterBtn.click(); return 'done'; })()`);
    await delay(3500);
    console.log('APP_START'); console.log(String(await evalExpr('document.body.innerText')).slice(0,2200)); console.log('APP_END');
    await evalExpr(`(() => { const norm=s=>(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); const btn = Array.from(document.querySelectorAll('button')).find(b => norm(b.innerText||'').includes('thu chi')); if (btn) btn.click(); return !!btn; })()`);
    await delay(2500);
    console.log('FINANCE_START'); console.log(String(await evalExpr('document.body.innerText')).slice(0,2600)); console.log('FINANCE_END');
    const errs = events.filter(e => ['Runtime.exceptionThrown','Log.entryAdded','Runtime.consoleAPICalled'].includes(e.method));
    console.log('EVENT_COUNT', errs.length);
    if (errs.length) console.log(JSON.stringify(errs.slice(-4), null, 2));
    ws.close();
  } finally { try { proc.kill(); } catch {} }
}
main().catch(err => { console.error(err.stack || err); process.exit(1); });
