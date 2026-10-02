import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const apiBaseUrl = process.env.PHASE2_STAGING_API_URL || 'https://staging-api.hdconnect.net/api/v1';
const appVersionUrl = process.env.PHASE2_STAGING_VERSION_URL || 'https://staging-app.hdconnect.net/version.json';
const sshTarget = process.env.PHASE2_STAGING_SSH_TARGET || '';
const outputPath = path.resolve('test-results/phase2/staging-environment.json');

const timedJson = async (url) => {
  const startedAt = performance.now();
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const body = await response.json();
  return { url, status: response.status, durationMs: Number((performance.now() - startedAt).toFixed(2)), body };
};

const [health, readiness, version] = await Promise.all([
  timedJson(`${apiBaseUrl}/health`),
  timedJson(`${apiBaseUrl}/health/ready`),
  timedJson(appVersionUrl),
]);

const healthData = health.body?.data || health.body || {};
const publicSummary = {
  service: healthData.service || null,
  version: healthData.version || null,
  status: healthData.status || null,
  startedAt: healthData.kernel?.startedAt || null,
  kernelMemory: healthData.kernel?.memory || null,
  checks: healthData.checks || null,
};

let host = null;
if (sshTarget) {
  const remoteCommand = [
    "echo 'ENV|'; docker inspect hdconnect-api-staging --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^(NODE_ENV|PLATFORM_ENVIRONMENT|PORT|LOG_LEVEL)=' | tr '\\n' ';'",
    "echo; docker stats --no-stream --format 'STAT|{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}|{{.BlockIO}}' hdconnect-api-staging hdconnect-postgres-staging hdconnect-redis-staging hdconnect-gateway-staging",
    "docker exec hdconnect-postgres-staging psql -U hd_connect_staging -d hd_connect_staging -Atc \"select concat('ROW|Company|',count(*)) from \\\"Company\\\"; select concat('ROW|User|',count(*)) from \\\"User\\\"; select concat('ROW|Customer|',count(*)) from \\\"Customer\\\"; select concat('ROW|Product|',count(*)) from \\\"Product\\\"; select concat('ROW|SalesOrder|',count(*)) from \\\"SalesOrder\\\"; select concat('ROW|SalesOrderLine|',count(*)) from \\\"SalesOrderLine\\\";\"",
  ].join('; ');
  const raw = execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', sshTarget, remoteCommand], { encoding: 'utf8' });
  host = { target: sshTarget.replace(/^[^@]+@/, '<redacted-user>@'), raw: raw.trim().split(/\r?\n/) };
}

const report = {
  generatedAt: new Date().toISOString(),
  environment: 'STAGING',
  safety: 'Read-only HTTP health/version probes and optional read-only SSH resource/row-count snapshot.',
  apiBaseUrl,
  appVersionUrl,
  probes: {
    health: { status: health.status, durationMs: health.durationMs, data: publicSummary },
    readiness: { status: readiness.status, durationMs: readiness.durationMs },
    version: { status: version.status, durationMs: version.durationMs, data: version.body },
  },
  host,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, environment: report.environment, health: health.status, readiness: readiness.status, buildId: version.body?.buildId || null, hostSampled: Boolean(host) }));
