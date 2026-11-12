import{createProjectionScheduler}from'../services/cooperativeProjection.js';

// Only completed blobs escape. Keep one bitmap alive at a time even on old
// WebViews without OffscreenCanvas, and yield before each page's drawing work.
export async function renderSharePagesSequentially(pages,{render,encode,signal,yieldTask}={}){
 const scheduler=yieldTask?{yieldTask,close(){}}:createProjectionScheduler();
 const blobs=[];
 const check=()=>{if(signal?.aborted)throw Object.assign(new Error('Share rendering cancelled'),{name:'AbortError'})};
 try{
  for(let index=0;index<pages.length;index++){
   check();await scheduler.yieldTask();check();
   const canvas=await render(pages[index],{pageNumber:index+1,totalPages:pages.length});
   try{check();const blob=await encode(canvas);check();if(!blob||!(blob.size>0))throw Error('Share image encoding failed');blobs.push(blob)}
   finally{canvas.width=0;canvas.height=0}
  }
  return blobs;
 }finally{scheduler.close()}
}
