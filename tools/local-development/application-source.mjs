import fs from 'node:fs/promises';import path from 'node:path';import {workspace} from './environment.mjs';
// Local builders must never silently fall back to a historical test snapshot
// or overwrite the separate Production working tree.
export async function developmentSourceRoot(){
 const config=JSON.parse(await fs.readFile(path.join(workspace,'config/application-source.json'),'utf8'));
 const root=await fs.realpath(path.resolve(workspace,config.developmentRoot)),allowed=path.join(workspace,'development')+path.sep;
 if(!root.startsWith(allowed))throw Error('Development source must stay under the canonical development directory');
 await fs.access(path.join(root,'src/main.jsx'));return root;
}
