const fs = require('fs');
const { ungarble } = require('ungarble');
const content = fs.readFileSync('D:/quản lý bán hàng 1/src/App.jsx', 'utf8');
const samples = content.split(/\r?\n/).filter(line => /Báº|Káº|TĂ|Ä|chá»|nghiá»|toĂ¡n|KhĂ/.test(line)).slice(0, 12);
for (const line of samples) {
  console.log('RAW=' + line);
  console.log('FIX=' + ungarble(line));
  console.log('---');
}
