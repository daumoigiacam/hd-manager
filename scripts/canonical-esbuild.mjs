import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as esbuild from 'esbuild';
export * from 'esbuild';
const root=fileURLToPath(new URL('../',import.meta.url));
const legacy=path.join(root,'src'),canonical=path.join(root,'development/hd-manager/application/src');
// Test-only native bundler routing: ESM/fs hooks cannot redirect esbuild's
// native file reads or relative imports embedded in a synthetic JSX fixture.
const plugin={name:'test-canonical-source',setup(api){api.onResolve({filter:/.*/},args=>{
 if(!path.isAbsolute(args.path)&&!args.path.startsWith('.'))return;
 const absolute=path.resolve(args.resolveDir||root,args.path),relative=path.relative(legacy,absolute);
 if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))return;
 const target=path.join(canonical,relative);if(fs.existsSync(target)&&fs.statSync(target).isFile())return {path:target};
});}};
export const build=options=>esbuild.build({...options,plugins:[plugin,...(options.plugins||[])]});
export const context=options=>esbuild.context({...options,plugins:[plugin,...(options.plugins||[])]});
