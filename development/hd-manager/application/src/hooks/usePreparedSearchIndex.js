import {useEffect,useState} from 'react';
import {createSearchRecordIndexAsync} from '../services/searchEngine.js';

// One view-owned index, not a second data cache. Never expose an old source
// array or extractor while its replacement is still being prepared.
export function usePreparedSearchIndex(records,getFields,enabled=true){
 const [prepared,setPrepared]=useState(null);
 const [failure,setFailure]=useState(null);
 const ready=prepared?.records===records&&prepared?.getFields===getFields;
 useEffect(()=>{
  if(!enabled||ready)return;
  const controller=new AbortController();
  createSearchRecordIndexAsync(records,getFields,{signal:controller.signal,maxRecordsPerTurn:8})
   .then(index=>{if(!controller.signal.aborted){setFailure(null);setPrepared({records,getFields,index})}})
   .catch(error=>{if(!controller.signal.aborted)setFailure({records,getFields,error})});
  return()=>controller.abort();
 },[records,getFields,enabled,ready]);
 const error=enabled&&failure?.records===records&&failure?.getFields===getFields&&!ready?failure.error:null;
 return{index:ready?prepared.index:null,pending:Boolean(enabled&&!ready&&!error),error};
}
