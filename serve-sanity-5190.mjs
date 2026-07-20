import { createReadStream, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = normalize(join(__filename, '..'));
const distDir = join(__dirname, 'sanity-web');
const host = '127.0.0.1';
const port = 5190;

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

const server = createServer((req, res) => {
  const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const assetPath = normalize(join(distDir, relativePath));
  const safeAssetPath = assetPath.startsWith(distDir) ? assetPath : join(distDir, 'index.html');
  const finalPath = existsSync(safeAssetPath) ? safeAssetPath : join(distDir, 'index.html');
  const extension = extname(finalPath).toLowerCase();
  const contentType = mimeTypes[extension] || 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
  });
  createReadStream(finalPath).pipe(res);
});

server.listen(port, host, () => {
  console.log(`Sanity server running at http://${host}:${port}`);
});
