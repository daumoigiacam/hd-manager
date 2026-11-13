// Read names only through GitHub's Secrets API. Secret values cannot be read.
// Credential Manager output stays in memory and is never included in errors.
import fs from 'node:fs/promises';import {execFileSync} from 'node:child_process';
const wanted=['HD_RELEASE_KEYSTORE_BASE64','HD_RELEASE_STORE_PASSWORD','HD_RELEASE_KEY_PASSWORD'];
const report={at:new Date().toISOString(),status:'NOT_VERIFIED',valuesRead:false,workflowExecuted:false,secretNames:wanted};
try{
 const remote=execFileSync('git',['remote','get-url','origin'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const match=/^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(remote);if(!match)throw Error('EXPECTED_GITHUB_REMOTE_REQUIRED');report.repository=match[1];
 let credential;try{credential=execFileSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:20000,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'},windowsHide:true});}catch{throw Error('AUTHORIZED_GIT_CREDENTIAL_UNAVAILABLE');}
 const token=credential.split(/\r?\n/).find(x=>x.startsWith('password='))?.slice(9);credential='';if(!token)throw Error('AUTHORIZED_GIT_CREDENTIAL_UNAVAILABLE');
 const present=new Set();for(let page=1;page<=10;page++){
  const response=await fetch(`https://api.github.com/repos/${match[1]}/actions/secrets?per_page=100&page=${page}`,{headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(20000)});
  report.httpStatus=response.status;if(!response.ok){report.status='BLOCKED_SECRET_METADATA_ACCESS';report.accessRequirement='Repository Actions secret metadata read permission for the existing GitHub identity';break;}
  const body=await response.json();if(!Array.isArray(body.secrets))throw Error('UNEXPECTED_SECRET_METADATA_RESPONSE');for(const item of body.secrets)if(wanted.includes(item.name))present.add(item.name);
  if(body.secrets.length<100){report.presence=Object.fromEntries(wanted.map(k=>[k,present.has(k)]));report.status=wanted.every(k=>present.has(k))?'SECRET_NAMES_PRESENT_SIGNING_NOT_YET_PROVEN':'BLOCKED_REQUIRED_REPOSITORY_SECRET_MISSING';break;}
  if(page===10)throw Error('SECRET_METADATA_PAGINATION_INCOMPLETE');
 }
}catch(e){report.status='BLOCKED';report.code=/^[A-Z_]+$/.test(e.message)?e.message:'SECRET_METADATA_CHECK_FAILED';}
if(process.env.HD_SECRET_PRESENCE_REPORT)await fs.writeFile(process.env.HD_SECRET_PRESENCE_REPORT,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
