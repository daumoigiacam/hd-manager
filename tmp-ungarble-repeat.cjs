const { ungarble } = require('ungarble');
const samples = [
  'Káº¿ toĂ¡n & nhĂ¢n sá»±',
  'Ca hĂ nh chĂ­nh',
  'Chá»§ doanh nghiá»‡p',
  'Äiá»u hĂ nh linh hoáº¡t',
  'Báº¢O Vá»† CRASH: Kiá»ƒm tra vĂ  Khá»Ÿi táº¡o Firebase an toĂ n'
];
for (const s of samples) {
  let cur = s;
  for (let i = 0; i < 5; i++) {
    const next = ungarble(cur);
    console.log(i, next);
    if (next === cur) break;
    cur = next;
  }
  console.log('===');
}
