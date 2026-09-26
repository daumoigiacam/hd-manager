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

assert.deepEqual(CHAT_LIST_TABS.map((tab) => tab.label), ['Tất cả', 'Khách hàng', 'Đội ngũ', 'Nhóm']);
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
];
assert.equal(getChatCategory(conversations[0]), 'customer');
assert.equal(getChatCategory(conversations[1]), 'team');
assert.equal(getChatCategory(conversations[2]), 'group');
assert.deepEqual(filterChatConversations(conversations, 'group').map((item) => item.id), ['group']);
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
