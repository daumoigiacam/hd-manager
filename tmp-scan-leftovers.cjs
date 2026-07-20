const fs = require('fs');
const iconv = require('iconv-lite');
const { ungarble } = require('ungarble');
const cleanText = fs.readFileSync('D:/quản lý bán hàng 1/code.txt', 'utf8');
const source = fs.readFileSync('D:/quản lý bán hàng 1/src/App.jsx', 'utf8');
const chars = [...new Set(cleanText.split('').filter(ch => ch.charCodeAt(0) > 127))];
function corrupt(str, enc){ const buf = Buffer.from(str, 'utf8'); return enc === 'latin1' ? buf.toString('latin1') : iconv.decode(buf, enc); }
const encs = ['latin1','win1250','win1252'];
const map = new Map();
for (const ch of chars) {
  let layer = [ch];
  const seen = new Set([ch]);
  for (let depth=0; depth<3; depth++) {
    const next=[];
    for (const cur of layer) for (const enc of encs) {
      let bad; try { bad = corrupt(cur, enc); } catch { continue; }
      if (!bad || bad===ch || bad.includes('\uFFFD') || seen.has(bad)) continue;
      seen.add(bad); next.push(bad); map.set(bad, ch);
    }
    layer = next;
  }
}
const badKeys = [...map.keys()].sort((a,b)=>b.length-a.length);
function repair(input) {
  let out = input;
  for (let i=0; i<3; i++) {
    const before = out;
    out = ungarble(out);
    for (const bad of badKeys) out = out.split(bad).join(map.get(bad));
    if (out === before) break;
  }
  return out;
}
const repaired = repair(source);
const tokens = new Map();
const regex = /[A-Za-zÀ-ỹ]*[ĂÄÁÃÂÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßáăâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ»º¼½¾‘’“”�][^\s'"`),;:{}\[\]]*/g;
for (const m of repaired.matchAll(regex)) {
  const tok = m[0];
  if (tok.length < 2) continue;
  tokens.set(tok, (tokens.get(tok) || 0) + 1);
}
const top = [...tokens.entries()].sort((a,b)=>b[1]-a[1]).slice(0,120);
for (const [tok,count] of top) console.log(count + '\t' + tok);
