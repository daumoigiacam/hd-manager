const { app, BrowserWindow, Menu, shell, ipcMain, clipboard, nativeImage, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');

const isDev = !app.isPackaged;
let cachedMachineInfo = null;
let mainWindowRef = null;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindowRef) return;
    if (mainWindowRef.isMinimized()) mainWindowRef.restore();
    mainWindowRef.show();
    mainWindowRef.focus();
  });
}

function getIndexFilePath() {
  return path.join(app.getAppPath(), 'dist', 'index.html');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildZaloOpenCandidates(inputUrl = '') {
  const raw = `${inputUrl || ''}`.trim();
  if (!raw) return [];

  const candidates = [];
  const add = (value) => {
    const normalized = `${value || ''}`.trim();
    if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
  };

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    const groupMatch = parsed.pathname.match(/\/g\/([^/?#]+)/i);
    if ((host === 'zalo.me' || host.endsWith('.zalo.me')) && groupMatch?.[1]) {
      const groupCode = groupMatch[1];
      add(`zalo://g/${groupCode}`);
      add(`zalo://zalo.me/g/${groupCode}`);
      add(`zalo://group/${groupCode}`);
      add(`zalo://chat/group/${groupCode}`);
    }
  } catch (error) {
    if (!raw.startsWith('zalo://')) add(`zalo://${raw.replace(/^\/+/, '')}`);
  }

  add(raw);
  return candidates;
}

function stripBrowserSuffix(title = '') {
  return `${title || ''}`
    .replace(/\s+-\s+(Microsoft Edge|Google Chrome|Coc Coc|CocCoc|Mozilla Firefox|Brave|Opera).*$/i, '')
    .trim();
}

function extractZaloGroupTitleFromOpenResult(openResult = {}) {
  const detail = `${openResult?.joinPrompt?.detail || ''}`.trim();
  if (!detail) return '';
  const match = detail.match(/^clicked:[^-]+-\s*(.+?)\s+automation=/i);
  if (!match?.[1]) return '';
  const title = stripBrowserSuffix(match[1]);
  if (!title || /^(zalo|new tab|tab moi|tab mới)$/i.test(title)) return '';
  return title;
}

function isDirectImageSource(value = '') {
  const raw = `${value || ''}`.trim();
  if (!raw) return false;
  if (/^data:image\//i.test(raw)) return true;
  if (!/^https?:\/\//i.test(raw)) return false;
  return /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(raw)
    || /img\.vietqr\.io/i.test(raw)
    || /api\.qrserver\.com/i.test(raw);
}

function buildQrImageSource(value = '') {
  const raw = `${value || ''}`.trim();
  if (!raw) return '';
  if (isDirectImageSource(raw)) return raw;
  return `https://api.qrserver.com/v1/create-qr-code/?size=520x520&margin=12&data=${encodeURIComponent(raw)}`;
}

async function loadNativeImageFromSource(source = '') {
  const raw = `${source || ''}`.trim();
  if (!raw) return null;

  if (/^data:image\//i.test(raw)) {
    const base64 = raw.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '');
    const image = nativeImage.createFromBuffer(Buffer.from(base64, 'base64'));
    if (image.isEmpty()) throw new Error('Khong tao duoc anh QR tu du lieu base64.');
    return { image, source: 'data-image' };
  }

  const finalSource = buildQrImageSource(raw);
  if (!/^https?:\/\//i.test(finalSource)) {
    throw new Error('Nguon anh QR khong hop le.');
  }

  const response = await fetch(finalSource);
  if (!response.ok) {
    throw new Error(`Khong tai duoc anh QR (${response.status}).`);
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType && !/^image\//i.test(contentType)) {
    throw new Error(`Nguon QR khong phai anh (${contentType}).`);
  }
  const image = nativeImage.createFromBuffer(Buffer.from(await response.arrayBuffer()));
  if (image.isEmpty()) throw new Error('Anh QR tai ve bi rong hoac khong doc duoc.');
  return { image, source: finalSource };
}

function getZaloExecutableCandidates() {
  if (process.platform !== 'win32') return [];
  const localAppData = process.env.LOCALAPPDATA || '';
  const programFiles = process.env.PROGRAMFILES || '';
  const programFilesX86 = process.env['PROGRAMFILES(X86)'] || '';
  const localZaloRoot = path.join(localAppData, 'Programs', 'Zalo');
  const versionedLocalCandidates = [];

  try {
    if (fs.existsSync(localZaloRoot)) {
      for (const entry of fs.readdirSync(localZaloRoot, { withFileTypes: true })) {
        if (!entry.isDirectory() || !/^Zalo-/i.test(entry.name)) continue;
        const exePath = path.join(localZaloRoot, entry.name, 'Zalo.exe');
        if (fs.existsSync(exePath)) versionedLocalCandidates.push(exePath);
      }
    }
  } catch (error) {
    // Fall back to well-known paths below.
  }

  return [
    ...versionedLocalCandidates.sort().reverse(),
    path.join(localAppData, 'Programs', 'Zalo', 'Zalo.exe'),
    path.join(programFiles, 'Zalo', 'Zalo.exe'),
    path.join(programFilesX86, 'Zalo', 'Zalo.exe')
  ].filter((candidate, index, list) => candidate && list.indexOf(candidate) === index);
}

async function openWithZaloPc(targetUrl, options = {}) {
  const target = `${targetUrl || ''}`.trim();
  if (!target || process.platform !== 'win32') return null;
  const settleMs = Math.max(1200, Number(options.settleMs) || 1200);
  const tryAllArgSets = Boolean(options.tryAllArgSets);

  const zaloExe = getZaloExecutableCandidates().find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch (error) {
      return false;
    }
  });

  if (!zaloExe) return null;

  const launchArgSets = [
    [target],
    ['--url', target],
    ['--open-url', target],
    ['--', target]
  ];

  let lastError = null;
  const launchedArgs = [];
  for (const args of launchArgSets) {
    try {
      const child = spawn(zaloExe, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      });
      child.unref();
      launchedArgs.push(args);
      await sleep(tryAllArgSets ? 900 : settleMs);
      if (!tryAllArgSets) return { openedUrl: target, mode: 'zalo-pc-direct', zaloExe, args, launchedArgs };
    } catch (error) {
      lastError = error;
    }
  }

  if (tryAllArgSets && launchedArgs.length) {
    await sleep(settleMs);
    return { openedUrl: target, mode: 'zalo-pc-direct-strong', zaloExe, args: launchedArgs[launchedArgs.length - 1], launchedArgs };
  }

  if (lastError) throw lastError;
  return null;
}

function confirmExternalOpenPromptIfBrowser(timeoutMs = 3500) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ attempted: false, reason: 'not-windows' });
      return;
    }

    let finished = false;
    let child = null;
    const finish = (payload) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      resolve(payload);
    };
    const timeout = setTimeout(() => {
      try {
        if (child && !child.killed) child.kill();
      } catch (error) {
        // Best-effort cleanup only.
      }
      finish({ attempted: false, reason: 'timeout' });
    }, Math.max(1500, Number(timeoutMs) || 3500));

    const command = [
      "$ErrorActionPreference = 'Stop';",
      'Add-Type -AssemblyName System.Windows.Forms;',
      "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class HdForeground { [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId); }';",
      '$hwnd = [HdForeground]::GetForegroundWindow();',
      '$pid = 0;',
      '[void][HdForeground]::GetWindowThreadProcessId($hwnd, [ref]$pid);',
      '$proc = $null;',
      'if ($pid -gt 0) { $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue; }',
      '$name = if ($proc) { $proc.ProcessName } else { "" };',
      '$title = if ($proc) { $proc.MainWindowTitle } else { "" };',
      '$isBrowser = $name -match "^(msedge|chrome|firefox|brave|opera|browser)$";',
      'if ($isBrowser) {',
      '  Start-Sleep -Milliseconds 500;',
      '  [System.Windows.Forms.SendKeys]::SendWait("{ENTER}");',
      '  Start-Sleep -Milliseconds 900;',
      '  Write-Output ("confirmed:" + $name + " - " + $title);',
      '} else {',
      '  Write-Output ("skip:" + $name + " - " + $title);',
      '}'
    ].join(' ');

    try {
      child = spawn('powershell.exe', [
        '-NoProfile',
        '-STA',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        command
      ], { windowsHide: true });
    } catch (error) {
      finish({ attempted: false, reason: error?.message || 'spawn-failed' });
      return;
    }

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => finish({ attempted: false, reason: error?.message || 'powershell-error' }));
    child.on('close', (code) => {
      finish({
        attempted: code === 0 && /^confirmed:/i.test(stdout.trim()),
        detail: stdout.trim(),
        error: code === 0 ? '' : stderr.trim()
      });
    });
  });
}

