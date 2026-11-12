const required=[
 ['notifications',['companyId','customerId','recipientType']],
 ['messages',['companyId','customerId','conversationType']],
 ['messages',['companyId','conversationType','assignedEmployeeId','assignmentState']],
 ['messages',['companyId','conversationType']],
 ['messages',['companyId']],
].map(([collectionGroup,fields])=>({collectionGroup,queryScope:'COLLECTION',fields:[...fields.map(fieldPath=>({fieldPath,order:'ASCENDING'})),{fieldPath:'createdAt',order:'DESCENDING'}]}));
const signature=index=>JSON.stringify([index.collectionGroup||index.name?.match(/collectionGroups\/([^/]+)\/indexes\//)?.[1],index.queryScope,index.fields.filter(f=>f.fieldPath!=='__name__')]);
export function planInboxIndexes(config,deployed){
 if(!Array.isArray(config?.indexes)||!Array.isArray(deployed))throw new TypeError('Index metadata arrays required.');
 const specs=required.map(wanted=>{
  const matches=config.indexes.filter(index=>signature(index)===signature(wanted));
  if(matches.length!==1)throw Error('Expected one exact tracked inbox index: '+wanted.collectionGroup);
  return wanted;
 });
 const states=specs.map(spec=>({spec,existing:deployed.find(index=>signature(index)===signature(spec))||null}));
 return {create:states.filter(s=>!s.existing).map(s=>s.spec),states:states.map(s=>({spec:s.spec,state:s.existing?.state||'MISSING'})),ready:states.every(s=>s.existing?.state==='READY')};
}
