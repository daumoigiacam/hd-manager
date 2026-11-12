// Explicit shared runtime roots only. A catch-all node_modules -> vendor rule
// pulls lazy-only PDF/OCR/spreadsheet dependencies into the eagerly imported
// React chunk, executing their initialization before login/Home.
export function selectVendorChunk(rawId){
 const id=rawId.replaceAll('\\','/');
 if(!id.includes('/node_modules/'))return undefined;
 if(id.includes('firebase'))return 'vendor-firebase';
 if(/\/node_modules\/lucide-react\//.test(id))return 'vendor-icons';
 if(/\/node_modules\/qrcode\//.test(id))return 'vendor-qrcode';
 if(/\/node_modules\/(html-to-image|jspdf)\//.test(id))return 'vendor-export';
 if(/\/node_modules\/(tesseract\.js(?:-core)?|@zxing\/[^/]+|read-excel-file)\//.test(id))return 'vendor-tools';
 if(/\/node_modules\/(react|react-dom|scheduler)\//.test(id))return 'vendor-react';
 // Rollup assigns everything else according to the actual static/dynamic
 // import graph. In particular, do not explicitly place html2canvas/canvg/
 // their dependencies in an eager generic vendor chunk.
 return undefined;
}
