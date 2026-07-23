import React from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App.jsx';
import './index.css';
import { initPerformanceMonitor, recordPerformanceEvent, recordReactRender } from './services/performanceMonitor.js';

function installResponsiveViewportVars() {
  const root = document.documentElement;
  let pendingFrame = 0;
  let pendingKeyboardFrame = 0;

  const getPlatform = () => {
    try {
      return Capacitor.getPlatform?.() || 'web';
    } catch {
      return 'web';
    }
  };

  const isNativePlatform = () => {
    try {
      return Boolean(Capacitor.isNativePlatform?.());
    } catch {
      return false;
    }
  };

  const isIosWebRuntime = () => {
    const ua = navigator.userAgent || '';
    const isiPadOSDesktopMode = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return /iPad|iPhone|iPod/.test(ua) || isiPadOSDesktopMode;
  };

  const isStandaloneWebApp = () => (
    Boolean(window.navigator.standalone)
    || window.matchMedia?.('(display-mode: standalone)')?.matches
  );

  const updateVars = () => {
    pendingFrame = 0;
    const viewport = window.visualViewport;
    const viewportHeight = Math.round(
      viewport?.height || window.innerHeight || document.documentElement.clientHeight || 0
    );
    const viewportWidth = Math.round(
      viewport?.width || window.innerWidth || document.documentElement.clientWidth || 0
    );

    if (viewportHeight > 0) {
      root.style.setProperty('--hd-viewport-height', `${viewportHeight}px`);
    }
    if (viewportWidth > 0) {
      root.style.setProperty('--hd-viewport-width', `${viewportWidth}px`);
    }

    const platform = getPlatform();
    const isAndroidNative = isNativePlatform() && platform === 'android';
    const isIosWeb = !isNativePlatform() && isIosWebRuntime();
    const isStandalone = isStandaloneWebApp();
    const topFallback = isAndroidNative ? '24px' : isIosWeb ? (isStandalone ? '18px' : '12px') : '0px';
    const bottomFallback = isAndroidNative ? '10px' : isIosWeb ? '18px' : '0px';

    // Some WebView/Safari surfaces report env(safe-area-inset-*) as 0 while drawing under system bars.
    root.style.setProperty('--hd-safe-top-fallback', topFallback);
    root.style.setProperty('--hd-safe-bottom-fallback', bottomFallback);
  };

  const isKeyboardEditableElement = (element) => {
    if (!element) return false;
    if (element.isContentEditable) return true;
    const tagName = element.tagName?.toLowerCase();
    if (!['input', 'textarea', 'select'].includes(tagName)) return false;
    const type = (element.getAttribute?.('type') || '').toLowerCase();
    return !['button', 'checkbox', 'color', 'file', 'hidden', 'radio', 'range', 'reset', 'submit'].includes(type);
  };

  const updateKeyboardState = () => {
    pendingKeyboardFrame = 0;
    const viewport = window.visualViewport;
    const focusedEditable = isKeyboardEditableElement(document.activeElement);
    const layoutHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const viewportHeight = viewport?.height || layoutHeight;
    const viewportOffsetTop = viewport?.offsetTop || 0;
    const keyboardHeight = Math.max(0, Math.round(layoutHeight - viewportHeight - viewportOffsetTop));
    const isSmallTouchScreen = Boolean(window.matchMedia?.('(max-width: 768px)')?.matches && navigator.maxTouchPoints > 0);
    const keyboardVisibleByViewport = isSmallTouchScreen && keyboardHeight > 110;
    const isIosWeb = !isNativePlatform() && isIosWebRuntime();
    const shouldHideBottomNav = Boolean(focusedEditable && (keyboardVisibleByViewport || (isSmallTouchScreen && isIosWeb)));

    root.style.setProperty('--hd-keyboard-height', `${keyboardHeight}px`);
    root.classList.toggle('hd-keyboard-open', shouldHideBottomNav);
    document.body?.classList.toggle('hd-keyboard-open', shouldHideBottomNav);
  };

  const scheduleUpdate = () => {
    if (pendingFrame) return;
    pendingFrame = window.requestAnimationFrame(updateVars);
  };

  const scheduleKeyboardUpdate = () => {
    if (pendingKeyboardFrame) return;
    pendingKeyboardFrame = window.requestAnimationFrame(updateKeyboardState);
  };

  const scheduleViewportAndKeyboardUpdate = () => {
    scheduleUpdate();
    scheduleKeyboardUpdate();
  };

  const scheduleKeyboardBlurUpdate = () => {
    window.setTimeout(scheduleKeyboardUpdate, 80);
  };

  updateVars();
  updateKeyboardState();
  window.addEventListener('resize', scheduleUpdate, { passive: true });
  window.addEventListener('orientationchange', scheduleUpdate, { passive: true });
  window.addEventListener('pageshow', scheduleUpdate, { passive: true });
  window.addEventListener('focusin', scheduleKeyboardUpdate, true);
  window.addEventListener('focusout', scheduleKeyboardBlurUpdate, true);
  window.visualViewport?.addEventListener('resize', scheduleViewportAndKeyboardUpdate, { passive: true });
  if (!isNativePlatform()) {
    window.visualViewport?.addEventListener('scroll', scheduleViewportAndKeyboardUpdate, { passive: true });
  }
}

