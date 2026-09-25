import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const notificationCenterStart = app.indexOf('{showNotificationCenter && (');
const notificationCenterEnd = app.indexOf('{showFloatingQuickActionButton && (', notificationCenterStart);
assert(notificationCenterStart >= 0, 'Notification center must be rendered conditionally.');
assert(notificationCenterEnd > notificationCenterStart, 'Notification center must end before the floating action button.');
const notificationCenter = app.slice(notificationCenterStart, notificationCenterEnd);

assert.match(
  notificationCenter,
  /hd-dialog-header relative grid grid-cols-3 items-center/,
  'Notification label and filters must use three equal grid columns.'
);
assert.match(notificationCenter, />Th\u00f4ng b\u00e1o<\/p>/, 'Notification label must remain in the shared header row.');
assert.match(notificationCenter, />T\u1ea5t c\u1ea3<\/button>/, 'All filter must remain available.');
assert.match(notificationCenter, />Ch\u01b0a \u0111\u1ecdc<\/button>/, 'Unread filter must remain available.');
assert.match(
  notificationCenter,
  /hd-notification-filter col-span-2 grid grid-cols-2/,
  'Filter controls must fill the second and third equal header columns.'
);
assert.match(notificationCenter, /whitespace-nowrap/, 'Header labels must not wrap on narrow mobile screens.');
assert.match(notificationCenter, /absolute right-3 top-1\/2/, 'Close control must not consume a grid column.');
assert.doesNotMatch(notificationCenter, /Trung t\u00e2m th\u00f4ng b\u00e1o/, 'Legacy secondary notification title must not be rendered.');

console.log('Notification center layout tests passed.');
