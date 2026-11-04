import test from 'node:test';
import assert from 'node:assert/strict';
import { appFunction } from './helpers/app-source-function.mjs';
import { getChatCategory, getChatSearchResult } from '../src/features/messaging/messagingUiModel.js';

test('message filters inspect only the information actually needed by that filter', () => {
  const row = { unread: 3, kind: 'customer' };
  const build = messageFilter => appFunction('matchesConversationFilter', {
    messageFilter,
    getConversationUnreadCount: item => item.unread,
    getChatCategory: item => item.kind,
    getConversationFilterText: () => { throw Error('Unneeded full message text scan'); },
  });
  assert.equal(build('all')(row), true);
  assert.equal(build('unread')(row), true); assert.equal(build('read')(row), false);
  assert.equal(build('customer')(row), true); assert.equal(build('unknown-legacy-filter')(row), true);
  for (const [messageFilter, text, expected] of [
    ['promotion', 'uu dai voucher', true], ['care', 'nhac no', true],
    ['dispatch', 'phieu xuat', true], ['care', 'sale', false],
  ]) assert.equal(appFunction('matchesConversationFilter', { messageFilter,
    getConversationFilterText: () => text,
    getConversationUnreadCount() { throw Error('Unused unread scan'); },
  })(row), expected);
});

test('empty message search performs no result scan; active search keeps full authorized matches', () => {
  const build = (searchKeyword, activeSearchTab, filteredConversations) => appFunction('searchResults', {
    searchKeyword, activeSearchTab, filteredConversations, deferredSearchKeyword: searchKeyword,
    getChatCategory, getChatSearchResult,
  }, { memoCallback: true })();
  assert.deepEqual(build('  ', 'messages', { filter() { throw Error('Closed search must be lazy'); } }), []);
  const rows = [
    { id: 'one', type: 'internal', messages: [{ text: 'Giá vịt' }] },
    { id: 'two', conversationKind: 'internal_group', messages: [{ text: 'Vịt', attachmentType: 'image' }] },
  ];
  for (const tab of ['messages', 'people', 'groups', 'files']) {
    const expected = rows.filter(conversation => {
      if (tab === 'people') return ['customer', 'team'].includes(getChatCategory(conversation));
      if (tab === 'groups') return getChatCategory(conversation) === 'group';
      if (tab === 'files') return conversation.messages.some(message => ['document', 'file', 'image', 'video'].includes(message.attachmentType) || message.attachmentImage);
      return true;
    }).map(conversation => getChatSearchResult(conversation, 'vit'));
    assert.deepEqual(build('vit', tab, rows), expected);
  }
});

test('cached chat formatters preserve same-day local time, same-year date and older Vietnam date', () => {
  const now = new Date('2026-11-01T05:00:00Z');
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
  const options = { timeZone: 'Asia/Ho_Chi_Minh' };
  const formats = [new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }), new Intl.DateTimeFormat('vi-VN', options)];
  const actual = appFunction('formatConversationListTime', { Date: FixedDate,
    chatListTimeFormatter: formats[0], chatListMonthDayFormatter: formats[1], vietnamDateFormatter: formats[2] });
  const legacy = value => {
    if (!value) return '';
    const parsed = new Date(value); if (Number.isNaN(parsed.getTime())) return '';
    if (parsed.getFullYear() === now.getFullYear() && parsed.getMonth() === now.getMonth() && parsed.getDate() === now.getDate()) {
      return parsed.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }
    return parsed.toLocaleDateString('vi-VN', parsed.getFullYear() === now.getFullYear() ? { day: '2-digit', month: '2-digit' } : options);
  };
  for (const value of [null, 0, '', 'invalid', now.getTime(), '2026-10-31T22:00:00Z', '2026-10-01T00:00:00Z', '2025-12-31T20:00:00Z', '2001-01-01']) {
    assert.equal(actual(value), legacy(value));
  }
});
