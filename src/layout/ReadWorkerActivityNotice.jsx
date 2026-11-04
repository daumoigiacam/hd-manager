import {useSyncExternalStore} from 'react';
const noopSubscribe=()=>()=>{};
const idle=()=>false;
export default function ReadWorkerActivityNotice({store}) {
  const pending=useSyncExternalStore(store?.subscribe||noopSubscribe,store?.getBusySnapshot||idle,idle);
  // Background synchronization must not insert a floating badge or move content.
  // Keep truthful readiness for diagnostics; the marker remains busy until commit.
  return pending ? <span hidden aria-hidden="true" aria-busy="true" data-hd-read-refreshing="true" /> : null;
}
