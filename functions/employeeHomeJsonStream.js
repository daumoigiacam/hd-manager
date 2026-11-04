const invalid=()=>Object.assign(new Error('invalid_home_stream'),{code:'invalid_home_stream',statusCode:503});
// Parse only the REST RunQuery JSON array, one object at a time. A large query
// must not become one response.json()/JSON.parse() allocation. No data logging.
async function* readHomeQueryObjects(body,{onBytes=()=>{},check=()=>{},maxEntryCodeUnits=8*1024*1024}={}){
 if(!body?.[Symbol.asyncIterator]||!Number.isSafeInteger(maxEntryCodeUnits)||maxEntryCodeUnits<1)throw invalid();
 const decoder=new TextDecoder('utf-8',{fatal:true});let stage='start',quoted=false,escaped=false,parts=[],length=0,stack=[],allowEnd=true;
 const append=text=>{length+=text.length;if(length>maxEntryCodeUnits)throw invalid();parts.push(text)};
 function* consume(text){
  let segment=stage==='entry'?0:-1;
  for(let i=0;i<text.length;i++){
   const c=text[i];
   if(stage==='entry'){
    if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false}
    else if(c==='"')quoted=true;
    else if(c==='{'||c==='[')stack.push(c);
    else if(c==='}'||c===']'){
     if(stack.pop()!==(c==='}'?'{':'['))throw invalid();
     if(!stack.length){append(text.slice(segment,i+1));check();let value;try{value=JSON.parse(parts.join(''))}catch{throw invalid()}
      parts=[];length=0;segment=-1;stage='delimiter';yield value;}
    }
   }else if(/[\x20\t\r\n]/.test(c))continue;
   else if(stage==='start'){if(c!=='[')throw invalid();stage='value'}
   else if(stage==='value'){
    if(c===']'&&allowEnd){stage='done';continue}
    if(c!=='{')throw invalid();stage='entry';stack=['{'];segment=i;quoted=false;escaped=false;
   }else if(stage==='delimiter'){
    if(c===','){stage='value';allowEnd=false}else if(c===']')stage='done';else throw invalid();
   }else throw invalid();
  }
  if(segment>=0)append(text.slice(segment));
 }
 try{
  // HTTP streams may deliver many tiny buffers. Decode bounded 16-KiB blocks
  // instead of creating an async sub-generator/decoder job for every buffer.
  // The upstream byte/deadline budget is still checked on EVERY received chunk.
  const block=new Uint8Array(16384);let used=0;
  for await(const chunk of body){
   check();if(!(chunk instanceof Uint8Array))throw invalid();onBytes(chunk.byteLength);
   for(let offset=0;offset<chunk.byteLength;){
    const count=Math.min(block.byteLength-used,chunk.byteLength-offset);block.set(chunk.subarray(offset,offset+count),used);used+=count;offset+=count;
    if(used===block.byteLength){check();yield* consume(decoder.decode(block,{stream:true}));used=0}
   }
  }
  if(used){check();yield* consume(decoder.decode(block.subarray(0,used),{stream:true}))}
  yield* consume(decoder.decode());check();if(stage!=='done')throw invalid();
 }catch(error){if(/^(home_|invalid_home_|unsupported_home_)/.test(error?.code||''))throw error;throw invalid()}
}
module.exports={readHomeQueryObjects};
