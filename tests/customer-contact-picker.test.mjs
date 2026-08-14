import assert from 'node:assert/strict';
import {
  canPickCustomerContact,
  isWebContactPickerSupported,
  normalizePickedCustomerContact,
  pickWebCustomerContact,
} from '../src/utils/customerContactPicker.js';

const webContacts = {
  contacts: {
    select: async () => [{
      name: ['Nguyen Van A'],
      tel: ['0901 234 567'],
      address: [{ streetAddress: '12 Duong So 1', city: 'Thu Duc', region: 'Ho Chi Minh City' }],
    }],
  },
};

assert.equal(isWebContactPickerSupported(webContacts), true);
assert.equal(canPickCustomerContact({ platform: 'web', navigatorLike: webContacts }), true);
assert.equal(canPickCustomerContact({ platform: 'android', navigatorLike: {} }), true);
assert.equal(canPickCustomerContact({ platform: 'web', navigatorLike: {} }), false);

assert.deepEqual(
  normalizePickedCustomerContact({
    name: ['Nguyen Van A'],
    tel: ['0901 234 567'],
    addresses: [{ formattedAddress: '12 Duong So 1, Thu Duc' }],
  }),
  { name: 'Nguyen Van A', phone: '0901 234 567', address: '12 Duong So 1, Thu Duc' }
);

const picked = await pickWebCustomerContact(webContacts);
assert.deepEqual(picked, {
  ok: true,
  supported: true,
  cancelled: false,
  name: 'Nguyen Van A',
  phone: '0901 234 567',
  address: '12 Duong So 1, Thu Duc, Ho Chi Minh City',
  message: 'Đã lấy thông tin liên hệ từ danh bạ.',
});

const cancelled = await pickWebCustomerContact({
  contacts: {
    select: async () => {
      const error = new Error('cancelled');
      error.name = 'AbortError';
      throw error;
    },
  },
});
assert.equal(cancelled.cancelled, true);
assert.equal(cancelled.ok, false);

console.log('customer contact picker tests: PASS');
