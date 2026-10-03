// Read-only cloud metadata discovery; never reads business documents or Auth users.
const fs = require('node:fs');
const { getGlobalDefaultAccount } = require('firebase-tools/lib/auth');
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const { Client } = require('firebase-tools/lib/apiv2');
const projects = ['cangiacam', 'daumoigiacam-e7c2b', 'hd-manager-c5839', 'quanlysaas'];
const output = 'docs/reports/firebase-performance-environment-evidence.json';
const evidence = { observedAt: new Date().toISOString(), mode: 'GET metadata only', projects: [] };
const save = () => fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
const deadline = setTimeout(() => { evidence.timeout = true; save(); process.exit(124); }, 180000);
async function read(origin, path, select) {
  try {
    const response = await new Client({ urlPrefix: origin, apiVersion: '', auth: true })
      .get(path, { timeout: 10000, retries: 0 });
    return { status: 'OK', metadata: select(response.body) };
  } catch (error) {
    return { status: 'UNAVAILABLE', httpStatus: error.status || error.context?.response?.statusCode || null,
      message: String(error.message || 'request failed').slice(0, 350) };
  }
}
(async () => {
  const account = getGlobalDefaultAccount();
  if (!account) throw new Error('No existing Firebase CLI account');
  await requireAuth({ ...account, nonInteractive: true });
  for (const project of projects) {
    const row = { project, benchmarkWritesPermitted: false };
    evidence.projects.push(row);
    row.projectMetadata = await read('https://cloudresourcemanager.googleapis.com', `/v1/projects/${project}`,
      b => ({ projectId: b.projectId, name: b.name, lifecycleState: b.lifecycleState, labels: b.labels || {} }));
    row.firestore = await read('https://firestore.googleapis.com', `/v1/projects/${project}/databases`,
      b => ({ databases: (b.databases || []).map(d => ({ name: d.name, locationId: d.locationId, type: d.type })) }));
    row.auth = await read('https://identitytoolkit.googleapis.com', `/admin/v2/projects/${project}/config`,
      b => ({ name: b.name, authorizedDomains: b.authorizedDomains, multiTenant: b.multiTenant,
        signIn: { emailEnabled: b.signIn?.email?.enabled, phoneEnabled: b.signIn?.phoneNumber?.enabled, anonymousEnabled: b.signIn?.anonymous?.enabled } }));
    row.functionsV1 = await read('https://cloudfunctions.googleapis.com', `/v1/projects/${project}/locations/-/functions`,
      b => ({ functions: (b.functions || []).map(f => ({ name: f.name, status: f.status, runtime: f.runtime })), nextPage: Boolean(b.nextPageToken), unreachable: b.unreachable }));
    row.functionsV2 = await read('https://cloudfunctions.googleapis.com', `/v2/projects/${project}/locations/-/functions`,
      b => ({ functions: (b.functions || []).map(f => ({ name: f.name, state: f.state, environment: f.environment })), nextPage: Boolean(b.nextPageToken), unreachable: b.unreachable }));
    row.hosting = await read('https://firebasehosting.googleapis.com', `/v1beta1/projects/${project}/sites`,
      b => ({ sites: (b.sites || []).map(s => ({ name: s.name, defaultUrl: s.defaultUrl, type: s.type })), nextPage: Boolean(b.nextPageToken) }));
    save();
    console.log(JSON.stringify(row));
  }
  clearTimeout(deadline);
})().catch(error => { evidence.failure = error.message; save(); clearTimeout(deadline); process.exitCode = 1; });
