const iconv = require('iconv-lite');
function corrupt(str, enc){
  const buf = Buffer.from(str, 'utf8');
  if (enc === 'latin1') return buf.toString('latin1');
  return iconv.decode(buf, enc);
}
const char = 'á';
const seen = new Set();
for (const e1 of ['latin1','win1250','win1252']) {
  const v1 = corrupt(char,e1); seen.add(v1);
  for (const e2 of ['latin1','win1250','win1252']) {
    const v2 = corrupt(v1,e2); seen.add(v2);
    for (const e3 of ['latin1','win1250','win1252']) {
      seen.add(corrupt(v2,e3));
    }
  }
}
console.log([...seen].sort().map(s => JSON.stringify(s)).join('\n'));