function clickZaloJoinGroupButtonIfShown(timeoutMs = 8500) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ attempted: false, reason: 'not-windows' });
      return;
    }

    let finished = false;
    let child = null;
    const finish = (payload) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      resolve(payload);
    };
    const timeout = setTimeout(() => {
      try {
        if (child && !child.killed) child.kill();
      } catch (error) {
        // Best-effort cleanup only.
      }
      finish({ attempted: false, reason: 'timeout' });
    }, Math.max(2500, Number(timeoutMs) || 8500));

    const command = [
      "$ErrorActionPreference = 'Stop';",
      'Add-Type -AssemblyName System.Windows.Forms;',
      'Add-Type -AssemblyName UIAutomationClient;',
      'Add-Type -AssemblyName UIAutomationTypes;',
      "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public struct HdJoinRect { public int Left; public int Top; public int Right; public int Bottom; } public class HdJoinWin32 { [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId); [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd); [DllImport(\"user32.dll\")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow); [DllImport(\"user32.dll\")] public static extern bool GetWindowRect(IntPtr hWnd, out HdJoinRect rect); [DllImport(\"user32.dll\")] public static extern bool SetCursorPos(int X, int Y); [DllImport(\"user32.dll\")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo); }';",
      '$browserPattern = "^(msedge|chrome|firefox|brave|opera|browser)$";',
      '$foreground = [HdJoinWin32]::GetForegroundWindow();',
      '$fgPid = 0;',
      '[void][HdJoinWin32]::GetWindowThreadProcessId($foreground, [ref]$fgPid);',
      '$p = $null;',
      'if ($fgPid -gt 0) {',
      '  $fgProc = Get-Process -Id $fgPid -ErrorAction SilentlyContinue;',
      '  if ($fgProc -and $fgProc.MainWindowHandle -ne 0 -and ($fgProc.ProcessName -match $browserPattern)) { $p = $fgProc }',
      '}',
      'if (-not $p) {',
      '  $procs = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and ($_.ProcessName -match $browserPattern) -and ($_.MainWindowTitle -match "Zalo|zalo|Test|Nhóm") } | Sort-Object StartTime -Descending;',
      '  if ($procs -and $procs.Count -gt 0) { $p = $procs[0] }',
      '}',
      'if (-not $p) {',
      '  $procs = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and ($_.ProcessName -match $browserPattern) } | Sort-Object StartTime -Descending;',
      '  if ($procs -and $procs.Count -gt 0) { $p = $procs[0] }',
      '}',
      'if (-not $p) { Write-Output "skip:no-browser"; exit 0 }',
      '[void][HdJoinWin32]::ShowWindowAsync($p.MainWindowHandle, 9);',
      'Start-Sleep -Milliseconds 350;',
      '[void][HdJoinWin32]::SetForegroundWindow($p.MainWindowHandle);',
      'Start-Sleep -Milliseconds 900;',
      '$rect = New-Object HdJoinRect;',
      'if (-not [HdJoinWin32]::GetWindowRect($p.MainWindowHandle, [ref]$rect)) { Write-Output "skip:no-window-rect"; exit 0 }',
      '$width = [Math]::Max(1, $rect.Right - $rect.Left);',
      '$height = [Math]::Max(1, $rect.Bottom - $rect.Top);',
      '$invokedByAutomation = $false;',
      'try {',
      '  $root = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle);',
      '  $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition);',
      '  foreach ($el in $all) {',
      '    $name = "";',
      '    try { $name = [string]$el.Current.Name } catch {}',
      '    if ($name -and (($name -like "*Tham*gia*") -or ($name -like "*Join*group*") -or ($name -like "*Open*Zalo*") -or ($name -like "*Mo*Zalo*"))) {',
      '      try {',
      '        $pattern = $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern);',
      '        $pattern.Invoke();',
      '        $invokedByAutomation = $true;',
      '        Start-Sleep -Milliseconds 1200;',
      '        break;',
      '      } catch {',
      '        try {',
      '          $box = $el.Current.BoundingRectangle;',
      '          if ($box.Width -gt 0 -and $box.Height -gt 0) {',
      '            [void][HdJoinWin32]::SetCursorPos([int]($box.Left + ($box.Width / 2)), [int]($box.Top + ($box.Height / 2)));',
      '            Start-Sleep -Milliseconds 160;',
      '            [HdJoinWin32]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero);',
      '            Start-Sleep -Milliseconds 70;',
      '            [HdJoinWin32]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero);',
      '            $invokedByAutomation = $true;',
      '            Start-Sleep -Milliseconds 1200;',
      '            break;',
      '          }',
      '        } catch {}',
      '      }',
      '    }',
      '  }',
      '} catch {}',
      'function Click-At($x, $y) {',
      '  [void][HdJoinWin32]::SetCursorPos([int]$x, [int]$y);',
      '  Start-Sleep -Milliseconds 160;',
      '  [HdJoinWin32]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero);',
      '  Start-Sleep -Milliseconds 70;',
      '  [HdJoinWin32]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero);',
      '}',
      '$points = @(',
      '  @([int]($rect.Left + ($width * 0.31)), [int]($rect.Top + ($height * 0.39))),',
      '  @([int]($rect.Left + ($width * 0.34)), [int]($rect.Top + ($height * 0.39))),',
      '  @([int]($rect.Left + ($width * 0.28)), [int]($rect.Top + ($height * 0.39))),',
      '  @([int]($rect.Left + ($width * 0.31)), [int]($rect.Top + ($height * 0.43))),',
      '  @([int]($rect.Left + ($width * 0.34)), [int]($rect.Top + ($height * 0.43))),',
      '  @([int]($rect.Left + ($width * 0.28)), [int]($rect.Top + ($height * 0.43))),',
      '  @([int]($rect.Left + ($width * 0.36)), [int]($rect.Top + ($height * 0.39))),',
      '  @([int]($rect.Left + ($width * 0.36)), [int]($rect.Top + ($height * 0.43)))',
      ');',
      'if (-not $invokedByAutomation) { foreach ($pt in $points) { Click-At $pt[0] $pt[1]; Start-Sleep -Milliseconds 650; } }',
      'try { [System.Windows.Forms.SendKeys]::SendWait("{ENTER}") } catch {}',
      'Start-Sleep -Milliseconds 900;',
      'Write-Output ("clicked:" + $p.ProcessName + " - " + $p.MainWindowTitle + " automation=" + $invokedByAutomation);'
    ].join(' ');

    try {
      child = spawn('powershell.exe', [
        '-NoProfile',
        '-STA',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        command
      ], { windowsHide: true });
    } catch (error) {
      finish({ attempted: false, reason: error?.message || 'spawn-failed' });
      return;
    }

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => finish({ attempted: false, reason: error?.message || 'powershell-error' }));
    child.on('close', (code) => {
      finish({
        attempted: code === 0 && /^clicked:/i.test(stdout.trim()),
        detail: stdout.trim(),
        error: code === 0 ? '' : stderr.trim()
      });
    });
  });
}

