import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CHAT_LIST_TABS,
  CHAT_SEARCH_TABS,
  filterChatConversations,
  getChatCategory,
  getChatSearchResult,
  getSearchHighlightParts,
  normalizeChatSearch,
} from '../src/features/messaging/messagingUiModel.js';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/features/messaging/MessagingUi.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/features/messaging/messaging.css', import.meta.url), 'utf8');
const start = app.indexOf('function MessageCenterView(');
const end = app.indexOf('\nfunction NavButton(', start);
assert(start >= 0 && end > start, 'Messaging workspace must remain discoverable.');
const center = app.slice(start, end);

const comparatorBody = center.match(/const sortConversationsByPriority = \(a, b\) => \{([\s\S]*?)\n  \};/)[1];
const readWatermarks = new Map();
const compare = new Function('getConversationUnreadCount', 'getConversationActivityAt', `return (a, b) => {${comparatorBody}}`)(
  item => (readWatermarks.get(item.id) || 0) >= item.activity ? 0 : item.unreadCount,
  item => item.activity,
);
const threads = [
  { id: 'read-new', activity: 400, unreadCount: 0 },
  { id: 'unread-old', activity: 100, unreadCount: 5 },
  { id: 'read-old', activity: 50, unreadCount: 0 },
  { id: 'unread-new', activity: 200, unreadCount: 1 },
];
const sortedIds = () => [...threads].sort(compare).map(item => item.id);
assert.deepEqual(sortedIds(), ['unread-new', 'unread-old', 'read-new', 'read-old']);
readWatermarks.set('unread-new', 200);
assert.deepEqual(sortedIds(), ['unread-old', 'read-new', 'unread-new', 'read-old']);
threads[3].activity = 500;
assert.deepEqual(sortedIds(), ['unread-new', 'unread-old', 'read-new', 'read-old']);

assert.deepEqual(CHAT_LIST_TABS.map((tab) => tab.label), ['Tất cả', 'Khách hàng', 'Nhóm', 'Đội ngũ']);
assert.deepEqual(CHAT_SEARCH_TABS.map((tab) => tab.label), ['Tin nhắn', 'Người dùng', 'Nhóm', 'File']);
assert.equal(normalizeChatSearch('  Vịt Đồng Xoài  '), 'vit dong xoai');
assert.deepEqual(getSearchHighlightParts('Có 500 con vịt, giá 60k', 'vit'), [
  { text: 'Có 500 con ', highlighted: false },
  { text: 'vịt', highlighted: true },
  { text: ', giá 60k', highlighted: false },
]);

const conversations = [
  { id: 'customer', conversationKind: 'customer_support' },
  { id: 'team', type: 'internal' },
  { id: 'group', conversationKind: 'internal_group' },
  { id: 'company-feedback', type: 'support' },
  { id: 'customer-feedback', type: 'support', customerId: 'customer-1' },
  { id: 'customer-notice', type: 'notice', sourceItem: { customerId: 'customer-1' } },
  { id: 'group-notice', type: 'notice', sourceItem: { sourceNotification: { groupId: 'group-1' } } },
  { id: 'general-notice', type: 'notice', sourceItem: { title: 'Thông báo hệ thống' } },
];
assert.equal(getChatCategory(conversations[0]), 'customer');
assert.equal(getChatCategory(conversations[1]), 'team');
assert.equal(getChatCategory(conversations[2]), 'group');
assert.deepEqual(conversations.map((item) => getChatCategory(item)), [
  'customer', 'team', 'group', 'team', 'customer', 'customer', 'group', 'other'
]);
assert.deepEqual(filterChatConversations(conversations, 'all').map((item) => item.id), conversations.map((item) => item.id));
assert.deepEqual(filterChatConversations(conversations, 'customer').map((item) => item.id), ['customer', 'customer-feedback', 'customer-notice']);
assert.deepEqual(filterChatConversations(conversations, 'group').map((item) => item.id), ['group', 'group-notice']);
assert.deepEqual(filterChatConversations(conversations, 'team').map((item) => item.id), ['team', 'company-feedback']);
assert.match(center, /\.filter\(\(\[type\]\) => visibleMessageTypes\.includes\(type\)\)/, 'All messages must include authorized notices.');
assert.match(app, /canSendSupportMessages=\{canRoleAction\('messages', 'send_support_messages'\)\}/, 'Company feedback must respect the send permission.');
assert.match(center, /conversation\.id === 'support-hd-manager'/, 'Company feedback thread must remain reachable before its first message.');
assert.equal(getChatSearchResult({ messages: [{ text: 'giá gà' }, { text: '500 con vịt' }] }, 'vit').matchText, '500 con vịt');

for (const token of [
  'data-hd-module="messaging"', 'ChatSearchBar', 'ChatTabs', 'ConversationItem',
  'SearchResultItem', 'ConversationToolbar', 'MessageList', 'MessageComposer',
  'AttachmentPanel', 'OfflineBanner', 'handleChatListTouchStart',
  'handleChatListTouchEnd', 'canSendInSelectedConversation',
]) assert(center.includes(token), `Messaging workspace is missing ${token}.`);

assert.match(ui, /data-chat-item="true"/, 'Chat rows need a stable visual/test marker.');
assert.match(ui, /data-chat-attachment-panel="true"/, 'Attachment sheet must be in the conversation.');
assert.match(ui, /getSearchHighlightParts/, 'Search highlights must use the model.');
assert.match(css, /background: #fff;/, 'The workspace background must be white.');
assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/, 'Attachments need four columns.');
assert.doesNotMatch(center.slice(center.lastIndexOf('  return (')), /bg-gradient-to-r/, 'Chat list must have no gradient app header.');

console.log('PASS Messaging redesign: list and search tabs, filters, highlights, attachment sheet, state contracts.');
