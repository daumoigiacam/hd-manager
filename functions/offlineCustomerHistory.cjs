const {Timestamp}=require('firebase-admin/firestore');
const validDay=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const micros=t=>t.seconds*1000000+Math.floor(t.nanoseconds/1000);
const validId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(s);
async function readOfflineCustomerHistory({db,appId,actor,body,now=Date.now}){
 const {storedLocalBusinessDayKey}=await import('../src/utils/businessDate.js');
 const {customerId,source,from,to}=body,limit=body.limit??20;
 if(!validId(customerId)||!['orders','payments','expenses'].includes(source)||!validDay(from)||!validDay(to)||from>=to||!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid history request');
 let cursor=null;
 if(body.sourceCursor!=null){
  if(typeof body.sourceCursor!=='string'||body.sourceCursor.length>2048)throw Error('Invalid history cursor');
  cursor=JSON.parse(Buffer.from(body.sourceCursor,'base64url').toString());
  if(cursor.customerId!==customerId||cursor.source!==source||cursor.from!==from||cursor.to!==to||cursor.tenantId!==actor.tenantId||!validId(cursor.id)||!storedLocalBusinessDayKey(cursor.date)||!Number.isSafeInteger(cursor.seconds)||!Number.isInteger(cursor.nanos)||cursor.nanos<0||cursor.nanos>=1e9||Math.abs(now()-cursor.seconds*1000)>3600000)throw Error('History cursor scope/expiry rejected');
 }
 let query=db.collection(`artifacts/${appId}/public/data/${source}`).where('companyId','==',actor.tenantId).where('customerId','==',customerId).where('date','>=',from).where('date','<',to).orderBy('date').orderBy('__name__').limit(limit);
 if(cursor)query=query.startAfter(cursor.date,db.doc(`artifacts/${appId}/public/data/${source}/${cursor.id}`));
 const snapshot=await db.runTransaction(tx=>tx.get(query),cursor?{readOnly:true,readTime:new Timestamp(cursor.seconds,cursor.nanos)}:{readOnly:true});
 const readTime=snapshot.readTime;
 if(!readTime)throw Error('History snapshot has no server read time');
 const revision=micros(readTime),last=snapshot.docs[snapshot.docs.length-1],complete=snapshot.docs.length<limit;
 const nextSourceCursor=complete?null:Buffer.from(JSON.stringify({customerId,source,from,to,tenantId:actor.tenantId,id:last.id,date:last.data().date,seconds:readTime.seconds,nanos:readTime.nanoseconds})).toString('base64url');
 return {customerId,source,from,to,snapshotRevision:revision,sourceCursor:body.sourceCursor??null,nextSourceCursor,complete,records:snapshot.docs.map(doc=>({document:{...doc.data(),id:doc.id},serverRevision:micros(doc.updateTime),serverCursor:doc.updateTime.seconds+'.'+doc.updateTime.nanoseconds}))};
}
module.exports={readOfflineCustomerHistory};