async function openWithWindowsShell(targetUrl) {
  const target = `${targetUrl || ''}`.trim();
  if (!target) return null;
  await shell.openExternal(target);
  await sleep(1400);
  const externalPrompt = await confirmExternalOpenPromptIfBrowser();
  await sleep(externalPrompt?.attempted ? 4200 : 3000);
  let joinPrompt = null;
  if (/^https?:\/\/(?:[^/]+\.)?zalo\.me\/g\//i.test(target)) {
    joinPrompt = await clickZaloJoinGroupButtonIfShown();
    await sleep(joinPrompt?.attempted ? 1800 : 700);
    const externalPromptAfterJoin = await confirmExternalOpenPromptIfBrowser(5000);
    joinPrompt = { ...(joinPrompt || {}), externalPromptAfterJoin };
    await sleep(externalPromptAfterJoin?.attempted ? 4200 : 1600);
  }
  return { openedUrl: target, openMode: 'shell-open-external', externalPrompt, joinPrompt };
}

async function openZaloLinkCandidates(openCandidates = []) {
  const candidates = (openCandidates || []).filter(Boolean);
  const protocolCandidates = candidates.filter(candidate => /^zalo:\/\//i.test(candidate));
  const webCandidates = candidates.filter(candidate => /^https?:\/\//i.test(candidate));
  const attempts = [];

  const tryShell = async (candidate, mode) => {
    if (!candidate) return null;
    try {
      const result = await openWithWindowsShell(candidate);
      attempts.push({ mode, candidate, ok: true });
      return { ...result, openMode: mode, openAttempts: attempts };
    } catch (error) {
      attempts.push({
        mode,
        candidate,
        ok: false,
        error: error?.message || `${error || ''}`
      });
      return null;
    }
  };

  // Opening Zalo.exe directly with URL arguments is not reliable on all Zalo PC
  // builds: several versions only focus the latest chat, causing messages to be
  // sent to the wrong group. Always open the exact saved group link through the
  // Windows URL handler first. If that cannot open the group, fail instead of
  // falling back to the latest active Zalo conversation.
  for (const candidate of webCandidates) {
    const result = await tryShell(candidate, 'web-link-shell-exact');
    if (result?.openedUrl) return result;
  }
  for (const candidate of protocolCandidates) {
    const result = await tryShell(candidate, 'zalo-protocol-shell-exact');
    if (result?.openedUrl) return result;
  }

  throw new Error(`Khong mo duoc nhom Zalo bang Zalo PC. Kiem tra link nhom, dang nhap Zalo PC va thu lai. Attempts: ${JSON.stringify(attempts).slice(0, 900)}`);
}

async function openZaloLinkFallbackCandidates(openCandidates = [], skippedUrl = '') {
  const candidates = (openCandidates || []).filter(Boolean);
  const protocolCandidates = candidates.filter(candidate => /^zalo:\/\//i.test(candidate));
  const webCandidates = candidates.filter(candidate => /^https?:\/\//i.test(candidate));
  const skipped = `${skippedUrl || ''}`.trim();
  const attempts = [];

  const tryShell = async (candidate) => {
    if (!candidate || candidate === skipped) return null;
    try {
      const result = await openWithWindowsShell(candidate);
      attempts.push({ mode: result.openMode, candidate, ok: true });
      return { ...result, openAttempts: attempts };
    } catch (error) {
      attempts.push({
        mode: 'shell-open-external',
        candidate,
        ok: false,
        error: error?.message || `${error || ''}`
      });
      return null;
    }
  };

  for (const candidate of webCandidates) {
    const result = await tryShell(candidate);
    if (result?.openedUrl) return result;
  }
  for (const candidate of protocolCandidates) {
    const result = await tryShell(candidate);
    if (result?.openedUrl) return result;
  }

  throw new Error(`Khong mo duoc nhom Zalo bang fallback. Attempts: ${JSON.stringify(attempts).slice(0, 900)}`);
}

function getMachineInfoFilePath() {
  return path.join(app.getPath('userData'), 'hd-machine.json');
}

function getOrCreateMachineInfo() {
  if (cachedMachineInfo?.machineId) return cachedMachineInfo;

  const filePath = getMachineInfoFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (parsed?.machineId) {
        cachedMachineInfo = {
          machineId: parsed.machineId,
          machineName: parsed.machineName || os.hostname(),
          platform: process.platform
        };
        return cachedMachineInfo;
      }
    }
  } catch (error) {
    // If the saved ID is unreadable, create a fresh local ID instead of blocking the app.
  }

  cachedMachineInfo = {
    machineId: `pc_${os.hostname()}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
    machineName: os.hostname(),
    platform: process.platform
  };

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(cachedMachineInfo, null, 2), 'utf8');
  } catch (error) {
    // Machine ID still works in-memory for this session.
  }

  return cachedMachineInfo;
}

function probePowerShell(timeoutMs = 2500) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ available: false, reason: 'PowerShell automation chi dung cho Windows.' });
      return;
    }

    let finished = false;
    let child = null;
    const finish = (payload) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      resolve(payload);
    };
    const timeout = setTimeout(() => {
      try {
        if (child && !child.killed) child.kill();
      } catch (error) {
        // Best-effort cleanup only.
      }
      finish({ available: false, reason: 'PowerShell khong phan hoi kip thoi.' });
    }, Math.max(1000, Number(timeoutMs) || 2500));

    try {
      child = spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        '$PSVersionTable.PSVersion.ToString()'
      ], { windowsHide: true });
    } catch (error) {
      finish({ available: false, reason: error?.message || 'Khong mo duoc PowerShell.' });
      return;
    }

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => finish({ available: false, reason: error?.message || 'PowerShell bi chan.' }));
    child.on('close', (code) => {
      finish(code === 0
        ? { available: true, version: stdout.trim() }
        : { available: false, reason: stderr.trim() || `PowerShell exited ${code}` });
    });
  });
}

async function buildPcPermissionReport() {
  const machine = getOrCreateMachineInfo();
  const isWindows = process.platform === 'win32';
  const userDataPath = app.getPath('userData');
  const zaloExe = getZaloExecutableCandidates().find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch (error) {
      return false;
    }
  }) || '';
  const powerShell = await probePowerShell();
  let fileAccess = { ok: false, detail: '' };

  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    const testFile = path.join(userDataPath, `hd-permission-${Date.now()}.tmp`);
    fs.writeFileSync(testFile, 'ok', 'utf8');
    fs.unlinkSync(testFile);
    fileAccess = { ok: true, detail: userDataPath };
  } catch (error) {
    fileAccess = { ok: false, detail: error?.message || 'Khong ghi duoc file tam.' };
  }

  const clipboardFormats = (() => {
    try {
      return clipboard.availableFormats();
    } catch (error) {
      return [];
    }
  })();

  const permissions = [
    {
      id: 'open_external_apps',
      label: 'Mo ung dung/link ngoai',
      ok: true,
      detail: 'Dung de mo link nhom Zalo hoac trinh duyet.'
    },
    {
      id: 'zalo_pc',
      label: 'Zalo PC',
      ok: Boolean(zaloExe),
      detail: zaloExe || 'Chua tim thay Zalo.exe trong cac duong dan mac dinh.'
    },
    {
      id: 'clipboard',
      label: 'Clipboard',
      ok: true,
      detail: `Doc/ghi clipboard de dan tin va QR. Formats: ${clipboardFormats.join(', ') || 'none'}`
    },
    {
      id: 'keyboard_automation',
      label: 'Tu dong dan/gui phim',
      ok: Boolean(isWindows && powerShell.available),
      detail: powerShell.available
        ? `PowerShell ${powerShell.version || ''}`.trim()
        : (powerShell.reason || 'Can PowerShell de gui Ctrl+V/Enter vao Zalo PC.')
    },
    {
      id: 'temp_file_access',
      label: 'Luu file tam',
      ok: fileAccess.ok,
      detail: fileAccess.detail
    },
    {
      id: 'desktop_notifications',
      label: 'Thong bao desktop',
      ok: Boolean(Notification?.isSupported?.()),
      detail: Notification?.isSupported?.() ? 'Electron ho tro thong bao desktop.' : 'May/chinh sach he dieu hanh co the chan thong bao.'
    }
  ];

  return {
    success: true,
    checkedAt: new Date().toISOString(),
    machine,
    platform: process.platform,
    isWindows,
    appPath: app.getAppPath(),
    userDataPath,
    canUseZaloAutomation: Boolean(isWindows && zaloExe && powerShell.available && fileAccess.ok),
    permissions,
    recommendations: permissions
      .filter((item) => !item.ok)
      .map((item) => {
        if (item.id === 'zalo_pc') return 'Cai va dang nhap Zalo PC, sau do mo lai HD Manager.';
        if (item.id === 'keyboard_automation') return 'Cho phep PowerShell/Windows automation, tat che do chan script neu co.';
        if (item.id === 'temp_file_access') return 'Cho phep HD Manager ghi du lieu trong thu muc ung dung.';
        return `Kiem tra quyen: ${item.label}`;
      })
  };
}

function runWindowsSendKeys(timeoutMs = 16000, options = {}) {
  return new Promise((resolve, reject) => {
    let finished = false;
    let child = null;
    const finish = (handler, payload) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      handler(payload);
    };
    const timeout = setTimeout(() => {
      try {
        if (child && !child.killed) child.kill();
      } catch (error) {
        // Best-effort cleanup only.
      }
      finish(reject, new Error('Zalo PC khong phan hoi khi dan/gui tin. Hay kiem tra Zalo PC da mo dung nhom, khong bi khoa man hinh va dang o trang thai san sang nhap tin.'));
    }, Math.max(6000, Number(timeoutMs) || 16000));

    const expectedGroupName = `${options.expectedGroupName || ''}`.trim();
    const expectedGroupBase64 = Buffer.from(expectedGroupName, 'utf8').toString('base64');
    const command = [
      "$ErrorActionPreference = 'Stop';",
      'Add-Type -AssemblyName System.Windows.Forms;',
      'Add-Type -AssemblyName UIAutomationClient;',
      'Add-Type -AssemblyName UIAutomationTypes;',
      `$expectedGroupName = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${expectedGroupBase64}'));`,
      "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public struct HdRect { public int Left; public int Top; public int Right; public int Bottom; } public class HdWin32 { [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd); [DllImport(\"user32.dll\")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow); [DllImport(\"user32.dll\")] public static extern bool GetWindowRect(IntPtr hWnd, out HdRect rect); [DllImport(\"user32.dll\")] public static extern bool SetCursorPos(int X, int Y); [DllImport(\"user32.dll\")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo); [DllImport(\"user32.dll\")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo); }';",
      '$focused = $false;',
      '$focusedName = "";',
      '$focusedHandle = [IntPtr]::Zero;',
      'function Focus-WindowByPattern($pattern) {',
      '  $procs = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and (($_.ProcessName -match $pattern) -or ($_.MainWindowTitle -match $pattern)) } | Sort-Object StartTime -Descending;',
      '  foreach ($p in $procs) {',
      '    [void][HdWin32]::ShowWindowAsync($p.MainWindowHandle, 9);',
      '    Start-Sleep -Milliseconds 350;',
      '    if ([HdWin32]::SetForegroundWindow($p.MainWindowHandle)) {',
      '      $script:focused = $true;',
      '      $script:focusedName = "$($p.ProcessName) - $($p.MainWindowTitle)";',
      '      $script:focusedHandle = $p.MainWindowHandle;',
      '      return $true;',
      '    }',
      '  }',
      '  return $false;',
      '}',
      'function Focus-ZaloPc {',
      '  $procs = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and ($_.ProcessName -match "^Zalo$") } | Sort-Object StartTime -Descending;',
      '  foreach ($p in $procs) {',
      '    [void][HdWin32]::ShowWindowAsync($p.MainWindowHandle, 9);',
      '    Start-Sleep -Milliseconds 350;',
      '    if ([HdWin32]::SetForegroundWindow($p.MainWindowHandle)) {',
      '      $script:focused = $true;',
      '      $script:focusedName = "$($p.ProcessName) - $($p.MainWindowTitle)";',
      '      $script:focusedHandle = $p.MainWindowHandle;',
      '      return $true;',
      '    }',
      '  }',
      '  return $false;',
      '}',
      'Focus-ZaloPc | Out-Null;',
      '$ws = New-Object -ComObject WScript.Shell;',
      "if (-not $focused) { foreach ($target in @('Zalo','Zalo PC')) { if ($ws.AppActivate($target)) { $focused = $true; $focusedName = $target; Start-Sleep -Milliseconds 900; break } } }",
      "if (-not $focused) { throw 'Khong tim thay cua so Zalo PC. Hay mo Zalo PC, dang nhap va thu lai.' }",
      'Start-Sleep -Milliseconds 1300;',
      'function Normalize-Text($value) {',
      '  $text = [string]($value -as [string]);',
      '  return (($text.ToLowerInvariant() -replace "\\s+", " ") -replace "[\\u200B-\\u200D\\uFEFF]", "").Trim();',
      '}',
      '$expectedNorm = Normalize-Text $expectedGroupName;',
      '$zaloUiText = $focusedName;',
      'if ($focusedHandle -ne [IntPtr]::Zero) {',
      '  try {',
      '    $root = [System.Windows.Automation.AutomationElement]::FromHandle($focusedHandle);',
      '    $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition);',
      '    $names = New-Object System.Collections.Generic.List[string];',
      '    foreach ($el in $all) {',
      '      try {',
      '        $name = [string]$el.Current.Name;',
      '        if ($name -and $name.Length -lt 160) { [void]$names.Add($name) }',
      '      } catch {}',
      '      if ($names.Count -ge 80) { break }',
      '    }',
      '    if ($names.Count -gt 0) { $zaloUiText = $zaloUiText + " " + ([string]::Join(" ", $names.ToArray())) }',
      '  } catch {}',
      '}',
      'if ($expectedNorm) {',
      '  $haystack = Normalize-Text $zaloUiText;',
      '  $tokens = @($expectedNorm -split "[\\s\\-_\\.]+") | Where-Object { $_.Length -ge 2 };',
      '  $matchedTokens = 0;',
      '  foreach ($token in $tokens) { if ($haystack.Contains($token)) { $matchedTokens++ } }',
      '  $enoughTokens = ($tokens.Count -eq 0) -or ($matchedTokens -ge [Math]::Min(2, $tokens.Count));',
      '  if ((-not $haystack.Contains($expectedNorm)) -and (-not $enoughTokens)) {',
      '    throw ("Zalo PC chua mo dung nhom. Can nhom: " + $expectedGroupName + ". Cua so hien tai: " + $focusedName);',
      '  }',
      '}',
      '$rect = New-Object HdRect;',
      'function Click-At($x, $y) {',
      '  [void][HdWin32]::SetCursorPos([int]$x, [int]$y);',
      '  Start-Sleep -Milliseconds 160;',
      '  [HdWin32]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero);',
      '  Start-Sleep -Milliseconds 70;',
      '  [HdWin32]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero);',
      '}',
      'function Press-Key($vk) {',
      '  [HdWin32]::keybd_event([byte]$vk, 0, 0, [UIntPtr]::Zero);',
      '  Start-Sleep -Milliseconds 80;',
      '  [HdWin32]::keybd_event([byte]$vk, 0, 0x0002, [UIntPtr]::Zero);',
      '}',
      'function Paste-ClipboardText() {',
      '  try { [System.Windows.Forms.SendKeys]::SendWait("^v"); return $true } catch { return $false }',
      '}',
      'if ($focusedHandle -ne [IntPtr]::Zero -and [HdWin32]::GetWindowRect($focusedHandle, [ref]$rect)) {',
      '  $width = [Math]::Max(1, $rect.Right - $rect.Left);',
      '  $inputX = [int]($rect.Left + ($width * 0.56));',
      '  foreach ($inputY in @([int]($rect.Bottom - 92), [int]($rect.Bottom - 70), [int]($rect.Bottom - 50))) {',
      '    Click-At $inputX $inputY;',
      '    Start-Sleep -Milliseconds 240;',
      '  }',
      '}',
      'if (-not (Paste-ClipboardText)) { throw "Khong the dan noi dung vao Zalo PC bang Ctrl+V." }',
      'Start-Sleep -Milliseconds 1300;',
      'try { [System.Windows.Forms.SendKeys]::SendWait("{ENTER}") } catch { Press-Key 0x0D }',
      'Start-Sleep -Milliseconds 1000;',
      'if ($focusedHandle -ne [IntPtr]::Zero -and [HdWin32]::GetWindowRect($focusedHandle, [ref]$rect)) {',
      '  $sendX = [int]($rect.Right - 54);',
      '  $sendY = [int]($rect.Bottom - 74);',
      '  Click-At $sendX $sendY;',
      '  Start-Sleep -Milliseconds 450;',
      '}',
      'Write-Output ($focusedName + " expectedGroup=" + $expectedGroupName);'
    ].join(' ');

    child = spawn('powershell.exe', [
      '-NoProfile',
      '-STA',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      command
    ], {
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => finish(reject, error));
    child.on('close', (code) => {
      if (code === 0) {
        finish(resolve, { focusedWindow: stdout.trim() });
      } else {
        finish(reject, new Error(stderr.trim() || `PowerShell SendKeys exited with code ${code}`));
      }
    });
  });
}

function registerDesktopIpcHandlers() {
  ipcMain.handle('hd-desktop:get-machine-id', async () => getOrCreateMachineInfo());

  ipcMain.handle('hd-desktop:check-pc-permissions', async () => buildPcPermissionReport());

  ipcMain.handle('hd-desktop:open-external', async (_event, url) => {
    const finalUrl = `${url || ''}`.trim();
    if (!finalUrl) throw new Error('Thiếu đường dẫn cần mở.');
    await shell.openExternal(finalUrl);
    return { success: true };
  });

  ipcMain.handle('hd-desktop:read-clipboard-text', async () => ({
    success: true,
    text: clipboard.readText() || '',
    html: clipboard.readHTML() || '',
    rtf: clipboard.readRTF() || '',
    formats: clipboard.availableFormats()
  }));

  ipcMain.handle('hd-desktop:write-clipboard-text', async (_event, text = '') => {
    clipboard.writeText(`${text || ''}`);
    return { success: true };
  });

  ipcMain.handle('hd-desktop:send-zalo-message', async (_event, payload = {}) => {
    const zaloGroupLink = `${payload.zaloGroupLink || ''}`.trim();
    const messageText = `${payload.messageText || payload.message || ''}`.trim();
    const qrImageSource = `${payload.qrImageUrl || payload.paymentQrImageUrl || payload.paymentQrUrl || payload.qrCode || payload.checkoutUrl || ''}`.trim();
    const openDelayMs = Number(payload.openDelayMs) > 0 ? Number(payload.openDelayMs) : 12000;
    const sendTimeoutMs = Number(payload.sendTimeoutMs) > 0 ? Number(payload.sendTimeoutMs) : 16000;
    const openCandidates = buildZaloOpenCandidates(zaloGroupLink);
    let qrImagePayload = null;
    let qrImageError = '';

    if (!zaloGroupLink) throw new Error('Thiếu link nhóm Zalo của khách.');
    if (!messageText) throw new Error('Thiếu nội dung tin nhắn Zalo.');
    if (qrImageSource) {
      try {
        qrImagePayload = await loadNativeImageFromSource(qrImageSource);
      } catch (error) {
        qrImageError = error?.message || `${error || ''}`;
      }
    }
    const openResult = process.platform === 'win32'
      ? await openZaloLinkCandidates(openCandidates)
      : await (async () => {
        const webLink = openCandidates.find(candidate => /^https?:\/\//i.test(candidate)) || openCandidates[0];
        if (!webLink) throw new Error('Khong mo duoc link nhom Zalo.');
        await shell.openExternal(webLink);
        return {
          openedUrl: webLink,
          openMode: 'shell-open-external',
          openAttempts: [{ mode: 'shell-open-external', candidate: webLink, ok: true }]
        };
      })();
    const expectedGroupName = `${payload.zaloGroupName || payload.groupName || extractZaloGroupTitleFromOpenResult(openResult) || ''}`.trim();

    if (process.platform === 'win32') {
      const sendTextAfterOpen = async (currentOpenResult, delayMs) => {
        await sleep(delayMs);
        clipboard.writeText(messageText);
        await sleep(120);
        const copiedText = clipboard.readText();
        if (copiedText !== messageText) {
          throw new Error('Khong ghi duoc noi dung vao clipboard de gui Zalo.');
        }
        await sleep(250);
        const currentExpectedGroupName = `${payload.zaloGroupName || payload.groupName || extractZaloGroupTitleFromOpenResult(currentOpenResult) || expectedGroupName || ''}`.trim();
        const sendResult = await runWindowsSendKeys(sendTimeoutMs, { expectedGroupName: currentExpectedGroupName });
        return { ...currentOpenResult, ...sendResult };
      };

      let sendResult = null;
      try {
        sendResult = await sendTextAfterOpen(openResult, openDelayMs);
      } catch (firstError) {
        const fallbackOpenResult = await openZaloLinkFallbackCandidates(openCandidates, openResult?.openedUrl || '');
        sendResult = await sendTextAfterOpen(fallbackOpenResult, Math.max(5000, Math.floor(openDelayMs / 2)));
        sendResult.retryAfterError = firstError?.message || `${firstError || ''}`;
        sendResult.primaryOpenResult = openResult;
      }
      let qrImageResult = null;
      if (qrImagePayload?.image) {
        try {
          clipboard.writeImage(qrImagePayload.image);
          await sleep(900);
          const imageSendResult = await runWindowsSendKeys(sendTimeoutMs, { expectedGroupName });
          qrImageResult = {
            sent: true,
            source: qrImagePayload.source,
            focusedWindow: imageSendResult.focusedWindow || ''
          };
        } catch (error) {
          qrImageResult = {
            sent: false,
            source: qrImagePayload.source,
            errorMessage: error?.message || `${error || ''}`
          };
        }
      }
      return { success: true, mode: 'windows-sendkeys', openCandidates, ...openResult, ...sendResult, qrImageResult, qrImageError };
    }

    clipboard.writeText(messageText);
    return {
      success: true,
      mode: 'clipboard-only',
      openCandidates,
      ...openResult,
      qrImageError,
      message: 'Đã mở link và sao chép nội dung. Thiết bị này cần dán/gửi thủ công.'
    };
  });
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f4f6f8',
    title: 'HD Manager',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindowRef = mainWindow;

  Menu.setApplicationMenu(null);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url).catch(() => {});
    }
  });

  const indexFile = getIndexFilePath();
  if (fs.existsSync(indexFile)) {
    mainWindow.loadFile(indexFile).catch((error) => {
      mainWindow.loadURL(`data:text/html,${encodeURIComponent(`<h2>Không thể mở HD Manager</h2><p>${error.message}</p>`)}`);
    });
  } else {
    mainWindow.loadURL(`data:text/html,${encodeURIComponent('<h2>Chưa có bản build desktop</h2><p>Hãy chạy lệnh build trước khi mở ứng dụng.</p>')}`);
  }

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(() => {
  registerDesktopIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