const BROKEN_TEXT_HINT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]|Ã|Â|Ä|Æ|áº|á»|ï¿|â¬|⬞|�/;

function installRuntimePerformanceMode() {
  const root = document.documentElement;
  const ua = navigator.userAgent || '';
  let isNative = false;

  try {
    isNative = Boolean(Capacitor.isNativePlatform?.());
  } catch {
    isNative = false;
  }

  const isAndroid = /Android/i.test(ua);
  const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const lowMemory = Number(navigator.deviceMemory || 0) > 0 && Number(navigator.deviceMemory || 0) <= 4;
  const slowCpu = Number(navigator.hardwareConcurrency || 0) > 0 && Number(navigator.hardwareConcurrency || 0) <= 4;
  const isInstalledLike = Boolean(isNative || window.navigator.standalone || window.matchMedia?.('(display-mode: standalone)')?.matches);

  root.classList.toggle('hd-installed-app', isInstalledLike);
  root.classList.toggle('hd-low-power-ui', Boolean(isNative || isAndroid || isIos || lowMemory || slowCpu));
}

const DIRECT_TEXT_REPLACEMENTS = [
  ['App Ä‘ang gáº·p lá»—i lĂºc hiá»ƒn thá»‹', 'App đang gặp lỗi lúc hiển thị'],
  ['MĂ¬nh Ä‘Ă£ cháº·n lá»—i Ä‘á»ƒ trang khĂ´ng cĂ²n tráº¯ng hoĂ n toĂ n. Báº¡n hĂ£y táº£i láº¡i trang, náº¿u váº«n cĂ²n lá»—i thĂ¬ mĂ¬nh sáº½ tiáº¿p tá»¥c sá»­a theo thĂ´ng bĂ¡o bĂªn dÆ°á»›i.', 'Mình đã chặn lỗi để trang không còn trắng hoàn toàn. Bạn hãy tải lại trang, nếu vẫn còn lỗi thì mình sẽ tiếp tục sửa theo thông báo bên dưới.'],
  ['Táº£i láº¡i trang', 'Tải lại trang'],
  ['Lá»£i nhuáº­n', 'Lợi nhuận'],
  ['Thu cĂ´ng ná»£', 'Thu công nợ'],
  ['XĂ³a giao dá»‹ch nĂ y?', 'Xóa giao dịch này?'],
  ['CĂ²n ná»£', 'Còn nợ'],
  ['ChÆ°a gĂ¡n', 'Chưa gán'],
  ['Chia sáº» hĂ³a Ä‘Æ¡n', 'Chia sẻ hóa đơn'],
  ['ÄÃ£ sao chĂ©p thĂ´ng tin cĂ´ng ná»£. Báº¡n cĂ³ thá»ƒ dĂ¡n vĂ o Zalo, Facebook, Messenger hoáº·c email.', 'Đã sao chép thông tin công nợ. Bạn có thể dán vào Zalo, Facebook, Messenger hoặc email.'],
  ['KhĂ´ng thá»ƒ sao chĂ©p thĂ´ng tin cĂ´ng ná»£ trĂªn thiáº¿t bá»‹ nĂ y.', 'Không thể sao chép thông tin công nợ trên thiết bị này.'],
  ['CĂ´ng ty HD Preview', 'Công ty HD Preview'],
  ['Quáº£n trá»‹ Demo', 'Quản trị Demo'],
  ['Chá»§ doanh nghiá»‡p', 'Chủ doanh nghiệp'],
  ['Ngá»c Anh', 'Ngọc Anh'],
  ['Minh TĂ i', 'Minh Tài'],
  ['TĂ i xáº¿', 'Tài xế'],
  ['Cá»­a hĂ ng Lan Anh', 'Cửa hàng Lan Anh'],
  ['Quáº­n 1, TP.HCM', 'Quận 1, TP.HCM'],
  ['Cty Hd', 'Cty HD'],
  ['K�nh g�i', 'Kính gửi'],
  ['Qu� kh�ch', 'Quý khách'],
  ['x�c nh�n', 'xác nhận'],
  ['ghi nh�n', 'ghi nhận'],
  ['thanh to�n', 'thanh toán'],
  ['ng�y', 'ngày'],
  ['H�nh th�c', 'Hình thức'],
  ['�i�m th��ng', 'Điểm thưởng'],
  ['i�m th��ng', 'Điểm thưởng'],
  ['C�ng n�', 'Công nợ'],
  ['hi�n t�i', 'hiện tại'],
  ['t�t to�n', 'tất toán'],
  ['C�m �n', 'Cảm ơn'],
  ['Ch�c', 'Chúc'],
  ['thu�n l�i', 'thuận lợi'],
];

