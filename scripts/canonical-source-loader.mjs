import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

// Older regression tests live at repository root. The released application is
// configured in development/hd-manager/application; exercise that same source
// without changing the frozen historical fixtures or the server under test.
const root = new URL('../', import.meta.url);
const legacy = new URL('src/', root).href;
const canonical = new URL('development/hd-manager/application/src/', root).href;
const tests = new URL('tests/', root).href;
const sourceHelper = new URL('scripts/helpers/application-source.cjs', root).href;

export async function resolve(specifier, context, next) {
  if(specifier==='esbuild'&&context.parentURL?.startsWith(tests))return next(new URL('scripts/canonical-esbuild.mjs',root).href,context);
  let candidate;
  try { candidate = new URL(specifier, context.parentURL).href; } catch { /* Bare package import. */ }
  if (candidate?.startsWith(legacy)) {
    const target = canonical + candidate.slice(legacy.length);
    if (fs.existsSync(new URL(target))) return next(target, context);
  }
  const resolved = await next(specifier, context);
  if (resolved.url.startsWith(legacy)) {
    const target = canonical + resolved.url.slice(legacy.length);
    if (fs.existsSync(new URL(target))) return {...resolved, url: target};
  }
  return resolved;
}

export async function load(url, context, next) {
  const result = await next(url, context);
  if (!['module', 'commonjs'].includes(result.format)) return result;
  let source = result.source?.toString();
  if (url === sourceHelper && !source) source = fs.readFileSync(new URL(url), 'utf8');
  if (!source) return result;
  if (url === sourceHelper) source = source.replace("path.resolve(__dirname, '../..')",
    JSON.stringify(fileURLToPath(new URL('development/hd-manager/application/', root))));
  if (url.startsWith(tests)) {
    source = source.replace(/new URL\((['"])(\.\.\/src\/[^'"]+)\1,\s*import\.meta\.url\)/g,
      (_all, _quote, relative) => 'new URL(' + JSON.stringify(canonical + relative.slice(7)) + ')');
    source = source.replace(/entryPoints:\s*\[(['"])(?:\.\/)?src\/([^'"]+)\1\]/g,
      (_all, _quote, relative) => 'entryPoints: [' + JSON.stringify('development/hd-manager/application/src/' + relative) + ']');
  }
  return {...result, source};
}
