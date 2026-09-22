import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const start = app.indexOf('function MessageCenterView(');
const end = app.indexOf('\nfunction NavButton(', start);
assert(start >= 0 && end > start, 'MessageCenterView source must remain discoverable.');
const messageCenter = app.slice(start, end);

for (const requiredText of [
  'Tìm kiếm tin nhắn',
  'Ưu tiên',
  'Khác',
  'data-chat-list="true"',
  'data-chat-item="true"',
  'data-chat-list-refresh="true"',
  'handleChatListTouchStart',
  'handleChatListTouchEnd',
  'overscroll-y-contain',
  'isPriorityConversation',
  'isPinnedConversation',
  'Pin',
  'RefreshCw',
  'h-[50px] w-[50px]',
  '#F3F4F6',
  '#3B82F6',
  '#EF4444'
]) {
  assert(messageCenter.includes(requiredText), `Chat list is missing required contract: ${requiredText}`);
}

assert.match(messageCenter, /grid-cols-2[\s\S]*Ưu tiên[\s\S]*Khác/, 'Priority and other tabs must share one balanced row.');
assert.match(messageCenter, /placeholder="Tìm kiếm tin nhắn"[\s\S]*className="min-w-0 flex-1 bg-transparent/, 'Search must be a compact pill input under the header.');
assert.match(messageCenter, /unreadCount > 9 \? '9\+' : unreadCount/, 'Unread count badge must cap at 9+.');

console.log('PASS Messages chat list layout: search, tabs, priority split, refresh gesture, avatars and unread badges are wired.');
