import {createHash} from 'node:crypto';
// Static same-origin assets only. Never cache Firebase/API/auth responses or
// mutations. New versions wait for old clients to close; no forced reload.
export function offlineShellPlugin({enabled=false}={}){
  return {name:'hd-offline-static-shell',apply:'build',enforce:'post',generateBundle(_options,bundle){
    if(!enabled)return;
    const assets=Object.values(bundle).filter(x=>!x.fileName.endsWith('.map')&&x.fileName!=='version.json');
    if(!assets.some(x=>x.fileName==='index.html'))throw Error('Offline shell requires a built index');
    const names=assets.map(x=>x.fileName).sort();
    const hash=createHash('sha256');for(const item of assets.sort((a,b)=>a.fileName.localeCompare(b.fileName)))hash.update(item.fileName).update(item.type==='chunk'?item.code:item.source);
    const version=hash.digest('hex');
    const code=`const CACHE='hd-offline-shell-${version}';
const ASSETS=${JSON.stringify(names)}.map(p=>new URL(p,self.registration.scope).href);
const ALLOWED=new Set(ASSETS);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(url=>new Request(url,{credentials:'omit',cache:'reload'}))))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const versions=(await caches.keys()).filter(k=>k.startsWith('hd-offline-shell-'));const retained=new Set([CACHE,...versions.filter(k=>k!==CACHE).slice(-1)]);await Promise.all(versions.filter(k=>!retained.has(k)).map(k=>caches.delete(k)));await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='HD_OFFLINE_SHELL_STATUS'&&event.ports[0])event.waitUntil(caches.open(CACHE).then(async cache=>event.ports[0].postMessage({version:'${version}',ready:(await Promise.all(ASSETS.map(url=>cache.match(url)))).every(Boolean)})));});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 if(ALLOWED.has(url.href)){event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(request))||fetch(request)));return;}
 if(/\\/assets\\/[^/]+\\.(js|css|wasm|woff2|png|svg)$/.test(url.pathname)){event.respondWith((async()=>{for(const key of (await caches.keys()).filter(k=>k.startsWith('hd-offline-shell-')).reverse()){const cached=await(await caches.open(key)).match(request);if(cached)return cached;}return fetch(request);})());return;}
 if(request.mode==='navigate'){event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(new URL('index.html',self.registration.scope).href))||fetch(request)));}
});`;
    this.emitFile({type:'asset',fileName:'offline-shell-sw.js',source:code});
    this.emitFile({type:'asset',fileName:'offline-shell-manifest.json',source:JSON.stringify({version,assets:names,apiCaching:false,forceReload:false,skipWaiting:false})});
  }};
}
