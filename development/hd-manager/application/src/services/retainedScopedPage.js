// A completed page may remain readable during same-query revalidation. The
// caller's query key includes the whole signed scope; new filters/accounts do
// not inherit it. Retention is NEVER a fresh checkpoint or a write permission.
export function retainedScopedPage({runtime,loaded,queryKey,requestKey,directory,invalid=false,checkpointChanged=false,pending=false}){
 const result=runtime?.isCurrent?.()&&!invalid&&loaded?.key===queryKey?loaded.result:null;
 const refreshing=Boolean(result&&(checkpointChanged||pending||loaded.requestKey!==requestKey||loaded.directory!==directory));
 return {result,refreshing,fresh:Boolean(result&&!refreshing)};
}
