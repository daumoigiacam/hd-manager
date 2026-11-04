import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),project='hd-manager-c5839';
const output='test-results/full-system-transformation-20261101/deployed-rules';
await mkdir(output,{recursive:true});
const sha=value=>createHash('sha256').update(value).digest('hex');
// Reuse the configured CLI account through its SDK; never print/copy tokens,
// inspect unrelated projects or enable debug/file logging. GET operations only.
const logger=require('firebase-tools/lib/logger.js').logger;logger.silent=true;
const auth=require('firebase-tools/lib/auth.js'),{requireAuth}=require('firebase-tools/lib/requireAuth.js');
const api=require('firebase-tools/lib/gcp/rules.js');
try{
 if(require('firebase-tools/lib/api.js').rulesOrigin()!=='https://firebaserules.googleapis.com')throw Error('Unexpected rules API origin.');
 const account=auth.getProjectDefaultAccount(process.cwd());
 if(!account?.user||!account?.tokens)throw Object.assign(new Error('Configured Firebase CLI authentication is unavailable.'),{code:'CLI_AUTH_UNAVAILABLE'});
 await requireAuth({project,user:account.user,tokens:account.tokens,nonInteractive:true});
 const release=(await api.listAllReleases(project)).find(item=>item.name===`projects/${project}/releases/cloud.firestore`);
 if(!release?.rulesetName?.startsWith(`projects/${project}/rulesets/`))throw Object.assign(new Error('Default database release not found.'),{code:'DEFAULT_RELEASE_NOT_FOUND'});
 const files=await api.getRulesetContent(release.rulesetName);
 if(!Array.isArray(files)||files.length!==1||typeof files[0].content!=='string')throw Error('Unsupported deployed source shape.');
 const source=files[0].content,repository=await readFile('firestore.rules','utf8');
 await writeFile(output+'/firestore.rules',source);
 const result={at:new Date().toISOString(),status:'DEPLOYED_RULES_SOURCE_READ',project,
  release:{name:release.name,rulesetName:release.rulesetName,createTime:release.createTime,updateTime:release.updateTime},
  deployedSha256:sha(source),repositorySha256:sha(repository),exactRepositoryMatch:source===repository,
  lineEndingNormalizedMatch:source.replace(/\r\n/g,'\n')===repository.replace(/\r\n/g,'\n'),
  deployedBytes:Buffer.byteLength(source),repositoryBytes:Buffer.byteLength(repository),
  scope:'Authenticated GET of default Firestore release and ruleset source using existing configured Firebase CLI account. No deploy, rules test API, document read/write, user/permission change, token/account identity export or other project query. Source comparison alone is not a security/role CRUD acceptance test.'};
 await writeFile(output+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){
 const code=typeof error.code==='string'&&/^[A-Z_]{1,40}$/.test(error.code)?error.code:'READ_RULES_UNAVAILABLE';
 const result={at:new Date().toISOString(),status:'UNVERIFIED_DEPLOYED_RULES',project,code,
  scope:'Read-only audit did not obtain a verified deployed rules source. No fallback to credential searching, account changes, deployment or production document writes. Error payload/credentials not exported.'};
 await writeFile(output+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));process.exitCode=1;
}
