const iconv = require('iconv-lite');
const samples = ['toĂ¡n', 'vĂ ', 'Äiá»u hĂ nh', 'Káº¿ toĂ¡n'];
const encs = ['win1250','win1252','latin1','utf8'];
for (const s of samples) {
  console.log('RAW', s);
  for (const enc of encs) {
    try {
      const buf = iconv.encode(s, enc);
      const out = buf.toString('utf8');
      console.log(enc, '=>', out);
    } catch (e) {
      console.log(enc, 'ERR', e.message);
    }
  }
  console.log('---');
}
