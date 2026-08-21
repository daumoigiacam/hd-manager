import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const appSource = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
const capacitorConfig = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
const iconPath = path.join(root, 'android', 'app', 'src', 'main', 'res', 'drawable', 'ic_stat_hd_manager.xml');
const iconSource = fs.readFileSync(iconPath, 'utf8');

test('native notifications use the HD Manager small icon instead of the Android info fallback', () => {
  assert.match(appSource, /smallIcon:\s*['"]ic_stat_hd_manager['"]/);
  assert.match(appSource, /iconColor:\s*['"]#0B5ED7['"]/);
  assert.equal(capacitorConfig.plugins?.LocalNotifications?.smallIcon, 'ic_stat_hd_manager');
  assert.equal(capacitorConfig.plugins?.LocalNotifications?.iconColor, '#0B5ED7');
  assert.match(iconSource, /android:fillColor="#FFFFFFFF"/);
  assert.doesNotMatch(appSource, /smallIcon:\s*['"]ic_dialog_info['"]/);
});
