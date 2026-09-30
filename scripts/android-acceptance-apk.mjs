import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const ACCEPTANCE_PACKAGE = 'com.hdmanager.app.acceptance';

export async function buildAcceptanceApk({ buildOutput, output, fixture, token }) {
  const assets = path.join(output, 'native-assets');
  await mkdir(assets, { recursive: true });
  await cp(buildOutput, path.join(assets, 'public'), { recursive: true });
  for (const file of ['capacitor.config.json', 'capacitor.plugins.json']) {
    const source = path.resolve('android/app/src/main/assets', file);
    if (file === 'capacitor.config.json') {
      const config = JSON.parse(await readFile(source, 'utf8'));
      assert.equal(config.server?.url, undefined, 'Acceptance APK must use bundled local assets');
      config.appId = ACCEPTANCE_PACKAGE;
      config.appName = 'HD Manager Acceptance';
      await writeFile(path.join(assets, file), JSON.stringify(config));
    } else await cp(source, path.join(assets, file));
  }
  // Generated fixture is included only in a separate, debug-only APK. No cloud
  // Firebase configuration, credential or business data enters this package.
  const init = `localStorage.removeItem('hd-manager-session-v2');window.__initial_auth_token=${JSON.stringify(token)};if(!sessionStorage.getItem('perf-seeded')){localStorage.setItem('hd-manager-local-db-v2-clean-preview',${JSON.stringify(JSON.stringify(fixture))});sessionStorage.setItem('perf-seeded','1');}`;
  await writeFile(path.join(assets, 'public', 'acceptance-init.js'), init);
  const indexPath = path.join(assets, 'public', 'index.html');
  const index = await readFile(indexPath, 'utf8');
  assert.ok(index.includes('<head>'));
  await writeFile(indexPath, index.replace('<head>', '<head><script src="/acceptance-init.js"></script>'));
  const javaHome = globalThis.process.env.JAVA_HOME || 'C:/Program Files/Android/Android Studio/jbr';
  const args = ['-Dfile.encoding=UTF-8', '-Dsun.jnu.encoding=UTF-8', '-classpath', 'gradle/wrapper/gradle-wrapper.jar',
    'org.gradle.wrapper.GradleWrapperMain', '--offline', '--no-daemon', 'assembleDebug',
    `-PHD_ACCEPTANCE_ASSETS=${path.relative(path.resolve('android/app'), assets)}`];
  const exitCode = await new Promise((resolve, reject) => {
    const process = spawn(path.join(javaHome, 'bin/java.exe'), args, {
      cwd: path.resolve('android'),
      env: { ...globalThis.process.env, JAVA_HOME: javaHome, GRADLE_USER_HOME: globalThis.process.env.GRADLE_USER_HOME || 'D:/HD-DEV/gradle' },
      stdio: 'inherit',
    });
    process.on('error', reject);
    process.on('exit', resolve);
  });
  assert.equal(exitCode, 0, 'Acceptance APK build failed');
  const apk = path.join(output, 'HD-Manager-Acceptance-debug.apk');
  await cp(path.resolve('android/app/build/outputs/apk/debug/app-debug.apk'), apk);
  return apk;
}
