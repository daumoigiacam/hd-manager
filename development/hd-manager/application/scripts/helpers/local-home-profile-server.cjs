// Synthetic loopback-only server for client CPU diagnosis. No Google project,
// real credential, business document, mutation or external listener is used.
const {createRequire}=require('node:module'),path=require('node:path');
const fromFunctions=createRequire(path.resolve(__dirname,'../../functions/package.json'));
const grpc=fromFunctions('@grpc/grpc-js'),loader=fromFunctions('@grpc/proto-loader');
const schema=fromFunctions('@google-cloud/firestore/build/protos/v1.json');
const definition=loader.fromJSON(schema,{longs:String,enums:String,defaults:true,oneofs:true}),pkg=grpc.loadPackageDefinition(definition);
const server=new grpc.Server();let configured=false;
process.once('message',async config=>{
 if(configured)return;configured=true;
 const readTime={seconds:'1793590000',nanos:123456789},parent='projects/synthetic-project/databases/(default)/documents/artifacts/synthetic-app/public/data';
 server.addService(pkg.google.firestore.v1.Firestore.service,{async runQuery(call){
  try{
   if(call.request.parent!==parent)throw Error('Synthetic parent required');
   const name=call.request.structuredQuery.from[0].collectionId,count=Math.min(config.counts[name]||0,call.request.structuredQuery.limit.value);
   const selected=call.request.structuredQuery.select?.fields.map(f=>f.fieldPath);
   const keys=(selected||config.fields).filter(key=>!['id','companyId'].includes(key)).slice(0,24);
   let cancelled=false;call.once('cancelled',()=>{cancelled=true});
   if(!count)call.write({readTime});
   for(let index=0;index<count&&!cancelled;index++){
    const fields={companyId:{stringValue:'synthetic-company'}};
    for(let i=0;i<keys.length;i++)fields[keys[i]]=i%4===0?{integerValue:String(index)}:i%4===1?{timestampValue:readTime}:{stringValue:'synthetic-value-0123456789'};
    if(!call.write({readTime,document:{name:parent+'/'+name+'/'+String(index).padStart(6,'0'),fields}}))await new Promise(resolve=>{call.once('drain',resolve);call.once('cancelled',resolve)});
   }
   if(!cancelled)call.end();
  }catch(error){call.emit('error',Object.assign(new Error('synthetic source failed'),{code:grpc.status.INTERNAL}))}
 }});
 const port=await new Promise((resolve,reject)=>server.bindAsync('127.0.0.1:0',grpc.ServerCredentials.createInsecure(),(error,port)=>error?reject(error):resolve(port)));
 process.send({port});
});
process.once('disconnect',()=>{server.forceShutdown();process.exit(0)});
