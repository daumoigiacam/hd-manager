import fs from 'node:fs/promises';import path from'node:path';
export const workspace=path.resolve(import.meta.dirname,'../..');
export async function localEnvironment(name='local'){
 if(!['local','development'].includes(name))throw Error('Local runner refuses staging and Production');
 const c=JSON.parse(await fs.readFile(path.join(workspace,'config/environments',name+'.json'),'utf8'));
 if(!c.enabled||c.name!==name||!/^demo-hdmanager-/.test(c.projectId)||c.flags.productionAccess!==false||c.flags.realCustomerData!==false||c.flags.billing!==false||c.flags.emulatorUi===true)throw Error('Unsafe local environment');
 for(const key of ['appOrigin','apiEndpoint']){const u=new URL(c[key]);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.username||u.password||u.search||u.hash)throw Error('Local endpoint must be loopback');}
 if([c.auth,c.firestore,c.postgres,c.redis].some(x=>x.host!=='127.0.0.1'||!Number.isInteger(x.port)))throw Error('Local dependency must be loopback');
 return Object.freeze(c);
}
