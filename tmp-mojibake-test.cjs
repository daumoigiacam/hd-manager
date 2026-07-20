const fs = require('fs');
const content = fs.readFileSync('D:/quản lý bán hàng 1/src/App.jsx', 'utf8');
const lines = content.split(/\r?\n/);
const sample = lines.find(line => line.includes('Báº') || line.includes('Káº') || line.includes('TĂ'));
console.log('SAMPLE_RAW=' + sample);
const bytes = Uint8Array.from([...sample].map(ch => ch.charCodeAt(0) & 0xff));
console.log('LATIN1_TO_UTF8=' + Buffer.from(sample, 'latin1').toString('utf8'));
console.log('WIN1252=' + new TextDecoder('windows-1252').decode(bytes));