const NOISY_WORD = '[?⬞�]+';

function latin1ToUtf8Loose(value) {
  try {
    const bytes = Uint8Array.from(Array.from(value, (char) => char.charCodeAt(0) & 0xff));
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return value;
  }
}

function applyDirectReplacements(value) {
  return DIRECT_TEXT_REPLACEMENTS.reduce((nextValue, [from, to]) => (
    nextValue.includes(from) ? nextValue.split(from).join(to) : nextValue
  ), value);
}

function mayNeedVisibleTextRepair(value) {
  return Boolean(value && BROKEN_TEXT_HINT.test(value));
}

function repairVisibleVietnamese(value) {
  if (!value || !BROKEN_TEXT_HINT.test(value)) return value;

  let nextValue = applyDirectReplacements(value);

  if (BROKEN_TEXT_HINT.test(nextValue)) {
    const shouldDecodeLegacyBytes = /Ã|Â|Ä|Æ|áº|á»|ï¿|â¬/.test(nextValue);
    nextValue = nextValue
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '�')
      .replace(/\u00e2\u00ac\u009a/g, '')
      .replace(/\u00ef\u00bf\u00bd/g, '�')
      .replace(/\u00c2/g, '');

    if (shouldDecodeLegacyBytes) {
      nextValue = latin1ToUtf8Loose(nextValue);
    }
    nextValue = applyDirectReplacements(nextValue);

    nextValue = nextValue
      .replace(new RegExp(`Ch${NOISY_WORD}o`, 'g'), 'Chào')
      .replace(new RegExp(`Doanh nghi${NOISY_WORD}p`, 'g'), 'Doanh nghiệp')
      .replace(new RegExp(`Kh${NOISY_WORD}ch h${NOISY_WORD}ng`, 'g'), 'Khách hàng')
      .replace(new RegExp(`kh${NOISY_WORD}ch h${NOISY_WORD}ng`, 'g'), 'khách hàng')
      .replace(new RegExp(`H${NOISY_WORD}ng h${NOISY_WORD}a`, 'g'), 'Hàng hóa')
      .replace(new RegExp(`h${NOISY_WORD}ng h${NOISY_WORD}a`, 'g'), 'hàng hóa')
      .replace(new RegExp(`T${NOISY_WORD}n Kh${NOISY_WORD}ch h${NOISY_WORD}ng`, 'g'), 'Tên Khách hàng')
      .replace(new RegExp(`T${NOISY_WORD}n`, 'g'), 'Tên')
      .replace(new RegExp(`S${NOISY_WORD}i${NOISY_WORD}n tho${NOISY_WORD}i`, 'g'), 'Số điện thoại')
      .replace(new RegExp(`${NOISY_WORD}a ch${NOISY_WORD}`, 'g'), 'Địa chỉ')
      .replace(new RegExp(`Nh${NOISY_WORD}p Excel`, 'g'), 'Nhập Excel')
      .replace(new RegExp(`T${NOISY_WORD}o kh${NOISY_WORD}ch h${NOISY_WORD}ng`, 'g'), 'Tạo khách hàng')
      .replace(new RegExp(`L${NOISY_WORD}y t${NOISY_WORD} danh b${NOISY_WORD}.*?tho${NOISY_WORD}i`, 'g'), 'Lấy từ danh bạ điện thoại')
      .replace(new RegExp(`Ghi nh${NOISY_WORD}n kho${NOISY_WORD}n thu`, 'g'), 'Ghi nhận khoản thu')
      .replace(new RegExp(`Ch${NOISY_WORD}n file`, 'g'), 'Chọn file')
      .replace(new RegExp(`H${NOISY_WORD}y`, 'g'), 'Hủy')
      .replace(new RegExp(`Vui l${NOISY_WORD}ng`, 'g'), 'Vui lòng')
      .replace(new RegExp(`kh${NOISY_WORD}ch h${NOISY_WORD}ng n${NOISY_WORD}y`, 'g'), 'khách hàng này')
      .replace(new RegExp(`s${NOISY_WORD}l${NOISY_WORD}ng`, 'g'), 'số lượng')
      .replace(new RegExp(`${NOISY_WORD} tr${NOISY_WORD} n${NOISY_WORD}`, 'g'), 'Đã trừ nợ')
      .replace(new RegExp(`K${NOISY_WORD}nh g${NOISY_WORD}i`, 'gi'), 'Kính gửi')
      .replace(new RegExp(`Qu${NOISY_WORD} kh${NOISY_WORD}ch`, 'gi'), 'Quý khách')
      .replace(new RegExp(`x${NOISY_WORD}c nh${NOISY_WORD}n`, 'gi'), 'xác nhận')
      .replace(new RegExp(`ghi nh${NOISY_WORD}n`, 'gi'), 'ghi nhận')
      .replace(new RegExp(`thanh to${NOISY_WORD}n`, 'gi'), 'thanh toán')
      .replace(new RegExp(`ng${NOISY_WORD}y`, 'gi'), 'ngày')
      .replace(new RegExp(`H${NOISY_WORD}nh th${NOISY_WORD}c`, 'gi'), 'Hình thức')
      .replace(new RegExp(`${NOISY_WORD}i${NOISY_WORD}m th${NOISY_WORD}ng`, 'gi'), 'Điểm thưởng')
      .replace(new RegExp(`${NOISY_WORD}\\s*Điểm thưởng`, 'gi'), 'Điểm thưởng')
      .replace(new RegExp(`C${NOISY_WORD}ng n${NOISY_WORD}`, 'gi'), 'Công nợ')
      .replace(new RegExp(`hi${NOISY_WORD}n t${NOISY_WORD}i`, 'gi'), 'hiện tại')
      .replace(new RegExp(`t${NOISY_WORD}t to${NOISY_WORD}n`, 'gi'), 'tất toán')
      .replace(new RegExp(`C${NOISY_WORD}m ${NOISY_WORD}n`, 'gi'), 'Cảm ơn')
      .replace(new RegExp(`Ch${NOISY_WORD}c`, 'gi'), 'Chúc')
      .replace(new RegExp(`thu${NOISY_WORD}n l${NOISY_WORD}i`, 'gi'), 'thuận lợi')
      .replace(new RegExp(`${NOISY_WORD}\\s*ghi nhận`, 'gi'), 'đã ghi nhận')
      .replace(new RegExp(`${NOISY_WORD}\\s*thanh toán`, 'gi'), 'đã thanh toán')
      .replace(new RegExp(`${NOISY_WORD}\\s+(?:${NOISY_WORD}\\s*)+c`, 'gi'), 'đã được')
      .replace(new RegExp(`(?:${NOISY_WORD}\\s*)+c`, 'gi'), 'được')
      .replace(new RegExp(`(\\d[\\d.,]*)\\s*${NOISY_WORD}\\s*(ngày)`, 'gi'), '$1 đ $2')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  return nextValue;
}

