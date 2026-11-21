import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import * as esbuild from 'esbuild';
export * from 'esbuild';
const root=fileURLToPath(new URL('../',import.meta.url));
const legacy=path.join(root,'src'),canonical=path.join(root,'development/hd-manager/application/src');
const applicationRequire=createRequire(path.join(root,'development/hd-manager/application/package.json'));
// Test-only native bundler routing: ESM/fs hooks cannot redirect esbuild's
// native file reads or relative imports embedded in a synthetic JSX fixture.
const plugin={name:'test-canonical-source',setup(api){api.onResolve({filter:/.*/},args=>{
 // A clean CI installs both dependency trees. The synthetic fixture and the
 // canonical components must share the application's one React dispatcher.
 if(/^(?:react|react-dom|scheduler)(?:\/|$)/.test(args.path))return {path:applicationRequire.resolve(args.path)};
 if(!path.isAbsolute(args.path)&&!args.path.startsWith('.'))return;
 const absolute=path.resolve(args.resolveDir||root,args.path),relative=path.relative(legacy,absolute);
 if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))return;
 const target=path.join(canonical,relative);if(fs.existsSync(target)&&fs.statSync(target).isFile())return {path:target};
});}};
const fixtureOptions=options=>({...options,define:{'import.meta.env':'{}',...options.define},plugins:[plugin,...(options.plugins||[])]});
export const build=options=>esbuild.build(fixtureOptions(options));
export const context=options=>esbuild.context(fixtureOptions(options));
