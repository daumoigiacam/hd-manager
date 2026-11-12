import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  CircleHelp,
  Database,
  FileCheck2,
  FileSpreadsheet,
  Gauge,
  Globe2,
  KeyRound,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Server,
  ShieldCheck,
  SquareTerminal,
  Upload,
  XCircle,
} from 'lucide-react';
import { HdApiError } from '../../api/client.js';
import { createHdPlatformClient } from '../../platform/sdk/index.js';
import { CUTOVER_INPUTS, summarizeCutoverPreparation, validateCutoverCsv } from './cutoverPreparation.js';

const NAV_ITEMS = [
  { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'applications', label: 'Applications', icon: Server },
  { id: 'database', label: 'Database', icon: Database },
  { id: 'services', label: 'Services', icon: Activity },
  { id: 'domains', label: 'Domains', icon: Globe2 },
  { id: 'release', label: 'Release', icon: FileCheck2 },
  { id: 'cutover', label: 'Cutover prep', icon: ClipboardCheck },
  { id: 'audit', label: 'Audit', icon: ShieldCheck },
];

const getRuntimeEnv = () => (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {});

const safeValue = (value, fallback = 'Unavailable') => {
  if (value === null || value === undefined || value === '') return fallback;
  return value;
};

const formatBytes = (value) => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unavailable';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && size >= 1024; index += 1) {
    size /= 1024;
    unit = units[index];
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${unit}`;
};

const formatDate = (value) => {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? `${value}` : date.toLocaleString();
};

const statusTone = (status) => {
  const normalized = `${status || ''}`.toLowerCase();
  if (['up', 'healthy', 'ok', 'pass', 'passed', 'ready', 'fulfilled'].includes(normalized)) return 'success';
  if (['down', 'failed', 'fail', 'error', 'blocked', 'rejected'].includes(normalized)) return 'danger';
  if (['warning', 'pending', 'stale', 'skipped', 'not_configured', 'not_probed'].includes(normalized)) return 'warning';
  return 'neutral';
};

function StatusBadge({ status, label }) {
  const tone = statusTone(status);
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'danger' ? XCircle : tone === 'warning' ? AlertTriangle : CircleHelp;
  return (
    <span className={`platform-admin-status platform-admin-status--${tone}`}>
      <Icon size={14} aria-hidden="true" />
      {safeValue(label || status, 'Unknown')}
    </span>
  );
}

function MetricCard({ label, value, detail, icon: Icon, status }) {
  return (
    <article className="platform-admin-metric">
      <div className="platform-admin-metric__topline">
        <span>{label}</span>
        {Icon ? <Icon size={18} aria-hidden="true" /> : null}
      </div>
      <strong>{safeValue(value)}</strong>
      {status ? <StatusBadge status={status} /> : <small>{safeValue(detail, '')}</small>}
    </article>
  );
}

function SectionPanel({ title, eyebrow, children, action }) {
  return (
    <section className="platform-admin-panel">
      <div className="platform-admin-panel__header">
        <div>
          {eyebrow ? <p className="platform-admin-eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyPanel({ label = 'No data available.' }) {
  return <div className="platform-admin-empty"><CircleHelp size={18} aria-hidden="true" />{label}</div>;
}

function KeyValueGrid({ entries }) {
  return (
    <div className="platform-admin-key-grid">
      {entries.map(([label, value]) => (
        <div key={label} className="platform-admin-key">
          <span>{label}</span>
          <strong>{safeValue(value)}</strong>
        </div>
      ))}
    </div>
  );
}

function ServiceTable({ services }) {
  if (!Array.isArray(services) || services.length === 0) return <EmptyPanel label="No service checks returned." />;
  return (
    <div className="platform-admin-table-wrap">
      <table className="platform-admin-table">
        <thead><tr><th>Service</th><th>Status</th><th>Message</th></tr></thead>
        <tbody>
          {services.map((service) => (
            <tr key={service.name}>
              <td><strong>{safeValue(service.name, 'Unknown')}</strong></td>
              <td><StatusBadge status={service.status} /></td>
              <td>{safeValue(service.message, 'No diagnostic message.')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CutoverPreparationPanel({ dashboardStatus = 'NOT_VERIFIED', releaseStatus = 'NOT_VERIFIED' }) {
  const [files, setFiles] = useState({});
  const [auditEvents, setAuditEvents] = useState([]);
  const overall = useMemo(() => summarizeCutoverPreparation(files), [files]);
  const workflowSteps = [
    ['Dashboard', dashboardStatus],
    ['Identity', files['identity-input.csv']?.status || 'PENDING'],
    ['Warehouse', files['warehouse-input.csv']?.status || 'PENDING'],
    ['Inventory', files['inventory-opening-input.csv']?.status || 'PENDING'],
    ['Debt', files['debt-opening-input.csv']?.status || 'PENDING'],
    ['Payment collision', files['payment-collision-decisions.csv']?.status || 'PENDING'],
    ['Firebase freeze', 'PENDING'],
    ['Release', releaseStatus || 'NOT_VERIFIED'],
    ['Android', 'BLOCKED'],
  ];

  const recordAudit = (definition, result) => {
    setAuditEvents((current) => [{
      id: `${definition.key}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'CSV_VALIDATED_LOCAL_ONLY',
      file: definition.key,
      status: result.status,
      rows: result.rowCount || 0,
    }, ...current].slice(0, 20));
  };

  const handleFile = async (definition, event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = validateCutoverCsv(definition.key, await file.text());
      recordAudit(definition, result);
      setFiles((current) => ({
        ...current,
        [definition.key]: { ...result, fileName: file.name },
      }));
    } catch (error) {
      const failedResult = { status: 'BLOCKED', rowCount: 0 };
      recordAudit(definition, failedResult);
      setFiles((current) => ({
        ...current,
        [definition.key]: {
          status: 'BLOCKED',
          fileName: file.name,
          rowCount: 0,
          preview: [],
          errors: [{ message: error instanceof Error ? error.message : 'The CSV could not be read.' }],
        },
      }));
    }
  };

  return (
    <div className="platform-admin-grid">
      <SectionPanel title="Cutover preparation" eyebrow="Preview-only business input gate" action={<StatusBadge status={overall.status} label={overall.label} />}>
        <div className="platform-admin-cutover-callout">
          <ClipboardCheck size={18} aria-hidden="true" />
          <div>
            <strong>No production write is available here.</strong>
            <p>Choose completed CSV inputs to validate their shape, approvals and safe fields locally. The console never uploads, imports, creates UUIDs, or changes PostgreSQL, Firestore or Firebase.</p>
          </div>
        </div>
        <div className="platform-admin-cutover-grid">
          {CUTOVER_INPUTS.map((definition) => {
            const result = files[definition.key];
            return (
              <article key={definition.key} className="platform-admin-cutover-card">
                <div className="platform-admin-cutover-card__header">
                  <div>
                    <FileSpreadsheet size={18} aria-hidden="true" />
                    <h3>{definition.label}</h3>
                  </div>
                  <StatusBadge status={result?.status || 'PENDING'} label={result?.status || 'PENDING'} />
                </div>
                <p>{definition.description}</p>
                <label className="platform-admin-file-input">
                  <Upload size={16} aria-hidden="true" />
                  <span>{result?.fileName || 'Select CSV'}</span>
                  <input type="file" accept=".csv,text/csv" onChange={(event) => handleFile(definition, event)} />
                </label>
                <div className="platform-admin-cutover-card__meta">
                  <span>{result ? `${result.rowCount} row(s) checked` : 'No file selected'}</span>
                  {result?.errors?.length ? <span className="platform-admin-cutover-error-count">{result.errors.length} issue(s)</span> : null}
                </div>
                {result?.errors?.length ? (
                  <ul className="platform-admin-cutover-errors">
                    {result.errors.slice(0, 3).map((error, index) => <li key={`${error.message}-${index}`}>{error.rowNumber ? `Row ${error.rowNumber}: ` : ''}{error.message}</li>)}
                  </ul>
                ) : null}
              </article>
            );
          })}
        </div>
        <div className="platform-admin-cutover-summary">
          <KeyValueGrid entries={[
            ['Overall', overall.label],
            ['Files supplied', Object.keys(files).length],
            ['Production writes', '0'],
            ['External validator', 'Required before any cutover'],
          ]} />
          <button type="button" className="platform-admin-button platform-admin-button--primary" disabled title="Production cutover is intentionally unavailable in preparation mode">
            <ClipboardCheck size={16} /> Continue to production cutover
          </button>
        </div>
      </SectionPanel>
      <SectionPanel title="Cutover workflow" eyebrow="Fail-closed gate sequence">
        <div className="platform-admin-cutover-workflow">
          {workflowSteps.map(([label, status]) => (
            <div key={label} className="platform-admin-cutover-workflow__step">
              <span>{label}</span>
              <StatusBadge status={status} />
            </div>
          ))}
        </div>
      </SectionPanel>
      {Object.entries(files).filter(([, result]) => result?.status === 'PASS').map(([filename, result]) => (
        <SectionPanel key={filename} title={`Preview: ${filename}`} eyebrow="First five rows only">
          <div className="platform-admin-table-wrap">
            <table className="platform-admin-table platform-admin-cutover-preview">
              <thead><tr>{result.headers.slice(0, 8).map((header) => <th key={header}>{header}</th>)}</tr></thead>
              <tbody>{result.preview.map((row) => <tr key={row.rowNumber}>{result.headers.slice(0, 8).map((header) => <td key={header}>{safeValue(row.values[header], '')}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </SectionPanel>
      ))}
      <SectionPanel title="Preparation audit" eyebrow="Local-only evidence">
        {!auditEvents.length ? <EmptyPanel label="No local validation events yet." /> : (
          <div className="platform-admin-table-wrap">
            <table className="platform-admin-table">
              <thead><tr><th>Time</th><th>File</th><th>Action</th><th>Rows</th><th>Result</th></tr></thead>
              <tbody>{auditEvents.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDate(entry.timestamp)}</td>
                  <td className="platform-admin-mono">{entry.file}</td>
                  <td>{entry.action}</td>
                  <td>{entry.rows}</td>
                  <td><StatusBadge status={entry.status} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <p className="platform-admin-footnote"><ShieldCheck size={14} /> This audit is intentionally browser-local; server audit begins only after a separately approved cutover execution.</p>
      </SectionPanel>
    </div>
  );
}

function AdminConsolePage() {
  const runtimeEnv = getRuntimeEnv();
  const [activeSection, setActiveSection] = useState('overview');
  const [snapshot, setSnapshot] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);
  const [commandState, setCommandState] = useState('idle');

  const clientState = useMemo(() => {
    try {
      return {
        client: createHdPlatformClient({
          baseUrl: runtimeEnv.VITE_API_BASE_URL,
          deviceName: 'hd-platform-admin-console',
          platform: 'hd-platform-admin-console',
          tokenStorageNamespace: runtimeEnv.VITE_TOKEN_STORAGE_NAMESPACE || 'vps-staging',
        }),
        error: null,
      };
    } catch (clientError) {
      return { client: null, error: clientError };
    }
  }, [runtimeEnv.VITE_API_BASE_URL, runtimeEnv.VITE_TOKEN_STORAGE_NAMESPACE]);

  const loadSnapshot = useCallback(async () => {
    if (!clientState.client) {
      setError(clientState.error || new Error('API client is unavailable.'));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const nextSnapshot = await clientState.client.loadAdminSnapshot();
    setSnapshot(nextSnapshot);
    setLastUpdated(new Date().toISOString());
    setLoading(false);

    const overviewResult = nextSnapshot.overview;
    if (overviewResult?.status === 'rejected') {
      const requestError = overviewResult.reason;
      if (requestError instanceof HdApiError && requestError.status === 401) {
        setError(new Error('Authentication required. Sign in through HD Manager first, then reopen this console.'));
      } else {
        setError(requestError instanceof Error ? requestError : new Error('Admin Console is unavailable.'));
      }
    }
  }, [clientState]);

  useEffect(() => {
    loadSnapshot();
    const intervalId = window.setInterval(loadSnapshot, 30_000);
    return () => window.clearInterval(intervalId);
  }, [loadSnapshot]);

  const handleRefreshCache = async () => {
    if (!clientState.client || commandState === 'loading') return;
    setCommandState('loading');
    try {
      await clientState.client.refreshAdminCache();
      setCommandState('success');
      await loadSnapshot();
    } catch {
      setCommandState('error');
    } finally {
      window.setTimeout(() => setCommandState('idle'), 2400);
    }
  };

  const result = (key) => snapshot[key]?.status === 'fulfilled' ? snapshot[key].value : null;
  const overview = result('overview') || {};
  const health = overview.health || result('monitoring')?.health || {};
  const metrics = overview.metrics || result('monitoring')?.snapshot || {};
  const database = result('database') || {};
  const backup = result('backup') || overview.backup || {};
  const release = result('release') || overview.release || {};
  const services = result('services')?.services || [];
  const applications = result('applications')?.applications || {};
  const audit = result('audit');

  const serviceCounts = services.reduce((counts, service) => {
    const tone = statusTone(service.status);
    counts[tone] = (counts[tone] || 0) + 1;
    return counts;
  }, {});

  const renderOverview = () => (
    <>
      <div className="platform-admin-metrics">
        <MetricCard label="API" value={health.status || health.api?.status} status={health.status || health.api?.status} icon={Activity} />
        <MetricCard label="Database" value={health.checks?.database?.status || database.database?.status} status={health.checks?.database?.status || database.database?.status} icon={Database} />
        <MetricCard label="Redis" value={health.checks?.redis?.status || health.redis?.status} status={health.checks?.redis?.status || health.redis?.status} icon={Server} />
        <MetricCard label="Release" value={release.gitSha ? `${release.gitSha}`.slice(0, 12) : release.status} detail={release.validation?.status} icon={FileCheck2} />
      </div>
      <div className="platform-admin-grid platform-admin-grid--two">
        <SectionPanel title="Runtime health" eyebrow="Platform status" action={<StatusBadge status={health.status || 'unknown'} />}>
          <KeyValueGrid entries={[
            ['Environment', runtimeEnv.VITE_DATA_MODE || 'Unknown'],
            ['API version', runtimeEnv.VITE_API_VERSION || 'v1'],
            ['Last update', formatDate(lastUpdated)],
            ['Healthy services', serviceCounts.success || 0],
            ['Warnings', serviceCounts.warning || 0],
            ['Failures', serviceCounts.danger || 0],
          ]} />
        </SectionPanel>
        <SectionPanel title="Resource snapshot" eyebrow="Observability">
          <KeyValueGrid entries={[
            ['CPU', metrics.cpu?.usage ?? metrics.cpuUsage ?? 'Unavailable'],
            ['Memory', metrics.memory?.usage ?? metrics.memoryUsage ?? 'Unavailable'],
            ['Disk', metrics.disk?.usage ?? metrics.diskUsage ?? 'Unavailable'],
            ['Requests', metrics.requestCount ?? metrics.requests ?? 'Unavailable'],
            ['Errors', metrics.errorCount ?? metrics.errors ?? 'Unavailable'],
            ['Release', safeValue(release.gitSha, 'Unavailable').slice(0, 12)],
          ]} />
        </SectionPanel>
      </div>
      <SectionPanel title="Service health" eyebrow="Read-only checks" action={<button type="button" className="platform-admin-button platform-admin-button--quiet" onClick={() => setActiveSection('services')}>View services <ChevronRight size={15} /></button>}>
        <ServiceTable services={services.slice(0, 8)} />
      </SectionPanel>
      <SectionPanel title="Backup readiness" eyebrow="Recovery metadata" action={<StatusBadge status={backup.status} />}>
        <KeyValueGrid entries={[
          ['Directory', backup.backupDirectory],
          ['Latest file', backup.latest?.name],
          ['Latest size', backup.latest?.bytes ? formatBytes(backup.latest.bytes) : null],
          ['Created', backup.latest?.modifiedAt ? formatDate(backup.latest.modifiedAt) : null],
          ['Retention', backup.retentionDays ? `${backup.retentionDays} days` : null],
          ['Restore verification', backup.restoreVerification?.status || 'Not reported'],
        ]} />
      </SectionPanel>
    </>
  );

  const renderApplications = () => (
    <SectionPanel title="Applications" eyebrow="Deployment inventory">
      <KeyValueGrid entries={Object.entries(applications).slice(0, 18).map(([key, value]) => [key, typeof value === 'object' ? JSON.stringify(value) : value])} />
      {!Object.keys(applications).length ? <EmptyPanel /> : null}
    </SectionPanel>
  );

  const renderDatabase = () => (
    <div className="platform-admin-grid platform-admin-grid--two">
      <SectionPanel title="Database" eyebrow="Connection and health">
        <KeyValueGrid entries={[
          ['Status', database.database?.status],
          ['Version', database.database?.version],
          ['Size', database.database?.size ? formatBytes(database.database.size) : null],
          ['Migration status', database.migration?.status],
          ['Latest migration', database.migration?.latestMigration],
        ]} />
      </SectionPanel>
      <SectionPanel title="Backup" eyebrow="Latest verified metadata">
        <KeyValueGrid entries={[
          ['Status', backup.status],
          ['Latest', backup.latest?.name],
          ['Size', backup.latest?.bytes ? formatBytes(backup.latest.bytes) : null],
          ['Checksum', backup.latest?.checksum || 'Not exposed'],
          ['Restore', backup.restoreVerification?.status || 'Not reported'],
        ]} />
      </SectionPanel>
    </div>
  );

  const renderServices = () => (
    <SectionPanel title="Services" eyebrow="Health checks and probe boundaries">
      <ServiceTable services={services} />
      <p className="platform-admin-footnote"><SquareTerminal size={14} /> External services marked <strong>not_probed</strong> require the deployment monitor; this console never executes shell commands.</p>
    </SectionPanel>
  );

  const renderDomains = () => {
    const domains = result('domains') || {};
    return (
      <SectionPanel title="Domains" eyebrow="Configuration snapshot">
        <KeyValueGrid entries={[
          ['App URL', domains.appUrl],
          ['API URL', domains.apiUrl],
          ['SSL', domains.sslEnabled ? 'Enabled' : 'Disabled'],
          ['Certbot domains', domains.certbotDomains],
          ['Certificate', domains.certificateName],
          ['Status', domains.status],
        ]} />
        <p className="platform-admin-footnote"><Globe2 size={14} /> DNS and TLS changes are intentionally outside this API.</p>
      </SectionPanel>
    );
  };

  const renderRelease = () => (
    <div className="platform-admin-grid platform-admin-grid--two">
      <SectionPanel title="Release candidate" eyebrow="Immutable metadata" action={<StatusBadge status={release.status} />}>
        <KeyValueGrid entries={[
          ['Git SHA', release.gitSha],
          ['Frontend hash', release.frontendHash],
          ['Backend image', release.backendImageDigest],
          ['Migration checksum', release.migrationChecksum],
          ['Validation', release.validation?.status],
        ]} />
      </SectionPanel>
      <SectionPanel title="Applications" eyebrow="Current deployment">
        <KeyValueGrid entries={Object.entries(applications).slice(0, 12).map(([key, value]) => [key, typeof value === 'object' ? JSON.stringify(value) : value])} />
      </SectionPanel>
    </div>
  );

  const renderAudit = () => {
    const entries = Array.isArray(audit?.items) ? audit.items : Array.isArray(audit) ? audit : [];
    return (
      <SectionPanel title="Audit" eyebrow="Tenant-scoped administration events">
        {!entries.length ? <EmptyPanel label="No audit entries returned." /> : (
          <div className="platform-admin-table-wrap">
            <table className="platform-admin-table">
              <thead><tr><th>Time</th><th>Actor</th><th>Operation</th><th>Result</th><th>Request ID</th></tr></thead>
              <tbody>{entries.map((entry) => (
                <tr key={entry.id || `${entry.createdAt}-${entry.action}`}>
                  <td>{formatDate(entry.createdAt || entry.timestamp)}</td>
                  <td>{safeValue(entry.userId || entry.actorId)}</td>
                  <td>{safeValue(entry.action || entry.operation)}</td>
                  <td><StatusBadge status={entry.result || entry.status} /></td>
                  <td className="platform-admin-mono">{safeValue(entry.requestId || entry.correlationId)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </SectionPanel>
    );
  };

  const renderSection = () => {
    if (loading && !Object.keys(snapshot).length) return <div className="platform-admin-loading"><RefreshCw size={20} className="platform-admin-spin" /> Loading platform snapshot...</div>;
    if (activeSection === 'overview') return renderOverview();
    if (activeSection === 'applications') return renderApplications();
    if (activeSection === 'database') return renderDatabase();
    if (activeSection === 'services') return renderServices();
    if (activeSection === 'domains') return renderDomains();
    if (activeSection === 'release') return renderRelease();
    if (activeSection === 'cutover') return <CutoverPreparationPanel dashboardStatus={health.status} releaseStatus={release.status} />;
    return renderAudit();
  };

  return (
    <div className="platform-admin-shell">
      <aside className="platform-admin-sidebar">
        <div className="platform-admin-brand">
          <div className="platform-admin-brand__mark"><Gauge size={20} /></div>
          <div><strong>HD Platform</strong><span>Admin Console</span></div>
        </div>
        <nav aria-label="Platform sections" className="platform-admin-nav">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className={activeSection === id ? 'is-active' : ''} onClick={() => setActiveSection(id)}>
              <Icon size={18} aria-hidden="true" />{label}<ChevronRight size={14} aria-hidden="true" />
            </button>
          ))}
        </nav>
        <div className="platform-admin-sidebar__footer">
          <KeyRound size={16} aria-hidden="true" />
          <span>Permission: operations.admin</span>
        </div>
      </aside>
      <main className="platform-admin-main">
        <header className="platform-admin-header">
          <div>
            <p className="platform-admin-eyebrow">HD CONNECT Platform</p>
            <h1>{NAV_ITEMS.find((item) => item.id === activeSection)?.label || 'Dashboard'}</h1>
          </div>
          <div className="platform-admin-header__actions">
            <span className="platform-admin-last-updated">{lastUpdated ? `Updated ${formatDate(lastUpdated)}` : 'Not updated'}</span>
            <button type="button" className="platform-admin-button platform-admin-button--quiet" onClick={loadSnapshot} disabled={loading} title="Refresh platform snapshot">
              <RefreshCw size={16} className={loading ? 'platform-admin-spin' : ''} /> Refresh
            </button>
            <button type="button" className="platform-admin-button platform-admin-button--primary" onClick={handleRefreshCache} disabled={commandState === 'loading'} title="Run the allowlisted cache refresh operation">
              <Archive size={16} /> {commandState === 'loading' ? 'Refreshing...' : commandState === 'success' ? 'Cache refreshed' : commandState === 'error' ? 'Refresh failed' : 'Refresh cache'}
            </button>
            <button type="button" className="platform-admin-button platform-admin-button--icon" onClick={() => clientState.client?.logout()} title="Sign out of platform console" aria-label="Sign out">
              <LogOut size={17} />
            </button>
          </div>
        </header>
        {error ? <div className="platform-admin-alert platform-admin-alert--danger"><AlertTriangle size={18} /><span>{error.message}</span><button type="button" onClick={loadSnapshot}>Retry</button></div> : null}
        <div className="platform-admin-content">
          {renderSection()}
          <footer className="platform-admin-footer"><ShieldCheck size={14} /> Read-only operational facade. Destructive operations, shell access and secret values are unavailable.</footer>
        </div>
      </main>
    </div>
  );
}

export default AdminConsolePage;
