const fs = require('fs');
const iconv = require('iconv-lite');
const { ungarble } = require('ungarble');
const cleanText = fs.readFileSync('D:/quản lý bán hàng 1/code.txt', 'utf8');
const source = fs.readFileSync('D:/quản lý bán hàng 1/src/App.jsx', 'utf8');
const chars = [...new Set(cleanText.split('').filter(ch => ch.charCodeAt(0) > 127))];
function corrupt(str, enc){ const buf = Buffer.from(str, 'utf8'); return enc === 'latin1' ? buf.toString('latin1') : iconv.decode(buf, enc); }
const encs = ['latin1','win1250','win1252'];
const autoMap = new Map();
for (const ch of chars) {
  let layer = [ch]; const seen = new Set([ch]);
  for (let depth=0; depth<3; depth++) {
    const next=[];
    for (const cur of layer) for (const enc of encs) {
      let bad; try { bad = corrupt(cur, enc); } catch { continue; }
      if (!bad || bad===ch || bad.includes('\uFFFD') || seen.has(bad)) continue;
      seen.add(bad); next.push(bad); autoMap.set(bad, ch);
    }
    layer = next;
  }
}
const manualMap = new Map(Object.entries({
  'Ă¡':'á','Ă ':'à','Ă¢':'â','Ă£':'ã','Ă¨':'è','Ă©':'é','Ăª':'ê','Ă­':'í','Ă¬':'ì','Ă²':'ò','Ă³':'ó','Ă´':'ô','Ăµ':'õ','Ă¹':'ù','Ăº':'ú','Ă½':'ý',
  'Ă':'Á','Ă€':'À','Ă‚':'Â','Ăƒ':'Ã','Ăˆ':'È','Ă‰':'É','ĂŠ':'Ê','Ă':'Í','ĂŒ':'Ì','Ă’':'Ò','Ă“':'Ó','Ă”':'Ô','Ă•':'Õ','Ă™':'Ù','Ăš':'Ú','Ă':'Ý',
  'Ä':'Đ','Ä‘':'đ','Æ¡':'ơ','Æ°':'ư','Æ¯':'Ư','Æ ':'Ơ',
  'VĂ ':'Và','vĂ ':'và'
}));
const keys = [...new Set([...autoMap.keys(), ...manualMap.keys()])].sort((a,b)=>b.length-a.length);
function repair(input) {
  let out = input;
  for (let i=0; i<4; i++) {
    const before = out;
    out = ungarble(out);
    for (const key of keys) out = out.split(key).join(manualMap.get(key) || autoMap.get(key));
    if (out === before) break;
  }
  return out;
}
const repaired = repair(source).split(/\r?\n/);
for (let i=0; i<90; i++) console.log((i+1)+':'+repaired[i]);
