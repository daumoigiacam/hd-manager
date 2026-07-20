const fs = require('fs');
const iconv = require('iconv-lite');
const chars = [...new Set(fs.readFileSync('D:/quản lý bán hàng 1/code.txt','utf8').split('').filter(ch => ch.charCodeAt(0) > 127))];
function corrupt(char, enc){
  const buf = Buffer.from(char, 'utf8');
  if (enc === 'latin1') return buf.toString('latin1');
  return iconv.decode(buf, enc);
}
const targetSamples = ['Káº¿ toĂ¡n & nhĂ¢n sá»±','Ca hĂ nh chĂ­nh','Äiá»u hĂ nh linh hoáº¡t','NÁ»N TÁº£NG QUÁº£N LĂ½ SÁ»‘'];
for (const sample of targetSamples) {
  console.log('SAMPLE', sample);
  let hits = [];
  for (const ch of chars) {
    const vars = new Set();
    ['latin1','win1250','win1252'].forEach(enc1 => {
      const v1 = corrupt(ch, enc1); vars.add(v1);
      ['latin1','win1250','win1252'].forEach(enc2 => vars.add(corrupt(v1, enc2)));
    });
    for (const bad of vars) {
      if (bad && bad !== ch && sample.includes(bad)) hits.push([bad, ch]);
    }
  }
  hits = hits.sort((a,b) => b[0].length - a[0].length || a[0].localeCompare(b[0]));
  console.log(hits.slice(0,30));
  console.log('---');
}
