export function findOwnedWebViewRendererPids(text,packageName,appPid) {
 if(!/^[A-Za-z][A-Za-z0-9_.]+$/.test(packageName)||!Number.isSafeInteger(appPid)||appPid<1)throw new TypeError('Invalid Android process scope.');
 const output=new Set();
 for(const block of String(text).split(/(?=^\s*\* ServiceRecord\{)/m)){
  const name=block.match(/^\s*\* ServiceRecord\{[^\n]*\su\d+\s+([^}\s]+)/m)?.[1];
  if(!name?.startsWith(packageName+'/org.chromium.content.app.SandboxedProcessService'))continue;
  const client=new RegExp(`Client AppBindRecord\\{[^\\n]*ProcessRecord\\{[^\\n]*\\s${appPid}:${packageName.replaceAll('.','\\.')}[\\/}]`);
  if(!client.test(block))continue;
  const pid=block.match(/^\s*app=ProcessRecord\{[^\n]*?\s(\d+):com\.google\.android\.webview:sandboxed_process/m)?.[1];
  if(pid)output.add(Number(pid));
 }
 return [...output].sort((a,b)=>a-b);
}
