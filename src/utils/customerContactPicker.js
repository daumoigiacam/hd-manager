const normalizeText = (value = '') => `${value || ''}`.trim();

const firstText = (value) => {
  if (Array.isArray(value)) {
    return value.map(item => normalizeText(item)).find(Boolean) || '';
  }
  return normalizeText(value);
};

const formatAddress = (value) => {
  if (Array.isArray(value)) {
    return value.map(item => formatAddress(item)).find(Boolean) || '';
  }
  if (typeof value === 'string') return normalizeText(value);
  if (!value || typeof value !== 'object') return '';

  const formatted = firstText(value.formattedAddress || value.formatted || value.label);
  if (formatted) return formatted;

  return [
    value.addressLine,
    value.streetAddress,
    value.city,
    value.region,
    value.postalCode,
    value.country,
  ].map(part => normalizeText(part)).filter(Boolean).join(', ');
};

export const normalizePickedCustomerContact = (contact = {}) => ({
  name: firstText(contact?.name || contact?.displayName),
  phone: firstText(contact?.phone || contact?.tel || contact?.telephone),
  address: formatAddress(contact?.address || contact?.addresses),
});

export const isWebContactPickerSupported = (navigatorLike = globalThis?.navigator) => Boolean(
  navigatorLike?.contacts && typeof navigatorLike.contacts.select === 'function'
);

export const canPickCustomerContact = ({
  platform = 'web',
  navigatorLike = globalThis?.navigator,
} = {}) => platform === 'android' || isWebContactPickerSupported(navigatorLike);

export const pickWebCustomerContact = async (navigatorLike = globalThis?.navigator) => {
  if (!isWebContactPickerSupported(navigatorLike)) {
    return {
      ok: false,
      supported: false,
      cancelled: false,
      message: 'Thiết bị hoặc trình duyệt này chưa hỗ trợ chọn liên hệ.',
    };
  }

  try {
    const contacts = await navigatorLike.contacts.select(['name', 'tel', 'address'], { multiple: false });
    const contact = normalizePickedCustomerContact(contacts?.[0] || {});
    if (!contact.name && !contact.phone && !contact.address) {
      return {
        ok: false,
        supported: true,
        cancelled: true,
        message: 'Bạn chưa chọn liên hệ nào trong danh bạ.',
      };
    }
    return {
      ok: true,
      supported: true,
      cancelled: false,
      ...contact,
      message: 'Đã lấy thông tin liên hệ từ danh bạ.',
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return {
        ok: false,
        supported: true,
        cancelled: true,
        message: 'Bạn chưa chọn liên hệ nào trong danh bạ.',
      };
    }
    return {
      ok: false,
      supported: true,
      cancelled: false,
      message: 'Không thể lấy dữ liệu từ danh bạ điện thoại. Vui lòng thử lại.',
    };
  }
};
