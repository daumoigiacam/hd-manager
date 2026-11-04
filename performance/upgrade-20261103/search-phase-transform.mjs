import{parse}from'@babel/parser';
const recorder=`\nfunction __hdSearchPhaseRecord(value){if(typeof window==='undefined'||!window.__hdVerification)return;const list=window.__hdVerification.searchPhases||(window.__hdVerification.searchPhases=[]);list.push(value);while(list.length>300)list.shift()}\n`;
export function instrumentSearchPhases(code,id){
 const file=id.split('?')[0].replaceAll('\\','/'),engine=file.endsWith('/src/services/searchEngine.js'),hook=file.endsWith('/src/hooks/usePreparedSearch.js');
 if(!engine&&!hook)return null;if(code.includes('__hdSearchPhaseRecord'))throw Error('Search instrumentation already present');
 const ast=parse(code,{sourceType:'module'}),edits=[];let count=0;
 function walk(node){if(!node||typeof node!=='object')return;
  if(engine&&node.type==='VariableDeclarator'&&['searchAsync','createSearchRecordIndexAsync'].includes(node.id?.name)){
   const body=node.init?.body;if(body?.type!=='BlockStatement')throw Error('Search function shape changed');const kind=node.id.name==='searchAsync'?'query.rank':'index.prepare';let text=code.slice(body.start+1,body.end-1),replaced=0;
   text=text.replace(/await (scheduler\.yieldTask|yieldTask)\(\)/g,(_,fn)=>{replaced++;return`await __hdPhaseYield(${fn},${fn.startsWith('scheduler.')?'scheduler':'undefined'})`});if(!replaced)throw Error('No owned cooperative yields');
   const prefix=`const __hdPhaseStart=performance.now();let __hdPhaseYields=0,__hdPhaseWait=0;const __hdPhaseYield=async(fn,receiver)=>{const at=performance.now();__hdPhaseYields++;try{return await fn.call(receiver)}finally{__hdPhaseWait+=performance.now()-at}};try{`;
   const suffix=`}finally{__hdSearchPhaseRecord({phase:'${kind}',startedAt:__hdPhaseStart,endedAt:performance.now(),elapsedMs:performance.now()-__hdPhaseStart,yields:__hdPhaseYields,yieldWaitWallMs:__hdPhaseWait,sourceCount:${engine&&kind==='query.rank'?'entries.length':'Array.isArray(records)?records.length:0'},aborted:Boolean(signal&&signal.aborted)})}`;
   edits.push({start:body.start+1,end:body.end-1,text:prefix+text+suffix});count++;return;
  }
  if(hook&&node.type==='FunctionDeclaration'&&node.id?.name==='usePreparedSearch'){
   const body=code.slice(node.body.start+1,node.body.end-1),offset=body.lastIndexOf('  return { index, results:');if(offset<0)throw Error('Prepared hook return contract changed');
   const text=`  useEffect(()=>{__hdSearchPhaseRecord({phase:'hook.commit',at:performance.now(),sourceCount:Array.isArray(records)?records.length:0,queryLength:typeof query==='string'?query.length:0,indexReady:ready,answerReady:Boolean(answerReady)})},[records,getFields,index,query,answerReady,ready]);\n`;
   edits.push({start:node.body.start+1+offset,end:node.body.start+1+offset,text});count++;return;
  }
  for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);
 }
 walk(ast);if(count!==(engine?2:1))throw Error('Diagnostic search boundary count changed');let output=code;
 for(const edit of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
 output+=recorder;parse(output,{sourceType:'module'});return{code:output,map:null};
}
