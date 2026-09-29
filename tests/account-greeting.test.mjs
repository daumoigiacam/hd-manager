import assert from 'node:assert/strict';
import { getAccountGreeting } from '../src/utils/accountGreeting.js';

for (const [hour, minute, label] of [
  [0, 59, 'tối'], [1, 0, 'sáng'], [10, 59, 'sáng'],
  [11, 0, 'trưa'], [12, 59, 'trưa'], [13, 0, 'chiều'],
  [17, 59, 'chiều'], [18, 0, 'tối'], [23, 59, 'tối'],
]) {
  assert.equal(getAccountGreeting(new Date(2026, 8, 30, hour, minute)), `Chào buổi ${label}`);
}
console.log('PASS: greetings use local device hours at every period boundary.');
