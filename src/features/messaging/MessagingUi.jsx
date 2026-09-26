import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Camera, CheckCheck, ChevronRight, Contact, FileText, Heart,
  Image as ImageIcon, MapPin, Mic, MoreVertical, Package, Pause, Phone, Pin,
  Play, Plus, Search, Send, Smile, ThumbsUp, Users, Video, WifiOff, X
} from 'lucide-react';
import { getSearchHighlightParts, getChatCategory } from './messagingUiModel.js';
import './messaging.css';

const formatTime = (value) => {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
};

export function ChatAvatar({ conversation = {}, size = 'regular' }) {
  const isGroup = getChatCategory(conversation) === 'group';
  const name = conversation.title || conversation.groupName || 'Chat';
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(-2).map((word) => word[0]).join('').toUpperCase();
  return (
    <span className={`hd-chat-avatar hd-chat-avatar--${size} ${isGroup ? 'hd-chat-avatar--group' : ''}`} aria-hidden="true">
      {conversation.avatarUrl ? <img src={conversation.avatarUrl} alt="" loading="lazy" /> : isGroup ? <Users size={24} /> : initials}
    </span>
  );
}

export function ChatSearchBar({ value, onChange, onClear, onCreate, placeholder, createEnabled = false, autoFocus = false }) {
  return (
    <div className="hd-chat-search-row">
      <label className="hd-chat-search-field">
        <Search size={20} aria-hidden="true" />
        <input
          data-hd-search-input="true"
          type="search"
          autoFocus={autoFocus}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        {value && <button type="button" className="hd-chat-search-clear" onClick={onClear} aria-label="Xóa tìm kiếm"><X size={17} /></button>}
      </label>
      {createEnabled && <button type="button" className="hd-chat-create" onClick={onCreate} aria-label="Tạo cuộc trò chuyện"><Plus size={23} /></button>}
    </div>
  );
}

export function ChatTabs({ items, value, onChange, label }) {
  return (
    <div className="hd-chat-tabs" role="tablist" aria-label={label}>
      {items.map((item) => <button
        key={item.id}
        type="button"
        role="tab"
        aria-selected={value === item.id}
        className={value === item.id ? 'is-active' : ''}
        onClick={() => onChange(item.id)}
      >{item.label}{item.badge > 0 && <span className="hd-chat-tab-badge">{item.badge > 9 ? '9+' : item.badge}</span>}</button>)}
    </div>
  );
}

export function ChatState({ state, title, onRetry, onStart }) {
  if (state === 'loading') return <div className="hd-chat-skeleton" aria-label="Đang tải tin nhắn">{[0, 1, 2, 3, 4].map((index) => <div className="hd-chat-skeleton-row" key={index}><span /><div><i /><i /></div></div>)}</div>;
  const isError = state === 'error';
  return <div className="hd-chat-state" role={isError ? 'alert' : 'status'}>
    <strong>{title || (isError ? 'Không thể tải tin nhắn' : 'Chưa có cuộc trò chuyện')}</strong>
    {(isError ? onRetry : onStart) && <button type="button" onClick={isError ? onRetry : onStart}>{isError ? 'Thử lại' : 'Bắt đầu trò chuyện'}</button>}
  </div>;
}

export function ConversationItem({ conversation, displayName, preview, timestamp, unreadCount = 0, pinned = false, onSelect }) {
  return <button type="button" className="hd-chat-conversation" data-chat-item="true" onClick={onSelect}>
    <ChatAvatar conversation={conversation} size="list" />
    <span className="hd-chat-conversation-body">
      <span className="hd-chat-conversation-top"><strong>{displayName}</strong><time>{timestamp}</time></span>
      <span className="hd-chat-conversation-bottom"><span className="hd-chat-preview">{preview}</span>{pinned && <Pin size={15} aria-label="Đã ghim" />}{unreadCount > 0 && <span className="hd-chat-unread" aria-label={`${unreadCount} tin chưa đọc`}>{unreadCount > 9 ? '9+' : unreadCount}</span>}</span>
    </span>
  </button>;
}

function Highlight({ text, keyword }) {
  return getSearchHighlightParts(text, keyword).map((part, index) => part.highlighted
    ? <mark key={index}>{part.text}</mark>
    : <React.Fragment key={index}>{part.text}</React.Fragment>);
}

