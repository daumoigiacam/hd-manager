import fs from 'node:fs';
import path from 'node:path';

const RESULT_DIR = path.join(process.cwd(), 'test-results');

const KPI = {
  coldStartMs: 2500,
  warmStartMs: 1000,
  navigationMs: 300,
  apiMs: 500,
  unnecessaryRenders: 0,
  memoryLeaks: 0,
  crashRate: 0.001,
  anr: 0,
  minFps: 55,
  selfExit: 0,
  uiFreeze: 0,
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const latestJson = (prefix) => {
  if (!fs.existsSync(RESULT_DIR)) return null;
  return fs.readdirSync(RESULT_DIR)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.json'))
    .map((name) => path.join(RESULT_DIR, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null;
};

const makeCheck = (name, actual, target, pass, source) => ({ name, actual, target, pass, source });

const formatValue = (value) => {
  if (typeof value === 'number') return Number.isInteger(value) ? `${value}` : value.toFixed(2);
  if (value === null || value === undefined) return 'N/A';
  return String(value);
};

const loadDeviceLog = () => {
  const explicitPath = process.env.HD_DEVICE_PERF_LOG;
  if (explicitPath && fs.existsSync(explicitPath)) return readJson(explicitPath);
  const fallback = latestJson('hd-device-performance-');
  return fallback ? readJson(fallback) : null;
};

const shouldRequireDeviceLog = () => {
  const requireExplicitly = ['1', 'true', 'yes'].includes(`${process.env.HD_REQUIRE_DEVICE_KPI || ''}`.toLowerCase());
  const allowMissingOnCi = ['1', 'true', 'yes'].includes(`${process.env.HD_ALLOW_MISSING_DEVICE_KPI || ''}`.toLowerCase());
  return requireExplicitly || (!!process.env.CI && !allowMissingOnCi);
};

const main = () => {
  const checks = [];
  const bigStressPath = latestJson('hd-manager-big-stress-');
  const perfPath = latestJson('hd-manager-performance-');
  const deviceLog = loadDeviceLog();

  if (bigStressPath) {
    const report = readJson(bigStressPath);
    const maxScreenMs = Math.max(...(report.screens || []).map((screen) => screen.loadMs || 0), 0);
    const maxApiMs = Math.max(...(report.api || []).map((api) => api.responseMs || 0), 0);
    const memoryLeakCount = report.memory?.leakSuspected ? 1 : 0;
    const crashCount = report.crash ? 1 : 0;
    const eventLoopMaxMs = report.eventLoop?.maxMs || 0;

    checks.push(makeCheck('API normal', maxApiMs, `<= ${KPI.apiMs} ms`, maxApiMs <= KPI.apiMs, path.basename(bigStressPath)));
    checks.push(makeCheck('Screen open', maxScreenMs, '<= 2000 ms', maxScreenMs <= 2000, path.basename(bigStressPath)));
    checks.push(makeCheck('Memory leak', memoryLeakCount, KPI.memoryLeaks, memoryLeakCount === KPI.memoryLeaks, path.basename(bigStressPath)));
    checks.push(makeCheck('Crash local simulation', crashCount, 0, crashCount === 0, path.basename(bigStressPath)));
    checks.push(makeCheck('Local UI freeze', eventLoopMaxMs, '<= 50 ms event-loop max', eventLoopMaxMs <= 50, path.basename(bigStressPath)));
  } else {
    checks.push(makeCheck('Big stress report', 'missing', 'required', false, 'test-results'));
  }

  if (perfPath) {
    const report = readJson(perfPath);
    const worstOptimizedOpenMs = Math.max(...(report.results || []).map((item) => item.optimizedTarget?.openMs || 0), 0);
    const optimizedStatuses = new Set((report.results || []).map((item) => item.optimizedTarget?.status));
    checks.push(makeCheck(
      'Cold Start architecture target',
      worstOptimizedOpenMs,
      `<= ${KPI.coldStartMs} ms`,
      worstOptimizedOpenMs <= KPI.coldStartMs && !optimizedStatuses.has('FAIL'),
      path.basename(perfPath),
    ));
  } else {
    checks.push(makeCheck('Performance architecture report', 'missing', 'required', false, 'test-results'));
  }

  if (deviceLog) {
    checks.push(makeCheck('Device Cold Start', deviceLog.coldStartMs, `<= ${KPI.coldStartMs} ms`, deviceLog.coldStartMs <= KPI.coldStartMs, 'device'));
    checks.push(makeCheck('Device Warm Start', deviceLog.warmStartMs, `<= ${KPI.warmStartMs} ms`, deviceLog.warmStartMs <= KPI.warmStartMs, 'device'));
    checks.push(makeCheck('Navigation', deviceLog.navigationMs, `<= ${KPI.navigationMs} ms`, deviceLog.navigationMs <= KPI.navigationMs, 'device'));
    checks.push(makeCheck('Unnecessary re-render', deviceLog.unnecessaryRenders || 0, KPI.unnecessaryRenders, (deviceLog.unnecessaryRenders || 0) <= KPI.unnecessaryRenders, 'device'));
    checks.push(makeCheck('Crash Rate', deviceLog.crashRate || 0, `< ${KPI.crashRate}`, (deviceLog.crashRate || 0) < KPI.crashRate, 'device'));
    checks.push(makeCheck('ANR', deviceLog.anr || 0, KPI.anr, (deviceLog.anr || 0) <= KPI.anr, 'device'));
    checks.push(makeCheck('Scroll FPS', deviceLog.fps || 0, `>= ${KPI.minFps}`, (deviceLog.fps || 0) >= KPI.minFps, 'device'));
    checks.push(makeCheck('Self exit', deviceLog.selfExit || 0, KPI.selfExit, (deviceLog.selfExit || 0) <= KPI.selfExit, 'device'));
    checks.push(makeCheck('UI freeze', deviceLog.uiFreeze || 0, KPI.uiFreeze, (deviceLog.uiFreeze || 0) <= KPI.uiFreeze, 'device'));
  } else {
    const requireDevice = shouldRequireDeviceLog();
    checks.push(makeCheck('Device KPI log', 'not provided', 'HD_DEVICE_PERF_LOG', !requireDevice, 'device'));
  }

  const failed = checks.filter((check) => !check.pass);
  const lines = [
    '# HD Manager KPI Gate',
    '',
    '| Item | Actual | Target | Source | Result |',
    '|---|---:|---:|---|---|',
  ];

  checks.forEach((check) => {
    lines.push(`| ${check.name} | ${formatValue(check.actual)} | ${formatValue(check.target)} | ${check.source} | ${check.pass ? 'PASS' : 'FAIL'} |`);
  });

  lines.push('');
  lines.push(failed.length ? `Conclusion: FAIL (${failed.length} item(s) not met).` : 'Conclusion: PASS.');

  fs.mkdirSync(RESULT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const mdPath = path.join(RESULT_DIR, `hd-manager-kpi-gate-${stamp}.md`);
  fs.writeFileSync(mdPath, `${lines.join('\n')}\n`, 'utf8');
  console.log(lines.join('\n'));
  console.log(`\nKPI report: ${mdPath}`);

  if (failed.length) process.exitCode = 1;
};

main();
