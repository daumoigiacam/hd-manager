import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { parse } from '@babel/parser';

const project = 'hd-manager-c5839';
const output = 'test-results/runtime-backend-audit-20261012/cloud-functions.json';
const raw = execFileSync(process.execPath, ['node_modules/firebase-tools/lib/bin/firebase.js', 'functions:list', '--project', project, '--json'], {
  encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024, windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const result = JSON.parse(raw);
if (result.status !== 'success' || !Array.isArray(result.result)) throw new Error('Unexpected Firebase metadata response');
// Keep endpoint identity only; never persist environment variables or credentials.
const deployed = result.result.map(({id, region, runtime, platform, entryPoint, uri}) => ({id, region, runtime, platform, entryPoint, uri}));
const source = await fs.readFile('functions/index.js', 'utf8');
const ast = parse(source, {sourceType: 'script'});
const declared = ast.program.body.flatMap(node => {
  const expression = node.expression;
  return expression?.type === 'AssignmentExpression' && expression.left?.object?.name === 'exports'
    ? [{id: expression.left.property.name, line: node.loc.start.line}] : [];
});
const deployedIds = new Set(deployed.map(fn => fn.id));
const missing = declared.filter(fn => !deployedIds.has(fn.id));
const probes = [];
for (const id of ['identityLogin', 'identityAttendance', 'identityPasskey', 'attendanceAutoWifiCheckIn', 'geminiGenerateContent', 'customerPortalBootstrap', 'customerRedeemPoints']) {
  const url = `https://us-central1-${project}.cloudfunctions.net/${id}`;
  try {
    const response = await fetch(url, {method: 'OPTIONS', headers: {Origin: 'https://app.hdconnect.net', 'Access-Control-Request-Method': 'POST'}, signal: AbortSignal.timeout(15000), redirect: 'manual'});
    probes.push({id, url, method: 'OPTIONS', status: response.status, contentType: response.headers.get('content-type')});
    await response.body?.cancel();
  } catch (error) {probes.push({id, method: 'OPTIONS', error: error.message});}
}
const evidence = { inspectedAt: new Date().toISOString(), project, deployed, declared, missingFromDeployedList: missing, probes,
  limitation: 'Metadata and OPTIONS confirm deployment/routing, not deployed source parity or authenticated business correctness.' };
await fs.writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({deployedCount: deployed.length, declaredCount: declared.length, missing, probes, output}, null, 2));