export function SearchResultItem({ result, keyword, onSelect, timestamp }) {
  const thumbnail = result.matchedMessage?.attachmentImage || result.matchedMessage?.attachmentImages?.[0] || '';
  return <button type="button" className="hd-chat-search-result" onClick={onSelect}>
    <ChatAvatar conversation={result} size="list" />
    <span className="hd-chat-search-result-body"><strong><Highlight text={result.title || 'Cuộc trò chuyện'} keyword={keyword} /></strong><span><Highlight text={result.matchText || result.subtitle || ''} keyword={keyword} /></span></span>
    <span className="hd-chat-search-result-side"><time>{timestamp}</time>{thumbnail && <img src={thumbnail} alt="Ảnh đính kèm" loading="lazy" />}</span>
    <ChevronRight size={17} aria-hidden="true" />
  </button>;
}

export function ConversationToolbar({ conversation, onBack, onCall, onSearch, onMore, canCall = false }) {
  const isGroup = getChatCategory(conversation) === 'group';
  return <div className="hd-chat-toolbar">
    <button type="button" className="hd-chat-icon-button" onClick={onBack} aria-label="Quay lại danh sách tin nhắn"><ArrowLeft size={21} /></button>
    <ChatAvatar conversation={conversation} size="toolbar" />
    <div className="hd-chat-toolbar-identity"><strong>{conversation.title}</strong><span>{isGroup ? `${conversation.participantEmpIds?.length || 0} thành viên` : conversation.type === 'notice' ? 'Thông báo' : 'Đang hoạt động'}</span></div>
    <button type="button" className="hd-chat-icon-button" onClick={onCall} disabled={!canCall} aria-label="Gọi điện"><Phone size={20} /></button>
    {!isGroup && <button type="button" className="hd-chat-icon-button" disabled title="Chưa hỗ trợ gọi video" aria-label="Gọi video"><Video size={20} /></button>}
    <button type="button" className="hd-chat-icon-button" onClick={onSearch} aria-label="Tìm trong hội thoại"><Search size={20} /></button>
    <button type="button" className="hd-chat-icon-button" onClick={onMore} aria-label="Thao tác khác"><MoreVertical size={20} /></button>
  </div>;
}

function ImageMessage({ message }) {
  const images = (Array.isArray(message.attachmentImages) && message.attachmentImages.length
    ? message.attachmentImages : [message.attachmentImage]).filter(Boolean);
  if (!images.length) return null;
  return <div className={`hd-chat-images ${images.length > 1 ? 'hd-chat-images--grid' : ''}`}>
    {images.slice(0, 3).map((src, index) => <div className="hd-chat-image" key={`${src.slice(0, 24)}-${index}`}><img src={src} alt={`Ảnh đính kèm ${index + 1}`} loading="lazy" />{index === 2 && images.length > 3 && <span>+{images.length - 3}</span>}</div>)}
  </div>;
}

function AudioMessage({ message }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const hasAudio = Boolean(message.audioUrl);
  return <div className="hd-chat-audio">
    <button type="button" onClick={() => { if (!hasAudio) return; if (playing) audioRef.current?.pause(); else audioRef.current?.play(); setPlaying(!playing); }} disabled={!hasAudio} aria-label={playing ? 'Tạm dừng ghi âm' : 'Phát ghi âm'}>{playing ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}</button>
    <span className="hd-chat-waveform" aria-hidden="true">{Array.from({ length: 30 }, (_, index) => <i key={index} style={{ height: `${5 + ((index * 13) % 21)}px` }} />)}</span>
    <span className="hd-chat-audio-duration">{message.duration || '0:12'}</span>
    {hasAudio && <audio ref={audioRef} src={message.audioUrl} onEnded={() => setPlaying(false)} preload="none" />}
  </div>;
}

function BusinessMessage({ message }) {
  const label = message.attachmentLabel || ({ order: 'Đơn hàng', order_request: 'Đơn đặt', location: 'Vị trí hiện tại', report: 'Báo cáo' }[message.attachmentType] || 'Đính kèm');
  return <div className={`hd-chat-business ${message.attachmentType === 'location' ? 'hd-chat-business--location' : ''}`}>
    {message.attachmentType === 'location' && <MapPin size={20} />}
    <span><strong>{label}</strong><span>{message.attachmentText}</span></span>
  </div>;
}

