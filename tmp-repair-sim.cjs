const fs = require('fs');
const iconv = require('iconv-lite');
const { ungarble } = require('ungarble');
const cleanText = fs.readFileSync('D:/quản lý bán hàng 1/code.txt', 'utf8');
const chars = [...new Set(cleanText.split('').filter(ch => ch.charCodeAt(0) > 127))];
function corrupt(str, enc){
  const buf = Buffer.from(str, 'utf8');
  if (enc === 'latin1') return buf.toString('latin1');
  return iconv.decode(buf, enc);
}
const encs = ['latin1','win1250','win1252'];
const map = new Map();
for (const ch of chars) {
  const queue = [ch];
  const seen = new Set([ch]);
  for (let depth = 0; depth < 3; depth++) {
    const nextQueue = [];
    for (const cur of queue) {
      for (const enc of encs) {
        let bad;
        try { bad = corrupt(cur, enc); } catch { continue; }
        if (!bad || bad === ch || bad.includes('\uFFFD')) continue;
        if (!seen.has(bad)) {
          seen.add(bad);
          nextQueue.push(bad);
          if (!map.has(bad) || map.get(bad).length < ch.length) map.set(bad, ch);
        }
      }
    }
    queue.splice(0, queue.length, ...nextQueue);
  }
}
const badKeys = [...map.keys()].sort((a,b) => b.length - a.length);
function repair(input) {
  let out = input;
  for (let i = 0; i < 3; i++) {
    const before = out;
    out = ungarble(out);
    for (const bad of badKeys) out = out.split(bad).join(map.get(bad));
    if (out === before) break;
  }
  return out;
}
const samples = [
  'Káº¿ toĂ¡n & nhĂ¢n sá»±',
  'Ca hĂ nh chĂ­nh',
  'Äiá»u hĂ nh linh hoáº¡t',
  'Báº¢O Vá»† CRASH: Kiá»ƒm tra vĂ  Khá»Ÿi táº¡o Firebase an toĂ n',
  'NÁ»N TÁº£NG QUÁº£N LĂ½ SÁ»‘',
  'ÄÆ¡n hĂ ng',
  'KhĂ¡ch hĂ ng',
  'Tá»•ng chi lĂ  toĂ n bá»™ khoáº£n chi káº¿ toĂ¡n nháº­p tay trong ngĂ y.'
];
for (const sample of samples) {
  console.log('RAW=' + sample);
  console.log('FIX=' + repair(sample));
  console.log('---');
}
