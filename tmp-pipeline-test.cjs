const { ungarble } = require('ungarble');
const iconv = require('iconv-lite');
const samples = [
  'Káº¿ toĂ¡n & nhĂ¢n sá»±',
  'Ca hĂ nh chĂ­nh',
  'Äiá»u hĂ nh linh hoáº¡t',
  'Báº¢O Vá»† CRASH: Kiá»ƒm tra vĂ  Khá»Ÿi táº¡o Firebase an toĂ n',
  'NÁ»N TÁº£NG QUÁº£N LĂ½ SÁ»‘'
];
function win1250ToUtf8(str){ try { return iconv.encode(str, 'win1250').toString('utf8'); } catch { return str; } }
function iterative(str){
  let cur = str;
  for (let i=0; i<6; i++) {
    const next = win1250ToUtf8(ungarble(cur));
    if (next === cur) return next;
    cur = next;
  }
  return cur;
}
for (const s of samples) {
  console.log('RAW', s);
  console.log('ITER', iterative(s));
  console.log('---');
}