function MessageBubble({ message, conversation }) {
  const isMine = message.from === 'me';
  const isGroup = getChatCategory(conversation) === 'group';
  const hasAttachment = Boolean(message.attachmentImage || message.attachmentImages?.length || message.attachmentText || message.attachmentType === 'audio');
  return <div className={`hd-chat-message ${isMine ? 'hd-chat-message--mine' : ''}`}>
    {!isMine && <ChatAvatar conversation={{ title: message.senderName || conversation.title, avatarUrl: message.senderAvatarUrl }} size="message" />}
    <div className="hd-chat-message-content">
      {isGroup && !isMine && message.senderName && <span className="hd-chat-sender">{message.senderName}</span>}
      {message.text && <div className={`hd-chat-bubble ${isMine ? 'hd-chat-bubble--mine' : ''}`}>{isGroup && !isMine && message.text.startsWith('@') ? <><span className="hd-chat-mention">{message.text.split(' ').slice(0, 2).join(' ')}</span>{` ${message.text.split(' ').slice(2).join(' ')}`}</> : message.text}<small>{formatTime(message.createdAt)}{isMine && <CheckCheck size={13} aria-label="Đã gửi" />}</small></div>}
      {hasAttachment && <div className="hd-chat-media"><ImageMessage message={message} />{message.attachmentType === 'audio' && <AudioMessage message={message} />}{message.attachmentText && <BusinessMessage message={message} />}{!message.text && <small>{formatTime(message.createdAt)}</small>}</div>}
      {isGroup && message.reactions && <div className="hd-chat-reactions"><Heart size={13} fill="#ef4444" color="#ef4444" />{Number(message.reactions.heart || 0) || ''}<ThumbsUp size={13} color="#eaa72d" />{Number(message.reactions.like || 0) || ''}</div>}
    </div>
  </div>;
}

export function MessageList({ conversation, messages, status = '', onOpenNotice }) {
  const scrollRef = useRef(null);
  const [limit, setLimit] = useState(40);
  useEffect(() => { setLimit(40); }, [conversation.id]);
  useEffect(() => { const element = scrollRef.current; if (element) element.scrollTop = element.scrollHeight; }, [conversation.id, messages.length]);
  const visible = messages.slice(-limit);
  return <div className="hd-chat-message-list" ref={scrollRef} onScroll={(event) => { if (event.currentTarget.scrollTop < 80 && limit < messages.length) setLimit((count) => count + 40); }}>
    {limit < messages.length && <button type="button" className="hd-chat-load-older" onClick={() => setLimit((count) => count + 40)}>Xem tin nhắn cũ</button>}
    {conversation.type === 'notice' && conversation.sourceItem && <button type="button" className="hd-chat-notice-link" onClick={onOpenNotice}>Mở chi tiết thông báo <ChevronRight size={16} /></button>}
    {visible.map((message) => <MessageBubble key={message.id} message={message} conversation={conversation} />)}
    {!messages.length && <ChatState state="empty" />}
    {status && <div className="hd-chat-inline-status" role="status">{status}</div>}
  </div>;
}

export function MessageComposer({ draft, onChange, onSend, onAttach, onMic, disabled, panelOpen }) {
  return <div className="hd-chat-composer"><div className="hd-chat-composer-field">
    <button type="button" className="hd-chat-icon-button hd-chat-compose-plus" onClick={onAttach} disabled={disabled} aria-label="Đính kèm" aria-expanded={panelOpen}><Plus size={23} /></button>
    <input value={draft} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent?.isComposing) { event.preventDefault(); onSend(); } }} enterKeyHint="send" placeholder="Nhập tin nhắn..." disabled={disabled} aria-label="Nhập tin nhắn" />
    <button type="button" className="hd-chat-icon-button" onClick={() => onChange(`${draft}😊`)} disabled={disabled} aria-label="Thêm biểu tượng cảm xúc"><Smile size={21} /></button>
  </div><button type="button" className="hd-chat-compose-primary" onClick={draft.trim() ? onSend : onMic} disabled={disabled} aria-label={draft.trim() ? 'Gửi tin nhắn' : 'Ghi âm'}>{draft.trim() ? <Send size={20} /> : <Mic size={21} />}</button></div>;
}

const attachmentIcons = { image: ImageIcon, camera: Camera, video: Video, document: FileText, location: MapPin, contact: Contact, order: Package, weighing: FileText };

export function AttachmentPanel({ actions, onSelect, onClose }) {
  return <div className="hd-chat-attachment-panel" role="dialog" aria-label="Đính kèm" data-chat-attachment-panel="true">
    <div className="hd-chat-attachment-handle" />
    <button type="button" className="hd-chat-attachment-close" onClick={onClose} aria-label="Đóng bảng đính kèm"><X size={18} /></button>
    <div className="hd-chat-attachment-grid">{actions.map((action) => { const Icon = attachmentIcons[action.id] || action.icon || FileText; return <button key={action.id} type="button" onClick={() => onSelect(action)} disabled={!action.allowed} title={!action.allowed ? 'Chưa hỗ trợ cho tài khoản này' : action.label}><span className={`hd-chat-attachment-icon hd-chat-attachment-icon--${action.id}`}><Icon size={24} /></span><span>{action.label}</span></button>; })}</div>
  </div>;
}

export function OfflineBanner({ online }) {
  return online ? null : <div className="hd-chat-offline" role="status"><WifiOff size={16} /> Không có kết nối mạng</div>;
}
