const iconv = require('iconv-lite');
const chars = ['á','à','â','ă','đ','í','ô','ư','ề'];
function corrupt(char, enc){
  const buf = Buffer.from(char, 'utf8');
  if (enc === 'latin1') return buf.toString('latin1');
  return iconv.decode(buf, enc);
}
for (const ch of chars) {
  console.log('CHAR', ch);
  for (const enc of ['latin1','win1250','win1252']) {
    const v1 = corrupt(ch, enc);
    console.log(enc, JSON.stringify(v1), [...v1].map(c=>c.codePointAt(0).toString(16)));
  }
  console.log('---');
}
