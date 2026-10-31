import assert from 'node:assert/strict';
import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export async function buildParallelAndroidRelease({buildOutput='dist',output,expectedCommit}) {
  assert.match(expectedCommit||'',/^[a-f0-9]{40}$/,'An exact validated source commit is required');
  for(const name of ['HD_RELEASE_STORE_FILE','HD_RELEASE_STORE_PASSWORD','HD_RELEASE_KEY_ALIAS','HD_RELEASE_KEY_PASSWORD']) {
    assert.ok(process.env[name],`Missing release signing configuration: ${name}`);
  }
  const directory=path.resolve(output),releaseRoot=path.resolve('release')+path.sep;
  assert.ok(directory.startsWith(releaseRoot),'Parallel release output must stay within release/');
  const version=JSON.parse(await readFile(path.join(buildOutput,'version.json'),'utf8'));
  assert.equal(version.buildId,expectedCommit,'Use web assets from the validated release');
  const index=await readFile(path.join(buildOutput,'index.html'),'utf8');
  assert.ok(!index.includes('acceptance-init.js')&&!index.includes('hd-preview-auth-v1'),'Preview/Acceptance injection is forbidden');
  const assets=path.join(directory,'parallel-native-assets');
  await mkdir(assets,{recursive:true});
  await cp(path.resolve(buildOutput),path.join(assets,'public'),{recursive:true});
  const config=JSON.parse(await readFile('android/app/src/main/assets/capacitor.config.json','utf8'));
  assert.equal(config.server?.url,undefined,'Release must load its local bundled assets');
  config.appId='com.hdmanager.app.next';config.appName='HD Manager Mới';
  await writeFile(path.join(assets,'capacitor.config.json'),JSON.stringify(config));
  await cp('android/app/src/main/assets/capacitor.plugins.json',path.join(assets,'capacitor.plugins.json'));
  const original=await readFile('android/app/src/main/AndroidManifest.xml','utf8');
  const manifest=path.join(directory,'parallel-AndroidManifest.xml');
  await writeFile(manifest,original.replace('android:label="@string/app_name"','android:label="HD Manager Mới"')
    .replace('android:label="@string/title_activity_main"','android:label="HD Manager Mới"'));
  const javaHome=process.env.JAVA_HOME||'C:/Program Files/Android/Android Studio/jbr';
  const args=['-Dfile.encoding=UTF-8','-Dsun.jnu.encoding=UTF-8','-classpath','gradle/wrapper/gradle-wrapper.jar',
    'org.gradle.wrapper.GradleWrapperMain','--offline','--no-daemon','assembleRelease',
    '-PHD_PARALLEL_RELEASE=true',`-PHD_PARALLEL_ASSETS=${path.relative(path.resolve('android/app'),assets)}`,
    `-PHD_PARALLEL_MANIFEST=${path.relative(path.resolve('android/app'),manifest)}`];
  const code=await new Promise((resolve,reject)=>{
    const child=spawn(path.join(javaHome,'bin/java.exe'),args,{cwd:path.resolve('android'),windowsHide:true,stdio:'inherit',
      env:{...process.env,JAVA_HOME:javaHome,GRADLE_USER_HOME:process.env.GRADLE_USER_HOME||'D:/HD-DEV/gradle'}});
    child.on('error',reject);child.on('exit',resolve);
  });
  assert.equal(code,0,'Signed parallel release build failed');
  const apk=path.join(directory,`HD-Manager-Moi-1.0.11-${expectedCommit.slice(0,8)}.apk`);
  await cp('android/app/build/outputs/apk/release/app-release.apk',apk);
  return apk;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])) {
  console.log(await buildParallelAndroidRelease({output:process.argv[2],expectedCommit:process.argv[3]}));
}
