import { readFile, writeFile } from 'node:fs/promises';
const [before,after] = process.argv.slice(2);
const read = async (dir,file) => JSON.parse(await readFile(`${dir}/${file}`,'utf8'));
const old = await read(before,'samples.json');
const next = await read(after,'samples.json');
const median = values => values.sort((a,b) => a-b)[Math.floor(values.length/2)] ?? null;
const key = row => `${row.viewport}/${row.module}/${row.action}`;
const aggregate = rows => {
  const metric = (kind,field='ms',owner) => median(rows.map(row => (row.storage || [])
    .filter(e => e.kind === kind && (!owner || e.owner === owner)).reduce((n,e) => n+(field === 'count' ? 1 : e[field] || 0),0)));
  return { n:rows.length,eventToDomP50:median(rows.map(row => row.totalMs)),
    stringifyP50:metric('stringify'),parseP50:metric('parse'),getP50:metric('getItem'),writeP50:metric('setItem'),
    previewWriteCountP50:metric('setItem','count','preview-db'),previewWriteCharsP50:metric('setItem','chars','preview-db'),
    note:'Instrumented JSON includes app, clone and test DOM persistence-check reads. Write chars are UTF-16 code units, NOT UTF-8 bytes; not server latency.' };
};
const keys = [...new Set(next.map(key))];
const rows = keys.map(k => ({key:k,before:aggregate(old.filter(r => key(r)===k)),after:aggregate(next.filter(r => key(r)===k))}));
const oldSummary = await read(before,'summary.json');
const newSummary = await read(after,'summary.json');
const result = { before,after,fixtureCountsEqual:JSON.stringify(oldSummary.fixtureCounts)===JSON.stringify(newSummary.fixtureCounts),
  beforeFailures:oldSummary.failures,afterFailures:newSummary.failures,beforeErrors:oldSummary.errors,afterErrors:newSummary.errors,rows };
await writeFile(`${after}/storage-comparison.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