const TEXT_REPAIR_SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'CODE', 'PRE']);

function shouldSkipTextRepairElement(element) {
  if (!(element instanceof Element)) return false;
  if (TEXT_REPAIR_SKIP_TAGS.has(element.tagName)) return true;
  return Boolean(element.closest?.('[data-no-text-repair], input, textarea, select, option, code, pre, script, style'));
}

function isEditingInside(target) {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof Element)) return false;
  const tagName = activeElement.tagName;
  const isEditable = activeElement.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName);
  if (!isEditable) return false;
  return target === activeElement || activeElement.contains?.(target) || target.contains?.(activeElement);
}

function repairElementAttributes(element) {
  if (!(element instanceof Element) || shouldSkipTextRepairElement(element)) return;
  ['placeholder', 'title', 'aria-label'].forEach((attribute) => {
    const currentValue = element.getAttribute(attribute);
    if (!mayNeedVisibleTextRepair(currentValue)) return;
    const repairedValue = repairVisibleVietnamese(currentValue);
    if (repairedValue !== currentValue) {
      element.setAttribute(attribute, repairedValue);
    }
  });
}

function repairTextNodes(rootNode) {
  if (!(rootNode instanceof Node)) return;

  if (rootNode.nodeType === Node.TEXT_NODE) {
    const currentValue = rootNode.nodeValue || '';
    if (!mayNeedVisibleTextRepair(currentValue)) return;
    const repairedValue = repairVisibleVietnamese(currentValue);
    if (repairedValue !== currentValue) {
      rootNode.nodeValue = repairedValue;
    }
    return;
  }

  if (!(rootNode instanceof Element)) return;
  if (shouldSkipTextRepairElement(rootNode) || isEditingInside(rootNode)) return;

  repairElementAttributes(rootNode);

  const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT);
  let textNode = walker.nextNode();
  while (textNode) {
    const parentElement = textNode.parentElement;
    if (!shouldSkipTextRepairElement(parentElement)) {
      const currentValue = textNode.nodeValue || '';
      if (mayNeedVisibleTextRepair(currentValue)) {
        const repairedValue = repairVisibleVietnamese(currentValue);
        if (repairedValue !== currentValue) {
          textNode.nodeValue = repairedValue;
        }
      }
    }
    textNode = walker.nextNode();
  }
}

