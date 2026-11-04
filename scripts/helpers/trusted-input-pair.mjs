// Queue down/up on the SAME ordered CDP connection before awaiting either ACK.
// Serial ACK waits can turn a synthetic tap into a host-delayed long press.
// Native event timestamps are untouched. Verify target protocol ordering on
// each supported browser; this is harness calibration, not an app speedup.
export async function dispatchTrustedTap(client,point) {
  const down=client.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
  const up=client.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
  await Promise.all([down,up]);
}
export function assertNativeTapProtocolProof(proof) {
  if(proof?.status!=='NATIVE_PAIRED_TAP_PROTOCOL_VERIFIED_NOT_APP_BENEFIT'||proof.device?.api!=='29'||!/^Current WebView package.*74\.0\.3729\.185/.test(proof.device?.webview||''))throw Error('Android10/WebView74 paired tap protocol has not been verified');
  const rows=proof.trials;
  if(!Array.isArray(rows)||rows.length!==6||['serial','paired'].some(variant=>rows.filter(row=>row.variant===variant).length!==3))throw Error('Native paired tap calibration is incomplete');
  for(const row of rows){
    if(row.events?.map(event=>event.name).join(',')!=='pointerdown,pointerup,click'||row.events.some(event=>event.trusted!==true||!Number.isFinite(event.at)))throw Error('Native calibration has untrusted or incomplete input');
    const gap=row.events[1].at-row.events[0].at;
    if(!Number.isFinite(row.downUpGapMs)||Math.abs(gap-row.downUpGapMs)>.01||gap<0||(row.variant==='serial'?gap<140:gap>100))throw Error('Native paired tap calibration failed its controlled ACK-delay bounds');
  }
}
export async function dispatchTrustedKeyPair(client,key) {
  const down=client.send('Input.dispatchKeyEvent',{type:'rawKeyDown',...key});
  const up=client.send('Input.dispatchKeyEvent',{type:'keyUp',...key});
  await Promise.all([down,up]);
}
