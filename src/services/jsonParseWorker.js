// Classic worker: JSON bodies only. HTTP authorization stays with the caller.
// A decoded REST page can still be expensive to deserialize in an old WebView.
// Transfer bounded rows with receiver backpressure; never clone a whole page
// into a single main-thread message. Send original row text, so the receiving
// WebView does not synchronously deserialize a deep structured-clone tree.
// CPU count alone does not describe a row's cost. A one-row/ACK rule turned
// small REST records into thousands of round trips on older four-core hosts.
// Coalesce original text by payload size, never a decoded page/object tree.
const rowBatchSize=16, rowBatchTextUnits=32768;
const transfers=new Map();
const arrayRowSpans=text=>{
  const spans=[];
  const isSpace=char=>char===' '||char==='\t'||char==='\r'||char==='\n';
  const hasRow=(start,end)=>{for(let index=start;index<end;index++)if(!isSpace(text[index]))return true;return false;};
  let first=0;
  while(isSpace(text[first]))first++;
  if(text[first]!=='[')return null;
  let start=first+1,depth=0,quoted=false;
  // Only frame the top-level array here. The receiver validates every original
  // row with JSON.parse and never publishes before the complete/count check.
  // Avoid parsing and allocating a second copy of the complete deep REST page.
  for(let index=start;index<text.length;index++){
    const char=text[index];
    if(quoted){if(char==='\\')index++;else if(char==='"')quoted=false;continue;}
    if(char==='"')quoted=true;
    else if(char==='['||char==='{')depth++;
    else if(char==='}') { if(--depth<0)throw new SyntaxError('Invalid JSON array.'); }
    else if(char===']'){
      if(depth)depth--;
      else{
        if(hasRow(start,index))spans.push([start,index]);
        else if(spans.length)throw new SyntaxError('Trailing JSON array comma.');
        for(let tail=index+1;tail<text.length;tail++)if(!isSpace(text[tail]))throw new SyntaxError('Trailing JSON data.');
        return spans;
      }
    }else if(char===','&&!depth){
      if(!hasRow(start,index))throw new SyntaxError('Missing JSON array row.');
      spans.push([start,index]);start=index+1;
    }
  }
  throw new SyntaxError('Unterminated JSON array.');
};
const sendChunk=transfer=>{
  if(transfer.offset===transfer.spans.length){
    transfers.delete(transfer.id);
    self.postMessage({type:'parsed-json-complete',id:transfer.id,count:transfer.offset});
    return;
  }
  const index=transfer.offset;
  const rows=[];let textUnits=0;
  for(let cursor=index;cursor<transfer.spans.length && rows.length<rowBatchSize;cursor++){
    const [start,end]=transfer.spans[cursor],length=end-start;
    // An individual oversized row already had to travel alone. Do not split
    // JSON tokens or silently discard a legitimate historical record.
    if(rows.length && textUnits+length>rowBatchTextUnits)break;
    rows.push(transfer.text.slice(start,end));textUnits+=length;
  }
  transfer.offset+=rows.length;
  self.postMessage({type:'parsed-json-chunk',id:transfer.id,index,encoding:'raw-json',rows});
};
self.onmessage = event => {
  const message=event.data;
  if (!message || !Number.isSafeInteger(message.id)) return;
  if(message.type==='cancel-json'){transfers.delete(message.id);return;}
  if(message.type==='ack-json'){
    const transfer=transfers.get(message.id);
    if(transfer && message.nextIndex===transfer.offset)sendChunk(transfer);
    return;
  }
  if(typeof message.text!=='string'||transfers.has(message.id))return;
  try {
    const spans=arrayRowSpans(message.text);
    if(!spans){self.postMessage({type:'parsed-json',id:message.id,value:JSON.parse(message.text)});return;}
    const transfer={id:message.id,text:message.text,spans,offset:0};
    transfers.set(message.id,transfer);
    self.postMessage({type:'parsed-json-start',id:message.id,count:spans.length});
    sendChunk(transfer);
  }
  catch { self.postMessage({type:'invalid-json',id:message.id}); }
};
