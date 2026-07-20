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
  let layer = [ch];
  const seen = new Set([ch]);
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
  'Ă¢':'â','Ăª':'ê','Ă´':'ô','Ăƒ':'Ã',
  'Ä':'Đ','Ä‘':'đ','Æ¡':'ơ','Æ°':'ư','Æ¯':'Ư','Æ ':'Ơ',
  'NÁ»N TÁº£NG QUÁº£N LĂ½ SÁ»‘':'NỀN TẢNG QUẢN LÝ SỐ',
  'ÄÄƒng nháº­p':'Đăng nhập','Táº¡o CĂ´ng ty':'Tạo Công ty','ÄÄƒng Nháº­p':'Đăng Nhập','DĂ nh cho chá»§ doanh nghiá»‡p vĂ  cĂ¡c tĂ i khoáº£n bá»™ pháº­n':'Dành cho chủ doanh nghiệp và các tài khoản bộ phận',
  'VĂ o á»¨ng Dá»¥ng':'Vào Ứng Dụng','TĂ i khoáº£n demo cĂ³ sáºµn':'Tài khoản demo có sẵn','Báº±ng viá»‡c Ä‘Äƒng nháº­p, báº¡n Ä‘á»“ng Ă½ vá»›i ChĂ­nh sĂ¡ch Báº£o máº­t. Dá»¯ liá»‡u Ä‘Æ°á»£c mĂ£ hĂ³a trĂªn Cloud.':'Bằng việc đăng nhập, bạn đồng ý với Chính sách Bảo mật. Dữ liệu được mã hóa trên Cloud.'
}));
const keys = [...new Set([...autoMap.keys(), ...manualMap.keys()])].sort((a,b)=>b.length-a.length);
function repair(input) {
  let out = input;
  for (let i=0; i<4; i++) {
    const before = out;
    out = ungarble(out);
    for (const key of keys) {
      const val = manualMap.get(key) || autoMap.get(key);
      out = out.split(key).join(val);
    }
    if (out === before) break;
  }
  return out;
}
const repaired = repair(source);
const samples = [
  'Káº¿ toĂ¡n & nhĂ¢n sá»±',
  'Ca hĂ nh chĂ­nh',
  'Äiá»u hĂ nh linh hoáº¡t',
  'Báº¢O Vá»† CRASH: Kiá»ƒm tra vĂ  Khá»Ÿi táº¡o Firebase an toĂ n',
  'NÁ»N TÁº£NG QUÁº£N LĂ½ SÁ»‘',
  'Tá»•ng chi lĂ  toĂ n bá»™ khoáº£n chi káº¿ toĂ¡n nháº­p tay trong ngĂ y.',
  'KhĂ¡ch hĂ ng',
  'cĂ³',
  'ĐĂ£',
  'ThĂªm',
  'BĂ¡o cĂ¡o'
];
for (const sample of samples) { console.log('RAW=' + sample); console.log('FIX=' + repair(sample)); console.log('---'); }
console.log('LEFTOVER COUNT', (repaired.match(/[ĂÄÆÁÃÂá]/g) || []).length);
