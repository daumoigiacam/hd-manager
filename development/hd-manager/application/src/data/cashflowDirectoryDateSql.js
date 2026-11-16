import {strictBusinessDaySql} from './businessDirectoryDateSql.js';
export const cashDates = ['cashflowDate','paymentDate','paidDate','transactionDate','transactionDateTime','bankTransactionDate',
  'paidAt','transactionAt','transactedAt','transactionTime','bankTransactionTime','paymentTime','completedTime','completedAt',
  'date','approvedAt','createdAt','updatedAt','timestamp'];
export const paymentDates = [
  'paymentDate','transactionDate','transactionDateTime','bankTransactionDate',
  ...['transactionDateTime','transactionDate','paymentTime','completedTime','paidAt'].map(f => 'webData.' + f),
  ...['transactionDateTime','transactionDate','paymentTime','completedTime','paidAt','createdAt'].map(f => 'webLatest.' + f),
  ...['transactionDateTime','transactionDate','paymentTime','completedTime','paidAt','createdAt'].map(f => 'webLinked.' + f),
  ...['transactionDateTime','transactionDate','paymentTime','completedTime','paidAt','createdAt'].map(f => 'webLink.' + f),
  ...['transactionDateTime','transactionDate','paymentTime','completedTime','paidAt'].map(f => 'webhook.' + f),
  'paidAt','transactionAt','transactedAt','paymentTime','completedTime','completedAt','webData.createdAt','webhook.createdAt',
  'date','createdAt','updatedAt','timestamp',
];
// The original directory expression is shared verbatim by live reads and its
// derived date index. This does not calculate money, approval or ledger totals.
export function cashflowBusinessDaySql(body='r.body') {
 const j=field=>`json_extract(${body},'$.${field}')`;
 const first=fields=>`COALESCE(${fields.map(f=>`NULLIF(${j(f)},'')`).join(',')},'')`;
 const webhook=`COALESCE(${j('rawWebhook')},${j('rawPayload')},'{}')`;
 const data=`COALESCE(json_extract(${webhook},'$.data'),'{}')`;
 const link=`COALESCE(json_extract(${webhook},'$.paymentLink'),json_extract(${data},'$.paymentLink'),'{}')`;
 const latest=`COALESCE(json_extract(${webhook},'$.latestTransaction'),json_extract(${data},'$.latestTransaction'),'{}')`;
 const linked=`(SELECT value FROM json_each(${link},'$.transactions') ORDER BY
    COALESCE(json_extract(value,'$.transactionDateTime'),json_extract(value,'$.transactionDate'),json_extract(value,'$.createdAt'),'') COLLATE BINARY DESC,key ASC LIMIT 1)`;
 const objects={webhook,webData:data,webLink:link,webLatest:latest,webLinked:linked};
 const candidates=paymentDates.map(path=>{const[prefix,field]=path.split('.');return field?`json_extract(${objects[prefix]},'$.${field}')`:j(path);});
 const date=strictBusinessDaySql([first(cashDates)]);
 const provider=`lower(${first(['paymentProvider','sourceType','method','paymentMethod','sourceLabel'])})`;
 return `CASE WHEN instr(${provider},'sepay')>0 OR instr(${provider},'payos')>0
      THEN COALESCE(${strictBusinessDaySql(candidates)},${date}) ELSE ${date} END`;
}
