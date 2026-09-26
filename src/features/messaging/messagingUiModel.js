export const CHAT_LIST_TABS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'customer', label: 'Khách hàng' },
  { id: 'team', label: 'Đội ngũ' },
  { id: 'group', label: 'Nhóm' }
];

export const CHAT_SEARCH_TABS = [
  { id: 'messages', label: 'Tin nhắn' },
  { id: 'people', label: 'Người dùng' },
  { id: 'groups', label: 'Nhóm' },
  { id: 'files', label: 'File' }
];

const foldChatSearch = (value = '') => `${value}`
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/gi, 'd')
  .toLocaleLowerCase('vi-VN');

export const normalizeChatSearch = (value = '') => foldChatSearch(value).trim();

export const getChatCategory = (conversation = {}) => {
  if (conversation.conversationKind === 'internal_group') return 'group';
  if (conversation.conversationKind === 'customer_support' || conversation.customerId) return 'customer';
  if (conversation.type === 'internal') return 'team';
  return 'other';
};

export const filterChatConversations = (conversations = [], tab = 'all') => (
  tab === 'all' ? conversations : conversations.filter((item) => getChatCategory(item) === tab)
);

export const getSearchHighlightParts = (text = '', keyword = '') => {
  const source = `${text}`;
  const needle = normalizeChatSearch(keyword);
  if (!needle) return [{ text: source, highlighted: false }];

  let normalized = '';
  const offsets = [];
  let offset = 0;
  for (const character of source) {
    const folded = foldChatSearch(character);
    for (const letter of folded) {
      normalized += letter;
      offsets.push({ start: offset, end: offset + character.length });
    }
    offset += character.length;
  }

  const parts = [];
  let cursor = 0;
  let searchFrom = 0;
  while (searchFrom < normalized.length) {
    const matchAt = normalized.indexOf(needle, searchFrom);
    if (matchAt < 0) break;
    const start = offsets[matchAt].start;
    const end = offsets[matchAt + needle.length - 1].end;
    if (start > cursor) parts.push({ text: source.slice(cursor, start), highlighted: false });
    parts.push({ text: source.slice(start, end), highlighted: true });
    cursor = end;
    searchFrom = matchAt + needle.length;
  }
  if (cursor < source.length) parts.push({ text: source.slice(cursor), highlighted: false });
  return parts.length ? parts : [{ text: source, highlighted: false }];
};

export const getChatSearchResult = (conversation, keyword) => {
  const messages = (conversation.messages || []).filter((message) => !message.isSystemIntro && !message.isFallback);
  const matchingMessage = [...messages].reverse().find((message) => normalizeChatSearch([
    message.text,
    message.attachmentLabel,
    message.attachmentText
  ].filter(Boolean).join(' ')).includes(normalizeChatSearch(keyword)));
  return {
    ...conversation,
    matchedMessage: matchingMessage || messages[messages.length - 1] || null,
    matchText: matchingMessage?.text || matchingMessage?.attachmentText || conversation.lastMessage || ''
  };
};
