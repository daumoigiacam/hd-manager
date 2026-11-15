// Local-only handler → React commit diagnostics. This does not measure paint,
// Android input dispatch, or server readiness. Never collect query text/IDs.
const local=import.meta.env?.MODE==='emulator'&&import.meta.env?.VITE_OFFLINE_ENVIRONMENT==='local';
function publish(value){
 console.info('HD_LOCAL_INTERACTION '+JSON.stringify(value));
 const cap=globalThis.Capacitor;
 if(cap?.getPlatform?.()==='android'&&cap.nativePromise)
  void cap.nativePromise('NativeSafeArea','recordLocalInteraction',value).catch(()=>{});
}
export function createLocalCommitTiming({enabled=local,clock=()=>performance.now(),emit=publish}={}){
 let pending=null,sequence=0;
 const finish=(status,count=0)=>{
  if(!pending)return;
  const value={id:pending.id,module:'asset_management',action:'search',status,
   durationMs:Math.max(0,clock()-pending.at),count,scope:'handler-to-react-commit-not-frame'};
  pending=null;emit(value);return value;
 };
 return Object.freeze({
  start(){if(!enabled)return;finish('superseded');pending={id:++sequence,at:clock()};},
  commit(count){if(enabled)return finish('committed',count);},
  close(){if(enabled)finish('cancelled');},
 });
}
