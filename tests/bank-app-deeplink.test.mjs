import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildVietQrBankAppDeeplink,
  isMobileBankAppEnvironment,
  isVietQrBankAppSupported,
  launchBankPaymentAndCopyReference,
  resolveVietQrBankAppId,
  resolveVietQrReceivingBankCode
} from '../src/utils/bankAppDeeplink.js';

assert.equal(resolveVietQrBankAppId('BIDV'), 'bidv');
assert.equal(resolveVietQrBankAppId('VIB'), 'vib-2');
assert.equal(resolveVietQrBankAppId('STB'), '');
assert.equal(isVietQrBankAppSupported('VCB'), true);
assert.equal(isVietQrBankAppSupported('MSB'), false);
assert.equal(resolveVietQrReceivingBankCode('Sacombank'), 'stb');

const deeplink = buildVietQrBankAppDeeplink({
  selectedBankId: 'BIDV',
  receivingBankCode: 'STB',
  receivingAccountNumber: '0500 8647 0672',
  amount: 7807800,
  transferContent: 'HDP8D47E98221B5',
  receivingAccountName: 'HOANG VAN DUC',
  returnUrl: 'https://app.hdconnect.net/'
});
const parsed = new URL(deeplink);

assert.equal(parsed.origin, 'https://dl.vietqr.io');
assert.equal(parsed.pathname, '/pay');
assert.equal(parsed.searchParams.get('app'), 'bidv');
assert.equal(parsed.searchParams.get('ba'), '050086470672@stb');
assert.equal(parsed.searchParams.get('am'), '7807800');
assert.equal(parsed.searchParams.get('tn'), 'HDP8D47E98221B5');
assert.equal(parsed.searchParams.get('bn'), 'HOANG VAN DUC');
assert.equal(parsed.searchParams.get('url'), 'https://app.hdconnect.net/');

assert.equal(buildVietQrBankAppDeeplink({
  selectedBankId: 'STB',
  receivingAccountNumber: '123456'
}), '', 'An unverified app ID must not pretend that direct opening is supported.');
assert.equal(buildVietQrBankAppDeeplink({ selectedBankId: 'BIDV' }), '');
assert.equal(isMobileBankAppEnvironment('Mozilla/5.0 (Linux; Android 15)'), true);
assert.equal(isMobileBankAppEnvironment('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), false);

const invocationOrder = [];
const actionResult = await launchBankPaymentAndCopyReference({
  openPayment: () => {
    invocationOrder.push('open');
    return Promise.resolve(true);
  },
  copyReference: () => {
    invocationOrder.push('copy');
    return Promise.resolve(true);
  }
});
assert.deepEqual(invocationOrder, ['open', 'copy']);
assert.deepEqual(actionResult, { opened: true, copied: true });

const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
assert.doesNotMatch(appSource, /BANK_APP_OPEN_URLS|bidvsmartbanking:\/\//);
assert.match(appSource, /launchBankPaymentAndCopyReference/);
assert.match(appSource, /BANK_APP_OPEN_OPTIONS/);

console.log('bank app deeplink tests: PASS');