function installVisibleTextRepairObserver() {
  const root = document.getElementById('root');
  if (!root) return;

  let isRepairing = false;
  let scheduledRepair = 0;
  const pendingTargets = new Set();

  const scheduleRepairFlush = () => {
    if (scheduledRepair) return;
    const run = () => {
      scheduledRepair = 0;
      flushRepairQueue();
    };

    if (typeof window.requestIdleCallback === 'function') {
      scheduledRepair = window.requestIdleCallback(run, { timeout: 360 });
      return;
    }

    scheduledRepair = window.setTimeout(run, 80);
  };

  const enqueueRepair = (target = root) => {
    if (!target) return;
    if (target === root) {
      pendingTargets.clear();
      pendingTargets.add(root);
    } else if (!pendingTargets.has(root)) {
      pendingTargets.add(target);
    }
    scheduleRepairFlush();
  };

  const flushRepairQueue = () => {
    if (isRepairing) {
      scheduleRepairFlush();
      return;
    }

    isRepairing = true;
    try {
      const targets = Array.from(pendingTargets);
      pendingTargets.clear();
      const batchLimit = 80;
      const startedAt = performance.now();
      const timeBudgetMs = 8;

      for (let index = 0; index < targets.length; index += 1) {
        const target = targets[index];
        if (index >= batchLimit || performance.now() - startedAt > timeBudgetMs) {
          pendingTargets.add(target);
          continue;
        }
        if (target !== root && !root.contains(target)) continue;
        if (target instanceof Element && isEditingInside(target)) continue;
        repairTextNodes(target);
      }
    } finally {
      isRepairing = false;
    }

    if (pendingTargets.size) {
      scheduleRepairFlush();
    }
  };

  enqueueRepair(root);

  const observer = new MutationObserver((mutations) => {
    if (isRepairing) return;
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        enqueueRepair(mutation.target);
        continue;
      }

      if (mutation.type === 'attributes' && mutation.target instanceof Element) {
        enqueueRepair(mutation.target);
        continue;
      }

      mutation.addedNodes.forEach((node) => enqueueRepair(node));
    }
  });

  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['placeholder', 'title', 'aria-label'],
  });
}

function shouldEnableVisibleTextRepairObserver() {
  try {
    if (Capacitor.isNativePlatform?.()) return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('repairText') === '1'
      || window.localStorage?.getItem('hd_enable_text_repair_observer') === '1';
  } catch {
    return false;
  }
}

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    recordPerformanceEvent('crash.react_error_boundary', {
      error: {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
      },
      componentStack: info?.componentStack,
    }, 'error');
    console.error('Application render error:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-red-100 p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
              !
            </div>
            <h1 className="text-xl font-bold text-slate-800 mb-2">App đang gặp lỗi lúc hiển thị</h1>
            <p className="text-sm text-slate-600 leading-6 mb-4">
              Mình đã chặn lỗi để trang không còn trắng hoàn toàn. Bạn hãy tải lại trang, nếu vẫn còn lỗi thì mình sẽ tiếp tục sửa theo thông báo bên dưới.
            </p>
            <pre className="text-left text-xs bg-slate-50 border border-slate-200 rounded-2xl p-3 overflow-auto text-slate-700 mb-4 whitespace-pre-wrap">
              {String(this.state.error?.message || this.state.error || 'Unknown render error')}
            </pre>
            <button
              type="button"
              onClick={this.handleReload}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-2xl transition-colors"
            >
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

initPerformanceMonitor({ appName: 'HD Manager' });
installResponsiveViewportVars();
installRuntimePerformanceMode();

ReactDOM.createRoot(document.getElementById('root')).render(
  <AppErrorBoundary>
    <React.Profiler id="HDManagerRoot" onRender={recordReactRender}>
      <App />
    </React.Profiler>
  </AppErrorBoundary>
);

if (shouldEnableVisibleTextRepairObserver()) {
  installVisibleTextRepairObserver();
}
