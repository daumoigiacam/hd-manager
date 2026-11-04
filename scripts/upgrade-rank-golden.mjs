import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {extractDispatchRanking} from '../tests/helpers/dispatch-ranking-extractor.mjs';
import {createSearchRecordIndex} from '../src/services/searchEngine.js';
const source=await fs.readFile('test-results/performance-upgrade-20261103/checkpoints/search/src/App.jsx','utf8');
const rank=extractDispatchRanking(source),records=[
 {id:'a',name:'Chị Trang Vịt Sống Chơn Thành',alias:'Vịt Sống',phone:'0909123456'},
 {id:'b',name:'Vịt Không Móc',alias:'VKM',address:'Thủ Đức'},
 {id:'c',name:'Vịt Không Móc To',alias:'VKM To'},
 {id:'d',name:'Thu Gò Vấp',phone:'0912345678'},
 ...Array.from({length:100},(_,i)=>({id:'p'+i,name:'Gà Công Nghiệp '+i,alias:'GCN '+i})),
];records.push(records[1]);
const labels=row=>[row.name,row.alias,row.phone,row.address];
const index=createSearchRecordIndex(records,row=>[{key:'primary',priority:100,values:labels(row)}]);
const queries=['','vịt không móc','vit khng moc','VKM','chi trang','0909123','0912','thu duc','gò vấp','ga cong nghip 9','nghiep 99','does not match at all','999999999999','to','v'];
const golden={sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),scope:'Golden IDs/order from pre-change application ranking, synthetic only',records,cases:queries.map(query=>({query,ids:rank(records,query,labels,index).map(row=>row.id)}))};
await fs.mkdir('tests/fixtures',{recursive:true});await fs.writeFile('tests/fixtures/dispatch-ranking-before-upgrade.json',JSON.stringify(golden,null,2));
console.log(JSON.stringify({cases:golden.cases.length,records:records.length}));
