const samples = [
  'Káº¿ toĂ¡n & nhĂ¢n sá»±',
  'Ca hĂ nh chĂ­nh',
  'Äiá»u hĂ nh linh hoáº¡t',
  'Báº¢O Vá»† CRASH: Kiá»ƒm tra vĂ  Khá»Ÿi táº¡o Firebase an toĂ n'
];
const fixLatin = require('fix-latin1-to-utf8');
let ungarble = null;
try { ungarble = require('ungarble').ungarble; } catch {}
for (const s of samples) {
  console.log('RAW', s);
  console.log('fixLatin', fixLatin(s));
  if (ungarble) {
    console.log('ungarble', ungarble(s));
    console.log('ungarble+fixLatin', fixLatin(ungarble(s)));
    console.log('fixLatin+ungarble', ungarble(fixLatin(s)));
  }
  console.log('---');
}
