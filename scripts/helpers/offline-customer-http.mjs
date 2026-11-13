import http from 'node:http';
export function createCustomerHttpServer(handle,{origins=[]}={}){
 const allowed=new Set(origins);
 return http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  const origin=req.headers.origin;
  if(origin&&!allowed.has(origin)){res.writeHead(403);res.end('{}');return;}
  if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  res.setHeader('Access-Control-Allow-Headers','authorization,content-type');res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  if(req.method!=='POST'){res.writeHead(405);res.end('{}');return;}
  const action=req.url?.slice(1);
  if(!['business-source','grant','sync','page','history','detail','customer-delta','home-head','home-page','home-report','warehouse-import-head','warehouse-import-page','attendance-adjustment','payroll-settlement','attendance-period'].includes(action)){res.writeHead(404);res.end('{}');return;}
  try{
   const header=req.headers.authorization||'';if(!header.startsWith('Bearer ')){res.writeHead(401);res.end('{}');return;}
   let size=0;const chunks=[];
   for await(const chunk of req){size+=chunk.length;if(size>524288){res.writeHead(413);res.end('{}');return;}chunks.push(chunk);}
   const result=await handle({action,token:header.slice(7),body:JSON.parse(Buffer.concat(chunks).toString()||'{}')});
   res.end(JSON.stringify(result));
  }catch(error){
   const unauthenticated=String(error.code||'').startsWith('auth/');
   const retryable=[4,8,14,'deadline-exceeded','resource-exhausted','unavailable'].includes(error.code);
   res.writeHead(unauthenticated?401:error.code==='permission-denied'?403:retryable?503:400);
   res.end(JSON.stringify({code:unauthenticated?'unauthenticated':retryable?'unavailable':error.code==='permission-denied'?'permission-denied':'invalid-request'}));
  }
 });
}
