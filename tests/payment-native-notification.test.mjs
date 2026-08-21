import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const appSource = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
const functionsSource = fs.readFileSync(path.join(root, 'functions', 'index.js'), 'utf8');

test('incoming SePay payments produce employee-visible native popup items', () => {
  assert.match(appSource, /\.filter\(\(payment\) => payment && !payment\.isArchived && isPayosPaymentRecord\(payment\)\)/);
  assert.match(appSource, /paymentId: payment\.id \|\| ''/);
  assert.match(appSource, /type: 'payment_received'/);
  assert.match(appSource, /if \(!isNativeRuntime\(\)\) return;/);
  assert.match(appSource, /newlyArrivedItems\.forEach\(\(\{ item \}\) =>/);
  assert.match(appSource, /showSystemNotificationForItem\(item\)/);
  assert.match(appSource, /LocalNotifications\.schedule\(/);
});

test('SePay reconciliation writes a company payment notification for the app listener', () => {
  assert.match(functionsSource, /notificationRef\.doc\(`\$\{providerKey\}_company_\$\{paymentId\}`\)/);
  assert.match(functionsSource, /recipientType: 'company'/);
  assert.match(functionsSource, /type: `\$\{providerKey\}_payment_confirmation`/);
  assert.match(functionsSource, /createdAt: now/);
});
