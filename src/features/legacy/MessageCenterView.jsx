import { useState, useEffect, useMemo, useRef } from "react";
import { useDeferredValue } from "react";
import { buildCustomerSupportConversationId, getCustomerMessagingEmployeeId, isEmployeeScopedCustomerMessage } from "../../utils/employeeScopedCustomerMessaging.js";
import { CHAT_LIST_TABS, CHAT_SEARCH_TABS, filterChatConversations, getChatCategory, getChatSearchResult } from "../messaging/messagingUiModel.js";
import { usePagedList } from "../../services/renderOptimization";
import { Users, Check, X, UserCircle, CreditCard, MapPin, Search, Receipt, ClipboardList, Scan, PieChart, Loader2, ImagePlus, Camera, MessageCircle, Headphones, Megaphone, RefreshCw } from "lucide-react";
import { Geolocation } from "@capacitor/geolocation";
import { AttachmentPanel, ChatSearchBar, ChatState, ChatTabs, ConversationItem, ConversationToolbar, MessageComposer, MessageList, OfflineBanner, SearchResultItem } from "../messaging/MessagingUi.jsx";
import { ListPagination } from "../../design-system/ListPagination.jsx";
// Transitional bundle boundary. Only stable local module bindings are injected;
// all actor/company/business data continues to arrive through current props.
// Generated binding contract is checked against the real source AST.
export function createMessageCenterView(runtime) {
  const {APP_SCREEN_BACK_EVENT,buildCompanyMonogram,chatListMonthDayFormatter,chatListTimeFormatter,collapseLookupText,formatCurrency,formatDateLabel,formatDateTimeLabel,formatNumber,getCompanyDisplayName,getCompanyLogoUrl,getCustomerDisplayName,getEmployeeAvatarUrl,getEmployeePositionLabel,getEntityTimestamp,getFriendlyFirebaseErrorMessage,getInvoiceTransferProfile,getProductShortName,getTodayString,isSameLoginPhone,markAppBackHandled,normalizeCustomerPhone,parseLooseQuantityValue,useDismissSearchOnOutsideClick,vietnamDateFormatter} = runtime;
  function MessageCenterView({
  employee,
  currentCompany,
  employees = [],
  customers = [],
  orders = [],
  orderRequests = [],
  payments = [],
  expenses = [],
  products = [],
  messages = [],
  notificationItems = [],
  zaloInboxMessages = [],
  aiReplyRules = [],
  onAddMessage = null,
  onOpenNotification = () => {},
  onGoBack = () => {},
  onUpdateCompanySettings = null,
  onProcessZaloInboxMessage = null,
  onSendAiZaloReply = null,
  onIgnoreZaloInboxMessage = null,
  onMarkNeedHumanZaloInboxMessage = null,
  onToggleCustomerAiReply = null,
  onSaveAiReplyRule = null,
  onArchiveAiReplyRule = null,
  canViewSupportMessages = false,
  canSendSupportMessages = false,
  canViewInternalMessages = true,
  canSendInternalMessages = true,
  canViewOwnNotifications = true,
  canViewAllNotifications = false,
  canViewZaloAiInbox = false,
  canSendImageAttachment = true,
  canSendContactAttachment = true,
  canSendLocationAttachment = true,
  canSendBankQrAttachment = false,
  canSendOrderAttachment = false,
  canSendOrderRequestAttachment = false,
  canSendReportAttachment = false,
  canCallFromMessage = true
}) {
  const currentEmployeeId = employee?.id || '';
  const readConversationStorageKey = `hd_message_read_watermarks_${currentCompany?.id || 'company'}_${currentEmployeeId || 'anonymous'}`;
  const [activeType, setActiveType] = useState('internal');
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const deferredSearchKeyword = useDeferredValue(searchKeyword);
  const [messageFilter, setMessageFilter] = useState('all');
  const [showMessageFilterMenu, setShowMessageFilterMenu] = useState(false);
  const [chatSearchKeyword, setChatSearchKeyword] = useState('');
  const deferredChatSearchKeyword = useDeferredValue(chatSearchKeyword);
  const [showChatSearch, setShowChatSearch] = useState(false);
  const [activeChatTab, setActiveChatTab] = useState('all');
  const [activeSearchTab, setActiveSearchTab] = useState('messages');
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [isRefreshingChats, setIsRefreshingChats] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showExtraAttachMenu, setShowExtraAttachMenu] = useState(false);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('');
  const [localReplies, setLocalReplies] = useState({});
  const [attachmentPickerConfig, setAttachmentPickerConfig] = useState(null);
  const [attachmentPickerType, setAttachmentPickerType] = useState('');
  const [attachmentPickerSearch, setAttachmentPickerSearch] = useState('');
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showCreateConversationPanel, setShowCreateConversationPanel] = useState(false);
  const [showAddFriendPanel, setShowAddFriendPanel] = useState(false);
  const [showCodeScanner, setShowCodeScanner] = useState(false);
  const [codeScannerStatus, setCodeScannerStatus] = useState('');
  const [codeScanResult, setCodeScanResult] = useState('');
  const [isCameraScanning, setIsCameraScanning] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [groupMemberIds, setGroupMemberIds] = useState([]);
  const [groupSearchKeyword, setGroupSearchKeyword] = useState('');
  const [phoneConnectDraft, setPhoneConnectDraft] = useState('');
  const [manualConversations, setManualConversations] = useState({});
  const [readConversationWatermarks, setReadConversationWatermarks] = useState({});
  const imageInputRef = useRef(null);
  const codeScannerFileInputRef = useRef(null);
  const codeScannerVideoRef = useRef(null);
  const codeScannerStreamRef = useRef(null);
  const codeScannerZxingControlsRef = useRef(null);
  const codeScannerTimerRef = useRef(null);
  const chatListRefreshTimerRef = useRef(null);
  const chatListTouchStartRef = useRef(null);
  const cameraInputRef = useRef(null);
  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);
  useDismissSearchOnOutsideClick(
    showChatSearch || showAttachMenu || showMessageFilterMenu || showCreateConversationPanel,
    () => {
      setShowChatSearch(false);
      setShowAttachMenu(false);
      setShowMessageFilterMenu(false);
      setShowCreateConversationPanel(false);
    }
  );

  const companyName = getCompanyDisplayName(currentCompany);
  const companyLogo = getCompanyLogoUrl(currentCompany);
  const companyPhone = `${currentCompany?.phone || currentCompany?.hotline || employee?.phone || ''}`.trim();
  const companyInitials = buildCompanyMonogram(companyName);
  const customerById = useMemo(() => new Map((customers || []).map(customer => [customer.id, customer])), [customers]);
  const productById = useMemo(() => new Map((products || []).map(product => [product.id, product])), [products]);
  const employeeById = useMemo(() => new Map((employees || []).filter(Boolean).map(item => [item.id, item])), [employees]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const rawValue = window.localStorage.getItem(readConversationStorageKey);
      const parsedValue = rawValue ? JSON.parse(rawValue) : {};
      setReadConversationWatermarks(parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue) ? parsedValue : {});
    } catch (error) {
      console.warn('Cannot load message read watermarks.', error);
      setReadConversationWatermarks({});
    }
  }, [readConversationStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(readConversationStorageKey, JSON.stringify(readConversationWatermarks || {}));
    } catch (error) {
      console.warn('Cannot save message read watermarks.', error);
    }
  }, [readConversationStorageKey, readConversationWatermarks]);

  const normalizeKeyword = (value = '') => `${value}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  const buildInitials = (value = '') => {
    const words = `${value}`.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return 'HD';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0] || ''}${words[words.length - 1][0] || ''}`.toUpperCase();
  };
  const isUnreadStatus = (value = '') => ['unread', 'new', 'pending', 'need_human'].includes(`${value || ''}`.toLowerCase());
  const isMessageUnreadForCurrentEmployee = (message = {}) => {
    if (message.isRead === false || message.seen === false || isUnreadStatus(message.status || message.readStatus)) {
      if (message.senderEmpId && message.senderEmpId === currentEmployeeId) return false;
      if (`${message.senderType || ''}`.toLowerCase() === 'employee' && message.senderEmpId === currentEmployeeId) return false;
      return true;
    }
    return false;
  };
  const isNotificationUnread = (item = {}) => {
    const source = item.sourceNotification || item.sourceItem || {};
    if (item.isRead === false || item.seen === false || source.isRead === false || source.seen === false) return true;
    return isUnreadStatus(item.status || item.readStatus || source.status || source.readStatus);
  };
  const stableMessageFallbackBaseAt = useMemo(() => {
    const fallbackDate = new Date();
    fallbackDate.setHours(7, 0, 0, 0);
    return fallbackDate.getTime();
  }, []);
  const getMessageTimeValue = (value) => {
    if (!value) return 0;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value instanceof Date) {
      const dateTime = value.getTime();
      return Number.isFinite(dateTime) ? dateTime : 0;
    }
    if (typeof value?.toDate === 'function') {
      const parsedDate = value.toDate();
      const dateTime = parsedDate instanceof Date ? parsedDate.getTime() : 0;
      if (Number.isFinite(dateTime)) return dateTime;
    }
    if (typeof value === 'object') {
      const seconds = Number(value.seconds ?? value._seconds ?? value.secs ?? 0);
      const nanos = Number(value.nanoseconds ?? value._nanoseconds ?? value.nanos ?? 0);
      if (seconds > 0) return (seconds * 1000) + Math.floor(nanos / 1000000);
    }
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const getRawMessageActivityAt = (message = {}) => Math.max(
    getEntityTimestamp(message) || 0,
    getMessageTimeValue(message.createdAt),
    getMessageTimeValue(message.updatedAt),
    getMessageTimeValue(message.sentAt),
    getMessageTimeValue(message.receivedAt),
    getMessageTimeValue(message.timestamp)
  );

  const storedMessagesByConversation = useMemo(() => {
    const grouped = {};
    (messages || [])
      .filter((message) => !message?.isArchived)
      .sort((a, b) => getRawMessageActivityAt(a) - getRawMessageActivityAt(b))
      .forEach((message) => {
        const conversationId = message.conversationType === 'customer_support'
          ? (buildCustomerSupportConversationId(message.customerId) || message.conversationId || 'customer_support')
          : (message.conversationId || `${message.conversationType || 'support'}-general`);
        const activityAt = getRawMessageActivityAt(message) || (stableMessageFallbackBaseAt - ((grouped[conversationId]?.length || 0) * 60000));
        if (!grouped[conversationId]) grouped[conversationId] = [];
        grouped[conversationId].push({
          id: message.id || `message-${grouped[conversationId].length}`,
          from: message.senderEmpId === currentEmployeeId ? 'me' : 'them',
          text: message.text || message.message || '',
          attachmentType: message.attachmentType || '',
          attachmentLabel: message.attachmentLabel || '',
          attachmentText: message.attachmentText || '',
          attachmentImage: message.attachmentImage || '',
          attachmentImages: Array.isArray(message.attachmentImages) ? message.attachmentImages : [],
          audioUrl: message.audioUrl || '',
          duration: message.duration || '',
          reactions: message.reactions || null,
          createdAt: activityAt,
          updatedAt: getMessageTimeValue(message.updatedAt) || activityAt,
          senderName: message.senderName || '',
          senderAvatarUrl: getEmployeeAvatarUrl(employeeById.get(message.senderEmpId)),
          isUnread: isMessageUnreadForCurrentEmployee(message)
        });
      });
    return grouped;
  }, [currentEmployeeId, employeeById, messages, stableMessageFallbackBaseAt]);

  const supportConversations = useMemo(() => {
    const supportConversationId = 'support-hd-manager';
    const supportSavedMessages = storedMessagesByConversation[supportConversationId] || [];
    const supportFallbackCreatedAt = stableMessageFallbackBaseAt - (1000 * 60 * 12);
    const supportFallbackMessages = [
      {
        id: 'welcome',
        from: 'them',
        text: 'Chào bạn, nếu app có lỗi hoặc cần góp ý thêm chức năng, hãy nhắn tại đây để đội hỗ trợ nắm nhanh.',
        createdAt: supportFallbackCreatedAt,
        isSystemIntro: true
      }
    ];
    const supportVisibleMessages = supportSavedMessages.length > 0 ? supportSavedMessages : supportFallbackMessages;
    const supportLatestMessage = supportVisibleMessages[supportVisibleMessages.length - 1];
    const feedbackCustomers = (customers || [])
      .filter((customer) => customer?.supportMessage || customer?.feedbackMessage || customer?.lastSupportMessage)
      .slice(0, 8)
      .map((customer) => {
        const message = customer.supportMessage || customer.feedbackMessage || customer.lastSupportMessage || 'Khách vừa gửi phản ánh về app.';
        const createdAt = getEntityTimestamp(customer) || (stableMessageFallbackBaseAt - (1000 * 60 * 45));
        return {
          id: `support-customer-${customer.id}`,
          type: 'support',
          customerId: customer.id,
          title: customer.name || 'Khách hàng',
          subtitle: customer.phone || 'Phản ánh khách hàng',
          phone: customer.phone || '',
          avatarUrl: customer.avatarUrl || customer.photoUrl || '',
          color: 'from-amber-400 to-orange-500',
          lastMessage: message,
          createdAt,
          messages: [
            { id: 'support-1', from: 'them', text: message, createdAt }
          ]
        };
      });

    return [
      {
        id: supportConversationId,
        conversationId: supportConversationId,
        type: 'support',
        title: 'Hỗ trợ HD Manager',
        subtitle: 'Gửi phản ánh, lỗi app, góp ý tính năng',
        phone: companyPhone,
        avatarUrl: companyLogo,
        color: 'from-emerald-500 to-cyan-500',
        lastMessage: supportLatestMessage?.text || 'Bạn có thể gửi phản ánh về app tại đây.',
        createdAt: supportLatestMessage?.createdAt || supportFallbackCreatedAt,
        lastActivityAt: getRawMessageActivityAt(supportLatestMessage) || supportFallbackCreatedAt,
        messages: supportVisibleMessages
      },
      ...feedbackCustomers
    ];
  }, [companyLogo, companyPhone, customers, stableMessageFallbackBaseAt, storedMessagesByConversation]);

  const customerDirectConversations = useMemo(() => {
    const relevantMessages = (messages || []).filter((message) => {
      if (message?.isArchived) return false;
      const conversationId = `${message.conversationId || ''}`;
      const isCustomerConversation = message.conversationType === 'customer_support'
        || message.type === 'customer_to_employee'
        || conversationId.startsWith('customer_');
      if (!isCustomerConversation) return false;
      const customer = customerById.get(message.customerId) || {};
      if (message.conversationType === 'customer_support') {
        return isEmployeeScopedCustomerMessage(message, {
          currentEmployeeId,
          customer,
          isManager: canViewAllNotifications
        });
      }
      const receiverEmpId = message.receiverEmpId || message.recipientEmpId || message.targetEmpId || '';
      const receiverPhone = message.receiverPhone || message.recipientPhone || message.targetEmpPhone || message.employeePhone || '';
      const receiverName = message.receiverName || message.recipientName || message.targetEmpName || message.employeeName || '';
      const currentEmployeePhone = employee?.phone || '';
      const currentEmployeeName = collapseLookupText(employee?.name || employee?.fullName || '');
      const normalizedReceiverName = collapseLookupText(receiverName);
      return receiverEmpId === currentEmployeeId
        || message.senderEmpId === currentEmployeeId
        || (receiverPhone && currentEmployeePhone && isSameLoginPhone(receiverPhone, currentEmployeePhone))
        || (normalizedReceiverName && currentEmployeeName && normalizedReceiverName === currentEmployeeName);
    });

    const grouped = new Map();
    relevantMessages.forEach((message, index) => {
      const conversationId = message.conversationType === 'customer_support'
        ? (buildCustomerSupportConversationId(message.customerId) || message.conversationId || `customer_${message.customerId || index}`)
        : (message.conversationId || `customer_${message.customerId || index}`);
      const customer = customerById.get(message.customerId) || {};
      const savedMessages = storedMessagesByConversation[conversationId] || [];
      const latestMessage = savedMessages[savedMessages.length - 1] || {
        text: message.text || message.message || '',
        createdAt: getRawMessageActivityAt(message) || (stableMessageFallbackBaseAt - ((index + 1) * 60000))
      };
      const current = grouped.get(conversationId);
      const latestActivityAt = getRawMessageActivityAt(latestMessage) || getRawMessageActivityAt(message) || stableMessageFallbackBaseAt;
      if (current && (current.lastActivityAt || current.createdAt || 0) >= latestActivityAt) return;
      grouped.set(conversationId, {
        id: conversationId,
        conversationId,
        type: 'internal',
        conversationKind: 'customer_support',
        customerId: message.customerId || customer.id || '',
        title: customer.name || message.customerName || message.senderName || 'Khách hàng',
        subtitle: `${customer.phone || message.customerPhone || 'Khách hàng'} • Tin khách gửi`,
        phone: customer.phone || message.customerPhone || '',
        avatarUrl: customer.avatarUrl || customer.avatar || '',
        color: 'from-emerald-500 to-teal-500',
        lastMessage: latestMessage?.text || 'Khách hàng vừa nhắn tin.',
        createdAt: latestActivityAt,
        lastActivityAt: latestActivityAt,
        messages: savedMessages.length > 0 ? savedMessages : [{
          id: message.id || `customer-message-${index}`,
          from: message.senderType === 'customer' ? 'them' : 'me',
          text: message.text || message.message || '',
          createdAt: latestActivityAt,
          senderName: message.senderName || '',
          isUnread: isMessageUnreadForCurrentEmployee(message)
        }]
      });
    });

    return Array.from(grouped.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [canViewAllNotifications, currentEmployeeId, customerById, employee?.fullName, employee?.name, employee?.phone, messages, stableMessageFallbackBaseAt, storedMessagesByConversation]);

  const internalGroupConversations = useMemo(() => {
    if (!currentEmployeeId) return [];
    const grouped = new Map();
    (messages || [])
      .filter((message) => {
        if (message?.isArchived) return false;
        const conversationId = `${message.conversationId || ''}`;
        return message.conversationType === 'internal_group'
          || message.type === 'internal_group'
          || Boolean(message.groupId)
          || conversationId.startsWith('internal_group_');
      })
      .forEach((message, index) => {
        const rawParticipants = Array.isArray(message.participantEmpIds) ? message.participantEmpIds : [];
        const participantEmpIds = [...new Set([
          ...rawParticipants,
          message.senderEmpId,
          message.recipientEmpId,
          message.receiverEmpId
        ].filter(Boolean))];
        if (!participantEmpIds.includes(currentEmployeeId)) return;
        const conversationId = message.conversationId || message.groupId || `internal_group_${participantEmpIds.sort().join('_') || index}`;
        const savedMessages = storedMessagesByConversation[conversationId] || [];
        const latestMessage = savedMessages[savedMessages.length - 1] || {
          text: message.text || message.message || '',
          createdAt: getRawMessageActivityAt(message) || (stableMessageFallbackBaseAt - ((index + 1) * 60000))
        };
        const current = grouped.get(conversationId);
        const latestActivityAt = getRawMessageActivityAt(latestMessage) || getRawMessageActivityAt(message) || stableMessageFallbackBaseAt;
        if (current && (current.lastActivityAt || current.createdAt || 0) >= latestActivityAt) return;
        const memberNames = participantEmpIds
          .map((id) => employeeById.get(id)?.name || employeeById.get(id)?.fullName || '')
          .filter(Boolean);
        grouped.set(conversationId, {
          id: conversationId,
          conversationId,
          type: 'internal',
          conversationKind: 'internal_group',
          groupId: message.groupId || conversationId,
          groupName: message.groupName || 'Nhóm nội bộ',
          participantEmpIds,
          title: message.groupName || 'Nhóm nội bộ',
          subtitle: memberNames.length > 0 ? memberNames.slice(0, 4).join(', ') : 'Nhóm trao đổi nội bộ',
          phone: '',
          avatarUrl: '',
          color: 'from-cyan-500 to-blue-600',
          lastMessage: latestMessage?.text || 'Nhóm nội bộ vừa cập nhật.',
          createdAt: latestActivityAt,
          lastActivityAt: latestActivityAt,
          messages: savedMessages.length > 0 ? savedMessages : [{
            id: message.id || `group-message-${index}`,
            from: message.senderEmpId === currentEmployeeId ? 'me' : 'them',
            text: message.text || message.message || '',
            createdAt: latestActivityAt,
            senderName: message.senderName || '',
            isUnread: isMessageUnreadForCurrentEmployee(message)
          }]
        });
      });
    return Array.from(grouped.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [currentEmployeeId, employeeById, messages, stableMessageFallbackBaseAt, storedMessagesByConversation]);

  const manualConversationList = useMemo(() => Object.values(manualConversations || {}), [manualConversations]);

  const internalConversations = useMemo(() => {
    const coworkers = (employees || []).filter((item) => item?.id !== currentEmployeeId && !item?.isArchived);
    if (coworkers.length === 0 && customerDirectConversations.length === 0 && internalGroupConversations.length === 0 && manualConversationList.length === 0) {
      return [{
        id: 'internal-empty',
        type: 'internal',
        title: 'Nội bộ công ty',
        subtitle: 'Chưa có nhân sự khác để trao đổi',
        phone: '',
        color: 'from-sky-500 to-indigo-500',
        lastMessage: 'Khi có nhân sự, danh sách chat nội bộ sẽ hiện tại đây.',
        createdAt: stableMessageFallbackBaseAt - (1000 * 60 * 25),
        messages: [
          { id: 'empty', from: 'them', text: 'Khi có nhân sự, bạn có thể nhắn nội bộ trực tiếp trong mục này.', createdAt: stableMessageFallbackBaseAt - (1000 * 60 * 25), isSystemIntro: true }
        ]
      }];
    }

    const employeeConversations = coworkers.map((item, index) => {
      const conversationId = `internal-${[currentEmployeeId, item.id].filter(Boolean).sort().join('-')}`;
      const savedMessages = storedMessagesByConversation[conversationId] || [];
      const fallbackCreatedAt = getEntityTimestamp(item) || (stableMessageFallbackBaseAt - (1000 * 60 * (index + 20)));
      const roleText = item.role || item.department || 'Nhân sự';
      const fallbackMessages = [
        { id: 'intro', from: 'them', text: `Đây là cuộc trò chuyện nội bộ với ${item.name || 'nhân sự'}.`, createdAt: fallbackCreatedAt, isSystemIntro: true }
      ];
      const visibleMessages = savedMessages.length > 0 ? savedMessages : fallbackMessages;
      const latestMessage = visibleMessages[visibleMessages.length - 1];
      return {
        id: conversationId,
        conversationId,
        type: 'internal',
        counterpartEmpId: item.id,
        title: item.name || item.fullName || 'Nhân sự',
        subtitle: `${item.phone || 'Chưa có số điện thoại'} • ${roleText}`,
        phone: item.phone || '',
        avatarUrl: getEmployeeAvatarUrl(item),
        color: 'from-sky-500 to-indigo-500',
        lastMessage: latestMessage?.text || `Trao đổi nội bộ với ${item.name || 'nhân sự'}.`,
        createdAt: getRawMessageActivityAt(latestMessage) || fallbackCreatedAt,
        lastActivityAt: getRawMessageActivityAt(latestMessage) || fallbackCreatedAt,
        messages: visibleMessages
      };
    });
    const merged = new Map();
    [...internalGroupConversations, ...customerDirectConversations, ...manualConversationList, ...employeeConversations]
      .forEach((conversation) => {
        if (!conversation?.id) return;
        if (!merged.has(conversation.id)) merged.set(conversation.id, conversation);
      });
    return Array.from(merged.values());
  }, [currentEmployeeId, customerDirectConversations, employees, internalGroupConversations, manualConversationList, stableMessageFallbackBaseAt, storedMessagesByConversation]);

  const notificationConversations = useMemo(() => {
    const mappedItems = (notificationItems || []).map((item, index) => {
      const sourceItem = item.sourceNotification || item.sourceItem || item;
      const createdAt = getRawMessageActivityAt(sourceItem)
        || getMessageTimeValue(item.createdAt)
        || (stableMessageFallbackBaseAt - (1000 * 60 * (index + 60)));
      return {
        id: `notice-${item.id || index}`,
        type: 'notice',
        customerId: item.customerId || sourceItem.customerId || sourceItem.sourcePayment?.customerId || '',
        groupId: item.groupId || sourceItem.groupId || sourceItem.metadata?.groupId || '',
        title: item.title || 'Thông báo',
        subtitle: formatDateTimeLabel(createdAt),
        phone: '',
        color: item.tone === 'orange' || item.tone === 'amber' ? 'from-amber-400 to-orange-500' : 'from-violet-500 to-fuchsia-500',
        lastMessage: item.message || 'Có thông báo mới trong hệ thống.',
        createdAt,
        lastActivityAt: createdAt,
        sourceItem: item,
        messages: [
          { id: `notice-message-${item.id || index}`, from: 'them', text: item.message || 'Có thông báo mới trong hệ thống.', createdAt }
        ]
      };
    });

    if (mappedItems.length > 0) return mappedItems;
    return [{
      id: 'notice-empty',
      type: 'notice',
      title: 'Thông báo',
      subtitle: 'Chưa có thông báo mới',
      phone: '',
      color: 'from-violet-500 to-fuchsia-500',
      lastMessage: 'Các thông báo trong app sẽ được gom tại đây.',
      createdAt: stableMessageFallbackBaseAt - (1000 * 60 * 120),
      lastActivityAt: stableMessageFallbackBaseAt - (1000 * 60 * 120),
      messages: [
        { id: 'notice-empty-message', from: 'them', text: 'Các thông báo trong app sẽ được gom tại đây để bạn xem lại nhanh.', createdAt: stableMessageFallbackBaseAt - (1000 * 60 * 120), isSystemIntro: true }
      ]
    }];
  }, [notificationItems, stableMessageFallbackBaseAt]);

  const visibleMessageTypes = [
    (canViewSupportMessages || canSendSupportMessages) ? 'support' : '',
    (canViewInternalMessages || canSendInternalMessages) ? 'internal' : '',
    (canViewOwnNotifications || canViewAllNotifications) ? 'notice' : '',
    ''
  ].filter(Boolean);
  const safeActiveType = visibleMessageTypes.includes(activeType) ? activeType : (visibleMessageTypes[0] || '');
  const conversationGroups = {
    support: canViewSupportMessages || canSendSupportMessages ? supportConversations : [],
    internal: canViewInternalMessages || canSendInternalMessages ? internalConversations : [],
    notice: canViewOwnNotifications || canViewAllNotifications ? notificationConversations : [],
    zalo_ai: []
  };
  const getSourceUnreadCount = (conversation = {}) => {
    const messageUnreadCount = (conversation.messages || []).filter((message) => message?.isUnread).length;
    const noticeUnreadCount = conversation.type === 'notice' && isNotificationUnread(conversation.sourceItem || {}) ? 1 : 0;
    return Math.max(messageUnreadCount, noticeUnreadCount, Number(conversation.unreadCount || 0) || 0);
  };
  const decorateConversationUnread = (conversation = {}) => {
    const unreadCount = getSourceUnreadCount(conversation);
    return {
      ...conversation,
      unreadCount,
      hasUnread: unreadCount > 0
    };
  };
  const getConversationUnreadCount = (conversation = {}) => {
    if (!conversation?.id) return 0;
    const unreadCount = Number(conversation.unreadCount || 0) || 0;
    const readAt = Number(readConversationWatermarks[conversation.id] || 0) || 0;
    if (readAt && getConversationActivityAt(conversation) <= readAt) return 0;
    return unreadCount;
  };
  const getConversationTimeValue = getMessageTimeValue;
  const getMessageActivityAt = (message = {}) => Math.max(
    getEntityTimestamp(message) || 0,
    getConversationTimeValue(message.createdAt),
    getConversationTimeValue(message.updatedAt),
    getConversationTimeValue(message.sentAt),
    getConversationTimeValue(message.receivedAt),
    getConversationTimeValue(message.timestamp)
  );
  const getConversationActivityAt = (conversation = {}) => {
    const messageTimes = (conversation.messages || [])
      .filter((message) => message && !message.isSystemIntro && !message.isFallback)
      .map(getMessageActivityAt);
    return Math.max(
      0,
      ...messageTimes,
      getEntityTimestamp(conversation),
      getEntityTimestamp(conversation.sourceItem || {}),
      getConversationTimeValue(conversation.lastActivityAt),
      getConversationTimeValue(conversation.updatedAt),
      getConversationTimeValue(conversation.createdAt),
      getConversationTimeValue(conversation.sourceItem?.createdAt),
      getConversationTimeValue(conversation.sourceItem?.updatedAt)
    );
  };
  const sortConversationsByPriority = (a, b) => {
    const unreadDiff = Number(getConversationUnreadCount(b) > 0) - Number(getConversationUnreadCount(a) > 0);
    if (unreadDiff !== 0) return unreadDiff;
    const timeDiff = getConversationActivityAt(b) - getConversationActivityAt(a);
    if (timeDiff !== 0) return timeDiff;
    return `${a.title || a.id || ''}`.localeCompare(`${b.title || b.id || ''}`, 'vi');
  };
  const allVisibleConversations = Object.entries(conversationGroups)
    .filter(([type]) => visibleMessageTypes.includes(type))
    .flatMap(([, conversations]) => (conversations || []).map(decorateConversationUnread))
    .sort(sortConversationsByPriority);
  const activeConversations = allVisibleConversations;
  const selectedConversation = allVisibleConversations.find((item) => item.id === selectedConversationId) || null;
  const canSendInSelectedConversation = selectedConversation?.type === 'support'
    ? canSendSupportMessages
    : selectedConversation?.type === 'internal'
      ? canSendInternalMessages
      : false;
  const listKeyword = normalizeKeyword(deferredSearchKeyword);
  const messageFilterOptions = [
    { id: 'all', label: 'Tất cả', shortLabel: 'Tất cả' },
    { id: 'unread', label: 'Tin chưa đọc', shortLabel: 'Chưa đọc' },
    { id: 'read', label: 'Tin đã đọc', shortLabel: 'Đã đọc' },
    { id: 'promotion', label: 'Tin quảng cáo', shortLabel: 'Quảng cáo' },
    { id: 'care', label: 'Tin chăm sóc khách', shortLabel: 'Chăm sóc' },
    { id: 'customer', label: 'Tin khách hàng', shortLabel: 'Khách hàng' },
    { id: 'dispatch', label: 'Phiếu xuất kho', shortLabel: 'Phiếu xuất' }
  ];
  const selectedMessageFilter = messageFilterOptions.find((item) => item.id === messageFilter) || messageFilterOptions[0];
  const hasConversationActivity = (conversation = {}) => {
    if (!conversation?.id || `${conversation.id}`.includes('-empty')) return false;
    if (conversation.id === 'support-hd-manager') return true;
    if (conversation.sourceItem) return true;
    return (conversation.messages || []).some((message) => {
      if (!message || message.isSystemIntro || message.isFallback) return false;
        return Boolean(message.attachmentImage || message.attachmentImages?.length || message.audioUrl || normalizeKeyword([
        message.text,
        message.attachmentLabel,
        message.attachmentText,
        message.senderName
      ].filter(Boolean).join(' ')));
    });
  };
  const getConversationSearchText = (conversation = {}) => [
    conversation.title,
    conversation.subtitle,
    conversation.phone,
    conversation.lastMessage,
    conversation.groupName,
    conversation.customerName,
    conversation.type,
    ...(conversation.messages || []).flatMap((message) => [
      message?.text,
      message?.attachmentLabel,
      message?.attachmentText,
      message?.senderName
    ])
  ].filter(Boolean).join(' ');
  const getConversationFilterText = (conversation = {}) => normalizeKeyword([
    conversation.title,
    conversation.subtitle,
    conversation.phone,
    conversation.lastMessage,
    conversation.groupName,
    conversation.customerName,
    conversation.type,
    conversation.conversationKind,
    conversation.sourceItem?.title,
    conversation.sourceItem?.message,
    conversation.sourceItem?.type,
    ...(conversation.messages || []).flatMap((message) => [
      message?.text,
      message?.attachmentLabel,
      message?.attachmentText,
      message?.attachmentType,
      message?.senderName
    ])
  ].filter(Boolean).join(' '));
  const matchesConversationFilter = (conversation = {}) => {
    if (messageFilter === 'unread') return getConversationUnreadCount(conversation) > 0;
    if (messageFilter === 'read') return getConversationUnreadCount(conversation) === 0;
    if (messageFilter === 'customer') return getChatCategory(conversation) === 'customer';
    if (!['promotion', 'care', 'dispatch'].includes(messageFilter)) return true;
    const filterText = getConversationFilterText(conversation);
    if (messageFilter === 'promotion') return /(quang cao|khuyen mai|uu dai|voucher|marketing|promotion|promo)/.test(filterText);
    if (messageFilter === 'care') return /(cham soc|nhac no|cong no|hoi tham|ho tro|tu van|customer care)/.test(filterText);
    if (messageFilter === 'dispatch') return /(phieu xuat|xuat kho|giao hang|dispatch|warehouse)/.test(filterText);
    return true;
  };
  const searchSourceConversations = allVisibleConversations;
  const filteredConversations = searchSourceConversations.filter(hasConversationActivity).filter(matchesConversationFilter).filter((item) => {
    if (!listKeyword) return true;
    return normalizeKeyword(getConversationSearchText(item)).includes(listKeyword);
  }).sort(sortConversationsByPriority);
  const isPinnedConversation = (conversation = {}) => Boolean(
    conversation.isPinned
    || conversation.pinned
    || conversation.isPinnedChat
    || conversation.metadata?.isPinned
  );
  const tabConversations = filterChatConversations(filteredConversations, activeChatTab);
  const chatListPage = usePagedList(
    tabConversations,
    `${currentCompany?.id}|${currentEmployeeId}|${safeActiveType}|${activeChatTab}|${messageFilter}|${listKeyword}`
  );
  const searchResults = useMemo(() => searchKeyword.trim() ? filteredConversations
    .filter((conversation) => {
      if (activeSearchTab === 'people') return ['customer', 'team'].includes(getChatCategory(conversation));
      if (activeSearchTab === 'groups') return getChatCategory(conversation) === 'group';
      if (activeSearchTab === 'files') return (conversation.messages || []).some((message) =>
        ['document', 'file', 'image', 'video'].includes(message.attachmentType) || message.attachmentImage
      );
      return true;
    })
    .map((conversation) => getChatSearchResult(conversation, deferredSearchKeyword)) : [],
  [activeSearchTab, deferredSearchKeyword, filteredConversations, searchKeyword]);
  const chatSearchPage = usePagedList(searchResults,
    `${currentCompany?.id}|${currentEmployeeId}|${activeSearchTab}|${deferredSearchKeyword}`);
  const unreadFilteredConversations = filteredConversations.filter((conversation) => getConversationUnreadCount(conversation) > 0);
  const canMarkFilteredUnreadAsRead = messageFilter === 'unread' && unreadFilteredConversations.length > 0;
  const handleMarkFilteredUnreadAsRead = () => {
    if (!unreadFilteredConversations.length) return;
    const now = Date.now();
    setReadConversationWatermarks((prev) => {
      const next = { ...(prev || {}) };
      unreadFilteredConversations.forEach((conversation) => {
        if (conversation?.id) next[conversation.id] = now;
      });
      return next;
    });
    setShowMessageFilterMenu(false);
  };
  const handleRefreshChats = () => {
    if (isRefreshingChats) return;
    setIsRefreshingChats(true);
    if (chatListRefreshTimerRef.current) window.clearTimeout(chatListRefreshTimerRef.current);
    chatListRefreshTimerRef.current = window.setTimeout(() => {
      setIsRefreshingChats(false);
      setStatus('Danh sách tin nhắn đã được làm mới.');
      chatListRefreshTimerRef.current = null;
    }, 450);
  };
  const handleChatListTouchStart = (event) => {
    if (event.currentTarget.scrollTop <= 0) {
      chatListTouchStartRef.current = event.touches?.[0]?.clientY ?? null;
    }
  };
  const handleChatListTouchEnd = (event) => {
    const startY = chatListTouchStartRef.current;
    const endY = event.changedTouches?.[0]?.clientY;
    chatListTouchStartRef.current = null;
    if (startY === null || startY === undefined || endY === undefined) return;
    if (endY - startY > 56) handleRefreshChats();
  };
  const baseMessages = selectedConversation?.messages || [];
  const sentMessages = selectedConversation ? (localReplies[selectedConversation.id] || []) : [];
  const chatKeyword = normalizeKeyword(deferredChatSearchKeyword);
  const visibleMessages = [...baseMessages, ...sentMessages].filter((message) => {
    if (!chatKeyword) return true;
    return normalizeKeyword([message.text, message.attachmentLabel, message.attachmentText].filter(Boolean).join(' ')).includes(chatKeyword);
  });
  const cleanChatDisplayText = (value = '') => `${value || ''}`;
  const formatConversationListTime = (value) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    const today = new Date();
    const isSameDay = parsed.getFullYear() === today.getFullYear()
      && parsed.getMonth() === today.getMonth()
      && parsed.getDate() === today.getDate();
    if (isSameDay) {
      return chatListTimeFormatter.format(parsed);
    }
    return (parsed.getFullYear() === today.getFullYear() ? chatListMonthDayFormatter : vietnamDateFormatter).format(parsed);
  };
  const getConversationLatestMessage = (conversation = {}) => {
    const conversationMessages = [...(conversation.messages || [])]
      .filter((message) => message && !message.isSystemIntro && !message.isFallback)
      .sort((a, b) => getMessageActivityAt(a) - getMessageActivityAt(b));
    return conversationMessages[conversationMessages.length - 1] || {};
  };
  const getConversationPreview = (conversation = {}, displayName = '') => {
    const latestMessage = getConversationLatestMessage(conversation);
    const messageText = cleanChatDisplayText(latestMessage.text || latestMessage.attachmentText || conversation.lastMessage || conversation.subtitle || '');
    let cleanMessageText = messageText.replace(/\s+/g, ' ').trim();
    const senderName = cleanChatDisplayText(latestMessage.senderName || '').trim();
    const titleText = cleanChatDisplayText(conversation.title || '').trim();
    const identityCandidates = [
      displayName,
      conversation.customerName,
      conversation.sourceItem?.customerName,
      conversation.sourceItem?.sourceNotification?.customerName,
      senderName
    ]
      .map((value) => cleanChatDisplayText(value).replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    const normalizedMessage = normalizeKeyword(cleanMessageText);
    const duplicatePrefix = identityCandidates.find((identity) => {
      const normalizedIdentity = normalizeKeyword(identity);
      return normalizedIdentity
        && normalizedMessage.startsWith(normalizedIdentity)
        && (normalizedMessage === normalizedIdentity || /[\s:,-]/.test(normalizedMessage[normalizedIdentity.length] || ''));
    });
    if (duplicatePrefix) {
      cleanMessageText = cleanMessageText.slice(duplicatePrefix.length).replace(/^\s*(?:-|:|•|\||,)?\s*/, '').trim();
    }
    const shouldPrefixSender = senderName
      && normalizeKeyword(senderName) !== normalizeKeyword(titleText)
      && normalizeKeyword(senderName) !== normalizeKeyword(displayName)
      && normalizeKeyword(senderName) !== 'ban';
    if (shouldPrefixSender && cleanMessageText) return `${senderName}: ${cleanMessageText}`;
    return cleanMessageText || cleanChatDisplayText(conversation.subtitle || '').trim();
  };
  const extractNoticeLeadName = (value = '') => {
    const text = cleanChatDisplayText(value).replace(/\s+/g, ' ').trim();
    if (!text) return '';
    const patterns = [
      /^(.+?)\s+(?:vừa|đã|đang|cần|còn)\s+/i,
      /^(.+?)\s+-\s+/,
      /^(.+?)\s*:\s+/
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
    return '';
  };
  const getConversationDisplayName = (conversation = {}) => {
    const sourceItem = conversation.sourceItem || {};
    const sourceNotification = sourceItem.sourceNotification || {};
    const customer = customerById.get(conversation.customerId || sourceItem.customerId || sourceNotification.customerId) || {};
    const latestMessage = getConversationLatestMessage(conversation);
    const candidates = [
      conversation.customerName,
      sourceItem.customerName,
      sourceNotification.customerName,
      customer.name,
      customer.fullName,
      sourceItem.searchKeyword,
      sourceNotification.searchKeyword,
      extractNoticeLeadName(sourceItem.message || conversation.lastMessage),
      conversation.conversationKind === 'internal_group' ? conversation.groupName : '',
      conversation.title,
      latestMessage.senderName
    ];
    return cleanChatDisplayText(candidates.find((item) => cleanChatDisplayText(item).trim()) || 'Tin nhắn').trim();
  };
  const getConversationTypeLabel = (conversation = {}, displayName = '') => {
    const sourceTitle = cleanChatDisplayText(conversation.sourceItem?.title || '').trim();
    const titleText = cleanChatDisplayText(conversation.title || '').trim();
    const normalizedDisplayName = normalizeKeyword(displayName);
    const normalizedTitle = normalizeKeyword(titleText);
    if (conversation.type === 'notice') return sourceTitle || titleText || 'Thông báo';
    if (conversation.conversationKind === 'customer_support') return 'Khách hàng';
    if (conversation.conversationKind === 'internal_group') return 'Nhóm nội bộ';
    if (conversation.type === 'support') return 'Hỗ trợ';
    if (conversation.type === 'internal') return normalizedTitle && normalizedTitle !== normalizedDisplayName ? titleText : 'Nội bộ';
    return normalizedTitle && normalizedTitle !== normalizedDisplayName ? titleText : '';
  };
  const typeUnreadCounts = Object.fromEntries(
    Object.entries(conversationGroups).map(([type, conversations]) => [
      type,
      (conversations || []).reduce((sum, conversation) => {
        const decorated = decorateConversationUnread(conversation);
        return sum + getConversationUnreadCount(decorated);
      }, 0)
    ])
  );
  const handleSelectConversation = (conversation) => {
    if (!conversation?.id) return;
    setShowMessageFilterMenu(false);
    setSelectedConversationId(conversation.id);
    if (getConversationUnreadCount(conversation) > 0) {
      setReadConversationWatermarks((prev) => ({
        ...prev,
        [conversation.id]: Date.now()
      }));
    }
  };
  const attachmentPickerItems = useMemo(() => {
    if (!attachmentPickerConfig) return [];
    const keyword = normalizeKeyword(attachmentPickerSearch);
    const rawItems = Array.isArray(attachmentPickerConfig.items) ? attachmentPickerConfig.items : [];
    if (!keyword) return rawItems;
    return rawItems.filter(item => normalizeKeyword([
      attachmentPickerConfig.getTitle?.(item),
      attachmentPickerConfig.getSubtitle?.(item)
    ].filter(Boolean).join(' ')).includes(keyword));
  }, [attachmentPickerConfig, attachmentPickerSearch]);
  const closeAttachmentPicker = () => {
    setAttachmentPickerConfig(null);
    setAttachmentPickerType('');
    setAttachmentPickerSearch('');
  };

  const getUniversalBarcodeDetector = async () => {
    if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
      throw new Error('Thiết bị này chưa hỗ trợ quét mã tự động.');
    }
    const defaultFormats = ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'codabar', 'data_matrix', 'pdf417', 'aztec'];
    const supportedFormats = typeof window.BarcodeDetector.getSupportedFormats === 'function'
      ? await window.BarcodeDetector.getSupportedFormats()
      : defaultFormats;
    const formats = defaultFormats.filter((format) => supportedFormats.includes(format));
    return new window.BarcodeDetector({ formats: formats.length > 0 ? formats : supportedFormats });
  };

  const getZxingCodeReader = async () => {
    const { BrowserMultiFormatReader } = await import('@zxing/browser');
    return new BrowserMultiFormatReader();
  };

  const getZxingResultText = (result) => {
    if (!result) return '';
    if (typeof result.getText === 'function') return `${result.getText() || ''}`.trim();
    return `${result.text || result.rawValue || result || ''}`.trim();
  };

  const detectCodeFromImageFile = async (file) => {
    try {
      const detector = await getUniversalBarcodeDetector();
      if (typeof window.createImageBitmap === 'function') {
        const bitmap = await window.createImageBitmap(file);
        const results = await detector.detect(bitmap);
        if (typeof bitmap.close === 'function') bitmap.close();
        const detectedCode = `${results?.[0]?.rawValue || ''}`.trim();
        if (detectedCode) return detectedCode;
      }
    } catch (error) {
      console.warn('Native barcode image scan unavailable, falling back to ZXing.', error);
    }

    const reader = await getZxingCodeReader();
    const imageUrl = URL.createObjectURL(file);
    try {
      const result = await reader.decodeFromImageUrl(imageUrl);
      return getZxingResultText(result);
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  };

  const stopHeaderCodeScanner = () => {
    if (codeScannerTimerRef.current) {
      window.clearTimeout(codeScannerTimerRef.current);
      codeScannerTimerRef.current = null;
    }
    if (codeScannerZxingControlsRef.current) {
      try {
        codeScannerZxingControlsRef.current.stop?.();
      } catch (error) {
        console.warn('Failed to stop ZXing scanner.', error);
      }
      codeScannerZxingControlsRef.current = null;
    }
    const stream = codeScannerStreamRef.current;
    if (stream) {
      stream.getTracks?.().forEach((track) => track.stop());
      codeScannerStreamRef.current = null;
    }
    if (codeScannerVideoRef.current) {
      codeScannerVideoRef.current.srcObject = null;
    }
    setIsCameraScanning(false);
  };

  const openHeaderCodeScanner = () => {
    setShowCreateConversationPanel(false);
    setShowMessageFilterMenu(false);
    setCodeScannerStatus('');
    setCodeScanResult('');
    setShowCodeScanner(true);
  };

  const closeHeaderCodeScanner = () => {
    stopHeaderCodeScanner();
    setShowCodeScanner(false);
    setCodeScannerStatus('');
  };

  const startHeaderCameraScanner = async () => {
    try {
      setCodeScannerStatus('Đang mở camera...');
      setCodeScanResult('');
      let detector = null;
      try {
        detector = await getUniversalBarcodeDetector();
      } catch (error) {
        console.warn('Native barcode camera scan unavailable, falling back to ZXing.', error);
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Thiết bị này chưa cho phép mở camera từ app.');
      }
      stopHeaderCodeScanner();
      const video = codeScannerVideoRef.current;
      if (!video) throw new Error('Chưa khởi tạo được màn hình camera.');
      setIsCameraScanning(true);
      setCodeScannerStatus('Đưa QR hoặc mã vạch vào khung để quét.');

      if (detector) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false
        });
        codeScannerStreamRef.current = stream;
        video.srcObject = stream;
        await video.play();
        const scanFrame = async () => {
          if (!codeScannerStreamRef.current || !codeScannerVideoRef.current) return;
          try {
            const currentVideo = codeScannerVideoRef.current;
            if (currentVideo.readyState >= 2) {
              const results = await detector.detect(currentVideo);
              const detectedCode = `${results?.[0]?.rawValue || ''}`.trim();
              if (detectedCode) {
                setCodeScanResult(detectedCode);
                setCodeScannerStatus(`Đã quét được mã: ${detectedCode}`);
                stopHeaderCodeScanner();
                return;
              }
            }
          } catch (error) {
            console.warn('Header scanner frame failed.', error);
          }
          codeScannerTimerRef.current = window.setTimeout(scanFrame, 450);
        };
        scanFrame();
        return;
      }

      const reader = await getZxingCodeReader();
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } }, audio: false },
        video,
        (result, error, controlsRef) => {
          const detectedCode = getZxingResultText(result);
          if (!detectedCode) return;
          setCodeScanResult(detectedCode);
          setCodeScannerStatus(`Đã quét được mã: ${detectedCode}`);
          controlsRef?.stop?.();
          codeScannerZxingControlsRef.current = null;
          setIsCameraScanning(false);
        }
      );
      codeScannerZxingControlsRef.current = controls;
    } catch (error) {
      console.warn('Failed to start header scanner.', error);
      stopHeaderCodeScanner();
      setCodeScannerStatus(error?.message || 'Chưa mở được camera. Bạn có thể chọn ảnh chứa mã để quét.');
    }
  };

  const handleHeaderCodeImageScan = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCodeScannerStatus('Đang đọc mã trong ảnh...');
    setCodeScanResult('');
    try {
      const detectedCode = await detectCodeFromImageFile(file);
      if (!detectedCode) {
        setCodeScannerStatus('Chưa đọc được mã trong ảnh. Bạn thử ảnh rõ hơn hoặc chụp gần mã hơn.');
        return;
      }
      setCodeScanResult(detectedCode);
      setCodeScannerStatus(`Đã quét được mã: ${detectedCode}`);
    } catch (error) {
      console.warn('Failed to scan code image.', error);
      setCodeScannerStatus(error?.message || 'Chưa đọc được mã trong ảnh này.');
    } finally {
      if (codeScannerFileInputRef.current) codeScannerFileInputRef.current.value = '';
    }
  };

  const useScannedCodeForMessageSearch = () => {
    if (!codeScanResult.trim()) return;
    setSearchKeyword(codeScanResult.trim());
    closeHeaderCodeScanner();
  };

  const copyScannedCode = async () => {
    const cleanCode = codeScanResult.trim();
    if (!cleanCode) return;
    try {
      await navigator.clipboard?.writeText(cleanCode);
      setCodeScannerStatus('Đã sao chép mã.');
    } catch (error) {
      setCodeScannerStatus('Không thể tự sao chép, bạn hãy bôi đen mã để copy thủ công.');
    }
  };

  const openScannedCodeContent = () => {
    const cleanCode = codeScanResult.trim();
    if (!cleanCode) return;
    if (/^https?:\/\//i.test(cleanCode)) {
      window.open(cleanCode, '_blank', 'noopener,noreferrer');
      return;
    }
    useScannedCodeForMessageSearch();
  };

  useEffect(() => () => stopHeaderCodeScanner(), []);

  useEffect(() => {
    if (!selectedConversationId) {
      setShowAttachMenu(false);
      setShowChatSearch(false);
      setChatSearchKeyword('');
      setDraft('');
    }
  }, [selectedConversationId]);

  useEffect(() => () => {
    if (chatListRefreshTimerRef.current) window.clearTimeout(chatListRefreshTimerRef.current);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleScreenBack = (event) => {
      if (showAttachMenu) {
        setShowAttachMenu(false);
        markAppBackHandled(event);
        return;
      }
      if (showChatSearch) {
        setShowChatSearch(false);
        setChatSearchKeyword('');
        markAppBackHandled(event);
        return;
      }
      if (showMessageFilterMenu) {
        setShowMessageFilterMenu(false);
        markAppBackHandled(event);
        return;
      }
      if (showCodeScanner) {
        closeHeaderCodeScanner();
        markAppBackHandled(event);
        return;
      }
      if (showCreateConversationPanel) {
        setShowCreateConversationPanel(false);
        markAppBackHandled(event);
        return;
      }
      if (showAddFriendPanel) {
        setShowAddFriendPanel(false);
        markAppBackHandled(event);
        return;
      }
      if (selectedConversationId) {
        setSelectedConversationId('');
        markAppBackHandled(event);
      }
    };
    window.addEventListener(APP_SCREEN_BACK_EVENT, handleScreenBack);
    return () => window.removeEventListener(APP_SCREEN_BACK_EVENT, handleScreenBack);
  }, [selectedConversationId, showAddFriendPanel, showAttachMenu, showChatSearch, showCodeScanner, showCreateConversationPanel, showMessageFilterMenu]);

  const typeOptions = [
    { id: 'support', label: 'H\u1ed7 tr\u1ee3', icon: Headphones, color: 'from-amber-400 to-orange-500' },
    { id: 'internal', label: 'N\u1ed9i b\u1ed9', icon: MessageCircle, color: 'from-sky-500 to-indigo-500' },
    { id: 'notice', label: 'Th\u00f4ng b\u00e1o', icon: Megaphone, color: 'from-violet-500 to-fuchsia-500' }
  ];
  const visibleTypeOptions = typeOptions
    .filter((type) => visibleMessageTypes.includes(type.id))
    .sort((a, b) => (typeUnreadCounts[b.id] || 0) - (typeUnreadCounts[a.id] || 0));
  const canUseCreateConversation = visibleMessageTypes.includes('internal') && canSendInternalMessages;

  const attachActions = [
    { id: 'image', label: 'H\u00ecnh \u1ea3nh', icon: ImagePlus, color: 'bg-pink-500', allowed: canSendImageAttachment },
    { id: 'contact', label: 'Danh b\u1ea1', icon: Users, color: 'bg-amber-500', allowed: canSendContactAttachment },
    { id: 'location', label: 'V\u1ecb tr\u00ed', icon: MapPin, color: 'bg-rose-500', allowed: canSendLocationAttachment },
    { id: 'bank', label: 'S\u1ed1 TK', icon: CreditCard, color: 'bg-emerald-500', allowed: canSendBankQrAttachment },
    { id: 'order', label: '\u0110\u01a1n h\u00e0ng', icon: Receipt, color: 'bg-blue-500', allowed: canSendOrderAttachment },
    { id: 'report', label: 'B\u00e1o c\u00e1o', icon: PieChart, color: 'bg-violet-500', allowed: canSendReportAttachment },
    { id: 'customer', label: 'Kh\u00e1ch h\u00e0ng', icon: UserCircle, color: 'bg-cyan-500', allowed: canSendContactAttachment },
    { id: 'order_request', label: '\u0110\u01a1n \u0111\u1eb7t', icon: ClipboardList, color: 'bg-teal-500', allowed: canSendOrderRequestAttachment }
  ].filter(action => action.allowed);
  const visualAttachActions = [
    { id: 'image', label: 'Ảnh', allowed: canSendImageAttachment },
    { id: 'camera', label: 'Camera', allowed: canSendImageAttachment },
    { id: 'video', label: 'Video', allowed: false },
    { id: 'document', label: 'Tài liệu', allowed: false },
    { id: 'location', label: 'Vị trí', allowed: canSendLocationAttachment },
    { id: 'contact', label: 'Liên hệ', allowed: canSendContactAttachment },
    { id: 'order', label: 'Đơn hàng', allowed: canSendOrderAttachment },
    { id: 'weighing', label: 'Phiếu cân', allowed: false }
  ];

  const buildOutgoingMessageMeta = (conversation = {}) => {
    const isInternalGroup = conversation.conversationKind === 'internal_group';
    const isCustomerSupport = conversation.conversationKind === 'customer_support';
    const participantEmpIds = isInternalGroup
      ? [...new Set([currentEmployeeId, ...(conversation.participantEmpIds || [])].filter(Boolean))]
      : [];
    return {
      conversationId: conversation.conversationId || conversation.id,
      conversationType: isInternalGroup ? 'internal_group' : (isCustomerSupport ? 'customer_support' : conversation.type),
      type: isInternalGroup ? 'internal_group' : (isCustomerSupport ? 'employee_to_customer' : 'internal_message'),
      recipientEmpId: isInternalGroup ? '' : (conversation.counterpartEmpId || conversation.receiverEmpId || ''),
      receiverEmpId: isInternalGroup ? '' : (conversation.counterpartEmpId || conversation.receiverEmpId || ''),
      customerId: conversation.customerId || '',
      customerName: isCustomerSupport ? (conversation.title || conversation.customerName || '') : '',
      groupId: isInternalGroup ? (conversation.groupId || conversation.id || conversation.conversationId || '') : '',
      groupName: isInternalGroup ? (conversation.groupName || conversation.title || 'Nhóm nội bộ') : '',
      participantEmpIds
    };
  };

  const buildInternalConversationId = (leftId = '', rightId = '') => `internal-${[leftId, rightId].filter(Boolean).sort().join('-')}`;
  const buildCustomerEmployeeConversationId = (customerId = '') => buildCustomerSupportConversationId(customerId);

  const handleConnectConversationByPhone = () => {
    const rawQuery = `${phoneConnectDraft || ''}`.trim();
    const phoneKey = normalizeCustomerPhone(rawQuery);
    const keyword = normalizeKeyword(rawQuery);
    if (!phoneKey && keyword.length < 2) {
      setStatus('Hãy nhập số điện thoại hoặc tên hồ sơ để tìm người nhắn.');
      return;
    }
    const matchesProfileQuery = (values = []) => {
      const cleanValues = values.filter(Boolean);
      if (phoneKey && cleanValues.some((value) => isSameLoginPhone(value, rawQuery))) return true;
      if (keyword.length >= 2 && cleanValues.some((value) => normalizeKeyword(value).includes(keyword))) return true;
      return false;
    };

    const matchedEmployee = (employees || []).find((item) => (
      item?.id
      && item.id !== currentEmployeeId
      && !item.isArchived
      && matchesProfileQuery([
        item.phone,
        item.name,
        item.fullName,
        item.displayName,
        item.role,
        item.department,
        item.position
      ])
    ));

    if (matchedEmployee) {
      const conversationId = buildInternalConversationId(currentEmployeeId, matchedEmployee.id);
      setActiveType('internal');
      setSelectedConversationId(conversationId);
      setPhoneConnectDraft('');
      setShowCreateConversationPanel(false);
      setShowAddFriendPanel(false);
      setStatus(`Đã mở chat với ${matchedEmployee.name || matchedEmployee.fullName || matchedEmployee.phone || 'nhân sự'}.`);
      return;
    }

    const matchedCustomer = (customers || []).find((customer) => (
      customer?.id
      && !customer.isArchived
      && matchesProfileQuery([
        customer.phone,
        customer.name,
        customer.fullName,
        customer.displayName,
        customer.code,
        customer.address,
        customer.group,
        customer.customerGroup
      ])
    ));

    if (matchedCustomer) {
      const assignedEmployeeId = getCustomerMessagingEmployeeId(matchedCustomer);
      if (!canViewAllNotifications && assignedEmployeeId !== currentEmployeeId) {
        setStatus('Bạn không phụ trách khách hàng này nên không thể mở hội thoại.');
        return;
      }
      const conversationId = buildCustomerEmployeeConversationId(matchedCustomer.id);
      const savedMessages = storedMessagesByConversation[conversationId] || [];
      const latestMessage = savedMessages[savedMessages.length - 1];
      const conversation = {
        id: conversationId,
        conversationId,
        type: 'internal',
        conversationKind: 'customer_support',
        customerId: matchedCustomer.id,
        title: matchedCustomer.name || matchedCustomer.fullName || matchedCustomer.phone || 'Khách hàng',
        subtitle: `${matchedCustomer.phone || 'Khách hàng'} • Chat khách hàng`,
        phone: matchedCustomer.phone || '',
        avatarUrl: matchedCustomer.avatarUrl || matchedCustomer.avatar || '',
        color: 'from-emerald-500 to-teal-500',
        lastMessage: latestMessage?.text || 'Bắt đầu trao đổi với khách hàng.',
        createdAt: latestMessage?.createdAt || Date.now(),
        messages: savedMessages
      };
      setManualConversations((prev) => ({ ...prev, [conversationId]: conversation }));
      setActiveType('internal');
      setSelectedConversationId(conversationId);
      setPhoneConnectDraft('');
      setShowCreateConversationPanel(false);
      setShowAddFriendPanel(false);
      setStatus(`Đã mở chat với ${conversation.title}.`);
      return;
    }

    setStatus('Chưa tìm thấy nhân sự hoặc khách hàng theo số điện thoại / tên hồ sơ này.');
  };

  const groupableEmployees = useMemo(() => {
    const keyword = normalizeKeyword(groupSearchKeyword);
    return (employees || [])
      .filter((item) => item?.id && item.id !== currentEmployeeId && !item?.isArchived)
      .filter((item) => {
        if (!keyword) return true;
        return normalizeKeyword([item.name, item.fullName, item.phone, item.role, item.department, item.position].filter(Boolean).join(' ')).includes(keyword);
      })
      .slice(0, 40);
  }, [currentEmployeeId, employees, groupSearchKeyword]);

  const toggleGroupMember = (employeeId) => {
    setGroupMemberIds((prev) => prev.includes(employeeId)
      ? prev.filter((id) => id !== employeeId)
      : [...prev, employeeId]);
  };

  const closeCreateGroup = () => {
    setShowCreateGroup(false);
    setGroupNameDraft('');
    setGroupMemberIds([]);
    setGroupSearchKeyword('');
  };

  const handleCreateInternalGroup = async () => {
    if (!canSendInternalMessages || typeof onAddMessage !== 'function') {
      setStatus('Tài khoản này chưa được cấp quyền tạo nhóm nội bộ.');
      return;
    }
    const participantEmpIds = [...new Set([currentEmployeeId, ...groupMemberIds].filter(Boolean))];
    if (participantEmpIds.length < 2) {
      setStatus('Hãy chọn ít nhất 1 nhân sự để tạo nhóm.');
      return;
    }
    const groupName = groupNameDraft.trim() || `Nhóm ${participantEmpIds
      .filter((id) => id !== currentEmployeeId)
      .map((id) => employeeById.get(id)?.name || employeeById.get(id)?.fullName || 'Nhân sự')
      .slice(0, 3)
      .join(', ')}`;
    const groupId = `internal_group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      await onAddMessage({
        conversationId: groupId,
        conversationType: 'internal_group',
        type: 'internal_group',
        groupId,
        groupName,
        participantEmpIds,
        text: `Đã tạo nhóm ${groupName}.`
      });
      setActiveType('internal');
      setSelectedConversationId(groupId);
      closeCreateGroup();
      setStatus('Đã tạo nhóm nội bộ.');
    } catch (error) {
      console.warn('Failed to create internal group.', error);
      setStatus(getFriendlyFirebaseErrorMessage(error, 'Chưa tạo được nhóm nội bộ.'));
    }
  };

  const handleCall = () => {
    if (!canCallFromMessage) {
      setStatus('Tài khoản này chưa được cấp quyền gọi điện từ hội thoại.');
      return;
    }
    const phone = `${selectedConversation?.phone || ''}`.trim();
    if (!phone) {
      setStatus('Hội thoại này chưa có số điện thoại để gọi.');
      return;
    }
    window.location.href = `tel:${phone}`;
  };

  const handleSendMessage = async () => {
    if (!selectedConversation || !draft.trim()) return;
    if (!canSendInSelectedConversation) {
      setStatus('Tài khoản này chưa được cấp quyền gửi tin trong hội thoại này.');
      return;
    }
    const nextText = draft.trim();
    setDraft('');
    if (selectedConversation.type !== 'notice' && typeof onAddMessage === 'function') {
      try {
        await onAddMessage({
          ...buildOutgoingMessageMeta(selectedConversation),
          text: nextText
        });
        setStatus('Đã gửi và đồng bộ tin nhắn.');
        return;
      } catch (error) {
        console.warn('Failed to sync message.', error);
        setDraft(nextText);
        setStatus(getFriendlyFirebaseErrorMessage(error, 'Chưa gửi được tin nhắn lên cloud. Vui lòng thử lại.'));
        return;
      }
    }

    setDraft(nextText);
    setStatus('Chưa có kết nối lưu tin nhắn cho hội thoại này.');
  };

  const sendAttachmentPayload = async ({ text = '', attachmentType = '', attachmentLabel = '', attachmentText = '', attachmentImage = '' } = {}) => {
    if (!selectedConversation) return;
    if (!canSendInSelectedConversation) {
      setStatus('Tài khoản này chưa được cấp quyền gửi thông tin trong hội thoại này.');
      return;
    }
    const cleanText = `${text || ''}`.trim();
    const cleanAttachmentText = `${attachmentText || ''}`.trim();
    if (!cleanText && !cleanAttachmentText && !attachmentImage) return;

    if (selectedConversation.type !== 'notice' && typeof onAddMessage === 'function') {
      try {
        await onAddMessage({
          ...buildOutgoingMessageMeta(selectedConversation),
          text: cleanText,
          attachmentType,
          attachmentLabel,
          attachmentText: cleanAttachmentText,
          attachmentImage
        });
        setStatus('Đã gửi và đồng bộ thông tin.');
        return;
      } catch (error) {
        console.warn('Failed to sync attachment message.', error);
        setStatus(getFriendlyFirebaseErrorMessage(error, 'Chưa gửi được thông tin lên cloud. Vui lòng thử lại.'));
        return;
      }
    }

    setStatus('Chưa có kết nối lưu thông tin cho hội thoại này.');
  };

  const pickChatItemByPrompt = (items = [], title = 'Chọn thông tin', getLabel = (item) => item?.name || '') => {
    const availableItems = (items || []).filter(Boolean).slice(0, 20);
    if (!availableItems.length) {
      setStatus(`Chưa có dữ liệu để gửi ${title.toLowerCase()}.`);
      return null;
    }
    const optionText = availableItems.map((item, index) => `${index + 1}. ${getLabel(item)}`).join('\n');
    const answer = window.prompt(`${title}\nNhập số thứ tự hoặc gõ tên cần tìm:\n\n${optionText}`, '1');
    if (!answer) return null;
    const numericIndex = parseInt(answer, 10);
    if (Number.isFinite(numericIndex) && numericIndex >= 1 && numericIndex <= availableItems.length) {
      return availableItems[numericIndex - 1];
    }
    const keyword = normalizeKeyword(answer);
    return availableItems.find(item => normalizeKeyword(getLabel(item)).includes(keyword)) || null;
  };

  const buildChatCustomerText = (customer = {}) => [
    `Khách: ${getCustomerDisplayName(customer) || customer.name || customer.fullName || 'Liên hệ'}`,
    customer.phone ? `SĐT: ${customer.phone}` : '',
    customer.address ? `Địa chỉ: ${customer.address}` : '',
    customer.locationUrl ? `Vị trí: ${customer.locationUrl}` : '',
    customer.note ? `Ghi chú: ${customer.note}` : ''
  ].filter(Boolean).join('\n');

  const buildCleanChatCustomerText = (customer = {}) => [
    `Kh\u00e1ch: ${getCustomerDisplayName(customer) || customer.name || customer.fullName || 'Li\u00ean h\u1ec7'}`,
    customer.phone ? `S\u0110T: ${customer.phone}` : '',
    customer.address ? `\u0110\u1ecba ch\u1ec9: ${customer.address}` : '',
    customer.locationUrl ? `V\u1ecb tr\u00ed: ${customer.locationUrl}` : '',
    customer.note ? `Ghi ch\u00fa: ${customer.note}` : ''
  ].filter(Boolean).join('\n');

  const buildChatOrderText = (order = {}) => {
    const customer = customerById.get(order.customerId) || {};
    const total = order.amount || order.total || order.totalAmount || 0;
    const paid = order.paid || order.paidAmount || order.collectedAmount || 0;
    return [
      `Mã đơn: ${order.code || order.id || 'Chưa có mã'}`,
      `Khách: ${customer.name || order.customerName || order.customerNameSnapshot || 'Khách hàng'}`,
      `Ngày: ${formatDateLabel(order.date || order.createdAt || getEntityTimestamp(order))}`,
      `Tổng: ${formatCurrency(total)} đ`,
      `Đã thu: ${formatCurrency(paid)} đ`,
      `Còn nợ: ${formatCurrency(Math.max(0, total - paid))} đ`
    ].join('\n');
  };

  const buildChatOrderRequestText = (request = {}) => {
    const customer = customerById.get(request.customerId) || {};
    const items = Array.isArray(request.items) && request.items.length ? request.items : (request.primaryItem ? [request.primaryItem] : []);
    const itemLines = items.map((item, index) => {
      const product = productById.get(item.productId) || {};
      const productName = getProductShortName(product) || product.name || item.description || item.productName || `Mặt hàng ${index + 1}`;
      const quantity = formatNumber(parseLooseQuantityValue(item.quantity || item.quantityCount || 0));
      const unit = item.quantityUnit || item.unit || '';
      const size = item.sizeLabel || item.size || '';
      const price = item.unitPrice ? ` • ${formatCurrency(item.unitPrice)} đ` : '';
      return `- ${productName}: ${quantity}${unit ? ` ${unit}` : ''}${size ? ` • Size ${size}` : ''}${price}`;
    });
    return [
      `Khách: ${customer.name || request.customerName || request.customerNameSnapshot || 'Khách hàng'}`,
      `Ngày đặt: ${formatDateLabel(request.date || request.createdAt || getEntityTimestamp(request))}`,
      itemLines.length ? itemLines.join('\n') : 'Chưa có dòng hàng.'
    ].join('\n');
  };

  const buildChatReportText = () => {
    const today = getTodayString();
    const todayOrders = (orders || []).filter(order => `${order.date || order.createdAt || getEntityTimestamp(order) || ''}`.startsWith(today));
    const revenue = todayOrders.reduce((sum, order) => sum + (order.amount || order.total || order.totalAmount || 0), 0);
    const totalPaid = (payments || []).reduce((sum, payment) => sum + (payment.amount || 0), 0);
    const totalExpense = (expenses || []).reduce((sum, expense) => sum + (expense.amount || 0), 0);
    return [
      `Báo cáo nhanh ngày ${formatDateLabel(today)}`,
      `Đơn hôm nay: ${todayOrders.length}`,
      `Doanh thu hôm nay: ${formatCurrency(revenue)} đ`,
      `Tổng thu đã ghi nhận: ${formatCurrency(totalPaid)} đ`,
      `Tổng chi đã ghi nhận: ${formatCurrency(totalExpense)} đ`
    ].join('\n');
  };

  const readChatImageAttachment = (file) => new Promise((resolve, reject) => {
    if (!file) {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được hình ảnh.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Không xử lý được hình ảnh.'));
      image.onload = () => {
        const maxSide = 900;
        const ratio = Math.min(1, maxSide / Math.max(image.width, image.height, 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * ratio));
        canvas.height = Math.max(1, Math.round(image.height * ratio));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(`${reader.result || ''}`);
          return;
        }
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      image.src = `${reader.result || ''}`;
    };
    reader.readAsDataURL(file);
  });

  const handleRealAttachAction = async (action) => {
    setShowAttachMenu(false);
    if (!selectedConversation) return;

    if (action.id === 'camera') {
      cameraInputRef.current?.click?.();
      return;
    }

    if (!action.id || action.id === 'image') {
      imageInputRef.current?.click?.();
      return;
    }

    if (action.id === 'location') {
      try {
        const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        await sendAttachmentPayload({
          text: 'Gửi vị trí hiện tại',
          attachmentType: 'location',
          attachmentLabel: 'Vị trí',
          attachmentText: `https://maps.google.com/?q=${lat},${lng}\nTọa độ: ${lat.toFixed(6)}, ${lng.toFixed(6)}`
        });
      } catch (error) {
        setStatus(getFriendlyFirebaseErrorMessage(error, 'Không lấy được vị trí hiện tại.'));
      }
      return;
    }

    if (action.id === 'bank') {
      const transferProfile = getInvoiceTransferProfile(currentCompany);
      const transferAccountNumber = transferProfile.sepayReceivingAccountNumber || transferProfile.accountNumber;
      await sendAttachmentPayload({
        text: 'Gửi số tài khoản',
        attachmentType: 'bank',
        attachmentLabel: 'Số tài khoản',
        attachmentText: [
          `Ngân hàng: ${transferProfile.bankName || transferProfile.bankId || 'Chưa cài đặt'}`,
          `Chủ TK: ${transferProfile.accountName || 'Chưa cài đặt'}`,
          `Số TK: ${transferAccountNumber || 'Chưa cài đặt'}${transferProfile.sepayUseVirtualAccount && transferAccountNumber ? ' (VA SePay)' : ''}`
        ].join('\n')
      });
      return;
    }

    if (action.id === 'contact') {
      const item = pickChatItemByPrompt([...(employees || []), ...(customers || [])], 'Chọn danh bạ', entry => `${entry.name || entry.fullName || 'Liên hệ'}${entry.phone ? ` - ${entry.phone}` : ''}`);
      if (!item) return;
      await sendAttachmentPayload({ text: 'G\u1eedi danh b\u1ea1', attachmentType: 'contact', attachmentLabel: 'Danh b\u1ea1', attachmentText: buildCleanChatCustomerText(item) });
      return;
    }

    if (action.id === 'customer') {
      const item = pickChatItemByPrompt(customers, 'Chọn khách hàng', customer => `${customer.name || 'Khách hàng'}${customer.phone ? ` - ${customer.phone}` : ''}`);
      if (!item) return;
      await sendAttachmentPayload({ text: 'G\u1eedi th\u00f4ng tin kh\u00e1ch h\u00e0ng', attachmentType: 'customer', attachmentLabel: 'Kh\u00e1ch h\u00e0ng', attachmentText: buildCleanChatCustomerText(item) });
      return;
    }

    if (action.id === 'order') {
      const item = pickChatItemByPrompt(orders, 'Chọn đơn hàng', order => `${order.code || order.id || 'Đơn hàng'} - ${customerById.get(order.customerId)?.name || order.customerName || ''}`);
      if (!item) return;
      await sendAttachmentPayload({ text: 'Gửi đơn hàng', attachmentType: 'order', attachmentLabel: 'Đơn hàng', attachmentText: buildChatOrderText(item) });
      return;
    }

    if (action.id === 'order_request') {
      const item = pickChatItemByPrompt(orderRequests, 'Chọn đơn đặt', request => `${customerById.get(request.customerId)?.name || request.customerName || 'Đơn đặt'} - ${formatDateLabel(request.date || request.createdAt || getEntityTimestamp(request))}`);
      if (!item) return;
      await sendAttachmentPayload({ text: 'Gửi đơn đặt', attachmentType: 'order_request', attachmentLabel: 'Đơn đặt', attachmentText: buildChatOrderRequestText(item) });
      return;
    }

    if (action.id === 'report') {
      await sendAttachmentPayload({ text: 'Gửi báo cáo nhanh', attachmentType: 'report', attachmentLabel: 'Báo cáo', attachmentText: buildChatReportText() });
    }
  };

  const handleImageAttachmentChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const attachmentImage = await readChatImageAttachment(file);
      await sendAttachmentPayload({
        text: 'Gửi hình ảnh',
        attachmentType: 'image',
        attachmentLabel: file.name || 'Hình ảnh',
        attachmentImage
      });
    } catch (error) {
      setStatus(getFriendlyFirebaseErrorMessage(error, 'Không gửi được hình ảnh.'));
    }
  };

  if (selectedConversation) {
    return (
      <div className="hd-messaging" data-hd-module="messaging" data-chat-screen="conversation">
        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageAttachmentChange} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageAttachmentChange} />
        <ConversationToolbar
          conversation={selectedConversation}
          onBack={() => setSelectedConversationId('')}
          onCall={handleCall}
          onSearch={() => setShowChatSearch((value) => !value)}
          onMore={() => setShowExtraAttachMenu((value) => !value)}
          canCall={canCallFromMessage && Boolean(selectedConversation.phone)}
        />
        {showChatSearch && <div className="hd-chat-inline-search" data-search-zone="true"><Search size={18} /><input data-hd-search-input="true" autoFocus value={chatSearchKeyword} onChange={(event) => setChatSearchKeyword(event.target.value)} placeholder="Tìm trong cuộc trò chuyện..." /></div>}
        <OfflineBanner online={isOnline} />
        {showExtraAttachMenu && <div className="hd-chat-extra-actions" data-search-zone="true">{attachActions.filter((action) => !visualAttachActions.some((primary) => primary.id === action.id)).map((action) => <button type="button" key={action.id} onClick={() => { setShowExtraAttachMenu(false); handleRealAttachAction(action); }}>{action.label}</button>)}</div>}
        <MessageList conversation={selectedConversation} messages={visibleMessages} status={status} onOpenNotice={() => onOpenNotification(selectedConversation.sourceItem)} />

        {attachmentPickerConfig && (
          <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/55 px-0 sm:items-center sm:px-4">
            <div className="w-full max-w-md overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[2rem]">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600">Gửi thông tin</p>
                  <h3 className="mt-1 text-lg font-black text-slate-900">
                    {attachmentPickerType === 'order' ? 'Ch\u1ecdn \u0111\u01a1n h\u00e0ng' : attachmentPickerType === 'order_request' ? 'Ch\u1ecdn \u0111\u01a1n \u0111\u1eb7t' : cleanChatDisplayText(attachmentPickerConfig.title)}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeAttachmentPicker}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600"
                  aria-label="Đóng"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/60 px-3 py-2">
                  <Search size={18} className="text-emerald-600" />
                  <input
                    autoFocus
                    value={attachmentPickerSearch}
                    onChange={(event) => setAttachmentPickerSearch(event.target.value)}
                    placeholder={attachmentPickerType === 'order' ? 'T\u00ecm m\u00e3 \u0111\u01a1n, kh\u00e1ch h\u00e0ng...' : attachmentPickerType === 'order_request' ? 'T\u00ecm kh\u00e1ch, ng\u00e0y \u0111\u1eb7t...' : cleanChatDisplayText(attachmentPickerConfig.placeholder)}
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>
              <div className="max-h-[56vh] space-y-2 overflow-y-auto px-4 pb-5">
                {attachmentPickerItems.length > 0 ? attachmentPickerItems.map((item, index) => (
                  <button
                    key={item.id || `${attachmentPickerType}-${index}`}
                    type="button"
                    onClick={async () => {
                      await attachmentPickerConfig.onSelect(item);
                      closeAttachmentPicker();
                    }}
                    className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50"
                  >
                    <p className="truncate text-sm font-black text-slate-900">{cleanChatDisplayText(attachmentPickerConfig.getTitle(item))}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{cleanChatDisplayText(attachmentPickerConfig.getSubtitle(item))}</p>
                  </button>
                )) : (
                  <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
                    {attachmentPickerType === 'order' ? 'Ch\u01b0a c\u00f3 \u0111\u01a1n h\u00e0ng \u0111\u1ec3 g\u1eedi.' : attachmentPickerType === 'order_request' ? 'Ch\u01b0a c\u00f3 \u0111\u01a1n \u0111\u1eb7t \u0111\u1ec3 g\u1eedi.' : cleanChatDisplayText(attachmentPickerConfig.emptyText)}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {selectedConversation.type !== 'notice' && showAttachMenu && <AttachmentPanel actions={visualAttachActions} onSelect={handleRealAttachAction} onClose={() => setShowAttachMenu(false)} />}
        {selectedConversation.type !== 'notice' && <MessageComposer
          draft={draft}
          onChange={setDraft}
          onSend={handleSendMessage}
          onAttach={() => setShowAttachMenu((value) => !value)}
          onMic={() => setStatus('Ghi âm chưa được hỗ trợ trên thiết bị này.')}
          disabled={!canSendInSelectedConversation}
          panelOpen={showAttachMenu}
        />}
      </div>
    );
  }

  return (
    <div className="hd-messaging" data-hd-module="messaging" data-chat-screen={searchKeyword.trim() ? 'search' : 'list'}>
      <div className="hd-chat-list-head" data-search-zone="true">
        <ChatSearchBar
          value={searchKeyword}
          onChange={setSearchKeyword}
          onClear={() => setSearchKeyword('')}
          onFilter={() => {
            setShowCreateConversationPanel(false);
            setShowMessageFilterMenu(value => !value);
          }}
          filterOpen={showMessageFilterMenu}
          filterActive={messageFilter !== 'all'}
          onCreate={() => {
            setShowMessageFilterMenu(false);
            setShowCreateConversationPanel((value) => !value);
          }}
          createEnabled={canUseCreateConversation}
          placeholder="Tìm kiếm tin nhắn, người dùng..."
        />
        <ChatTabs
          items={searchKeyword.trim() ? CHAT_SEARCH_TABS : CHAT_LIST_TABS.map((tab) => ({ ...tab, badge: tab.id === 'customer' ? unreadFilteredConversations.filter((item) => getChatCategory(item) === 'customer').length : 0 }))}
          value={searchKeyword.trim() ? activeSearchTab : activeChatTab}
          onChange={searchKeyword.trim() ? setActiveSearchTab : setActiveChatTab}
          label={searchKeyword.trim() ? 'Loại kết quả tìm kiếm' : 'Loại cuộc trò chuyện'}
        />
        {showCreateConversationPanel && canUseCreateConversation && (
          <div data-search-zone="true" className="hd-chat-create-menu">
            <div>
              <button
                type="button"
                onClick={() => {
                  setShowCreateConversationPanel(false);
                  setShowAddFriendPanel(true);
                }}
                className="hd-chat-create-menu-item"
              >
                <UserCircle size={19} />
                <span>Thêm bạn</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateConversationPanel(false);
                  setShowCreateGroup(true);
                }}
                className="hd-chat-create-menu-item"
              >
                <Users size={19} />
                <span>Tạo nhóm</span>
              </button>
              <button type="button" className="hd-chat-create-menu-item" onClick={() => { setShowCreateConversationPanel(false); openHeaderCodeScanner(); }}><Scan size={19} /><span>Quét mã</span></button>
              <button type="button" className="hd-chat-create-menu-item" onClick={() => { setShowCreateConversationPanel(false); handleRefreshChats(); }}><RefreshCw size={19} /><span>Làm mới</span></button>
            </div>
          </div>
        )}
        {showMessageFilterMenu && (
            <div data-search-zone="true" className="hd-chat-create-menu">
              <div>
                {messageFilterOptions.map((item) => {
                  const active = item.id === messageFilter;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setMessageFilter(item.id);
                        setShowMessageFilterMenu(false);
                      }}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-black transition ${active ? 'bg-sky-50 text-sky-700' : 'text-slate-700 hover:bg-slate-50'}`}
                    >
                      <span>{item.label}</span>
                      {active && <Check size={17} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
      </div>

      {showCodeScanner && (
        <div
          className="fixed inset-0 z-[76] flex items-end justify-center bg-slate-950/60 px-0 sm:items-center sm:px-4"
          onClick={closeHeaderCodeScanner}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[2rem]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-sky-600">Quét mã</p>
                <h3 className="mt-1 text-lg font-black text-slate-900">QR / mã vạch</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Quét QR, mã đơn, link thanh toán hoặc barcode phổ biến.
                </p>
              </div>
              <button
                type="button"
                onClick={closeHeaderCodeScanner}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600"
                aria-label="Đóng"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <div className="relative h-56 overflow-hidden rounded-3xl border border-sky-100 bg-slate-950">
                <video
                  ref={codeScannerVideoRef}
                  className={`h-full w-full object-cover ${isCameraScanning ? 'opacity-100' : 'opacity-0'}`}
                  muted
                  playsInline
                />
                {!isCameraScanning && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
                      <Scan size={32} />
                    </div>
                    <p className="text-sm font-bold text-white/90">Mở camera hoặc chọn ảnh có mã để quét.</p>
                  </div>
                )}
                {isCameraScanning && (
                  <div className="pointer-events-none absolute inset-10 rounded-3xl border-2 border-sky-300/90 shadow-[0_0_0_999px_rgba(15,23,42,0.25)]" />
                )}
              </div>
              <input
                ref={codeScannerFileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleHeaderCodeImageScan}
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={startHeaderCameraScanner}
                  className="flex min-h-[46px] items-center justify-center gap-2 rounded-2xl bg-sky-600 px-3 py-3 text-sm font-black text-white shadow-lg shadow-sky-100"
                >
                  {isCameraScanning ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
                  {isCameraScanning ? 'Đang quét' : 'Quét camera'}
                </button>
                <button
                  type="button"
                  onClick={() => codeScannerFileInputRef.current?.click()}
                  className="flex min-h-[46px] items-center justify-center gap-2 rounded-2xl border border-sky-100 bg-sky-50 px-3 py-3 text-sm font-black text-sky-700"
                >
                  <ImagePlus size={18} />
                  Chọn ảnh
                </button>
              </div>
              {codeScannerStatus && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                  {codeScannerStatus}
                </div>
              )}
              {codeScanResult && (
                <div className="rounded-3xl border border-emerald-100 bg-emerald-50/70 p-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">Mã đã quét</p>
                  <p className="mt-2 break-all rounded-2xl bg-white px-3 py-2 text-sm font-bold text-slate-900">
                    {codeScanResult}
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={copyScannedCode}
                      className="rounded-2xl bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm"
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={openScannedCodeContent}
                      className="rounded-2xl bg-emerald-600 px-3 py-2 text-xs font-black text-white shadow-sm"
                    >
                      Mở
                    </button>
                    <button
                      type="button"
                      onClick={useScannedCodeForMessageSearch}
                      className="rounded-2xl bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm"
                    >
                      Tìm tin
                    </button>
                  </div>
                </div>
              )}
              <p className="text-center text-[11px] font-semibold text-slate-400">
                Nếu trình duyệt của máy chưa hỗ trợ quét tự động, app sẽ báo rõ để mình dùng camera/ảnh rõ hơn.
              </p>
            </div>
          </div>
        </div>
      )}

      {showAddFriendPanel && (
        <div className="fixed inset-0 z-[74] flex items-end justify-center bg-slate-950/55 px-0 sm:items-center sm:px-4" onClick={() => setShowAddFriendPanel(false)}>
          <div className="w-full max-w-md overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[2rem]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600">Tin nhắn</p>
                <h3 className="mt-1 text-lg font-black text-slate-900">Thêm bạn</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">Tìm theo số điện thoại, tên hồ sơ khách hàng hoặc tên nhân sự.</p>
              </div>
              <button type="button" onClick={() => setShowAddFriendPanel(false)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600" aria-label="Đóng">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5 flex items-center gap-2">
                <Search size={18} className="text-emerald-600" />
                <input
                  value={phoneConnectDraft}
                  onChange={(event) => setPhoneConnectDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleConnectConversationByPhone();
                  }}
                  placeholder="Nhập SĐT hoặc tên hồ sơ"
                  className="min-w-0 flex-1 bg-transparent outline-none text-sm font-semibold text-slate-800 placeholder:text-slate-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleConnectConversationByPhone}
                  className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-emerald-100"
                >
                  Thêm bạn
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddFriendPanel(false);
                    setShowCreateGroup(true);
                  }}
                  className="rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm font-black text-cyan-700"
                >
                  Tạo nhóm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreateGroup && (
        <div className="fixed inset-0 z-[75] flex items-end justify-center bg-slate-950/55 px-0 sm:items-center sm:px-4" onClick={closeCreateGroup}>
          <div className="w-full max-w-md overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[2rem]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-600">Chat nội bộ</p>
                <h3 className="mt-1 text-lg font-black text-slate-900">Tạo nhóm mới</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">Chọn nhân sự để trao đổi công việc cùng lúc.</p>
              </div>
              <button type="button" onClick={closeCreateGroup} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600" aria-label="Đóng">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <input
                value={groupNameDraft}
                onChange={(event) => setGroupNameDraft(event.target.value)}
                placeholder="Tên nhóm, ví dụ: Giao hàng hôm nay"
                className="w-full rounded-2xl border border-cyan-100 bg-cyan-50/50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-cyan-300"
              />
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 flex items-center gap-2">
                <Search size={18} className="text-slate-400" />
                <input
                  data-hd-search-input="true"
                  value={groupSearchKeyword}
                  onChange={(event) => setGroupSearchKeyword(event.target.value)}
                  placeholder="Tìm nhân sự"
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400"
                />
              </div>
              <div className="max-h-[42vh] space-y-2 overflow-y-auto">
                {groupableEmployees.length > 0 ? groupableEmployees.map((item) => {
                  const checked = groupMemberIds.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleGroupMember(item.id)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${checked ? 'border-cyan-200 bg-cyan-50' : 'border-slate-100 bg-white'}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-sm font-black ${checked ? 'bg-cyan-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                          {checked ? <Check size={18} /> : buildInitials(item.name || item.fullName || 'NS')}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-black text-slate-900">{item.name || item.fullName || 'Nhân sự'}</p>
                          <p className="truncate text-xs font-semibold text-slate-500">{item.phone || getEmployeePositionLabel(item.position) || 'Nội bộ'}</p>
                        </div>
                      </div>
                    </button>
                  );
                }) : (
                  <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
                    Chưa tìm thấy nhân sự phù hợp.
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleCreateInternalGroup}
                className="w-full rounded-2xl bg-cyan-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-cyan-100"
              >
                Tạo nhóm ({groupMemberIds.length + 1} người)
              </button>
            </div>
          </div>
        </div>
      )}

      <OfflineBanner online={isOnline} />
      <div
        className={searchKeyword.trim() ? 'hd-chat-results' : 'hd-chat-list'}
        data-chat-list="true"
        onTouchStart={handleChatListTouchStart}
        onTouchEnd={handleChatListTouchEnd}
      >
        {isRefreshingChats ? <ChatState state="loading" /> : searchKeyword.trim() ? (
          searchResults.length ? chatSearchPage.items.map((result) => <SearchResultItem
            key={result.id}
            result={{ ...result, title: getConversationDisplayName(result) }}
            keyword={searchKeyword}
            timestamp={formatConversationListTime(result.matchedMessage?.createdAt || getConversationActivityAt(result))}
            onSelect={() => handleSelectConversation(result)}
          />) : <ChatState state="empty" title="Không tìm thấy kết quả" />
        ) : chatListPage.items.length ? chatListPage.items.map((conversation) => {
          const displayName = getConversationDisplayName(conversation);
          return <ConversationItem
            key={conversation.id}
            conversation={{ ...conversation, title: displayName }}
            displayName={displayName}
            preview={getConversationPreview(conversation, displayName) || getConversationTypeLabel(conversation, displayName) || 'Tin nhắn mới'}
            timestamp={formatConversationListTime(getConversationActivityAt(conversation)) || 'Mới'}
            unreadCount={getConversationUnreadCount(conversation)}
            pinned={isPinnedConversation(conversation)}
            onSelect={() => handleSelectConversation(conversation)}
          />;
        }) : <ChatState state="empty" title={messageFilter !== 'all' ? `Chưa có tin thuộc bộ lọc ${selectedMessageFilter.shortLabel}` : 'Chưa có cuộc trò chuyện'} onStart={canUseCreateConversation ? () => setShowCreateConversationPanel(true) : undefined} />}
        {!isRefreshingChats && <ListPagination pagination={searchKeyword.trim() ? chatSearchPage : chatListPage} label="Phân trang tin nhắn" />}
      </div>
    </div>
  );
}
  return MessageCenterView;
}
