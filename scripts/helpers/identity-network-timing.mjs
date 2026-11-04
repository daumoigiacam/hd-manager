// CDP diagnostic only. Deliberately whitelist numeric timing/size and status;
// never retain headers, body, token, query string, request object or full URL.
export function createIdentityNetworkTimingCollector() {
  const rows=[],active=new Map();
  const numeric=value=>Number.isFinite(value)?value:null;
  const timings=['requestTime','proxyStart','proxyEnd','dnsStart','dnsEnd','connectStart','connectEnd','sslStart','sslEnd','sendStart','sendEnd','receiveHeadersEnd'];
  function route(url) {
    try {
      const u=new URL(url);
      if(u.hostname!=='127.0.0.1'||u.protocol!=='http:')return null;
      if(u.port==='5002'&&u.pathname==='/demo-hdm-perf-verification/us-central1/identityLogin')return 'identity-login';
      if(u.port==='9199'&&u.pathname.endsWith('/accounts:signInWithCustomToken'))return 'custom-token';
    }catch{/* non-URL CDP event is not a measured identity request */}
    return null;
  }
  return {
    onEvent(event) {
      const p=event.params||{};
      if(event.method==='Network.requestWillBeSent') {
        const name=route(p.request?.url);
        if(!name||rows.length>=32)return;
        const row={route:name,method:['POST','OPTIONS'].includes(p.request.method)?p.request.method:'OTHER',requestTimestamp:numeric(p.timestamp),requestWallTime:numeric(p.wallTime)};
        rows.push(row);active.set(p.requestId,row);
      } else {
        const row=active.get(p.requestId);if(!row)return;
        if(event.method==='Network.responseReceived') {
          row.status=numeric(p.response?.status);row.responseTimestamp=numeric(p.timestamp);
          row.timing=Object.fromEntries(timings.map(key=>[key,numeric(p.response?.timing?.[key])]));
        }else if(event.method==='Network.loadingFinished'){
          row.finishedTimestamp=numeric(p.timestamp);row.encodedDataLength=numeric(p.encodedDataLength);active.delete(p.requestId);
        }else if(event.method==='Network.loadingFailed'){
          row.failedTimestamp=numeric(p.timestamp);row.error=/^net::ERR_[A-Z_]+$/.test(p.errorText||'')?p.errorText:'REDACTED';active.delete(p.requestId);
        }
      }
    },
    snapshot() {return JSON.parse(JSON.stringify({rows,active:active.size,qualification:'Main-page CDP only, local loopback synthetic endpoints. Numeric network timeline is diagnostic overhead and not full login CPU. No headers/payload/query or remote endpoints are retained.'}));},
  };
}
